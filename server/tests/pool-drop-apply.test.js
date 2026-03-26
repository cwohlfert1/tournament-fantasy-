'use strict';
/**
 * Tests for the "Apply Round 2 Drops" feature.
 *
 * Covers:
 *   1. computeDropIds — selects worst-N by R1+R2, R1 tiebreaker, MC priority
 *   2. applyDropScoring with lockedDroppedIds — persisted drops respected
 *   3. applyDropScoring before drops applied (dropCount=0) — all count
 *   4. MC players in locked mode — excluded from scoring but not marked is_dropped
 *   5. Edge cases: all pending, fewer picks than dropCount
 */

const { applyDropScoring, computeDropIds } = require('../pool-utils');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePick(id, r1, r2, madeCut = null) {
  return { player_id: id, player_name: `Player ${id}`, round1: r1, round2: r2, round3: null, round4: null, made_cut: madeCut };
}

// ── computeDropIds ────────────────────────────────────────────────────────────

describe('computeDropIds — worst-N selection', () => {
  test('7 players, drop 2 worst by R1+R2 → 5 survive', () => {
    const picks = [
      makePick('p1', -5, -3),  // total -8 — best
      makePick('p2', -4, -2),  // total -6
      makePick('p3', -3, -1),  // total -4
      makePick('p4', -2,  0),  // total -2
      makePick('p5',  0,  1),  // total +1
      makePick('p6',  1,  2),  // total +3 — 2nd worst
      makePick('p7',  2,  3),  // total +5 — worst
    ];
    const dropped = computeDropIds(picks, 2);
    expect(dropped.size).toBe(2);
    expect(dropped.has('p7')).toBe(true);
    expect(dropped.has('p6')).toBe(true);
    expect(dropped.has('p1')).toBe(false);
    expect(dropped.has('p2')).toBe(false);
  });

  test('dropped players excluded from team score via applyDropScoring', () => {
    const picks = [
      makePick('p1', -5, -3),  // -8
      makePick('p2', -4, -2),  // -6
      makePick('p3', -3, -1),  // -4
      makePick('p4', -2,  0),  // -2
      makePick('p5',  0,  1),  // +1
      makePick('p6',  1,  2),  // +3 ← dropped
      makePick('p7',  2,  3),  // +5 ← dropped
    ];
    const droppedIds = computeDropIds(picks, 2);
    // Simulate what the standings route does after applying drops:
    const result = applyDropScoring(picks, 0, { lockedDroppedIds: droppedIds });

    // 5 counting players: -8 + -6 + -4 + -2 + 1 = -19
    expect(result.team_score).toBe(-19);
    expect(result.counting_count).toBe(5);
    expect(result.dropped_count).toBe(2);

    // Dropped players have is_dropped=true
    expect(result.picks.find(p => p.player_id === 'p7').is_dropped).toBe(true);
    expect(result.picks.find(p => p.player_id === 'p6').is_dropped).toBe(true);
    expect(result.picks.find(p => p.player_id === 'p1').is_dropped).toBe(false);
  });

  test('R1 tiebreaker: tied R1+R2 total → worse R1 score is dropped', () => {
    // p1: R1=+2, R2=-1 → total=+1
    // p2: R1=+3, R2=-2 → total=+1 (same total, but worse R1 → p2 dropped)
    const picks = [
      makePick('p1', 2, -1),  // total +1, R1=+2
      makePick('p2', 3, -2),  // total +1, R1=+3 (worse R1 → drops first)
      makePick('p3', -4, -3), // total -7
    ];
    const dropped = computeDropIds(picks, 1);
    expect(dropped.has('p2')).toBe(true);
    expect(dropped.has('p1')).toBe(false);
    expect(dropped.has('p3')).toBe(false);
  });

  test('MC player fills a drop slot before worst-active is considered', () => {
    // dropCount=2: 1 MC fills slot 1, only 1 additional active is dropped
    const picks = [
      makePick('p1', -5, -3, 1),  // made cut, total=-8
      makePick('p2',  1,  2, 0),  // MC → fills drop slot 1
      makePick('p3',  0,  1, 1),  // worst active (+1) → fills drop slot 2
      makePick('p4', -3, -2, 1),  // total=-5, not dropped
    ];
    const dropped = computeDropIds(picks, 2);
    expect(dropped.has('p2')).toBe(true);   // MC: auto-drop
    expect(dropped.has('p3')).toBe(true);   // worst active
    expect(dropped.has('p1')).toBe(false);
    expect(dropped.has('p4')).toBe(false);
    expect(dropped.size).toBe(2);
  });

  test('dropCount=0 → empty set, nothing dropped', () => {
    const picks = [makePick('p1', 5, 5), makePick('p2', 4, 4)];
    const dropped = computeDropIds(picks, 0);
    expect(dropped.size).toBe(0);
  });

  test('fewer picks than dropCount → only available players dropped', () => {
    // Only 2 picks, but dropCount=5
    const picks = [makePick('p1', 3, 2), makePick('p2', 1, 1)];
    const dropped = computeDropIds(picks, 5);
    // Can't drop more than what exists
    expect(dropped.size).toBeLessThanOrEqual(2);
  });

  test('pending player (no rounds) is never dropped', () => {
    const picks = [
      makePick('p1', null, null),  // pending — no rounds
      makePick('p2', 3, 2),        // active, worst
      makePick('p3', -2, -1),      // active, best
    ];
    const dropped = computeDropIds(picks, 1);
    expect(dropped.has('p1')).toBe(false);  // pending never dropped
    expect(dropped.has('p2')).toBe(true);   // worst active
  });
});

