import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ticket, Plus, Flag, ChevronRight, Users, Calendar, Trophy, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import BallLoader from '../../components/BallLoader';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateRange(start, end) {
  if (!start) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const s = new Date(start + 'T12:00:00');
  const e = end ? new Date(end + 'T12:00:00') : null;
  if (!e || start === end) return `${MONTHS[s.getMonth()]} ${s.getDate()}`;
  if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
  return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
}

const ACTIVE_STATUSES = new Set(['active', 'lobby', 'draft', 'draft_pending', 'drafting']);

// ── Format pills config ────────────────────────────────────────────────────────

const FORMAT_META = {
  pool:       { label: '⛳ Pool',       pill: 'bg-green-500/15 border-green-500/30 text-green-400',  duration: 'Per Tournament', dPill: 'bg-amber-500/15 border-amber-500/30 text-amber-400',  bar: 'bg-green-500'  },
  dk:         { label: '💰 DFS',        pill: 'bg-blue-500/15 border-blue-500/30 text-blue-400',    duration: 'Per Tournament', dPill: 'bg-amber-500/15 border-amber-500/30 text-amber-400',  bar: 'bg-blue-500'   },
  tourneyrun: { label: '🏆 TourneyRun', pill: 'bg-teal-500/15 border-teal-500/30 text-teal-400',   duration: 'Season Long',    dPill: 'bg-gray-700/60 border-gray-700 text-gray-400',         bar: 'bg-teal-500'   },
};
function getMeta(fmt) { return FORMAT_META[fmt] || FORMAT_META.tourneyrun; }

// ── Prize breakdown helper ─────────────────────────────────────────────────────

function parsePayout(league) {
  let places = [];
  try { places = JSON.parse(league.payout_places || '[]'); } catch (_) {}
  if (!places.length && league.payout_first) {
    places = [
      { place: 1, pct: parseFloat(league.payout_first)  || 0 },
      { place: 2, pct: parseFloat(league.payout_second) || 0 },
      { place: 3, pct: parseFloat(league.payout_third)  || 0 },
    ].filter(p => p.pct > 0);
  }
  return places;
}

const PLACE_ICONS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

