#!/usr/bin/env node
/**
 * Diagnose and fix Mickey's missing pick in league ff568722-fbe9-4695-86a8-a31287c22841.
 *
 * Usage:
 *   node scripts/fix-mickey-picks.js           # diagnose only (no writes)
 *   node scripts/fix-mickey-picks.js --apply   # add missing pick + sync
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const db   = require('./db');
const { v4: uuidv4 } = require('uuid');
const { syncTournamentScores } = require('./golfSyncService');

const LEAGUE_ID = 'ff568722-fbe9-4695-86a8-a31287c22841';
const DRY_RUN   = !process.argv.includes('--apply');

async function main() {
  console.log(DRY_RUN ? '\n⚠️  DIAGNOSE ONLY (no writes)\n' : '\n🚀  APPLY MODE\n');

  const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(LEAGUE_ID);
  if (!league) { console.error('❌  League not found'); process.exit(1); }

  const tid = league.pool_tournament_id;
  console.log(`League : "${league.name}"`);
  console.log(`Tourney: ${tid}\n`);

  // ── Find Mickey ───────────────────────────────────────────────────────────
  const mickey =
    db.prepare("SELECT * FROM users WHERE username = 'Mickey'").get() ||
    db.prepare("SELECT * FROM users WHERE LOWER(username) = 'mickey'").get();

  if (!mickey) { console.error('❌  User "Mickey" not found'); process.exit(1); }
  console.log(`Mickey user_id: ${mickey.id}\n`);

  // ── Current picks ─────────────────────────────────────────────────────────
  const picks = db.prepare(`
    SELECT pp.tier_number, pp.player_name, pp.player_id
    FROM pool_picks pp
    WHERE pp.league_id = ? AND pp.tournament_id = ? AND pp.user_id = ?
    ORDER BY pp.tier_number ASC
  `).all(LEAGUE_ID, tid, mickey.id);

  console.log(`Mickey's current picks (${picks.length} total):`);
  for (const p of picks) {
    console.log(`  T${p.tier_number}  ${p.player_name}  (${p.player_id})`);
  }

  // ── Determine what tiers are filled vs expected ───────────────────────────
  let tiersConfig = [];
  try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

  console.log('\nExpected tier slots:');
  const missingTiers = [];
  for (const t of tiersConfig) {
    const tierNum   = parseInt(t.tier);
    const slotsNeeded = parseInt(t.picks) || 1;
    const filled    = picks.filter(p => p.tier_number === tierNum).length;
    const missing   = slotsNeeded - filled;
    console.log(`  T${tierNum}: ${filled}/${slotsNeeded} filled${missing > 0 ? `  ← MISSING ${missing}` : ''}`);
    for (let i = 0; i < missing; i++) missingTiers.push(tierNum);
  }

  if (missingTiers.length === 0) {
    console.log('\n✅  Mickey has all picks — nothing to add.');
    process.exit(0);
  }

  console.log(`\nMissing ${missingTiers.length} pick(s) in tier(s): ${missingTiers.join(', ')}`);

  // ── Find best available player for each missing tier ──────────────────────
  const existingIds = new Set(picks.map(p => p.player_id));

  for (const tierNum of missingTiers) {
    const candidate = db.prepare(`
      SELECT ptp.*, COALESCE(ptp.player_name, gp.name) AS display_name
      FROM pool_tier_players ptp
      LEFT JOIN golf_players gp ON gp.id = ptp.player_id
      WHERE ptp.league_id = ? AND ptp.tournament_id = ? AND ptp.tier_number = ?
        AND COALESCE(ptp.is_withdrawn, 0) = 0
      ORDER BY COALESCE(ptp.odds_decimal, 999) ASC
    `).all(LEAGUE_ID, tid, tierNum).find(p => !existingIds.has(p.player_id));

    if (!candidate) {
      console.error(`\n❌  No available T${tierNum} player found`);
      continue;
    }

    console.log(`\nBest available T${tierNum}: "${candidate.display_name}" (odds_decimal=${candidate.odds_decimal})`);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would INSERT T${tierNum} "${candidate.display_name}" for Mickey`);
    } else {
      db.prepare(`
        INSERT OR IGNORE INTO pool_picks
          (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, salary_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run(uuidv4(), LEAGUE_ID, tid, mickey.id, candidate.player_id, candidate.display_name, tierNum);
      existingIds.add(candidate.player_id);
      console.log(`  ✅  Inserted T${tierNum} "${candidate.display_name}" for Mickey`);
    }
  }

  // ── Sync ──────────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('\n── Score sync ────────────────────────────────────────────');
    try {
      const result = await syncTournamentScores(tid, { silent: false });
      console.log('Sync:', JSON.stringify(result));
    } catch (e) {
      console.error('Sync error:', e.message);
    }
  }

  console.log('\nDone.\n');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
