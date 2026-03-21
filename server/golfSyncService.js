const https = require('https');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');

// ── HTTP helper ─────────────────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TourneyRun/1.0)' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('ESPN JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ESPN request timed out')); });
  });
}

// ── Fantasy points (same formula as commissioner entry) ────────────────────────
function calcFantasyPts(r1, r2, r3, r4, finishPos, madeCut, par, isMajor) {
  // r1-r4 are now to-par values (e.g. -7, +2). Each under-par round earns positive pts.
  let pts = 0;
  [r1, r2, r3, r4].forEach(r => {
    if (r !== null && r !== undefined) pts += Number(r) * -1.5;
  });
  if (finishPos !== null && finishPos !== undefined) {
    if (finishPos === 1)       pts += 30;
    else if (finishPos <= 5)   pts += 12;
    else if (finishPos <= 10)  pts += 8;
    else if (finishPos <= 25)  pts += 3;
  }
  if (madeCut) pts += 2;
  else pts -= 5;
  if (isMajor) pts *= 1.5;
  return Math.round(pts * 10) / 10;
}

function recalcMemberPoints(memberId) {
  const total = db.prepare(`
    SELECT COALESCE(SUM(gs.fantasy_points), 0) as pts
    FROM golf_weekly_lineups wl
    JOIN golf_scores gs ON wl.player_id = gs.player_id AND wl.tournament_id = gs.tournament_id
    WHERE wl.member_id = ? AND wl.is_started = 1
  `).get(memberId);
  db.prepare('UPDATE golf_league_members SET season_points = ? WHERE id = ?').run(total.pts, memberId);
}

// ── Name matching ───────────────────────────────────────────────────────────────
function norm(name) {
  return (name || '').toLowerCase().trim()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ');
}

function matchPlayer(espnName, players) {
  const n = norm(espnName);

  // 1. Exact
  let m = players.find(p => norm(p.name) === n);
  if (m) return m;

  const parts = n.split(' ');
  if (parts.length < 2) return null;

  const last = parts[parts.length - 1];
  const firstInit = parts[0][0];

  // 2. Last name + first initial
  m = players.find(p => {
    const pp = norm(p.name).split(' ');
    return pp[pp.length - 1] === last && pp[0]?.[0] === firstInit;
  });
  if (m) return m;

  // 3. Last name only (fallback — risky, only if unique match)
  const byLast = players.filter(p => norm(p.name).split(' ').pop() === last);
  if (byLast.length === 1) return byLast[0];

  return null;
}

// ── Date helper ─────────────────────────────────────────────────────────────────
function toESPNDate(dateStr) {
  // Converts '2026-03-12' → '20260312'
  return (dateStr || '').replace(/-/g, '').slice(0, 8);
}

// ── ESPN endpoints ──────────────────────────────────────────────────────────────
// The scoreboard endpoint supports ?dates=YYYYMMDD-YYYYMMDD for historical events.
// This is the only reliable way to retrieve completed tournament data.
// The leaderboard?event=ID endpoint does NOT return data for historical events.
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

