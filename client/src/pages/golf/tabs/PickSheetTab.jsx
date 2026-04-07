import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui';
import api from '../../../api';

const TIER_COLORS = [
  { accent: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)', borderComplete: 'rgba(0,232,122,0.3)' },
  { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.2)', borderComplete: 'rgba(0,232,122,0.3)' },
  { accent: '#3b82f6', bg: 'rgba(59,130,246,0.06)',  border: 'rgba(59,130,246,0.2)',  borderComplete: 'rgba(0,232,122,0.3)' },
  { accent: '#22c55e', bg: 'rgba(34,197,94,0.06)',   border: 'rgba(34,197,94,0.2)',   borderComplete: 'rgba(0,232,122,0.3)' },
];

const TIER_NAMES = { 1: 'Tier 1 · Elite', 2: 'Tier 2 · Premium', 3: 'Tier 3 · Mid-Field', 4: 'Tier 4 · Longshots' };

// Flag emoji from 2-letter ISO country code
const toFlag = code => {
  if (!code || code.length !== 2) return '⛳';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
};

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
  const [sgMap, setSgMap]           = useState({}); // normalized name → { sg_total }
  const [winMap, setWinMap]         = useState({}); // normalized name → { win }
  const tierRefs = useRef([]);

  useEffect(() => {
    async function load() {
      try {
        const [tierRes, pickRes] = await Promise.all([
          api.get(`/golf/leagues/${leagueId}/tier-players`),
          api.get(`/golf/leagues/${leagueId}/picks/my`),
        ]);
        // Non-blocking: fetch form data from DataGolf (1hr cached on server)
        api.get('/golf/datagolf/skill-ratings').then(r => setSgMap(r.data?.byName || {})).catch(() => {});
        api.get('/golf/datagolf/win-probs').then(r => setWinMap(r.data?.byName || {})).catch(() => {});
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
      if (diff <= 0) { setCountdown('Locked'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${h}h ${m}m`);
    }
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [lockTime]);

  function togglePick(tierNum, playerId, pickLimit) {
    if (locked) return;
    setPicks(prev => {
      const tierPicks = prev[tierNum] || [];
      let next;
      if (tierPicks.includes(playerId)) {
        next = { ...prev, [tierNum]: tierPicks.filter(id => id !== playerId) };
      } else {
        if (tierPicks.length >= pickLimit) return prev;
        next = { ...prev, [tierNum]: [...tierPicks, playerId] };
        if (next[tierNum].length === pickLimit) {
          const tierIdx = tiers.findIndex(t => t.tier === tierNum);
          if (tierIdx >= 0 && tierIdx < tiers.length - 1 && tierRefs.current[tierIdx + 1]) {
            setTimeout(() => tierRefs.current[tierIdx + 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
          }
        }
      }
      return next;
    });
  }

  const totalPicks  = Object.values(picks).reduce((s, arr) => s + arr.length, 0);
  const allComplete = tiers.length > 0 && tiers.every(t => (picks[t.tier] || []).length === t.picks);

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

  if (loading) return <div className="py-10 text-center text-gray-500">Loading pick sheet...</div>;

  const tournName = tournament?.name || 'Tournament';

  // ── Submitted + locked → confirmation view
  if (submitted && locked) {
    return (
      <div className="space-y-4">
        <div style={{ background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.25)', borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
          <div style={{ color: '#22c55e', fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Your picks are in!</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>{tournName} · Picks locked</div>
          {tournament?.start_date && (
            <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4 }}>
              Tournament starts {new Date(tournament.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {tiers.map((tier, ti) => {
            const tierPicks = picks[tier.tier] || [];
            const colors = TIER_COLORS[ti % TIER_COLORS.length];
            const names = tierPicks.map(pid => {
              const p = tier.players.find(pl => pl.player_id === pid);
              return p?.player_name || pid;
            });
            return (
              <div key={tier.tier} style={{ background: '#111827', border: `1px solid ${colors.border}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ color: colors.accent, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                  {TIER_NAMES[tier.tier] || `Tier ${tier.tier}`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {names.map(name => (
                    <span key={name} style={{ background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.25)', color: '#22c55e', fontSize: 13, fontWeight: 600, padding: '5px 14px', borderRadius: 20 }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <Button
          variant="outline"
          color="white"
          size="lg"
          fullWidth
          onClick={() => navigate(`/golf/league/${leagueId}?tab=standings`)}
        >
          View Leaderboard →
        </Button>
      </div>
    );
  }

  // ── Pick sheet
  return (
    <div style={{ paddingBottom: 100 }}>
      <div className="space-y-4">
        {/* Header card */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, marginBottom: 3 }}>
                {tournName} — Pick Sheet
              </div>
              <div style={{ color: '#6b7280', fontSize: 13 }}>Pick your players before Thursday tee time</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              {locked ? (
                <span style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  Picks Locked
                </span>
              ) : countdown ? (
                <div>
                  <div style={{ color: '#4b5563', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Locks in</div>
                  <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 16 }}>{countdown}</div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#9ca3af', fontSize: 12 }}>{totalPicks} of {totalTarget} picks made</span>
            {allComplete && <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 700 }}>✓ All complete</span>}
          </div>
          <div style={{ height: 5, background: '#1f2937', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${totalTarget > 0 ? (totalPicks / totalTarget) * 100 : 0}%`,
              background: allComplete ? '#22c55e' : '#3b82f6',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Tier cards */}
        {tiers.map((tier, tierIdx) => {
          const tierPicks   = picks[tier.tier] || [];
          const isComplete  = tierPicks.length === tier.picks;
          const colors      = TIER_COLORS[tierIdx % TIER_COLORS.length];

          return (
            <div
              key={tier.tier}
              ref={el => { tierRefs.current[tierIdx] = el; }}
              style={{
                background: isComplete ? 'rgba(0,232,122,0.04)' : colors.bg,
                border: `1px solid ${isComplete ? 'rgba(0,232,122,0.3)' : colors.border}`,
                borderRadius: 16,
                overflow: 'hidden',
                transition: 'border-color 0.25s',
              }}
            >
              {/* Tier header */}
              <div style={{
                padding: '13px 16px',
                borderBottom: `1px solid ${isComplete ? 'rgba(0,232,122,0.15)' : colors.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: isComplete ? '#22c55e' : colors.accent, fontWeight: 700, fontSize: 14 }}>
                    {TIER_NAMES[tier.tier] || `Tier ${tier.tier}`}
                  </span>
                  {tier.odds_min && (
                    <span style={{ color: '#6b7280', fontSize: 11 }}>
                      · {tier.odds_min}{tier.odds_max ? `–${tier.odds_max}` : '+'}
                    </span>
                  )}
                  <span style={{ color: '#4b5563', fontSize: 12 }}>· pick {tier.picks}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: isComplete ? '#22c55e' : '#4b5563', fontSize: 13, fontWeight: 600 }}>
                    {tierPicks.length}/{tier.picks}
                  </span>
                  {isComplete && (
                    <span style={{
                      background: locked ? 'rgba(239,68,68,0.1)' : 'rgba(0,232,122,0.15)',
                      border: `1px solid ${locked ? 'rgba(239,68,68,0.3)' : 'rgba(0,232,122,0.3)'}`,
                      color: locked ? '#f87171' : '#22c55e',
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {locked ? 'Locked' : '✓ Complete'}
                    </span>
                  )}
                </div>
              </div>

              {/* Players list */}
              <div>
                {(() => {
                  const players = tier.players || [];
                  // Find highest win% in this tier for highlighting
                  const bestWin = Math.max(...players.map(p => winMap[(p.player_name || '').toLowerCase().trim()]?.win ?? 0), 0);
                  return players.map((player, pIdx) => {
                  const pid        = player.player_id;
                  const isSelected = tierPicks.includes(pid);
                  const isFull     = !isSelected && tierPicks.length >= tier.picks;
                  const isDisabled = locked || isFull;
                  const normName   = (player.player_name || '').toLowerCase().trim();
                  const sgEntry    = sgMap[normName];
                  const winEntry   = winMap[normName];
                  const sg         = sgEntry?.sg_total ?? null;
                  const winPct     = winEntry?.win ?? null;
                  const isTopPick  = winPct != null && bestWin > 0 && winPct >= bestWin;
                  const isHot      = sg != null && sg > 0.5;
                  const isCold     = sg != null && sg < -0.5;

                  return (
                    <button
                      key={pid}
                      onClick={() => togglePick(tier.tier, pid, tier.picks)}
                      disabled={isDisabled}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                        background: isSelected ? 'rgba(0,232,122,0.1)' : 'transparent',
                        border: 'none',
                        borderBottom: pIdx < (players.length - 1) ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        outline: isTopPick && !isSelected ? '1px solid rgba(59,130,246,0.4)' : 'none',
                        width: '100%', textAlign: 'left',
                        cursor: isDisabled ? (locked ? 'default' : 'not-allowed') : 'pointer',
                        opacity: isFull ? 0.35 : 1,
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = isSelected ? 'rgba(0,232,122,0.15)' : 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(0,232,122,0.1)' : 'transparent'; }}
                    >
                      {/* Checkbox circle */}
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${isSelected ? '#22c55e' : 'rgba(255,255,255,0.2)'}`,
                        background: isSelected ? '#22c55e' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 3" stroke="#001a0d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>

                      {/* Player info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <span style={{ color: isSelected ? '#fff' : '#d1d5db', fontSize: 13, fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {player.player_name}
                          </span>
                          {isHot && (
                            <span style={{ fontSize: 11, color: '#f97316', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              🔥 {sg > 0 ? '+' : ''}{sg.toFixed(1)} SG
                            </span>
                          )}
                          {isCold && (
                            <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              ❄️ {sg.toFixed(1)} SG
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#4b5563', fontSize: 11, marginTop: 1 }}>
                          #{player.world_ranking}{player.country ? ` · ${toFlag(player.country)}` : ''}
                        </div>
                        {winPct != null && (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', width: '100%' }}>
                              <div style={{
                                height: '100%',
                                width: `${bestWin > 0 ? Math.round((winPct / bestWin) * 100) : 0}%`,
                                background: isTopPick ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                                borderRadius: 2,
                                transition: 'width 0.4s ease',
                              }} />
                            </div>
                            <div style={{ fontSize: 10, color: isTopPick ? '#60a5fa' : '#4b5563', marginTop: 1 }}>
                              {(winPct * 100).toFixed(1)}% win{isTopPick ? ' · best in tier' : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                  });
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky bottom submit bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'rgba(8,8,16,0.96)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid #1f2937',
        padding: '10px 20px 14px',
        zIndex: 50,
      }}>
        <div style={{ maxWidth: 768, margin: '0 auto' }}>
          {/* Tier summaries row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginBottom: 8 }}>
            {tiers.map((tier, ti) => {
              const tierPicks = picks[tier.tier] || [];
              const isComplete = tierPicks.length === tier.picks;
              const lastNames = tierPicks.map(pid => {
                const p = tier.players.find(pl => pl.player_id === pid);
                const n = p?.player_name || '';
                return n.split(' ').pop();
              });
              return (
                <span key={tier.tier} style={{ fontSize: 11, color: isComplete ? '#22c55e' : '#4b5563' }}>
                  T{tier.tier}: {lastNames.length > 0 ? lastNames.join(', ') : '—'}{isComplete ? ' ✓' : ''}
                </span>
              );
            })}
          </div>

          {/* Submit row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#6b7280', fontSize: 13, flex: 1 }}>
              {totalPicks} of {totalTarget} picks
            </span>
            {locked ? (
              <div style={{ background: 'rgba(0,232,122,0.15)', border: '1px solid rgba(0,232,122,0.3)', color: '#22c55e', fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 8 }}>
                {submitted ? 'Picks Submitted ✓' : 'Picks Locked'}
              </div>
            ) : (
              <Button
                variant="primary"
                color="green"
                size="md"
                onClick={handleSubmit}
                disabled={!allComplete || saving}
                loading={saving}
              >
                {saving ? 'Submitting...' : 'Submit Picks →'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
