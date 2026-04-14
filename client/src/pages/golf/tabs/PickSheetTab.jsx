/**
 * PickSheetTab — Sportsbook Editorial pick sheet.
 *
 * Approved design direction:
 *   - Tier cards with left-edge color glow (border-left 3px, no left radius)
 *   - Tier color tint at 3% opacity background
 *   - 36px ESPN headshot circles via PlayerAvatar (initials fallback)
 *   - Empty pick slots = dashed circle + "Select player" → opens player selector
 *   - Player selector: search + scrollable list, bottom sheet on mobile / modal on desktop
 *   - Floating bottom bar: rainbow gradient progress (gold → cyan → purple),
 *     dot indicators per pick slot, lock button (green when ready)
 *   - Countdown chip — amber, red pulse < 1hr
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui';
import api from '../../../api';
import PlayerAvatar from '../../../components/golf/PlayerAvatar';
import { tierAccent, tierTint } from '../../../utils/golfTierColors';

const TIER_NAMES = { 1: 'Elite', 2: 'Premium', 3: 'Mid-Field', 4: 'Longshots', 5: 'Deep Longshots' };
// Rainbow gradient that reads as a "tier completion" sequence.
const RAINBOW = 'linear-gradient(90deg, #FFD700 0%, #00B4D8 50%, #9B59B6 100%)';

export default function TieredPickSheet({ leagueId, league }) {
  const navigate = useNavigate();
  const [tiers, setTiers]           = useState([]);
  const [picks, setPicks]           = useState({});
  const [submitted, setSubmitted]   = useState(false);
  const [locked, setLocked]         = useState(!!league.picks_locked);
  const [lockTime, setLockTime]     = useState(null);
  const [totalTarget, setTotalTarget] = useState(0);
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [countdown, setCountdown]   = useState('');
  const [countdownMs, setCountdownMs] = useState(null); // for < 1hr pulse styling
  const [selector, setSelector]     = useState(null); // { tierNum, slotIdx } | null

  useEffect(() => {
    async function load() {
      try {
        const [tierRes, pickRes] = await Promise.all([
          api.get(`/golf/leagues/${leagueId}/tier-players`),
          api.get(`/golf/leagues/${leagueId}/picks/my`),
        ]);
        setTiers(tierRes.data.tiers || []);
        const myPicks = pickRes.data.picks || [];
        setSubmitted(pickRes.data.submitted || false);
        setLocked(!!pickRes.data.picks_locked);
        setLockTime(pickRes.data.lock_time || null);
        setTotalTarget(pickRes.data.total_target || 0);
        setTournament(pickRes.data.tournament || null);
        const map = {};
        for (const p of myPicks) {
          if (!map[p.tier_number]) map[p.tier_number] = [];
          map[p.tier_number].push(p.player_id);
        }
        setPicks(map);
      } catch (_) {}
      setLoading(false);
    }
    load();
  }, [leagueId]);

  useEffect(() => {
    if (!lockTime) return;
    function update() {
      const diff = new Date(lockTime) - Date.now();
      setCountdownMs(diff);
      if (diff <= 0) { setCountdown('Locked'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [lockTime]);

  // Build a map of all already-picked player_ids across every tier.
  // Used by the selector to disable already-claimed players (no double-tier picks).
  const allPicked = useMemo(() => {
    const set = new Set();
    for (const ids of Object.values(picks)) for (const id of ids) set.add(id);
    return set;
  }, [picks]);

  function setPick(tierNum, slotIdx, playerId) {
    if (locked) return;
    setPicks(prev => {
      const tierPicks = [...(prev[tierNum] || [])];
      tierPicks[slotIdx] = playerId;
      return { ...prev, [tierNum]: tierPicks.filter(Boolean) };
    });
    setSelector(null);
  }
  function clearPick(tierNum, slotIdx) {
    if (locked) return;
    setPicks(prev => {
      const tierPicks = [...(prev[tierNum] || [])];
      tierPicks.splice(slotIdx, 1);
      return { ...prev, [tierNum]: tierPicks };
    });
  }

  const totalPicks  = Object.values(picks).reduce((s, arr) => s + arr.length, 0);
  const allComplete = tiers.length > 0 && tiers.every(t => (picks[t.tier] || []).length === t.picks);
  const progress    = totalTarget > 0 ? Math.min(1, totalPicks / totalTarget) : 0;

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const picksList = [];
      for (const [tierNum, playerIds] of Object.entries(picks)) {
        for (const player_id of playerIds) {
          picksList.push({ tier_number: parseInt(tierNum), player_id });
        }
      }
      await api.post(`/golf/leagues/${leagueId}/picks`, { picks: picksList });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit picks. Try again.');
    }
    setSaving(false);
  }

  if (loading) return <div className="py-10 text-center text-gray-500">Loading pick sheet…</div>;

  const tournName = tournament?.name || 'Tournament';
  const lessThanHour = countdownMs != null && countdownMs > 0 && countdownMs < 60 * 60 * 1000;

  // ── Submitted + locked → confirmation view (uses same visual language)
  if (submitted && locked) {
    return (
      <div style={{ paddingBottom: 24 }}>
        <div style={{ background: tierTint(1, 0.08), border: `1px solid ${tierTint(1, 0.35)}`, borderRadius: 16, padding: '24px 20px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{ color: '#FFD700', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Picks Locked</div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 22, marginBottom: 4 }}>You're in.</div>
          <div style={{ color: '#9ca3af', fontSize: 13 }}>{tournName}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tiers.map(tier => (
            <TierCard
              key={tier.tier}
              tier={tier}
              picks={picks[tier.tier] || []}
              locked
              onSlotClick={() => {}}
              onClearPick={() => {}}
            />
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <Button variant="outline" color="white" size="lg" fullWidth onClick={() => navigate(`/golf/league/${leagueId}?tab=standings`)}>
            View Leaderboard →
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 130 }} data-testid="pick-sheet">
      {/* Countdown */}
      {!locked && countdown && (
        <div data-testid="picks-countdown" style={{
          textAlign: 'center', marginBottom: 16, padding: '10px 16px',
          background: lessThanHour ? 'rgba(239,68,68,0.08)' : 'rgba(239,159,39,0.08)',
          border: `1px solid ${lessThanHour ? 'rgba(239,68,68,0.3)' : 'rgba(239,159,39,0.25)'}`,
          borderRadius: 12,
          animation: lessThanHour ? 'picksPulse 1.5s ease-in-out infinite' : 'none',
        }}>
          <div style={{ color: lessThanHour ? '#f87171' : '#EF9F27', fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 2 }}>
            Picks Lock In
          </div>
          <div style={{ color: lessThanHour ? '#f87171' : '#EF9F27', fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
            {countdown}
          </div>
        </div>
      )}
      <style>{`@keyframes picksPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.65; } }`}</style>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tiers.map(tier => (
          <TierCard
            key={tier.tier}
            tier={tier}
            picks={picks[tier.tier] || []}
            locked={locked}
            onSlotClick={(slotIdx) => setSelector({ tierNum: tier.tier, slotIdx })}
            onClearPick={(slotIdx) => clearPick(tier.tier, slotIdx)}
          />
        ))}
      </div>

      {/* Floating lock bar */}
      <LockBar
        totalPicks={totalPicks}
        totalTarget={totalTarget}
        progress={progress}
        tiers={tiers}
        picks={picks}
        allComplete={allComplete}
        locked={locked}
        submitted={submitted}
        saving={saving}
        onSubmit={handleSubmit}
      />

      {/* Player selector (modal / bottom sheet) */}
      {selector && (
        <PlayerSelector
          tier={tiers.find(t => t.tier === selector.tierNum)}
          alreadyPicked={allPicked}
          onPick={(playerId) => setPick(selector.tierNum, selector.slotIdx, playerId)}
          onClose={() => setSelector(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TierCard — bordered card with left-edge tier glow + rows of pick slots.
// ─────────────────────────────────────────────────────────────────────────────
function TierCard({ tier, picks, locked, onSlotClick, onClearPick }) {
  const accent = tierAccent(tier.tier);
  const tint   = tierTint(tier.tier, 0.03);
  const slots  = Array.from({ length: tier.picks }, (_, i) => picks[i] || null);
  const playersById = useMemo(() => {
    const m = {};
    for (const p of (tier.players || [])) m[p.player_id] = p;
    return m;
  }, [tier.players]);

  return (
    <div
      data-testid={`tier-card-${tier.tier}`}
      style={{
        background: tint,
        border: '0.5px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        borderTopLeftRadius: 0,      // square the left side so the glow reads as an edge, not a chip
        borderBottomLeftRadius: 0,
        overflow: 'hidden',
      }}
    >
      {/* Tier header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />
          <span style={{ color: '#6b7280', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>
            Tier {tier.tier}
          </span>
          <span style={{ color: '#9ca3af', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {TIER_NAMES[tier.tier] || ''}
          </span>
        </div>
        <span style={{ color: '#4b5563', fontSize: 11, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {tier.odds_min ? `${tier.odds_min}${tier.odds_max ? `–${tier.odds_max}` : '+'}` : ''}
        </span>
      </div>

      {/* Pick slots */}
      <div>
        {slots.map((pid, slotIdx) => (
          <PickSlot
            key={slotIdx}
            slotIdx={slotIdx}
            isLast={slotIdx === slots.length - 1}
            tier={tier.tier}
            player={pid ? playersById[pid] : null}
            locked={locked}
            onSelect={() => onSlotClick(slotIdx)}
            onClear={() => onClearPick(slotIdx)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PickSlot — either a filled row (with photo/name/odds) or empty placeholder.
// ─────────────────────────────────────────────────────────────────────────────
function PickSlot({ slotIdx, isLast, tier, player, locked, onSelect, onClear }) {
  const accent = tierAccent(tier);
  if (player) {
    return (
      <div
        data-testid="pick-slot-filled"
        onClick={locked ? undefined : onSelect}
        style={{
          padding: '10px 14px',
          borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: locked ? 'default' : 'pointer',
        }}
      >
        <PlayerAvatar
          name={player.player_name}
          tier={tier}
          espnPlayerId={player.espn_player_id}
          size={36}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {flipName(player.player_name)}
          </div>
          {(player.world_ranking || player.gp_world_ranking) && (
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>
              World #{player.world_ranking || player.gp_world_ranking}
            </div>
          )}
        </div>
        <div style={{ color: accent, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {(player.odds_display || '').replace(':', '/')}
        </div>
        {!locked && (
          <button
            type="button"
            aria-label="Clear pick"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{
              background: 'transparent', border: 'none', color: '#4b5563',
              fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '4px 6px',
              flexShrink: 0,
            }}
          >×</button>
        )}
      </div>
    );
  }
  // Empty slot — dashed placeholder
  return (
    <button
      type="button"
      data-testid="pick-slot-empty"
      onClick={locked ? undefined : onSelect}
      disabled={locked}
      style={{
        width: '100%', padding: '12px 14px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
        background: 'transparent', border: 'none',
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        cursor: locked ? 'default' : 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: `1.5px dashed ${tierTint(tier, 0.4)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ color: accent, fontSize: 18, lineHeight: 1, fontWeight: 300 }}>+</span>
      </div>
      <div style={{ flex: 1, color: '#6b7280', fontSize: 13, fontStyle: 'italic' }}>
        Select player
      </div>
    </button>
  );
}

function flipName(n) {
  if (!n) return '';
  if (n.includes(',')) {
    const [last, first] = n.split(',').map(s => s.trim());
    return `${first} ${last}`;
  }
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// LockBar — fixed bottom: rainbow progress bar + dot row + Lock In button.
// ─────────────────────────────────────────────────────────────────────────────
function LockBar({ totalPicks, totalTarget, progress, tiers, picks, allComplete, locked, submitted, saving, onSubmit }) {
  // Build dot row: one dot per pick slot, colored in tier accent when filled.
  const dots = [];
  for (const t of tiers) {
    const filled = (picks[t.tier] || []).length;
    for (let i = 0; i < t.picks; i++) {
      dots.push({ tier: t.tier, filled: i < filled });
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      background: 'rgba(13,13,13,0.96)',
      backdropFilter: 'blur(14px)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '10px 16px 14px',
    }}>
      <div style={{ maxWidth: 768, margin: '0 auto' }}>
        {/* Rainbow progress bar */}
        <div style={{
          height: 3, borderRadius: 2, overflow: 'hidden',
          background: 'rgba(255,255,255,0.05)',
          marginBottom: 10,
        }}>
          <div style={{
            height: '100%',
            width: `${Math.round(progress * 100)}%`,
            background: RAINBOW,
            transition: 'width 0.35s ease',
            boxShadow: progress > 0 ? '0 0 12px rgba(0,180,216,0.4)' : 'none',
          }} />
        </div>

        {/* Dot row */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
          {dots.map((d, i) => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: d.filled ? tierAccent(d.tier) : 'rgba(255,255,255,0.08)',
              boxShadow: d.filled ? `0 0 6px ${tierAccent(d.tier)}80` : 'none',
              transition: 'all 0.2s',
            }} />
          ))}
        </div>

        {/* Count + button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#9ca3af', fontSize: 13, fontVariantNumeric: 'tabular-nums' }} data-testid="picks-count">
            <strong style={{ color: '#fff' }}>{totalPicks}</strong> / {totalTarget} picks made
          </span>
          {locked ? (
            <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 8 }}>
              {submitted ? 'Picks Submitted ✓' : 'Picks Locked'}
            </div>
          ) : (
            <button
              type="button"
              data-testid="lock-picks-button"
              onClick={onSubmit}
              disabled={!allComplete || saving}
              style={{
                padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 800,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                cursor: !allComplete || saving ? 'not-allowed' : 'pointer',
                border: 'none',
                background: allComplete ? '#22c55e' : 'rgba(255,255,255,0.06)',
                color: allComplete ? '#001a0d' : '#4b5563',
                transition: 'all 0.15s',
                boxShadow: allComplete ? '0 0 24px rgba(34,197,94,0.35)' : 'none',
              }}
            >
              {saving ? 'Locking…' : 'Lock In Picks'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlayerSelector — modal/bottom sheet for choosing a player from a tier.
// ─────────────────────────────────────────────────────────────────────────────
function PlayerSelector({ tier, alreadyPicked, onPick, onClose }) {
  const [search, setSearch] = useState('');
  const accent = tierAccent(tier.tier);
  // Sort by odds ascending (favorites first)
  const sorted = useMemo(() => {
    return [...(tier.players || [])].sort((a, b) => (a.odds_decimal || 999) - (b.odds_decimal || 999));
  }, [tier.players]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sorted;
    return sorted.filter(p => (p.player_name || '').toLowerCase().includes(q));
  }, [sorted, search]);

  // Close on Escape
  useEffect(() => {
    function esc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      data-testid="player-selector"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'selectorFade 0.2s ease',
      }}
    >
      <style>{`
        @keyframes selectorFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes selectorSlide { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (min-width: 640px) {
          .player-selector-sheet { align-self: center !important; max-height: 80vh !important; border-radius: 14px !important; max-width: 460px !important; animation: selectorFade 0.2s ease !important; }
        }
      `}</style>
      <div
        className="player-selector-sheet"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '85vh',
          background: '#0d0d0d',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          display: 'flex', flexDirection: 'column',
          animation: 'selectorSlide 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent }} />
            <span style={{ color: '#6b7280', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Tier {tier.tier}
            </span>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{TIER_NAMES[tier.tier] || ''}</span>
          </div>
          <button onClick={onClose} type="button" aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <input
            type="text"
            placeholder="Search players…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            data-testid="player-selector-search"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              padding: '8px 12px', color: '#fff', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
              No players match "{search}"
            </div>
          ) : (
            filtered.map(p => {
              const taken = alreadyPicked.has(p.player_id);
              return (
                <button
                  key={p.player_id}
                  type="button"
                  disabled={taken}
                  onClick={() => onPick(p.player_id)}
                  style={{
                    width: '100%', padding: '10px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: 'transparent', border: 'none',
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    cursor: taken ? 'not-allowed' : 'pointer',
                    opacity: taken ? 0.35 : 1,
                  }}
                >
                  <PlayerAvatar
                    name={p.player_name}
                    tier={tier.tier}
                    espnPlayerId={p.espn_player_id}
                    size={32}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {flipName(p.player_name)}
                    </div>
                    {(p.world_ranking || p.gp_world_ranking) && (
                      <div style={{ color: '#6b7280', fontSize: 11 }}>World #{p.world_ranking || p.gp_world_ranking}</div>
                    )}
                  </div>
                  <div style={{ color: accent, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {(p.odds_display || '').replace(':', '/')}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
