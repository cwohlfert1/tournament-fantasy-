#!/usr/bin/env node
/**
 * Clean up Mickey's corrupted picks in league ff568722-fbe9-4695-86a8-a31287c22841.
 *
 * Removes 5 extra T4 picks, leaving exactly 7:
 *   T1: Chris Gotterup
 *   T2: Davis Riley
 *   T2: Nicolai Hojgaard
 *   T3: Adam Scott
 *   T3: Rickie Fowler
 *   T4: Christiaan Bezuidenhout
 *   T4: Denny McCarthy
 *
 * Usage:
 *   node scripts/cleanup-mickey-picks.js           # dry run — shows what would be deleted
 *   node scripts/cleanup-mickey-picks.js --apply   # deletes + syncs
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const db  = require('./db');
const { syncTournamentScores } = require('./golfSyncService');

const LEAGUE_ID   = 'ff568722-fbe9-4695-86a8-a31287c22841';
const DRY_RUN     = !process.argv.includes('--apply');
const REMOVE_NAMES = ['Tom Kim', 'Tony Finau', 'Beau Hossler', 'Nick Dunlap', 'K.H. Lee'];
const KEEP_NAMES   = ['Chris Gotterup', 'Davis Riley', 'Nicolai Hojgaard', 'Adam Scott', 'Rickie Fowler', 'Christiaan Bezuidenhout', 'Denny McCarthy'];

async function main() {
  console.log(DRY_RUN ? '\n⚠️  DRY RUN — no changes will be made\n' : '\n🚀  APPLY MODE\n');

  const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(LEAGUE_ID);
  if (!league) { console.error('❌  League not found'); process.exit(1); }
  const tid = league.pool_tournament_id;
  console.log(`League : "${league.name}"  tournament: ${tid}\n`);

  // Find Mickey
  const mickey =
    db.prepare("SELECT * FROM users WHERE username = 'Mickey'").get() ||
    db.prepare("SELECT * FROM users WHERE LOWER(username) = 'mickey'").get();
  if (!mickey) { console.error('❌  User "Mickey" not found'); process.exit(1); }
  console.log(`Mickey user_id: ${mickey.id}\n`);

  // Show current picks
  const before = db.prepare(`
    SELECT id, tier_number, player_name FROM pool_picks
    WHERE league_id = ? AND tournament_id = ? AND user_id = ?
    ORDER BY tier_number ASC, player_name ASC
  `).all(LEAGUE_ID, tid, mickey.id);

  console.log(`Current picks (${before.length}):`);
  for (const p of before) {
    const action = REMOVE_NAMES.includes(p.player_name) ? '❌ DELETE' : '✅ keep';
    console.log(`  T${p.tier_number}  ${p.player_name}  ${action}`);
  }

  const toDelete = before.filter(p => REMOVE_NAMES.includes(p.player_name));
  console.log(`\nWill delete ${toDelete.length} pick(s): ${toDelete.map(p => p.player_name).join(', ')}`);

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Run with --apply to commit.');
    process.exit(0);
  }

  // Delete
  db.prepare(`
    DELETE FROM pool_picks
    WHERE league_id = ? AND tournament_id = ? AND user_id = ?
      AND player_name IN (${REMOVE_NAMES.map(() => '?').join(',')})
  `).run(LEAGUE_ID, tid, mickey.id, ...REMOVE_NAMES);

  // Verify
  const after = db.prepare(`
    SELECT tier_number, player_name FROM pool_picks
    WHERE league_id = ? AND tournament_id = ? AND user_id = ?
    ORDER BY tier_number ASC
  `).all(LEAGUE_ID, tid, mickey.id);

  console.log(`\nMickey's picks after cleanup (${after.length}):`);
  for (const p of after) {
    console.log(`  T${p.tier_number}  ${p.player_name}`);
  }

  const missing = KEEP_NAMES.filter(n => !after.some(p => p.player_name === n));
  const extra   = after.filter(p => !KEEP_NAMES.includes(p.player_name));

  if (missing.length) console.warn(`\n⚠️  Missing expected picks: ${missing.join(', ')}`);
  if (extra.length)   console.warn(`⚠️  Unexpected picks still present: ${extra.map(p => p.player_name).join(', ')}`);

  if (after.length === 7 && missing.length === 0 && extra.length === 0) {
    console.log('\n✅  Exactly 7 picks — looks correct.');
  } else {
    console.error(`\n❌  Expected 7 picks, got ${after.length} — review above.`);
  }

  // Sync
  console.log('\n── Score sync ────────────────────────────────────────────');
  try {
    const result = await syncTournamentScores(tid, { silent: false });
    console.log('Sync:', JSON.stringify(result));
  } catch (e) {
    console.error('Sync error:', e.message);
  }

  console.log('\nDone.\n');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
