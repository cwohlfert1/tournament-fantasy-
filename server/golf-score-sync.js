/**
 * golf-score-sync.js
 *
 * Syncs PGA Tour scores from ESPN's public leaderboard API into golf_scores.
 * Player matching: normalised name comparison (golf_players has no ESPN athlete IDs).
 * Fantasy points use the same formula as commissioner score entry (par 72, no major bonus
 * unless tourn.is_major = 1).
 *
 * exports.syncTournament(tournamentId) — called by admin routes / cron
 */

'use strict';

const db = require('./db/index');
const { normalizePlayerName, matchPlayerName } = require('./utils/playerNameNorm');

const ESPN_LEADERBOARD = id =>
  `https://site.api.espn.com/apis/site/v2/sports/golf/pga/leaderboard?event=${id}`;
const ESPN_SCOREBOARD = id =>
  `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${id}`;

// norm() — thin alias over the shared utility (kept for internal use below)
const norm = normalizePlayerName;

// Fantasy points — configurable par baseline, commissioner formula
// Each round: (raw_score - par) * -1.5
// Finish bonuses: 1st +30, top5 +12, top10 +8, top25 +3
// Cut bonus +2; missed cut -5; major x1.5
// par defaults to 72 but can be overridden per tournament (e.g. Riviera = 71)
const DEFAULT_PAR = 72;
function calcPts(r1, r2, r3, r4, madeCut, finishPos, isMajor, par = DEFAULT_PAR) {
  let pts = 0;
  [r1, r2, r3, r4].forEach(r => {
    if (r !== null && r !== undefined) pts += (r - par) * -1.5;
  });
  if (finishPos !== null && finishPos !== undefined) {
    if      (finishPos === 1)   pts += 30;
    else if (finishPos <= 5)    pts += 12;
    else if (finishPos <= 10)   pts += 8;
    else if (finishPos <= 25)   pts += 3;
  }
  if (madeCut) pts += 2; else pts -= 5;
  if (isMajor) pts *= 1.5;
  return Math.round(pts * 10) / 10;
}

// Parse a linescore/round entry into a raw integer score (or null)
function parseRound(entry) {
  if (!entry) return null;
  const v = entry.value ?? entry.score;
  if (v === null || v === undefined || v === '' || v === '--') return null;
  const n = Number(v);
  if (isNaN(n)) return null;

  if (Math.abs(n) > 20 && n < 60) {
    console.warn(
      `[golf-score-sync] AMBIGUOUS round value=${n} (player/tourn unknown) — ` +
      `treating as raw strokes. Expected to-par ≤ ±20 or raw ≥ 60. ` +
      `Verify ESPN linescore format if fantasy points look wrong.`
    );
    return n;
  }

  if (Math.abs(n) <= 20) return DEFAULT_PAR + n;  // to-par → raw
  return n;                                        // already raw
}

// SQL for upsert — used inline instead of prepared statement for abstraction layer compatibility
const UPSERT_SCORE_SQL = `
  INSERT INTO golf_scores
    (id, tournament_id, player_id, round1, round2, round3, round4, made_cut, finish_position, fantasy_points, updated_at)
  VALUES
    (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
     substr(lower(hex(randomblob(2))),2) || '-' ||
     substr('89ab',abs(random()) % 4 + 1, 1) ||
     substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
     ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(tournament_id, player_id) DO UPDATE SET
    round1 = excluded.round1,
    round2 = excluded.round2,
    round3 = excluded.round3,
    round4 = excluded.round4,
    made_cut = excluded.made_cut,
    finish_position = excluded.finish_position,
    fantasy_points = excluded.fantasy_points,
    updated_at = CURRENT_TIMESTAMP
`;

