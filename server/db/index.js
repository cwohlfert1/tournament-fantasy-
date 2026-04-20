/**
 * db/index.js — Unified database abstraction layer
 *
 * Wraps both SQLite (better-sqlite3) and PostgreSQL (node-postgres) behind
 * a single async interface. Controlled by the DB_MODE environment variable:
 *
 *   DB_MODE=sqlite   (default) — all reads/writes go to SQLite
 *   DB_MODE=dual     — writes go to BOTH SQLite + Postgres, reads from SQLite
 *   DB_MODE=supabase — all reads/writes go to Postgres only
 *
 * Phase 1: this file is NOT imported by any existing code.
 *          It sits ready for Phase 2 when we switch require('./db') calls.
 * Phase 2: replace require('./db') with require('./db/index') in all 46 files.
 * Phase 3: set DB_MODE=dual for parallel validation.
 * Phase 4: set DB_MODE=supabase for full cutover.
 *
 * IMPORTANT: The existing server/db.js is UNTOUCHED. This is a new file.
 */

'use strict';

const DB_MODE = process.env.DB_MODE || 'sqlite';

// ── SQLite (existing) ────────────────────────────────────────────────────────
// Lazy-loaded so this module can be required even if better-sqlite3 isn't needed.
let _sqlite = null;
function getSqlite() {
  if (!_sqlite) _sqlite = require('../db'); // existing better-sqlite3 Database object
  return _sqlite;
}

// ── Postgres (Supabase) ──────────────────────────────────────────────────────
const pg = require('./supabase');