// ── Unified competitor parser ────────────────────────────────────────────────────
// ESPN returns two different shapes depending on whether we hit the current or
// dated scoreboard endpoint:
//
// LIVE / CURRENT format:
//   comp.displayName                  — player name
//   comp.linescores = [{value:68}, …] — simple indexed array
//   comp.sortOrder                    — finish position
//   comp.status.type.name             — 'STATUS_CUT', 'STATUS_WD', etc.
//
// HISTORICAL (dated scoreboard) format:
//   comp.athlete.displayName          — player name
//   comp.linescores = [               — round-level objects keyed by period (1–4)
//     {period:1, value:68, linescores:[...hole data...]},
//     {period:2, value:67, ...},
//   ]
//   comp.order                        — finish position
//   (no status field — derive cut from whether round 3/4 exist)
function parseCompetitor(comp) {
  // Name
  const name = comp.displayName || comp.athlete?.displayName || '';

  // Parse a linescore entry to to-par integer.
  // ESPN scoreboard:  displayValue="-7" (to-par string), value=64 (raw strokes)
  // ESPN dated scoreboard: may only have value (raw strokes) without displayValue
  function parsePar(entry) {
    if (!entry) return null;
    // Prefer displayValue (already to-par string from ESPN scoreboard)
    const dv = entry.displayValue;
    if (dv != null && dv !== '' && dv !== '--') {
      if (dv === 'E' || dv === 'Even') return 0;
      const n = parseInt(dv, 10);
      if (!isNaN(n)) return n;
    }
    // Fall back: value field — raw strokes (55-95) → convert to to-par; small numbers already to-par
    const v = entry.value;
    if (v == null) return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    if (n >= 55 && n <= 95) return n - 72;    // raw strokes → to-par
    if (Math.abs(n) <= 25) return n;           // already to-par
    return null;
  }

  // Linescores — detect format by checking if any item has a nested `linescores` array
  const ls = comp.linescores || [];
  const isHistorical = ls.some(l => Array.isArray(l.linescores));

  let r1 = null, r2 = null, r3 = null, r4 = null;
  if (isHistorical) {
    // Period-keyed round objects (period 1-4), may have nested hole linescores
    r1 = parsePar(ls.find(l => l.period === 1));
    r2 = parsePar(ls.find(l => l.period === 2));
    r3 = parsePar(ls.find(l => l.period === 3));
    r4 = parsePar(ls.find(l => l.period === 4));
  } else {
    // Simple indexed array (live scoreboard) — ls[0]=R1, ls[1]=R2, etc.
    r1 = parsePar(ls[0]);
    r2 = parsePar(ls[1]);
    r3 = parsePar(ls[2]);
    r4 = parsePar(ls[3]);
  }

  // Validate: to-par values should be within ±25 (any outside this is bad data)
  const valid = v => v !== null && Math.abs(v) <= 25;
  const r1v = valid(r1) ? r1 : null;
  const r2v = valid(r2) ? r2 : null;
  const r3v = valid(r3) ? r3 : null;
  const r4v = valid(r4) ? r4 : null;

  // Cut status
  let madeCut;
  const statusName = (comp.status?.type?.name || comp.status?.type?.id || '').toUpperCase();
  if (statusName) {
    madeCut = !statusName.includes('CUT') && !statusName.includes('WD') && !statusName.includes('DQ');
  } else {
    // Historical: derive from rounds played — cut players only have 2 rounds
    madeCut = r3v !== null || r4v !== null;
  }

  // Finish position — scoreboard uses `order`, dated scoreboard uses `sortOrder`
  const finishPos = comp.order ? parseInt(comp.order) : (comp.sortOrder ? parseInt(comp.sortOrder) : null);

  return { name, r1: r1v, r2: r2v, r3: r3v, r4: r4v, madeCut, finishPos };
}

// ── ESPN event lookup ────────────────────────────────────────────────────────────
function nameWords(str) {
  return norm(str).split(' ').filter(w => w.length > 3);
}

function nameMatchScore(tournName, espnName) {
  const tWords = nameWords(tournName);
  return tWords.filter(w => norm(espnName).includes(w)).length;
}

