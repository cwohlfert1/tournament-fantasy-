/**
 * Phase 3 Dual-Write Validation Script
 *
 * Tests 15 write operations across different tables to verify that
 * DB_MODE=dual correctly writes to BOTH SQLite AND Supabase Postgres.
 *
 * Run: DB_MODE=dual node test-dual-write.js
 */
require('dotenv').config();

// Force dual mode for this test
process.env.DB_MODE = 'dual';

const db = require('./db/index');
const pg = require('./db/supabase');
const { v4: uuidv4 } = require('uuid');

const TEST_PREFIX = 'DUALTEST_';
const testIds = [];
let passed = 0;
let failed = 0;
const failures = [];

async function verify(testName, table, idCol, idVal) {
  // Check SQLite
  const sqliteRow = await db.get(`SELECT * FROM ${table} WHERE ${idCol} = ?`, idVal);

  // Check Postgres (need small delay for async fire-and-forget writes)
  await new Promise(r => setTimeout(r, 500));
  const pgResult = await pg.query(`SELECT * FROM ${table} WHERE ${idCol} = $1`, [idVal]);
  const pgRow = pgResult.rows[0];

  const sqliteOk = !!sqliteRow;
  const pgOk = !!pgRow;

  if (sqliteOk && pgOk) {
    console.log(`  ✓ ${testName} — SQLite: YES | Postgres: YES`);
    passed++;
  } else {
    const msg = `  ✗ ${testName} — SQLite: ${sqliteOk ? 'YES' : 'NO'} | Postgres: ${pgOk ? 'YES' : 'NO'}`;
    console.log(msg);
    failed++;
    failures.push({ testName, sqliteOk, pgOk });
  }
}

async function verifyUpdate(testName, table, idCol, idVal, checkCol, expectedVal) {
  await new Promise(r => setTimeout(r, 500));
  const pgResult = await pg.query(`SELECT ${checkCol} FROM ${table} WHERE ${idCol} = $1`, [idVal]);
  const pgVal = pgResult.rows[0]?.[checkCol];
  const sqliteRow = await db.get(`SELECT ${checkCol} FROM ${table} WHERE ${idCol} = ?`, idVal);
  const sqliteVal = sqliteRow?.[checkCol];

  const sqliteOk = String(sqliteVal) === String(expectedVal);
  const pgOk = String(pgVal) === String(expectedVal);

  if (sqliteOk && pgOk) {
    console.log(`  ✓ ${testName} — SQLite: ${sqliteVal} | Postgres: ${pgVal}`);
    passed++;
  } else {
    const msg = `  ✗ ${testName} — SQLite: ${sqliteVal} (${sqliteOk ? 'OK' : 'WRONG'}) | Postgres: ${pgVal} (${pgOk ? 'OK' : 'WRONG'})`;
    console.log(msg);
    failed++;
    failures.push({ testName, sqliteOk, pgOk, sqliteVal, pgVal, expectedVal });
  }
}

async function verifyDelete(testName, table, idCol, idVal) {
  await new Promise(r => setTimeout(r, 500));
  const sqliteRow = await db.get(`SELECT * FROM ${table} WHERE ${idCol} = ?`, idVal);
  const pgResult = await pg.query(`SELECT * FROM ${table} WHERE ${idCol} = $1`, [idVal]);

  const sqliteGone = !sqliteRow;
  const pgGone = pgResult.rows.length === 0;

  if (sqliteGone && pgGone) {
    console.log(`  ✓ ${testName} — SQLite: DELETED | Postgres: DELETED`);
    passed++;
  } else {
    const msg = `  ✗ ${testName} — SQLite: ${sqliteGone ? 'DELETED' : 'STILL EXISTS'} | Postgres: ${pgGone ? 'DELETED' : 'STILL EXISTS'}`;
    console.log(msg);
    failed++;
    failures.push({ testName, sqliteGone, pgGone });
  }
}

