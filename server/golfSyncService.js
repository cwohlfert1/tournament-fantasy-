const https = require('https');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');

// Socket.io instance — injected from index.js after server starts
let _io = null;
function setIo(io) { _io = io; }

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
  // Only apply cut adjustment when the outcome is confirmed.
  // madeCut=null means tournament in progress — no bonus, no penalty yet.
  if (madeCut === true) pts += 2;
  else if (madeCut === false) pts -= 5;
  // madeCut === null → still playing, no cut adjustment applied
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
const { normalizePlayerName, matchPlayerName } = require('./utils/playerNameNorm');
const norm = normalizePlayerName;

function matchPlayer(espnName, players, tournamentName) {
  return matchPlayerName(espnName, players, tournamentName);
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

  // Linescores — detect format.
  // Historical (post-tournament / ESPN replay) format: each entry has a numeric `period`
  // field (1-4) and optionally a nested `linescores` array of hole scores.
  // Live scoreboard format: a flat indexed array — ls[0]=R1, ls[1]=R2, etc.
  // NOTE: Live entries may also have a nested `linescores` property (hole data) but NO
  // `period` field. Using Array.isArray(l.linescores) as the detector caused false
  // positives for live-format players → pRound(1) returned null because l.period was
  // undefined. Only treat as historical when entries carry explicit period numbers.
  const ls = comp.linescores || [];
  const isHistorical = ls.some(l => typeof l.period === 'number');

  let r1 = null, r2 = null, r3 = null, r4 = null;
  if (isHistorical) {
    // Period-keyed round objects (period 1-4), may have nested hole linescores.
    // ESPN includes placeholder period entries (linescores: []) for rounds not yet
    // played. Skip those — an empty linescores array means no holes completed.
    const pRound = (period) => {
      const entry = ls.find(l => l.period === period);
      if (!entry) return null;
      if (Array.isArray(entry.linescores) && entry.linescores.length === 0) return null;
      return parsePar(entry);
    };
    r1 = pRound(1);
    r2 = pRound(2);
    r3 = pRound(3);
    r4 = pRound(4);
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

  // Cut status — three possible values:
  //   true  = confirmed made cut (R3/R4 data present, or ESPN status confirms)
  //   false = confirmed missed/WD/DQ
  //   null  = unknown — tournament in progress, cut not yet determined (R1/R2 only)
  // IMPORTANT: null is NOT the same as false. Only store 0 (missed cut) when we
  // have explicit confirmation. During R1/R2, all players are still in the field.
  let madeCut;
  const statusName = (comp.status?.type?.name || comp.status?.type?.id || '').toUpperCase();
  if (statusName) {
    if (statusName.includes('CUT') || statusName.includes('WD') || statusName.includes('DQ')) {
      madeCut = false;
    } else {
      madeCut = true;
    }
  } else if (r3v !== null || r4v !== null) {
    // No status string, but player has R3/R4 data → they made the cut
    madeCut = true;
  } else {
    // No status string, no R3/R4 — tournament is in progress, cut outcome unknown.
    // Use null (not false) so applyDropScoring does NOT auto-drop these players.
    madeCut = null;
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
  let emptyMatchFromDated = null; // stash a found-but-empty event so Step 2 can override
  try {
    const startStr = toESPNDate(new Date(tStart.getTime() - 86400000).toISOString().slice(0, 10));
    const endStr   = toESPNDate(new Date(tEnd.getTime()   + 86400000).toISOString().slice(0, 10));
    const datedUrl = `${ESPN_SCOREBOARD}?dates=${startStr}-${endStr}`;
    console.log(`[golf-sync] Step 1: ${datedUrl}`);
    const data = await fetchJson(datedUrl);
    const events = data?.events || [];
    const match = pickBest(events);
    if (match) {
      storeId(match.id);
      const compCount = scoreFromEvent(match).length;
      console.log(`[golf-sync] Step 1: matched "${match.name || match.shortName}" — ${compCount} competitor(s)`);
      if (compCount > 0) {
        return { event: match, source: `dated_scoreboard(${startStr}-${endStr})` };
      }
      // Event found but ESPN has 0 competitors — fall through to Step 2 for live data.
      // This happens when a tournament just started and the dated scoreboard hasn't
      // populated competitors yet, while the current scoreboard already has them.
      console.log('[golf-sync] Step 1: event found but 0 competitors — trying current scoreboard for live data');
      emptyMatchFromDated = match;
    } else {
      console.log(`[golf-sync] Step 1: no name match in ${events.length} events`);
    }
  } catch (e) {
    console.warn('[golf-sync] Dated scoreboard failed:', e.message);
  }

  // ── Step 2: Current scoreboard — fallback for active/upcoming ────────────
  console.log('[golf-sync] Step 2: current scoreboard');
  try {
    const data = await fetchJson(ESPN_SCOREBOARD);
    const events = data?.events || [];
    console.log(`[golf-sync] Step 2: ${events.length} event(s) on current scoreboard`);
    const match = pickBest(events);
    if (match) {
      storeId(match.id);
      console.log(`[golf-sync] Step 2: matched "${match.name || match.shortName}" — ${scoreFromEvent(match).length} competitor(s)`);
      return { event: match, source: 'current_scoreboard' };
    }
    // Date proximity fallback
    const byDate = events.find(ev => {
      const d = new Date(ev.date || ev.competitions?.[0]?.date || '');
      return !isNaN(d) && Math.abs(d - tStart) < 5 * 86400000;
    });
    if (byDate) {
      storeId(byDate.id);
      console.log(`[golf-sync] Step 2: date-proximity match "${byDate.name || byDate.shortName}"`);
      return { event: byDate, source: 'date_match' };
    }
    console.log('[golf-sync] Step 2: no match found');
  } catch (e) {
    console.warn('[golf-sync] Current scoreboard failed:', e.message);
  }

  // Last resort: return the empty dated event if we got one (future tournament, not started yet)
  if (emptyMatchFromDated) {
    console.log('[golf-sync] Using empty dated event as last resort (tournament not yet started)');
    return { event: emptyMatchFromDated, source: 'dated_scoreboard_empty' };
  }

  return null;
}

// ── Core sync function ──────────────────────────────────────────────────────────
async function syncTournamentScores(tournamentId, { par = 72, silent = false } = {}) {
  const tournament = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  if (!silent) console.log(`[golf-sync] Syncing: "${tournament.name}" (db_id=${tournamentId}, espn_id=${tournament.espn_event_id || 'none'}, status=${tournament.status})`);

  // ── Fast path: if espn_event_id already known, hit the scoreboard directly ──
  // Skips the date-matching heuristic which can return empty data for live events.
  let found = null;
  if (tournament.espn_event_id) {
    const fastUrl = `${ESPN_SCOREBOARD}?event=${tournament.espn_event_id}`;
    if (!silent) console.log(`[golf-sync] Fast path — ${fastUrl}`);
    try {
      const data = await fetchJson(fastUrl);
      const events = data?.events || [];
      const event = events.find(ev => String(ev.id) === String(tournament.espn_event_id)) || events[0];
      // Guard: verify ESPN returned the tournament we asked for
      const returnedEventId = event?.id;
      if (returnedEventId && String(returnedEventId) !== String(tournament.espn_event_id)) {
        console.error(`[golf-sync] ESPN returned wrong event: ${returnedEventId}, expected: ${tournament.espn_event_id}`);
        return { error: 'wrong_event', returned: returnedEventId };
      }
      if (event) {
        const competitors = (event?.competitions?.[0]?.competitors) || (event?.competitors) || [];
        if (!silent) console.log(`[golf-sync] Fast path: "${event.name || event.shortName}" — ${competitors.length} competitor(s)`);
        if (competitors.length > 0) {
          found = { event, source: `direct_espn_id(${tournament.espn_event_id})` };
        } else {
          if (!silent) console.log('[golf-sync] Fast path: 0 competitors — falling back to name-match');
        }
      } else {
        if (!silent) console.log(`[golf-sync] Fast path: espn_id=${tournament.espn_event_id} not in response (${events.length} events) — falling back`);
      }
    } catch (e) {
      if (!silent) console.warn(`[golf-sync] Fast path fetch failed: ${e.message} — falling back`);
    }
  }

  if (!found) found = await findEspnEvent(tournament);

  if (!found) {
    if (!silent) console.warn(`[golf-sync] No ESPN event found for: "${tournament.name}"`);
    return { synced: 0, notMatched: [], error: 'No matching ESPN event found' };
  }

  const { event, source } = found;
  if (!silent) console.log(`[golf-sync] Matched via ${source}: "${event.name || event.shortName}"`);

  const competitors = (event?.competitions?.[0]?.competitors) || (event?.competitors) || [];
  if (competitors.length === 0) {
    return { synced: 0, notMatched: [], warning: 'ESPN event has no competitors yet' };
  }

  // Map ESPN status → our tournament status
  // NOTE: ESPN returns STATUS_FINAL after EACH round, not only at tournament end.
  // We guard against premature completion by also requiring R4 data to be present.
  const espnStatusName = (
    event?.competitions?.[0]?.status?.type?.name ||
    event?.status?.type?.name || ''
  );
  console.log(`[golf-sync] ESPN_STATUS: "${espnStatusName}" for ${tournament.name}`);

  // Current round number from ESPN (1–4). STATUS_FINAL fires after every round,
  // so we use period >= 4 as the definitive "all rounds complete" signal.
  // Scoreboard endpoint may not have status.period — fallback to max linescores.
  let currentPeriod = event?.competitions?.[0]?.status?.period
    ?? event?.status?.period ?? 0;
  if (!currentPeriod && competitors.length > 0) {
    // Infer from max linescore count across all competitors
    currentPeriod = Math.max(...competitors.map(c => (c.linescores || []).length));
  }
  console.log(`[golf-sync] ESPN period: ${currentPeriod} (status: ${espnStatusName})`);

  const isTrulyComplete =
    (espnStatusName === 'STATUS_FINAL' || espnStatusName === 'STATUS_PLAY_COMPLETE') &&
    currentPeriod >= 4;

  let newTournamentStatus = null;
  if (isTrulyComplete) {
    newTournamentStatus = 'completed';
  } else if (espnStatusName === 'STATUS_FINAL' && currentPeriod < 4) {
    // Per-round STATUS_FINAL (after R1/R2/R3) — tournament still running
    newTournamentStatus = 'active';
    console.log(`[golf-sync] STATUS_FINAL at period ${currentPeriod} — mid-tournament, keeping active`);
  } else if (espnStatusName === 'STATUS_IN_PROGRESS' || espnStatusName === 'STATUS_ACTIVE') {
    newTournamentStatus = 'active';
  } else if (espnStatusName === 'STATUS_SCHEDULED') {
    newTournamentStatus = 'scheduled';
  }

  // If ESPN didn't give us a recognized status but the tournament has started and has a field,
  // infer 'active'. Prevents the DB staying 'scheduled' indefinitely when ESPN omits status.
  const _tournStartDate = new Date(tournament.start_date + 'T12:00:00Z');
  if (!newTournamentStatus && competitors.length > 0 && new Date() >= _tournStartDate) {
    newTournamentStatus = 'active';
    console.log(`[golf-sync] Inferred active (${competitors.length} competitors, start_date=${tournament.start_date})`);
  }

  const isCompleted = newTournamentStatus === 'completed';
  if (!silent) console.log(`[golf-sync] → tournament status: ${newTournamentStatus || '(no change)'}, period: ${currentPeriod}`);

  const allPlayers = db.prepare('SELECT * FROM golf_players WHERE is_active = 1').all();
  if (!silent) console.log(`[golf-sync] golf_players pool: ${allPlayers.length} active players`);
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

  // Upsert ESPN name → canonical player mapping so future syncs can find players
  // even if their display name changes (diacritics, periods, etc.)
  const espnPlayerUpsert = db.prepare(`
    INSERT INTO golf_espn_players (espn_name, display_name, country_code, normalized_name, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(espn_name) DO UPDATE SET
      display_name    = excluded.display_name,
      country_code    = excluded.country_code,
      normalized_name = excluded.normalized_name,
      updated_at      = CURRENT_TIMESTAMP
  `);

  // Log first 3 competitors before transaction so we can diagnose parsing issues
  if (!silent && competitors.length > 0) {
    const sample = competitors.slice(0, 3).map(comp => {
      const parsed = parseCompetitor(comp);
      const matched = matchPlayer(parsed.name, allPlayers, tournament.name);
      return `${parsed.name} → r1=${parsed.r1} r2=${parsed.r2} matched=${matched ? matched.name : 'NO MATCH'}`;
    });
    console.log('[golf-sync] Sample parse:', sample.join(' | '));
  }

  db.transaction(() => {
    for (const comp of competitors) {
      const { name, r1, r2, r3, r4, madeCut, finishPos } = parseCompetitor(comp);
      if (!name) continue;

      const player = matchPlayer(name, allPlayers, tournament.name);
      if (!player) {
        notMatched.push(name);
        continue;
      }

      // Persist ESPN display name → canonical player mapping for future syncs
      espnPlayerUpsert.run(name, player.name, player.country, norm(name));

      const fp = calcFantasyPts(r1, r2, r3, r4, finishPos, madeCut, par, !!tournament.is_major);
      // made_cut stored as: 1=confirmed made cut, 0=missed/WD/DQ, NULL=unknown (R1/R2 in progress)
      const madeCutDb = madeCut === null ? null : (madeCut ? 1 : 0);
      upsert.run(uuidv4(), tournament.id, player.id, r1, r2, r3, r4, madeCutDb, finishPos, fp);
      synced++;
    }
  })();

  if (!silent) {
    const dbCount = db.prepare('SELECT COUNT(*) as c FROM golf_scores WHERE tournament_id = ?').get(tournament.id);
    console.log(`[golf-sync] golf_scores rows after upsert: ${dbCount.c} (tournament_id=${tournament.id})`);
  }

  // Recalculate member standings
  const affected = db.prepare(
    'SELECT DISTINCT wl.member_id FROM golf_weekly_lineups wl WHERE wl.tournament_id = ? AND wl.is_started = 1'
  ).all(tournament.id);
  for (const { member_id } of affected) recalcMemberPoints(member_id);

  // Update tournament status — ESPN status is authoritative
  if (newTournamentStatus) {
    db.prepare('UPDATE golf_tournaments SET status = ?, last_synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(newTournamentStatus, tournament.id);
    if (!silent && newTournamentStatus !== tournament.status) console.log(`[golf-sync] Status: ${tournament.status} → ${newTournamentStatus}`);
  } else if (synced > 0) {
    // No explicit ESPN status — infer active from having data
    db.prepare("UPDATE golf_tournaments SET status = 'active', last_synced_at = CURRENT_TIMESTAMP WHERE id = ?").run(tournament.id);
  } else {
    db.prepare('UPDATE golf_tournaments SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(tournament.id);
  }

  if (!silent) {
    console.log(`[golf-sync] Done — synced: ${synced}, unmatched: ${notMatched.length}, completed: ${isCompleted}`);
    if (notMatched.length) {
      console.log(`[golf-sync] Unmatched (${notMatched.length}):`, notMatched.slice(0, 20).join(', '));
    }
    if (synced === 0 && notMatched.length > 0) {
      console.error(`[golf-sync] WARNING: 0 players matched — name lookup may be broken. First 5 ESPN names: ${notMatched.slice(0, 5).join(', ')}`);
    }
  }

  return { synced, notMatched, espnEventName: event.name || event.shortName, isCompleted, currentPeriod, espnStatusName };
}


// ── Auto-sync scheduler ─────────────────────────────────────────────────────────
let _syncInterval = null;
let _lastSyncTime = null;
let _lastSyncResult = null;

// ── Push pool standings to connected clients via websocket ─────────────────────
function pushPoolStandings(tournamentId) {
  if (!_io) return;
  try {
    const poolLeagues = db.prepare(`
      SELECT gl.id, gl.name, gl.scoring_style
      FROM golf_leagues gl
      WHERE gl.format_type = 'pool'
        AND gl.status != 'archived'
        AND gl.pool_tournament_id = ?
    `).all(tournamentId);

    for (const league of poolLeagues) {
      const standings = db.prepare(`
        SELECT glm.id as member_id, glm.team_name, u.username,
               COALESCE(SUM(gs.fantasy_points), 0) as total_points
        FROM golf_league_members glm
        JOIN users u ON u.id = glm.user_id
        LEFT JOIN pool_picks pp ON pp.user_id = glm.user_id AND pp.league_id = glm.golf_league_id AND pp.tournament_id = ?
        LEFT JOIN golf_scores gs ON gs.player_id = pp.player_id AND gs.tournament_id = ?
        WHERE glm.golf_league_id = ?
        GROUP BY glm.id
        ORDER BY total_points DESC
      `).all(tournamentId, tournamentId, league.id);

      _io.to(`golf_pool_${league.id}`).emit('pool_standings_update', {
        leagueId: league.id,
        tournamentId,
        standings,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('[golf-sync] pushPoolStandings error:', e.message);
  }
}

async function runAutoSync() {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat
  console.log(`[golf-sync] runAutoSync triggered at ${now.toISOString()} (dow=${dow}, Thu=4 Fri=5 Sat=6 Sun=0)`);

  // Only sync Thu–Sun (tournament days)
  if (![0, 4, 5, 6].includes(dow)) {
    console.log('[golf-sync] Skipping — not a tournament day');
    return;
  }

  const tournaments = db.prepare(`
    SELECT * FROM golf_tournaments
    WHERE status IN ('active', 'scheduled')
       OR (date('now') BETWEEN date(start_date, '-1 day') AND date(end_date, '+1 day'))
    ORDER BY start_date ASC
  `).all();

  console.log(`[golf-sync] Found ${tournaments.length} tournament(s) to sync: ${tournaments.map(t => `"${t.name}"(${t.status})`).join(', ')}`);
  if (tournaments.length === 0) return;

  for (const tournament of tournaments) {
    try {
      const statusBefore = tournament.status;
      const result = await syncTournamentScores(tournament.id, { silent: false });
      _lastSyncTime = new Date().toISOString();
      _lastSyncResult = { ...result, tournamentName: tournament.name };
      // Verify what actually landed in the DB
      const dbCount = db.prepare('SELECT COUNT(*) as c FROM golf_scores WHERE tournament_id = ?').get(tournament.id);
      console.log(`[golf-sync] DB check: golf_scores rows for "${tournament.name}" = ${dbCount.c}`);
      if (result.synced > 0) {
        pushPoolStandings(tournament.id);
      }

      // ── Round completion email detection (ESPN period-based) ────────────
      // ESPN currentPeriod tells us exactly which round is active/complete.
      // Independent of name matching — works even if some players have no scores.
      const tournAfter = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournament.id);
      const isFinal = tournAfter.status === 'completed' && statusBefore !== 'completed';
      const period = result.currentPeriod || 0;

      const roundStatus = result.espnStatusName || '';
      // Also detect final for tournaments already marked completed (missed the transition)
      const isAlreadyComplete = tournAfter.status === 'completed';
      if (period > 0 || isFinal || isAlreadyComplete) {
        const isPlayComplete = roundStatus === 'STATUS_PLAY_COMPLETE';
        const completedRounds = [];
        if (period >= 2 || (period === 1 && isPlayComplete) || isAlreadyComplete) completedRounds.push(1);
        if (period >= 3 || (period === 2 && isPlayComplete) || isAlreadyComplete) completedRounds.push(2);
        if (period >= 4 || (period === 3 && isPlayComplete) || isAlreadyComplete) completedRounds.push(3);
        if (isFinal || isAlreadyComplete || roundStatus === 'STATUS_FINAL') completedRounds.push(4);

        if (completedRounds.length > 0) {
          console.log(`[golf-sync] ESPN period=${period}, completed rounds: ${completedRounds.join(',')}`);
        }

        for (const rnd of completedRounds) {
          const isFinalRound = rnd === 4 && isFinal;
          sendRoundEmails(tournament.id, rnd, isFinalRound).catch(err =>
            console.error(`[golf-sync] Round email error for "${tournament.name}" R${rnd}:`, err.message)
          );
        }
      }
    } catch (e) {
      console.error(`[golf-sync] Auto-sync error for "${tournament.name}":`, e.message, e.stack);
    }
  }
}

// ── Field sync (WD detection) ─────────────────────────────────────────────────
// Fetches ESPN scoreboard for upcoming tournaments and marks withdrawn players.
async function syncTournamentField(tournamentId) {
  const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournamentId);
  if (!tourn) return;

  // Only run WD detection once tournament is active (ESPN has a real field)
  if (tourn.status === 'scheduled') {
    console.log(`[field-sync] Skipping ${tourn.name} — status is 'scheduled', not active`);
    return;
  }

  const leagues = db.prepare(
    "SELECT id FROM golf_leagues WHERE pool_tournament_id = ? AND format_type = 'pool' AND status != 'archived'"
  ).all(tournamentId);
  if (!leagues.length) return;

  // Fetch ESPN scoreboard to get actual field
  let espnData;
  try {
    const url = tourn.espn_event_id
      ? `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${tourn.espn_event_id}`
      : `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard`;
    espnData = await fetchJson(url);
  } catch (e) {
    console.warn(`[field-sync] ESPN fetch failed for ${tourn.name}:`, e.message);
    return;
  }

  const events = espnData?.events || [];
  const event = tourn.espn_event_id
    ? events.find(ev => String(ev.id) === String(tourn.espn_event_id)) || events[0]
    : events[0];
  if (!event) { console.log('[field-sync] No ESPN event found'); return; }

  const espnCompetitors = event.competitions?.[0]?.competitors || [];
  const espnNames = new Set(espnCompetitors.map(c => norm(c.athlete?.displayName || '')));

  console.log(`[field-sync] ${tourn.name}: ${espnNames.size} players in ESPN field`);

  // Require a full field before marking WDs — pre-tournament ESPN returns partial/empty data
  if (espnNames.size < 50) {
    console.log(`[field-sync] Field too small (${espnNames.size} players), skipping WD check`);
    return;
  }

  // Build confirmed field from golf_tournament_fields — only these players are actually
  // in the tournament. pool_tier_players may contain 200+ extra players from assign-tiers
  // that are NOT playing this week and must never be evaluated for WD status.
  const confirmedFieldIds = new Set(
    db.prepare('SELECT DISTINCT player_id FROM golf_tournament_fields WHERE tournament_id = ?')
      .all(tournamentId).map(r => r.player_id)
  );
  console.log(`[field-sync] ${tourn.name}: ${confirmedFieldIds.size} players in confirmed field (golf_tournament_fields)`);

  for (const league of leagues) {
    // Fetch ALL pool_tier_players (including already-WD'd) so we can both clear false WDs
    // and mark new ones in a single reconcile pass.
    const tierPlayers = db.prepare(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ?'
    ).all(league.id, tournamentId);

    const markWD = db.prepare(
      'UPDATE pool_tier_players SET is_withdrawn = 1 WHERE id = ?'
    );
    const clearWD = db.prepare(
      'UPDATE pool_tier_players SET is_withdrawn = 0 WHERE id = ?'
    );
    const markPickWD = db.prepare(
      'UPDATE pool_picks SET is_withdrawn = 1 WHERE league_id = ? AND tournament_id = ? AND player_name = ?'
    );
    const clearPickWD = db.prepare(
      'UPDATE pool_picks SET is_withdrawn = 0 WHERE league_id = ? AND tournament_id = ? AND player_name = ?'
    );

    let wdCount = 0;
    let clearedCount = 0;
    db.transaction(() => {
      for (const p of tierPlayers) {
        // If this player is not in the confirmed tournament field (golf_tournament_fields),
        // they're a background pool filler from assign-tiers — not a tournament participant.
        // Clear any accidental WD flag and skip — never mark them WD.
        if (!confirmedFieldIds.has(p.player_id)) {
          if (p.is_withdrawn) {
            clearWD.run(p.id);
            clearPickWD.run(league.id, tournamentId, p.player_name);
            console.log(`[field-sync] Cleared non-field player WD: ${p.player_name} (league ${league.id})`);
            clearedCount++;
          }
          continue;
        }

        const n = norm(p.player_name);
        // DataGolf names are stored as "Last, First" — flip to "First Last" for ESPN comparison
        let nFlipped = n;
        if (p.player_name.includes(',')) {
          const [last, first] = p.player_name.split(',').map(s => s.trim());
          if (first) nFlipped = norm(`${first} ${last}`);
        }
        // Check direct match (either format) or last+first-initial fallback
        const inField = espnNames.has(n) || espnNames.has(nFlipped) || [...espnNames].some(en => {
          const parts = en.split(' ');
          const np = nFlipped.split(' ');
          return parts[parts.length - 1] === np[np.length - 1] && parts[0]?.[0] === np[0]?.[0];
        });
        if (inField) {
          if (p.is_withdrawn) {
            clearWD.run(p.id);
            clearPickWD.run(league.id, tournamentId, p.player_name);
            console.log(`[field-sync] Cleared false WD: ${p.player_name} (league ${league.id})`);
            clearedCount++;
          }
        } else {
          if (!p.is_withdrawn) {
            markWD.run(p.id);
            markPickWD.run(league.id, tournamentId, p.player_name);
            console.log(`[field-sync] WD detected: ${p.player_name} (league ${league.id})`);
            wdCount++;
          }
        }
      }
    })();
    if (clearedCount > 0) {
      console.log(`[field-sync] ${tourn.name}: ${clearedCount} false WD(s) cleared in league ${league.id}`);
    }
    if (wdCount > 0) {
      console.log(`[field-sync] ${tourn.name}: ${wdCount} player(s) marked WD in league ${league.id}`);
    }
    if (wdCount === 0 && clearedCount === 0) {
      console.log(`[field-sync] ${tourn.name}: field in sync, no changes`);
    }
  }
}

// ── Round completion emails ───────────────────────────────────────────────────
async function sendRoundEmails(tournamentId, roundNumber, isFinal) {
  const { v4: uuidv4 } = require('uuid');
  const { sendRoundStandings } = require('./mailer');

  const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournamentId);
  if (!tourn) return;

  // Get all pool leagues for this tournament
  const leagues = db.prepare(`
    SELECT gl.* FROM golf_leagues gl
    WHERE gl.pool_tournament_id = ? AND gl.status != 'archived'
  `).all(tournamentId);

  for (const league of leagues) {
    // Check if already sent for this round
    const already = db.prepare('SELECT 1 FROM round_emails_sent WHERE league_id = ? AND round_number = ?')
      .get(league.id, roundNumber);
    if (already) {
      console.log(`[round-email] R${roundNumber} already sent for "${league.name}", skipping`);
      continue;
    }

    try {
      const scoringStyle = league.scoring_style || 'fantasy_points';
      const isStroke = ['stroke_play', 'total_score', 'total_strokes'].includes(scoringStyle);
      const baseUrl = 'https://www.tourneyrun.app';
      const leagueUrl = `${baseUrl}/golf/league/${league.id}?tab=standings`;

      // Build standings (same logic as the standings API)
      const { applyDropScoring } = require('./pool-utils');
      const members = db.prepare(`
        SELECT glm.user_id, glm.team_name, u.email, u.username
        FROM golf_league_members glm JOIN users u ON u.id = glm.user_id
        WHERE glm.golf_league_id = ?
      `).all(league.id);

      // Get all entries (including multi-entry)
      const extraEntries = db.prepare(`
        SELECT DISTINCT pp.user_id, COALESCE(pp.entry_number, 1) as entry_number, pp.entry_team_name
        FROM pool_picks pp
        WHERE pp.league_id = ? AND pp.tournament_id = ? AND COALESCE(pp.entry_number, 1) > 1
      `).all(league.id, tournamentId);

      const allEntries = [
        ...members.map(m => ({ ...m, entry_number: 1 })),
        ...extraEntries.map(e => {
          const m = members.find(m => m.user_id === e.user_id);
          return { user_id: e.user_id, email: m?.email, username: m?.username, team_name: e.entry_team_name || `Entry ${e.entry_number}`, entry_number: e.entry_number };
        }),
      ];

      // Score each entry
      const standings = allEntries.map(entry => {
        const picks = db.prepare(`
          SELECT pp.player_id, pp.player_name, pp.tier_number, pp.is_dropped,
                 pp.tiebreaker_score,
                 gs.fantasy_points, gs.round1, gs.round2, gs.round3, gs.round4,
                 gs.finish_position, gs.made_cut
          FROM pool_picks pp
          LEFT JOIN golf_scores gs ON gs.player_id = pp.player_id AND gs.tournament_id = ?
          WHERE pp.league_id = ? AND pp.tournament_id = ? AND pp.user_id = ?
            AND COALESCE(pp.entry_number, 1) = ?
        `).all(tournamentId, league.id, tournamentId, entry.user_id, entry.entry_number);

        let score;
        if (isStroke) {
          const dropCount = league.pool_drop_count ?? 2;
          const dropResult = applyDropScoring(picks, dropCount);
          score = dropResult.team_score;
        } else {
          score = Math.round(picks.reduce((s, p) => s + (p.fantasy_points || 0), 0) * 10) / 10;
        }

        const tiebreaker = picks.length > 0 ? (picks[0].tiebreaker_score ?? null) : null;
        return { ...entry, score, tiebreaker, submitted: picks.length > 0 };
      }).filter(e => e.submitted);

      // Sort: stroke=ascending, fantasy=descending. Tiebreaker as secondary sort.
      // Get winning golf score for tiebreaker comparison
      let winningGolfScore = null;
      if (isFinal) {
        const winner = db.prepare('SELECT round1, round2, round3, round4 FROM golf_scores WHERE tournament_id = ? AND finish_position = 1 LIMIT 1').get(tournamentId);
        if (winner) winningGolfScore = [winner.round1, winner.round2, winner.round3, winner.round4].filter(r => r != null).reduce((s, r) => s + r, 0);
      }
      const tbDelta = s => (winningGolfScore != null && s.tiebreaker != null) ? Math.abs(s.tiebreaker - winningGolfScore) : Infinity;

      standings.sort((a, b) => {
        const scoreCmp = isStroke ? a.score - b.score : b.score - a.score;
        if (scoreCmp !== 0) return scoreCmp;
        return tbDelta(a) - tbDelta(b);
      });
      standings.forEach((s, i) => { s.rank = i + 1; });

      const top5 = standings.slice(0, 5).map(s => ({ rank: s.rank, teamName: s.team_name, score: s.score }));
      const totalEntries = standings.length;

      // Determine winner name — show team name (username), handle ties
      let winnerName = null;
      if (isFinal && standings.length > 0) {
        const first = standings[0];
        const tied = standings.filter(s => s.score === first.score);
        if (tied.length === 1) {
          winnerName = first.team_name;
        } else {
          // Multiple teams tied on score — check tiebreaker
          const bestTb = Math.min(...tied.map(s => tbDelta(s)));
          const tbWinners = tied.filter(s => tbDelta(s) === bestTb);
          if (tbWinners.length === 1) {
            winnerName = `${tbWinners[0].team_name} (won tiebreaker)`;
          } else {
            winnerName = tbWinners.map(s => s.team_name).join(' & ') + ' (tied!)';
          }
        }
      }

      // Send one email per unique user (not per entry)
      const userMap = new Map();
      for (const s of standings) {
        if (!userMap.has(s.user_id)) userMap.set(s.user_id, { email: s.email, username: s.username, entries: [] });
        userMap.get(s.user_id).entries.push({ entryNumber: s.entry_number, teamName: s.team_name, rank: s.rank, score: s.score });
      }

      let sent = 0;
      for (const [, data] of userMap) {
        if (!data.email) continue;
        try {
          const result = await sendRoundStandings(data.email, {
            username: data.username,
            leagueName: league.name,
            tournamentName: tourn.name,
            roundNumber,
            isFinal,
            winnerName,
            totalEntries,
            scoringStyle,
            top5,
            userEntries: data.entries,
            leagueUrl,
          });
          console.log(`[round-email] Resend OK for ${data.email}`);
          sent++;
        } catch (err) {
          console.error(`[round-email] Resend FAILED for ${data.email}:`, err.message);
        }
      }

      // Only mark as sent if at least one email succeeded
      if (sent > 0) {
        db.prepare('INSERT OR IGNORE INTO round_emails_sent (id, league_id, round_number) VALUES (?, ?, ?)')
          .run(uuidv4(), league.id, roundNumber);
        console.log(`[round-email] R${roundNumber}${isFinal ? ' (FINAL)' : ''} sent to ${sent}/${userMap.size} members of "${league.name}"`);
      } else {
        console.error(`[round-email] R${roundNumber} — ALL sends failed for "${league.name}", will retry next cycle`);
      }
    } catch (err) {
      console.error(`[round-email] Error for league "${league.name}":`, err.message);
    }
  }
}

let _fieldSyncInterval = null;

async function runFieldSync() {
  // Find pool leagues with tournaments starting within 7 days
  const upcoming = db.prepare(`
    SELECT DISTINCT gt.id, gt.name FROM golf_tournaments gt
    JOIN golf_leagues gl ON gl.pool_tournament_id = gt.id AND gl.format_type = 'pool' AND gl.status != 'archived'
    WHERE gt.status IN ('scheduled','active')
      AND date(gt.start_date) <= date('now', '+7 days')
      AND date(gt.start_date) >= date('now', '-1 days')
    ORDER BY gt.start_date ASC
  `).all();

  for (const t of upcoming) {
    try {
      await syncTournamentField(t.id);
    } catch (e) {
      console.error(`[field-sync] Error for ${t.name}:`, e.message);
    }
  }
}

function scheduleAutoSync() {
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(runAutoSync, 10 * 60 * 1000);
  setTimeout(runAutoSync, 8000);
  console.log('[golf-sync] Scheduled — 10 min intervals, Thu–Sun during active tournaments');

  // Field sync (WD detection): run daily at 8am UTC, also once on startup after 60s
  if (_fieldSyncInterval) clearInterval(_fieldSyncInterval);
  _fieldSyncInterval = setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 8 && now.getUTCMinutes() < 10) runFieldSync();
  }, 10 * 60 * 1000); // check every 10 min, fire when hour = 8 UTC
  setTimeout(runFieldSync, 60000);
  console.log('[golf-sync] Field sync scheduled — daily 8am UTC');
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

// ── Shared helpers (mirrors golf-admin.js) ──────────────────────────────────────
function _oddsToDecimal(str) {
  if (!str) return 999;
  const [a, b] = String(str).split(':').map(parseFloat);
  if (isNaN(a) || isNaN(b) || b === 0) return 999;
  return a / b + 1;
}
function _rankToOdds(rank) {
  const r = rank || 9999;
  const bands = [
    { minRank:1,   maxRank:5,    minOdds:8,   maxOdds:15   },
    { minRank:6,   maxRank:15,   minOdds:15,  maxOdds:30   },
    { minRank:16,  maxRank:30,   minOdds:30,  maxOdds:60   },
    { minRank:31,  maxRank:50,   minOdds:60,  maxOdds:100  },
    { minRank:51,  maxRank:100,  minOdds:100, maxOdds:200  },
    { minRank:101, maxRank:200,  minOdds:200, maxOdds:500  },
  ];
  const band = bands.find(b => r >= b.minRank && r <= b.maxRank)
             || { minOdds: 500, maxOdds: 1000 };
  const dec = (band.minOdds + band.maxOdds) / 2 + 1;
  return { odds_display: `${Math.round(dec - 1)}:1`, odds_decimal: dec };
}

// ── syncEspnFieldForTournament ──────────────────────────────────────────────────
// Fetches the ESPN entry list for a tournament, populates golf_tournament_fields
// and golf_players, then rebuilds pool_tier_players for any pool leagues using it.
// Safe to call at startup — idempotent (clears and re-inserts field each run).
async function syncEspnFieldForTournament(tournamentId) {
  const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournamentId);
  if (!tourn) throw new Error(`Tournament ${tournamentId} not found`);
  if (!tourn.espn_event_id) throw new Error(`Tournament ${tourn.name} has no espn_event_id`);

  const eid = tourn.espn_event_id;
  console.log(`[field-sync] Starting ESPN field sync for ${tourn.name} (event ${eid})`);

  // ── Fetch field ──────────────────────────────────────────────────────────────
  const espnData = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${eid}`);
  const events = espnData?.events || [];
  if (!events.length) throw new Error('ESPN returned no events');
  const competitors = (events[0].competitions || []).flatMap(c => c.competitors || []);
  if (!competitors.length) throw new Error('ESPN returned no competitors');

  // ── Fetch odds (ESPN futures endpoint) ──────────────────────────────────────
  const oddsMap = {};      // espnId → { odds_display, odds_decimal }
  const nameOddsMap = {};  // lowercase full name → odds
  const lastNameCount = {};
  const lastNameOddsMap = {};
  try {
    const oddsData = await fetchJson(
      `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${eid}/competitions/${eid}/odds`
    );
    for (const item of (oddsData?.items || [])) {
      const futures = item.futures || [];
      if (!futures.length) continue;
      for (const f of futures) {
        const espnId = String(f.athlete?.id || '');
        const american = parseInt(f.value || f.current?.moneyLine || 0);
        if (american <= 0) continue;
        const ratio = american / 100;
        const nice = ratio < 5   ? Math.round(ratio * 4) / 4 :
                     ratio < 20  ? Math.round(ratio * 2) / 2 :
                     ratio < 100 ? Math.round(ratio / 5) * 5 :
                                   Math.round(ratio / 25) * 25;
        const oddsObj = { odds_display: `${nice}:1`, odds_decimal: nice + 1 };
        if (espnId) oddsMap[espnId] = oddsObj;
        const fName = (f.athlete?.displayName || f.athlete?.fullName || '').toLowerCase().trim();
        if (fName) {
          nameOddsMap[fName] = oddsObj;
          const lastName = fName.split(' ').pop();
          lastNameCount[lastName] = (lastNameCount[lastName] || 0) + 1;
          lastNameOddsMap[lastName] = lastNameCount[lastName] === 1 ? oddsObj : null;
        }
      }
      break;
    }
  } catch (oddsErr) {
    console.warn('[field-sync] ESPN odds fetch non-fatal:', oddsErr.message);
  }

  // ── Upsert golf_tournament_fields + golf_players ─────────────────────────────
  const _getGP   = db.prepare('SELECT * FROM golf_players WHERE name = ? LIMIT 1');
  const _insGP   = db.prepare('INSERT OR IGNORE INTO golf_players (id, name, country, is_active, world_ranking) VALUES (?, ?, ?, 1, ?)');
  const _insTF   = db.prepare(`INSERT OR REPLACE INTO golf_tournament_fields (id, tournament_id, player_name, player_id, espn_player_id, world_ranking, odds_display, odds_decimal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const _updGP   = db.prepare('UPDATE golf_players SET odds_display = ?, odds_decimal = ? WHERE id = ?');
  const _updGPCo = db.prepare('UPDATE golf_players SET country = ? WHERE id = ? AND (country IS NULL OR length(country) != 2)');

  db.prepare('DELETE FROM golf_tournament_fields WHERE tournament_id = ?').run(tournamentId);

  let fieldCount = 0;
  db.transaction(() => {
    for (const c of competitors) {
      const name    = c.athlete?.displayName || c.athlete?.fullName;
      const espnId  = String(c.athlete?.id || '');
      const ranking = c.athlete?.ranking ? parseInt(c.athlete.ranking) : null;
      const country = c.athlete?.flag?.alt || c.athlete?.country || null;
      if (!name) continue;

      let gp = _getGP.get(name);
      if (!gp) { _insGP.run(uuidv4(), name, country, 1, ranking || 200); gp = _getGP.get(name); }
      if (!gp) continue;
      if (country) _updGPCo.run(country, gp.id);

      const nameLower = name.toLowerCase();
      const lastName  = nameLower.split(' ').pop();
      const playerOdds = oddsMap[espnId] || nameOddsMap[nameLower] || lastNameOddsMap[lastName] || null;
      _insTF.run(uuidv4(), tournamentId, name, gp.id, espnId, ranking || gp.world_ranking || 200,
                 playerOdds?.odds_display || null, playerOdds?.odds_decimal || null);
      if (playerOdds) _updGP.run(playerOdds.odds_display, playerOdds.odds_decimal, gp.id);
      fieldCount++;
    }
  })();
  console.log(`[field-sync] ${tourn.name}: ${fieldCount} players inserted into golf_tournament_fields`);

  // ── Rebuild pool_tier_players for affected leagues ───────────────────────────
  const affectedLeagues = db.prepare(
    "SELECT * FROM golf_leagues WHERE format_type = 'pool' AND pool_tournament_id = ? AND status != 'archived'"
  ).all(tournamentId);

  for (const league of affectedLeagues) {
    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
    if (!tiersConfig.length) { console.log(`[field-sync] League ${league.name}: no tier config, skipping`); continue; }

    // NOTE: is_withdrawn is intentionally NOT in the INSERT column list here.
    // Deleting and re-inserting resets is_withdrawn to 0 (the column default).
    // syncTournamentField() is the SOLE owner of is_withdrawn — DO NOT set it here.
    const insTP = db.prepare(`INSERT OR REPLACE INTO pool_tier_players (id, league_id, tournament_id, player_id, player_name, tier_number, odds_display, odds_decimal, world_ranking, salary, manually_overridden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`);
    db.prepare('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0').run(league.id, tournamentId);

    const allTF = db.prepare(`
      SELECT gp.*, tf.odds_display AS tf_od, tf.odds_decimal AS tf_dec
      FROM golf_players gp
      INNER JOIN golf_tournament_fields tf ON tf.player_id = gp.id AND tf.tournament_id = ?
      ORDER BY COALESCE(tf.odds_decimal, gp.odds_decimal, 999) ASC
    `).all(tournamentId);

    let count = 0;
    db.transaction(() => {
      for (const p of allTF) {
        const gen = (!p.tf_od && !p.odds_display) ? _rankToOdds(p.world_ranking || 200) : null;
        const odds_display = p.tf_od || p.odds_display || gen.odds_display;
        const odds_decimal = p.tf_dec || p.odds_decimal || gen.odds_decimal;
        let tierNum = tiersConfig[tiersConfig.length - 1]?.tier || 1;
        for (const t of tiersConfig) {
          if (odds_decimal >= _oddsToDecimal(t.odds_min) && odds_decimal <= _oddsToDecimal(t.odds_max)) { tierNum = t.tier; break; }
        }
        insTP.run(uuidv4(), league.id, tournamentId, p.id, p.name, tierNum, odds_display, odds_decimal, p.world_ranking || null);
        count++;
      }
    })();
    console.log(`[field-sync] League "${league.name}": ${count} players assigned to tiers`);
  }

  return { fieldCount, leaguesRebuilt: affectedLeagues.length };
}

module.exports = { syncTournamentScores, scheduleAutoSync, getSyncStatus, backfillCompleted, setIo, syncTournamentField, parseCompetitor, calcFantasyPts, syncEspnFieldForTournament };
