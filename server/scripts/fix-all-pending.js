'use strict';
/**
 * fix-all-pending.js
 *
 * Finds ALL pool_picks in a league that show is_pending=true (no golf_scores data)
 * and attempts to fix each one.
 *
 * ROOT CAUSE: is_pending is computed in applyDropScoring as !hasRounds && !isMC.
 * It appears when the standings LEFT JOIN finds no golf_scores row for a player,
 * which happens when:
 *   (a) The player is not in golf_players (sync can't write a score for them), OR
 *   (b) The player IS in golf_players but the isHistorical parser bug returned null
 *       for r1 (live-format entries with nested hole data but no period field).
 *
 * This script:
 *   1. Shows all pending players (no golf_scores round data) for the target league.
 *   2. For each: checks golf_players and golf_scores state.
 *   3. With --apply: upserts a placeholder golf_scores row (r1=null sentinel) for any
 *      player that IS in golf_players but has no golf_scores row at all.
 *   4. With --apply: triggers a full syncTournamentScores which overwrites everything
 *      with live ESPN data. After the fix to isHistorical detection, this will correctly
 *      populate r1 from displayValue.
 *
 * Usage:
 *   node scripts/fix-all-pending.js                        # dry-run diagnostic
 *   node scripts/fix-all-pending.js --apply                # apply + trigger sync
 *   node scripts/fix-all-pending.js --league <uuid>        # target a specific league
 */

require('../golf-db');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

const APPLY  = process.argv.includes('--apply');
const liIdx  = process.argv.indexOf('--league');
const LEAGUE = liIdx !== -1 ? process.argv[liIdx + 1] : 'ff568722-fbe9-4695-86a8-a31287c22841';

// ── 1. Find current active tournament ────────────────────────────────────────
const tourn = db.prepare(
  "SELECT id, name, status, espn_event_id FROM golf_tournaments WHERE status = 'active' ORDER BY start_date DESC LIMIT 1"
).get() || db.prepare(
  "SELECT id, name, status, espn_event_id FROM golf_tournaments ORDER BY start_date DESC LIMIT 1"
).get();

console.log('\n── active tournament ─────────────────────────────────────────');
if (!tourn) { console.log('  No tournament found!'); process.exit(1); }
console.log(`  id=${tourn.id} name="${tourn.name}" status=${tourn.status} espn_id=${tourn.espn_event_id}`);

// ── 2. All pending picks (no round data in golf_scores) ───────────────────────
console.log('\n── All pending picks (no round data) ─────────────────────────');
const pending = db.prepare(`
  SELECT pp.player_name, pp.tier_number,
         COUNT(DISTINCT pp.user_id) as teams,
         gp.id as player_id,
         gs.round1, gs.round2, gs.round3, gs.round4
  FROM pool_picks pp
  LEFT JOIN golf_players gp ON gp.name = pp.player_name
  LEFT JOIN golf_scores  gs ON gs.player_id = gp.id AND gs.tournament_id = ?
  WHERE pp.league_id = ?
    AND (pp.is_withdrawn IS NULL OR pp.is_withdrawn = 0)
    AND (gs.round1 IS NULL AND gs.round2 IS NULL AND gs.round3 IS NULL AND gs.round4 IS NULL)
  GROUP BY pp.player_name, pp.tier_number
  ORDER BY teams DESC, pp.tier_number ASC
`).all(tourn.id, LEAGUE);

if (pending.length === 0) {
  console.log('  None — all players with picks have round data. No action needed.');
  process.exit(0);
}

const noPlayerRow  = pending.filter(p => !p.player_id);
const noScoresRow  = pending.filter(p => p.player_id && p.round1 === null && p.round2 === null && p.round3 === null && p.round4 === null);
const hasScoresRow = pending.filter(p => p.player_id && (p.round1 !== null || p.round2 !== null));