async function findEspnEvent(tournament) {
  const tWords = nameWords(tournament.name);
  const tStart = new Date(tournament.start_date);
  const tEnd   = tournament.end_date ? new Date(tournament.end_date) : new Date(tStart.getTime() + 6 * 86400000);

  function pickBest(events) {
    if (events.length === 0) return null;
    if (events.length === 1) return events[0];
    let best = null, bestScore = 0;
    for (const ev of events) {
      const s = nameMatchScore(tournament.name, ev.name || ev.shortName || '');
      if (s > bestScore) { bestScore = s; best = ev; }
    }
    return bestScore >= 1 ? best : null;
  }

  function scoreFromEvent(ev) {
    if (ev?.competitions?.[0]?.competitors) return ev.competitions[0].competitors;
    if (ev?.competitors) return ev.competitors;
    return [];
  }

  function storeId(espnId) {
    if (espnId) {
      db.prepare('UPDATE golf_tournaments SET espn_event_id = ? WHERE id = ?').run(espnId, tournament.id);
    }
  }

  // ── Step 1: Dated scoreboard — works for historical AND current events ─────
  // Format: ?dates=YYYYMMDD-YYYYMMDD  (tournament week window ± 1 day buffer)
  try {
    const startStr = toESPNDate(new Date(tStart.getTime() - 86400000).toISOString().slice(0, 10));
    const endStr   = toESPNDate(new Date(tEnd.getTime()   + 86400000).toISOString().slice(0, 10));
    const data = await fetchJson(`${ESPN_SCOREBOARD}?dates=${startStr}-${endStr}`);
    const events = data?.events || [];
    const match = pickBest(events);
    if (match && scoreFromEvent(match).length > 0) {
      storeId(match.id);
      return { event: match, source: `dated_scoreboard(${startStr}-${endStr})` };
    }
    if (match) {
      // Event found but no competitors yet (future tournament)
      storeId(match.id);
      return { event: match, source: `dated_scoreboard_empty` };
    }
  } catch (e) {
    console.warn('[golf-sync] Dated scoreboard failed:', e.message);
  }

  // ── Step 2: Current scoreboard — fallback for active/upcoming ────────────
  try {
    const data = await fetchJson(ESPN_SCOREBOARD);
    const events = data?.events || [];
    const match = pickBest(events);
    if (match) {
      storeId(match.id);
      return { event: match, source: 'current_scoreboard' };
    }
    // Date proximity fallback
    const byDate = events.find(ev => {
      const d = new Date(ev.date || ev.competitions?.[0]?.date || '');
      return !isNaN(d) && Math.abs(d - tStart) < 5 * 86400000;
    });
    if (byDate) {
      storeId(byDate.id);
      return { event: byDate, source: 'date_match' };
    }
  } catch (e) {
    console.warn('[golf-sync] Current scoreboard failed:', e.message);
  }

  return null;
}

// ── Core sync function ──────────────────────────────────────────────────────────
async function syncTournamentScores(tournamentId, { par = 72, silent = false } = {}) {
  const tournament = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  if (!silent) console.log(`[golf-sync] Syncing: ${tournament.name}`);

  const found = await findEspnEvent(tournament);
  if (!found) {
    if (!silent) console.warn(`[golf-sync] No ESPN event found for: ${tournament.name}`);
    return { synced: 0, notMatched: [], error: 'No matching ESPN event found' };
  }

  const { event, source } = found;
  if (!silent) console.log(`[golf-sync] Matched via ${source}: "${event.name || event.shortName}"`);

  const competitors = (event?.competitions?.[0]?.competitors) || (event?.competitors) || [];
  if (competitors.length === 0) {
    return { synced: 0, notMatched: [], warning: 'ESPN event has no competitors yet' };
  }

  // Detect if the event is fully completed via ESPN status
  const espnStatusName = (
    event?.competitions?.[0]?.status?.type?.name ||
    event?.status?.type?.name || ''
  ).toUpperCase();
  const isCompleted = espnStatusName.includes('FINAL') || espnStatusName.includes('COMPLETE') ||
    event?.competitions?.[0]?.status?.type?.completed === true;

  const allPlayers = db.prepare('SELECT * FROM golf_players WHERE is_active = 1').all();
  const notMatched = [];
  let synced = 0;

  const upsert = db.prepare(`
    INSERT INTO golf_scores (id, tournament_id, player_id, round1, round2, round3, round4, made_cut, finish_position, fantasy_points, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(tournament_id, player_id) DO UPDATE SET
      round1=excluded.round1, round2=excluded.round2, round3=excluded.round3, round4=excluded.round4,
      made_cut=excluded.made_cut, finish_position=excluded.finish_position,
      fantasy_points=excluded.fantasy_points, updated_at=CURRENT_TIMESTAMP
  `);

  db.transaction(() => {
    for (const comp of competitors) {
      const { name, r1, r2, r3, r4, madeCut, finishPos } = parseCompetitor(comp);
      if (!name) continue;

      const player = matchPlayer(name, allPlayers);
      if (!player) {
        notMatched.push(name);
        continue;
      }

      const fp = calcFantasyPts(r1, r2, r3, r4, finishPos, madeCut, par, !!tournament.is_major);
      upsert.run(uuidv4(), tournament.id, player.id, r1, r2, r3, r4, madeCut ? 1 : 0, finishPos, fp);
      synced++;
    }
  })();

  // Recalculate member standings
  const affected = db.prepare(
    'SELECT DISTINCT wl.member_id FROM golf_weekly_lineups wl WHERE wl.tournament_id = ? AND wl.is_started = 1'
  ).all(tournament.id);
  for (const { member_id } of affected) recalcMemberPoints(member_id);

  // Update tournament status
  if (isCompleted) {
    db.prepare("UPDATE golf_tournaments SET status = 'completed', last_synced_at = CURRENT_TIMESTAMP WHERE id = ?").run(tournament.id);
    if (!silent) console.log(`[golf-sync] Tournament marked completed: ${tournament.name}`);
  } else if (synced > 0) {
    db.prepare("UPDATE golf_tournaments SET status = 'active', last_synced_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'completed'").run(tournament.id);
  } else {
    db.prepare('UPDATE golf_tournaments SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(tournament.id);
  }

  if (!silent) {
    console.log(`[golf-sync] Done — synced: ${synced}, unmatched: ${notMatched.length}, completed: ${isCompleted}`);
    if (notMatched.length) console.log('[golf-sync] Unmatched:', notMatched.slice(0, 10).join(', '));
  }

  return { synced, notMatched, espnEventName: event.name || event.shortName, isCompleted };
}

// ── Auto-sync scheduler ─────────────────────────────────────────────────────────
let _syncInterval = null;
let _lastSyncTime = null;
let _lastSyncResult = null;

async function runAutoSync() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat

  // Only sync Thu–Sun (tournament days)
  if (![0, 4, 5, 6].includes(dow)) return;

  const tournaments = db.prepare(`
    SELECT * FROM golf_tournaments
    WHERE status IN ('active', 'scheduled')
       OR (date('now') BETWEEN date(start_date, '-1 day') AND date(end_date, '+1 day'))
    ORDER BY start_date ASC
  `).all();

  if (tournaments.length === 0) return;

  for (const tournament of tournaments) {
    console.log(`[golf-sync] Auto-sync triggered for: ${tournament.name}`);
    try {
      const result = await syncTournamentScores(tournament.id, { silent: false });
      _lastSyncTime = new Date().toISOString();
      _lastSyncResult = { ...result, tournamentName: tournament.name };
    } catch (e) {
      console.error(`[golf-sync] Auto-sync error for ${tournament.name}:`, e.message);
    }
  }
}

