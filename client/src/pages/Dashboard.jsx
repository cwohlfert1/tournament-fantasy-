import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import { useDocTitle } from '../hooks/useDocTitle';
import BallLoader from '../components/BallLoader';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  pending_payment: {
    label: 'Awaiting Payment',
    dot: 'bg-yellow-400',
    badge: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
    bar: 'bg-yellow-500',
  },
  lobby: {
    label: 'Waiting for Draft',
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
    bar: 'bg-blue-500',
  },
  drafting: {
    label: 'Live Draft ⚡',
    dot: 'bg-brand-400',
    badge: 'bg-brand-500/15 border-brand-500/30 text-brand-400',
    bar: 'bg-brand-500',
  },
  active: {
    label: 'Season Active',
    dot: 'bg-green-400',
    badge: 'bg-green-500/15 border-green-500/30 text-green-400',
    bar: 'bg-green-500',
  },
  completed: {
    label: 'Season Complete',
    dot: 'bg-gray-500',
    badge: 'bg-gray-700 border-gray-600 text-gray-400',
    bar: 'bg-gray-600',
  },
};

function fmt(n) {
  if (!n) return null;
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

function rankSuffix(n) {
  if (n >= 11 && n <= 13) return 'th';
  const r = n % 10;
  if (r === 1) return 'st';
  if (r === 2) return 'nd';
  if (r === 3) return 'rd';
  return 'th';
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.lobby;
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  useDocTitle('My Leagues | TourneyRun');
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leagues, setLeagues]                 = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [paymentDue, setPaymentDue]           = useState({});
  const [rankings, setRankings]               = useState({}); // { [leagueId]: { rank, total } }
  const [creatingTestLeague, setCreatingTestLeague] = useState(false);

  const handleCreateTestLeague = async () => {
    setCreatingTestLeague(true);
    try {
      const res = await api.post('/admin/create-test-league');
      navigate(`/league/${res.data.leagueId}/leaderboard`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create test league');
      setCreatingTestLeague(false);
    }
  };

  useEffect(() => {
    api.get('/leagues').then(async r => {
      const leaguesData = r.data.leagues;
      setLeagues(leaguesData);

      const checks = leaguesData
        .filter(l => l.status !== 'completed')
        .map(l =>
          api.get(`/payments/league/${l.id}/status`)
            .then(res => {
              const mine = res.data.payments.find(p => p.user_id === user?.id);
              return { id: l.id, due: mine?.status === 'pending' };
            })
            .catch(() => ({ id: l.id, due: false }))
        );

      const standingsChecks = leaguesData
        .filter(l => l.status === 'active' && l.draft_status === 'completed')
        .map(l =>
          api.get(`/scores/league/${l.id}/standings`)
            .then(res => {
              const arr = res.data.standings || [];
              const idx = arr.findIndex(s => s.user_id === user?.id);
              return { id: l.id, rank: idx >= 0 ? idx + 1 : null, total: arr.length };
            })
            .catch(() => ({ id: l.id, rank: null, total: 0 }))
        );

      const [results, rankResults] = await Promise.all([
        Promise.all(checks),
        Promise.all(standingsChecks),
      ]);

      const map = {};
      for (const r of results) map[r.id] = r.due;
      setPaymentDue(map);

      const rankMap = {};
      for (const r of rankResults) rankMap[r.id] = { rank: r.rank, total: r.total };
      setRankings(rankMap);

      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.id]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return <BallLoader />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-black text-white leading-tight">
            Welcome back, {user?.username} 👋
          </h1>
          <p className="text-gray-400 mt-1 text-lg">Your tournament leagues at a glance</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link
            to="/join-league"
            className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-200 hover:text-white font-semibold px-5 py-2.5 rounded-full transition-all duration-200"
          >
            🎟 Join League
          </Link>
          <Link
            to="/create-league"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold px-5 py-2.5 rounded-full transition-all duration-200 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-105"
          >
            + Create League
          </Link>
        </div>
      </div>

      {/* ── Empty state ── */}
      {leagues.length === 0 && (
        <div className="relative overflow-hidden rounded-3xl border border-gray-800 bg-gray-900 p-10 text-center mb-10">
          {/* Ambient glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(55,138,221,0.06)_0%,_transparent_70%)] pointer-events-none" />

          <div className="relative">
            <div
              className="text-7xl mb-5 inline-block"
              style={{ animation: 'bounce 1.8s ease-in-out infinite' }}
            >
              🏀
            </div>
            <style>{`
              @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                45%       { transform: translateY(-18px); }
                60%       { transform: translateY(-10px); }
              }
            `}</style>

            <h2 className="text-3xl font-black text-white mb-3">Your court is empty</h2>
            <p className="text-gray-400 text-lg max-w-md mx-auto mb-10">
              Create a league or join one with an invite code to get started.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto">
              <Link
                to="/create-league"
                className="group relative flex flex-col items-center gap-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-brand-500/50 rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/10"
              >
                <div className="absolute inset-0 rounded-2xl bg-brand-500/0 group-hover:bg-brand-500/5 transition-colors duration-300" />
                <span className="relative text-4xl group-hover:scale-110 transition-transform duration-200">➕</span>
                <div className="relative">
                  <div className="text-white font-black text-lg">Create a League</div>
                  <div className="text-gray-500 text-sm mt-0.5">Set the rules, invite your crew</div>
                </div>
              </Link>

              <Link
                to="/join-league"
                className="group relative flex flex-col items-center gap-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-brand-500/50 rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-500/10"
              >
                <div className="absolute inset-0 rounded-2xl bg-brand-500/0 group-hover:bg-brand-500/5 transition-colors duration-300" />
                <span className="relative text-4xl group-hover:scale-110 transition-transform duration-200">🎟</span>
                <div className="relative">
                  <div className="text-white font-black text-lg">Join a League</div>
                  <div className="text-gray-500 text-sm mt-0.5">Enter your invite code</div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── League cards ── */}
      {leagues.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map(league => {
            const isDue      = paymentDue[league.id] === true;
            const s          = STATUS[league.status] || STATUS.lobby;
            const buyIn      = league.buy_in_amount || 0;
            const prizePool  = buyIn * league.member_count;
            const fillPct    = Math.round((league.member_count / league.max_teams) * 100);
            const isComm     = league.commissioner_id === user?.id;
            const spotsLeft  = league.max_teams - league.member_count;

            // Primary action
            let actionTo    = `/league/${league.id}`;
            let actionLabel = 'Enter League';
            if (league.status === 'drafting') {
              actionTo    = `/league/${league.id}/draft`;
              actionLabel = '🚀 Enter Draft';
            } else if (league.status === 'active' || league.status === 'completed') {
              actionTo    = `/league/${league.id}/leaderboard`;
              actionLabel = '📊 Leaderboard';
            }

            return (
              <div
                key={league.id}
                className="group relative flex flex-col rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-xl hover:shadow-brand-500/10"
              >
                {/* Status bar accent at top */}
                <div className={`h-1 w-full ${s.bar}`} />

                {/* Payment due ribbon */}
                {isDue && (
                  <div className="bg-red-500/15 border-b border-red-500/20 px-4 py-2 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-red-400 text-xs font-bold">$5 access fee due</span>
                  </div>
                )}

                <div className="p-5 flex flex-col flex-1">
                  {/* League name + status */}
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <div className="min-w-0">
                      <Link
                        to={`/league/${league.id}`}
                        className="text-lg font-black text-white hover:text-brand-400 hover:underline transition-colors truncate leading-tight block cursor-pointer"
                        onClick={e => e.stopPropagation()}
                      >
                        {league.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <StatusBadge status={league.status} />
                        {isComm && (
                          <span className="text-[10px] font-bold text-brand-400 bg-brand-500/15 border border-brand-500/25 px-1.5 py-0.5 rounded-full">
                            COMM
                          </span>
                        )}
                      </div>
                    </div>
                    {buyIn > 0 && (
                      <div className="shrink-0 text-right">
                        <div className="text-amber-400 font-black text-xl">{fmt(prizePool)}</div>
                        <div className="text-gray-500 text-[10px]">prize pool</div>
                      </div>
                    )}
                  </div>

                  {/* Stats grid */}
                  {(() => {
                    const rd = rankings[league.id];
                    const showPlace = league.status === 'active' && league.draft_status === 'completed' && rd?.rank != null;
                    const rank = rd?.rank;
                    const rankColor = rank === 1 ? '#f59e0b' : rank <= 3 ? '#22c55e' : '#fff';
                    const allZero = league.total_points === 0;
                    return (
                  <div className={`grid gap-2 mb-4 ${showPlace ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                      <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Your Team</div>
                      <div className="text-white text-sm font-semibold truncate">{league.team_name}</div>
                    </div>
                    <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                      <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Teams</div>
                      <div className="text-white text-sm font-semibold">{league.member_count}/{league.max_teams}</div>
                    </div>
                    {showPlace && (
                      <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                        <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Place</div>
                        {allZero
                          ? <div className="text-gray-600 text-sm font-semibold">—</div>
                          : <div className="text-sm font-bold" style={{ color: rankColor }}>
                              {rank}{rankSuffix(rank)}<span className="text-gray-500 font-normal"> / {rd.total}</span>
                            </div>
                        }
                      </div>
                    )}
                    {buyIn > 0 && (
                      <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                        <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Buy-in</div>
                        <div className="text-amber-400 text-sm font-bold">{fmt(buyIn)}</div>
                      </div>
                    )}
                    {league.total_points > 0 && (
                      <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                        <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Your Points</div>
                        <div className="text-brand-400 text-sm font-bold">{league.total_points} pts</div>
                      </div>
                    )}
                    {league.total_points === 0 && buyIn === 0 && (
                      <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                        <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Rounds</div>
                        <div className="text-white text-sm font-semibold">{league.total_rounds}</div>
                      </div>
                    )}
                  </div>
                    );
                  })()}

                  {/* Managers fill bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-500">{league.member_count} teams joined</span>
                      {spotsLeft > 0 && league.status === 'lobby'
                        ? <span className="text-red-400 font-semibold">{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
                        : <span className="text-gray-600">{league.max_teams} max</span>
                      }
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${s.bar}`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>

                  {/* ── Standings / payout card (active + draft complete) ── */}
                  {league.status === 'active' && league.draft_status === 'completed' && (() => {
                    const pool = league.payout_pool_override > 0
                      ? league.payout_pool_override
                      : buyIn * league.member_count;
                    const pay1 = pool * ((league.payout_first  || 0) / 100);
                    const pay2 = pool * ((league.payout_second || 0) / 100);
                    const pay3 = pool * ((league.payout_third  || 0) / 100);
                    const hasPayout = pool > 0 && (pay1 + pay2 + pay3) > 0;
                    return (
                      <div className="mb-4 rounded-xl bg-gray-800/50 border border-gray-700/60 px-3.5 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-green-400 text-xs">✓</span>
                          <span className="text-gray-300 text-xs font-semibold">Draft complete — season underway</span>
                        </div>
                        {hasPayout && (
                          <div className="text-[11px] text-gray-500 leading-relaxed">
                            Pays 3 spots:&nbsp;
                            <span className="text-amber-400 font-bold">1st {fmt(pay1)}</span>
                            <span className="text-gray-600"> · </span>
                            <span className="text-gray-300 font-semibold">2nd {fmt(pay2)}</span>
                            <span className="text-gray-600"> · </span>
                            <span className="text-gray-400">3rd {fmt(pay3)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* CTA buttons */}
                  <div className="mt-auto flex flex-col gap-2">
                    <Link
                      to={actionTo}
                      className={`block w-full text-center font-bold py-2.5 rounded-xl text-sm transition-all duration-200 ${
                        league.status === 'drafting'
                          ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-lg shadow-brand-500/25'
                          : 'bg-gray-800 hover:bg-brand-500 border border-gray-700 hover:border-brand-500 text-gray-300 hover:text-white'
                      }`}
                    >
                      {actionLabel}
                    </Link>
                    {(league.status === 'active' || league.status === 'completed') && (
                      <Link
                        to={`/league/${league.id}`}
                        className="block w-full text-center font-bold py-2.5 rounded-xl text-sm border border-gray-600 hover:border-gray-400 bg-gray-900 hover:bg-gray-800 text-white transition-all duration-200"
                      >
                        Go to League →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dev tools ── */}
      {import.meta.env.DEV && (
        <div className="mt-12 border border-dashed border-gray-700 rounded-2xl p-5">
          <div className="text-xs text-gray-600 font-bold uppercase tracking-wider mb-3">Dev Tools</div>
          <button
            onClick={handleCreateTestLeague}
            disabled={creatingTestLeague}
            className="btn-secondary text-sm px-4 py-2 disabled:opacity-50"
          >
            {creatingTestLeague ? 'Creating...' : '⚡ Create Test League'}
          </button>
          <p className="text-gray-600 text-xs mt-2">
            Creates a league with 12 test users, all payments confirmed, draft completed instantly.
          </p>
        </div>
      )}

    </div>
  );
}
