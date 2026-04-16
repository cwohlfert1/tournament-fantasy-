'use strict';
/**
 * Tests for applyMissedCutRule — pure function that substitutes NULL
 * rounds for missed-cut / WD / DQ players with rule-derived to-par values.
 *
 * Rules:
 *   'fixed' | 'stroke_penalty'  → unplayed rounds = +penalty to-par
 *   'highest_carded'            → unplayed rounds = max carded to-par that round
 *                                 (falls back to penalty if roundMaxes missing)
 *   'exclude'                   → leave NULL (player earns no fantasy pts for
 *                                 unplayed rounds)
 *
 * Only applied when madeCut === false (CONFIRMED missed cut / WD / DQ).
 * For madeCut === null (in progress) or true (made cut), returns unchanged.
 */

// Mock ../db so the service module can load without a real sqlite.
// applyMissedCutRule is pure and never touches the DB, but other code in
// golfSyncService.js does.
jest.mock('../db', () => ({
  prepare: () => ({ run: () => {}, get: () => null, all: () => [] }),
  exec:    () => {},
  all:     async () => [],
  get:     async () => null,
  run:     async () => {},
  transaction: (fn) => fn,
}));
// Stub out the live-delta publisher so nothing tries to open a socket.
jest.mock('../liveScoreDelta', () => ({ publishDelta: () => {}, resetDeltaCache: () => {} }), { virtual: true });

const { applyMissedCutRule } = require('../golfSyncService');

describe('applyMissedCutRule — no-op paths', () => {
  test('returns scores unchanged when player made the cut', () => {
    const scores = { r1: -2, r2: +1, r3: null, r4: null };
    expect(applyMissedCutRule(scores, true, 'fixed', 8)).toEqual(scores);
  });

  test('returns scores unchanged when cut status is unknown (tournament in progress)', () => {
    const scores = { r1: +3, r2: null, r3: null, r4: null };
    expect(applyMissedCutRule(scores, null, 'fixed', 8)).toEqual(scores);
  });

  test("returns scores unchanged under 'exclude' rule (no fantasy pts for missed rounds)", () => {
    const scores = { r1: +4, r2: +5, r3: null, r4: null };
    expect(applyMissedCutRule(scores, false, 'exclude', 8)).toEqual(scores);
  });
});

describe("applyMissedCutRule — 'fixed' rule", () => {
  test('fills both missed rounds (r3, r4) with +penalty', () => {
    const scores = { r1: +3, r2: +4, r3: null, r4: null };
    expect(applyMissedCutRule(scores, false, 'fixed', 8)).toEqual({
      r1: +3, r2: +4, r3: 8, r4: 8,
    });
  });

  test('respects custom penalty value', () => {
    const scores = { r1: +2, r2: +3, r3: null, r4: null };
    expect(applyMissedCutRule(scores, false, 'fixed', 10)).toEqual({
      r1: +2, r2: +3, r3: 10, r4: 10,
    });
  });

  test("'stroke_penalty' behaves identically to 'fixed'", () => {
    const scores = { r1: +1, r2: +2, r3: null, r4: null };
    expect(applyMissedCutRule(scores, false, 'stroke_penalty', 6))
      .toEqual(applyMissedCutRule(scores, false, 'fixed', 6));
  });

  test('does not overwrite already-carded rounds', () => {
    const scores = { r1: -2, r2: +4, r3: null, r4: null };
    const out = applyMissedCutRule(scores, false, 'fixed', 8);
    expect(out.r1).toBe(-2);   // unchanged
    expect(out.r2).toBe(+4);   // unchanged
    expect(out.r3).toBe(8);
    expect(out.r4).toBe(8);
  });

  test('handles WD mid-tournament (one carded round only)', () => {
    const scores = { r1: +3, r2: null, r3: null, r4: null };
    expect(applyMissedCutRule(scores, false, 'fixed', 8)).toEqual({
      r1: +3, r2: 8, r3: 8, r4: 8,
    });
  });
});

describe("applyMissedCutRule — 'highest_carded' rule", () => {
  test('fills unplayed rounds with the max to-par carded that round', () => {
    const scores = { r1: +3, r2: +4, r3: null, r4: null };
    const roundMaxes = { r1: +8, r2: +10, r3: +11, r4: +12 };
    expect(applyMissedCutRule(scores, false, 'highest_carded', 8, roundMaxes)).toEqual({
      r1: +3, r2: +4, r3: 11, r4: 12,
    });
  });

  test('falls back to penalty when roundMaxes is null', () => {
    const scores = { r1: +3, r2: +4, r3: null, r4: null };
    expect(applyMissedCutRule(scores, false, 'highest_carded', 8, null)).toEqual({
      r1: +3, r2: +4, r3: 8, r4: 8,
    });
  });

  test('falls back to penalty when a round is missing from roundMaxes', () => {
    const scores = { r1: +3, r2: +4, r3: null, r4: null };
    const roundMaxes = { r1: +8, r2: +10 }; // r3/r4 missing
    expect(applyMissedCutRule(scores, false, 'highest_carded', 8, roundMaxes)).toEqual({
      r1: +3, r2: +4, r3: 8, r4: 8,
    });
  });

  test('treats non-finite values in roundMaxes as missing', () => {
    const scores = { r1: +3, r2: +4, r3: null, r4: null };
    const roundMaxes = { r1: +8, r2: +10, r3: Infinity, r4: NaN };
    expect(applyMissedCutRule(scores, false, 'highest_carded', 8, roundMaxes)).toEqual({
      r1: +3, r2: +4, r3: 8, r4: 8,
    });
  });
});

describe('applyMissedCutRule — purity', () => {
  test('does not mutate the input scores object', () => {
    const scores = { r1: +3, r2: +4, r3: null, r4: null };
    const snap   = { ...scores };
    applyMissedCutRule(scores, false, 'fixed', 8);
    expect(scores).toEqual(snap);
  });
});
