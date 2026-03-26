#!/usr/bin/env node
/**
 * One-time fix: Add replacement picks for the 12 teams affected by Si Woo Kim removal.
 *
 * League: ff568722-fbe9-4695-86a8-a31287c22841
 *
 * Logic:
 *   - Each of the 11 short teams gets Chris Gotterup OR Min Woo Lee —
 *     whichever they don't already have. Specific overrides apply for 3 teams.
 *   - Mickey (4 picks, needs 3): gets Gotterup + Min Woo Lee + 1 available Tier 2.
 *
 * Usage:
 *   node scripts/add-replacement-picks.js           # dry run (no writes)
 *   node scripts/add-replacement-picks.js --apply   # actually insert
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));   // run from server root so db.js resolves

const db     = require('./db');
const { v4: uuidv4 } = require('uuid');
const { syncTournamentScores } = require('./golfSyncService');

const LEAGUE_ID = 'ff568722-fbe9-4695-86a8-a31287c22841';
const DRY_RUN   = !process.argv.includes('--apply');

if (DRY_RUN) {
  console.log('\n⚠️  DRY RUN — no changes will be made. Pass --apply to commit.\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findUser(username) {
  // Try exact match first, then case-insensitive
  return (
    db.prepare('SELECT * FROM users WHERE username = ?').get(username) ||
    db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username)
  );
}

function userPicks(userId, leagueId, tid) {
  return db.prepare(
    'SELECT * FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ?'
  ).all(leagueId, tid, userId);
}

function findPoolPlayer(leagueId, tid, name) {
  // Fuzzy name search in pool_tier_players
  const players = db.prepare(
    "SELECT ptp.*, gp.name AS gp_name FROM pool_tier_players ptp LEFT JOIN golf_players gp ON gp.id = ptp.player_id WHERE ptp.league_id = ? AND ptp.tournament_id = ?"
  ).all(leagueId, tid);

  const normName = n => (n || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
  const target   = normName(name);
  return players.find(p => normName(p.player_name).includes(target) || normName(p.gp_name || '').includes(target));
}

function insertPick(leagueId, tid, userId, player, tierNumber) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would INSERT: user_id=${userId} player="${player.player_name}" tier=${tierNumber}`);
    return;
  }
  db.prepare(`
    INSERT OR IGNORE INTO pool_picks (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, salary_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(uuidv4(), leagueId, tid, userId, player.player_id, player.player_name || player.gp_name, tierNumber);
  console.log(`  ✅  Inserted: user_id=${userId} player="${player.player_name}" tier=${tierNumber}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(LEAGUE_ID);
  if (!league) { console.error('❌ League not found:', LEAGUE_ID); process.exit(1); }
  console.log(`League: "${league.name}"  tournament_id: ${league.pool_tournament_id}`);

  const tid = league.pool_tournament_id;
  if (!tid) { console.error('❌ No tournament linked'); process.exit(1); }

  // Find replacement players in pool_tier_players
  const gotterup  = findPoolPlayer(LEAGUE_ID, tid, 'gotterup');
  const minWooLee = findPoolPlayer(LEAGUE_ID, tid, 'min woo');

  if (!gotterup)  { console.error('❌ Chris Gotterup not found in pool tier players'); process.exit(1); }
  if (!minWooLee) { console.error('❌ Min Woo Lee not found in pool tier players');    process.exit(1); }

  console.log(`\nReplacement players:`);
  console.log(`  Gotterup:    "${gotterup.player_name}"  tier=${gotterup.tier_number}  player_id=${gotterup.player_id}`);
  console.log(`  Min Woo Lee: "${minWooLee.player_name}" tier=${minWooLee.tier_number} player_id=${minWooLee.player_id}`);

  // ── Team list ─────────────────────────────────────────────────────────────
  // Format: { username, forcePlayer?: 'gotterup'|'minwoolee' }
  // If forcePlayer is omitted → auto-assign whichever they don't already have.
  const teams = [
    { username: 'Wb0312'       },
    { username: 'iconnelly'    },
    { username: 'Nbrawley'     },
    { username: 'MGhegan'      },
    { username: 'Jrob8'        },          // team name; try "Jacob Robinson" if not found
    { username: 'ryanusc3',     forcePlayer: 'gotterup'  },
    { username: 'lukepaff',     forcePlayer: 'minwoolee' },
    { username: 'bradenmorrow24' },
    { username: 'Jdpack',       forcePlayer: 'minwoolee' },
    { username: 'Chiggins93'   },
    { username: 'Bencanada17'  },
  ];

  console.log('\n── Regular replacements ──────────────────────────────────');

  for (const { username, forcePlayer } of teams) {
    // Try the given username; fallback candidates for Jrob8
    let user = findUser(username);
    if (!user && username === 'Jrob8') user = findUser('Jacob Robinson');
    if (!user) {
      console.warn(`  ⚠️  User not found: "${username}" — skipping`);
      continue;
    }

    const existing = userPicks(user.id, LEAGUE_ID, tid);
    const hasGotterup  = existing.some(p => p.player_id === gotterup.player_id);
    const hasMinWooLee = existing.some(p => p.player_id === minWooLee.player_id);
    console.log(`\n  ${username} (${user.id}) — ${existing.length} existing picks  hasG=${hasGotterup} hasMWL=${hasMinWooLee}`);

    let target;
    if (forcePlayer === 'gotterup') {
      target = gotterup;
    } else if (forcePlayer === 'minwoolee') {
      target = minWooLee;
    } else {
      // Auto: give whichever they don't have (prefer Gotterup if they have neither)
      target = hasGotterup ? minWooLee : gotterup;
    }

    if (existing.some(p => p.player_id === target.player_id)) {
      console.log(`  ↩️  Already has "${target.player_name}" — skipping`);
      continue;
    }

    insertPick(LEAGUE_ID, tid, user.id, target, target.tier_number);
  }

  // ── Mickey — special case (needs 3 picks) ─────────────────────────────────
  console.log('\n── Mickey (special: needs 3 picks) ──────────────────────');
  const mickey = findUser('Mickey');
  if (!mickey) {
    console.warn('  ⚠️  User "Mickey" not found — skipping special case');
  } else {
    const existing    = userPicks(mickey.id, LEAGUE_ID, tid);
    const hasGotterup  = existing.some(p => p.player_id === gotterup.player_id);
    const hasMinWooLee = existing.some(p => p.player_id === minWooLee.player_id);
    console.log(`  Mickey (${mickey.id}) — ${existing.length} existing picks  hasG=${hasGotterup} hasMWL=${hasMinWooLee}`);

    if (!hasGotterup)  insertPick(LEAGUE_ID, tid, mickey.id, gotterup,  gotterup.tier_number);
    if (!hasMinWooLee) insertPick(LEAGUE_ID, tid, mickey.id, minWooLee, minWooLee.tier_number);

    // Find best available Tier 2 player not already in Mickey's picks
    const existingIds = new Set(existing.map(p => p.player_id));
    if (!hasGotterup) existingIds.delete(gotterup.player_id);   // don't double-count
    const tier2 = db.prepare(`
      SELECT ptp.*, gp.name AS gp_name
      FROM pool_tier_players ptp
      LEFT JOIN golf_players gp ON gp.id = ptp.player_id
      WHERE ptp.league_id = ? AND ptp.tournament_id = ? AND ptp.tier_number = 2
      ORDER BY COALESCE(ptp.odds_decimal, 999) ASC
    `).all(LEAGUE_ID, tid).find(p => !existingIds.has(p.player_id));

    if (!tier2) {
      console.warn('  ⚠️  No available Tier 2 player found for Mickey');
    } else {
      console.log(`  Tier 2 player selected for Mickey: "${tier2.player_name || tier2.gp_name}"`);
      insertPick(LEAGUE_ID, tid, mickey.id, tier2, 2);
    }
  }

  // ── Trigger score sync ────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('\n── Triggering score sync ─────────────────────────────────');
    try {
      const result = await syncTournamentScores(tid, { silent: false });
      console.log('Sync result:', JSON.stringify(result));
    } catch (e) {
      console.error('Sync error:', e.message);
    }
  } else {
    console.log('\n[DRY RUN] Skipping sync. Run with --apply to trigger.');
  }

  console.log('\nDone.\n');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
