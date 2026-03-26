#!/usr/bin/env node
/**
 * Fix two data problems in league ff568722-fbe9-4695-86a8-a31287c22841:
 *
 * 1. Remove ALL Si Woo Kim pool_picks (he is legitimately withdrawn from
 *    the Houston Open — replacement picks were already added for all teams).
 *
 * 2. Check Nicolai Hojgaard's pool_picks row for Mickey — if is_withdrawn = 1
 *    (incorrectly set), clear it to 0 so he appears in standings.
 *
 * Usage:
 *   node scripts/fix-siwoo-and-hojgaard.js           # dry run
 *   node scripts/fix-siwoo-and-hojgaard.js --apply   # commit changes + sync
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const db  = require('./db');
const { syncTournamentScores } = require('./golfSyncService');

const LEAGUE_ID = 'ff568722-fbe9-4695-86a8-a31287c22841';
const DRY_RUN   = !process.argv.includes('--apply');

async function main() {
  console.log(DRY_RUN ? '\n⚠️  DRY RUN — no changes will be made\n' : '\n🚀  APPLY MODE\n');

  const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(LEAGUE_ID);
  if (!league) { console.error('❌  League not found'); process.exit(1); }
  const tid = league.pool_tournament_id;
  console.log(`League : "${league.name}"  tournament: ${tid}\n`);

  // ── 1. Diagnose + clear Hojgaard is_withdrawn for Mickey ─────────────────
  console.log('── Nicolai Hojgaard diagnosis ─────────────────────────────');

  const mickey =
    db.prepare("SELECT * FROM users WHERE username = 'Mickey'").get() ||
    db.prepare("SELECT * FROM users WHERE LOWER(username) = 'mickey'").get();
  if (!mickey) { console.error('❌  User "Mickey" not found'); process.exit(1); }
  console.log(`Mickey user_id: ${mickey.id}`);

  const mickeysAll = db.prepare(`
    SELECT id, tier_number, player_name, is_withdrawn
    FROM pool_picks
    WHERE league_id = ? AND tournament_id = ? AND user_id = ?
    ORDER BY tier_number ASC, player_name ASC
  `).all(LEAGUE_ID, tid, mickey.id);

  console.log(`\nMickey's current picks (${mickeysAll.length}):`);
  for (const p of mickeysAll) {
    const flag = p.is_withdrawn ? '  ⚠️  is_withdrawn=1' : '';
    console.log(`  T${p.tier_number}  ${p.player_name}${flag}`);
  }

  const hojgaard = mickeysAll.find(p =>
    (p.player_name || '').toLowerCase().includes('hojgaard')
  );

  if (!hojgaard) {
    console.log('\n⚠️  Hojgaard row not found for Mickey at all — may need to re-add.');
  } else if (hojgaard.is_withdrawn) {
    console.log(`\nHojgaard is_withdrawn = ${hojgaard.is_withdrawn} — needs to be cleared.`);
    if (!DRY_RUN) {
      db.prepare('UPDATE pool_picks SET is_withdrawn = 0 WHERE id = ?').run(hojgaard.id);
      console.log('✅  Cleared is_withdrawn for Hojgaard (Mickey).');
    } else {
      console.log('[DRY RUN] Would UPDATE pool_picks SET is_withdrawn = 0 WHERE id =', hojgaard.id);
    }
  } else {
    console.log('\n✅  Hojgaard is_withdrawn = 0 (or NULL) — no action needed.');
  }

  // ── 2. Diagnose + delete all Si Woo Kim picks league-wide ────────────────
  console.log('\n── Si Woo Kim removal (league-wide) ───────────────────────');

  const siwoo = db.prepare(`
    SELECT pp.id, pp.user_id, pp.tier_number, pp.player_name, pp.is_withdrawn,
           u.username
    FROM pool_picks pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.league_id = ? AND pp.tournament_id = ?
      AND LOWER(pp.player_name) LIKE '%si woo%'
    ORDER BY u.username ASC
  `).all(LEAGUE_ID, tid);

  if (siwoo.length === 0) {
    console.log('No Si Woo Kim picks found — nothing to delete.');
  } else {
    console.log(`Found ${siwoo.length} Si Woo Kim pick(s):`);
    for (const p of siwoo) {
      console.log(`  ${p.username}  T${p.tier_number}  "${p.player_name}"  is_withdrawn=${p.is_withdrawn}  id=${p.id}`);
    }

    if (!DRY_RUN) {
      const ids = siwoo.map(p => p.id);
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM pool_picks WHERE id IN (${placeholders})`).run(...ids);
      console.log(`\n✅  Deleted ${result.changes} Si Woo Kim pick(s).`);
    } else {
      console.log(`\n[DRY RUN] Would delete ${siwoo.length} Si Woo Kim pick(s).`);
    }
  }

  // ── 3. Verify league-wide pick counts ────────────────────────────────────
  console.log('\n── League-wide pick counts (after changes) ─────────────────');

  const memberCounts = db.prepare(`
    SELECT u.username, COUNT(*) AS pick_count,
           SUM(CASE WHEN pp.is_withdrawn = 1 THEN 1 ELSE 0 END) AS withdrawn_count
    FROM pool_picks pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.league_id = ? AND pp.tournament_id = ?
      AND (pp.is_withdrawn IS NULL OR pp.is_withdrawn = 0)
    GROUP BY pp.user_id
    ORDER BY u.username ASC
  `).all(LEAGUE_ID, tid);

  let bad = 0;
  for (const m of memberCounts) {
    const ok = m.pick_count === 7;
    if (!ok) bad++;
    console.log(`  ${ok ? '✅' : '❌'}  ${m.username.padEnd(20)}  ${m.pick_count} pick(s)${m.withdrawn_count > 0 ? `  (${m.withdrawn_count} withdrawn)` : ''}`);
  }
  if (bad === 0) {
    console.log('\n✅  All teams have exactly 7 picks.');
  } else {
    console.log(`\n⚠️  ${bad} team(s) do NOT have exactly 7 picks — review above.`);
  }

  // ── 4. Sync ───────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('\n── Score sync ────────────────────────────────────────────');
    try {
      const result = await syncTournamentScores(tid, { silent: false });
      console.log('Sync:', JSON.stringify(result));
    } catch (e) {
      console.error('Sync error:', e.message);
    }
  } else {
    console.log('\n[DRY RUN] Run with --apply to commit and sync.');
  }

  console.log('\nDone.\n');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