async function syncTournament(tournamentId) {
  const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tournamentId);
  if (!tourn) throw new Error(`Tournament not found: ${tournamentId}`);

  const eventId = tourn.espn_event_id;
  if (!eventId) {
    console.log(`[golf-sync] No espn_event_id for "${tourn.name}" — skipped`);
    return { skipped: true, reason: 'no_espn_event_id', tournament: tourn.name };
  }

  console.log(`[golf-sync] Fetching "${tourn.name}" (ESPN event ${eventId})`);

  let data;
  let useScoreboard = false;
  try {
    const url = ESPN_LEADERBOARD(eventId);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      data = await res.json();
    } else {
      console.log(`[golf-sync] Leaderboard returned ${res.status}, falling back to scoreboard`);
      const res2 = await fetch(ESPN_SCOREBOARD(eventId), { headers: { 'Accept': 'application/json' } });
      if (!res2.ok) throw new Error(`ESPN scoreboard also returned HTTP ${res2.status} for event ${eventId}`);
      data = await res2.json();
      useScoreboard = true;
    }
  } catch (err) {
    console.error(`[golf-sync] Fetch error: ${err.message}`);
    throw err;
  }

  // Guard: ESPN scoreboard may return a different event if the target hasn't started
  if (useScoreboard) {
    const returnedId = data?.events?.[0]?.id;
    if (returnedId && String(returnedId) !== String(eventId)) {
      console.log(`[golf-sync] ESPN returned event ${returnedId} instead of ${eventId} — tournament likely hasn't started`);
      return { synced: 0, unmatched: 0, tournament: tourn.name, skipped: true, reason: 'event_not_started' };
    }
  }

  const competitors =
    data?.leaderboard?.competitors ||
    data?.leaderboard?.entries ||
    data?.events?.[0]?.competitions?.[0]?.competitors ||
    [];

  if (competitors.length === 0) {
    console.log(`[golf-sync] No competitors in ESPN response — event may not have started`);
    return { synced: 0, unmatched: 0, tournament: tourn.name };
  }

  const allPlayers = await db.all('SELECT id, name FROM golf_players');

  const isMajor  = !!tourn.is_major;
  const coursePar = tourn.par || DEFAULT_PAR;
  let synced = 0;
  let unmatched = 0;

  // First pass: parse all competitor data
  const parsed = [];
  for (const comp of competitors) {
    const displayName =
      comp.athlete?.displayName ||
      comp.athlete?.fullName ||
      comp.displayName || '';
    if (!displayName) continue;

    const matched = matchPlayerName(displayName, allPlayers, tourn.name);
    if (!matched) {
      unmatched++;
      continue;
    }

    const linescores = comp.linescores || comp.rounds || [];
    let r1, r2, r3, r4;

    if (useScoreboard) {
      const getRaw = n => {
        const ls = linescores.find(l => Number(l.period) === n);
        return ls && ls.value != null && !isNaN(Number(ls.value)) ? Number(ls.value) : null;
      };
      r1 = getRaw(1); r2 = getRaw(2); r3 = getRaw(3); r4 = getRaw(4);
    } else {
      const getR = n => {
        const ls = linescores.find(l => {
          const p = l.period?.number ?? l.period ?? l.roundNumber ?? l.number;
          return Number(p) === n;
        });
        return ls ? parseRound(ls) : null;
      };
      r1 = getR(1); r2 = getR(2); r3 = getR(3); r4 = getR(4);
    }

    const statusId = comp.status?.type?.id || comp.status?.id || '';
    let madeCut;
    if (statusId) {
      madeCut = statusId !== 'C' && statusId !== 'STATUS_MISSED_CUT';
    } else {
      madeCut = linescores.length >= 4;
    }

    const posRaw =
      comp.status?.position?.id ||
      comp.position?.id ||
      (typeof comp.sortOrder === 'number' ? String(comp.sortOrder) : null);
    let finishPos = posRaw && /^\d+$/.test(String(posRaw).replace(/^T/, ''))
      ? parseInt(String(posRaw).replace(/^T/, ''))
      : null;

    const total = [r1, r2, r3, r4].reduce((s, r) => r != null ? s + r : s, 0);

    parsed.push({ playerId: matched.id, r1, r2, r3, r4, madeCut, finishPos, total });
  }

  // Derive finish positions from total strokes when not provided (scoreboard fallback)
  if (useScoreboard) {
    const made = parsed.filter(p => p.madeCut).sort((a, b) => a.total - b.total);
    let pos = 1;
    for (let i = 0; i < made.length; i++) {
      if (i > 0 && made[i].total > made[i - 1].total) pos = i + 1;
      made[i].finishPos = pos;
    }
  }

  await db.transaction(async (tx) => {
    for (const p of parsed) {
      const pts = calcPts(p.r1, p.r2, p.r3, p.r4, p.madeCut, p.finishPos, isMajor, coursePar);
      await tx.run(UPSERT_SCORE_SQL, tourn.id, p.playerId, p.r1, p.r2, p.r3, p.r4, p.madeCut ? 1 : 0, p.finishPos, pts);
      synced++;
    }
  });

  if (synced > 0) {
    await db.run(`
      UPDATE golf_tournaments
      SET status = 'active', last_synced_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status != 'completed'
    `, tournamentId);
  }

  console.log(`[golf-sync] "${tourn.name}": synced=${synced}, unmatched=${unmatched}`);
  return { synced, unmatched, tournament: tourn.name, eventId };
}

module.exports = { syncTournament };
