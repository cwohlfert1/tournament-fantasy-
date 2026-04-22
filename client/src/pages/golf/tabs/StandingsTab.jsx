import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { Flag, Trophy, Eye, BarChart3 } from 'lucide-react';
import api from '../../../api';
import PlayerAvatar from '../../../components/golf/PlayerAvatar';
import GolferStack from '../../../components/golf/GolferStack';
import { tierAccent } from '../../../utils/golfTierColors';
import { isStrokeBased, computeRanks, scoreColor } from './golfScoringUtils';

// Convert "Last, First" (DataGolf format) → "First Last"
function flipName(name) {
  if (!name) return name;
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    return first ? `${first} ${last}` : last;
  }
  return name;
}


const TIER_NAMES = { 1: 'Tier 1 · Elite', 2: 'Tier 2 · Premium', 3: 'Tier 3 · Mid-Field', 4: 'Tier 4 · Longshots' };

const RANK_COLORS = ['#fbbf24', '#d1d5db', '#f97316'];

// Flag emoji from 2-letter ISO country code
const toFlag = code => {
  if (!code || code.length !== 2) return '⛳';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
};

function RankBadge({ rank, isTied }) {
  const label = isTied ? `T${rank}` : String(rank);
  if (rank <= 3) return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${RANK_COLORS[rank-1]}22`, border: `1.5px solid ${RANK_COLORS[rank-1]}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: RANK_COLORS[rank-1], fontSize: 13, fontWeight: 800 }}>{label}</span>
    </div>
  );
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function AvatarCircle({ name, isMe }) {
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? 'rgba(0,232,122,0.15)' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${isMe ? 'rgba(0,232,122,0.35)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: isMe ? '#22c55e' : '#9ca3af', letterSpacing: '0.03em' }}>{initials}</span>
    </div>
  );
}

function PrizeCard({ prizeTotal, buyIn, memberCount, payoutSplits }) {
  const total  = prizeTotal || (buyIn * memberCount);
  const isOverride = prizeTotal && prizeTotal !== buyIn * memberCount;
  const fmtAmt = n => n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
  const MEDAL_COLORS = ['#fbbf24', '#d1d5db', '#f97316'];
  const ordinals = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th'];
  const places = (payoutSplits || []).map((s, i) => ({
    color: MEDAL_COLORS[i] || '#6b7280',
    label: ordinals[i] || `${i + 1}th`,
    pct: s.pct,
    amt: Math.round(total * s.pct / 100),
  }));
  return (
    <div style={{ background: '#111827', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Trophy style={{ width: 14, height: 14, color: '#f59e0b' }} />
          </div>
          <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Prize Pool</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{fmtAmt(total)}</div>
          {isOverride
            ? <div style={{ color: '#6b7280', fontSize: 11 }}>Test prize pool</div>
            : <div style={{ color: '#6b7280', fontSize: 11 }}>${buyIn} × {memberCount} teams</div>
          }
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(places.length, 5)}, 1fr)`, gap: 0 }}>
        {places.slice(0, 10).map(({ color, label, pct, amt }, i) => (
          <div key={label} style={{ padding: '12px 14px', borderRight: i < Math.min(places.length, 5) - 1 ? '1px solid rgba(245,158,11,0.1)' : 'none', textAlign: 'center' }}>
            <div style={{ width: places.length > 5 ? 20 : 26, height: places.length > 5 ? 20 : 26, borderRadius: '50%', background: `${color}18`, border: `1.5px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: places.length > 5 ? 10 : 12, fontWeight: 800, color }}>
              {i + 1}
            </div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: places.length > 5 ? 14 : 16 }}>{fmtAmt(amt)}</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{label} · {pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}


// Top-3 row tints: subtle gradient backgrounds for money positions
const TOP3_BG = {
  1: 'linear-gradient(90deg, rgba(251,191,36,0.06) 0%, transparent 60%)',
  2: 'linear-gradient(90deg, rgba(209,213,219,0.05) 0%, transparent 60%)',
  3: 'linear-gradient(90deg, rgba(249,115,22,0.05) 0%, transparent 60%)',
};

