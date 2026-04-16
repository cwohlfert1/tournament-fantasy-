'use strict';
/**
 * Tests for golfStatusManager.applyDateBasedHeal.
 *
 * Catches the class of bug where the scheduled → active flip fires at
 * UTC midnight instead of at the tournament's actual start time in ET.
 * That bug (fixed in 7e2163a) made RBC Heritage show "LIVE" ~11 hours
 * before tee-off and leaked other players' picks prematurely.
 *
 * Strategy: mock `./db` with a real in-memory better-sqlite3 so the
 * module's prepared statements run against seeded fixture data, and
 * use jest fake timers to pin `now` to specific wall-clock moments.
 */

const Database = require('better-sqlite3');
const { computeLockTime } = require('../golfPoolLockService');

// ── In-memory test DB ────────────────────────────────────────────────────────
// Mirrors just enough of the production schema for the heal to operate on.
let mockDb;

function makeDb() {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE golf_tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      espn_event_id TEXT,
      season_year INTEGER DEFAULT 2026
    );
    -- Matches prod shape: name PK, ran_at timestamp. logChange() inserts
    -- into this table via INSERT OR IGNORE so repeat heal runs are idempotent.
    CREATE TABLE migration_log (
      name TEXT PRIMARY KEY,
      ran_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return d;
}

// Replace the module's db before the module is required. Jest evaluates
// jest.mock() calls BEFORE any requires — so this must be at module scope.
jest.mock('../db', () => {
  // Defer actual creation until the test calls `makeDb()` via reset.
  const proxy = new Proxy({}, {
    get(_, key) {
      if (!mockDb) throw new Error('mockDb not initialised — call resetDb() first');
      return mockDb[key];
    },
  });
  return proxy;
});

// ── Module under test ────────────────────────────────────────────────────────
const { applyDateBasedHeal } = require('../golfStatusManager');

function seed(overrides = {}) {
  mockDb.prepare(`
    INSERT INTO golf_tournaments (id, name, status, start_date, end_date)
    VALUES (@id, @name, @status, @start_date, @end_date)
  `).run({
    id: overrides.id || 'tourn-1',
    name: overrides.name || 'Test Tournament',
    status: overrides.status || 'scheduled',
    start_date: overrides.start_date || '2026-04-16',
    end_date: overrides.end_date || '2026-04-19',
  });
}

function statusOf(id = 'tourn-1') {
  return mockDb.prepare('SELECT status FROM golf_tournaments WHERE id = ?').get(id).status;
}

beforeEach(() => {
  mockDb = makeDb();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  mockDb.close();
});

// ── Regression test for the RBC Heritage bug ─────────────────────────────────
describe('applyDateBasedHeal — scheduled → active transition', () => {
  test('does NOT flip to active at UTC midnight of start_date (pre-lock time)', () => {
    // RBC Heritage scenario: today is 2026-04-16 00:00 UTC (8pm ET on 04-15).
    // Tournament start_date is 2026-04-16. Under the old bug, the UTC
    // date comparison evaluated true and flipped status to active.
    // computeLockTime returns Thursday 12:00 UTC (8am ET) — should be
    // ~12 hours ahead of this moment.
    seed({ id: 'rbc', start_date: '2026-04-16', end_date: '2026-04-19' });
    jest.setSystemTime(new Date('2026-04-16T00:00:00Z'));

    applyDateBasedHeal();

    expect(statusOf('rbc')).toBe('scheduled');
  });

  test('flips to active once wall-clock passes computeLockTime', () => {
    seed({ id: 'rbc', start_date: '2026-04-16', end_date: '2026-04-19' });
    // computeLockTime(startDate) returns Thursday 12:00 UTC for a Thursday
    // start. Jump 1 second past it so the flip must fire.
    const lockMs = computeLockTime('2026-04-16').getTime();
    jest.setSystemTime(new Date(lockMs + 1_000));

    applyDateBasedHeal();

    expect(statusOf('rbc')).toBe('active');
  });

  test('leaves active status alone when already active and mid-tournament', () => {
    seed({ id: 'rbc', status: 'active', start_date: '2026-04-16', end_date: '2026-04-19' });
    jest.setSystemTime(new Date('2026-04-17T14:00:00Z'));

    applyDateBasedHeal();

    expect(statusOf('rbc')).toBe('active');
  });
});

describe('applyDateBasedHeal — active → completed transition', () => {
  test('flips to completed after end_date has passed', () => {
    seed({ id: 'rbc', status: 'active', start_date: '2026-04-16', end_date: '2026-04-19' });
    jest.setSystemTime(new Date('2026-04-20T12:00:00Z')); // day after end_date

    applyDateBasedHeal();

    expect(statusOf('rbc')).toBe('completed');
  });

  test('does NOT flip to completed on end_date itself (tournament may still be in final round)', () => {
    seed({ id: 'rbc', status: 'active', start_date: '2026-04-16', end_date: '2026-04-19' });
    jest.setSystemTime(new Date('2026-04-19T23:00:00Z'));

    applyDateBasedHeal();

    expect(statusOf('rbc')).toBe('active');
  });
});

describe('applyDateBasedHeal — completed → scheduled correction', () => {
  test('flips back to scheduled if a future event was mistakenly marked completed', () => {
    seed({ id: 'future', status: 'completed', start_date: '2027-01-10', end_date: '2027-01-13' });
    jest.setSystemTime(new Date('2026-06-01T12:00:00Z'));

    applyDateBasedHeal();

    expect(statusOf('future')).toBe('scheduled');
  });
});

describe('applyDateBasedHeal — isolation', () => {
  test('each tournament is evaluated independently', () => {
    seed({ id: 'past', status: 'active', start_date: '2026-01-01', end_date: '2026-01-04' });
    seed({ id: 'future', status: 'scheduled', start_date: '2026-06-15', end_date: '2026-06-21' });
    jest.setSystemTime(new Date('2026-04-17T12:00:00Z'));

    applyDateBasedHeal();

    expect(statusOf('past')).toBe('completed');
    expect(statusOf('future')).toBe('scheduled');
  });
});
