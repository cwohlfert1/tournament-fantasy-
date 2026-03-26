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
 * Drop modes:
 *   AUTO (lockedDroppedIds = null):
 *     1. MC/WD players auto-drop first (no penalty, just removed)
 *     2. Remaining drops = worst ACTIVE players by total to-par score (r1 tiebreaker)
 *     3. PENDING players excluded from scoring — not penalized
 *   LOCKED (lockedDroppedIds = Set<player_id>):
 *     Commissioner applied drops are persisted in DB. Use those IDs directly.
 *     MC players still excluded from scoring but shown as MC, not DROPPED.
 *     dropCount is ignored in locked mode.
 *
 * @param {Array}  picks              - rows with: player_id, round1-4, made_cut
 * @param {number} dropCount          - how many players to drop (0 = no drops)
 * @param {object} [opts]
 * @param {Set<string>|null} [opts.lockedDroppedIds] - persisted drop IDs from DB;
 *   when provided, skip worst-N computation and use this set instead.
 * @returns {{ picks, team_score, counting_count, dropped_count }}
 */
function applyDropScoring(picks, dropCount, { lockedDroppedIds = null } = {}) {
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

  // ── LOCKED MODE: commissioner applied drops — use persisted IDs ──────────────
  // MC players are still excluded from scoring but shown with is_mc, not is_dropped.
  // Locked players (worst-N chosen at button-press time) show as is_dropped=true.
  if (lockedDroppedIds !== null) {
    const droppedSet = new Set(lockedDroppedIds);
    // Counting = has rounds, not MC, not in the locked drop set
    const counting = enriched.filter(p => p._hasRounds && !p._isMC && !droppedSet.has(p.player_id));
    return {
      picks:          enriched.map(p => ({ ...p, is_dropped: droppedSet.has(p.player_id) })),
      team_score:     counting.reduce((s, p) => s + p.player_total, 0),
      counting_count: counting.length,
      dropped_count:  droppedSet.size,
    };
  }

  // ── NO DROPS: dropCount = 0 — all active players count ──────────────────────
  if (dropCount <= 0) {
    const counting = enriched.filter(p => p._hasRounds && !p._isMC);
    return {
      picks:          enriched,
      team_score:     counting.reduce((s, p) => s + p.player_total, 0),
      counting_count: counting.length,
      dropped_count:  0,
    };
  }

  // ── AUTO DROP: compute worst-N from live scores ──────────────────────────────
  const mc     = enriched.filter(p => p._isMC);
  const active = enriched.filter(p => p._hasRounds && !p._isMC);

  const droppedIds = new Set();
  mc.forEach(p => droppedIds.add(p.player_id));

  const remainingDrops = Math.max(0, dropCount - mc.length);
  if (remainingDrops > 0) {
    [...active]
      .sort((a, b) =>
        b.player_total - a.player_total ||       // worst (highest) total first
        (b.round1 ?? 0) - (a.round1 ?? 0)        // tiebreaker: worst R1 first
      )
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

/**
 * Compute which player_ids should be marked as dropped for a single team.
 * Used by the commissioner "Apply Round 2 Drops" endpoint.
 *
 * Drop logic:
 *   1. MC/WD players (made_cut === 0) fill drop slots first.
 *   2. Remaining slots: worst ACTIVE players by R1+R2 total, R1 as tiebreaker.
 *   3. Players with no round data (pending) are never dropped.
 *
 * @param {Array<{player_id: string, round1: number|null, round2: number|null, made_cut: number|null}>} picks
 * @param {number} dropCount
 * @returns {Set<string>} player_ids to mark is_dropped=1
 */
function computeDropIds(picks, dropCount) {
  if (dropCount <= 0) return new Set();

  const mc      = picks.filter(p => p.made_cut === 0);
  const active  = picks.filter(p => p.made_cut !== 0 && (p.round1 != null || p.round2 != null));

  const droppedIds = new Set(mc.map(p => p.player_id));
  const remainingDrops = Math.max(0, dropCount - mc.length);

  if (remainingDrops > 0) {
    [...active]
      .sort((a, b) => {
        const totalA = (a.round1 ?? 0) + (a.round2 ?? 0);
        const totalB = (b.round1 ?? 0) + (b.round2 ?? 0);
        return totalB - totalA ||                    // worst R1+R2 first
               (b.round1 ?? 0) - (a.round1 ?? 0);   // tiebreaker: worst R1
      })
      .slice(0, remainingDrops)
      .forEach(p => droppedIds.add(p.player_id));
  }

  return droppedIds;
}

module.exports = { applyDropScoring, computeDropIds };
