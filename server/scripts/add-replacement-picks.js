#!/usr/bin/env node
/**
 * One-time fix: Add replacement picks for teams affected by Si Woo Kim removal.
 *
 * League: ff568722-fbe9-4695-86a8-a31287c22841
 *
 * EXACT assignments (each team is missing a DIFFERENT tier):
 *
 *   TIER 1 replacements:
 *     Nbrawley      → Chris Gotterup  (T1)
 *     Wb0312        → Chris Gotterup  (T1)
 *     bradenmorrow24 → Min Woo Lee    (T1)
 *     Bencanada17   → Min Woo Lee     (T1)
 *     Mickey        → Chris Gotterup  (T1) + best available T2 (see below)
 *
 *   TIER 2 replacements (best available T2 not already on that team):
 *     Jacob Robinson  (Jrob8)
 *     MGhegan
 *     ryanusc3
 *     iconnelly
 *     Jdpack
 *     lukepaff
 *     Chiggins93
 *     Mickey          (also needs T2 in addition to Gotterup T1)
 *
 *   Suggested T2 order of preference: Hojgaard → Davis Riley → Corey Conners
 *   (script picks best available per team by odds_decimal, ascending)
 *
 *   DO NOT TOUCH: Patster7 (Fore Play champion), Chrischapchap (Chap)
 *
 * Usage:
 *   node scripts/add-replacement-picks.js           # dry run — shows plan, no writes
 *   node scripts/add-replacement-picks.js --apply   # commits inserts + triggers sync
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const db   = require('./db');
const { v4: uuidv4 } = require('uuid');
const { syncTournamentScores } = require('./golfSyncService');

const LEAGUE_ID = 'ff568722-fbe9-4695-86a8-a31287c22841';
const DRY_RUN   = !process.argv.includes('--apply');

// ── Helpers ───────────────────────────────────────────────────────────────────

function findUser(username) {
  return (
    db.prepare('SELECT * FROM users WHERE username = ?').get(username) ||
    db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username)
  );
}

function userPicks(userId, tid) {
  return db.prepare(
    'SELECT * FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ?'
  ).all(LEAGUE_ID, tid, userId);
}

function normName(n) {
  return (n || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function findPoolPlayer(tid, searchName) {
  const target = normName(searchName);
  return db.prepare(`
    SELECT ptp.*, COALESCE(ptp.player_name, gp.name) AS display_name
    FROM pool_tier_players ptp
    LEFT JOIN golf_players gp ON gp.id = ptp.player_id
    WHERE ptp.league_id = ? AND ptp.tournament_id = ?
  `).all(LEAGUE_ID, tid).find(p =>
    normName(p.player_name).includes(target) || normName(p.display_name).includes(target)
  );
}

// Best available T2 player not already in this user's picks (sorted by odds_decimal asc)
function bestAvailableT2(tid, existingPlayerIds) {
  const allT2 = db.prepare(`
    SELECT ptp.*, COALESCE(ptp.player_name, gp.name) AS display_name
    FROM pool_tier_players ptp
    LEFT JOIN golf_players gp ON gp.id = ptp.player_id
    WHERE ptp.league_id = ? AND ptp.tournament_id = ? AND ptp.tier_number = 2
      AND COALESCE(ptp.is_withdrawn, 0) = 0
    ORDER BY COALESCE(ptp.odds_decimal, 999) ASC
  `).all(LEAGUE_ID, tid);
  return allT2.find(p => !existingPlayerIds.has(p.player_id));
}

function insertPick(tid, userId, player, tierNumber, label) {
  const name = player.display_name || player.player_name;
  if (DRY_RUN) {
    console.log(`  [DRY RUN]  ${label}: would add "${name}" (T${tierNumber})`);
    return false;
  }
  db.prepare(`
    INSERT OR IGNORE INTO pool_picks
      (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, salary_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(uuidv4(), LEAGUE_ID, tid, userId, player.player_id, name, tierNumber);
  console.log(`  ✅  ${label}: inserted "${name}" (T${tierNumber})`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN
    ? '\n⚠️  DRY RUN — no changes will be made. Pass --apply to commit.\n'
    : '\n🚀  APPLY MODE — changes will be written to DB.\n'
  );

  const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(LEAGUE_ID);
  if (!league) { console.error('❌  League not found:', LEAGUE_ID); process.exit(1); }

  const tid = league.pool_tournament_id;
  if (!tid) { console.error('❌  No tournament linked to league'); process.exit(1); }

  console.log(`League : "${league.name}"`);
  console.log(`Tourney: ${tid}\n`);

  // ── Look up T1 replacement players ────────────────────────────────────────
  const gotterup  = findPoolPlayer(tid, 'gotterup');
  const minWooLee = findPoolPlayer(tid, 'min woo');

  if (!gotterup)  { console.error('❌  Chris Gotterup not found in pool_tier_players'); process.exit(1); }
  if (!minWooLee) { console.error('❌  Min Woo Lee not found in pool_tier_players');    process.exit(1); }

  console.log('T1 replacement players found:');
  console.log(`  Gotterup    : "${gotterup.display_name}"  tier=${gotterup.tier_number}  id=${gotterup.player_id}`);
  console.log(`  Min Woo Lee : "${minWooLee.display_name}" tier=${minWooLee.tier_number} id=${minWooLee.player_id}`);
  console.log('');

  // ── T1 replacements ───────────────────────────────────────────────────────
  const t1Teams = [
    { username: 'Nbrawley',       player: gotterup  },
    { username: 'Wb0312',         player: gotterup  },
    { username: 'bradenmorrow24', player: minWooLee },
    { username: 'Bencanada17',    player: minWooLee },
  ];

  console.log('── Tier 1 replacements ────────────────────────────────────');
  for (const { username, player } of t1Teams) {
    const user = findUser(username);
    if (!user) { console.warn(`  ⚠️  User not found: "${username}" — skipping`); continue; }

    const existing = userPicks(user.id, tid);
    const alreadyHas = existing.some(p => p.player_id === player.player_id);
    console.log(`\n  ${username} (${existing.length} picks)`);

    if (alreadyHas) {
      console.log(`  ↩️  Already has "${player.display_name}" — skipping`);
    } else {
      insertPick(tid, user.id, player, player.tier_number, username);
    }
  }

  // ── T2 replacements ───────────────────────────────────────────────────────
  // These usernames try the listed name first, then the alternative in parens.
  const t2Teams = [
    { username: 'Jrob8',      alt: 'Jacob Robinson' },
    { username: 'MGhegan' },
    { username: 'ryanusc3' },
    { username: 'iconnelly' },
    { username: 'Jdpack' },
    { username: 'lukepaff' },
    { username: 'Chiggins93' },
  ];

  console.log('\n── Tier 2 replacements ────────────────────────────────────');
  for (const { username, alt } of t2Teams) {
    const user = findUser(username) || (alt ? findUser(alt) : null);
    const resolvedName = user ? username : (alt || username);
    if (!user) { console.warn(`  ⚠️  User not found: "${username}"${alt ? ` / "${alt}"` : ''} — skipping`); continue; }

    const existing    = userPicks(user.id, tid);
    const existingIds = new Set(existing.map(p => p.player_id));
    const t2          = bestAvailableT2(tid, existingIds);
    console.log(`\n  ${resolvedName} (${existing.length} picks)`);

    if (!t2) {
      console.warn(`  ⚠️  No available T2 player found for ${resolvedName}`);
    } else {
      insertPick(tid, user.id, t2, 2, resolvedName);
    }
  }

  // ── Mickey — T1 (Gotterup) + T2 ───────────────────────────────────────────
  console.log('\n── Mickey (T1 Gotterup + T2) ──────────────────────────────');
  const mickey = findUser('Mickey');
  if (!mickey) {
    console.warn('  ⚠️  User "Mickey" not found — skipping');
  } else {
    const existing    = userPicks(mickey.id, tid);
    const existingIds = new Set(existing.map(p => p.player_id));
    console.log(`\n  Mickey (${existing.length} picks)`);

    // T1: Gotterup
    if (existingIds.has(gotterup.player_id)) {
      console.log(`  ↩️  Already has "${gotterup.display_name}" — skipping T1`);
    } else {
      insertPick(tid, mickey.id, gotterup, gotterup.tier_number, 'Mickey T1');
      existingIds.add(gotterup.player_id); // track for T2 check
    }

    // T2: best available
    const t2 = bestAvailableT2(tid, existingIds);
    if (!t2) {
      console.warn('  ⚠️  No available T2 player for Mickey');
    } else {
      insertPick(tid, mickey.id, t2, 2, 'Mickey T2');
    }
  }

  // ── Score sync ────────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log('\n── Triggering score sync ──────────────────────────────────');
    try {
      const result = await syncTournamentScores(tid, { silent: false });
      console.log('Sync result:', JSON.stringify(result));
    } catch (e) {
      console.error('Sync error:', e.message);
    }
  } else {
    console.log('\n[DRY RUN] Skipping sync — run with --apply to commit and sync.');
  }

  console.log('\nDone.\n');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
