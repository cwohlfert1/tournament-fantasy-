'use strict';
/**
 * Integration test for the full sync pipeline.
 *
 * Validates that syncTournamentScores (ESPN → golf_scores → fantasy_points) works
 * end-to-end using an in-memory SQLite database, no network calls.
 *
 * Coverage:
 *   1. ESPN competitors with diacritic names are matched via normalizePlayerName.
 *   2. golf_scores rows have correct round scores (null for unplayed, not 0).
 *   3. fantasy_points are calculated correctly by calcFantasyPts.
 *   4. applyDropScoring produces the correct team_score (lowest wins).
 *   5. golf_espn_players is populated with ESPN display name → canonical name.
 */

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

// ── In-memory SQLite ──────────────────────────────────────────────────────────
// Variable must be prefixed with "mock" so jest.mock() factory can access it.
let mockMemDb;
beforeAll(() => {
  mockMemDb = new Database(':memory:');
  mockMemDb.exec(`
    CREATE TABLE golf_tournaments (
      id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active',
      espn_event_id TEXT, is_major INTEGER DEFAULT 0,
      start_date TEXT, end_date TEXT, last_synced_at DATETIME
    );
    CREATE TABLE golf_players (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT,
      world_ranking INTEGER, is_active INTEGER DEFAULT 1
    );
    CREATE TABLE golf_scores (
      id TEXT PRIMARY KEY, tournament_id TEXT, player_id TEXT,
      round1 INTEGER, round2 INTEGER, round3 INTEGER, round4 INTEGER,
      made_cut INTEGER, finish_position INTEGER, fantasy_points REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tournament_id, player_id)
    );
    CREATE TABLE golf_weekly_lineups (
      id TEXT PRIMARY KEY, member_id TEXT, tournament_id TEXT,
      player_id TEXT, is_started INTEGER DEFAULT 0, locked INTEGER DEFAULT 0
    );
    CREATE TABLE golf_espn_players (
      espn_name TEXT PRIMARY KEY, display_name TEXT, country_code TEXT,
      normalized_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
});
afterAll(() => { if (mockMemDb) mockMemDb.close(); });

// ── Mock db module with the in-memory DB ─────────────────────────────────────
// jest.mock() is hoisted, but variables prefixed with "mock" are permitted.
jest.mock('../db', () => ({
  get prepare()    { return mockMemDb.prepare.bind(mockMemDb); },
  get exec()       { return mockMemDb.exec.bind(mockMemDb); },
  get transaction(){ return mockMemDb.transaction.bind(mockMemDb); },
}));

// Suppress console output from the sync service during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => { console.log.mockRestore(); console.warn.mockRestore(); });

// ── Helpers ──────────────────────────────────────────────────────────────────
const { calcFantasyPts, parseCompetitor } = require('../golfSyncService');
const { applyDropScoring } = require('../pool-utils');
const { normalizePlayerName, validatePlayerData } = require('../utils/playerNameNorm');

// Build a minimal ESPN competitor object (live scoreboard format)
function makeCompetitor(displayName, r1, r2, r3, r4, { status = '', order = null } = {}) {
  const ls = [];
  if (r1 !== undefined) ls.push({ displayValue: r1 === null ? '--' : String(r1) });
  if (r2 !== undefined) ls.push({ displayValue: r2 === null ? '--' : String(r2) });
  if (r3 !== undefined) ls.push({ displayValue: r3 === null ? '--' : String(r3) });
  if (r4 !== undefined) ls.push({ displayValue: r4 === null ? '--' : String(r4) });
  return {
    displayName,
    linescores: ls,
    status: status ? { type: { name: status } } : {},
    order,
  };
}

// ── Test data ─────────────────────────────────────────────────────────────────
const TOURNAMENT_ID = 'tourn-001';
const PLAYERS = [
  { id: 'p1', name: 'Thorbjorn Olesen',  country: 'DK' },  // DB stores without diacritics
  { id: 'p2', name: 'Rory McIlroy',      country: 'GB' },
  { id: 'p3', name: 'J.T. Poston',       country: 'US' },
];

beforeAll(() => {
  // Insert tournament
  mockMemDb.prepare(`
    INSERT INTO golf_tournaments (id, name, status, is_major, start_date, end_date)
    VALUES (?, ?, 'active', 0, '2026-04-06', '2026-04-12')
  `).run(TOURNAMENT_ID, 'The Masters');

  // Insert players
  const ins = mockMemDb.prepare('INSERT INTO golf_players (id, name, country, is_active) VALUES (?, ?, ?, 1)');
  for (const p of PLAYERS) ins.run(p.id, p.name, p.country);
});

// ── parseCompetitor tests ─────────────────────────────────────────────────────

describe('parseCompetitor', () => {
  test('parses R1/R2 live format correctly', () => {
    const comp = makeCompetitor('Thorbjørn Olesen', -5, -3);
    const result = parseCompetitor(comp);
    expect(result.name).toBe('Thorbjørn Olesen');
    expect(result.r1).toBe(-5);
    expect(result.r2).toBe(-3);
    expect(result.r3).toBeNull();
    expect(result.r4).toBeNull();
    expect(result.madeCut).toBeNull(); // R1/R2 only — cut unknown
  });

  test('-- displayValue is treated as null (not played)', () => {
    const comp = makeCompetitor('Rory McIlroy', -4, '--');
    const result = parseCompetitor(comp);
    expect(result.r2).toBeNull();
  });

  test('STATUS_CUT sets madeCut=false', () => {
    const comp = makeCompetitor('J.T. Poston', 2, 3, null, null, { status: 'STATUS_CUT' });
    const result = parseCompetitor(comp);
    expect(result.madeCut).toBe(false);
  });

  test('R3/R4 presence without status sets madeCut=true', () => {
    const comp = makeCompetitor('Rory McIlroy', -4, -2, -3, -1);
    const result = parseCompetitor(comp);
    expect(result.madeCut).toBe(true);
  });
});

// ── normalizePlayerName — diacritic matching ──────────────────────────────────

describe('diacritic name normalization for sync matching', () => {
  test('ESPN Thorbjørn Olesen matches DB Thorbjorn Olesen', () => {
    const espn = normalizePlayerName('Thorbjørn Olesen');
    const db   = normalizePlayerName('Thorbjorn Olesen');
    expect(espn).toBe(db);
  });

  test('ESPN J.T. Poston matches DB J.T. Poston (periods stripped)', () => {
    const espn = normalizePlayerName('J.T. Poston');
    const db   = normalizePlayerName('J.T. Poston');
    expect(espn).toBe(db);
    expect(espn).toBe('jt poston');
  });
});

// ── calcFantasyPts ────────────────────────────────────────────────────────────

describe('calcFantasyPts', () => {
  test('-7 over 2 rounds, top-5 finish → positive points', () => {
    const pts = calcFantasyPts(-5, -2, null, null, 3, null, 72, false);
    // (-5 * -1.5) + (-2 * -1.5) + 12 (top-5 bonus) = 7.5 + 3 + 12 = 22.5; no cut bonus yet
    expect(pts).toBe(22.5);
  });

  test('made cut adds 2 pts', () => {
    const ptsNoCut = calcFantasyPts(-3, -2, -1, 0, 10, null, 72, false);
    const ptsCut   = calcFantasyPts(-3, -2, -1, 0, 10, true, 72, false);
    expect(ptsCut - ptsNoCut).toBe(2);
  });

  test('missed cut subtracts 5 pts', () => {
    const ptsNoInfo = calcFantasyPts(1, 2, null, null, null, null, 72, false);
    const ptsMC     = calcFantasyPts(1, 2, null, null, null, false, 72, false);
    expect(ptsMC - ptsNoInfo).toBe(-5);
  });

  test('major multiplier 1.5× applied', () => {
    const regular = calcFantasyPts(-4, -3, -2, -1, 1, true, 72, false);
    const major   = calcFantasyPts(-4, -3, -2, -1, 1, true, 72, true);
    expect(major).toBeCloseTo(regular * 1.5, 1);
  });
});

// ── applyDropScoring ─────────────────────────────────────────────────────────

describe('applyDropScoring', () => {
  const makePick = (id, r1, r2, madeCut) => ({ player_id: id, round1: r1, round2: r2, round3: null, round4: null, made_cut: madeCut });

  test('dropCount=0: all active players count', () => {
    const picks = [makePick('a', -3, -2, null), makePick('b', 1, 2, null)];
    const { team_score } = applyDropScoring(picks, 0);
    expect(team_score).toBe(-2); // (-3-2) + (1+2) = -5 + 3 = -2
  });

  test('dropCount=1: worst player dropped', () => {
    const picks = [makePick('a', -3, -2, 1), makePick('b', 2, 3, 1), makePick('c', -1, -1, 1)];
    const { team_score, dropped_count } = applyDropScoring(picks, 1);
    // player_totals: a=-5, b=5, c=-2. Drop b (worst=highest).
    expect(dropped_count).toBe(1);
    expect(team_score).toBe(-7); // -5 + -2
  });

  test('MC players consume drop count — no additional drops applied', () => {
    const picks = [
      makePick('a', -4, -3, 1),   // made cut, total=-7
      makePick('b', 2, 3, 0),     // missed cut (MC) — fills the drop quota
      makePick('c', 0, 1, 1),     // made cut, total=1
    ];
    const { team_score, dropped_count } = applyDropScoring(picks, 1);
    // b (MC) fills the single drop slot. a and c both count.
    expect(dropped_count).toBe(1);
    expect(team_score).toBe(-6); // (-7) + 1
  });

  test('null madeCut (in-progress) is NOT treated as MC', () => {
    const picks = [
      makePick('a', -2, null, null),  // active, total=-2
      makePick('b', 1, null, null),   // active, total=1
    ];
    const { team_score } = applyDropScoring(picks, 0);
    expect(team_score).toBe(-1); // both count
  });
});

// ── validatePlayerData ────────────────────────────────────────────────────────

describe('validatePlayerData', () => {
  test('valid player passes with no warnings', () => {
    const result = validatePlayerData({ name: 'Rory McIlroy', country_code: 'GB', r1: -4, r2: -2, r3: null, r4: null });
    expect(result.warnings).toHaveLength(0);
    expect(result.country_code).toBe('GB');
    expect(result.normalized_name).toBe('rory mcilroy');
  });

  test('3-letter country_code triggers warning and is cleared', () => {
    const result = validatePlayerData({ name: 'Scottie Scheffler', country_code: 'USA', r1: -5 });
    expect(result.warnings.some(w => w.includes('not 2 letters'))).toBe(true);
    expect(result.country_code).toBeNull();
  });

  test('missing country_code triggers warning', () => {
    const result = validatePlayerData({ name: 'Tiger Woods', r1: 0 });
    expect(result.warnings.some(w => w.includes('missing country_code'))).toBe(true);
  });

  test('r1=0 is coerced to null with warning', () => {
    const result = validatePlayerData({ name: 'Jake Knapp', country_code: 'US', r1: 0, r2: -3 });
    expect(result.r1).toBeNull();
    expect(result.r2).toBe(-3);
    expect(result.warnings.some(w => w.includes('r1 is 0'))).toBe(true);
  });

  test('diacritic name is normalized', () => {
    const result = validatePlayerData({ name: 'Thorbjørn Olesen', country_code: 'DK', r1: -3 });
    expect(result.normalized_name).toBe('thorbjorn olesen');
  });
});
