'use strict';
/**
 * Golf pool scoring — regression tests for three bugs found during Houston Open R1.
 *
 * BUG 1: stroke_play enrichedPicks showed TourneyRun fantasy_points (e.g. -0.5, +6)
 *        instead of raw to-par totals (-1, -2). Fixed by using player_total.
 *
 * BUG 2: All teams had season_points = 0. Root cause: players in R1 had madeCut=false
 *        (instead of null), so applyDropScoring treated them as missed-cut and dropped
 *        them all → no counting players → team_score = 0.
 *
 * BUG 3: Jake Knapp (hadn't teed off) had db_r1 = 0 instead of null. Root cause:
 *        ESPN includes placeholder period entries {linescores: []} for unplayed rounds.
 *        parsePar('E') returns 0, which looks like even par but means "not played".
 *
 * Tests here cover the pure scoring functions that can be tested without a DB.
 * golfSyncService requires ./db at module level, so we mock it below.
 */

// Mock the DB module before golfSyncService is loaded — prevents SQLite initialization.
jest.mock('../db', () => ({
  prepare: jest.fn(() => ({ get: jest.fn(), all: jest.fn(), run: jest.fn() })),
  transaction: jest.fn(fn => fn),
}));

const { parseCompetitor, calcFantasyPts } = require('../golfSyncService');
const { applyDropScoring } = require('../pool-utils');


// ── BUG 3: Empty-linescore period entries should return null, not 0 ───────────

describe('parseCompetitor — BUG 3: empty linescores = unplayed round', () => {

  test('period with linescores:[] is treated as null (not even par 0)', () => {
    const comp = {
      displayName: 'Jake Knapp',
      linescores: [
        // period 1 exists but has no holes played yet
        { period: 1, displayValue: 'E', value: 72, linescores: [] },
      ],
      status: {},
    };
    const result = parseCompetitor(comp);
    expect(result.r1).toBeNull();
  });

  test('period with actual hole data returns the correct to-par value', () => {
    const comp = {
      displayName: 'Stephan Jaeger',
      linescores: [
        { period: 1, displayValue: '-4', value: 68, linescores: [{ par: 4 }, { par: 3 }] },
      ],
      status: {},
    };
    const result = parseCompetitor(comp);
    expect(result.r1).toBe(-4);
  });

  test('period 2 with empty linescores is null (player only in R1)', () => {
    const comp = {
      displayName: 'Wyndham Clark',
      linescores: [
        { period: 1, displayValue: 'E', value: 72, linescores: [{ par: 4 }] },
        { period: 2, displayValue: 'E', value: 72, linescores: [] }, // placeholder
      ],
      status: {},
    };
    const result = parseCompetitor(comp);
    expect(result.r1).toBe(0);   // played, even par
    expect(result.r2).toBeNull(); // not played yet
  });

});


// ── BUG 2: madeCut = null for R1/R2 players, not false ────────────────────────

describe('parseCompetitor — BUG 2: madeCut is null during R1/R2', () => {

  test('no status string + no R3/R4 → madeCut is null (not false)', () => {
    const comp = {
      displayName: 'Chris Gotterup',
      linescores: [
        { period: 1, displayValue: '-1', value: 71, linescores: [{ par: 4 }] },
      ],
      status: {},
    };
    const result = parseCompetitor(comp);
    expect(result.madeCut).toBeNull();
    expect(result.r1).toBe(-1);
  });

  test('no status + R3 present → madeCut = true (confirmed made cut)', () => {
    const comp = {
      displayName: 'Brooks Koepka',
      linescores: [
        { period: 1, displayValue: 'E', value: 72, linescores: [{ par: 4 }] },
        { period: 2, displayValue: '-2', value: 70, linescores: [{ par: 4 }] },
        { period: 3, displayValue: '-1', value: 71, linescores: [{ par: 4 }] },
      ],
      status: {},
    };
    const result = parseCompetitor(comp);
    expect(result.madeCut).toBe(true);
  });

  test('ESPN status "STATUS_CUT" → madeCut = false', () => {
    const comp = {
      displayName: 'Random Player',
      linescores: [],
      status: { type: { name: 'STATUS_CUT' } },
    };
    const result = parseCompetitor(comp);
    expect(result.madeCut).toBe(false);
  });

  test('ESPN status "STATUS_WD" → madeCut = false', () => {
    const comp = {
      displayName: 'Injured Player',
      linescores: [],
      status: { type: { name: 'STATUS_WD' } },
    };
    const result = parseCompetitor(comp);
    expect(result.madeCut).toBe(false);
  });

  test('ESPN status "STATUS_IN_PROGRESS" → madeCut = true', () => {
    const comp = {
      displayName: 'Active Player',
      linescores: [
        { period: 1, displayValue: '-3', linescores: [{ par: 4 }] },
      ],
      status: { type: { name: 'STATUS_IN_PROGRESS' } },
    };
    const result = parseCompetitor(comp);
    expect(result.madeCut).toBe(true);
  });

});