const LeaderboardRow = memo(function LeaderboardRow({
  s, rankInfo, expandContent, canExpand,
  currentUserId, expanded, setExpanded, rowRefs,
  hasPrize, prizeTotal, payoutSplits, isTotalStrokes, hasScores,
  winningScore, showStack = false,
}) {
  const isMe   = s.user_id === currentUserId;
  const rowKey = `${s.user_id}_${s.entry_number || 1}`;
  const isOpen = expanded === rowKey;
  const pts    = s.season_points ?? 0;
  const myPrize = hasPrize ? prizeForRank(rankInfo.rank, prizeTotal, payoutSplits) : null;
  const ptColor = scoreColor(pts, isTotalStrokes ? 'stroke_play' : 'tourneyrun');
  const isBot  = /^bot[\s_]?\d/i.test(s.username || '');
  const expandRef = useRef(null);

  const baseBg = isMe
    ? 'rgba(0,232,122,0.04)'
    : TOP3_BG[rankInfo.rank] || 'transparent';

  return (
    <div ref={el => { rowRefs.current[rowKey] = el; }} style={{ borderLeft: `3px solid ${isMe ? '#22c55e' : 'transparent'}`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <button
        onClick={e => {
          if (!canExpand) return;
          e.preventDefault();
          e.stopPropagation();
          setExpanded(isOpen ? null : rowKey);
          setTimeout(() => {
            rowRefs.current[rowKey]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 10);
        }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px 11px 11px', background: baseBg, border: 'none', cursor: canExpand ? 'pointer' : 'default', textAlign: 'left', transition: 'background 0.15s' }}
        onMouseEnter={e => { if (canExpand) e.currentTarget.style.background = isMe ? 'rgba(0,232,122,0.07)' : 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = baseBg; }}
      >
        <RankBadge rank={rankInfo.rank} isTied={rankInfo.tied} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
            <span style={{ color: isMe ? '#22c55e' : '#fff', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.team_name}
            </span>
            {isBot && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', background: '#1f2937', border: '1px solid #374151', padding: '1px 5px', borderRadius: 4, letterSpacing: '0.05em', flexShrink: 0 }}>BOT</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <div style={{ color: '#4b5563', fontSize: 11, flexShrink: 0 }}>{s.username}</div>
            {showStack && s.picks?.length > 0 && (
              <GolferStack picks={s.picks} max={3} size={20} />
            )}
          </div>
        </div>
        {hasPrize && (
          <div style={{ textAlign: 'right', minWidth: 44, flexShrink: 0 }}>
            {myPrize ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>${myPrize.toLocaleString()}</span>
            ) : (
              <span style={{ fontSize: 11, color: '#374151' }}>—</span>
            )}
          </div>
        )}
        <div style={{ textAlign: 'right', minWidth: 50, flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: hasScores ? ptColor : '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
            {hasScores
              ? isTotalStrokes
                ? pts === 0 ? 'E' : (pts < 0 ? '' : '+') + Math.round(pts)
                : (pts > 0 ? '+' : '') + pts.toFixed(1)
              : '—'}
          </div>
          <div style={{ color: '#4b5563', fontSize: 10 }}>{isTotalStrokes ? '' : 'pts'}</div>
          {s.tiebreaker_score != null && hasScores && rankInfo.tied && (
            <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 500, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
              TB: {s.tiebreaker_score > 0 ? '+' : ''}{s.tiebreaker_score}
            </div>
          )}
          {winningScore != null && s.tiebreaker_score != null && (() => {
            const delta = Math.abs(s.tiebreaker_score - winningScore);
            return (
              <div style={{ fontSize: 9, color: delta === 0 ? '#22c55e' : '#4b5563', fontWeight: 600, marginTop: 1 }}>
                {delta === 0 ? 'Exact match' : `Off by ${delta}`}
              </div>
            );
          })()}
        </div>
        {canExpand && (
          <svg style={{ width: 16, height: 16, color: '#6b7280', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      <div
        ref={expandRef}
        style={{
          overflow: 'hidden',
          maxHeight: isOpen ? (expandRef.current?.scrollHeight || 600) + 'px' : '0px',
          transition: 'max-height 0.25s ease',
          background: 'rgba(0,0,0,0.25)',
          borderTop: isOpen ? '1px solid rgba(255,255,255,0.04)' : 'none',
        }}
      >
        {expandContent}
      </div>
    </div>
  );
});

function prizeForRank(rank, total, payoutSplits) {
  if (!total || !payoutSplits) return null;
  const split = payoutSplits.find(p => p.place === rank);
  if (!split) return null;
  return Math.round(total * split.pct / 100);
}

// ── Sweat Mode: My Picks Live ────────────────────────────────────────────────
function SweatView({ liveData, liveLoading, standings, ranks, currentUserId, isTotalStrokes, hasPrize, prizeTotal, payoutSplits, fetchLive }) {
  if (liveLoading && !liveData) return <div style={{ padding: '40px 0', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>Loading live data...</div>;
  if (!liveData || !liveData.competitors?.length) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ color: '#4b5563', fontSize: 13 }}>Live scoring not available yet. Check back when the tournament is in progress.</div>
    </div>
  );

  const competitors = liveData.competitors || [];
  const myPickNames = new Set((liveData.my_pick_names || []).map(n => n.toLowerCase()));

  // Find my standings entry
  const myEntry = standings.find(s => s.user_id === currentUserId && (s.entry_number || 1) === 1);
  const myRankIdx = standings.findIndex(s => s.user_id === currentUserId && (s.entry_number || 1) === 1);
  const myRank = myRankIdx >= 0 ? ranks[myRankIdx] : null;
  const myScore = myEntry?.season_points ?? 0;
  const myPrize = hasPrize && myRank ? prizeForRank(myRank.rank, prizeTotal, payoutSplits) : null;

  // Leader info
  const leader = standings[0];
  const leaderScore = leader?.season_points ?? 0;
  const gap = isTotalStrokes ? myScore - leaderScore : leaderScore - myScore;

  // Match my picks to live ESPN competitors
  const myPicks = (myEntry?.picks || []).map(pick => {
    const name = pick.player_name?.toLowerCase() || '';
    // Match by name — try exact match first, then fuzzy (last name)
    let live = competitors.find(c => c.name?.toLowerCase() === name);
    if (!live) {
      const lastName = name.split(',')[0]?.trim() || name.split(' ').pop();
      live = competitors.find(c => c.name?.toLowerCase().includes(lastName));
    }
    return { ...pick, live };
  });

  // Sort: active players first (by position), then finished, then cut/WD
  myPicks.sort((a, b) => {
    const aActive = a.live && !a.live.isCut && !a.live.isWD && a.live.thru !== null && a.live.thru < 18;
    const bActive = b.live && !b.live.isCut && !b.live.isWD && b.live.thru !== null && b.live.thru < 18;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return (a.live?.sortOrder || 999) - (b.live?.sortOrder || 999);
  });

  const fmtPar = n => n == null ? '—' : n === 0 ? 'E' : (n > 0 ? '+' : '') + n;
  const parColor = n => n == null ? '#6b7280' : n < 0 ? '#22c55e' : n > 0 ? '#ef4444' : '#9ca3af';

  // Hole symbols
  const holeSymbol = (topar) => {
    if (topar === 'Eagle' || topar === 'Double Eagle' || topar === 'Albatross') return { sym: '◎', color: '#f59e0b' };
    if (topar === 'Birdie') return { sym: '●', color: '#22c55e' };
    if (topar === 'Par') return { sym: '·', color: '#4b5563' };
    if (topar === 'Bogey') return { sym: '□', color: '#ef4444' };
    return { sym: '■', color: '#dc2626' }; // double+
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* My position summary */}
      <div style={{ background: '#111827', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {myRank && (
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: myRank.rank <= 3 ? `${RANK_COLORS[myRank.rank-1]}22` : 'rgba(255,255,255,0.04)', border: `2px solid ${myRank.rank <= 3 ? RANK_COLORS[myRank.rank-1] : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: myRank.rank <= 3 ? RANK_COLORS[myRank.rank-1] : '#9ca3af', fontSize: 15, fontWeight: 800 }}>
                  {myRank.tied ? 'T' : ''}{myRank.rank}
                </span>
              </div>
            )}
            <div>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{myEntry?.team_name || 'My Team'}</div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>
                {standings.length} teams{myRank?.rank === 1 ? ' · Leading' : gap > 0 && isTotalStrokes ? ` · ${gap} from lead` : ''}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: parColor(myScore), fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {fmtPar(myScore)}
            </div>
            {myPrize && <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700 }}>${myPrize.toLocaleString()}</div>}
          </div>
        </div>

        {/* Gap to positions above/below */}
        {myRankIdx > 0 && (
          <div style={{ display: 'flex', gap: 12, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
            {myRankIdx > 0 && (() => {
              const above = standings[myRankIdx - 1];
              const aboveGap = isTotalStrokes ? myScore - (above?.season_points ?? 0) : (above?.season_points ?? 0) - myScore;
              return (
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#4b5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>To overtake {above?.team_name?.split(' ')[0]}</div>
                  <div style={{ color: '#d1d5db', fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                    {aboveGap === 0 ? 'Tied' : `Need ${Math.abs(aboveGap)} stroke${Math.abs(aboveGap) !== 1 ? 's' : ''}`}
                  </div>
                </div>
              );
            })()}
            {myRankIdx < standings.length - 1 && (() => {
              const below = standings[myRankIdx + 1];
              const belowGap = isTotalStrokes ? (below?.season_points ?? 0) - myScore : myScore - (below?.season_points ?? 0);
              return (
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#4b5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lead over {below?.team_name?.split(' ')[0]}</div>
                  <div style={{ color: '#d1d5db', fontSize: 13, fontWeight: 700, marginTop: 2 }}>
                    {belowGap === 0 ? 'Tied' : `${Math.abs(belowGap)} stroke${Math.abs(belowGap) !== 1 ? 's' : ''}`}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* My picks — live */}
      {myPicks.map((pick, pi) => {
        const l = pick.live;
        const isActive = l && !l.isCut && !l.isWD && l.thru != null && l.thru < 18;
        const isFinished = l && l.thru === 18;
        const isCutWd = l?.isCut || l?.isWD;

        // Current round hole-by-hole
        const currentRoundHoles = l?.rounds?.length > 0 ? l.rounds[l.rounds.length - 1]?.holes || [] : [];
        const lastHoles = currentRoundHoles.slice(-5);

        return (
          <div key={pi} style={{ background: '#111827', border: `1px solid ${isActive ? 'rgba(34,197,94,0.15)' : isCutWd ? 'rgba(239,68,68,0.15)' : '#1f2937'}`, borderRadius: 14, overflow: 'hidden' }}>
            {/* Player header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
              <PlayerAvatar name={pick.player_name} tier={pick.tier_number} espnPlayerId={pick.espn_player_id} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: isCutWd ? '#6b7280' : '#fff', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isCutWd ? 'line-through' : 'none' }}>
                    {flipName(pick.player_name)}
                  </span>
                  <span style={{ fontSize: 8, fontWeight: 700, color: tierAccent(pick.tier_number), background: `${tierAccent(pick.tier_number)}18`, padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>T{pick.tier_number}</span>
                </div>
                <div style={{ color: '#4b5563', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  {l ? (
                    <>
                      <span>{l.posText || '—'}</span>
                      {isActive && <span style={{ color: '#22c55e' }}>Thru {l.thru}</span>}
                      {isFinished && <span style={{ color: '#9ca3af' }}>F</span>}
                      {l.isCut && <span style={{ color: '#ef4444', fontWeight: 700 }}>MC</span>}
                      {l.isWD && <span style={{ color: '#ef4444', fontWeight: 700 }}>WD</span>}
                    </>
                  ) : (
                    <span>No live data</span>
                  )}
                </div>
              </div>
              {l && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: parColor(l.total), fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtPar(l.total)}
                  </div>
                  {l.today != null && (
                    <div style={{ color: parColor(l.today), fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      Today: {fmtPar(l.today)}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Last holes strip — only for active/finished players */}
            {lastHoles.length > 0 && !isCutWd && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#4b5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Last {lastHoles.length}</span>
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  {lastHoles.map(h => {
                    const { sym, color } = holeSymbol(h.topar);
                    return (
                      <div key={h.hole} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 24 }}>
                        <span style={{ fontSize: 14, color, lineHeight: 1 }}>{sym}</span>
                        <span style={{ fontSize: 8, color: '#4b5563', marginTop: 1 }}>{h.hole}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Round scores */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {l?.rounds?.map(r => (
                    <span key={r.round} style={{ fontSize: 10, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
                      R{r.round}: {r.strokes || '—'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Auto-refresh indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '4px 0' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
        <span style={{ color: '#4b5563', fontSize: 10 }}>Auto-refreshing every 60s</span>
        <button type="button" onClick={fetchLive}
          style={{ color: '#6b7280', fontSize: 10, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
          Refresh now
        </button>
      </div>
    </div>
  );
}

export default function StandingsTab({ leagueId, league, currentUserId }) {
  const [data, setData]           = useState(null);
  const [payouts, setPayouts]     = useState(null); // { net_pool, payouts: [{ place, pct, amount }] }
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]   = useState(null);
  const rowRefs = useRef({});
  const [viewMode, setViewMode]   = useState('leaderboard'); // 'leaderboard' | 'sweat'
  const [liveData, setLiveData]   = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const liveInterval = useRef(null);

  const fetchStandings = (opts = {}) => {
    if (opts.refresh) setRefreshing(true);
    const url = opts.refresh
      ? `/golf/leagues/${leagueId}/standings?sync=true`
      : `/golf/leagues/${leagueId}/standings`;
    return api.get(url)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { fetchStandings(); }, [leagueId]); // eslint-disable-line

  // Fetch player-safe payout breakdown (net pool + per-place amounts, admin fee hidden).
  useEffect(() => {
    if (!leagueId) return;
    api.get(`/golf/pools/${leagueId}/payouts`)
      .then(r => setPayouts(r.data))
      .catch(() => setPayouts(null));
  }, [leagueId]);

  useEffect(() => {
    if (data && currentUserId) {
      const myRow = (data.standings || []).find(s => s.user_id === currentUserId && (s.entry_number || 1) === 1);
      if (myRow) setExpanded(`${currentUserId}_1`);
    }
  }, [data, currentUserId]); // eslint-disable-line

  // Fetch live PGA data when sweat mode is active
  const fetchLive = useCallback(() => {
    api.get(`/golf/leagues/${leagueId}/pga-live`)
      .then(r => setLiveData(r.data))
      .catch(() => {});
  }, [leagueId]);

  useEffect(() => {
    if (viewMode !== 'sweat') {
      if (liveInterval.current) { clearInterval(liveInterval.current); liveInterval.current = null; }
      return;
    }
    setLiveLoading(true);
    fetchLive();
    setLiveLoading(false);
    liveInterval.current = setInterval(fetchLive, 60_000);
    return () => { if (liveInterval.current) clearInterval(liveInterval.current); };
  }, [viewMode, fetchLive]);

  // All derived values and hooks must be declared before any early return
  const standings    = data?.standings || [];
  const scoringStyle = data?.scoring_style || 'fantasy_points';
  // True for ALL stroke-based styles: 'stroke_play', 'total_score', 'total_strokes'
  // This controls color direction (negative=green), sort order, and display format.
  const isTotalStrokes = isStrokeBased(scoringStyle);
  const winningScore = data?.winning_score ?? null;
  const ranks = useMemo(
    () => computeRanks(standings, scoringStyle, winningScore),
    [standings, scoringStyle, winningScore],
  );

  if (loading) return <div className="py-10 text-center text-gray-500 text-sm">Loading standings…</div>;

  const isPool      = data?.format === 'pool' || data?.format === 'salary_cap' || data?.format === 'draft';
  const tournament  = data?.tournament;
  const isLive      = tournament?.status === 'active';
  const isComplete  = tournament?.status === 'completed' || tournament?.status === 'complete';
  const hasScores   = data?.has_scores;
  const tournamentWinner = data?.tournament_winner;

  // Parse payout splits from JSONB (source of truth). Never reads admin_fee_*.
  const payoutSplits = (() => {
    try {
      const raw = league?.payout_places;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string' && raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [{ place: 1, pct: 70 }, { place: 2, pct: 20 }, { place: 3, pct: 10 }];
  })();
  // Prize pool: prefer API-computed net_pool (hides admin fee).
  // Falls back to payout_pool_override or gross × entries during initial load.
  const netPoolFromApi = payouts?.net_pool;
  const grossFallback = league?.payout_pool_override
    ? league.payout_pool_override
    : (league?.buy_in_amount || 0) * standings.length;
  const prizeTotal = Number.isFinite(netPoolFromApi) ? netPoolFromApi : grossFallback;
  const hasPrize = prizeTotal > 0 && standings.length > 0;

  if (standings.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500">
        <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
          <Flag className="w-7 h-7 text-gray-600" />
        </div>
        <p className="text-sm">No members yet.</p>
      </div>
    );
  }

  // ── Completed tournament banner
  const CompletedBanner = isComplete && tournament ? (
    <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.1), rgba(245,158,11,0.05))', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 14, padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
      <div style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
        {tournament.name} — Final Results
      </div>
      {tournamentWinner && (
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginTop: 4 }}>
          Winner: {tournamentWinner} · {winningScore != null ? (winningScore === 0 ? 'E' : (winningScore > 0 ? '+' : '') + winningScore) : ''}
        </div>
      )}
    </div>
  ) : null;

  // ── Pool leaderboard
  if (isPool) {
    const dropCount    = data?.drop_count ?? 2;
    const dropsApplied = !!data?.drops_applied;
    const picksPerTeam = data?.picks_per_team || 8;
    const countingPicks = picksPerTeam - dropCount;
    const picksRevealed = !!data?.picks_revealed;

    const allPicks = standings.flatMap(s => s.picks || []);
    let currentRound = 0;
    if (allPicks.some(p => p.round4 != null)) currentRound = 4;
    else if (allPicks.some(p => p.round3 != null)) currentRound = 3;
    else if (allPicks.some(p => p.round2 != null)) currentRound = 2;
    else if (allPicks.some(p => p.round1 != null)) currentRound = 1;

    const fmtScore = r => {
      if (r == null) return <span style={{ color: '#374151' }}>—</span>;
      const color = r < 0 ? '#22c55e' : r > 0 ? '#ef4444' : '#9ca3af';
      const label = r === 0 ? 'E' : (r > 0 ? `+${r}` : String(r));
      return <span style={{ color }}>{label}</span>;
    };

    function PoolExpandContent({ picks, dropsLocked }) {
      if (!picks || picks.length === 0) return null;

      // Sort all picks by score (best first), not grouped by tier
      const sorted = [...picks].sort((a, b) => {
        if (isTotalStrokes) {
          const aTotal = [a.round1, a.round2, a.round3, a.round4].filter(r => r != null).reduce((s, r) => s + r, 0);
          const bTotal = [b.round1, b.round2, b.round3, b.round4].filter(r => r != null).reduce((s, r) => s + r, 0);
          return aTotal - bTotal;
        }
        return (b.fantasy_points || 0) - (a.fantasy_points || 0);
      });

      return (
        <div style={{ padding: '12px 14px 14px' }}>
              {sorted.map((p, pi) => {
                  const tier = p.tier_number || 0;
                  const isWD = p.round1 == null && p.made_cut === 0 && p.finish_position == null;
                  if (isTotalStrokes) {
                    const rounds = [p.round1, p.round2, p.round3, p.round4].filter(r => r != null);
                    const playerTotal = p.player_total ?? rounds.reduce((s, r) => s + r, 0);
                    const hasRounds = rounds.length > 0;
                    const isDropped  = p.is_dropped;
                    const isPending  = p.is_pending;
                    const isMC       = p.is_mc || (p.made_cut === 0);
                    return (
                      <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: pi > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none', opacity: isDropped ? 0.45 : 1, borderLeft: `2px solid ${tierAccent(p.tier_number || tier)}`, paddingLeft: 8 }}>
                        <PlayerAvatar name={p.player_name} tier={p.tier_number || tier} espnPlayerId={p.espn_player_id} size={24} />
                        <span style={{ flex: 1, color: isDropped ? '#6b7280' : '#d1d5db', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isDropped ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{toFlag(p.country)}</span>
                          {flipName(p.player_name)}
                          <span style={{ fontSize: 8, fontWeight: 700, color: tierAccent(tier), background: `${tierAccent(tier)}18`, padding: '1px 4px', borderRadius: 3, flexShrink: 0, letterSpacing: '0.04em' }}>T{tier}</span>
                        </span>
                        {isDropped && (dropsLocked
                          ? <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>DROPPED</span>
                          : <span style={{ fontSize: 9, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>DROPPING</span>
                        )}
                        {isMC && !isDropped && <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>MC</span>}
                        {isPending && <span style={{ fontSize: 9, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>TBD</span>}
                        {isWD ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', padding: '1px 5px', borderRadius: 4 }}>WD</span>
                        ) : (
                          <>
                            {[p.round1, p.round2, p.round3, p.round4].map((r, ri) => (
                              currentRound >= ri + 1 ? (
                                <span key={ri} style={{ fontSize: 11, color: '#6b7280', minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                                  {fmtScore(r)}
                                </span>
                              ) : null
                            ))}
                            <span style={{ fontSize: 12, fontWeight: 700, minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: hasRounds && !isDropped ? (playerTotal < 0 ? '#22c55e' : playerTotal > 0 ? '#ef4444' : '#9ca3af') : '#374151' }}>
                              {hasRounds ? (playerTotal === 0 ? 'E' : (playerTotal > 0 ? '+' : '') + playerTotal) : '—'}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  }
                  const fp = p.fantasy_points || 0;
                  const fpColor = fp > 0 ? '#22c55e' : fp < 0 ? '#ef4444' : '#6b7280';
                  return (
                    <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: pi > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none', borderLeft: `2px solid ${tierAccent(p.tier_number || tier)}`, paddingLeft: 8 }}>
                      <PlayerAvatar name={p.player_name} tier={p.tier_number || tier} espnPlayerId={p.espn_player_id} size={24} />
                      <span style={{ flex: 1, color: '#d1d5db', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12, lineHeight: 1, flexShrink: 0 }}>{toFlag(p.country)}</span>
                        {p.player_name}
                        <span style={{ fontSize: 8, fontWeight: 700, color: tierAccent(tier), background: `${tierAccent(tier)}18`, padding: '1px 4px', borderRadius: 3, flexShrink: 0, letterSpacing: '0.04em' }}>T{tier}</span>
                      </span>
                      {isWD ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', padding: '1px 5px', borderRadius: 4 }}>WD</span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {currentRound > 0 ? fmtScore(p[`round${currentRound}`]) : '—'}
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: fpColor, minWidth: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {fp !== 0 ? (fp > 0 ? '+' : '') + fp.toFixed(1) : hasScores ? '0.0' : '—'}
                      </span>
                    </div>
                  );
                })}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {tournament && (
          <div style={{ background: '#111827', border: `1px solid ${isLive ? 'rgba(0,232,122,0.2)' : '#1f2937'}`, borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{tournament.name}</div>
                <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>
                  {[tournament.course, tournament.start_date?.slice(0, 10)].filter(Boolean).join(' · ')}
                </div>
                {currentRound > 0 && (
                  <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>
                    Round {currentRound} of 4{isLive ? ' · In Progress' : tournament.status === 'completed' ? ' · Final' : ''}
                  </div>
                )}
                {tournament.status === 'completed' && winningScore != null && (
                  <div style={{ color: '#f59e0b', fontSize: 11, fontWeight: 700, marginTop: 4 }}>
                    Winner: {winningScore === 0 ? 'E' : (winningScore > 0 ? '+' : '') + winningScore}
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {isLive ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,232,122,0.12)', border: '1px solid rgba(0,232,122,0.3)', color: '#22c55e', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live
                  </span>
                ) : tournament.status === 'completed' ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#1f2937', border: '1px solid #374151', padding: '3px 10px', borderRadius: 20 }}>Final</span>
                ) : (
                  <span style={{ color: '#4b5563', fontSize: 11 }}>Starts {tournament.start_date?.slice(0, 10)}</span>
                )}
                <button
                  onClick={() => fetchStandings({ refresh: true })}
                  disabled={refreshing}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #374151', color: refreshing ? '#4b5563' : '#9ca3af', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, cursor: refreshing ? 'default' : 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
                  onMouseEnter={e => { if (!refreshing) { e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.color = '#d1d5db'; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = refreshing ? '#4b5563' : '#9ca3af'; }}
                >
                  {refreshing ? '⟳' : '↻'} {refreshing ? 'Refreshing…' : 'Refresh Scores'}
                </button>
              </div>
            </div>
          </div>
        )}

        {CompletedBanner}

        {/* View mode toggle — only show during live or completed tournaments with scores */}
        {(isLive || hasScores) && (
          <div style={{ display: 'flex', background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: 3, gap: 2 }}>
            {[
              { key: 'leaderboard', label: 'Leaderboard', icon: BarChart3 },
              { key: 'sweat', label: 'My Picks Live', icon: Eye },
            ].map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setViewMode(key)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.15s',
                  background: viewMode === key ? 'rgba(34,197,94,0.15)' : 'transparent',
                  color: viewMode === key ? '#22c55e' : '#6b7280',
                  border: viewMode === key ? '1px solid rgba(34,197,94,0.3)' : '1px solid transparent',
                }}>
                <Icon style={{ width: 14, height: 14 }} />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Sweat Mode — My Picks Live */}
        {viewMode === 'sweat' ? (
          <SweatView
            liveData={liveData}
            liveLoading={liveLoading}
            standings={standings}
            ranks={ranks}
            currentUserId={currentUserId}
            isTotalStrokes={isTotalStrokes}
            hasPrize={hasPrize}
            prizeTotal={prizeTotal}
            payoutSplits={payoutSplits}
            fetchLive={fetchLive}
          />
        ) : (
        <>
        {hasPrize && <PrizeCard prizeTotal={prizeTotal} buyIn={league?.buy_in_amount || 0} memberCount={standings.length} payoutSplits={payoutSplits} />}

{isTotalStrokes && dropCount > 0 && (
          <div style={{ background: 'rgba(107,114,128,0.08)', border: '1px solid rgba(107,114,128,0.2)', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#6b7280', fontSize: 12 }}>
              Top {countingPicks} scores will count — worst {dropCount} will be auto-dropped.
            </span>
          </div>
        )}

        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 11px', borderBottom: '1px solid #1f2937' }}>
            <div style={{ width: 30, flexShrink: 0, textAlign: 'center', color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>#</div>
            <div style={{ flex: 1, color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Team</div>
            {hasPrize && <div style={{ minWidth: 44, flexShrink: 0 }} />}
            <div style={{ minWidth: 50, textAlign: 'right', color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>{isTotalStrokes ? 'Score' : 'Pts'}</div>
            <div style={{ width: 12, flexShrink: 0 }} />
          </div>

          {standings.map((s, i) => {
            const picksShown = s.picks?.length > 0 && (picksRevealed || s.user_id === currentUserId);
            return (
              <LeaderboardRow
                key={`${s.user_id}_${s.entry_number || 1}`}
                s={s} i={i}
                rankInfo={ranks[i]}
                canExpand={!!s.submitted && picksShown}
                expandContent={picksShown ? <PoolExpandContent picks={s.picks} dropsLocked={dropsApplied} /> : null}
                currentUserId={currentUserId} expanded={expanded} setExpanded={setExpanded} rowRefs={rowRefs}
                hasPrize={hasPrize} prizeTotal={prizeTotal} payoutSplits={payoutSplits}
                isTotalStrokes={isTotalStrokes} hasScores={hasScores} winningScore={winningScore}
                showStack={picksShown}
              />
            );
          })}
        </div>

        {!hasPrize && (
          <p style={{ color: '#374151', fontSize: 11, textAlign: 'center' }}>No buy-in · bragging rights only</p>
        )}
        </>
        )}
      </div>
    );
  }

  // ── TourneyRun / DK standings
  function TourneyExpandContent({ s }) {
    const weekPts = s.points_this_week != null ? Number(s.points_this_week) : null;
    const tournsPlayed = s.tournaments_played || 0;
    return (
      <div style={{ padding: '12px 14px', display: 'flex', gap: 24 }}>
        {weekPts !== null && (
          <div>
            <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>This Week</div>
            <div style={{ color: weekPts > 0 ? '#22c55e' : weekPts < 0 ? '#ef4444' : '#9ca3af', fontSize: 15, fontWeight: 800 }}>
              {weekPts > 0 ? '+' : ''}{weekPts.toFixed(1)}
            </div>
          </div>
        )}
        <div>
          <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Events</div>
          <div style={{ color: '#9ca3af', fontSize: 15, fontWeight: 800 }}>{tournsPlayed}</div>
        </div>
        <div>
          <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Season Pts</div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 800 }}>{(s.season_points || 0).toFixed(1)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {CompletedBanner}
      {hasPrize && <PrizeCard prizeTotal={prizeTotal} buyIn={league?.buy_in_amount || 0} memberCount={standings.length} payoutSplits={payoutSplits} />}

      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 11px', borderBottom: '1px solid #1f2937' }}>
          <div style={{ width: 30, flexShrink: 0 }} />
          <div style={{ width: 32, flexShrink: 0 }} />
          <div style={{ flex: 1, color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Team</div>
          {hasPrize && <div style={{ minWidth: 44, textAlign: 'right', color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>Prize</div>}
          <div style={{ minWidth: 50, textAlign: 'right', color: '#4b5563', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>Pts</div>
          <div style={{ width: 12, flexShrink: 0 }} />
        </div>

        {standings.map((s, i) => (
          <LeaderboardRow
            key={s.user_id}
            s={s} i={i}
            rankInfo={ranks[i]}
            canExpand={true}
            expandContent={<TourneyExpandContent s={s} />}
            currentUserId={currentUserId} expanded={expanded} setExpanded={setExpanded} rowRefs={rowRefs}
            hasPrize={hasPrize} prizeTotal={prizeTotal} payoutSplits={payoutSplits}
            isTotalStrokes={isTotalStrokes} hasScores={hasScores}
          />
        ))}
      </div>

      {!hasPrize && (
        <p style={{ color: '#374151', fontSize: 11, textAlign: 'center' }}>No buy-in · bragging rights only</p>
      )}
    </div>
  );
}
