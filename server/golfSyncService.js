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

  // Linescores — detect format by checking if any item has a nested `linescores` array
  const ls = comp.linescores || [];
  const isHistorical = ls.some(l => Array.isArray(l.linescores));

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
  const currentPeriod = event?.competitions?.[0]?.status?.period ?? 0;
  console.log(`[golf-sync] ESPN period: ${currentPeriod}`);

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
  const _tournStartDate = new Date(tournament.start_date);
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

  return { synced, notMatched, espnEventName: event.name || event.shortName, isCompleted };
}

// ── Odds API helper ─────────────────────────────────────────────────────────────
function americanToOdds(american) {
  if (!american || american < -5000) return null;
  const ratio = american > 0 ? american / 100 : 100 / Math.abs(american);
  const nice = ratio < 5   ? Math.round(ratio * 4) / 4 :
               ratio < 20  ? Math.round(ratio * 2) / 2 :
               ratio < 100 ? Math.round(ratio / 5) * 5 :
                             Math.round(ratio / 25) * 25;
  return { odds_display: `${nice}:1`, odds_decimal: nice + 1 };
}

async function syncPoolOdds() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return; // silently skip — key not configured yet

  // Find upcoming tournaments with pool leagues starting within 7 days
  const upcoming = db.prepare(`
    SELECT DISTINCT gt.id, gt.name FROM golf_tournaments gt
    JOIN golf_leagues gl ON gl.pool_tournament_id = gt.id AND gl.format_type = 'pool' AND gl.status != 'archived'
    WHERE gt.status IN ('scheduled','active')
      AND date(gt.start_date) <= date('now', '+7 days')
    ORDER BY gt.start_date ASC
  `).all();

  if (!upcoming.length) return;

  let oddsApiData;
  try {
    oddsApiData = await fetchJson(`https://api.the-odds-api.com/v4/sports/golf_pga_tour/odds?apiKey=${apiKey}&regions=us&markets=outrights&oddsFormat=american`);
  } catch (e) {
    console.warn('[odds-sync] Fetch failed:', e.message);
    return;
  }

  if (!Array.isArray(oddsApiData) || !oddsApiData.length) {
    console.log('[odds-sync] No events returned');
    return;
  }

  // Build player name → odds map from preferred bookmaker
  const PREF_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbetus'];
  const playerOdds = {}; // name_lower → { odds_display, odds_decimal }
  for (const event of oddsApiData) {
    let outcomes = null;
    for (const bookKey of PREF_BOOKS) {
      const book = (event.bookmakers || []).find(b => b.key === bookKey);
      if (book) { outcomes = book.markets?.find(m => m.key === 'outrights')?.outcomes; if (outcomes?.length) break; }
    }
    if (!outcomes) {
      for (const book of (event.bookmakers || [])) {
        outcomes = book.markets?.find(m => m.key === 'outrights')?.outcomes;
        if (outcomes?.length) break;
      }
    }
    if (!outcomes) continue;
    for (const o of outcomes) {
      const oddsObj = americanToOdds(o.price);
      if (!o.name || !oddsObj) continue;
      playerOdds[o.name.toLowerCase().trim()] = oddsObj;
    }
    break; // one event = all PGA outrights
  }

  if (!Object.keys(playerOdds).length) {
    console.log('[odds-sync] No player odds parsed');
    return;
  }

  console.log(`[odds-sync] API returned ${Object.keys(playerOdds).length} players. Sample:`,
    Object.entries(playerOdds).slice(0, 10).map(([n, o]) => `${n}=${o.odds_display}`).join(', '));

  let total = 0;
  for (const tourn of upcoming) {
    const leagues = db.prepare(`SELECT id FROM golf_leagues WHERE pool_tournament_id = ? AND format_type = 'pool' AND status != 'archived'`).all(tourn.id);
    for (const league of leagues) {
      const tierPlayers = db.prepare('SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ?').all(league.id, tourn.id);
      const updTP = db.prepare('UPDATE pool_tier_players SET odds_display = ?, odds_decimal = ? WHERE league_id = ? AND tournament_id = ? AND player_id = ?');
      const updGP = db.prepare('UPDATE golf_players SET odds_display = ?, odds_decimal = ? WHERE id = ?');
      const noMatch = [];
      db.transaction(() => {
        for (const p of tierPlayers) {
          const nameLower = p.player_name.toLowerCase();
          const lastName  = nameLower.split(' ').pop();
          const firstInit = nameLower[0];
          // Exact → first initial + last name → unique last name
          let odds = playerOdds[nameLower];
          let matchedAs = 'exact';
          if (!odds) {
            const key = Object.keys(playerOdds).find(k => {
              const parts = k.split(' ');
              return parts[parts.length - 1] === lastName && parts[0]?.[0] === firstInit;
            });
            if (key) { odds = playerOdds[key]; matchedAs = `initials(${key})`; }
          }
          if (!odds) {
            const lastMatches = Object.keys(playerOdds).filter(k => k.split(' ').pop() === lastName);
            if (lastMatches.length === 1) { odds = playerOdds[lastMatches[0]]; matchedAs = `lastName(${lastMatches[0]})`; }
          }
          if (odds) {
            updTP.run(odds.odds_display, odds.odds_decimal, league.id, tourn.id, p.player_id);
            updGP.run(odds.odds_display, odds.odds_decimal, p.player_id);
            total++;
            console.log(`[odds-sync] ✓ ${p.player_name} → ${odds.odds_display} (via ${matchedAs})`);
          } else {
            noMatch.push(p.player_name);
          }
        }
      })();
      if (noMatch.length) {
        console.log(`[odds-sync] ✗ No odds found for ${noMatch.length} players: ${noMatch.join(', ')}`);
      }
    }
  }
  console.log(`[odds-sync] Updated ${total} player odds across ${upcoming.length} tournament(s)`);
}

