import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Lock, Trophy, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui';
import api from '../../../api';
import GolfLoader from '../../../components/golf/GolfLoader';

const ROSTER_TIER_COLORS = {
  1: { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'rgba(245,158,11,0.3)', accent: '#f59e0b', label: '#fbbf24' },
  2: { bg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'rgba(139,92,246,0.3)', accent: '#8b5cf6', label: '#a78bfa' },
  3: { bg: 'linear-gradient(135deg,#3b82f6,#2563eb)', border: 'rgba(59,130,246,0.3)', accent: '#3b82f6', label: '#60a5fa' },
  4: { bg: 'linear-gradient(135deg,#10b981,#059669)', border: 'rgba(16,185,129,0.3)', accent: '#10b981', label: '#34d399' },
};
const TIER_NAMES_ROSTER = { 1: 'Tier 1 · Elite', 2: 'Tier 2 · Premium', 3: 'Tier 3 · Mid-Field', 4: 'Tier 4 · Longshots' };

function fmtOdds(raw) {
  if (!raw) return '';
  return (raw + '').replace(':', '/');
}

function getRounds(pick) {
  const rounds = [pick.round1, pick.round2, pick.round3, pick.round4].filter(r => r != null);
  return rounds;
}

function getTodayScore(pick) {
  const rounds = getRounds(pick);
  return rounds.length ? rounds[rounds.length - 1] : null;
}

function fmtScore(val) {
  if (val == null) return '-';
  if (val === 0) return 'E';
  return val > 0 ? `+${val}` : `${val}`;
}

function scoreColor(val) {
  if (val == null) return '#9ca3af';
  if (val < 0) return '#22c55e';
  if (val > 0) return '#f87171';
  return '#e5e7eb';
}

// Flag emoji from 2-letter ISO country code
const toFlag = code => {
  if (!code || code.length !== 2) return '🏌️';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
};

// Format tee time for player card: "Thu 8:14 AM"
function fmtTeeTimeShort(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const mm = m < 10 ? `0${m}` : String(m);
    return `${days[d.getDay()]} ${h}:${mm} ${ampm}`;
  } catch { return null; }
}

