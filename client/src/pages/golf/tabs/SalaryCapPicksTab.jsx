import { useState, useEffect, useRef } from 'react';
import { DollarSign, Lock, X } from 'lucide-react';
import { Button } from '../../../components/ui';
import api from '../../../api';
import GolfLoader from '../../../components/golf/GolfLoader';
import PlayerAvatar from '../../../components/golf/PlayerAvatar';

// ── Helpers ───────────────────────────────────────────────────────────────────

function flipName(name) {
  if (!name) return name;
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    return first ? `${first} ${last}` : last;
  }
  return name;
}

function fmtSalary(val) {
  if (!val) return '$0';
  return `$${Number(val).toLocaleString()}`;
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

const toFlag = code => {
  if (!code || code.length !== 2) return '⛳';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
};

// ── Budget Tracker ────────────────────────────────────────────────────────────

function BudgetTracker({ cap, spent, count, required }) {
  const remaining = cap - spent;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  const isOver = remaining < 0;
  const isWarning = !isOver && remaining < cap * 0.1; // < 10% remaining

  const barColor = isOver ? '#ef4444' : isWarning ? '#f97316' : '#22c55e';
  const textColor = isOver ? 'text-red-400' : isWarning ? 'text-orange-400' : 'text-green-400';

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Budget</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: 12 }}>
          <span style={{ color: count >= required ? '#22c55e' : '#9ca3af', fontWeight: 700 }}>{count}</span>
          <span>/ {required} players</span>
        </span>
      </div>

      {/* Numbers row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>Cap</div>
          <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 16 }}>{fmtSalary(cap)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>Spent</div>
          <div style={{ color: '#e5e7eb', fontWeight: 700, fontSize: 16 }}>{fmtSalary(spent)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>Remaining</div>
          <div className={textColor} style={{ fontWeight: 700, fontSize: 16 }}>{fmtSalary(Math.abs(remaining))}{isOver ? ' over' : ''}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 999, transition: 'width 0.3s, background 0.3s' }} />
      </div>

      {isOver && (
        <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8, fontWeight: 600 }}>
          Over cap by {fmtSalary(-remaining)} — reduce salary to submit.
        </p>
      )}
      {isWarning && !isOver && (
        <p style={{ color: '#f97316', fontSize: 12, marginTop: 8 }}>
          Only {fmtSalary(remaining)} remaining — choose your last picks carefully.
        </p>
      )}
    </div>
  );
}

// ── Picks countdown timer ─────────────────────────────────────────────────────

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

// ── Player picker modal ───────────────────────────────────────────────────────

function PlayerPickerModal({ players, selectedIds, salaryCap, currentSpent, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const seen = new Set();
  const unique = players.filter(p => { if (seen.has(p.player_id)) return false; seen.add(p.player_id); return true; });
  const sorted = unique.sort((a, b) => (b.salary || 0) - (a.salary || 0));

  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter(p => flipName(p.player_name).toLowerCase().includes(q)) : sorted;

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
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Add Player</span>
            <p style={{ color: '#6b7280', fontSize: 12, margin: '3px 0 0' }}>
              {fmtSalary(salaryCap - currentSpent)} remaining
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.07)', border: 'none', color: '#9ca3af', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 14px 2px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.05)',
            border: `1.5px solid ${searchFocused ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 12, padding: '0 14px', height: 44,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={searchFocused ? '#22c55e' : '#6b7280'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search players..."
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: 14, fontWeight: 500 }}
            />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 18, padding: '0 2px', lineHeight: 1 }}><X size={14} /></button>}
          </div>
        </div>

        {/* Player list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 14px 16px' }}>
          {filtered.length === 0 && (
            <p style={{ color: '#4b5563', textAlign: 'center', padding: 32, fontSize: 13 }}>No players found</p>
          )}
          {filtered.map(p => {
            const isSel = selectedIds.includes(p.player_id);
            const isWD = !!p.is_withdrawn;
            const affordableRemaining = (salaryCap - currentSpent) >= (p.salary || 0);
            const canAdd = !isSel && !isWD && affordableRemaining;
            const tooExpensive = !isSel && !isWD && !affordableRemaining;

            return (
              <button
                key={p.player_id}
                onClick={() => !isWD && onPick(p)}
                disabled={isWD}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  background: isSel ? 'rgba(34,197,94,0.08)' : 'transparent',
                  border: `1px solid ${isSel ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 12, padding: '10px 12px', marginBottom: 6,
                  cursor: isWD ? 'default' : 'pointer',
                  opacity: isWD ? 0.4 : tooExpensive ? 0.5 : 1,
                  textAlign: 'left',
                }}
              >
                {/* Player headshot */}
                <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id} size={36} />

                {/* Name + odds */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isSel ? '#22c55e' : '#f1f5f9', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {flipName(p.player_name)}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 11 }}>
                    {p.odds_display || '—'}
                    {tooExpensive && <span style={{ color: '#ef4444', marginLeft: 6 }}>over budget</span>}
                    {isWD && <span style={{ color: '#ef4444', marginLeft: 6 }}>WD</span>}
                  </div>
                </div>

                {/* Salary */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: tooExpensive ? '#6b7280' : '#fbbf24', fontWeight: 700, fontSize: 14 }}>{fmtSalary(p.salary)}</div>
                </div>

                {/* Check / + icon */}
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSel ? '#22c55e' : canAdd ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
                  color: isSel ? '#fff' : '#6b7280', fontSize: 16,
                }}>
                  {isSel ? '✓' : '+'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SalaryCapPicksTab({ leagueId, league }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState([]); // array of player objects
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const cap = league.weekly_salary_cap || 50000;
  const required = league.starters_per_week || league.roster_size || 6;

  useEffect(() => {
    api.get(`/golf/leagues/${leagueId}/my-roster`)
      .then(r => {
        setData(r.data);
        // Pre-populate selections from existing picks
        if (r.data.picks?.length) {
          // Map picks back to player objects using tier players
          const allPlayers = (r.data.tiers || []).flatMap(t => t.players || []);
          const preselected = r.data.picks.map(pick => {
            const found = allPlayers.find(p => p.player_id === pick.player_id);
            return found || { player_id: pick.player_id, player_name: pick.player_name, salary: pick.salary_used || 0 };
          });
          setSelections(preselected);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  if (loading) return <GolfLoader />;

  if (!data?.tournament) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#6b7280' }}>
        <DollarSign style={{ width: 40, height: 40, margin: '0 auto 12px', color: '#374151' }} />
        <p style={{ fontWeight: 600, color: '#9ca3af' }}>No tournament linked</p>
        <p style={{ fontSize: 13, marginTop: 6 }}>Ask your commissioner to link a tournament and sync player salaries.</p>
      </div>
    );
  }

  const picksLocked = !!data.picks_locked;
  const allPlayers = (data.tiers || []).flatMap(t => t.players || []);
  const selectedIds = selections.map(p => p.player_id);
  const spent = selections.reduce((s, p) => s + (p.salary || 0), 0);
  const remaining = cap - spent;
  const isOver = remaining < 0;
  const canSubmit = selections.length === required && !isOver && !picksLocked;

  function handlePickFromModal(player) {
    setSelections(prev => {
      const idx = prev.findIndex(p => p.player_id === player.player_id);
      if (idx >= 0) {
        // Toggle off
        return prev.filter((_, i) => i !== idx);
      }
      // Add
      return [...prev, player];
    });
  }

  function removePick(playerId) {
    setSelections(prev => prev.filter(p => p.player_id !== playerId));
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await api.post(`/golf/leagues/${leagueId}/picks`, {
        tournament_id: data.tournament.id,
        picks: selections.map(p => ({ player_id: p.player_id, tier_number: 1 })),
      });
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
      // Refresh
      const r = await api.get(`/golf/leagues/${leagueId}/my-roster`);
      setData(r.data);
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to submit picks');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Tournament header */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>{data.tournament.name}</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>{data.tournament.course}</div>
          </div>
          {picksLocked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 12, fontWeight: 600 }}>
              <Lock style={{ width: 14, height: 14 }} />
              Locked
            </div>
          ) : data.lock_time ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              Locks in <PicksCountdown lockTime={data.lock_time} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Budget Tracker */}
      <BudgetTracker cap={cap} spent={spent} count={selections.length} required={required} />

      {/* Selected players */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Your Team ({selections.length}/{required})
          </span>
          {!picksLocked && (
            <button
              onClick={() => setShowModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', borderRadius: 10, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              + Add Player
            </button>
          )}
        </div>

        {selections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#4b5563' }}>
            <p style={{ fontSize: 14 }}>No players selected yet.</p>
            {!picksLocked && <p style={{ fontSize: 12, marginTop: 4 }}>Tap "Add Player" to build your team.</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selections.map((p, i) => {
              // Find live score from existing picks
              const livePick = data.picks?.find(pp => pp.player_id === p.player_id);
              const totalScore = livePick
                ? [livePick.round1, livePick.round2, livePick.round3, livePick.round4].filter(r => r != null).reduce((s, r) => s + r, 0)
                : null;
              const hasScore = livePick && (livePick.round1 != null);

              return (
                <div
                  key={p.player_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 14, padding: '12px 14px',
                  }}
                >
                  <span style={{ color: '#6b7280', fontWeight: 700, fontSize: 12, width: 20, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id || livePick?.espn_player_id} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {flipName(p.player_name)}
                    </div>
                    <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700 }}>{fmtSalary(p.salary)}</div>
                  </div>
                  {hasScore && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ color: scoreColor(totalScore), fontWeight: 700, fontSize: 15 }}>{fmtScore(totalScore)}</div>
                      <div style={{ color: '#6b7280', fontSize: 10 }}>total</div>
                    </div>
                  )}
                  {!picksLocked && (
                    <button
                      onClick={() => removePick(p.player_id)}
                      style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#6b7280', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    ><X size={14} /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit */}
      {!picksLocked && (
        <div style={{ position: 'sticky', bottom: 16, paddingTop: 8 }}>
          {submitError && (
            <p style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>{submitError}</p>
          )}
          {submitSuccess && (
            <p style={{ color: '#22c55e', fontSize: 13, textAlign: 'center', marginBottom: 8 }}>Picks submitted!</p>
          )}
          <Button
            variant="primary"
            color="green"
            size="lg"
            fullWidth
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting…' : selections.length < required ? `Pick ${required - selections.length} more` : isOver ? 'Over cap' : 'Submit Picks'}
          </Button>
        </div>
      )}

      {picksLocked && data.picks?.length > 0 && (
        <div style={{ textAlign: 'center', padding: '8px 0', color: '#6b7280', fontSize: 13 }}>
          <Lock style={{ display: 'inline', width: 12, height: 12, marginRight: 4 }} />
          Picks are locked. Good luck!
        </div>
      )}

      {/* Player picker modal */}
      {showModal && (
        <PlayerPickerModal
          players={allPlayers}
          selectedIds={selectedIds}
          salaryCap={cap}
          currentSpent={spent}
          onPick={handlePickFromModal}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