for (const p of pending) {
  const tag = !p.player_id ? '[NOT IN golf_players]' : '[no golf_scores row]';
  console.log(`  T${p.tier_number} ${p.player_name} (${p.teams} team(s)) ${tag}`);
}
console.log(`\n  Total pending: ${pending.length} (${noPlayerRow.length} missing from golf_players, ${noScoresRow.length} missing scores row)`);

// ── 3. Players not in golf_players — manual fix needed ────────────────────────
if (noPlayerRow.length > 0) {
  console.log('\n── Players NOT in golf_players (manual fix required) ─────────');
  console.log('  These players cannot be fixed automatically. Add them to the');
  console.log('  GOLF_PLAYERS array in golf-db.js so they survive reseeds:');
  for (const p of noPlayerRow) {
    console.log(`    { name: '${p.player_name}', country: 'USA', world_ranking: 999, salary: 200 },`);
  }
}

if (!APPLY) {
  console.log('\n── DRY RUN — pass --apply to write the fix ──────────────────');
  console.log(`  Will upsert placeholder golf_scores for ${noScoresRow.length} player(s) in golf_players`);
  console.log('  Will then trigger syncTournamentScores to populate live data');
  process.exit(0);
}

// ── 4. Apply: upsert placeholder golf_scores for known players ───────────────
if (noScoresRow.length > 0) {
  console.log(`\n── Upserting placeholder golf_scores for ${noScoresRow.length} player(s)...`);
  const upsert = db.prepare(`
    INSERT INTO golf_scores (id, tournament_id, player_id, round1, round2, round3, round4, made_cut, finish_position, fantasy_points, updated_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(tournament_id, player_id) DO NOTHING
  `);
  for (const p of noScoresRow) {
    upsert.run(uuidv4(), tourn.id, p.player_id);
    console.log(`  ✓ Placeholder row for ${p.player_name} (player_id=${p.player_id})`);
  }
}

// ── 5. Trigger live sync — overwrites placeholder with ESPN data ──────────────
console.log('\n── Triggering syncTournamentScores...');
const { syncTournamentScores } = require('../golfSyncService');
syncTournamentScores(tourn.id, { par: 72, silent: false })
  .then(result => {
    console.log(`\n  ✓ Sync complete: synced=${result.synced} unmatched=${result.notMatched?.length || 0}`);
    if (result.notMatched?.length) {
      console.log(`  Still unmatched after sync:`);
      for (const name of result.notMatched) console.log(`    ${name}`);
    }

    // Verify final state
    console.log('\n── Final state (re-checking pending picks) ───────────────────');
    const stillPending = db.prepare(`
      SELECT pp.player_name, pp.tier_number, COUNT(DISTINCT pp.user_id) as teams
      FROM pool_picks pp
      LEFT JOIN golf_players gp ON gp.name = pp.player_name
      LEFT JOIN golf_scores  gs ON gs.player_id = gp.id AND gs.tournament_id = ?
      WHERE pp.league_id = ?
        AND (pp.is_withdrawn IS NULL OR pp.is_withdrawn = 0)
        AND (gs.round1 IS NULL AND gs.round2 IS NULL AND gs.round3 IS NULL AND gs.round4 IS NULL)
      GROUP BY pp.player_name, pp.tier_number
      ORDER BY teams DESC
    `).all(tourn.id, LEAGUE);

    if (stillPending.length === 0) {
      console.log('  ✓ All pending picks resolved — no more is_pending players.');
    } else {
      console.log(`  ⚠ ${stillPending.length} player(s) still pending after sync:`);
      for (const p of stillPending) console.log(`    T${p.tier_number} ${p.player_name} (${p.teams} team(s))`);
      console.log('  These players may need to be added to GOLF_PLAYERS in golf-db.js.');
    }
  })
  .catch(err => {
    console.error(`\n  ✗ Sync failed: ${err.message}`);
    console.log('  Placeholder rows were still written — try running sync manually.');
  });