// ── Picks countdown timer
function PicksCountdown({ lockTime }) {
  const [display, setDisplay] = useState('');
  const [urgent, setUrgent] = useState(false);
  useEffect(() => {
    function tick() {
      const diff = new Date(lockTime) - Date.now();
      if (diff <= 0) { setDisplay('Picks closed'); setUrgent(false); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setUrgent(diff < 3600000);
      setDisplay(d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockTime]);
  return <span style={{ fontFamily: 'monospace', fontWeight: 700, color: urgent ? '#f87171' : '#22c55e' }}>{display}</span>;
}

// ── Tier picker bottom-sheet modal
function TierPickerModal({ tierNum, tierConfig, players, currentSel, onPick, onClose }) {
  const tc = ROSTER_TIER_COLORS[tierNum] || ROSTER_TIER_COLORS[4];
  const limit = tierConfig?.picks || 1;
  const remaining = limit - currentSel.length;
  const sorted = [...players].sort((a, b) => (a.odds_decimal || 999) - (b.odds_decimal || 999));
  const rgbMap = { '#f59e0b': '245,158,11', '#8b5cf6': '139,92,246', '#3b82f6': '59,130,246', '#10b981': '16,185,129' };
  const rgb = rgbMap[tc.accent] || '16,185,129';

  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter(p => p.player_name.toLowerCase().includes(q)) : sorted;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 560, background: '#111827', borderRadius: '20px 20px 0 0', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 999 }} />
        </div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: tc.accent }} />
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{TIER_NAMES_ROSTER[tierNum] || `Tier ${tierNum}`}</span>
            </div>
            <p style={{ color: '#6b7280', fontSize: 12, margin: '3px 0 0' }}>
              {remaining > 0 ? `Pick ${remaining} more player${remaining > 1 ? 's' : ''}` : 'Tier complete ✓'}
              {tierConfig?.odds_min && tierConfig?.odds_max && ` · ${fmtOdds(tierConfig.odds_min)} – ${fmtOdds(tierConfig.odds_max)}`}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: '#9ca3af', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Search bar */}
        <div style={{ padding: '10px 14px 2px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.05)',
            border: `1.5px solid ${searchFocused ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 12, padding: '0 14px', height: 44,
            transition: 'border-color 0.15s',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={searchFocused ? '#22c55e' : '#6b7280'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'stroke 0.15s' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              inputMode="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search players..."
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#f1f5f9', fontSize: 14, fontWeight: 500,
                caretColor: '#22c55e',
              }}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
              >×</button>
            )}
          </div>
        </div>

        {/* Player list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px 8px' }}>
          {sorted.length === 0 && (
            <p style={{ color: '#4b5563', textAlign: 'center', padding: 32, fontSize: 13 }}>No players in this tier yet</p>
          )}
          {filtered.length === 0 && sorted.length > 0 && (
            <p style={{ color: '#4b5563', textAlign: 'center', padding: 32, fontSize: 13 }}>No players found for "{query}"</p>
          )}
          {filtered.map(p => {
            const isSel = currentSel.includes(p.player_id);
            const isWDPlayer = !!p.is_withdrawn;
            const isFull = currentSel.length >= limit && !isSel;
            const isDisabled = isFull || isWDPlayer;
            return (
              <button
                key={p.player_id}
                onClick={() => !isDisabled && onPick(p.player_id, p.player_name)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 14px', marginBottom: 6,
                  background: isSel ? `rgba(${rgb},0.13)` : isWDPlayer ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${isSel ? tc.accent : isWDPlayer ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 12, cursor: isDisabled ? 'not-allowed' : 'pointer',
                  opacity: isFull ? 0.3 : isWDPlayer ? 0.5 : 1, transition: 'background 0.1s, border-color 0.1s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{toFlag(p.country)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: isWDPlayer ? '#6b7280' : '#f1f5f9', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isWDPlayer ? 'line-through' : 'none' }}>{p.player_name}</span>
                      {isWDPlayer && <span style={{ fontSize: 9, fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>WD</span>}
                    </div>
                    {p.world_ranking && <div style={{ color: '#4b5563', fontSize: 11, marginTop: 1 }}>WR #{p.world_ranking}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                  {p.odds_display && <span style={{ color: isWDPlayer ? '#4b5563' : tc.label, fontSize: 13, fontWeight: 600 }}>{fmtOdds(p.odds_display)}</span>}
                  {isSel && !isWDPlayer && (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: tc.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check style={{ width: 13, height: 13, color: '#fff' }} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {/* Done button for multi-pick tiers */}
        {limit > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <button
              onClick={onClose}
              style={{ width: '100%', background: currentSel.length >= limit ? '#22c55e' : '#1f2937', color: currentSel.length >= limit ? '#001a0d' : '#9ca3af', border: 'none', borderRadius: 12, padding: '12px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              {currentSel.length >= limit ? 'Done ✓' : `${currentSel.length}/${limit} selected · Done`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerCard({ pick, tier, idx, tournStatus, picksLocked, navigate, leagueId, teeTimeRaw, espnScheduled, espnCut, isDropped, isPending, espnFlagHref, espnCountryAlt, onRemove, isStrokeBased }) {
  const tc = ROSTER_TIER_COLORS[tier] || ROSTER_TIER_COLORS[4];
  const rounds = getRounds(pick);
  const todayRaw = getTodayScore(pick);
  const totalPar = pick.player_total ?? rounds.reduce((s, r) => s + (r || 0), 0);
  const pts = pick.fantasy_points;
  const isPreTournWD = !!pick.is_withdrawn;
  const isWD  = !isPreTournWD && pick.made_cut === 0 && pick.finish_position == null;
  const isCUT = (pick.made_cut === 0 && pick.finish_position != null) || espnCut;
  const hasScores = rounds.length > 0;
  const isLive = tournStatus === 'active';
  const isComplete = tournStatus === 'completed';
  const showTeeTime = !hasScores && !isCUT && !isWD && !isPreTournWD && !isPending && teeTimeRaw;
  const teeTxt = showTeeTime ? fmtTeeTimeShort(teeTimeRaw) : null;

  const isDropStyle = isDropped || isCUT || isWD || isPreTournWD;
  const countingBorder = !isDropStyle && hasScores ? '#22c55e' : tc.border;

  return (
    <div style={{
      background: isDropped ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isDropped ? 'rgba(107,114,128,0.2)' : countingBorder}`,
      borderRadius: 14,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      position: 'relative', overflow: 'hidden',
      animation: `fadeSlideUp 0.35s ease both`,
      animationDelay: `${idx * 60}ms`,
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      opacity: isDropStyle ? 0.45 : isPending ? 0.7 : 1,
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 24px ${tc.border}`; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      {espnFlagHref
        ? <img src={espnFlagHref} alt={espnCountryAlt || ''} style={{ width: 22, height: 15, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
        : <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{toFlag(pick.country)}</span>}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {pick.player_name}
          </span>
          {pick.odds_display && (
            <span style={{ fontSize: 11, color: tc.label, fontWeight: 600 }}>{fmtOdds(pick.odds_display)}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {pick.world_ranking && (
            <span style={{ fontSize: 11, color: '#6b7280' }}>WR #{pick.world_ranking}</span>
          )}
          {isLive && hasScores && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#22c55e' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Score column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0, minWidth: 70 }}>
        {isDropped ? (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.05em' }}>DROPPED</span>
        ) : isPending ? (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.05em' }}>PENDING</span>
        ) : hasScores && !isCUT && !isWD ? (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.25)', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.05em' }}>COUNTING</span>
        ) : null}
        {isPreTournWD && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: '#f87171', letterSpacing: '0.05em' }}>WD</div>
        )}
        {(isWD || isCUT) && (
          <div style={{
            background: isWD ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.15)',
            border: `1px solid ${isWD ? 'rgba(239,68,68,0.4)' : 'rgba(107,114,128,0.3)'}`,
            borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 700,
            color: isWD ? '#f87171' : '#9ca3af', letterSpacing: '0.05em',
          }}>{isWD ? 'WD' : 'MC'}</div>
        )}
        {hasScores && !isCUT ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, color: isDropped ? '#6b7280' : scoreColor(totalPar), lineHeight: 1, textDecoration: isDropped ? 'line-through' : 'none' }}>
              {fmtScore(totalPar)}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              {isLive ? `R${rounds.length}: ${fmtScore(todayRaw)}` : isComplete ? `Rd ${rounds.length}` : ''}
            </div>
            {pts != null && !isDropped && !isStrokeBased && (
              <div style={{ fontSize: 11, fontWeight: 700, color: tc.label }}>
                {pts > 0 ? '+' : ''}{pts} pts
              </div>
            )}
          </>
        ) : teeTxt ? (
          <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600, textAlign: 'right' }}>{teeTxt}</span>
        ) : ((!isCUT && !isWD && !isPending && onRemove) || (isPreTournWD && onRemove && !picksLocked)) ? (
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            style={{ width: 44, height: 44, background: isPreTournWD ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${isPreTournWD ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: '50%', cursor: 'pointer', color: isPreTournWD ? '#f87171' : '#9ca3af', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: -6 }}
          >×</button>
        ) : !isCUT && !isWD && !isPending ? (
          <span style={{ fontSize: 12, color: '#4b5563' }}>—</span>
        ) : null}
      </div>
    </div>
  );
}

function EmptySlot({ tier }) {
  const tc = ROSTER_TIER_COLORS[tier] || ROSTER_TIER_COLORS[4];
  return (
    <div style={{
      border: `1.5px dashed ${tc.border}`,
      borderRadius: 14, padding: '18px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      opacity: 0.6,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        border: `2px dashed ${tc.accent}`, flexShrink: 0, opacity: 0.5,
      }} />
      <span style={{ fontSize: 13, color: '#4b5563' }}>No pick selected</span>
    </div>
  );
}

// ── Pool Roster Tab (inline pick sheet)
export default function PoolRosterTab({ leagueId, league }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teeTimeMap, setTeeTimeMap] = useState({});

  const [selected, setSelected] = useState({});
  const [names, setNames]       = useState({});
  const [activeTier, setActiveTier] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [localSubmitted, setLocalSubmitted] = useState(null);

  async function load() {
    try {
      const r = await api.get(`/golf/leagues/${leagueId}/my-roster`);
      setData(r.data);
      setLocalSubmitted(null);
    } catch { setData(null); }
    setLoading(false);
    api.get(`/golf/leagues/${leagueId}/pga-live`).then(r => {
      const map = {};
      for (const c of (r.data?.competitors || [])) {
        const key = (c.name || '').toLowerCase().replace(/[.']/g, '').trim();
        map[key] = { teeTimeRaw: c.teeTimeRaw, isScheduled: c.isScheduled, isCut: c.isCut, isWD: c.isWD, flagHref: c.flagHref, countryAlt: c.countryAlt };
      }
      setTeeTimeMap(map);
    }).catch(() => {});
  }

  useEffect(() => { load(); }, [leagueId]); // eslint-disable-line

  useEffect(() => {
    if (activeTier == null || !data?.tiers) return;
    const t = data.tiers.find(t => t.tier === activeTier);
    if (!t) return;
    if ((selected[activeTier] || []).length >= (t.picks || 1)) {
      const id = setTimeout(() => setActiveTier(null), 180);
      return () => clearTimeout(id);
    }
  }, [selected, activeTier, data]);

  const picks        = data?.picks || [];
  const picksLocked  = data?.picks_locked ?? !!league.picks_locked;
  const submitted    = localSubmitted !== null ? localSubmitted : data?.submitted;
  const tiers        = data?.tiers || [];
  const lockTime     = data?.lock_time;
  const tourn        = data?.tournament;
  const tournStatus  = league.pool_tournament_status || tourn?.status;
  const dropCount    = data?.drop_count ?? league.pool_drop_count ?? 2;
  const teamScore    = data?.team_score;
  const picksPerTeam  = data?.picks_per_team || league.picks_per_team || 8;
  const isStrokeBased = ['stroke_play', 'total_score', 'total_strokes'].includes(league.scoring_style);

  const totalTarget = picksPerTeam;
  const totalDone   = Object.values(selected).flat().length;
  const canSubmit   = tiers.length > 0 && tiers.every(t => (selected[t.tier] || []).length === (t.picks || 0));

  function handlePick(tierNum, playerId, playerName) {
    const limit = tiers.find(t => t.tier === tierNum)?.picks || 1;
    setSelected(prev => {
      const curr = prev[tierNum] || [];
      if (curr.includes(playerId)) return { ...prev, [tierNum]: curr.filter(x => x !== playerId) };
      if (curr.length >= limit) return prev;
      return { ...prev, [tierNum]: [...curr, playerId] };
    });
    setNames(prev => ({ ...prev, [playerId]: playerName }));
  }

  function handleRemoveSubmittedPick(pick) {
    const remaining = (data?.picks || []).filter(p => p.player_id !== pick.player_id);
    const newSelected = {};
    const newNames = {};
    for (const p of remaining) {
      if (!newSelected[p.tier_number]) newSelected[p.tier_number] = [];
      newSelected[p.tier_number].push(p.player_id);
      newNames[p.player_id] = p.player_name;
    }
    setSelected(newSelected);
    setNames(newNames);
    setLocalSubmitted(false);
  }

  async function handleConfirmSubmit() {
    setSubmitting(true);
    setSubmitError('');
    const picksList = [];
    for (const [tn, ids] of Object.entries(selected)) {
      for (const pid of ids) {
        picksList.push({ player_id: pid, player_name: names[pid] || '', tier_number: parseInt(tn) });
      }
    }
    try {
      await api.post(`/golf/leagues/${leagueId}/picks`, {
        tournament_id: league.pool_tournament_id,
        picks: picksList,
      });
      setShowConfirm(false);
      await load();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Submission failed. Try again.');
    }
    setSubmitting(false);
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <GolfLoader />
    </div>
  );

  let tiersConfig = [];
  try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

  const inSelection = !submitted && !picksLocked;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: inSelection && tiers.length > 0 ? 104 : 40 }}>
      <style>{`@keyframes fadeSlideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>

      {/* ── SELECTION MODE ── */}
      {inSelection && (
        <>
          {tourn && (
            <div style={{ background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 12, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{tourn.name}</div>
                <div style={{ color: '#4b5563', fontSize: 12, marginTop: 2 }}>Picks lock 1 hour before first tee time Thursday</div>
              </div>
              {lockTime && <PicksCountdown lockTime={lockTime} />}
            </div>
          )}

          {tiers.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⛳</div>
              <p style={{ color: '#6b7280', fontSize: 14 }}>Pick sheet isn't ready yet — check back soon.</p>
            </div>
          )}

          {tiers.map(tierCfg => {
            const tierNum = tierCfg.tier;
            const tc = ROSTER_TIER_COLORS[tierNum] || ROSTER_TIER_COLORS[4];
            const limit = tierCfg.picks || 1;
            const currSel = selected[tierNum] || [];
            const complete = currSel.length >= limit;

            return (
              <div key={tierNum} style={{ marginBottom: 22, animation: 'fadeSlideUp 0.3s ease both' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: tc.accent }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: tc.label, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {TIER_NAMES_ROSTER[tierNum] || `Tier ${tierNum}`}
                  </span>
                  <span style={{ fontSize: 11, color: complete ? tc.label : '#4b5563' }}>
                    {currSel.length}/{limit}{complete ? ' ✓' : ''}
                  </span>
                </div>

                {currSel.map(playerId => {
                  const pName = names[playerId] || 'Player';
                  const pData = (tierCfg.players || []).find(p => p.player_id === playerId);
                  return (
                    <div key={playerId} style={{ border: `1.5px solid ${tc.accent}`, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, animation: 'fadeSlideUp 0.2s ease both' }}>
                      <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{toFlag(pData?.country)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName}</div>
                        {pData?.odds_display && <div style={{ fontSize: 12, color: tc.label, marginTop: 2 }}>{fmtOdds(pData.odds_display)}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: tc.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check style={{ width: 12, height: 12, color: '#fff' }} />
                        </div>
                        <button
                          onClick={() => setSelected(prev => ({ ...prev, [tierNum]: (prev[tierNum] || []).filter(x => x !== playerId) }))}
                          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', color: '#6b7280', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >×</button>
                      </div>
                    </div>
                  );
                })}

                {Array.from({ length: limit - currSel.length }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTier(tierNum)}
                    style={{ width: '100%', textAlign: 'left', marginBottom: 8, border: `1.5px dashed ${tc.border}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = tc.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = tc.border; }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: '50%', border: `2px dashed ${tc.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.55 }}>
                      <span style={{ color: tc.accent, fontSize: 22, lineHeight: 1, marginTop: -1 }}>+</span>
                    </div>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>Pick a player</span>
                    <ChevronRight style={{ width: 16, height: 16, color: '#374151', marginLeft: 'auto' }} />
                  </button>
                ))}
              </div>
            );
          })}

          {/* Sticky submit bar */}
          {tiers.length > 0 && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(10,14,26,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)', padding: '12px 16px 18px', zIndex: 50 }}>
              <div style={{ maxWidth: 640, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, background: '#1f2937', borderRadius: 999, height: 4, overflow: 'hidden' }}>
                    <div style={{ height: 4, borderRadius: 999, background: canSubmit ? '#22c55e' : '#3b82f6', width: totalTarget > 0 ? `${Math.round((totalDone / totalTarget) * 100)}%` : '0%', transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ color: '#6b7280', fontSize: 12, flexShrink: 0 }}>{totalDone}/{totalTarget} picks</span>
                </div>
                <Button
                  variant="primary"
                  color="green"
                  size="lg"
                  fullWidth
                  onClick={() => canSubmit && setShowConfirm(true)}
                  disabled={!canSubmit}
                >
                  {canSubmit ? 'Submit Picks →' : `${totalTarget - totalDone} more pick${totalTarget - totalDone !== 1 ? 's' : ''} needed`}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── LOCKED (no picks) ── */}
      {picksLocked && !submitted && (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
            <Lock style={{ width: 28, height: 28, color: '#4b5563' }} />
          </div>
          <h3 style={{ color: '#fff', fontWeight: 800, fontSize: 20, margin: '0 0 8px' }}>Picks are closed</h3>
          <p style={{ color: '#4b5563', fontSize: 14 }}>Tee time has passed. No picks were submitted.</p>
        </div>
      )}

      {/* ── SUBMITTED: picks grid ── */}
      {submitted && (() => {
        const byTier = {};
        for (const p of picks) {
          if (!byTier[p.tier_number]) byTier[p.tier_number] = [];
          byTier[p.tier_number].push(p);
        }
        const tierNums = tiersConfig.length
          ? tiersConfig.map(t => parseInt(t.tier || t.tier_number || t.id)).filter(Boolean)
          : [...new Set(picks.map(p => p.tier_number))].sort();

        return (
          <>
            {/* Status banner */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: tournStatus === 'active' ? 'rgba(0,232,122,0.07)' : tournStatus === 'completed' ? 'rgba(251,191,36,0.07)' : picksLocked ? 'rgba(251,191,36,0.07)' : 'rgba(0,232,122,0.09)', border: `1px solid ${tournStatus === 'active' ? 'rgba(0,232,122,0.25)' : tournStatus === 'completed' ? 'rgba(251,191,36,0.25)' : picksLocked ? 'rgba(251,191,36,0.25)' : 'rgba(0,232,122,0.35)'}`, borderRadius: 14, marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                {tournStatus === 'active'
                  ? <><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} /><span style={{ fontSize: 13, color: '#22c55e', fontWeight: 700 }}>Live · Scores updating</span></>
                  : tournStatus === 'completed'
                    ? <><Trophy size={15} style={{ color: '#fbbf24' }} /><span style={{ fontSize: 14, color: '#fbbf24', fontWeight: 700 }}>Tournament complete</span></>
                    : picksLocked
                      ? <><Lock size={15} style={{ color: '#fbbf24' }} /><span style={{ fontSize: 14, color: '#fbbf24', fontWeight: 700 }}>Picks locked 🔒</span></>
                      : <><Check style={{ width: 15, height: 15, color: '#22c55e' }} /><span style={{ fontSize: 14, color: '#22c55e', fontWeight: 800, letterSpacing: '0.01em' }}>Picks submitted ✓</span></>
                }
              </div>
              {!picksLocked && lockTime && <PicksCountdown lockTime={lockTime} />}
            </div>

            {tierNums.map(tierNum => {
              const tc = ROSTER_TIER_COLORS[tierNum] || ROSTER_TIER_COLORS[4];
              const tierPicks = byTier[tierNum] || [];
              const tierCfgItem = tiersConfig.find(t => parseInt(t.tier || t.tier_number || t.id) === tierNum);
              const slotCount = parseInt(tierCfgItem?.picks || tierPicks.length || 1);
              return (
                <div key={tierNum} style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: tc.accent }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: tc.label, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{TIER_NAMES_ROSTER[tierNum] || `Tier ${tierNum}`}</span>
                    {tierCfgItem?.odds_min && tierCfgItem?.odds_max && (
                      <span style={{ fontSize: 10, color: '#4b5563' }}>{tierCfgItem.odds_min}–{tierCfgItem.odds_max}</span>
                    )}
                    <span style={{ fontSize: 11, color: '#4b5563' }}>{tierPicks.length}/{slotCount}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...tierPicks].sort((a, b) => (a.odds_decimal || 999) - (b.odds_decimal || 999)).map((pick, idx) => {
                      const normName = (pick.player_name || '').toLowerCase().replace(/[.']/g, '').trim();
                      const espnData = teeTimeMap[normName];
                      return (
                        <PlayerCard
                          key={pick.id} pick={pick} tier={tierNum} idx={idx}
                          tournStatus={tournStatus} picksLocked={picksLocked}
                          navigate={navigate} leagueId={leagueId}
                          teeTimeRaw={espnData?.teeTimeRaw}
                          espnScheduled={espnData?.isScheduled}
                          espnCut={espnData?.isCut}
                          isDropped={pick.is_dropped}
                          isPending={pick.is_pending}
                          espnFlagHref={espnData?.flagHref}
                          espnCountryAlt={espnData?.countryAlt}
                          isStrokeBased={isStrokeBased}
                          onRemove={!picksLocked && !pick.is_dropped && tournStatus !== 'active' && tournStatus !== 'completed' ? () => handleRemoveSubmittedPick(pick) : undefined}
                        />
                      );
                    })}
                    {Array.from({ length: Math.max(0, slotCount - tierPicks.length) }).map((_, i) => (
                      <EmptySlot key={`empty-${i}`} tier={tierNum} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* ── Team running total ── */}
            {submitted && (tournStatus === 'active' || tournStatus === 'completed') && teamScore != null && (
              <div style={{ marginTop: 16, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ color: '#6b7280', fontSize: 12 }}>
                  {dropCount > 0 ? `Best ${picksPerTeam - dropCount} of ${picksPerTeam} counting` : `All ${picksPerTeam} counting`}
                </div>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 900, color: teamScore < 0 ? '#22c55e' : teamScore > 0 ? '#ef4444' : '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                    {teamScore === 0 ? 'E' : (teamScore > 0 ? '+' : '') + teamScore}
                  </span>
                  <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 6 }}>Your score</span>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* Tier picker modal */}
      {activeTier != null && data?.tiers && (() => {
        const td = data.tiers.find(t => t.tier === activeTier);
        return td ? (
          <TierPickerModal
            tierNum={activeTier}
            tierConfig={td}
            players={td.players || []}
            currentSel={selected[activeTier] || []}
            onPick={(pid, pName) => handlePick(activeTier, pid, pName)}
            onClose={() => setActiveTier(null)}
          />
        ) : null;
      })()}

      {/* Confirm submit modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300, padding: '0 16px 16px' }}>
          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }}>
            <h3 style={{ color: '#fff', fontWeight: 800, fontSize: 18, margin: '0 0 4px' }}>Submit your picks?</h3>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 18px' }}>You can still change your picks up until 1 hour before Thursday's first tee time. After that, picks are locked for good.</p>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
              {tiers.map(t => {
                const tc = ROSTER_TIER_COLORS[t.tier] || ROSTER_TIER_COLORS[4];
                return (
                  <div key={t.tier} style={{ marginBottom: 10 }}>
                    <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{TIER_NAMES_ROSTER[t.tier] || `Tier ${t.tier}`}</div>
                    {(selected[t.tier] || []).map(pid => (
                      <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e5e7eb', marginBottom: 2 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: tc.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Check style={{ width: 10, height: 10, color: '#fff' }} />
                        </div>
                        {names[pid] || pid}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {submitError && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{submitError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} disabled={submitting} style={{ flex: 1, background: '#1f2937', border: 'none', color: '#9ca3af', padding: '12px 0', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Go Back</button>
              <Button
                variant="primary"
                color="green"
                size="lg"
                onClick={handleConfirmSubmit}
                disabled={submitting}
                loading={submitting}
                className="flex-1"
              >
                {submitting ? 'Submitting…' : 'Submit Picks'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
