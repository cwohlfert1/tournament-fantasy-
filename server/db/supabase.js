/**
 * supabase.js — PostgreSQL connection via node-postgres (pg)
 *
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to connect to
 * the Supabase Postgres instance directly. No supabase-js SDK —
 * raw SQL for maximum compatibility with existing queries.
 *
 * The connection string is derived from SUPABASE_URL:
 *   https://xxxx.supabase.co → postgres://postgres:[key]@db.xxxx.supabase.co:5432/postgres
 *
 * Or use DATABASE_URL directly if set (overrides SUPABASE_URL).
 */

'use strict';

const { Pool } = require('pg');

let _pool = null;

function getConnectionString() {
  // Prefer explicit DATABASE_URL (standard Postgres connection string)
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  // Extract project ref from SUPABASE_URL: https://xxxx.supabase.co
  const match = url.match(/https:\/\/(.+?)\.supabase\.co/);
  if (!match) {
    console.error('[supabase] Cannot parse SUPABASE_URL — expected https://xxxx.supabase.co');
    return null;
  }
  const projectRef = match[1];

  // Supabase Postgres connection string format
  return `postgresql://postgres.${projectRef}:${key}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
}

function initPool() {
  if (_pool) return _pool;

  const connStr = getConnectionString();
  if (!connStr) {
    console.warn('[supabase] No Supabase/Postgres credentials found — Postgres unavailable');
    console.warn('[supabase]   Set DATABASE_URL or both SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }

  _pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    max: 10,                            // Max connections in pool
    idleTimeoutMillis: 30000,           // Close idle connections after 30s
    connectionTimeoutMillis: 10000,     // Fail connection after 10s
  });

  // Log connection status
  _pool.on('error', (err) => {
    console.error('[supabase] Unexpected pool error:', err.message);
  });

  console.log('[supabase] PostgreSQL pool initialized');
  return _pool;
}

/**
 * Execute a raw SQL query against Supabase Postgres.
 * @param {string} sql - SQL with $1, $2, ... parameters
 * @param {Array} params - Parameter values
 * @returns {Promise<{rows: Array, rowCount: number}>}
 */
async function query(sql, params = []) {
  const pool = initPool();
  if (!pool) throw new Error('Supabase Postgres not configured');
  return pool.query(sql, params);
}

/**
 * Get a single client from the pool (for transactions).
 * Caller MUST call client.release() when done.
 */
async function getClient() {
  const pool = initPool();
  if (!pool) throw new Error('Supabase Postgres not configured');
  return pool.connect();
}

/**
 * Check if Supabase Postgres is configured and reachable.
 */
async function healthCheck() {
  try {
    const pool = initPool();
    if (!pool) return { ok: false, reason: 'not_configured' };
    const result = await pool.query('SELECT 1 AS ok');
    return { ok: true, rows: result.rows[0] };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { query, getClient, healthCheck, initPool };
