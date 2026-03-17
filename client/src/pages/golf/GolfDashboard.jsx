import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import BallLoader from '../../components/BallLoader';

export default function GolfDashboard() {
  useDocTitle('Golf Dashboard | TourneyRun');
  const { user } = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/golf/leagues')
      .then(r => setLeagues(r.data.leagues || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <BallLoader />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-4xl font-black text-white leading-tight">
            Golf Leagues 🏌️
          </h1>
          <p className="text-gray-400 mt-1">Welcome back, {user?.username}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link
            to="/golf/join"
            className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-200 font-semibold px-5 py-2.5 rounded-full transition-all"
          >
            🎟 Join League
          </Link>
          <Link
            to="/golf/create"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-500/25 hover:scale-105"
          >
            + Create League
          </Link>
        </div>
      </div>

      {/* ── Empty state ── */}
      {leagues.length === 0 && (
        <div className="relative overflow-hidden rounded-3xl border border-gray-800 bg-gray-900 p-10 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(34,197,94,0.05)_0%,_transparent_70%)] pointer-events-none" />
          <div className="relative">
            <div className="text-6xl mb-5">⛳</div>
            <h2 className="text-2xl font-black text-white mb-3">No leagues yet</h2>
            <p className="text-gray-400 max-w-md mx-auto mb-8">
              Create a golf league or join one with an invite code to start competing.
            </p>
            <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              <Link
                to="/golf/create"
                className="group flex flex-col items-center gap-3 bg-gray-800 hover:bg-gray-800/80 border border-gray-700 hover:border-green-500/50 rounded-2xl p-6 transition-all hover:-translate-y-1"
              >
                <span className="text-3xl group-hover:scale-110 transition-transform">➕</span>
                <div>
                  <div className="text-white font-black">Create a League</div>
                  <div className="text-gray-500 text-sm mt-0.5">Set the rules, invite your crew</div>
                </div>
              </Link>
              <Link
                to="/golf/join"
                className="group flex flex-col items-center gap-3 bg-gray-800 hover:bg-gray-800/80 border border-gray-700 hover:border-green-500/50 rounded-2xl p-6 transition-all hover:-translate-y-1"
              >
                <span className="text-3xl group-hover:scale-110 transition-transform">🎟</span>
                <div>
                  <div className="text-white font-black">Join a League</div>
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
            const isComm = league.commissioner_id === user?.id;
            const statusLabel = league.draft_status === 'completed' ? 'Season Active' : 'Drafting';
            const statusColor = league.draft_status === 'completed' ? 'text-green-400' : 'text-blue-400';
            const statusDot   = league.draft_status === 'completed' ? 'bg-green-400' : 'bg-blue-400';

            return (
              <Link
                key={league.id}
                to={`/golf/league/${league.id}`}
                className="group relative flex flex-col rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden transition-all hover:-translate-y-1 hover:border-green-500/40 hover:shadow-xl hover:shadow-green-500/10"
              >
                <div className="h-1 w-full bg-green-500" />
                <div className="p-5 flex flex-col flex-1 gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-black text-white leading-tight">{league.name}</div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot} animate-pulse`} />
                        <span className={`text-xs font-bold ${statusColor}`}>{statusLabel}</span>
                        {isComm && (
                          <span className="text-[10px] font-bold text-green-400 bg-green-500/15 border border-green-500/25 px-1.5 py-0.5 rounded-full ml-1">COMM</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                      <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Your Team</div>
                      <div className="text-white text-sm font-semibold truncate">{league.team_name || '—'}</div>
                    </div>
                    <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                      <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Members</div>
                      <div className="text-white text-sm font-semibold">{league.member_count}/{league.max_teams}</div>
                    </div>
                  </div>

                  <div className="mt-auto pt-1 flex gap-2">
                    <div className="flex-1 flex items-center justify-center bg-gray-800/60 hover:bg-gray-800 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white text-sm font-medium py-2 rounded-xl transition-all">
                      Enter League →
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
