import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import TeamAvatar from '../components/TeamAvatar';
import { useDocTitle } from '../hooks/useDocTitle';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function fmt(n) {
  if (!n && n !== 0) return '$0';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\.00$/, '');
}

function secondsAgo(date) {
  if (!date) return null;
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!show) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  return (
    <span ref={ref} className="relative inline-flex items-center ml-1.5">
      <button
        onClick={() => setShow(s => !s)}
        className="w-4 h-4 rounded-full bg-gray-700 text-gray-400 text-[10px] font-bold leading-none flex items-center justify-center hover:bg-gray-600 hover:text-white transition-colors"
        aria-label="More info"
      >i</button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-gray-800 border border-gray-600 text-gray-300 text-xs rounded-xl p-3 shadow-xl z-50 leading-relaxed">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </div>
      )}
    </span>
  );
}

// ── Single Game Bonus Card ─────────────────────────────────────────────────────

function SgBonusCard({ sgLeader, bonus }) {
  if (!bonus || bonus <= 0) return null;

  return (
    <div className="card p-5 mb-6 bg-gradient-to-br from-purple-900/20 via-gray-900 to-gray-900 border-purple-500/25">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">👑</span>
        <h3 className="text-white font-bold text-base">Single Game Bonus Leader</h3>
        <span className="text-purple-400 font-bold">{fmt(bonus)}</span>
        <InfoTooltip text="Paid to the owner of the player with the highest single game point total during the tournament. Example: John Tonje scored 37 points vs BYU last March — his owner won the bonus." />
      </div>

      {!sgLeader ? (
        <div className="text-gray-500 text-sm">
          No games played yet — check back once the tournament tips off.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">👑</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold text-lg">{sgLeader.player_name}</span>
                <span className="text-purple-400 font-black text-lg">— {sgLeader.points} pts</span>
                <span className="text-gray-400 text-sm">vs {sgLeader.opponent}</span>
                {sgLeader.round_name && (
                  <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{sgLeader.round_name}</span>
                )}
              </div>
              <div className="mt-1.5">
                {sgLeader.owner_user_id ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-400 text-sm">Owned by:</span>
                    <span className="text-green-400 font-semibold text-sm">{sgLeader.owner_team_name}</span>
                    {sgLeader.owner_venmo && (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-900/40 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full font-medium">
                        <VenmoIcon />
                        {sgLeader.owner_venmo}
                      </span>
                    )}
                    <span className="text-gray-600 text-xs">← send {fmt(bonus)} here</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
                      Not drafted — no bonus awarded yet
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Venmo icon SVG ─────────────────────────────────────────────────────────────

function VenmoIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.5 2.25H4.5A2.25 2.25 0 002.25 4.5v15a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25v-15A2.25 2.25 0 0019.5 2.25zm-3.47 3.5c.41.67.6 1.38.6 2.3 0 2.88-2.46 6.62-4.46 9.25H8.1L6.5 5.8l3.86-.37 1 7.27c.92-1.53 2.07-3.94 2.07-5.58 0-.9-.15-1.51-.4-2.01l2.98-.36z" />
    </svg>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Leaderboard() {
  const { id: leagueId } = useParams();
  const { user } = useAuth();
  const [standings, setStandings] = useState([]);
  const [settings, setSettings] = useState(null);
  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [sgLeader, setSgLeader] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [livePlayerIds, setLivePlayerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [secondsSince, setSecondsSince] = useState(null);
  useDocTitle(league ? `${league.name} Standings | TourneyRun` : 'Standings | TourneyRun');

  // ── "X seconds ago" ticker ────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsSince(lastRefresh ? secondsAgo(lastRefresh) : null);
    }, 5000);
    return () => clearInterval(interval);
  }, [lastRefresh]);

  // ── REST fetch (initial + fallback polling) ───────────────────────────────
  const applyUpdate = useCallback((data) => {
    setStandings(data.standings || []);
    setSettings(data.settings || null);
    setSgLeader(data.sgLeader || null);
    setIsLive(!!data.isLive);
    setLivePlayerIds(data.livePlayerIds || []);
    setLastRefresh(new Date());
    setSecondsSince('just now');
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [standingsRes, leagueRes] = await Promise.all([
        api.get(`/scores/league/${leagueId}/standings`),
        api.get(`/leagues/${leagueId}`),
      ]);
      applyUpdate(standingsRes.data);
      setLeague(leagueRes.data.league);
      setMembers(leagueRes.data.members || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [leagueId, applyUpdate]);

  // Initial load + fallback 60s polling (in case socket drops)
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Socket.io real-time updates ───────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('join_leaderboard', { leagueId });
    });

    socket.on('standings_update', (data) => {
      applyUpdate(data);
    });

    socket.on('disconnect', () => {
      console.log('[Leaderboard] Socket disconnected');
    });

    return () => {
      socket.emit('leave_leaderboard', { leagueId });
      socket.disconnect();
    };
  }, [leagueId, applyUpdate]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-800 rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ── Prize pool math ──────────────────────────────────────────────────────────
  const buyIn        = parseFloat(league?.buy_in_amount) || 0;
  const managerCount = members.length;
  const totalPool    = buyIn * managerCount;
  const pct1         = parseFloat(league?.payout_first)  || 0;
  const pct2         = parseFloat(league?.payout_second) || 0;
  const pct3         = parseFloat(league?.payout_third)  || 0;
  const bonus        = parseFloat(league?.payout_bonus)  || 0;
  const mainPool     = Math.max(0, totalPool - bonus);
  const pay1         = mainPool * (pct1 / 100);
  const pay2         = mainPool * (pct2 / 100);
  const pay3         = mainPool * (pct3 / 100);
  const hasPrizePool = buyIn > 0 && managerCount > 0;

  const liveSet = new Set(livePlayerIds);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">🏆 Leaderboard</h1>
            {isLive && (
              <span className="inline-flex items-center gap-1.5 bg-green-900/30 border border-green-500/40 text-green-400 text-xs font-bold px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          {league && <p className="text-gray-400 mt-1">{league.name}</p>}
        </div>
        <div className="flex items-center gap-3">
          {secondsSince && (
            <span className="text-xs text-gray-600">
              Updated {secondsSince}
            </span>
          )}
          <button onClick={fetchData} className="text-xs text-gray-500 hover:text-gray-300 transition-colors" title="Refresh now">
            ↻ Refresh
          </button>
          <Link to={`/league/${leagueId}`} className="text-gray-400 hover:text-white text-sm transition-colors">
            ← Back to League
          </Link>
        </div>
      </div>

      {/* Prize pool banner */}
      {hasPrizePool && (
        <div className="card p-5 mb-6 bg-gradient-to-br from-yellow-500/8 to-transparent border-yellow-500/20">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Total Prize Pool</div>
              <div className="text-3xl font-black text-yellow-400">{fmt(totalPool)}</div>
              <div className="text-gray-500 text-xs mt-0.5">
                {fmt(buyIn)} buy-in × {managerCount} team{managerCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {bonus > 0 && (
              <div className="text-gray-500 text-xs pb-1 border-b border-gray-800">
                Main pool for standings: <span className="text-white font-semibold">{fmt(mainPool)}</span>
                <span className="text-gray-600 ml-1">({fmt(totalPool)} − {fmt(bonus)} bonus)</span>
              </div>
            )}
            {pct1 > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">🥇 1st Place</span>
                <span className="text-white font-bold">{fmt(pay1)}</span>
                <span className="text-gray-600 text-xs">{pct1}% of {fmt(mainPool)}</span>
              </div>
            )}
            {pct2 > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">🥈 2nd Place</span>
                <span className="text-white font-bold">{fmt(pay2)}</span>
                <span className="text-gray-600 text-xs">{pct2}% of {fmt(mainPool)}</span>
              </div>
            )}
            {pct3 > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">🥉 3rd Place</span>
                <span className="text-white font-bold">{fmt(pay3)}</span>
                <span className="text-gray-600 text-xs">{pct3}% of {fmt(mainPool)}</span>
              </div>
            )}
            {bonus > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-gray-800">
                <span className="text-gray-400">🎯 Single Game Bonus</span>
                <span className="text-purple-400 font-bold">{fmt(bonus)}</span>
                <span className="text-gray-600 text-xs">paid to owner of highest single-game scorer</span>
              </div>
            )}
          </div>

          {league.payment_instructions && (
            <div className="mt-3 pt-3 border-t border-gray-800 flex items-center gap-2 text-sm">
              <span className="text-gray-500 text-xs">Pay via:</span>
              <span className="text-green-400 font-medium text-xs">{league.payment_instructions}</span>
            </div>
          )}
        </div>
      )}

      {/* Single Game Bonus tracker */}
      <SgBonusCard sgLeader={sgLeader} bonus={bonus} />

      {standings.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">📊</div>
          <p>No standings yet. Stats will appear here once games are played.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {standings.map((team, i) => {
            const isMe = team.user_id === user?.id;
            const ptsColor = isMe ? 'text-brand-400'
              : i === 0 ? 'text-yellow-400'
              : i === 1 ? 'text-gray-300'
              : i === 2 ? 'text-amber-500'
              : 'text-white';
            const aliveCount = team.players ? team.players.filter(p => !p.is_eliminated).length : 0;
            return (
            <div
              key={team.user_id}
              className={`card overflow-hidden transition-all duration-200 ${
                isMe ? 'border-brand-500/60' : ''
              }`}
            >
              {/* Team row */}
              <button
                className="w-full text-left px-5 py-4 hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpanded(expanded === team.user_id ? null : team.user_id)}
              >
                <div className="flex items-center gap-4">
                  {/* Rank / medal */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                    i < 3 ? 'bg-gray-900 text-xl' : 'bg-gray-800 text-sm text-gray-500'
                  }`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </div>

                  {/* Team info */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <TeamAvatar avatarUrl={team.avatar_url} teamName={team.team_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold text-base ${isMe ? 'text-brand-400' : 'text-white'}`}>
                          {team.team_name}
                        </span>
                        {isMe && (
                          <span className="text-xs bg-brand-500/20 text-brand-400 border border-brand-500/30 px-1.5 py-0.5 rounded-full">You</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="text-gray-500 text-sm">{team.username}</span>
                        {team.venmo_handle && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-900/30 border border-blue-700/30 text-blue-400 px-1.5 py-0.5 rounded-full">
                            <VenmoIcon />
                            {team.venmo_handle}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Points + alive badge + expand */}
                  <div className="flex items-center gap-3">
                    {aliveCount > 0 && (
                      <span className="hidden sm:inline-flex items-center gap-1 bg-green-900/30 border border-green-500/30 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full">
                        {aliveCount} alive
                      </span>
                    )}
                    <div className="text-right">
                      <div className={`font-bold ${ptsColor}`} style={{ fontSize: 22 }}>{team.total_points}</div>
                      <div className="text-gray-500 text-xs">pts</div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expanded === team.user_id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Player preview chips */}
                {team.players && team.players.length > 0 && expanded !== team.user_id && (
                  <div className="mt-2 flex flex-wrap gap-1 ml-14">
                    {team.players.slice(0, 4).map(p => (
                      <span
                        key={p.player_id}
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          p.is_eliminated
                            ? 'bg-gray-800/50 text-gray-600 border-gray-700 line-through'
                            : liveSet.has(p.player_id)
                            ? 'bg-green-900/30 text-green-400 border-green-700/40'
                            : 'bg-gray-800 text-gray-400 border-gray-700'
                        }`}
                      >
                        {p.name}
                        {liveSet.has(p.player_id) && <span className="ml-1">●</span>}
                      </span>
                    ))}
                    {team.players.length > 4 && (
                      <span className="text-xs text-gray-500">+{team.players.length - 4} more</span>
                    )}
                  </div>
                )}
              </button>

              {/* Expanded roster */}
              {expanded === team.user_id && team.players && team.players.length > 0 && (
                <div className="border-t border-gray-800 bg-gray-900/30">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left px-5 py-2 text-gray-400 font-medium">Player</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-medium hidden sm:table-cell">Team</th>
                        <th className="text-right px-5 py-2 text-gray-400 font-medium">PTS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {team.players
                        .sort((a, b) => b.fantasy_points - a.fantasy_points)
                        .map(player => {
                          const playerIsLive = liveSet.has(player.player_id);
                          const todayPts = player.today_stats?.points;
                          const todayFinished = player.today_stats?.is_completed && !playerIsLive;

                          return (
                            <tr
                              key={player.player_id}
                              className={player.is_eliminated ? 'opacity-40' : ''}
                            >
                              <td className="px-5 py-2.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-medium ${player.is_eliminated ? 'line-through text-gray-500' : 'text-white'}`}>
                                    {player.name}
                                  </span>
                                  {player.is_eliminated && (
                                    <span className="text-xs bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded border border-red-500/30 font-bold">
                                      ELIM
                                    </span>
                                  )}
                                  {playerIsLive && (
                                    <span className="inline-flex items-center gap-1 text-xs bg-green-900/30 border border-green-500/40 text-green-400 px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                                      ● LIVE {todayPts != null ? `${todayPts} pts` : ''}
                                    </span>
                                  )}
                                  {todayFinished && todayPts != null && (
                                    <span className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full">
                                      Final: {todayPts} pts
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-500 text-xs">{player.position}</div>
                              </td>
                              <td className="px-3 py-2.5 text-gray-400 text-xs hidden sm:table-cell">{player.team}</td>
                              <td className="px-5 py-2.5 text-right">
                                <span className={`font-bold ${player.fantasy_points > 0 ? 'text-brand-400' : 'text-gray-500'}`}>
                                  {player.fantasy_points}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-700">
                        <td colSpan={2} className="px-5 py-2 text-right text-gray-400 font-medium text-sm">Total</td>
                        <td className="px-5 py-2 text-right text-brand-400 font-bold">{team.total_points}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}

      {settings && (
        <div className="card p-4 mt-6 flex items-center gap-3 text-sm">
          <span className="text-gray-400">Scoring:</span>
          <span className="bg-gray-800 px-2.5 py-1 rounded-full text-xs">
            <span className="text-gray-400">PTS: </span>
            <span className="font-bold text-brand-400">+{settings.pts_per_point} fantasy pt each</span>
          </span>
        </div>
      )}
    </div>
  );
}