function scheduleAutoSync() {
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(runAutoSync, 10 * 60 * 1000);
  setTimeout(runAutoSync, 8000);
  console.log('[golf-sync] Scheduled — 10 min intervals, Thu–Sun during active tournaments');
}

function getSyncStatus() {
  const active = db.prepare("SELECT id, name, status, espn_event_id, last_synced_at FROM golf_tournaments WHERE status = 'active' ORDER BY start_date ASC LIMIT 1").get();
  return {
    lastSyncTime: _lastSyncTime,
    lastSyncResult: _lastSyncResult,
    activeTournament: active || null,
    schedule: '30 min intervals, Thu–Sun',
  };
}

// ── Backfill completed tournaments that have no scores yet ─────────────────────
async function backfillCompleted() {
  const completed = db.prepare(`
    SELECT gt.* FROM golf_tournaments gt
    WHERE gt.status = 'completed'
      AND (SELECT COUNT(*) FROM golf_scores WHERE tournament_id = gt.id) = 0
    ORDER BY gt.start_date ASC
  `).all();

  if (completed.length === 0) {
    console.log('[golf-sync] Backfill: all completed tournaments already have scores.');
    return;
  }

  console.log(`[golf-sync] Backfilling ${completed.length} completed tournament(s)...`);
  for (const t of completed) {
    try {
      const result = await syncTournamentScores(t.id, { silent: false });
      console.log(`[golf-sync] Backfill ${t.name}: synced=${result.synced}, unmatched=${result.notMatched?.length || 0}`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.error(`[golf-sync] Backfill error for ${t.name}:`, e.message);
    }
  }
}

module.exports = { syncTournamentScores, scheduleAutoSync, getSyncStatus, backfillCompleted };