// ── Auto-sync scheduler ─────────────────────────────────────────────────────────
let _syncInterval = null;
let _oddsInterval = null;
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
        AND gl.status = 'lobby'
        AND gl.pool_tournament_id = ?
    `).all(tournamentId);

    for (const league of poolLeagues) {
      const standings = db.prepare(`
        SELECT glm.id as member_id, glm.team_name, u.username,
               COALESCE(SUM(gs.fantasy_points), 0) as total_points
        FROM golf_league_members glm
        JOIN users u ON u.id = glm.user_id
        LEFT JOIN golf_weekly_lineups wl ON wl.member_id = glm.id
        LEFT JOIN golf_scores gs ON gs.player_id = wl.player_id AND gs.tournament_id = ?
        WHERE glm.golf_league_id = ?
        GROUP BY glm.id
        ORDER BY total_points DESC
      `).all(tournamentId, league.id);

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
  const dow = now.getDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat
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
      const result = await syncTournamentScores(tournament.id, { silent: false });
      _lastSyncTime = new Date().toISOString();
      _lastSyncResult = { ...result, tournamentName: tournament.name };
      // Verify what actually landed in the DB
      const dbCount = db.prepare('SELECT COUNT(*) as c FROM golf_scores WHERE tournament_id = ?').get(tournament.id);
      console.log(`[golf-sync] DB check: golf_scores rows for "${tournament.name}" = ${dbCount.c}`);
      if (result.synced > 0) {
        pushPoolStandings(tournament.id);
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

  for (const league of leagues) {
    const tierPlayers = db.prepare(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND is_withdrawn = 0'
    ).all(league.id, tournamentId);

    const markWD = db.prepare(
      'UPDATE pool_tier_players SET is_withdrawn = 1 WHERE id = ?'
    );
    const markPickWD = db.prepare(
      'UPDATE pool_picks SET is_withdrawn = 1 WHERE league_id = ? AND tournament_id = ? AND player_name = ?'
    );

    let wdCount = 0;
    db.transaction(() => {
      for (const p of tierPlayers) {
        const n = norm(p.player_name);
        // Check direct match or last+first-initial match
        const inField = espnNames.has(n) || [...espnNames].some(en => {
          const parts = en.split(' ');
          const np = n.split(' ');
          return parts[parts.length - 1] === np[np.length - 1] && parts[0]?.[0] === np[0]?.[0];
        });
        if (!inField) {
          markWD.run(p.id);
          markPickWD.run(league.id, tournamentId, p.player_name);
          console.log(`[field-sync] WD detected: ${p.player_name} (league ${league.id})`);
          wdCount++;
        }
      }
    })();
    if (wdCount > 0) {
      console.log(`[field-sync] ${tourn.name}: ${wdCount} player(s) marked WD in league ${league.id}`);
    } else {
      console.log(`[field-sync] ${tourn.name}: no WDs detected`);
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

  // Odds sync: run once on startup (after 45s) then every 6 hours
  // Fetches from The Odds API when ODDS_API_KEY is set and a tournament is within 7 days
  if (_oddsInterval) clearInterval(_oddsInterval);
  _oddsInterval = setInterval(syncPoolOdds, 6 * 60 * 60 * 1000);
  setTimeout(syncPoolOdds, 45000);
  console.log('[golf-sync] Odds sync scheduled — 6h intervals when ODDS_API_KEY set');

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

module.exports = { syncTournamentScores, scheduleAutoSync, getSyncStatus, backfillCompleted, setIo, syncPoolOdds, syncTournamentField, parseCompetitor, calcFantasyPts };