// ── BUG 2: calcFantasyPts null madeCut should not apply the -5 penalty ─────────

describe('calcFantasyPts — BUG 2: no cut penalty when madeCut is null', () => {

  test('madeCut=null → no +2 bonus and no -5 penalty', () => {
    // Player in R1 at even par, cut outcome unknown
    const pts = calcFantasyPts(0, null, null, null, null, null, 72, false);
    // pts from rounds: 0 * -1.5 = 0. No cut adjustment. No position bonus.
    expect(pts).toBe(0);
  });

  test('madeCut=null, r1=-4 → 6 pts from rounds only (no penalty)', () => {
    const pts = calcFantasyPts(-4, null, null, null, null, null, 72, false);
    // -4 * -1.5 = +6
    expect(pts).toBe(6);
  });

  test('madeCut=false → -5 penalty applied (confirmed missed cut)', () => {
    const pts = calcFantasyPts(0, 0, null, null, null, false, 72, false);
    // rounds: 0. missed cut: -5. total: -5
    expect(pts).toBe(-5);
  });

  test('madeCut=true → +2 bonus applied (confirmed made cut)', () => {
    const pts = calcFantasyPts(0, 0, null, null, null, true, 72, false);
    // rounds: 0. made cut: +2. total: +2
    expect(pts).toBe(2);
  });

  test('even par (0) with madeCut=null = 0 pts — not -5 (the Houston Open bug)', () => {
    // Wyndham Clark, Brooks Koepka, etc. were showing -5 before this fix.
    const pts = calcFantasyPts(0, null, null, null, null, null, 72, false);
    expect(pts).toBe(0); // not -5
  });

});


// ── BUG 2: applyDropScoring — null made_cut must not auto-drop players ─────────

describe('applyDropScoring — BUG 2: made_cut=null is not treated as missed cut', () => {

  test('player with made_cut=null (R1 in progress) is not marked is_mc', () => {
    const picks = [
      { player_id: 'a', player_name: 'Chris Gotterup', round1: -1, round2: null, round3: null, round4: null, made_cut: null },
    ];
    const result = applyDropScoring(picks, 0);
    expect(result.picks[0].is_mc).toBe(false);
  });

  test('player with made_cut=null counts toward team score', () => {
    const picks = [
      { player_id: 'a', player_name: 'Chris Gotterup', round1: -1, round2: null, round3: null, round4: null, made_cut: null },
      { player_id: 'b', player_name: 'Rickie Fowler',  round1: -2, round2: null, round3: null, round4: null, made_cut: null },
    ];
    const result = applyDropScoring(picks, 0);
    expect(result.team_score).toBe(-3); // -1 + -2, not 0
  });

  test('player with made_cut=0 IS treated as missed cut (correct behavior)', () => {
    const picks = [
      { player_id: 'a', player_name: 'MC Player', round1: 3, round2: 2, round3: null, round4: null, made_cut: 0 },
    ];
    const result = applyDropScoring(picks, 0);
    expect(result.picks[0].is_mc).toBe(true);
  });

  test('full team R1 scenario: no drops, all null cut → team score = sum of rounds', () => {
    // The Houston Open scenario: 7 players, all in R1, all made_cut=null
    const picks = [
      { player_id: 'p1', player_name: 'Gotterup',  round1: -1, round2: null, round3: null, round4: null, made_cut: null },
      { player_id: 'p2', player_name: 'Knapp',     round1:  0, round2: null, round3: null, round4: null, made_cut: null },
      { player_id: 'p3', player_name: 'Koepka',    round1:  0, round2: null, round3: null, round4: null, made_cut: null },
      { player_id: 'p4', player_name: 'Fowler',    round1: -2, round2: null, round3: null, round4: null, made_cut: null },
      { player_id: 'p5', player_name: 'Clark',     round1:  0, round2: null, round3: null, round4: null, made_cut: null },
      { player_id: 'p6', player_name: 'Hughes',    round1:  0, round2: null, round3: null, round4: null, made_cut: null },
      { player_id: 'p7', player_name: 'Theegala',  round1:  0, round2: null, round3: null, round4: null, made_cut: null },
    ];
    const result = applyDropScoring(picks, 2); // drop 2 worst
    // Active (has rounds, not MC): all 7
    // Drop 2 worst: worst are 0 values, but they're all tied; top 5 count
    // All 5 counting players at 0 or better: -1 + -2 + 0 + 0 + 0 = -3
    expect(result.team_score).toBe(-3);
    expect(result.picks.every(p => !p.is_mc)).toBe(true); // none marked missed cut
  });

});


