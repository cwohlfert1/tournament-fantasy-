import { useState, useEffect, useRef } from 'react';
import { DollarSign, Lock, Plus, X, UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui';
import api from '../../../api';
import GolfLoader from '../../../components/golf/GolfLoader';
import PlayerAvatar from '../../../components/golf/PlayerAvatar';
import Alert from '../../../components/ui/Alert';

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

// ── Budget Bar ───────────────────────────────────────────────────────────────

function BudgetBar({ cap, spent, count, required }) {
  const remaining = cap - spent;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  const isOver = remaining < 0;
  const isWarning = !isOver && remaining < cap * 0.15;
  const barColor = isOver ? '#ef4444' : isWarning ? '#f59e0b' : '#22c55e';

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 18px', marginBottom: 14 }}>
      {/* Top row: remaining + player count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <span style={{ color: isOver ? '#ef4444' : isWarning ? '#f59e0b' : '#4ade80', fontWeight: 800, fontSize: 22 }}>
            {fmtSalary(Math.abs(remaining))}
          </span>
          <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 6 }}>
            {isOver ? 'over cap' : 'remaining'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {Array.from({ length: required }, (_, i) => (
            <div
              key={i}
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i < count ? '#22c55e' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.2s',
              }}
            />
          ))}
          <span style={{ color: '#6b7280', fontSize: 11, marginLeft: 4 }}>{count}/{required}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: 999, transition: 'width 0.3s, background 0.3s' }} />
      </div>

      {/* Cap / Spent row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ color: '#4b5563', fontSize: 11 }}>Salary cap: {fmtSalary(cap)}</span>
        <span style={{ color: '#4b5563', fontSize: 11 }}>Used: {fmtSalary(spent)}</span>
      </div>
    </div>
  );
}

// ── Countdown ────────────────────────────────────────────────────────────────

function Countdown({ lockTime }) {
  const [display, setDisplay] = useState('');
  const [urgent, setUrgent] = useState(false);
  useEffect(() => {
    function tick() {
      const diff = new Date(lockTime) - Date.now();
      if (diff <= 0) { setDisplay('Locked'); setUrgent(false); return; }
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

// ── Roster Slot ──────────────────────────────────────────────────────────────

function RosterSlot({ index, player, livePick, locked, onAdd, onRemove }) {
  if (!player) {
    return (
      <button
        type="button"
        onClick={locked ? undefined : onAdd}
        disabled={locked}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1.5px dashed rgba(255,255,255,0.08)',
          borderRadius: 14, padding: '14px 14px',
          cursor: locked ? 'default' : 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { if (!locked) { e.currentTarget.style.borderColor = 'rgba(34,197,94,0.35)'; e.currentTarget.style.background = 'rgba(34,197,94,0.04)'; } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
      >
        <span style={{ color: '#374151', fontWeight: 700, fontSize: 12, width: 20, textAlign: 'center', flexShrink: 0 }}>{index + 1}</span>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          border: '1.5px dashed rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Plus size={16} style={{ color: '#374151' }} />
        </div>
        <span style={{ color: '#4b5563', fontSize: 13, fontWeight: 500 }}>Select player</span>
      </button>
    );
  }

  const totalScore = livePick
    ? [livePick.round1, livePick.round2, livePick.round3, livePick.round4].filter(r => r != null).reduce((s, r) => s + r, 0)
    : null;
  const hasScore = livePick && livePick.round1 != null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '12px 14px',
    }}>
      <span style={{ color: '#6b7280', fontWeight: 700, fontSize: 12, width: 20, textAlign: 'center', flexShrink: 0 }}>{index + 1}</span>
      <PlayerAvatar name={player.player_name} tier={player.tier_number} espnPlayerId={player.espn_player_id || livePick?.espn_player_id} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {flipName(player.player_name)}
        </div>
        <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700 }}>{fmtSalary(player.salary)}</div>
      </div>
      {hasScore && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: scoreColor(totalScore), fontWeight: 700, fontSize: 15 }}>{fmtScore(totalScore)}</div>
          <div style={{ color: '#6b7280', fontSize: 10 }}>total</div>
        </div>
      )}
      {!locked && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${flipName(player.player_name)}`}
          style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', color: '#6b7280',
            width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#6b7280'; }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ── Player Selector Modal ────────────────────────────────────────────────────
// Single-pick: selecting a player fires onPick and closes immediately.

function PlayerSelector({ players, selectedIds, salaryCap, currentSpent, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    function esc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const seen = new Set();
  const unique = players.filter(p => { if (seen.has(p.player_id)) return false; seen.add(p.player_id); return true; });
  const sorted = [...unique].sort((a, b) => (b.salary || 0) - (a.salary || 0));

  const q = query.trim().toLowerCase();
  const filtered = q ? sorted.filter(p => flipName(p.player_name).toLowerCase().includes(q)) : sorted;
  const remaining = salaryCap - currentSpent;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes sc-slide { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (min-width: 640px) {
          .sc-selector-sheet { align-self: center !important; max-height: 75vh !important; border-radius: 14px !important; max-width: 520px !important; }
        }
      `}</style>
      <div
        className="sc-selector-sheet"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#0f1923', borderRadius: '18px 18px 0 0', maxHeight: '88vh', display: 'flex', flexDirection: 'column', animation: 'sc-slide 0.22s ease' }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Add Player</div>
            <div style={{ color: remaining > 0 ? '#4ade80' : '#f87171', fontSize: 12, fontWeight: 600, marginTop: 2 }}>
              {fmtSalary(remaining)} remaining
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#9ca3af', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search players…"
            autoFocus
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
              padding: '8px 12px', color: '#fff', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {/* Player list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '6px 10px 16px' }}>
          {filtered.length === 0 && (
            <p style={{ color: '#4b5563', textAlign: 'center', padding: 32, fontSize: 13 }}>No players found</p>
          )}
          {filtered.map(p => {
            const isSel = selectedIds.includes(p.player_id);
            const isWD = !!p.is_withdrawn;
            const tooExpensive = !isSel && !isWD && (p.salary || 0) > remaining;
            const disabled = isSel || isWD || tooExpensive;

            return (
              <button
                key={p.player_id}
                type="button"
                disabled={disabled}
                onClick={() => { if (!disabled) onPick(p); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                  background: isSel ? 'rgba(34,197,94,0.06)' : 'transparent',
                  border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  padding: '10px 10px', textAlign: 'left',
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  transition: 'background 0.1s',
                }}
              >
                <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: isSel ? '#4ade80' : '#f1f5f9', fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {flipName(p.player_name)}
                    {isSel && <span style={{ color: '#22c55e', marginLeft: 6, fontSize: 11 }}>✓ selected</span>}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>
                    {p.odds_display || '—'}
                    {tooExpensive && <span style={{ color: '#ef4444', marginLeft: 6 }}>over budget</span>}
                    {isWD && <span style={{ color: '#ef4444', marginLeft: 6 }}>WD</span>}
                  </div>
                </div>
                <div style={{ color: tooExpensive ? '#6b7280' : '#fbbf24', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {fmtSalary(p.salary)}
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
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const cap = league.weekly_salary_cap || 50000;
  const required = league.starters_per_week || league.roster_size || 6;

  useEffect(() => {
    api.get(`/golf/leagues/${leagueId}/my-roster`)
      .then(r => {
        setData(r.data);
        if (r.data.picks?.length) {
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
  const isFull = selections.length >= required;
  const canSubmit = selections.length === required && !isOver && !picksLocked;

  function handlePick(player) {
    if (isFull) return;
    if (selectedIds.includes(player.player_id)) return;
    setSelections(prev => [...prev, player]);
    setSelectorOpen(false);
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
      const r = await api.get(`/golf/leagues/${leagueId}/my-roster`);
      setData(r.data);
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to submit picks');
    } finally {
      setSubmitting(false);
    }
  }

  // Build slot array: filled slots + empty slots
  const slots = Array.from({ length: required }, (_, i) => selections[i] || null);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Tournament header */}
      <div style={{ marginBottom: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>{data.tournament.name}</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2 }}>Salary Cap · {required} players · {fmtSalary(cap)} budget</div>
          </div>
          {picksLocked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f87171', fontSize: 12, fontWeight: 600 }}>
              <Lock size={14} /> Locked
            </div>
          ) : data.lock_time ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              Locks in <Countdown lockTime={data.lock_time} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Budget bar */}
      <BudgetBar cap={cap} spent={spent} count={selections.length} required={required} />

      {/* Roster slots */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {slots.map((player, i) => (
          <RosterSlot
            key={player ? player.player_id : `empty-${i}`}
            index={i}
            player={player}
            livePick={player ? data.picks?.find(pp => pp.player_id === player.player_id) : null}
            locked={picksLocked}
            onAdd={() => setSelectorOpen(true)}
            onRemove={() => removePick(player?.player_id)}
          />
        ))}
      </div>

      {/* Submit */}
      {!picksLocked && (
        <div style={{ position: 'sticky', bottom: 16, paddingTop: 8 }}>
          {submitError && <Alert variant="destructive" title={submitError} onClose={() => setSubmitError('')} compact style={{ marginBottom: 8 }} />}
          {submitSuccess && <Alert variant="success" title="Picks submitted!" compact style={{ marginBottom: 8 }} />}
          <Button
            variant="primary"
            color="green"
            size="lg"
            fullWidth
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting…' : !isFull ? `Pick ${required - selections.length} more player${required - selections.length !== 1 ? 's' : ''}` : isOver ? 'Over salary cap' : 'Submit Lineup'}
          </Button>
        </div>
      )}

      {picksLocked && data.picks?.length > 0 && (
        <div style={{ textAlign: 'center', padding: '8px 0', color: '#6b7280', fontSize: 13 }}>
          <Lock style={{ display: 'inline', width: 12, height: 12, marginRight: 4 }} />
          Picks are locked. Good luck!
        </div>
      )}

      {/* Player selector — single-pick mode */}
      {selectorOpen && !isFull && (
        <PlayerSelector
          players={allPlayers}
          selectedIds={selectedIds}
          salaryCap={cap}
          currentSpent={spent}
          onPick={handlePick}
          onClose={() => setSelectorOpen(false)}
        />
      )}
    </div>
  );
}
