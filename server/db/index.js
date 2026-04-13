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

  // Supabase-only mode
  const result = await pg.query(sqliteToPostgres(sql), params);
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

  const result = await pg.query(sqliteToPostgres(sql), params);
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

  const result = await pg.query(sqliteToPostgres(sql), params);
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
    const sqliteResult = getSqlite().transaction(() => fn({
      run: (sql, ...p) => getSqlite().prepare(sql).run(...p),
      get: (sql, ...p) => getSqlite().prepare(sql).get(...p),
      all: (sql, ...p) => getSqlite().prepare(sql).all(...p),
    }))();

    // Dual mode: replay transaction on Postgres (best-effort)
    // Full transaction replay requires Phase 2 query logging — skip for now
    if (DB_MODE === 'dual') {
      console.warn('[db-layer] Dual-mode transaction: Postgres replay not yet implemented');
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

async function pgWrite(sql, params) {
  const pgSql = sqliteToPostgres(sql)
    // Convert SQLite-specific syntax to Postgres
    .replace(/datetime\('now'\)/gi, 'NOW()')
    .replace(/date\('now'\)/gi, 'CURRENT_DATE')
    .replace(/CURRENT_TIMESTAMP/gi, 'NOW()')
    .replace(/INSERT OR IGNORE/gi, 'INSERT')
    .replace(/INSERT OR REPLACE/gi, 'INSERT'); // Simplified — full ON CONFLICT needs Phase 2
  await pg.query(pgSql, params);
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
