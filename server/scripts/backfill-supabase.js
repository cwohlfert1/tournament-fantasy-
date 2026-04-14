#!/usr/bin/env node
/**
 * backfill-supabase.js — One-time data migration from SQLite → Supabase Postgres
 *
 * Reads all rows from every SQLite table and inserts them into the
 * corresponding Supabase table using ON CONFLICT DO NOTHING (idempotent).
 *
 * Usage:
 *   cd server && node scripts/backfill-supabase.js
 *
 * Environment:
 *   DATABASE_URL must be set (Supabase Postgres connection string)
 *
 * Safe to run multiple times — ON CONFLICT DO NOTHING prevents duplicates.
 * Processes tables in FK-safe order (parents before children).
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const sqliteDb = require('../db');
const { Pool } = require('pg');

const connStr = process.env.DATABASE_URL;
if (!connStr) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 15000,
});

// ── FK-safe table order: parents first, children after ──────────────────────
// Tables with no FK dependencies come first, then tables that reference them.
const TABLE_ORDER = [
  // ── Core (no FK) ──────────────────────────────────────────────────────────
  'users',
  'golf_tournaments',
  'golf_players',
  'player_master',
  'golf_espn_players',
  'migration_log',
  'promo_codes',
  'processed_webhook_orders',

  // ── Golf: depend on users + tournaments + players ─────────────────────────
  'golf_leagues',
  'golf_league_members',
  'golf_rosters',
  'golf_weekly_lineups',
  'golf_scores',
  'golf_draft_picks',
  'golf_faab_bids',
  'golf_core_players',
  'golf_auction_sessions',
  'golf_auction_bids',
  'golf_auction_budgets',
  'golf_tournament_fields',
  'golf_season_passes',
  'golf_pool_entries',
  'golf_comm_pro',
  'golf_referral_codes',
  'golf_referral_credits',
  'golf_referral_redemptions',
  'golf_user_profiles',
  'golf_waitlist',
  'golf_migrations',
  'pool_picks',
  'pool_tier_players',
  'pool_tiers',
  'pool_entry_paid',

  // ── Basketball: depend on users ───────────────────────────────────────────
  'leagues',
  'league_members',
  'players',
  'draft_picks',
  'games',
  'player_stats',
  'scoring_settings',
  'member_payments',
  'payouts',
  'referrals',
  'smart_draft_upgrades',
  'smart_draft_credits',
  'news_articles',

  // ── Chat / Wall / System ──────────────────────────────────────────────────
  'wall_posts',
  'wall_reactions',
  'wall_replies',
  'league_chat_messages',
  'commissioner_actions',
  'lock_emails_sent',
  'round_emails_sent',
  'reminder_emails_sent',
  'mass_email_log',
  'promo_code_uses',
];

// ── Convert ? params to $1, $2, ... ─────────────────────────────────────────
function parameterize(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// ── Get Postgres column names for a table ───────────────────────────────────
async function getPgColumns(table) {
  const result = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return result.rows.map(r => r.column_name);
}

// ── Get SQLite column names for a table ─────────────────────────────────────
function getSqliteColumns(table) {
  const cols = sqliteDb.prepare(`PRAGMA table_info("${table}")`).all();
  return cols.map(c => c.name);
}

// ── Backfill one table ──────────────────────────────────────────────────────
async function backfillTable(table) {
  // Get columns from both sides
  const sqliteCols = getSqliteColumns(table);
  const pgCols = await getPgColumns(table);

  if (pgCols.length === 0) {
    return { table, status: 'SKIP', reason: 'not in Postgres', inserted: 0, total: 0 };
  }

  // Only use columns that exist in BOTH databases
  const commonCols = sqliteCols.filter(c => pgCols.includes(c));
  if (commonCols.length === 0) {
    return { table, status: 'SKIP', reason: 'no common columns', inserted: 0, total: 0 };
  }

  // Read all rows from SQLite
  const colList = commonCols.join(', ');
  let rows;
  try {
    rows = sqliteDb.prepare(`SELECT ${colList} FROM "${table}"`).all();
  } catch (err) {
    return { table, status: 'ERROR', reason: `SQLite read: ${err.message}`, inserted: 0, total: 0 };
  }

  if (rows.length === 0) {
    return { table, status: 'OK', reason: 'empty', inserted: 0, total: 0 };
  }

  // Build INSERT with ON CONFLICT DO NOTHING
  const placeholders = commonCols.map((_, i) => `$${i + 1}`).join(', ');
  const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let inserted = 0;
  let errors = 0;
  const errorSamples = [];

  // Batch insert using a single Postgres client for efficiency
  const client = await pool.connect();
  try {
    // Process in chunks of 100 for large tables
    const CHUNK_SIZE = 100;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);

      // Use a transaction per chunk for atomicity
      await client.query('BEGIN');
      try {
        for (const row of chunk) {
          const values = commonCols.map(c => {
            const val = row[c];
            // Convert SQLite JSON strings that Postgres expects as JSONB
            if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
              try { JSON.parse(val); return val; } catch { return val; }
            }
            return val;
          });
          try {
            const result = await client.query(insertSql, values);
            inserted += result.rowCount;
          } catch (err) {
            errors++;
            if (errorSamples.length < 3) {
              errorSamples.push(err.message);
            }
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        errors += chunk.length;
        if (errorSamples.length < 3) {
          errorSamples.push(`Chunk rollback: ${err.message}`);
        }
      }
    }
  } finally {
    client.release();
  }

  const status = errors > 0 ? 'PARTIAL' : 'OK';
  return {
    table, status, inserted, total: rows.length, errors,
    errorSamples: errorSamples.length > 0 ? errorSamples : undefined,
    skippedCols: sqliteCols.filter(c => !pgCols.includes(c)),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('=== SQLite → Supabase Backfill ===');
  console.log('');

  // Health check
  try {
    await pool.query('SELECT 1');
    console.log('Postgres connection: OK');
  } catch (err) {
    console.error('Postgres connection FAILED:', err.message);
    process.exit(1);
  }

  // Discover any SQLite tables not in our ordered list
  const allSqliteTables = sqliteDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name"
  ).all().map(t => t.name);

  const missing = allSqliteTables.filter(t => !TABLE_ORDER.includes(t));
  if (missing.length > 0) {
    console.log(`\nWARNING: ${missing.length} SQLite tables not in backfill order: ${missing.join(', ')}`);
    console.log('These will be processed at the end.\n');
  }

  const tablesToProcess = [...TABLE_ORDER, ...missing];
  const results = [];
  let totalInserted = 0;
  let totalRows = 0;
  let tableErrors = 0;

  console.log('');
  for (const table of tablesToProcess) {
    // Skip if table doesn't exist in SQLite
    if (!allSqliteTables.includes(table)) {
      continue;
    }

    process.stdout.write(`  ${table}... `);
    const result = await backfillTable(table);
    results.push(result);

    totalInserted += result.inserted;
    totalRows += result.total;
    if (result.errors > 0) tableErrors++;

    if (result.total === 0) {
      console.log('empty');
    } else if (result.status === 'OK') {
      console.log(`${result.inserted}/${result.total} rows inserted`);
    } else if (result.status === 'PARTIAL') {
      console.log(`${result.inserted}/${result.total} rows (${result.errors} errors)`);
      if (result.errorSamples) {
        result.errorSamples.forEach(e => console.log(`    ERROR: ${e}`));
      }
    } else if (result.status === 'SKIP') {
      console.log(`SKIPPED: ${result.reason}`);
    } else {
      console.log(`ERROR: ${result.reason}`);
    }

    if (result.skippedCols && result.skippedCols.length > 0) {
      console.log(`    (skipped SQLite-only cols: ${result.skippedCols.join(', ')})`);
    }
  }

  // ── Verification: compare row counts ────────────────────────────────────
  console.log('\n=== Row Count Verification ===\n');
  let mismatches = 0;

  for (const table of allSqliteTables) {
    const sqliteCount = sqliteDb.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c;
    let pgCount = 0;
    try {
      const r = await pool.query(`SELECT COUNT(*) as c FROM "${table}"`);
      pgCount = parseInt(r.rows[0].c);
    } catch {
      pgCount = -1; // table doesn't exist in PG
    }

    const match = sqliteCount === pgCount;
    if (!match && sqliteCount > 0) {
      mismatches++;
      console.log(`  ✗ ${table}: SQLite=${sqliteCount} Postgres=${pgCount}`);
    } else if (sqliteCount > 0) {
      console.log(`  ✓ ${table}: ${sqliteCount} rows`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  console.log(`Tables processed: ${results.length}`);
  console.log(`Total rows read:  ${totalRows}`);
  console.log(`Total inserted:   ${totalInserted}`);
  console.log(`Tables with errors: ${tableErrors}`);
  console.log(`Row count mismatches (non-empty): ${mismatches}`);

  if (mismatches > 0) {
    console.log('\n⚠ Some row counts do not match — check errors above.');
  } else if (totalRows > 0) {
    console.log('\n✓ All non-empty tables match between SQLite and Postgres.');
  } else {
    console.log('\n(No data to backfill — SQLite tables are empty)');
  }

  await pool.end();
  process.exit(mismatches > 0 || tableErrors > 0 ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  pool.end();
  process.exit(1);
});