// ── applyDropScoring — BEFORE drops applied (dropCount=0, lockedDroppedIds=null) ──

describe('applyDropScoring — before drops applied (all count)', () => {
  test('all 7 players count when dropCount=0 (drops not yet applied)', () => {
    const picks = [
      makePick('p1', -5, -3),
      makePick('p2', -4, -2),
      makePick('p3', -3, -1),
      makePick('p4', -2,  0),
      makePick('p5',  0,  1),
      makePick('p6',  1,  2),
      makePick('p7',  2,  3),
    ];
    const result = applyDropScoring(picks, 0);

    // No one is dropped
    expect(result.dropped_count).toBe(0);
    expect(result.picks.every(p => !p.is_dropped)).toBe(true);

    // All 7 count: (-8)+(-6)+(-4)+(-2)+(1)+(3)+(5) = -11
    expect(result.team_score).toBe(-11);
    expect(result.counting_count).toBe(7);
  });

  test('MC player excluded from team score even before drops are applied', () => {
    const picks = [
      makePick('p1', -5, -3, 1),   // active
      makePick('p2',  2,  3, 0),   // MC — excluded from scoring
      makePick('p3', -2, -1, 1),   // active
    ];
    const result = applyDropScoring(picks, 0);

    // p2 (MC) not counted, but is_dropped=false (shown with MC badge, not DROPPED)
    expect(result.picks.find(p => p.player_id === 'p2').is_dropped).toBe(false);
    expect(result.picks.find(p => p.player_id === 'p2').is_mc).toBe(true);
    // p1 + p3 count: -8 + -3 = -11
    expect(result.team_score).toBe(-11);
  });
});

// ── applyDropScoring — AFTER drops applied (lockedDroppedIds from DB) ──────────