(async () => {
  console.log('=== Phase 3 Dual-Write Validation ===');
  console.log(`DB_MODE: ${process.env.DB_MODE}`);
  console.log('');

  // Verify Postgres connection first
  const health = await pg.healthCheck();
  if (!health.ok) {
    console.error('Postgres health check FAILED:', health.reason);
    process.exit(1);
  }
  console.log('Postgres connection: OK');
  console.log('');

  // ─── TEST 1: INSERT into users ───────────────────────────────────────────
  console.log('Test 1: INSERT into users');
  const userId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'users', col: 'id', val: userId });
  await db.run(`
    INSERT INTO users (id, email, username, password_hash)
    VALUES (?, ?, ?, ?)
  `, userId, `${TEST_PREFIX}test@example.com`, `${TEST_PREFIX}testuser`, 'hash_placeholder');
  await verify('INSERT user', 'users', 'id', userId);

  // ─── TEST 2: UPDATE users ───────────────────────────────────────────────
  console.log('Test 2: UPDATE users');
  await db.run('UPDATE users SET full_name = ? WHERE id = ?', 'Dual Write Test', userId);
  await verifyUpdate('UPDATE user full_name', 'users', 'id', userId, 'full_name', 'Dual Write Test');

  // ─── TEST 3: INSERT into golf_tournaments ────────────────────────────────
  console.log('Test 3: INSERT into golf_tournaments');
  const tournId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'golf_tournaments', col: 'id', val: tournId });
  await db.run(`
    INSERT INTO golf_tournaments (id, name, start_date, end_date, status, par)
    VALUES (?, ?, ?, ?, ?, ?)
  `, tournId, 'Dual Write Test Open', '2026-12-01', '2026-12-04', 'scheduled', 72);
  await verify('INSERT tournament', 'golf_tournaments', 'id', tournId);

  // ─── TEST 4: INSERT into golf_players ────────────────────────────────────
  console.log('Test 4: INSERT into golf_players');
  const playerId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'golf_players', col: 'id', val: playerId });
  await db.run(`
    INSERT INTO golf_players (id, name, country, world_ranking)
    VALUES (?, ?, ?, ?)
  `, playerId, 'Test Player DualWrite', 'US', 999);
  await verify('INSERT golf_player', 'golf_players', 'id', playerId);

  // ─── TEST 5: INSERT into golf_leagues ────────────────────────────────────
  console.log('Test 5: INSERT into golf_leagues');
  const leagueId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'golf_leagues', col: 'id', val: leagueId });
  await db.run(`
    INSERT INTO golf_leagues (id, name, commissioner_id, invite_code, pool_tournament_id)
    VALUES (?, ?, ?, ?, ?)
  `, leagueId, 'DualWrite Test League', userId, TEST_PREFIX + 'INV123', tournId);
  await verify('INSERT golf_league', 'golf_leagues', 'id', leagueId);

  // ─── TEST 6: INSERT into golf_league_members ─────────────────────────────
  console.log('Test 6: INSERT into golf_league_members');
  const memberId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'golf_league_members', col: 'id', val: memberId });
  await db.run(`
    INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name)
    VALUES (?, ?, ?, ?)
  `, memberId, leagueId, userId, 'Test Team DualWrite');
  await verify('INSERT golf_league_member', 'golf_league_members', 'id', memberId);

  // ─── TEST 7: INSERT into golf_scores ─────────────────────────────────────
  console.log('Test 7: INSERT into golf_scores');
  const scoreId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'golf_scores', col: 'id', val: scoreId });
  await db.run(`
    INSERT INTO golf_scores (id, tournament_id, player_id, round1, round2, made_cut, fantasy_points)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, scoreId, tournId, playerId, 68, 71, 1, 15.5);
  await verify('INSERT golf_score', 'golf_scores', 'id', scoreId);

  // ─── TEST 8: INSERT into pool_picks ──────────────────────────────────────
  console.log('Test 8: INSERT into pool_picks');
  const pickId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'pool_picks', col: 'id', val: pickId });
  await db.run(`
    INSERT INTO pool_picks (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, entry_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, pickId, leagueId, tournId, userId, playerId, 'Test Player DualWrite', 1, 1);
  await verify('INSERT pool_pick', 'pool_picks', 'id', pickId);

  // ─── TEST 9: INSERT into pool_tier_players ───────────────────────────────
  console.log('Test 9: INSERT into pool_tier_players');
  const ptpId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'pool_tier_players', col: 'id', val: ptpId });
  await db.run(`
    INSERT INTO pool_tier_players (id, league_id, tournament_id, player_id, player_name, tier_number, odds_display)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ptpId, leagueId, tournId, playerId, 'Test Player DualWrite', 1, '+500');
  await verify('INSERT pool_tier_player', 'pool_tier_players', 'id', ptpId);

  // ─── TEST 10: INSERT into news_articles ──────────────────────────────────
  console.log('Test 10: INSERT into news_articles');
  const articleId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'news_articles', col: 'id', val: articleId });
  await db.run(`
    INSERT INTO news_articles (id, title, url, source)
    VALUES (?, ?, ?, ?)
  `, articleId, 'DualWrite Test Article', `https://test.com/${TEST_PREFIX}`, 'test');
  await verify('INSERT news_article', 'news_articles', 'id', articleId);

  // ─── TEST 11: Transaction — INSERT into wall_posts ───────────────────────
  console.log('Test 11: Transaction — INSERT into wall_posts');
  const postId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'wall_posts', col: 'id', val: postId });
  await db.transaction(async (tx) => {
    await tx.run(`
      INSERT INTO wall_posts (id, league_id, user_id, text, is_system)
      VALUES (?, ?, ?, ?, ?)
    `, postId, leagueId, userId, 'DualWrite transaction test', 0);
  });
  await verify('TRANSACTION INSERT wall_post', 'wall_posts', 'id', postId);

  // ─── TEST 12: INSERT into commissioner_actions ───────────────────────────
  console.log('Test 12: INSERT into commissioner_actions');
  const actionId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'commissioner_actions', col: 'id', val: actionId });
  await db.run(`
    INSERT INTO commissioner_actions (id, league_id, commissioner_id, action, details)
    VALUES (?, ?, ?, ?, ?)
  `, actionId, leagueId, userId, 'dual_write_test', 'Testing Phase 3');
  await verify('INSERT commissioner_action', 'commissioner_actions', 'id', actionId);

  // ─── TEST 13: UPDATE golf_tournaments ────────────────────────────────────
  console.log('Test 13: UPDATE golf_tournaments');
  await db.run('UPDATE golf_tournaments SET status = ? WHERE id = ?', 'active', tournId);
  await verifyUpdate('UPDATE tournament status', 'golf_tournaments', 'id', tournId, 'status', 'active');

  // ─── TEST 14: INSERT into golf_tournament_fields ─────────────────────────
  console.log('Test 14: INSERT into golf_tournament_fields');
  const fieldId = TEST_PREFIX + uuidv4();
  testIds.push({ table: 'golf_tournament_fields', col: 'id', val: fieldId });
  await db.run(`
    INSERT INTO golf_tournament_fields (id, tournament_id, player_name, player_id, world_ranking)
    VALUES (?, ?, ?, ?, ?)
  `, fieldId, tournId, 'Test Player DualWrite', playerId, 999);
  await verify('INSERT tournament_field', 'golf_tournament_fields', 'id', fieldId);

  // ─── TEST 15: DELETE from news_articles ──────────────────────────────────
  console.log('Test 15: DELETE from news_articles');
  await db.run('DELETE FROM news_articles WHERE id = ?', articleId);
  await verifyDelete('DELETE news_article', 'news_articles', 'id', articleId);
  // Remove from cleanup list since already deleted
  const artIdx = testIds.findIndex(t => t.val === articleId);
  if (artIdx >= 0) testIds.splice(artIdx, 1);

  // ─── RESULTS ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('=== RESULTS ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);
  if (failures.length > 0) {
    console.log('');
    console.log('Failed tests:');
    failures.forEach(f => console.log(`  - ${f.testName}`));
  }

  // ─── CLEANUP ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('Cleaning up test data...');

  // Delete in reverse order to respect foreign keys
  const cleanupOrder = [
    'golf_tournament_fields', 'wall_posts', 'commissioner_actions',
    'pool_tier_players', 'pool_picks', 'golf_scores',
    'golf_league_members', 'golf_leagues', 'golf_players',
    'golf_tournaments', 'news_articles', 'users'
  ];

  for (const table of cleanupOrder) {
    const items = testIds.filter(t => t.table === table);
    for (const { col, val } of items) {
      try {
        await db.run(`DELETE FROM ${table} WHERE ${col} = ?`, val);
        // Also clean from Postgres
        await pg.query(`DELETE FROM ${table} WHERE ${col} = $1`, [val]);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
  console.log('Cleanup complete.');

  // Exit
  process.exit(failed > 0 ? 1 : 0);
})().catch(err => {
  console.error('FATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
