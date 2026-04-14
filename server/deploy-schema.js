/**
 * One-time script: deploy 001_initial_schema.sql to Supabase Postgres.
 * Run: node deploy-schema.js
 */
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');

const connStr = process.env.DATABASE_URL;
if (!connStr) { console.error('DATABASE_URL not set'); process.exit(1); }

const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

(async () => {
  // 1. Health check
  console.log('Connecting to Supabase Postgres...');
  const hc = await pool.query('SELECT current_database(), current_user, version()');
  console.log('Connected:', hc.rows[0].current_database, '| user:', hc.rows[0].current_user);
  console.log('PG version:', hc.rows[0].version.split(',')[0]);

  // 2. Deploy schema
  const sql = fs.readFileSync('../supabase/migrations/001_initial_schema.sql', 'utf-8');
  console.log('\nDeploying schema (001_initial_schema.sql)...');
  await pool.query(sql);
  console.log('Schema deployed successfully.');

  // 3. Count tables
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('\nTables created: ' + tables.rows.length);
  tables.rows.forEach((r, i) => console.log('  ' + (i + 1) + '. ' + r.table_name));

  // 4. Check custom indexes
  const indexes = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE 'idx_%'
    ORDER BY indexname
  `);
  console.log('\nCustom indexes: ' + indexes.rows.length);
  indexes.rows.forEach(r => console.log('  - ' + r.indexname));

  await pool.end();
  console.log('\nDone.');
})().catch(err => {
  console.error('ERROR:', err.message);
  pool.end();
  process.exit(1);
});
