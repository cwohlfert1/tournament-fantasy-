#!/usr/bin/env node
/**
 * reset-and-backfill.js — TRUNCATE all Postgres tables, fix drift tables,
 * then run the backfill cleanly against production SQLite.
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { spawn } = require('child_process');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

(async () => {
  console.log('=== STEP 1: Truncate all Postgres tables ===\n');
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  // Truncate all with CASCADE to handle FK constraints
  const tableNames = tables.rows.map(r => `"${r.table_name}"`).join(', ');
  await pool.query(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE`);
  console.log(`Truncated ${tables.rows.length} tables.\n`);

  console.log('=== STEP 2: Fix drift tables to match SQLite schemas ===\n');

  // golf_user_profiles: SQLite (user_id PK, profile_complete, completed_at)
  await pool.query(`DROP TABLE IF EXISTS golf_user_profiles CASCADE`);
  await pool.query(`
    CREATE TABLE golf_user_profiles (
      user_id TEXT PRIMARY KEY,
      profile_complete INTEGER DEFAULT 0,
      completed_at TEXT
    )
  `);
  console.log('✓ golf_user_profiles recreated');

  // golf_comm_pro: SQLite (id PK, league_id, commissioner_id, season, paid_at, promo_applied, stripe_session_id)
  await pool.query(`DROP TABLE IF EXISTS golf_comm_pro CASCADE`);
  await pool.query(`
    CREATE TABLE golf_comm_pro (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      commissioner_id TEXT NOT NULL,
      season TEXT NOT NULL,
      paid_at TEXT,
      promo_applied INTEGER DEFAULT 0,
      stripe_session_id TEXT
    )
  `);
  console.log('✓ golf_comm_pro recreated');

  // golf_migrations: SQLite (id PK, league_id, commissioner_id, member_count_at_promo, promo_applied, source_platform, created_at)
  await pool.query(`DROP TABLE IF EXISTS golf_migrations CASCADE`);
  await pool.query(`
    CREATE TABLE golf_migrations (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      commissioner_id TEXT NOT NULL,
      member_count_at_promo INTEGER,
      promo_applied INTEGER DEFAULT 0,
      source_platform TEXT,
      created_at TEXT
    )
  `);
  console.log('✓ golf_migrations recreated');

  await pool.end();
  console.log('\n=== STEP 3: Run backfill against production SQLite ===\n');

  // Spawn the backfill script with the production DB path
  const child = spawn('node', ['scripts/backfill-supabase.js'], {
    env: { ...process.env, DATABASE_PATH: './data/fantasy-prod.db' },
    stdio: 'inherit',
  });

  child.on('close', code => process.exit(code));
})().catch(err => {
  console.error('FATAL:', err.message);
  pool.end();
  process.exit(1);
});
