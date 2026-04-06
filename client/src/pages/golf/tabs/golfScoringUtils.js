/**
 * golfScoringUtils.js
 *
 * Pure scoring-style utilities shared by StandingsTab and its tests.
 * Keep this file free of React and DOM dependencies so it can be
 * imported from any test environment.
 *
 * SCORING STYLES
 * ──────────────
 * STROKE PLAY  (scoring_style: 'stroke_play' | 'total_score' | 'total_strokes')
 *   - Team score = sum of to-par rounds across counting players
 *   - LOWEST score wins  (-10 beats -3 beats 0 beats +2)
 *   - Under par (negative) = GOOD → green
 *   - Over par  (positive) = BAD  → red
 *   - Even par  (zero)     = neutral
 *
 * TOURNEYRUN   (scoring_style: 'tourneyrun')
 *   - Team score = sum of fantasy points (birdie bonuses, position bonuses, etc.)
 *   - HIGHEST score wins
 *   - Positive = GOOD → green
 *
 * POINTS RACE  (scoring_style: 'points_race')
 *   - Team score = cumulative points earned from finish positions
 *   - HIGHEST score wins
 *   - Positive = GOOD → green
 *
 * Adding a new stroke-based style in CreateGolfLeague.jsx?
 * → Add its value to STROKE_BASED_STYLES below.
 */

/**
 * All scoring_style values that use stroke-based logic (lower is better).
 *   'stroke_play'   — name used by the current creation UI
 *   'total_score'   — second UI option (same math, different label)
 *   'total_strokes' — legacy Beta migration name
 */
export const STROKE_BASED_STYLES = ['stroke_play', 'total_score', 'total_strokes'];

/**
 * Returns true when the league's scoring_style uses stroke-based scoring
 * (lowest team score wins, negative = green, ascending sort).
 */
export function isStrokeBased(scoringStyle) {
  return STROKE_BASED_STYLES.includes(scoringStyle);
}

/**
 * Compute rank and tie information for each standing entry.
 *
 * For stroke-based styles: lower season_points = better rank (rank 1 = lowest).
 * For all other styles:    higher season_points = better rank (rank 1 = highest).
 *
 * Returns an array of { rank, tied } objects, one per standing entry,
 * in the same order as the input array.
 *
 * @param {Array<{season_points: number, tiebreaker_score?: number}>} standings
 * @param {string} scoringStyle
 * @param {number|null} [winningScore] - actual winning score for tiebreaker resolution
 * @returns {Array<{rank: number, tied: boolean}>}
 */
export function computeRanks(standings, scoringStyle, winningScore = null) {
  const lowerIsBetter = isStrokeBased(scoringStyle);
  const arr = standings.map((s) => ({
    pts: s.season_points ?? 0,
    tbDelta: winningScore != null && s.tiebreaker_score != null
      ? Math.abs(s.tiebreaker_score - winningScore) : Infinity,
  }));

  function isBetter(a, b) {
    const ptsCmp = lowerIsBetter ? a.pts - b.pts : b.pts - a.pts;
    if (ptsCmp !== 0) return ptsCmp < 0;
    return a.tbDelta < b.tbDelta;
  }
  function isSame(a, b) {
    return a.pts === b.pts && a.tbDelta === b.tbDelta;
  }

  return arr.map((me) => {
    const rank = arr.filter((x) => isBetter(x, me)).length + 1;
    const tied = arr.filter((x) => isSame(x, me)).length > 1;
    return { rank, tied };
  });
}

/**
 * Determine the CSS color for a score value based on scoring style.
 *
 * Stroke play:   negative=green (under par), positive=red (over par)
 * All others:    positive=green (more pts), negative=red (fewer pts)
 */
export function scoreColor(score, scoringStyle) {
  if (isStrokeBased(scoringStyle)) {
    if (score < 0) return '#22c55e';  // under par → green
    if (score > 0) return '#ef4444';  // over par  → red
    return '#9ca3af';                 // even par  → neutral
  }
  // TourneyRun / points_race: higher = better
  if (score > 0) return '#22c55e';
  if (score < 0) return '#ef4444';
  return '#9ca3af';
}