describe('applyDropScoring — locked mode (drops applied by commissioner)', () => {
  test('locked drops respected — is_dropped=true for those player_ids', () => {
    const picks = [
      makePick('p1', -5, -3),
      makePick('p2', -4, -2),
      makePick('p3',  2,  3),  // worst — locked as dropped
    ];
    const lockedDroppedIds = new Set(['p3']);
    const result = applyDropScoring(picks, 0, { lockedDroppedIds });

    expect(result.picks.find(p => p.player_id === 'p3').is_dropped).toBe(true);
    expect(result.picks.find(p => p.player_id === 'p1').is_dropped).toBe(false);
    expect(result.picks.find(p => p.player_id === 'p2').is_dropped).toBe(false);
    // Team score = p1 + p2: -8 + -6 = -14
    expect(result.team_score).toBe(-14);
    expect(result.counting_count).toBe(2);
    expect(result.dropped_count).toBe(1);
  });

  test('MC player after drop-apply: excluded from scoring, shown as MC not DROPPED', () => {
    // Commissioner locked drops at R2. Now p2 has missed cut (e.g., WD in R3).
    // p2 was NOT in the locked set — but should still be excluded from scoring.
    const picks = [
      makePick('p1', -5, -3, 1),   // active, not locked
      makePick('p2', -2, -1, 0),   // MC after drops were applied — NOT in locked set
      makePick('p3',  2,  3, 1),   // locked as dropped
    ];
    const lockedDroppedIds = new Set(['p3']);
    const result = applyDropScoring(picks, 0, { lockedDroppedIds });

    // p2: MC, not in locked set → is_mc=true, is_dropped=false (shows MC badge)
    const p2 = result.picks.find(p => p.player_id === 'p2');
    expect(p2.is_mc).toBe(true);
    expect(p2.is_dropped).toBe(false);

    // p3: in locked set → is_dropped=true (shows DROPPED badge)
    const p3 = result.picks.find(p => p.player_id === 'p3');
    expect(p3.is_dropped).toBe(true);

    // Only p1 counts: -8
    expect(result.team_score).toBe(-8);
    expect(result.counting_count).toBe(1);
  });

  test('empty locked set → all active count (drops applied but no one dropped)', () => {
    const picks = [makePick('p1', -3, -2), makePick('p2', -1,  0)];
    const result = applyDropScoring(picks, 0, { lockedDroppedIds: new Set() });

    expect(result.dropped_count).toBe(0);
    expect(result.team_score).toBe(-6); // (-3-2) + (-1+0) = -5 + -1 = -6
    expect(result.counting_count).toBe(2);
  });

  test('round-trip: computeDropIds → lockedDroppedIds → applyDropScoring gives correct score', () => {
    // Full round-trip simulating the commissioner endpoint → standings route
    const picks = [
      makePick('p1', -6, -4),  // total -10 — best
      makePick('p2', -3, -2),  // total -5
      makePick('p3', -1,  0),  // total -1
      makePick('p4',  1,  1),  // total +2
      makePick('p5',  2,  2),  // total +4
      makePick('p6',  3,  3),  // total +6 ← dropped
      makePick('p7',  4,  4),  // total +8 ← dropped
    ];

    // Step 1: commissioner applies drops
    const droppedIds = computeDropIds(picks, 2);
    expect(droppedIds.has('p6')).toBe(true);
    expect(droppedIds.has('p7')).toBe(true);

    // Step 2: standings uses locked drops
    const result = applyDropScoring(picks, 0, { lockedDroppedIds: droppedIds });

    // p1+p2+p3+p4+p5 count: -10 + -5 + -1 + 2 + 4 = -10
    expect(result.team_score).toBe(-10);
    expect(result.counting_count).toBe(5);
    expect(result.dropped_count).toBe(2);
  });
});

// ── Backward compatibility — existing auto-drop behavior unchanged ─────────────

describe('applyDropScoring — auto mode still works (backward compat)', () => {
  test('auto worst-N drop when lockedDroppedIds not provided', () => {
    const picks = [
      makePick('p1', -3, -2),  // total -5
      makePick('p2',  1,  2),  // total +3 ← should auto-drop
      makePick('p3', -1,  0),  // total -1
    ];
    const result = applyDropScoring(picks, 1);  // auto-drop 1 worst

    expect(result.picks.find(p => p.player_id === 'p2').is_dropped).toBe(true);
    expect(result.team_score).toBe(-6); // p1 + p3: -5 + -1 = -6
    expect(result.dropped_count).toBe(1);
  });
});