function PrizeBreakdown({ league }) {
  const buyIn = parseFloat(league.buy_in_amount) || 0;
  const teams  = parseInt(league.member_count) || 0;
  const prizePool = league.payout_pool_override
    ? parseFloat(league.payout_pool_override)
    : buyIn * teams;
  if (prizePool <= 0) return null;

  const places  = parsePayout(league);
  if (!places.length) return null;
  const shown    = places.slice(0, 3);
  const extra    = places.length - shown.length;

  return (
    <div className="mt-2 bg-gray-800/50 rounded-xl px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 font-semibold">Prize Pool</span>
        <span className="text-white font-black">${prizePool.toLocaleString()}</span>
      </div>
      {shown.map((p, i) => (
        <div key={p.place} className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{PLACE_ICONS[i]} {p.place === 1 ? '1st' : p.place === 2 ? '2nd' : '3rd'}</span>
          <span className="text-gray-300 font-semibold">
            ${Math.round(prizePool * (p.pct / 100)).toLocaleString()}
            <span className="text-gray-600 font-normal ml-1">({p.pct}%)</span>
          </span>
        </div>
      ))}
      {extra > 0 && (
        <p className="text-gray-600 text-[10px]">+ {extra} more place{extra !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
}

// ── Next Tournament Banner ─────────────────────────────────────────────────────

function NextTournamentBanner({ tournament }) {
  if (!tournament) return null;
  const start     = new Date(tournament.start_date + 'T12:00:00');
  const end       = new Date(tournament.end_date + 'T12:00:00');
  const now       = new Date();
  const isLive    = now >= start && now <= end;
  const daysUntil = Math.ceil((start - now) / 86400000);
  const fmt       = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dateRange = `${fmt(start)} – ${fmt(end)}, 2026`;

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 mb-6 ${
      isLive ? 'bg-green-500/8 border-green-500/30' : tournament.is_major ? 'bg-yellow-500/5 border-yellow-500/25' : 'bg-gray-900 border-gray-800'
    }`}>
      {isLive && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(34,197,94,0.08)_0%,_transparent_60%)] pointer-events-none" />
      )}
      <div className="relative flex flex-wrap items-center gap-3 sm:gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          isLive ? 'bg-green-500/20' : tournament.is_major ? 'bg-yellow-500/10' : 'bg-gray-800'
        }`}>
          {tournament.is_major ? <Trophy className="w-5 h-5 text-yellow-400" /> : <Flag className="w-5 h-5 text-green-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-white font-black text-sm sm:text-base truncate">{tournament.name}</span>
            {isLive && (
              <span className="inline-flex items-center gap-1 bg-green-500/20 border border-green-500/40 text-green-400 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> LIVE NOW
              </span>
            )}
            {!isLive && tournament.is_major && (
              <span className="inline-block bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">MAJOR</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {dateRange}</span>
            {tournament.course && <><span className="text-gray-600">·</span><span className="truncate">{tournament.course}</span></>}
          </div>
        </div>
        {!isLive && daysUntil > 0 && (
          <div className="text-right shrink-0">
            <div className={`font-black text-lg tabular-nums ${tournament.is_major ? 'text-yellow-400' : 'text-green-400'}`}>{daysUntil}d</div>
            <div className="text-gray-500 text-[10px] uppercase tracking-wide">until start</div>
          </div>
        )}
        {isLive && <div className="text-right shrink-0"><div className="text-green-400 font-black text-sm">In Progress</div></div>}
      </div>
    </div>
  );
}

// ── League Card ────────────────────────────────────────────────────────────────

function LeagueCard({ league, userId, picksStatus, past = false }) {
  const navigate = useNavigate();
  const isComm = league.commissioner_id === userId;
  const meta   = getMeta(league.format_type);

  const isPool = league.format_type === 'pool';
  const poolTs  = isPool ? league.pool_tournament_status : null;
  const statusLabel = past ? 'Completed'
    : isPool
      ? (poolTs === 'active' ? 'Live' : poolTs === 'completed' ? 'Complete' : league.picks_locked ? 'Picks Locked' : 'Picks Open')
      : (league.draft_status === 'completed' ? 'Season Active' : 'Draft Pending');
  const statusColor = past ? 'text-gray-500'
    : isPool
      ? (poolTs === 'active' ? 'text-green-400' : poolTs === 'completed' ? 'text-gray-500' : league.picks_locked ? 'text-yellow-400' : 'text-green-400')
      : (league.draft_status === 'completed' ? 'text-green-400' : 'text-blue-400');
  const statusDot   = past ? 'bg-gray-600'
    : isPool
      ? (poolTs === 'active' ? 'bg-green-400' : poolTs === 'completed' ? 'bg-gray-600' : league.picks_locked ? 'bg-yellow-400' : 'bg-green-400')
      : (league.draft_status === 'completed' ? 'bg-green-400' : 'bg-blue-400');
  const statusPulse = !past && ((isPool && poolTs === 'active') || (!isPool && league.draft_status === 'completed'));

  // Pool tournament line
  const hasTourn    = !!league.pool_tournament_name;
  const tournLine   = hasTourn
    ? `${league.pool_tournament_name}${league.pool_tournament_start ? ' · ' + fmtDateRange(league.pool_tournament_start, league.pool_tournament_end) : ''}`
    : 'No tournament set yet';

  return (
    <Link
      to={`/golf/league/${league.id}`}
      className="group relative flex flex-col rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden transition-all hover:-translate-y-1 hover:border-green-500/40 hover:shadow-xl hover:shadow-green-500/10"
    >
      {/* Top accent bar */}
      <div className={`h-1 w-full ${meta.bar}`} />

      <div className="p-5 flex flex-col flex-1 gap-3">
        {/* Name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-black text-white leading-tight truncate">{league.name}</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot} shrink-0 ${statusPulse ? 'animate-pulse' : ''}`} />
              <span className={`text-xs font-bold ${statusColor}`}>{statusLabel}</span>
              {isComm && (
                <span className="text-[10px] font-bold text-green-400 bg-green-500/15 border border-green-500/25 px-1.5 py-0.5 rounded-full ml-1">COMM</span>
              )}
            </div>
          </div>
        </div>

        {/* Format + duration pills */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.pill}`}>
            {meta.label}
          </span>
          {league.format_type === 'tourneyrun' && (
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.dPill}`}>
              {meta.duration}
            </span>
          )}
        </div>

        {/* Pool tournament line */}
        {league.format_type === 'pool' && (
          <p className={`text-xs -mt-1 ${hasTourn ? 'text-gray-400' : 'text-gray-600'}`}>
            {tournLine}
          </p>
        )}

        {/* Team + Members */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Your Team</div>
            <div className="text-white text-sm font-semibold truncate">{league.team_name || '—'}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-1 text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">
              <Users className="w-3 h-3" /> Members
            </div>
            <div className="text-white text-sm font-semibold">{league.member_count}/{league.max_teams}</div>
          </div>
        </div>

        {/* Prize breakdown (active leagues with buy-in) */}
        {!past && <PrizeBreakdown league={league} />}

        {/* CTA row */}
        <div className="mt-auto pt-1">
          {/* Pool picks CTA */}
          {isPool && !past && picksStatus && (() => {
            const { submitted, picks_locked } = picksStatus;
            const target = `/golf/league/${league.id}?tab=roster`;
            if (picks_locked) return (
              <button
                onClick={e => { e.preventDefault(); navigate(target); }}
                style={{ width: '100%', background: 'transparent', border: '1px solid #374151', color: '#9ca3af', fontSize: 13, fontWeight: 600, padding: '8px', borderRadius: 8, cursor: 'pointer', marginBottom: 6 }}
              >🔒 View My Picks</button>
            );
            if (submitted) return (
              <button
                onClick={e => { e.preventDefault(); navigate(target); }}
                style={{ width: '100%', background: 'transparent', border: '1.5px solid #22c55e', color: '#22c55e', fontSize: 13, fontWeight: 700, padding: '8px', borderRadius: 8, cursor: 'pointer', marginBottom: 6 }}
              >✅ View / Edit Picks</button>
            );
            return (
              <button
                onClick={e => { e.preventDefault(); navigate(target); }}
                style={{ width: '100%', background: '#22c55e', border: 'none', color: '#001a0d', fontSize: 13, fontWeight: 700, padding: '8px', borderRadius: 8, cursor: 'pointer', marginBottom: 6 }}
              >✏️ Make Picks</button>
            );
          })()}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 14, fontWeight: 700, padding: '10px 24px', borderRadius: 8, transition: 'border-color 0.15s, background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'transparent'; }}>
            {past ? 'View Results' : 'View League'} <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label, count }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-lg font-black text-white">{label}</h2>
      {count !== undefined && (
        <span className="text-xs font-bold text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function GolfDashboard() {
  useDocTitle('Golf Dashboard | TourneyRun', {
    description: 'View and manage your golf fantasy leagues and office pools on TourneyRun.',
  });
  const { user } = useAuth();
  const [leagues, setLeagues]           = useState([]);
  const [nextTournament, setNextTournament] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [pastOpen, setPastOpen]         = useState(false);
  const [poolPicksMap, setPoolPicksMap] = useState({});

  useEffect(() => {
    Promise.all([
      api.get('/golf/leagues'),
      api.get('/golf/tournaments'),
      api.get('/golf/leagues/my-rosters'),
    ]).then(([lr, tr, rr]) => {
      const leaguesList = lr.data.leagues || [];
      setLeagues(leaguesList);
      setPoolPicksMap(rr.data || {});
      const tournaments = tr.data.tournaments || [];
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const live = tournaments.find(t => {
        if (!t.start_date || !t.end_date) return false;
        return today >= new Date(t.start_date + 'T12:00:00') && today <= new Date(t.end_date + 'T12:00:00');
      });
      if (live) { setNextTournament(live); return; }
      const upcoming = tournaments
        .filter(t => t.start_date && new Date(t.start_date + 'T12:00:00') > today)
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      setNextTournament(upcoming[0] || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <BallLoader />;

  const isActiveLeague = l =>
    ACTIVE_STATUSES.has(l.status) &&
    !(l.format_type === 'pool' && l.pool_tournament_status === 'completed');
  const activeLeagues = leagues.filter(isActiveLeague);
  const pastLeagues   = leagues.filter(l => !isActiveLeague(l));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8 sm:mb-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">Golf Leagues</h1>
          <p className="text-gray-400 mt-1">Welcome back, {user?.username}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/golf/join"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px 24px', borderRadius: 8, textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <Ticket className="w-4 h-4" /> Join League
          </Link>
          <Link
            to="/golf/create"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#22c55e', color: '#001a0d', fontWeight: 700, fontSize: 14, padding: '10px 24px', borderRadius: 8, textDecoration: 'none', transition: 'background 0.15s, transform 0.15s', letterSpacing: '0.01em' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#16a34a'; e.currentTarget.style.transform = 'scale(1.01)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#22c55e'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Plus className="w-4 h-4" /> Create Custom League
          </Link>
          <Link
            to="/golf/create?format=pool"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px 24px', borderRadius: 8, textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'transparent'; }}
          >
            🏆 Run an Office Pool
          </Link>
        </div>
      </div>

      {/* ── Next Tournament Banner ── */}
      <NextTournamentBanner tournament={nextTournament} />

      {/* ── Empty state ── */}
      {leagues.length === 0 && (
        <div className="relative overflow-hidden rounded-3xl border border-gray-800 bg-gray-900 p-8 sm:p-10 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(34,197,94,0.05)_0%,_transparent_70%)] pointer-events-none" />
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5">
              <Flag className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-3">No leagues yet</h2>
            <p className="text-gray-400 max-w-md mx-auto mb-8">
              Create a golf league or join one with an invite code to start competing.
            </p>
            <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <Link
                to="/golf/create"
                className="group flex flex-col items-center gap-3 bg-gray-800 hover:bg-gray-800/80 border border-gray-700 hover:border-green-500/50 rounded-2xl p-6 transition-all hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <div className="text-white font-black text-sm">Create Custom League</div>
                  <div className="text-gray-500 text-xs mt-0.5">Draft, salary cap, or daily</div>
                </div>
              </Link>
              <Link
                to="/golf/create?format=pool"
                className="group flex flex-col items-center gap-3 bg-gray-800 hover:bg-gray-800/80 border border-gray-700 hover:border-amber-500/40 rounded-2xl p-6 transition-all hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform text-2xl">
                  🏆
                </div>
                <div>
                  <div className="text-white font-black text-sm">Run an Office Pool</div>
                  <div className="text-gray-500 text-xs mt-0.5">Pick sheet, per tournament</div>
                </div>
              </Link>
              <Link
                to="/golf/join"
                className="group flex flex-col items-center gap-3 bg-gray-800 hover:bg-gray-800/80 border border-gray-700 hover:border-green-500/50 rounded-2xl p-6 transition-all hover:-translate-y-1"
              >
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Ticket className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <div className="text-white font-black text-sm">Join a League</div>
                  <div className="text-gray-500 text-xs mt-0.5">Enter your invite code</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Leagues ── */}
      {activeLeagues.length > 0 && (
        <div className="mb-10">
          <SectionHeader label="Active Leagues" count={activeLeagues.length} />
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {activeLeagues.map(l => (
              <LeagueCard key={l.id} league={l} userId={user?.id} picksStatus={poolPicksMap[l.id]} />
            ))}
          </div>
        </div>
      )}

      {/* ── Past Leagues ── */}
      {pastLeagues.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setPastOpen(o => !o)}
            className="flex items-center gap-2 mb-4 group"
          >
            <h2 className="text-lg font-black text-gray-400 group-hover:text-gray-200 transition-colors">Past Leagues</h2>
            <span className="text-xs font-bold text-gray-500 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full">
              {pastLeagues.length}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${pastOpen ? 'rotate-180' : ''}`} />
          </button>
          {pastOpen && (
            <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pastLeagues.map(l => (
                <LeagueCard key={l.id} league={l} userId={user?.id} past />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
