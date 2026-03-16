import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import TeamAvatar from '../components/TeamAvatar';
import { useDocTitle } from '../hooks/useDocTitle';
import BallLoader from '../components/BallLoader';

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

// ── Team avatar (inline colors — safe from Tailwind purging in prod) ───────────

const AVATAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b',
  '#ef4444', '#10b981', '#ec4899', '#6366f1', '#f97316', '#06b6d4',
];

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function nameInitials(name) {
  if (!name) return '?';
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function TeamBadge({ avatarUrl, teamName, size = 32 }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={teamName}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={e => { e.target.style.display = 'none'; }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        backgroundColor: avatarColor(teamName),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, color: '#fff', fontSize: size * 0.34,
      }}
    >
      {nameInitials(teamName)}
    </div>
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

  if (loading) return <BallLoader />;

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
            const isLast = i === standings.length - 1 && standings.length > 1;
            const ptsColor = isMe ? '#378ADD'
              : i === 0 ? '#facc15'
              : i === 1 ? '#d1d5db'
              : i === 2 ? '#f97316'
              : '#ffffff';
            const totalPlayers = team.players ? team.players.length : 0;
            const aliveCount = team.players ? team.players.filter(p => !p.is_eliminated).length : 0;
            const isExpanded = expanded === team.user_id;

            return (
              <div
                key={team.user_id}
                className="card overflow-hidden transition-all duration-200"
                style={isMe ? { borderColor: 'rgba(55,138,221,0.6)' } : undefined}
              >
                {/* ── Clickable header row ── */}
                <button
                  type="button"
                  className="w-full text-left px-4 py-3.5 hover:bg-gray-800/50 transition-colors"
                  onClick={() => setExpanded(isExpanded ? null : team.user_id)}
                >
                  <div className="flex items-center gap-3">

                    {/* Rank / medal */}
                    <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0"
                      style={{ fontSize: i < 3 ? 22 : 13, color: i >= 3 ? '#6b7280' : undefined }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </div>

                    {/* Avatar */}
                    <TeamBadge avatarUrl={team.avatar_url} teamName={team.team_name} size={36} />

                    {/* Team name + username */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap leading-tight">
                        <span className="font-bold text-base" style={{ color: isMe ? '#378ADD' : '#fff' }}>
                          {team.team_name}
                          {isLast && <span className="ml-1">💀</span>}
                        </span>
                        {isMe && (
                          <span className="text-[10px] font-bold bg-brand-500/20 text-brand-400 border border-brand-500/30 px-1.5 py-0.5 rounded-full">You</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-gray-500 text-xs">{team.username}</span>
                        {team.venmo_handle && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-blue-900/30 border border-blue-700/30 text-blue-400 px-1.5 py-0.5 rounded-full">
                            <VenmoIcon />{team.venmo_handle}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: alive pill + points + chevron */}
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      {totalPlayers > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                          style={aliveCount === 0
                            ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }
                            : { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }
                          }>
                          {aliveCount} alive
                        </span>
                      )}
                      <div className="text-right min-w-[40px]">
                        <div className="font-black leading-tight" style={{ fontSize: 22, color: ptsColor }}>{team.total_points}</div>
                        <div className="text-gray-500 text-[10px]">pts</div>
                      </div>
                      <svg
                        className="w-4 h-4 text-gray-500 transition-transform duration-200 flex-shrink-0"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Player chip preview (collapsed only) */}
                  {!isExpanded && team.players && team.players.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 pl-[108px]">
                      {team.players.slice(0, 5).map(p => (
                        <span
                          key={p.player_id}
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            p.is_eliminated
                              ? 'bg-gray-800/50 text-gray-600 border-gray-700/50 line-through'
                              : liveSet.has(p.player_id)
                              ? 'bg-green-900/30 text-green-400 border-green-700/40'
                              : 'bg-gray-800/60 text-gray-400 border-gray-700/50'
                          }`}
                        >
                          {p.name}{liveSet.has(p.player_id) ? ' ●' : ''}
                        </span>
                      ))}
                      {team.players.length > 5 && (
                        <span className="text-[10px] text-gray-600">+{team.players.length - 5} more</span>
                      )}
                    </div>
                  )}
                </button>

                {/* ── Expanded roster ── */}
                {isExpanded && (
                  <div className="border-t border-gray-800">
                    {team.players && team.players.length > 0 ? (
                      <>
                        <div className="divide-y divide-gray-800/60">
                          {[...team.players]
                            .sort((a, b) => b.fantasy_points - a.fantasy_points)
                            .map(player => {
                              const playerIsLive = liveSet.has(player.player_id);
                              const todayPts = player.today_stats?.points;
                              const todayFinished = player.today_stats?.is_completed && !playerIsLive;
                              return (
                                <div
                                  key={player.player_id}
                                  className="flex items-center gap-3 px-4 py-2.5"
                                  style={{ opacity: player.is_eliminated ? 0.4 : 1 }}
                                >
                                  {/* Status dot */}
                                  <div className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: player.is_eliminated ? '#6b7280' : playerIsLive ? '#34d399' : '#378ADD' }} />

                                  {/* Player info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`font-medium text-sm ${player.is_eliminated ? 'line-through text-gray-500' : 'text-white'}`}>
                                        {player.name}
                                      </span>
                                      {player.is_eliminated && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                          style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                                          ELIM
                                        </span>
                                      )}
                                      {playerIsLive && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                                          style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}>
                                          ● LIVE{todayPts != null ? ` ${todayPts}` : ''}
                                        </span>
                                      )}
                                      {todayFinished && todayPts != null && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                          style={{ background: '#1f2937', border: '1px solid #374151', color: '#9ca3af' }}>
                                          Final: {todayPts}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-gray-500 text-[10px] mt-0.5">
                                      {player.team}{player.position ? ` · ${player.position}` : ''}
                                    </div>
                                  </div>

                                  {/* Points */}
                                  <div className="text-right flex-shrink-0">
                                    <div className="font-bold text-sm" style={{ color: player.fantasy_points > 0 ? '#378ADD' : '#6b7280' }}>
                                      {player.fantasy_points}
                                    </div>
                                    <div className="text-gray-600 text-[9px]">pts</div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800">
                          <span className="text-gray-500 text-xs">Total</span>
                          <span className="font-bold text-brand-400">{team.total_points} pts</span>
                        </div>
                      </>
                    ) : (
                      <div className="px-4 py-5 text-center text-gray-600 text-sm">
                        No player data yet — check back once the tournament begins.
                      </div>
                    )}
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
