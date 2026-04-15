#!/usr/bin/env node
'use strict';
/**
 * truncate-stale-postgres.js — One-shot cleanup before DB_MODE=dual flip.
 *
 * Purges 6 Postgres tables whose row counts exceed SQLite due to stale
 * pre-dedup data left over from the initial backfill. TRUNCATE ... CASCADE
 * drops dependent rows in other tables too; re-running backfill-supabase.js
 * after this repopulates everything from the cleaned SQLite source.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const connStr = process.env.DATABASE_URL;
if (!connStr) { console.error('DATABASE_URL not set'); process.exit(1); }

const TABLES = [
  'golf_players',
  'pool_tier_players',
  'golf_scores',
  'news_articles',
  'player_stats',
  'players',
];

(async () => {
  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    const before = {};
    for (const t of TABLES) {
      const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      before[t] = r.rows[0].c;
    }
    console.log('Before:', before);

    // One TRUNCATE statement so CASCADE resolves inter-table FKs in one pass.
    const stmt = `TRUNCATE ${TABLES.join(', ')} CASCADE`;
    console.log('\nRunning:', stmt);
    await client.query(stmt);

    const after = {};
    for (const t of TABLES) {
      const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      after[t] = r.rows[0].c;
    }
    console.log('\nAfter:', after);

    console.log('\n✓ Truncate complete. Now re-run: node scripts/backfill-supabase.js');
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