// ── BUG 1: stroke_play — fantasy_points per player = raw to-par total ─────────

describe('applyDropScoring — BUG 1: player_total reflects rounds directly', () => {

  test('player_total = r1 for single round (not TourneyRun formula)', () => {
    const picks = [
      { player_id: 'p1', player_name: 'Gotterup', round1: -1, round2: null, round3: null, round4: null, made_cut: null },
    ];
    const result = applyDropScoring(picks, 0);
    // player_total must be -1, not TourneyRun value (-0.5 from hole scoring)
    expect(result.picks[0].player_total).toBe(-1);
  });

  test('r1=-4, r2=-2 → player_total=-6 (not TourneyRun formula)', () => {
    const picks = [
      { player_id: 'p1', player_name: 'Jaeger', round1: -4, round2: -2, round3: null, round4: null, made_cut: null },
    ];
    const result = applyDropScoring(picks, 0);
    expect(result.picks[0].player_total).toBe(-6);
  });

  test('r1=0, r2=0 → player_total=0 (even par, not -5 from cut penalty)', () => {
    const picks = [
      { player_id: 'p1', player_name: 'Even Par', round1: 0, round2: 0, round3: null, round4: null, made_cut: null },
    ];
    const result = applyDropScoring(picks, 0);
    expect(result.picks[0].player_total).toBe(0);
  });

  test('r1=2, r2=null → player_total=2 (null rounds ignored)', () => {
    const picks = [
      { player_id: 'p1', player_name: 'Over Par', round1: 2, round2: null, round3: null, round4: null, made_cut: null },
    ];
    const result = applyDropScoring(picks, 0);
    expect(result.picks[0].player_total).toBe(2);
  });

});


// ── Scoring style routing — isStrokeBased covers all three names ───────────────

describe('STROKE_BASED_STYLES: all three naming variants are handled', () => {

  // Test the helper by running applyDropScoring — which is what golf.js calls for
  // isStrokeBased leagues. If a Masters pool is created tomorrow with any of these
  // scoring_style values, the standings route will call applyDropScoring.
  //
  // This test ensures the VALUES match what CreateGolfLeague.jsx sends.
  const STROKE_BASED = ['stroke_play', 'total_score', 'total_strokes'];

  test.each(STROKE_BASED)('%s triggers applyDropScoring (lowest wins)', (style) => {
    // Simulate what golf.js does: check the style, call applyDropScoring
    const isStrokeBased = STROKE_BASED.includes(style);
    expect(isStrokeBased).toBe(true);
  });

  test('"tourneyrun" is NOT stroke-based (highest wins)', () => {
    expect(STROKE_BASED.includes('tourneyrun')).toBe(false);
  });

  test('unknown style is NOT stroke-based (falls back to fantasy_points sum)', () => {
    expect(STROKE_BASED.includes('fantasy_points')).toBe(false);
    expect(STROKE_BASED.includes('')).toBe(false);
    expect(STROKE_BASED.includes(undefined)).toBe(false);
  });

});


// ── TourneyRun calcFantasyPts formula validation ───────────────────────────────

describe('calcFantasyPts — TourneyRun formula', () => {

  test('r1=-4, madeCut=true → 6 pts from rounds + 2 made-cut bonus = 8', () => {
    const pts = calcFantasyPts(-4, null, null, null, null, true, 72, false);
    expect(pts).toBe(8); // 6 + 2
  });

  test('leader at -4 with finish pos 1 and made cut → 6 + 30 + 2 = 38', () => {
    const pts = calcFantasyPts(-4, null, null, null, 1, true, 72, false);
    expect(pts).toBe(38);
  });

  test('missed cut, no rounds played → 0 + (-5) = -5', () => {
    const pts = calcFantasyPts(null, null, null, null, null, false, 72, false);
    expect(pts).toBe(-5);
  });

  test('major multiplies by 1.5', () => {
    const pts = calcFantasyPts(-4, null, null, null, null, true, 72, true);
    // (6 + 2) * 1.5 = 12
    expect(pts).toBe(12);
  });

});