// ── Parameter translation ────────────────────────────────────────────────────
// SQLite uses ? for positional params. Postgres uses $1, $2, $3.
// Convert: "WHERE id = ? AND name = ?" → "WHERE id = $1 AND name = $2"
function sqliteToPostgres(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// ── Startup logging ──────────────────────────────────────────────────────────
console.log(`[db-layer] Mode: ${DB_MODE}`);
if (DB_MODE === 'dual' || DB_MODE === 'supabase') {
  pg.healthCheck().then(h => {
    if (h.ok) console.log('[db-layer] Postgres connection: OK');
    else console.error('[db-layer] Postgres connection FAILED:', h.reason);
  });
}

// ============================================================================
// PUBLIC API — all methods are async
// ============================================================================

/**
 * Execute a query and return ALL matching rows.
 * Equivalent to better-sqlite3's db.prepare(sql).all(...params)
 *
 * @param {string} sql - SQL with ? params (auto-converted to $N for Postgres)
 * @param {...any} params - Parameter values
 * @returns {Promise<Array<Object>>}
 */
async function all(sql, ...params) {
  if (DB_MODE === 'sqlite' || DB_MODE === 'dual') {
    const rows = getSqlite().prepare(sql).all(...params);

    // Dual mode: also write to Postgres (non-blocking, fire-and-forget for reads)
    if (DB_MODE === 'dual' && isWriteQuery(sql)) {
      pgWrite(sql, params).catch(err =>
        console.error('[db-layer] Postgres dual-write failed:', err.message)
      );
    }

    return rows;
  }

  // Supabase-only mode — translate SQL before sending
  const result = await pg.query(sqliteSqlToPostgres(sql), params);
  return result.rows;
}

/**
 * Execute a query and return the FIRST row (or undefined).
 * Equivalent to better-sqlite3's db.prepare(sql).get(...params)
 *
 * @param {string} sql - SQL with ? params
 * @param {...any} params - Parameter values
 * @returns {Promise<Object|undefined>}
 */
async function get(sql, ...params) {
  if (DB_MODE === 'sqlite' || DB_MODE === 'dual') {
    const row = getSqlite().prepare(sql).get(...params);

    if (DB_MODE === 'dual' && isWriteQuery(sql)) {
      pgWrite(sql, params).catch(err =>
        console.error('[db-layer] Postgres dual-write failed:', err.message)
      );
    }

    return row;
  }

  const result = await pg.query(sqliteSqlToPostgres(sql), params);
  return result.rows[0];
}

/**
 * Execute a write query (INSERT, UPDATE, DELETE).
 * Equivalent to better-sqlite3's db.prepare(sql).run(...params)
 *
 * @param {string} sql - SQL with ? params
 * @param {...any} params - Parameter values
 * @returns {Promise<{changes: number}>}
 */
async function run(sql, ...params) {
  if (DB_MODE === 'sqlite' || DB_MODE === 'dual') {
    const result = getSqlite().prepare(sql).run(...params);

    if (DB_MODE === 'dual') {
      pgWrite(sql, params).catch(err =>
        console.error('[db-layer] Postgres dual-write failed:', err.message)
      );
    }

    return { changes: result.changes };
  }

  const result = await pg.query(sqliteSqlToPostgres(sql), params);
  return { changes: result.rowCount };
}

/**
 * Execute a function inside a transaction.
 * In SQLite: uses db.transaction() (synchronous).
 * In Postgres: uses BEGIN/COMMIT/ROLLBACK (async).
 *
 * @param {Function} fn - async function receiving a transaction context
 * @returns {Promise<any>}
 */
async function transaction(fn) {
  if (DB_MODE === 'sqlite' || DB_MODE === 'dual') {
    // SQLite transactions are synchronous — wrap in a promise
    // Collect queries for dual-mode replay
    const queryLog = [];
    const sqliteResult = getSqlite().transaction(() => fn({
      run: (sql, ...p) => {
        if (DB_MODE === 'dual') queryLog.push({ sql, params: p });
        return getSqlite().prepare(sql).run(...p);
      },
      get: (sql, ...p) => {
        if (DB_MODE === 'dual') queryLog.push({ sql, params: p });
        return getSqlite().prepare(sql).get(...p);
      },
      all: (sql, ...p) => {
        if (DB_MODE === 'dual') queryLog.push({ sql, params: p });
        return getSqlite().prepare(sql).all(...p);
      },
    }))();

    // Dual mode: replay captured queries on Postgres (best-effort, non-blocking)
    if (DB_MODE === 'dual' && queryLog.length > 0) {
      pgReplayTransaction(queryLog).catch(err =>
        console.error('[db-layer] Postgres transaction replay failed:', err.message)
      );
    }

    return sqliteResult;
  }

  // Supabase-only: full async transaction
  const client = await pg.getClient();
  try {
    await client.query('BEGIN');
    const result = await fn({
      run: async (sql, ...p) => {
        const r = await client.query(sqliteToPostgres(sql), p);
        return { changes: r.rowCount };
      },
      get: async (sql, ...p) => {
        const r = await client.query(sqliteToPostgres(sql), p);
        return r.rows[0];
      },
      all: async (sql, ...p) => {
        const r = await client.query(sqliteToPostgres(sql), p);
        return r.rows;
      },
    });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute raw SQL (no params). For DDL statements like CREATE TABLE.
 * Equivalent to better-sqlite3's db.exec(sql)
 */
async function exec(sql) {
  if (DB_MODE === 'sqlite' || DB_MODE === 'dual') {
    getSqlite().exec(sql);
    if (DB_MODE === 'dual') {
      pgWrite(sql, []).catch(err =>
        console.error('[db-layer] Postgres exec failed:', err.message)
      );
    }
    return;
  }
  await pg.query(sql);
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function isWriteQuery(sql) {
  const upper = sql.trim().toUpperCase();
  return upper.startsWith('INSERT') || upper.startsWith('UPDATE') ||
         upper.startsWith('DELETE') || upper.startsWith('CREATE') ||
         upper.startsWith('ALTER') || upper.startsWith('DROP');
}

/**
 * Translate SQLite SQL → PostgreSQL SQL.
 * Handles all known SQLite-specific syntax so individual files
 * can keep their existing SQL and the layer converts on the fly.
 */
function sqliteSqlToPostgres(sql) {
  let pg = sqliteToPostgres(sql); // ? → $N

  // ── Date/time functions ────────────────────────────────────────────────
  // datetime('now', '+60 minutes') → NOW() + INTERVAL '60 minutes'
  // datetime('now', '-24 hours') → NOW() - INTERVAL '24 hours'
  // datetime('now', '+1 year') → NOW() + INTERVAL '1 year'
  pg = pg.replace(/datetime\('now',\s*'([+-])(\d+)\s+(second|minute|hour|day|month|year)s?'\)/gi,
    (_, sign, n, unit) => `NOW() ${sign === '-' ? '-' : '+'} INTERVAL '${n} ${unit}'`);
  pg = pg.replace(/datetime\('now'\)/gi, 'NOW()');
  pg = pg.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  // date(col, '+N day') → (col)::DATE + INTERVAL 'N day'
  pg = pg.replace(/date\(([^,]+),\s*'([+-]\d+)\s*(day|month|year)s?'\)/gi,
    (_, col, n, unit) => `(${col.trim()})::DATE + INTERVAL '${n} ${unit}'`);
  // CURRENT_TIMESTAMP is Postgres-compatible but we normalize to NOW()
  pg = pg.replace(/CURRENT_TIMESTAMP/gi, 'NOW()');
  // SQLite stores dates as TEXT; Postgres needs explicit cast for comparisons.
  // draft_start_time <= NOW() + INTERVAL '...' → (draft_start_time)::TIMESTAMPTZ <= NOW() + ...
  pg = pg.replace(/(\w+_(?:time|at|date))\s*(<=|>=|<|>)\s*(NOW\(\)[^)\n]*)/gi,
    (_, col, op, rhs) => `(${col})::TIMESTAMPTZ ${op} ${rhs}`);

  // ── UUID generation ────────────────────────────────────────────────────
  // lower(hex(randomblob(4))) || '-' || ... → gen_random_uuid()::TEXT
  // Match the full UUID assembly pattern used throughout the codebase
  pg = pg.replace(
    /lower\(hex\(randomblob\(\d+\)\)\)\s*\|\|\s*'-'\s*\|\|\s*lower\(hex\(randomblob\(\d+\)\)\)\s*\|\|\s*'-4'\s*\|\|\s*substr\(lower\(hex\(randomblob\(\d+\)\)\),\d+\)\s*\|\|\s*'-'\s*\|\|\s*substr\('[89ab]',abs\(random\(\)\)\s*%\s*4\s*\+\s*1,\s*1\)\s*\|\|\s*substr\(lower\(hex\(randomblob\(\d+\)\)\),\d+\)\s*\|\|\s*'-'\s*\|\|\s*lower\(hex\(randomblob\(\d+\)\)\)/gi,
    "gen_random_uuid()::TEXT"
  );
  // Simpler pattern: lower(hex(randomblob(16)))
  pg = pg.replace(/lower\(hex\(randomblob\(\d+\)\)\)/gi, 'gen_random_uuid()::TEXT');

  // ── INSERT conflict handling ───────────────────────────────────────────
  // INSERT OR IGNORE INTO table (...) VALUES (...) → INSERT INTO table (...) VALUES (...) ON CONFLICT DO NOTHING
  pg = pg.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  if (/INSERT\s+INTO.*VALUES/i.test(pg) && !/ON\s+CONFLICT/i.test(pg) && sql.match(/INSERT\s+OR\s+IGNORE/i)) {
    // Append ON CONFLICT DO NOTHING if it was INSERT OR IGNORE
    pg = pg.replace(/(VALUES\s*\([^)]*\))/i, '$1 ON CONFLICT DO NOTHING');
  }

  // INSERT OR REPLACE INTO table (...) VALUES (...) → handled per-query
  // This is complex because we need the conflict target and update columns.
  // For now, convert to INSERT INTO and let individual queries add ON CONFLICT.
  pg = pg.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'INSERT INTO');

  // ── SQLite type casting ────────────────────────────────────────────────
  // changes() → not needed in Postgres (use RETURNING or rowCount)
  // typeof() → pg_typeof()

  return pg;
}

async function pgWrite(sql, params) {
  const pgSql = sqliteSqlToPostgres(sql);
  await pg.query(pgSql, params);
}

/**
 * Replay a list of captured SQLite transaction queries on Postgres.
 * Best-effort: logs errors but does not fail the primary (SQLite) operation.
 */
async function pgReplayTransaction(queryLog) {
  const client = await pg.getClient();
  try {
    await client.query('BEGIN');
    for (const { sql, params } of queryLog) {
      const pgSql = sqliteSqlToPostgres(sql);
      await client.query(pgSql, params);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  all,
  get,
  run,
  transaction,
  exec,
  // Expose mode for conditional logic during migration
  mode: DB_MODE,
  // Expose raw clients for edge cases
  sqlite: getSqlite,
  postgres: pg,
};
