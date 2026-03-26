/**
 * SCORING STYLE: STROKE PLAY (scoring_style = 'stroke_play' | 'total_score' | 'total_strokes')
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES: Sums round1-4 to-par values per player, drops N worst, totals the rest.
 * WINNING:      LOWEST team score wins (-10 beats +2).
 * FORMULA:      player_total = r1 + r2 + r3 + r4 (nulls excluded, not treated as 0)
 *               team_score   = sum of counting players' totals
 *
 * made_cut values:
 *   0    = confirmed missed cut / WD / DQ → player auto-drops (no scores needed)
 *   1    = confirmed made cut
 *   null = unknown (tournament in progress, cut not yet determined, R1/R2)
 *          → treat same as active/pending, NOT as missed cut
 *
 * NO bonuses, NO cut penalties, NO multipliers — just raw to-par strokes.
 * Even par (0) = 0 pts. -4 means 4 under par (good). +2 means 2 over par (bad).
 *
 * Apply "Best X of Y" drop scoring to a team's picks.
 *
 * Categories:
 *   MC/WD   = made_cut === 0 (missed cut or withdrew) — ONLY explicit 0, not null
 *   ACTIVE  = has round scores AND not cut/WD
 *   PENDING = no round scores yet AND not cut (hasn't teed off)
 *
 * Drop order:
 *   1. MC/WD players auto-drop first (no penalty, just removed)
 *   2. Remaining drops = worst ACTIVE players by total to-par score
 *   3. PENDING players excluded from scoring — not penalized
 *
 * @param {Array}  picks     - rows with: player_id, round1-4, made_cut
 * @param {number} dropCount - how many players to drop (0 = no drops)
 * @returns {{ picks, team_score, counting_count, dropped_count }}
 */
function applyDropScoring(picks, dropCount) {
  const enriched = picks.map(p => {
    const rounds = [p.round1, p.round2, p.round3, p.round4].filter(r => r != null);
    const hasRounds = rounds.length > 0;
    const total     = rounds.reduce((s, r) => s + r, 0);
    const isMC      = (p.made_cut === 0);
    const isPending = !hasRounds && !isMC;
    return {
      ...p,
      player_total: total,
      _hasRounds: hasRounds,
      _isMC: isMC,
      _isPending: isPending,
      is_mc: isMC,
      is_pending: isPending,
      is_dropped: false,
    };
  });

  if (dropCount <= 0) {
    const counting = enriched.filter(p => p._hasRounds && !p._isMC);
    return {
      picks: enriched,
      team_score:     counting.reduce((s, p) => s + p.player_total, 0),
      counting_count: counting.length,
      dropped_count:  0,
    };
  }

  const mc     = enriched.filter(p => p._isMC);
  const active = enriched.filter(p => p._hasRounds && !p._isMC);

  const droppedIds = new Set();
  mc.forEach(p => droppedIds.add(p.player_id));

  const remainingDrops = Math.max(0, dropCount - mc.length);
  if (remainingDrops > 0) {
    [...active]
      .sort((a, b) => b.player_total - a.player_total) // worst (highest) first
      .slice(0, remainingDrops)
      .forEach(p => droppedIds.add(p.player_id));
  }

  const counting = active.filter(p => !droppedIds.has(p.player_id));

  return {
    picks:          enriched.map(p => ({ ...p, is_dropped: droppedIds.has(p.player_id) })),
    team_score:     counting.reduce((s, p) => s + p.player_total, 0),
    counting_count: counting.length,
    dropped_count:  droppedIds.size,
  };
}

module.exports = { applyDropScoring };
