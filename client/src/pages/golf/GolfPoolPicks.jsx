import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Check, Lock, ArrowLeft, AlertCircle, Trophy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';

// ── Countdown ─────────────────────────────────────────────────────────────────

function Countdown({ lockTime }) {
  const [display, setDisplay] = useState('');
  const [urgent, setUrgent]   = useState(false);

  useEffect(() => {
    function tick() {
      const diff = new Date(lockTime) - Date.now();
      if (diff <= 0) { setDisplay('Picks closed'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setUrgent(diff < 3600000);
      if (d > 0)      setDisplay(`${d}d ${h}h ${m}m`);
      else if (h > 0) setDisplay(`${h}h ${m}m ${s}s`);
      else            setDisplay(`${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockTime]);

  return (
    <span className={`font-mono font-bold tabular-nums ${urgent ? 'text-red-400' : 'text-green-400'}`}>
      {display}
    </span>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ tiers, selected, names, onConfirm, onCancel, submitting }) {
  // Build flat list grouped by tier for display
  const lines = tiers.map(t => ({
    tier: t.tier,
    players: (selected[t.tier] || []).map(pid => names[pid] || pid),
    needed: t.picks,
  }));

  return (
    <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
        <h3 className="text-white font-black text-xl mb-1">Lock in your picks?</h3>
        <p className="text-gray-400 text-sm mb-5">You won't be able to change them after submitting.</p>

        <div className="bg-gray-800/60 rounded-xl p-4 mb-5 space-y-3">
          {lines.map(row => (
            <div key={row.tier}>
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mb-1">Tier {row.tier}</p>
              {row.players.length > 0 ? (
                row.players.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    <span className="text-gray-200">{name}</span>
                  </div>
                ))
              ) : (
                <p className="text-red-400 text-xs italic">Missing picks</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-xl transition-all text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-black rounded-xl transition-all text-sm"
          >
            {submitting ? 'Submitting…' : 'Yes, lock my picks →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Picks summary panel (shared by sidebar + bottom bar) ──────────────────────

function PicksSummary({ tiers, selected, names, totalDone, totalTarget, canSubmit, onSubmit }) {
  const pct = totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Tier-by-tier breakdown */}
      <div className="space-y-2">
        {tiers.map(t => {
          const picks = selected[t.tier] || [];
          const done  = picks.length === t.picks;
          return (
            <div key={t.tier} className="text-sm">
              <span className={`font-semibold ${done ? 'text-green-400' : 'text-gray-400'}`}>
                Tier {t.tier}:{' '}
              </span>
              {picks.length > 0 ? (
                <span className="text-gray-300">{picks.map(pid => names[pid] || pid).join(', ')}</span>
              ) : (
                <span className="text-gray-600 italic">— (pick {t.picks})</span>
              )}
              {done && <span className="text-green-400 ml-1">✓</span>}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{totalDone} of {totalTarget} picks made</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${canSubmit ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Submit button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className={`w-full py-3 rounded-xl font-black text-sm transition-all ${
          canSubmit
            ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/20'
            : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
        }`}
      >
        {canSubmit ? 'Submit Picks →' : `${totalTarget - totalDone} more pick${totalTarget - totalDone !== 1 ? 's' : ''} needed`}
      </button>
    </div>
  );
}

// ── Tiered pick sheet ─────────────────────────────────────────────────────────

const TIER_ICONS = ['🏆', '🥈', '🥉', '⛳', '🎯', '📌'];

function TieredPickSheet({ tiers, selected, names, onToggle }) {
  return (
    <div className="space-y-4">
      {tiers.map((tier, idx) => {
        const tierSel = selected[tier.tier] || [];
        const complete = tierSel.length === tier.picks;
        const sorted   = [...tier.players].sort((a, b) => (a.odds_decimal || 999) - (b.odds_decimal || 999));

        return (
          <div
            key={tier.tier}
            className={`rounded-2xl overflow-hidden border-2 transition-colors ${
              complete ? 'border-green-500/40 bg-green-500/[0.03]' : 'border-gray-800 bg-gray-900'
            }`}
          >
            {/* Tier header */}
            <div className={`flex items-center justify-between px-4 py-3 border-b ${complete ? 'border-green-500/20 bg-green-500/[0.06]' : 'border-gray-800 bg-gray-800/30'}`}>
              <div className="flex items-center gap-2">
                <span className="text-base">{TIER_ICONS[idx] || '⛳'}</span>
                <div>
                  <span className="text-white font-bold text-sm">Tier {tier.tier}</span>
                  {(tier.odds_min || tier.odds_max) && (
                    <span className="text-gray-500 text-xs ml-2">
                      {tier.odds_min} – {tier.odds_max}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                complete
                  ? 'bg-green-500/20 text-green-400 border-green-500/40'
                  : 'bg-gray-800 text-gray-400 border-gray-700'
              }`}>
                {tierSel.length} of {tier.picks}{complete ? ' ✓' : ''}
              </span>
            </div>

            {/* Pick prompt */}
            <div className="px-4 pt-2.5 pb-1">
              <p className="text-gray-500 text-xs">
                {complete
                  ? `${tier.picks === 1 ? 'Player' : 'All players'} selected ✓`
                  : `Pick ${tier.picks - tierSel.length} more player${(tier.picks - tierSel.length) !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Player grid */}
            <div className="p-3 pt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sorted.map(p => {
                const isSelected = tierSel.includes(p.player_id);
                const tierFull   = tierSel.length >= tier.picks && !isSelected;
                return (
                  <button
                    key={p.player_id}
                    type="button"
                    disabled={tierFull}
                    onClick={() => onToggle(tier.tier, p.player_id, p.player_name, tier.picks)}
                    className={`flex items-center justify-between rounded-xl border-2 px-3.5 py-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-green-500 bg-green-500/15 shadow-sm shadow-green-500/10'
                        : tierFull
                          ? 'border-gray-800 bg-transparent opacity-35 cursor-not-allowed'
                          : 'border-gray-700 bg-gray-800/40 hover:border-gray-500 hover:bg-gray-800/70 active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        isSelected ? 'bg-green-500 border-green-500' : 'border-gray-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-sm font-semibold truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                        {p.player_name}
                      </span>
                    </div>
                    <span className={`text-xs shrink-0 ml-2 tabular-nums ${isSelected ? 'text-green-300' : 'text-gray-500'}`}>
                      {p.odds_display}
                    </span>
                  </button>
                );
              })}

              {tier.players.length === 0 && (
                <p className="col-span-2 text-gray-600 text-xs text-center py-3">
                  No players assigned to this tier yet.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GolfPoolPicks() {
  const { id }   = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  useDocTitle('Make Your Picks | Golf Pool');

  const [league, setLeague]   = useState(null);
  const [tiers, setTiers]     = useState([]);
  const [myPicks, setMyPicks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // { [tierNum]: [player_id, ...] }
  const [selected, setSelected] = useState({});
  // { [player_id]: player_name }
  const [names, setNames]       = useState({});

  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/golf/leagues/${id}`),
      api.get(`/golf/leagues/${id}/picks/my`),
    ]).then(([lRes, pRes]) => {
      const l    = lRes.data.league;
      const data = pRes.data;
      setLeague(l);
      setMyPicks(data);

      // Already submitted → go to confirmed page
      if (data.submitted) {
        navigate(`/golf/league/${id}/picks/submitted`, { replace: true });
        return;
      }
      // Locked but not submitted → stay and show locked screen
      if (data.picks_locked || l.picks_locked) { setLoading(false); return; }

      const tid = l.pool_tournament_id;
      if (tid) {
        api.get(`/golf/leagues/${id}/tier-players`, { params: { tournament_id: tid } })
          .then(r => setTiers(r.data.tiers || []))
          .catch(() => {})
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch(err => {
      const s = err.response?.status;
      setError(s === 403 ? "You don't have access to this league." : 'Failed to load pick sheet.');
      setLoading(false);
    });
  }, [id]);

  function handleToggle(tierNum, playerId, playerName, tierLimit) {
    setSelected(prev => {
      const curr = prev[tierNum] || [];
      if (curr.includes(playerId)) {
        return { ...prev, [tierNum]: curr.filter(x => x !== playerId) };
      }
      if (curr.length >= tierLimit) return prev;
      return { ...prev, [tierNum]: [...curr, playerId] };
    });
    setNames(prev => ({ ...prev, [playerId]: playerName }));
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError('');
    const picks = [];
    for (const [tierNum, ids] of Object.entries(selected)) {
      for (const pid of ids) {
        picks.push({ player_id: pid, player_name: names[pid] || '', tier_number: parseInt(tierNum) });
      }
    }
    try {
      await api.post(`/golf/leagues/${id}/picks`, {
        tournament_id: league.pool_tournament_id,
        picks,
      });
      navigate(`/golf/league/${id}/picks/submitted`);
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed. Try again.');
      setShowConfirm(false);
    }
    setSubmitting(false);
  }

  // Readiness
  const totalDone   = Object.values(selected).flat().length;
  const totalTarget = tiers.reduce((s, t) => s + (t.picks || 0), 0);
  const canSubmit   = tiers.length > 0 && tiers.every(t => (selected[t.tier] || []).length === t.picks);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center py-24">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── Error (no league) ─────────────────────────────────────────────────────
  if (error && !league) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-4" />
      <p className="text-gray-300 font-semibold mb-2">{error}</p>
      <Link to={`/golf/league/${id}`} className="text-green-400 text-sm hover:text-green-300 transition-colors">
        ← Back to league
      </Link>
    </div>
  );

  // ── Picks locked ──────────────────────────────────────────────────────────
  if (myPicks?.picks_locked || league?.picks_locked) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 border border-gray-700 mb-5">
        <Lock className="w-7 h-7 text-gray-400" />
      </div>
      <h2 className="text-white font-black text-2xl mb-2">Picks are closed</h2>
      <p className="text-gray-400 text-sm mb-8">
        Tee time has passed. Check the leaderboard to track your players.
      </p>
      <Link
        to={`/golf/league/${id}?tab=standings`}
        className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-3 rounded-xl transition-all text-sm"
      >
        <Trophy className="w-4 h-4" /> View Leaderboard
      </Link>
    </div>
  );

  // ── No tournament assigned ─────────────────────────────────────────────────
  if (!league?.pool_tournament_id) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-4" />
      <h2 className="text-white font-black text-xl mb-2">No tournament assigned yet</h2>
      <p className="text-gray-400 text-sm mb-6">
        The commissioner needs to set up the tournament pick sheet before you can make picks.
      </p>
      <Link to={`/golf/league/${id}`} className="text-green-400 text-sm hover:text-green-300 transition-colors">
        ← Back to league
      </Link>
    </div>
  );

  const tourn    = myPicks?.tournament;
  const lockTime = myPicks?.lock_time;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28 lg:pb-8">

      {/* Back + header */}
      <Link
        to={`/golf/league/${id}`}
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {league.name}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">{tourn?.name || 'Pick Sheet'}</h1>
        <p className="text-gray-400 text-sm mt-1">
          Lock your picks before Thursday tee time
          {lockTime && <> · <Countdown lockTime={lockTime} /></>}
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/60 text-red-300 rounded-xl p-3.5 text-sm mb-5">
          {error}
        </div>
      )}

      {/* Two-column layout: pick sheet | sidebar */}
      <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-6 lg:items-start">

        {/* Left: Tier pick sheet */}
        <TieredPickSheet
          tiers={tiers}
          selected={selected}
          names={names}
          onToggle={handleToggle}
        />

        {/* Right: Desktop summary sidebar */}
        <div className="hidden lg:block">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sticky top-6">
            <p className="text-white font-bold text-sm mb-4">Your Picks</p>
            <PicksSummary
              tiers={tiers}
              selected={selected}
              names={names}
              totalDone={totalDone}
              totalTarget={totalTarget}
              canSubmit={canSubmit}
              onSubmit={() => setShowConfirm(true)}
            />
          </div>
        </div>

      </div>

      {/* Mobile: sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-gray-950/97 border-t border-gray-800 px-4 pt-3 pb-safe-or-4 pb-4 z-20">
        <div className="max-w-2xl mx-auto">
          {/* Compact progress */}
          <div className="flex items-center gap-3 mb-2.5">
            <div className="flex-1 bg-gray-800 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${canSubmit ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: totalTarget > 0 ? `${Math.round((totalDone / totalTarget) * 100)}%` : '0%' }}
              />
            </div>
            <span className="text-gray-400 text-xs whitespace-nowrap shrink-0">
              {totalDone}/{totalTarget} picks
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={!canSubmit}
            className={`w-full py-3.5 rounded-xl font-black text-sm transition-all ${
              canSubmit
                ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/20'
                : 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed'
            }`}
          >
            {canSubmit ? 'Submit Picks →' : `${totalTarget - totalDone} more pick${totalTarget - totalDone !== 1 ? 's' : ''} needed`}
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <ConfirmModal
          tiers={tiers}
          selected={selected}
          names={names}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
        />
      )}

    </div>
  );
}
