import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Users, Zap, Star, Flag, Trophy, Target, Check, Lock, ArrowLeft, ArrowRight, ChevronRight, Award, Copy, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import BallLoader from '../../components/BallLoader';
import GolfPaymentModal from '../../components/golf/GolfPaymentModal';

// ── Helpers ────────────────────────────────────────────────────────────────────

function Chip({ children, color = 'gray' }) {
  const colors = {
    gray:   'bg-gray-700/60 text-gray-400 border-gray-700',
    green:  'bg-green-500/15 text-green-400 border-green-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    blue:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    red:    'bg-red-500/15 text-red-400 border-red-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${colors[color]}`}>
      {children}
    </span>
  );
}

function SalaryCap({ used, cap }) {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Salary used</span>
        <span className={pct > 90 ? 'text-red-400 font-bold' : 'text-gray-300'}>
          ${used.toLocaleString()} / ${cap.toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────────

const FORMAT_META = {
  pool:        { label: 'Pool',          color: 'blue'  },
  dk:          { label: 'Daily Fantasy', color: 'purple' },
  tourneyrun:  { label: 'TourneyRun',    color: 'green' },
};

function OverviewTab({ league, members, user, isComm, navigate }) {
  const inviteUrl = `${window.location.origin}/golf/join?code=${league.invite_code}`;
  const [copied, setCopied] = useState(false);
  const fmt = FORMAT_META[league.format_type] || FORMAT_META.tourneyrun;

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Format-specific stat cards
  const statCards = (() => {
    if (league.format_type === 'pool') return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Picks Per Team',  value: String(league.picks_per_team || 8) },
      { label: 'Format',          value: 'Pool' },
    ];
    if (league.format_type === 'dk') return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Weekly Cap',      value: `$${(league.weekly_salary_cap || 50000).toLocaleString()}` },
      { label: 'Starters / Wk',   value: String(league.starters_per_week || 6) },
    ];
    // tourneyrun default
    return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Core + Flex',     value: `${league.core_spots || 4} + ${league.flex_spots || 4}` },
      { label: 'FAAB Budget',     value: `$${(league.faab_budget || 500).toLocaleString()}` },
    ];
  })();

  return (
    <div className="space-y-5">
      {/* Format badge */}
      <div className="flex items-center gap-2">
        <Chip color={fmt.color}>{fmt.label}</Chip>
        {league.format_type === 'tourneyrun' && league.use_faab
          ? <Chip color="yellow">FAAB Wire</Chip>
          : league.format_type === 'tourneyrun'
          ? <Chip color="gray">Priority Wire</Chip>
          : null
        }
      </div>

      {/* League info card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          {statCards.map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl px-4 py-3 text-center">
              <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">{s.label}</div>
              <div className="text-white font-black text-2xl">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Invite code */}
        <div className="border border-gray-700 rounded-xl p-4 bg-gray-800/30">
          <div className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-2">Invite Code</div>
          <div className="flex items-center gap-3">
            <span className="text-white font-black text-2xl tracking-widest flex-1">{league.invite_code}</span>
            <button
              onClick={copyInvite}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${
                copied
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:text-white hover:border-gray-500'
              }`}
            >
              {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy Link</>}
            </button>
          </div>
        </div>

        {/* Text to join — visible to all members */}
        <a
          href={`sms:?body=${encodeURIComponent(
            `Join my fantasy golf league "${league.name}" on TourneyRun! ` +
            `One draft, all season, majors count 1.5x. ` +
            `Use invite code ${league.invite_code} or join here: ` +
            `https://www.tourneyrun.app/golf/join?code=${league.invite_code}`
          )}`}
          title="Opens your texts on mobile"
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold text-sm rounded-xl transition-all"
        >
          <MessageSquare className="w-4 h-4" /> Text Friends to Join
        </a>
      </div>

      {/* Members list */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h3 className="text-white font-bold">Members</h3>
        </div>
        <div className="divide-y divide-gray-800">
          {members.map((m, i) => (
            <div key={m.user_id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                  {i + 1}
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">{m.team_name}</div>
                  <div className="text-gray-500 text-xs">{m.username}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.user_id === league.commissioner_id && <Chip color="green">Comm</Chip>}
                {m.user_id === user.id && <Chip color="blue">You</Chip>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pool mode: picks CTA for members (only if open) */}
      {league.format_type === 'pool' && league.pool_tournament_id && !league.picks_locked && (
        <div style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 16, padding: '20px' }}>
          <div className="flex items-center gap-2 mb-2">
            <Flag className="w-4 h-4" style={{ color: '#00e87a' }} />
            <span style={{ color: '#00e87a', fontWeight: 700, fontSize: 14 }}>Make Your Picks</span>
            {league.pool_tournament_name && (
              <span className="text-gray-500 text-xs ml-auto">{league.pool_tournament_name}</span>
            )}
          </div>
          <p className="text-gray-400 text-sm mb-4">Select your golfers before picks lock. Use the Roster tab or click below.</p>
          <button
            onClick={() => navigate(`/golf/league/${league.id}/picks`)}
            style={{ width: '100%', background: '#00e87a', color: '#001a0d', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background 0.15s, transform 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#00cc6a'; e.currentTarget.style.transform = 'scale(1.01)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#00e87a'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Select Your Players →
          </button>
        </div>
      )}

      {/* Commissioner actions */}
      {isComm && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
            <Zap className="w-4 h-4 text-green-400" />
            <h3 className="text-white font-bold text-sm">Commissioner Actions</h3>
          </div>
          {/* Pick Sheet settings — Pool format only */}
          {league.format_type === 'pool' && (
            <button
              onClick={() => navigate(`/golf/league/${league.id}/settings`)}
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-semibold rounded-xl transition-all mb-2 text-sm"
            >
              ⚙ Pick Sheet Settings →
            </button>
          )}
          {league.format_type === 'pool' && league.pool_tournament_id && (
            <button
              onClick={() => navigate(`/golf/league/${league.id}/picks`)}
              className={`w-full py-3 font-bold rounded-xl transition-all mb-2 ${
                league.picks_locked
                  ? 'bg-gray-800 text-gray-400 border border-gray-700 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-400 text-white'
              }`}
              disabled={league.picks_locked}
            >
              {league.picks_locked ? 'Picks Locked' : 'Make Your Picks →'}
            </button>
          )}
          {league.format_type === 'tourneyrun' && league.draft_status !== 'completed' && (
            <>
              <button
                onClick={() => navigate(`/golf/league/${league.id}/draft`)}
                style={{ width: '100%', background: '#00e87a', color: '#001a0d', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', transition: 'background 0.15s, transform 0.15s', marginBottom: 8 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#00cc6a'; e.currentTarget.style.transform = 'scale(1.01)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#00e87a'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                Go to Draft Room →
              </button>
              <p className="text-gray-600 text-xs mb-3 text-center">
                Draft core players. Flex spots fill via waiver wire.
              </p>
            </>
          )}
          <button
            onClick={() => navigate(`/golf/league/${league.id}/scores`)}
            style={{ width: '100%', background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'transparent'; }}
          >
            Enter Scores →
          </button>
        </div>
      )}


      {/* DK mode: no draft, direct to lineup */}
      {league.format_type === 'dk' && (
        <div className="bg-purple-500/8 border border-purple-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-purple-400" />
            <span className="text-purple-400 font-bold text-sm">Daily Fantasy Mode</span>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            No draft — pick {league.starters_per_week || 6} golfers fresh each tournament with a ${(league.weekly_salary_cap || 50000).toLocaleString()} cap.
          </p>
          <button
            onClick={() => navigate(`/golf/league/${league.id}?tab=lineup`)}
            className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl transition-all"
          >
            Set This Week's Lineup →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Tiered Pick Sheet (Pool leagues) ──────────────────────────────────────

const TIER_COLORS = [
  { accent: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)', borderComplete: 'rgba(0,232,122,0.3)' },
  { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.2)', borderComplete: 'rgba(0,232,122,0.3)' },
  { accent: '#3b82f6', bg: 'rgba(59,130,246,0.06)',  border: 'rgba(59,130,246,0.2)',  borderComplete: 'rgba(0,232,122,0.3)' },
  { accent: '#22c55e', bg: 'rgba(34,197,94,0.06)',   border: 'rgba(34,197,94,0.2)',   borderComplete: 'rgba(0,232,122,0.3)' },
];

const TIER_NAMES = { 1: 'Tier 1 · Elite', 2: 'Tier 2 · Premium', 3: 'Tier 3 · Mid-Field', 4: 'Tier 4 · Longshots' };

function TieredPickSheet({ leagueId, league }) {
  const navigate = useNavigate();
  const [tiers, setTiers]           = useState([]);
  const [picks, setPicks]           = useState({});     // { [tierNumber]: [playerId, ...] }
  const [submitted, setSubmitted]   = useState(false);
  const [locked, setLocked]         = useState(!!league.picks_locked);
  const [lockTime, setLockTime]     = useState(null);
  const [totalTarget, setTotalTarget] = useState(0);
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [countdown, setCountdown]   = useState('');
  const tierRefs = useRef([]);

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
        setLocked(pickRes.data.picks_locked || !!league.picks_locked);
        setLockTime(pickRes.data.lock_time || null);
        setTotalTarget(pickRes.data.total_target || 0);
        setTournament(pickRes.data.tournament || null);

        // Build picks map: { [tierNumber]: [playerId, ...] }
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

  // Live lock countdown
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
        // Auto-advance: smooth-scroll to next tier when this one fills
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

  // ── Submitted + locked → confirmation view ─────────────────────────────────
  if (submitted && locked) {
    return (
      <div className="space-y-4">
        {/* Confirmed banner */}
        <div style={{ background: 'rgba(0,232,122,0.08)', border: '1px solid rgba(0,232,122,0.25)', borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
          <div style={{ color: '#00e87a', fontWeight: 800, fontSize: 22, marginBottom: 6 }}>Your picks are in!</div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>{tournName} · Picks locked</div>
          {tournament?.start_date && (
            <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4 }}>
              Tournament starts {new Date(tournament.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>

        {/* Tier breakdown */}
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
                    <span key={name} style={{ background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.25)', color: '#00e87a', fontSize: 13, fontWeight: 600, padding: '5px 14px', borderRadius: 20 }}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* View leaderboard */}
        <button
          onClick={() => navigate(`/golf/league/${leagueId}?tab=standings`)}
          style={{ width: '100%', background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
        >
          View Leaderboard →
        </button>
      </div>
    );
  }

  // ── Pick sheet ─────────────────────────────────────────────────────────────
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
                  <div style={{ color: '#00e87a', fontWeight: 700, fontSize: 16 }}>{countdown}</div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#9ca3af', fontSize: 12 }}>{totalPicks} of {totalTarget} picks made</span>
            {allComplete && <span style={{ color: '#00e87a', fontSize: 12, fontWeight: 700 }}>✓ All complete</span>}
          </div>
          <div style={{ height: 5, background: '#1f2937', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${totalTarget > 0 ? (totalPicks / totalTarget) * 100 : 0}%`,
              background: allComplete ? '#00e87a' : '#3b82f6',
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
                  <span style={{ color: isComplete ? '#00e87a' : colors.accent, fontWeight: 700, fontSize: 14 }}>
                    {TIER_NAMES[tier.tier] || `Tier ${tier.tier}`}
                  </span>
                  <span style={{ color: '#4b5563', fontSize: 12 }}>· pick {tier.picks}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: isComplete ? '#00e87a' : '#4b5563', fontSize: 13, fontWeight: 600 }}>
                    {tierPicks.length}/{tier.picks}
                  </span>
                  {isComplete && (
                    <span style={{
                      background: locked ? 'rgba(239,68,68,0.1)' : 'rgba(0,232,122,0.15)',
                      border: `1px solid ${locked ? 'rgba(239,68,68,0.3)' : 'rgba(0,232,122,0.3)'}`,
                      color: locked ? '#f87171' : '#00e87a',
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {locked ? 'Locked' : '✓ Complete'}
                    </span>
                  )}
                </div>
              </div>

              {/* Players list */}
              <div>
                {(tier.players || []).map((player, pIdx) => {
                  const pid        = player.player_id;
                  const isSelected = tierPicks.includes(pid);
                  const isFull     = !isSelected && tierPicks.length >= tier.picks;
                  const isDisabled = locked || isFull;

                  return (
                    <button
                      key={pid}
                      onClick={() => togglePick(tier.tier, pid, tier.picks)}
                      disabled={isDisabled}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
                        background: isSelected ? 'rgba(0,232,122,0.1)' : 'transparent',
                        border: 'none',
                        borderBottom: pIdx < (tier.players.length - 1) ? '1px solid rgba(255,255,255,0.04)' : 'none',
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
                        border: `2px solid ${isSelected ? '#00e87a' : 'rgba(255,255,255,0.2)'}`,
                        background: isSelected ? '#00e87a' : 'transparent',
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
                        <div style={{ color: isSelected ? '#fff' : '#d1d5db', fontSize: 13, fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {player.player_name}
                        </div>
                        <div style={{ color: '#4b5563', fontSize: 11, marginTop: 1 }}>
                          #{player.world_ranking}{player.country ? ` · ${player.country}` : ''}
                        </div>
                      </div>
                    </button>
                  );
                })}
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
                <span key={tier.tier} style={{ fontSize: 11, color: isComplete ? '#00e87a' : '#4b5563' }}>
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
              <div style={{ background: 'rgba(0,232,122,0.15)', border: '1px solid rgba(0,232,122,0.3)', color: '#00e87a', fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 8 }}>
                {submitted ? 'Picks Submitted ✓' : 'Picks Locked'}
              </div>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!allComplete || saving}
                style={{
                  background: allComplete && !saving ? '#00e87a' : 'rgba(255,255,255,0.08)',
                  color: allComplete && !saving ? '#001a0d' : '#4b5563',
                  fontWeight: 700, fontSize: 14, padding: '10px 24px', borderRadius: 8,
                  border: 'none', cursor: allComplete && !saving ? 'pointer' : 'not-allowed',
                  transition: 'background 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (allComplete && !saving) e.currentTarget.style.background = '#00cc6a'; }}
                onMouseLeave={e => { if (allComplete && !saving) e.currentTarget.style.background = '#00e87a'; }}
              >
                {saving ? 'Submitting...' : 'Submit Picks →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pool Roster Tab ────────────────────────────────────────────────────────────

const TIER_COLORS = {
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
  if (val < 0) return '#00e87a';
  if (val > 0) return '#f87171';
  return '#e5e7eb';
}

function InitialsAvatar({ name, tier, size = 44 }) {
  const tc = TIER_COLORS[tier] || TIER_COLORS[4];
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0,
      boxShadow: `0 2px 8px ${tc.border}`,
    }}>{initials}</div>
  );
}

function CountryFlag({ cc }) {
  if (!cc) return null;
  const code = cc.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/24x18/${code}.png`}
      alt={cc}
      style={{ width: 18, height: 13, borderRadius: 2, objectFit: 'cover', flexShrink: 0 }}
      onError={e => { e.target.style.display = 'none'; }}
    />
  );
}

function PlayerCard({ pick, tier, idx, tournStatus, picksLocked, navigate, leagueId }) {
  const tc = TIER_COLORS[tier] || TIER_COLORS[4];
  const rounds = getRounds(pick);
  const todayRaw = getTodayScore(pick);
  const totalPar = rounds.reduce((s, r) => s + (r || 0), 0);
  const pts = pick.fantasy_points;
  const isWD = pick.made_cut === 0 && pick.finish_position == null;
  const isCUT = pick.made_cut === 0 && pick.finish_position != null;
  const hasScores = rounds.length > 0;
  const isLive = tournStatus === 'active';
  const isComplete = tournStatus === 'completed';

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${tc.border}`,
      borderRadius: 14,
      padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      position: 'relative', overflow: 'hidden',
      animation: `fadeSlideUp 0.35s ease both`,
      animationDelay: `${idx * 60}ms`,
      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 24px ${tc.border}`; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      {/* WD/CUT overlay */}
      {(isWD || isCUT) && (
        <div style={{
          position: 'absolute', top: 8, right: 10,
          background: isWD ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.15)',
          border: `1px solid ${isWD ? 'rgba(239,68,68,0.4)' : 'rgba(107,114,128,0.3)'}`,
          borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 700,
          color: isWD ? '#f87171' : '#9ca3af', letterSpacing: '0.05em',
        }}>{isWD ? 'WD' : 'CUT'}</div>
      )}

      <InitialsAvatar name={pick.player_name} tier={tier} />

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
          {pick.country && <CountryFlag cc={pick.country} />}
          {pick.world_ranking && (
            <span style={{ fontSize: 11, color: '#6b7280' }}>WR #{pick.world_ranking}</span>
          )}
          {isLive && hasScores && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#00e87a' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00e87a', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Score column */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {hasScores ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(totalPar), lineHeight: 1 }}>
              {fmtScore(totalPar)}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {isLive ? `R${rounds.length}: ${fmtScore(todayRaw)}` : isComplete ? `Rd ${rounds.length}` : ''}
            </div>
            {pts != null && (
              <div style={{ fontSize: 11, fontWeight: 700, color: tc.label, marginTop: 1 }}>
                {pts > 0 ? '+' : ''}{pts} pts
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#4b5563' }}>—</span>
        )}
      </div>
    </div>
  );
}

function EmptySlot({ tier }) {
  const tc = TIER_COLORS[tier] || TIER_COLORS[4];
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

function PoolRosterTab({ leagueId, league }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/golf/pool/leagues/${leagueId}/my-roster`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [leagueId]);

  // Parse tier config to know how many picks per tier
  let tiersConfig = [];
  try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

  const picks = data?.picks || [];
  const picksLocked = data?.picks_locked ?? !!league.picks_locked;
  const tournStatus = league.pool_tournament_status;

  // Group picks by tier
  const byTier = {};
  for (const p of picks) {
    if (!byTier[p.tier_number]) byTier[p.tier_number] = [];
    byTier[p.tier_number].push(p);
  }

  // Determine tiers to show (from config or fallback to unique tier numbers in picks or 1–4)
  const tierNums = tiersConfig.length
    ? tiersConfig.map(t => parseInt(t.tier || t.tier_number || t.id)).filter(Boolean)
    : picks.length
      ? [...new Set(picks.map(p => p.tier_number))].sort()
      : [1, 2, 3, 4];

  const hasAnyPicks = picks.length > 0;

  const statusBar = () => {
    if (tournStatus === 'active') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 12, marginBottom: 20 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#00e87a', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
        <span style={{ fontSize: 13, color: '#00e87a', fontWeight: 600 }}>Tournament in progress · Scores updating live</span>
      </div>
    );
    if (tournStatus === 'completed') return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12, marginBottom: 20 }}>
        <Trophy size={14} style={{ color: '#fbbf24' }} />
        <span style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>Tournament complete · Final results</span>
      </div>
    );
    if (picksLocked) return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 12, marginBottom: 20 }}>
        <Lock size={14} style={{ color: '#fbbf24' }} />
        <span style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>Picks locked · Tee time has passed</span>
      </div>
    );
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Flag size={14} style={{ color: '#00e87a' }} />
          <span style={{ fontSize: 13, color: '#00e87a', fontWeight: 600 }}>Picks open</span>
        </div>
        <button
          onClick={() => navigate(`/golf/league/${leagueId}/picks`)}
          style={{ background: '#00e87a', color: '#0a0e1a', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          {hasAnyPicks ? 'Edit Picks →' : 'Make Picks →'}
        </button>
      </div>
    );
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <BallLoader />
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 0 40px' }}>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {statusBar()}

      {!hasAnyPicks ? (
        /* ── Empty state ── */
        <div>
          {tierNums.map(tierNum => {
            const tc = TIER_COLORS[tierNum] || TIER_COLORS[4];
            const tierCfg = tiersConfig.find(t => parseInt(t.tier || t.tier_number || t.id) === tierNum);
            const slotCount = parseInt(tierCfg?.picks || 1);
            return (
              <div key={tierNum} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: tc.accent }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: tc.label, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {TIER_NAMES_ROSTER[tierNum] || `Tier ${tierNum}`}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from({ length: slotCount }).map((_, i) => (
                    <EmptySlot key={i} tier={tierNum} />
                  ))}
                </div>
              </div>
            );
          })}
          {!picksLocked && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                onClick={() => navigate(`/golf/league/${leagueId}/picks`)}
                style={{ background: '#00e87a', color: '#0a0e1a', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Pick your players →
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Picks grid ── */
        <div>
          {tierNums.map(tierNum => {
            const tc = TIER_COLORS[tierNum] || TIER_COLORS[4];
            const tierPicks = byTier[tierNum] || [];
            const tierCfg = tiersConfig.find(t => parseInt(t.tier || t.tier_number || t.id) === tierNum);
            const slotCount = parseInt(tierCfg?.picks || tierPicks.length || 1);
            return (
              <div key={tierNum} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: tc.accent }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: tc.label, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {TIER_NAMES_ROSTER[tierNum] || `Tier ${tierNum}`}
                  </span>
                  <span style={{ fontSize: 11, color: '#4b5563' }}>{tierPicks.length}/{slotCount}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tierPicks.map((pick, idx) => (
                    <PlayerCard
                      key={pick.id}
                      pick={pick}
                      tier={tierNum}
                      idx={idx}
                      tournStatus={tournStatus}
                      picksLocked={picksLocked}
                      navigate={navigate}
                      leagueId={leagueId}
                    />
                  ))}
                  {/* Fill empty slots */}
                  {Array.from({ length: Math.max(0, slotCount - tierPicks.length) }).map((_, i) => (
                    <EmptySlot key={`empty-${i}`} tier={tierNum} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Roster ────────────────────────────────────────────────────────────────

function RosterTab({ leagueId, league }) {
  // Pool + tiered pick sheet — replace generic roster UI entirely
  if (league.format_type === 'pool' && league.pick_sheet_format === 'tiered') {
    return <PoolRosterTab leagueId={leagueId} league={league} />;
  }

  const fmt = league.format_type || 'tourneyrun';
  const [roster, setRoster] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState(false);
  const [dropping, setDropping] = useState(null);
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const [rRes, pRes] = await Promise.all([
        api.get(`/golf/leagues/${leagueId}/roster`),
        api.get('/golf/players'),
      ]);
      setRoster(rRes.data.roster || []);
      setAllPlayers(pRes.data.players || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [leagueId]);

  async function handleDrop(playerId) {
    setDropping(playerId);
    setError('');
    try {
      await api.post(`/golf/leagues/${leagueId}/roster/drop`, { player_id: playerId });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to drop player');
    }
    setDropping(null);
  }

  async function handleAdd(playerId) {
    setAdding(playerId);
    setError('');
    try {
      await api.post(`/golf/leagues/${leagueId}/roster/add`, { player_id: playerId });
      await load();
      setAddMode(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add player');
    }
    setAdding(null);
  }

  const rosterIds = new Set(roster.map(r => r.player_id));
  const usedSalary = roster.reduce((sum, r) => sum + (r.salary || 0), 0);
  const available = allPlayers.filter(p =>
    !rosterIds.has(p.id) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="py-10 text-center text-gray-500">Loading roster...</div>;

  // DK mode — no persistent roster
  if (fmt === 'dk') {
    return (
      <div className="py-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
          <Zap className="w-7 h-7 text-purple-400" />
        </div>
        <h3 className="text-white font-bold mb-2">Daily Fantasy Mode</h3>
        <p className="text-gray-400 text-sm max-w-xs mx-auto">
          No persistent roster in DFS mode. Set your {league.starters_per_week || 6} starters fresh each tournament from the Lineup tab.
        </p>
      </div>
    );
  }

  const coreRoster = roster.filter(p => p.is_core);
  const flexRoster = roster.filter(p => !p.is_core);
  const maxRoster = league.roster_size || 8;
  const flexMax = fmt === 'tourneyrun' ? (league.flex_spots || 4) : maxRoster;

  function PlayerRow({ p, isCore = false }) {
    return (
      <div className={`flex items-center justify-between px-5 py-3.5 gap-3 ${isCore ? 'bg-yellow-500/3' : ''}`}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {isCore && <Star className="w-4 h-4 text-yellow-400 shrink-0 fill-yellow-400" />}
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">{p.name}</div>
            <div className="text-gray-500 text-xs">{p.country} · Rank #{p.world_ranking}</div>
          </div>
        </div>
        {fmt !== 'pool' && <div className="text-green-400 font-bold text-sm shrink-0">${p.salary}</div>}
        {isCore ? (
          <span className="text-[10px] font-bold text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">CORE</span>
        ) : (
          <button
            onClick={() => handleDrop(p.player_id)}
            disabled={dropping === p.player_id}
            className="text-xs px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            Drop
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* Salary bar — not for Pool mode */}
      {fmt !== 'pool' && <SalaryCap used={usedSalary} cap={league.salary_cap || 2400} />}

      {/* TourneyRun: Core Players section */}
      {fmt === 'tourneyrun' && (
        <div className="bg-gray-900 border border-yellow-500/25 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-yellow-500/15 flex items-center gap-2 bg-yellow-500/5">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 shrink-0" />
            <h3 className="text-yellow-400 font-bold">Core Players ({coreRoster.length}/{league.core_spots || 4})</h3>
            <span className="ml-auto text-[10px] text-yellow-600 font-semibold uppercase tracking-wide">Season-locked</span>
          </div>
          {coreRoster.length === 0 ? (
            <div className="py-6 text-center text-gray-500 text-sm">Core players are set during the draft.</div>
          ) : (
            <div className="divide-y divide-yellow-500/10">
              {coreRoster.map(p => <PlayerRow key={p.player_id} p={p} isCore />)}
            </div>
          )}
        </div>
      )}

      {/* Flex / standard roster */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-gray-400" />
            <h3 className="text-white font-bold">
              {fmt === 'tourneyrun'
                ? `Flex Players (${flexRoster.length}/${flexMax})`
                : fmt === 'pool'
                ? `My Picks (${roster.length}/${maxRoster})`
                : `My Roster (${roster.length}/${maxRoster})`
              }
            </h3>
          </div>
          {roster.length < maxRoster && (
            <button
              onClick={() => setAddMode(m => !m)}
              className="text-xs px-3 py-1.5 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg font-semibold hover:bg-green-500/25 transition-colors"
            >
              {addMode ? 'Cancel' : '+ Add Player'}
            </button>
          )}
        </div>

        {(fmt === 'tourneyrun' ? flexRoster : roster).length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">
            {fmt === 'tourneyrun' ? 'No flex players yet. Use the waiver wire to add players.' : 'No players yet.'}
            {fmt !== 'tourneyrun' && (
              <button onClick={() => setAddMode(true)} className="text-green-400 hover:underline ml-1">Add players →</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {(fmt === 'tourneyrun' ? flexRoster : roster).map(p => <PlayerRow key={p.player_id} p={p} />)}
          </div>
        )}
      </div>

      {/* Add player panel */}
      {addMode && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-800">
            {available.slice(0, 40).map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{p.name}</div>
                  <div className="text-gray-500 text-xs">{p.country} · Rank #{p.world_ranking}</div>
                </div>
                {fmt !== 'pool' && <div className="text-green-400 font-bold text-sm shrink-0">${p.salary}</div>}
                <button
                  onClick={() => handleAdd(p.id)}
                  disabled={adding === p.id}
                  className="text-xs px-2.5 py-1 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/25 transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ))}
            {available.length === 0 && (
              <div className="py-6 text-center text-gray-500 text-sm">No players found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Lineup ────────────────────────────────────────────────────────────────

function LineupTab({ leagueId, league }) {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournId, setSelectedTournId] = useState(null);
  const [lineup, setLineup] = useState([]);
  const [roster, setRoster] = useState([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showPoolGate, setShowPoolGate] = useState(false);
  const [paidTournaments, setPaidTournaments] = useState([]);

  useEffect(() => {
    api.get('/golf/tournaments').then(r => {
      const upcoming = (r.data.tournaments || []).filter(t => t.status !== 'completed');
      setTournaments(upcoming);
      if (upcoming.length > 0) setSelectedTournId(upcoming[0].id);
    }).catch(() => setLoading(false));
    // Load paid office pool entries
    if (league.format_type === 'office_pool') {
      api.get('/golf/payments/status').then(r => setPaidTournaments(r.data.paidTournaments || [])).catch(() => {});
    }
  }, [league.format_type]);

  useEffect(() => {
    if (!selectedTournId) return;
    setLoading(true);
    api.get(`/golf/leagues/${leagueId}/lineup/${selectedTournId}`)
      .then(r => {
        setLineup((r.data.lineup || []).filter(l => l.is_started).map(l => l.player_id));
        setRoster(r.data.roster || []);
        setLocked(r.data.isLocked || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId, selectedTournId]);

  function toggleStarter(playerId) {
    if (locked) return;
    const maxStarters = league.starters_per_week || 6;
    setLineup(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
      if (prev.length >= maxStarters) return prev;
      return [...prev, playerId];
    });
  }

  async function saveLineup() {
    // Gate 1: office_pool format requires entry fee per tournament
    if (league.format_type === 'office_pool' && selectedTournId && !paidTournaments.includes(String(selectedTournId))) {
      setShowPoolGate(true);
      return;
    }
    await doSaveLineup();
  }

  async function doSaveLineup() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.post(`/golf/leagues/${leagueId}/lineup/${selectedTournId}`, { starter_ids: lineup });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save lineup');
    }
    setSaving(false);
  }

  const maxStarters = league.starters_per_week || 6;

  const selectedTourn = tournaments.find(t => t.id === selectedTournId || t.id === Number(selectedTournId));

  return (
    <div className="space-y-4">
      {/* Gate 1: Office Pool entry modal */}
      {showPoolGate && (
        <GolfPaymentModal
          type="office_pool"
          meta={{
            tournamentId: String(selectedTournId),
            tournamentName: selectedTourn?.name,
            isMajor: !!selectedTourn?.is_major,
            leagueId,
          }}
          onClose={() => setShowPoolGate(false)}
          onAlreadyPaid={() => {
            setPaidTournaments(p => [...p, String(selectedTournId)]);
            setShowPoolGate(false);
            doSaveLineup();
          }}
        />
      )}

      {/* Tournament selector */}
      {tournaments.length > 0 && (
        <div>
          <label className="label mb-2">Select Tournament</label>
          <select
            value={selectedTournId || ''}
            onChange={e => setSelectedTournId(Number(e.target.value))}
            className="input"
          >
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.start_date?.slice(0, 10)}{t.is_major ? ' ★' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {locked && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl px-4 py-3 text-sm font-semibold">
          <Lock className="w-4 h-4 shrink-0" /> Lineup locked — tournament has started.
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-8 text-center text-gray-500">Loading lineup...</div>
      ) : (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-gray-400" />
                <h3 className="text-white font-bold">
                  Set Starters ({lineup.length}/{maxStarters})
                </h3>
              </div>
              {!locked && (
                <button
                  onClick={saveLineup}
                  disabled={saving}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all disabled:opacity-50 ${
                    saved
                      ? 'bg-green-500/20 border-green-500/40 text-green-400'
                      : 'bg-green-500 border-green-500 text-white hover:bg-green-400'
                  }`}
                >
                  {saving ? 'Saving...' : saved ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" />Saved</span> : 'Save Lineup'}
                </button>
              )}
            </div>
            {roster.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">
                Add players to your roster first to set a lineup.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {roster.map(p => {
                  const isStarter = lineup.includes(p.player_id);
                  const canAdd = !isStarter && lineup.length < maxStarters && !locked;
                  return (
                    <button
                      key={p.player_id}
                      onClick={() => toggleStarter(p.player_id)}
                      disabled={locked || (!isStarter && !canAdd)}
                      className={`w-full flex items-center justify-between px-5 py-3.5 gap-3 transition-colors text-left ${
                        isStarter
                          ? 'bg-green-500/8 hover:bg-green-500/12'
                          : locked || !canAdd
                          ? 'opacity-50 cursor-default'
                          : 'hover:bg-gray-800/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          isStarter ? 'bg-green-500 border-green-500' : 'border-gray-600'
                        }`}>
                          {isStarter && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white text-sm font-medium truncate">{p.name}</div>
                          <div className="text-gray-500 text-xs">{p.country}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isStarter && <Chip color="green">Starter</Chip>}
                        <span className="text-green-400 font-bold text-sm">${p.salary}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-gray-600 text-xs text-center">
            Lineups lock Thursday 12pm ET each tournament week.
          </p>
        </>
      )}
    </div>
  );
}

// ── Tab: Free Agency ───────────────────────────────────────────────────────────

const getTier = (salary) => {
  if (salary >= 800) return { label: 'Elite', color: '#f59e0b' };
  if (salary >= 700) return { label: 'Prem',  color: '#8b5cf6' };
  if (salary >= 550) return { label: 'Mid',   color: '#3b82f6' };
  if (salary >= 400) return { label: 'Val',   color: '#22c55e' };
  return                     { label: 'Slpr',  color: '#6b7280' };
};

function TierBadge({ salary }) {
  const { label, color } = getTier(salary || 0);
  return (
    <span style={{ color, borderColor: color + '55', backgroundColor: color + '18' }}
      className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border shrink-0">
      {label}
    </span>
  );
}

function FreeAgencyTab({ leagueId, league }) {
  console.log('[FreeAgency] render', { leagueId, league: !!league });
  const [waivers, setWaivers] = useState(null);  // { available, myBids, faabBudget, faabRemaining, useFaab }
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [bidTarget, setBidTarget] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [dropPlayerId, setDropPlayerId] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState('');
  const [bidSuccess, setBidSuccess] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [logs, setLogs] = useState({});  // { [playerId]: { loading, data, error } }

  async function load() {
    setLoadError('');
    try {
      const [wRes, rRes] = await Promise.all([
        api.get(`/golf/leagues/${leagueId}/waivers`),
        api.get(`/golf/leagues/${leagueId}/roster`),
      ]);
      setWaivers(wRes.data);
      setRoster(rRes.data.roster || []);
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Failed to load waiver data');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [leagueId]);

  const available = (waivers?.available || []).filter(p =>
    !p.on_roster &&
    (!search || (p.name || '').toLowerCase().includes(search.toLowerCase()))
  );

  const rosterFull = roster.length >= (league.roster_size || 8);
  const droppable = roster.filter(p => !p.is_core);

  function openBid(p) {
    setBidTarget(p);
    setBidAmount('');
    setDropPlayerId('');
    setBidError('');
    setBidSuccess('');
  }

  async function toggleRow(playerId) {
    if (expandedId === playerId) { setExpandedId(null); return; }
    setExpandedId(playerId);
    if (logs[playerId]) return; // already cached
    setLogs(prev => ({ ...prev, [playerId]: { loading: true } }));
    try {
      const r = await api.get(`/golf/players/${playerId}/gamelog`);
      setLogs(prev => ({ ...prev, [playerId]: { loading: false, data: r.data } }));
    } catch {
      setLogs(prev => ({ ...prev, [playerId]: { loading: false, error: 'Failed to load' } }));
    }
  }

  async function placeBid(e) {
    e.preventDefault();
    setBidding(true);
    setBidError('');
    try {
      const body = {
        player_id: bidTarget.id,
        bid_amount: parseInt(bidAmount) || 0,
      };
      if (dropPlayerId) body.drop_player_id = dropPlayerId;
      await api.post(`/golf/leagues/${leagueId}/waivers/bid`, body);
      setBidSuccess(`Bid of $${bidAmount || 0} placed on ${bidTarget.name}`);
      setBidTarget(null);
      await load();
    } catch (err) {
      setBidError(err.response?.data?.error || 'Failed to place bid');
    }
    setBidding(false);
  }

  if (loading) return <div className="py-10 text-center text-gray-500">Loading...</div>;

  if (loadError) {
    return (
      <div className="py-10 text-center">
        <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-2xl p-6 text-sm max-w-sm mx-auto">
          {loadError}
        </div>
      </div>
    );
  }

  const pendingBids = (waivers?.myBids || []).filter(b => b.status === 'pending');

  return (
    <div className="space-y-4">
      {/* Budget card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
          <Trophy className="w-4 h-4 text-green-400" />
          <h3 className="text-white font-bold">My FAAB Budget</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Remaining</div>
            <div className="text-green-400 font-black text-xl tabular-nums">${waivers?.faabRemaining ?? '—'}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Budget</div>
            <div className="text-white font-black text-xl tabular-nums">${waivers?.faabBudget ?? '—'}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Pending</div>
            <div className="text-yellow-400 font-black text-xl tabular-nums">{pendingBids.length}</div>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {bidSuccess && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-xl p-3 text-sm flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" /> {bidSuccess}
        </div>
      )}

      {/* Bid modal */}
      {bidTarget && (
        <div className="bg-gray-900 border border-green-500/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold">Place FAAB Bid</h3>
            <button onClick={() => setBidTarget(null)} className="text-gray-500 hover:text-gray-300 text-sm">Cancel</button>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold">{bidTarget.name}</div>
              <div className="text-gray-500 text-xs">{bidTarget.country} · Rank #{bidTarget.world_ranking}</div>
            </div>
            <TierBadge salary={bidTarget.salary} />
            <div className="text-green-400 font-bold text-sm shrink-0">${bidTarget.salary}</div>
          </div>
          {bidError && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-3">{bidError}</div>
          )}
          <form onSubmit={placeBid} className="space-y-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
              <input
                type="number"
                min="0"
                max={waivers?.faabRemaining ?? 9999}
                className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 focus:outline-none text-white text-sm rounded-xl pl-7 pr-4 py-2.5"
                placeholder="Bid amount"
                value={bidAmount}
                onChange={e => setBidAmount(e.target.value)}
                autoFocus
              />
            </div>
            {rosterFull && (
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1.5">Drop player (roster full)</label>
                <select
                  value={dropPlayerId}
                  onChange={e => setDropPlayerId(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 focus:outline-none text-white text-sm rounded-xl px-3 py-2.5"
                >
                  <option value="">Select player to drop...</option>
                  {droppable.map(p => (
                    <option key={p.player_id} value={p.player_id}>{p.name} (${p.salary})</option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="submit"
              disabled={bidding || (rosterFull && !dropPlayerId)}
              className="w-full py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all"
            >
              {bidding ? 'Placing bid...' : 'Place Blind Bid'}
            </button>
          </form>
          <p className="text-gray-600 text-xs mt-2">Bids are blind — processed at waiver deadline.</p>
        </div>
      )}

      {/* Available players */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-gray-400" />
              <h3 className="text-white font-bold">Free Agents</h3>
            </div>
            <span className="text-gray-600 text-xs">{available.length} available</span>
          </div>
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
          />
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {available.slice(0, 60).map(p => {
            const isOpen = expandedId === p.id;
            const log = logs[p.id];
            return (
              <div key={p.id} className="border-b border-gray-800 last:border-0">
                {/* ── Main row ── */}
                <div
                  onClick={() => toggleRow(p.id)}
                  className="flex items-center gap-2 px-4 min-h-[48px] py-2.5 cursor-pointer active:bg-gray-800/50 transition-colors select-none"
                >
                  {/* Chevron */}
                  <svg
                    style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    className="w-3 h-3 text-gray-500 shrink-0"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-600 text-[11px] font-bold tabular-nums w-6 text-center shrink-0">#{p.world_ranking}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-semibold truncate">{p.name}</div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-gray-500">{p.country}</span>
                      {Number(p.season_points) > 0 && (
                        <span className="text-green-400 font-bold tabular-nums">· +{Number(p.season_points).toFixed(1)} pts</span>
                      )}
                    </div>
                  </div>
                  <TierBadge salary={p.salary} />
                  <span className="text-green-400 font-bold text-sm shrink-0 tabular-nums">${p.salary}</span>
                  <button
                    onClick={e => { e.stopPropagation(); openBid(p); }}
                    className="text-xs px-2.5 py-1.5 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg active:bg-green-500/25 transition-colors font-semibold shrink-0"
                  >
                    Bid
                  </button>
                </div>

                {/* ── Game log (expanded) ── */}
                {isOpen && (
                  <div className="bg-gray-950/70 border-t border-gray-800/60 px-4 py-3">
                    {log?.loading && (
                      <div className="py-3 text-center text-gray-500 text-xs">Loading...</div>
                    )}
                    {log?.error && (
                      <div className="py-2 text-center text-red-400 text-xs">{log.error}</div>
                    )}
                    {log?.data && (
                      log.data.gamelog.length === 0 ? (
                        <div className="py-3 text-center text-gray-500 text-xs">No results this season</div>
                      ) : (
                        <>
                          {/* Table — horizontally scrollable */}
                          <div className="overflow-x-auto -mx-4 px-4">
                            <table className="w-full text-xs min-w-[400px]">
                              <thead>
                                <tr className="text-gray-600 text-[10px] uppercase tracking-wide">
                                  <th className="text-left pb-2 font-semibold pr-2">Tournament</th>
                                  <th className="text-center pb-2 font-semibold w-9">R1</th>
                                  <th className="text-center pb-2 font-semibold w-9">R2</th>
                                  <th className="text-center pb-2 font-semibold w-9">R3</th>
                                  <th className="text-center pb-2 font-semibold w-9">R4</th>
                                  <th className="text-center pb-2 font-semibold w-8">Cut</th>
                                  <th className="text-center pb-2 font-semibold w-10">Fin</th>
                                  <th className="text-right pb-2 font-semibold w-12">Pts</th>
                                </tr>
                              </thead>
                              <tbody>
                                {log.data.gamelog.map((g, i) => (
                                  <tr key={i} className="border-t border-gray-800/50">
                                    <td className="py-1.5 pr-2 text-gray-300 max-w-[120px]">
                                      <span className="truncate block">{g.tournament_name}{g.is_major ? ' ★' : ''}</span>
                                    </td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.r1 ?? '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.r2 ?? '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.made_cut ? (g.r3 ?? '—') : '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.made_cut ? (g.r4 ?? '—') : '—'}</td>
                                    <td className="py-1.5 text-center font-bold">
                                      {g.made_cut
                                        ? <span style={{ color: '#22c55e' }}>Y</span>
                                        : <span style={{ color: '#ef4444' }}>N</span>}
                                    </td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.finish_position ?? '—'}</td>
                                    <td className="py-1.5 text-right tabular-nums font-bold"
                                      style={{ color: g.fantasy_points >= 0 ? '#22c55e' : '#ef4444' }}>
                                      {g.fantasy_points > 0 ? '+' : ''}{g.fantasy_points}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Summary */}
                          <div className="mt-3 pt-2.5 border-t border-gray-800/60 grid grid-cols-4 gap-2">
                            {[
                              { label: 'Avg Pts', value: `${log.data.season_avg > 0 ? '+' : ''}${log.data.season_avg}`, color: log.data.season_avg >= 0 ? '#22c55e' : '#ef4444' },
                              { label: 'Events',  value: String(log.data.events_played), color: '#9ca3af' },
                              { label: 'Cuts',    value: `${log.data.cuts_made}/${log.data.events_played}`, color: '#9ca3af' },
                              { label: 'Best',    value: log.data.best_finish ?? '—', color: '#f59e0b' },
                            ].map(s => (
                              <div key={s.label} className="text-center">
                                <div className="text-gray-600 text-[10px] uppercase tracking-wide mb-0.5">{s.label}</div>
                                <div className="font-black text-sm tabular-nums" style={{ color: s.color }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {available.length === 0 && !search && (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
                <Flag className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-gray-500 text-sm">All players are rostered.</p>
            </div>
          )}
          {available.length === 0 && search && (
            <div className="py-8 text-center text-gray-500 text-sm">No players match "{search}".</div>
          )}
        </div>
      </div>

      {/* Pending bids */}
      {pendingBids.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-yellow-400" />
            <h3 className="text-white font-bold">My Pending Bids</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {pendingBids.map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">{b.player_name}</div>
                  {b.drop_player_name && (
                    <div className="text-gray-500 text-xs">Drop: {b.drop_player_name}</div>
                  )}
                </div>
                <Chip color="yellow">${b.bid_amount}</Chip>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Standings ─────────────────────────────────────────────────────────────

const TIER_NAMES = { 1: 'Tier 1 · Elite', 2: 'Tier 2 · Premium', 3: 'Tier 3 · Mid-Field', 4: 'Tier 4 · Longshots' };
const RANK_COLORS = ['#fbbf24', '#d1d5db', '#f97316']; // gold / silver / bronze

// Shared sub-components -------------------------------------------------------

function RankBadge({ rank, isTied }) {
  if (rank <= 3) return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${RANK_COLORS[rank-1]}22`, border: `1.5px solid ${RANK_COLORS[rank-1]}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Trophy style={{ width: 14, height: 14, color: RANK_COLORS[rank-1] }} />
    </div>
  );
  return (
    <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ color: '#6b7280', fontSize: 13, fontWeight: 700 }}>{isTied ? `T${rank}` : rank}</span>
    </div>
  );
}

function AvatarCircle({ name, isMe }) {
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? 'rgba(0,232,122,0.15)' : 'rgba(255,255,255,0.06)', border: `1.5px solid ${isMe ? 'rgba(0,232,122,0.35)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: isMe ? '#00e87a' : '#9ca3af', letterSpacing: '0.03em' }}>{initials}</span>
    </div>
  );
}

function PrizeCard({ buyIn, memberCount, p1, p2, p3 }) {
  const total  = buyIn * memberCount;
  const amt1   = Math.round(total * p1 / 100);
  const amt2   = Math.round(total * p2 / 100);
  const amt3   = Math.round(total * p3 / 100);
  const fmtAmt = n => n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
  const places = [
    { icon: '🥇', label: '1st', pct: p1, amt: amt1 },
    { icon: '🥈', label: '2nd', pct: p2, amt: amt2 },
    { icon: '🥉', label: '3rd', pct: p3, amt: amt3 },
  ];
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
          <div style={{ color: '#6b7280', fontSize: 11 }}>${buyIn} × {memberCount} teams</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
        {places.map(({ icon, label, pct, amt }, i) => (
          <div key={label} style={{ padding: '12px 14px', borderRight: i < 2 ? '1px solid rgba(245,158,11,0.1)' : 'none', textAlign: 'center' }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>{fmtAmt(amt)}</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{label} · {pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compute rank (1-based) respecting ties
function computeRanks(standings) {
  const sorted = standings.map((s, i) => ({ pts: s.season_points || 0, i }));
  return sorted.map(({ pts, i }) => {
    const rank = sorted.filter(x => x.pts > pts).length + 1;
    const tied = sorted.filter(x => x.pts === pts).length > 1;
    return { rank, tied };
  });
}

// Prize for a given rank
function prizeForRank(rank, buyIn, memberCount, p1, p2, p3) {
  if (!buyIn || !memberCount) return null;
  const total = buyIn * memberCount;
  if (rank === 1) return Math.round(total * p1 / 100);
  if (rank === 2) return Math.round(total * p2 / 100);
  if (rank === 3) return Math.round(total * p3 / 100);
  return null;
}

function StandingsTab({ leagueId, league, currentUserId }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get(`/golf/leagues/${leagueId}/standings`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  if (loading) return <div className="py-10 text-center text-gray-500 text-sm">Loading standings…</div>;

  const standings  = data?.standings || [];
  const isPool     = data?.format === 'pool';
  const tournament = data?.tournament;
  const isLive     = tournament?.status === 'active';
  const hasScores  = data?.has_scores;

  // Payout config from league
  const buyIn    = league?.buy_in_amount || 0;
  const p1       = league?.payout_first  ?? 70;
  const p2       = league?.payout_second ?? 20;
  const p3       = league?.payout_third  ?? 10;
  const hasPrize = buyIn > 0 && standings.length > 0;

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

  const ranks = computeRanks(standings);

  // Shared leaderboard row renderer — used by both pool and tourneyrun
  function LeaderboardRow({ s, i, rankInfo, expandContent, canExpand }) {
    const isMe   = s.user_id === currentUserId;
    const isOpen = expanded === s.user_id;
    const pts    = s.season_points || 0;
    const myPrize = hasPrize ? prizeForRank(rankInfo.rank, buyIn, standings.length, p1, p2, p3) : null;
    const ptColor = pts > 0 ? '#00e87a' : pts < 0 ? '#ef4444' : '#9ca3af';
    const isBot  = /^bot[\s_]?\d/i.test(s.username || '');

    return (
      <div style={{ borderLeft: `3px solid ${isMe ? '#00e87a' : 'transparent'}`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => canExpand ? setExpanded(isOpen ? null : s.user_id) : null}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px 11px 11px', background: isMe ? 'rgba(0,232,122,0.04)' : 'transparent', border: 'none', cursor: canExpand ? 'pointer' : 'default', textAlign: 'left' }}
          onMouseEnter={e => { if (canExpand) e.currentTarget.style.background = isMe ? 'rgba(0,232,122,0.07)' : 'rgba(255,255,255,0.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = isMe ? 'rgba(0,232,122,0.04)' : 'transparent'; }}
        >
          {/* Rank badge */}
          <RankBadge rank={rankInfo.rank} isTied={rankInfo.tied} />

          {/* Avatar */}
          <AvatarCircle name={s.team_name} isMe={isMe} />

          {/* Name + username */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
              <span style={{ color: isMe ? '#00e87a' : '#fff', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.team_name}
              </span>
              {isBot && (
                <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', background: '#1f2937', border: '1px solid #374151', padding: '1px 5px', borderRadius: 4, letterSpacing: '0.05em', flexShrink: 0 }}>BOT</span>
              )}
            </div>
            <div style={{ color: '#4b5563', fontSize: 11, marginTop: 1 }}>{s.username}</div>
          </div>

          {/* Prize */}
          {hasPrize && (
            <div style={{ textAlign: 'right', minWidth: 44, flexShrink: 0 }}>
              {myPrize ? (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>${myPrize.toLocaleString()}</span>
              ) : (
                <span style={{ fontSize: 11, color: '#374151' }}>—</span>
              )}
            </div>
          )}

          {/* Pts */}
          <div style={{ textAlign: 'right', minWidth: 50, flexShrink: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: hasScores ? ptColor : '#6b7280', fontVariantNumeric: 'tabular-nums' }}>
              {hasScores ? (pts > 0 ? '+' : '') + pts.toFixed(1) : '—'}
            </div>
            <div style={{ color: '#4b5563', fontSize: 10 }}>pts</div>
          </div>

          {/* Chevron */}
          {canExpand && (
            <svg style={{ width: 12, height: 12, color: '#4b5563', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>

        {/* Expanded content */}
        {isOpen && expandContent && (
          <div style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {expandContent}
          </div>
        )}
      </div>
    );
  }

  // ── Pool leaderboard ────────────────────────────────────────────────────────
  if (isPool) {
    // Derive which round(s) have data
    const allPicks = standings.flatMap(s => s.picks || []);
    let currentRound = 0;
    if (allPicks.some(p => p.round4 != null)) currentRound = 4;
    else if (allPicks.some(p => p.round3 != null)) currentRound = 3;
    else if (allPicks.some(p => p.round2 != null)) currentRound = 2;
    else if (allPicks.some(p => p.round1 != null)) currentRound = 1;

    const fmtScore = r => {
      if (r == null) return <span style={{ color: '#374151' }}>—</span>;
      const toPar = r - 72;
      const color = toPar < 0 ? '#00e87a' : toPar > 0 ? '#ef4444' : '#9ca3af';
      const label = toPar === 0 ? 'E' : (toPar > 0 ? `+${toPar}` : String(toPar));
      return <span style={{ color }}>{label}</span>;
    };

    function PoolExpandContent({ picks }) {
      if (!picks || picks.length === 0) return null;
      // Group by tier
      const byTier = {};
      picks.forEach(p => {
        const t = p.tier_number || 0;
        if (!byTier[t]) byTier[t] = [];
        byTier[t].push(p);
      });
      return (
        <div style={{ padding: '12px 14px 14px' }}>
          {Object.entries(byTier).sort(([a], [b]) => a - b).map(([tier, tPicks]) => (
            <div key={tier} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                {TIER_NAMES[tier] || `Tier ${tier}`}
              </div>
              {[...tPicks].sort((a, b) => (b.fantasy_points || 0) - (a.fantasy_points || 0)).map((p, pi) => {
                const isWD = p.round1 == null && p.made_cut === 0 && p.finish_position == null;
                const fp   = p.fantasy_points || 0;
                const fpColor = fp > 0 ? '#00e87a' : fp < 0 ? '#ef4444' : '#6b7280';
                return (
                  <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: pi > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                    <span style={{ flex: 1, color: '#d1d5db', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.player_name}
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
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-4">

        {/* ── Tournament status card ── */}
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
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {isLive ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,232,122,0.12)', border: '1px solid rgba(0,232,122,0.3)', color: '#00e87a', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live
                  </span>
                ) : tournament.status === 'completed' ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#1f2937', border: '1px solid #374151', padding: '3px 10px', borderRadius: 20 }}>Final</span>
                ) : (
                  <span style={{ color: '#4b5563', fontSize: 11 }}>Starts {tournament.start_date?.slice(0, 10)}</span>
                )}
                {isLive && <span style={{ color: '#374151', fontSize: 10 }}>Scores auto-update · refresh for latest</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── Prize pool card ── */}
        {hasPrize && <PrizeCard buyIn={buyIn} memberCount={standings.length} p1={p1} p2={p2} p3={p3} />}

        {/* ── Leaderboard ── */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, overflow: 'hidden' }}>
          {/* Column headers */}
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
              canExpand={!!s.submitted && (s.picks?.length > 0)}
              expandContent={s.picks?.length > 0 ? <PoolExpandContent picks={s.picks} /> : null}
            />
          ))}
        </div>

        {!hasPrize && (
          <p style={{ color: '#374151', fontSize: 11, textAlign: 'center' }}>No buy-in · bragging rights only</p>
        )}
        <p style={{ color: '#374151', fontSize: 11, textAlign: 'center' }}>
          {isLive ? 'Scores sync automatically from ESPN' : hasScores ? 'Tournament complete' : 'Scores sync from ESPN once tournament begins'}
        </p>
      </div>
    );
  }

  // ── TourneyRun / DK standings ───────────────────────────────────────────────
  function TourneyExpandContent({ s }) {
    const weekPts = s.points_this_week != null ? Number(s.points_this_week) : null;
    const tournsPlayed = s.tournaments_played || 0;
    return (
      <div style={{ padding: '12px 14px', display: 'flex', gap: 24 }}>
        {weekPts !== null && (
          <div>
            <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>This Week</div>
            <div style={{ color: weekPts > 0 ? '#00e87a' : weekPts < 0 ? '#ef4444' : '#9ca3af', fontSize: 15, fontWeight: 800 }}>
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
      {hasPrize && <PrizeCard buyIn={buyIn} memberCount={standings.length} p1={p1} p2={p2} p3={p3} />}

      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, overflow: 'hidden' }}>
        {/* Column headers */}
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
          />
        ))}
      </div>

      {!hasPrize && (
        <p style={{ color: '#374151', fontSize: 11, textAlign: 'center' }}>No buy-in · bragging rights only</p>
      )}
    </div>
  );
}

// ── Tab: Schedule ──────────────────────────────────────────────────────────────

function ScheduleTab({ leagueId, isComm }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/golf/tournaments')
      .then(r => setTournaments(r.data.tournaments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-10 text-center text-gray-500">Loading schedule...</div>;

  const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  function StatusPill({ status }) {
    if (status === 'active') return (
      <span className="inline-flex items-center gap-1 bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" /> Live
      </span>
    );
    if (status === 'completed') return (
      <span className="inline-block bg-gray-700/60 border border-gray-700 text-gray-500 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">Done</span>
    );
    return (
      <span className="inline-block bg-gray-800 border border-gray-700 text-gray-300 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">Upcoming</span>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <h3 className="text-white font-bold">2026 Schedule</h3>
        <span className="ml-auto text-gray-600 text-xs">{tournaments.length} events</span>
      </div>
      <div className="divide-y divide-gray-800">
        {tournaments.map(t => {
          const isMajor = !!t.is_major;
          const isSig   = t.is_signature === 1 && !isMajor;
          const isDone  = t.status === 'completed';
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 px-4 py-4 ${
                isMajor ? 'border-l-2 border-yellow-500 bg-yellow-500/3' : ''
              } ${isDone ? 'opacity-55' : ''}`}
            >
              {/* Date column */}
              <div className="w-14 shrink-0 text-center">
                <div className="text-white text-xs font-bold">{fmt(t.start_date)}</div>
                <div className="text-gray-600 text-[10px]">{fmt(t.end_date)}</div>
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span className={`font-bold text-sm truncate ${isMajor ? 'text-yellow-300' : 'text-white'}`}>
                    {t.name}
                  </span>
                  {isMajor && (
                    <span className="inline-block bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0">MAJOR</span>
                  )}
                  {isSig && (
                    <span className="inline-block bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0">SIG</span>
                  )}
                </div>
                <div className="text-gray-500 text-xs truncate">{t.course}</div>
                {t.prize_money > 0 && (
                  <div className="text-gray-600 text-[10px] mt-0.5">${(t.prize_money / 1000000).toFixed(0)}M purse</div>
                )}
              </div>

              {/* Right side: status + commissioner link */}
              <div className="shrink-0 pt-0.5 flex flex-col items-end gap-1.5">
                <StatusPill status={t.status} />
                {isComm && (isDone || t.status === 'active') && (
                  <Link
                    to={`/golf/league/${leagueId}/scores?tournament=${t.id}`}
                    className="text-[10px] font-bold text-green-400 hover:text-green-300 transition-colors whitespace-nowrap"
                  >
                    Enter Scores →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
        {tournaments.length === 0 && (
          <div className="py-8 text-center text-gray-500 text-sm">No tournaments found.</div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Commissioner Hub ──────────────────────────────────────────────────────

function CommissionerTab({ leagueId, leagueName, members }) {
  const [promoData, setPromoData]   = useState(null);
  const [isPaid, setIsPaid]         = useState(false);
  const [showGate, setShowGate]     = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  const [copied, setCopied]         = useState('');

  useEffect(() => {
    // Check payment status + run migration promo check simultaneously
    Promise.all([
      api.get('/golf/payments/status'),
      api.post(`/golf/leagues/${leagueId}/check-migration-promo`).catch(() => null),
    ]).then(([statusRes, promoRes]) => {
      const commProLeagues = statusRes.data.commProLeagues || [];
      const paid = commProLeagues.includes(leagueId);
      if (promoRes?.data?.unlocked) {
        setIsPaid(true);
      } else {
        setIsPaid(paid);
      }
      setPromoData(promoRes?.data || null);
      setGateChecked(true);
      if (!paid && !(promoRes?.data?.unlocked)) {
        setShowGate(true);
      }
    }).catch(() => setGateChecked(true));
  }, [leagueId]);

  if (!gateChecked) {
    return <div style={{ color: '#4b5563', padding: 32, textAlign: 'center', fontSize: 14 }}>Loading…</div>;
  }

  const memberCount    = promoData?.memberCount || members.length;
  const membersNeeded  = promoData?.membersNeeded ?? Math.max(0, 6 - memberCount);
  const alreadyUsedPromo = promoData?.alreadyUsedPromo || false;

  // Promo progress bar (shown even when not yet unlocked)
  const showPromoBar = !isPaid && !alreadyUsedPromo && membersNeeded > 0;
  const pct = Math.min(100, Math.round((memberCount / 6) * 100));

  return (
    <div className="space-y-4">
      {/* Gate modal */}
      {showGate && (
        <GolfPaymentModal
          type="comm_pro"
          meta={{ leagueId, memberCount, membersNeeded, alreadyUsedPromo }}
          onClose={() => setShowGate(false)}
          onAlreadyPaid={() => { setIsPaid(true); setShowGate(false); }}
        />
      )}

      {/* "Bring Your League" promo banner */}
      {showPromoBar && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-400 text-sm font-bold">🎁 Invite {membersNeeded} more to unlock Commissioner Pro free</span>
            <span className="text-blue-400 text-sm font-bold">{memberCount}/6</span>
          </div>
          <div className="bg-gray-900 rounded-full h-2 overflow-hidden">
            <div style={{ width: `${pct}%`, transition: 'width 0.4s' }} className="h-full bg-blue-500 rounded-full" />
          </div>
        </div>
      )}

      {!isPaid ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="text-white font-bold text-lg mb-2">Commissioner Pro required</h3>
          <p className="text-gray-400 text-sm mb-4 max-w-sm mx-auto">
            Unlock auto-emails, payment tracking, FAAB results, CSV export, and more for $19.99/season.
          </p>
          <button
            onClick={() => setShowGate(true)}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
          >
            Unlock Commissioner Pro — $19.99
          </button>
          {!alreadyUsedPromo && (
            <p className="text-gray-600 text-xs mt-3">Or invite {membersNeeded} more members to unlock free ↑</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Commissioner Pro header */}
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold">Commissioner Hub</h3>
            <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 text-xs font-bold px-2 py-1 rounded-full">PRO</span>
          </div>

          {/* Member roster */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h4 className="text-white text-sm font-bold">Member Roster ({members.length})</h4>
            </div>
            <div>
              {members.map((m, i) => (
                <div key={m.user_id} style={{ borderBottom: i < members.length - 1 ? '1px solid #111827' : 'none' }}
                  className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-white text-sm font-semibold">{m.team_name}</div>
                    <div className="text-gray-500 text-xs">{m.username}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 text-sm font-bold tabular-nums">{Number(m.season_points || 0).toFixed(1)} pts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mass blast */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">📣 Mass Blast</h4>
            <MassBlast leagueId={leagueId} />
          </div>

          {/* CSV export */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">📊 Export</h4>
            <button
              onClick={() => {
                const rows = [['Team', 'Username', 'Points']];
                members.forEach(m => rows.push([m.team_name, m.username, m.season_points || 0]));
                const csv = rows.map(r => r.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${leagueName.replace(/\s+/g,'-')}-standings.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="text-sm text-green-400 hover:text-green-300 underline underline-offset-2"
            >
              Download standings CSV
            </button>
          </div>

          {/* Referral link */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">🔗 Referral Link</h4>
            <ReferralSection />
          </div>
        </div>
      )}
    </div>
  );
}

function MassBlast({ leagueId }) {
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!msg.trim()) return;
    setLoading(true);
    try {
      await api.post(`/golf/leagues/${leagueId}/blast`, { message: msg });
      setSent(true);
      setMsg('');
      setTimeout(() => setSent(false), 4000);
    } catch {
      // silently fail — feature may not be wired on backend yet
    }
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Send a message to all league members…"
        rows={3}
        className="input w-full resize-none text-sm"
      />
      {sent && <p className="text-green-400 text-xs">Message sent to all members!</p>}
      <button
        onClick={send}
        disabled={loading || !msg.trim()}
        className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Sending…' : 'Send to all members'}
      </button>
    </div>
  );
}

function ReferralSection() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/golf/referral/my-code').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="text-gray-600 text-xs">Loading…</div>;

  function copy() {
    navigator.clipboard.writeText(data.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
        <span className="text-gray-400 text-xs truncate flex-1">{data.link}</span>
        <button onClick={copy} className="text-green-400 text-xs font-bold shrink-0">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-gray-500 text-xs">
        {data.creditsAvailable > 0
          ? `You have $${data.creditsAvailable.toFixed(2)} referral credit available.`
          : `Earn $1 credit for each friend who joins and pays.`}
      </p>
    </div>
  );
}

// ── Tab: PGA Live ───────────────────────────────────────────────────────────────

function PGALiveTab({ leagueId, league }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all');   // all | pool | leaders
  const [sortBy, setSortBy]       = useState('position'); // position | name | today
  const [expandedRow, setExpandedRow] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [secsSince, setSecsSince] = useState(null);

  async function load() {
    try {
      const r = await api.get(`/golf/leagues/${leagueId}/pga-live`);
      setData(r.data);
      setLastFetch(Date.now());
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [leagueId]); // eslint-disable-line

  // Tick "updated X ago"
  useEffect(() => {
    if (!lastFetch) return;
    const iv = setInterval(() => setSecsSince(Math.floor((Date.now() - lastFetch) / 1000)), 5000);
    setSecsSince(0);
    return () => clearInterval(iv);
  }, [lastFetch]);

  if (loading) return <div className="py-10 text-center text-gray-500 text-sm">Loading leaderboard…</div>;

  const competitors  = data?.competitors || [];
  const tournament   = data?.tournament;
  const myPickNames  = data?.my_pick_names || [];
  const isLive       = tournament?.status === 'active';

  if (data?.no_event || data?.fetch_error || competitors.length === 0) {
    return (
      <div className="py-12 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto">
          <Flag className="w-7 h-7 text-gray-600" />
        </div>
        <p className="text-gray-500 text-sm">
          {data?.no_event ? 'No tournament ESPN ID configured for this league.' : 'PGA leaderboard unavailable right now.'}
        </p>
        <button onClick={load} style={{ color: '#00e87a', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  // Normalize for pick matching
  const norm = s => (s || '').toLowerCase().replace(/[.']/g, '').trim();
  const myPickSet = new Set(myPickNames.map(norm));
  const isMyPick  = name => myPickSet.has(norm(name));

  // Derive current round from data
  const maxRound = competitors.reduce((mx, c) => Math.max(mx, c.currentRound || 0), 0);

  // Filter
  let display = [...competitors];
  if (filter === 'pool') {
    const myPicks = display.filter(c => isMyPick(c.name));
    const rest    = display.filter(c => !isMyPick(c.name));
    display = [...myPicks, ...rest.filter(() => false)]; // show only picks
    if (display.length === 0) display = competitors.filter(c => isMyPick(c.name));
  }
  if (filter === 'leaders') display = competitors.filter(c => !c.isCut && !c.isWD).slice(0, 25);

  // Sort (position is default, already sorted by sortOrder from server)
  if (sortBy === 'name')  display = [...display].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy === 'today') display = [...display].sort((a, b) => (a.today ?? 999) - (b.today ?? 999));

  // Format to-par
  const fmtPar = val => {
    if (val == null) return { text: '—', color: '#374151' };
    if (val === 0)   return { text: 'E',  color: '#9ca3af' };
    return val < 0   ? { text: String(val), color: '#00e87a' }
                     : { text: `+${val}`,  color: '#ef4444' };
  };

  const ageTxt = secsSince == null ? '' : secsSince < 60 ? `${secsSince}s ago` : `${Math.floor(secsSince / 60)}m ago`;

  return (
    <div className="space-y-3">

      {/* ── Tournament header ── */}
      <div style={{ background: '#111827', border: `1px solid ${isLive ? 'rgba(0,232,122,0.2)' : '#1f2937'}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{tournament?.name || 'PGA Tour Event'}</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>
              {[tournament?.course, tournament?.start_date?.slice(0, 10)].filter(Boolean).join(' · ')}
            </div>
            {maxRound > 0 && (
              <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>
                Round {maxRound} of 4{isLive ? ' · In Progress' : tournament?.status === 'completed' ? ' · Final' : ''}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            {isLive ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,232,122,0.12)', border: '1px solid rgba(0,232,122,0.3)', color: '#00e87a', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
            ) : null}
            {ageTxt && <span style={{ color: '#374151', fontSize: 10 }}>Updated {ageTxt}</span>}
          </div>
        </div>
      </div>

      {/* ── Filter + Sort bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[
            { key: 'all',     label: `All (${competitors.length})` },
            { key: 'pool',    label: `My Picks (${myPickNames.length})` },
            { key: 'leaders', label: 'Top 25' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)} style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s', background: filter === key ? '#00e87a' : 'transparent', color: filter === key ? '#001a0d' : '#6b7280', border: filter === key ? 'none' : '1px solid #1f2937' }}>
              {label}
            </button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ background: '#111827', border: '1px solid #1f2937', color: '#9ca3af', fontSize: 12, padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }}>
          <option value="position">Sort: Position</option>
          <option value="today">Sort: Today</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* ── Leaderboard ── */}
      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, overflow: 'hidden' }}>

        {/* Desktop column headers */}
        <div className="hidden sm:grid" style={{ gridTemplateColumns: '44px 1fr 32px 32px 32px 32px 48px 44px', gap: 0, padding: '8px 14px', borderBottom: '1px solid #1f2937' }}>
          {['Pos', 'Player', 'R1', 'R2', 'R3', 'R4', 'Total', 'Today'].map((h, i) => (
            <div key={h} style={{ textAlign: i >= 2 ? 'center' : 'left', color: '#374151', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {/* Mobile column headers */}
        <div className="grid sm:hidden" style={{ gridTemplateColumns: '44px 1fr 48px 44px', gap: 0, padding: '8px 14px', borderBottom: '1px solid #1f2937' }}>
          {['Pos', 'Player', 'Total', 'Today'].map((h, i) => (
            <div key={h} style={{ textAlign: i >= 2 ? 'center' : 'left', color: '#374151', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {display.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
            {filter === 'pool' ? 'No picks submitted yet.' : 'No players found.'}
          </div>
        ) : display.map((c, i) => {
          const myPick   = isMyPick(c.name);
          const total    = fmtPar(c.total);
          const todayFmt = fmtPar(c.today);
          const rounds   = [c.r1, c.r2, c.r3, c.r4];
          const isOpen   = expandedRow === i;
          const statusBadge = c.isCut ? <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', padding: '1px 5px', borderRadius: 3 }}>CUT</span>
            : c.isWD  ? <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)', padding: '1px 5px', borderRadius: 3 }}>WD</span>
            : c.isMDF ? <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', padding: '1px 5px', borderRadius: 3 }}>MDF</span>
            : null;

          const playerCell = (
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
              {c.flagHref && (
                <img src={c.flagHref} alt={c.countryAlt} style={{ width: 16, height: 11, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
              )}
              <span style={{ color: myPick ? '#00e87a' : '#fff', fontWeight: myPick ? 700 : 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              {myPick && <span style={{ fontSize: 8, fontWeight: 700, color: '#00e87a', background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.25)', padding: '1px 4px', borderRadius: 3, letterSpacing: '0.05em', flexShrink: 0 }}>PICK</span>}
              {statusBadge && <span style={{ marginLeft: 2, flexShrink: 0 }}>{statusBadge}</span>}
            </div>
          );

          const posCell = (
            <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 700 }}>
              {c.posText || '—'}
            </div>
          );

          const todayCell = (
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: (c.isCut || c.isWD) ? '#374151' : todayFmt.color, fontVariantNumeric: 'tabular-nums' }}>
              {(c.isCut || c.isWD) ? '—' : todayFmt.text}
              {c.thru != null && !c.isCut && !c.isWD && (
                <div style={{ color: '#4b5563', fontSize: 9 }}>{c.thru === 18 ? 'F' : `T${c.thru}`}</div>
              )}
            </div>
          );

          const totalCell = (
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: total.color, fontVariantNumeric: 'tabular-nums' }}>
              {total.text}
            </div>
          );

          return (
            <div key={i} style={{ borderLeft: `3px solid ${myPick ? '#00e87a' : 'transparent'}`, borderBottom: '1px solid rgba(255,255,255,0.04)', background: myPick ? 'rgba(0,232,122,0.025)' : 'transparent' }}>
              {/* Desktop row */}
              <div className="hidden sm:grid" style={{ gridTemplateColumns: '44px 1fr 32px 32px 32px 32px 48px 44px', gap: 0, padding: '9px 14px', alignItems: 'center' }}>
                {posCell}
                {playerCell}
                {rounds.map((r, ri) => {
                  const { text, color } = fmtPar(r);
                  const isCurrent = (ri + 1) === maxRound && isLive && r != null;
                  return (
                    <div key={ri} style={{ textAlign: 'center', fontSize: 11, color: r != null ? color : '#374151', fontWeight: isCurrent ? 700 : 400 }}>{text}</div>
                  );
                })}
                {totalCell}
                {todayCell}
              </div>

              {/* Mobile row — tap to expand */}
              <button
                className="grid sm:hidden"
                onClick={() => setExpandedRow(isOpen ? null : i)}
                style={{ width: '100%', gridTemplateColumns: '44px 1fr 48px 44px', gap: 0, padding: '10px 14px', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                {posCell}
                {playerCell}
                {totalCell}
                {todayCell}
              </button>

              {/* Mobile expanded row */}
              {isOpen && (
                <div className="sm:hidden" style={{ background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)', padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  {['R1', 'R2', 'R3', 'R4'].map((label, ri) => {
                    const { text, color } = fmtPar(rounds[ri]);
                    const isCurrent = (ri + 1) === maxRound && isLive && rounds[ri] != null;
                    return (
                      <div key={ri} style={{ textAlign: 'center' }}>
                        <div style={{ color: '#4b5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                        <div style={{ color: rounds[ri] != null ? color : '#374151', fontSize: 14, fontWeight: isCurrent ? 800 : 500 }}>{text}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ color: '#374151', fontSize: 11, textAlign: 'center' }}>
        Data from ESPN · Refreshes every 60s
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function getTabs(league, isComm) {
  const base = [
    { key: 'overview',  label: 'Overview'  },
    { key: 'schedule',  label: 'Schedule'  },
    { key: 'roster',    label: 'Roster'    },
  ];
  if (league?.format_type === 'tourneyrun') {
    base.push({ key: 'freeagency', label: 'Free Agency' });
  }
  base.push(
    { key: 'lineup',    label: 'Lineup'    },
    { key: 'standings', label: 'Standings' },
  );
  if (league?.format_type === 'pool' && league?.pool_tournament_id) {
    base.push({ key: 'pga-live', label: '⛳ PGA Live' });
  }
  if (isComm) {
    base.push({ key: 'commissioner', label: '⚙ Commissioner' });
  }
  return base;
}

export default function GolfLeague() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useDocTitle(league ? `${league.name} | Golf` : 'Golf League | TourneyRun');

  useEffect(() => {
    api.get(`/golf/leagues/${id}`)
      .then(r => {
        setLeague(r.data.league);
        setMembers(r.data.members || []);
      })
      .catch(err => {
        const status = err.response?.status;
        if (status === 404) {
          setLoadError('League not found.');
        } else if (status === 403) {
          setLoadError("You don't have access to this league.");
        } else {
          setLoadError('Failed to load league. Check your connection and try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <BallLoader />;

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <Flag className="w-8 h-8 text-gray-600" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">{loadError}</h2>
        <Link to="/golf/dashboard" className="inline-flex items-center gap-1.5 text-green-400 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  if (!league) return null;

  const isComm = league.commissioner_id === user?.id;

  function setTab(t) {
    setSearchParams({ tab: t });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 overflow-x-hidden">

      {/* ── Header ── */}
      <div className="mb-6">
        <Link to="/golf/dashboard" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-400 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Golf Leagues
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-white break-words">{league.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Chip color="green">Golf</Chip>
              {isComm && <Chip color="blue">Commissioner</Chip>}
              {league.format_type === 'pool'
                ? (() => {
                    const ts = league.pool_tournament_status;
                    if (ts === 'active')    return <Chip color="green"><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1" />Live</Chip>;
                    if (ts === 'completed') return <Chip color="gray">Complete</Chip>;
                    if (league.picks_locked) return <Chip color="yellow">Picks Locked</Chip>;
                    return <Chip color="green">Picks Open</Chip>;
                  })()
                : (league.draft_status === 'completed'
                    ? <Chip color="green">Season Active</Chip>
                    : <Chip color="yellow">Draft Pending</Chip>)
              }
            </div>
          </div>
          {league.format_type === 'pool'
            ? (() => {
                const ts = league.pool_tournament_status;
                const ctaClass = "inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-500/20 text-sm shrink-0";
                if (!league.picks_locked)
                  return <Link to={`/golf/league/${id}/picks`} className={ctaClass}>Make My Picks <ChevronRight className="w-4 h-4" /></Link>;
                if (ts === 'completed')
                  return <Link to={`/golf/league/${id}?tab=standings`} className={ctaClass}>Final Results <ChevronRight className="w-4 h-4" /></Link>;
                if (ts === 'active')
                  return <Link to={`/golf/league/${id}?tab=standings`} className={ctaClass}>View Leaderboard <ChevronRight className="w-4 h-4" /></Link>;
                return <Link to={`/golf/league/${id}?tab=standings`} className={ctaClass}>View Standings <ChevronRight className="w-4 h-4" /></Link>;
              })()
            : (league.draft_status !== 'completed' && (
                <Link
                  to={`/golf/league/${id}/draft`}
                  className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-500/20 text-sm shrink-0"
                >
                  {isComm ? 'Go to Draft' : 'Join Draft'} <ChevronRight className="w-4 h-4" />
                </Link>
              ))
          }
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="relative mb-6">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {getTabs(league, isComm).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                tab === t.key
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-900 to-transparent rounded-r-xl pointer-events-none" />
      </div>

      {/* ── Tab content ── */}
      {tab === 'overview' && (
        <OverviewTab league={league} members={members} user={user} isComm={isComm} navigate={navigate} />
      )}
      {tab === 'schedule' && (
        <ScheduleTab leagueId={id} isComm={isComm} />
      )}
      {tab === 'roster' && (
        <RosterTab leagueId={id} league={league} />
      )}
      {tab === 'freeagency' && league.format_type === 'tourneyrun' && (
        <FreeAgencyTab leagueId={id} league={league} />
      )}
      {tab === 'lineup' && (
        <LineupTab leagueId={id} league={league} />
      )}
      {tab === 'standings' && (
        <StandingsTab leagueId={id} league={league} currentUserId={user?.id} />
      )}
      {tab === 'pga-live' && (
        <PGALiveTab leagueId={id} league={league} />
      )}
      {tab === 'commissioner' && isComm && (
        <CommissionerTab leagueId={id} leagueName={league.name} members={members} />
      )}
    </div>
  );
}
