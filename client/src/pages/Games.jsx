import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../api';
import { useDocTitle } from '../hooks/useDocTitle';
import BallLoader from '../components/BallLoader';
import { teamEmoji } from '../teamEmojis';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTipOff(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' ET';
  } catch { return null; }
}

function formatDate(dateStr) {
  if (!dateStr) return 'TBD';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch { return dateStr; }
}

function groupByDate(games) {
  const map = {};
  for (const g of games) {
    const key = g.game_date || 'TBD';
    if (!map[key]) map[key] = [];
    map[key].push(g);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

const NETWORK_COLORS = {
  CBS:    'bg-blue-900/40 text-blue-300 border-blue-700/40',
  TNT:    'bg-purple-900/40 text-purple-300 border-purple-700/40',
  TBS:    'bg-cyan-900/40 text-cyan-300 border-cyan-700/40',
  TruTV:  'bg-orange-900/40 text-orange-300 border-orange-700/40',
  ESPN:   'bg-red-900/40 text-red-300 border-red-700/40',
  ESPN2:  'bg-red-900/30 text-red-400 border-red-700/30',
};

function NetworkBadge({ network }) {
  if (!network) return null;
  const nets = network.split(',').map(n => n.trim()).filter(Boolean);
  return (
    <div className="flex gap-1 flex-wrap">
      {nets.map(n => {
        const key = Object.keys(NETWORK_COLORS).find(k => n.toUpperCase().includes(k.toUpperCase()));
        const cls = key ? NETWORK_COLORS[key] : 'bg-gray-800 text-gray-400 border-gray-700';
        return (
          <span key={n} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${cls}`}>
            {n}
          </span>
        );
      })}
    </div>
  );
}

const ROUND_ORDER = [
  'First Round', 'Second Round', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship',
];

function RoundBadge({ round }) {
  if (!round) return null;
  const isBig = round === 'Final Four' || round === 'Championship';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
      isBig
        ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
        : 'bg-gray-800 border-gray-700 text-gray-500'
    }`}>{round}</span>
  );
}

// ── Game card ─────────────────────────────────────────────────────────────────

function GameCard({ game, myDraftedPlayerIds }) {
  const isLive = !!game.is_live;
  const isFinal = !!game.is_completed;
  const isUpcoming = !isLive && !isFinal;

  const score1 = game.team1_score ?? null;
  const score2 = game.team2_score ?? null;
  const winner = game.winner_team;

  const myPlayers = game.my_players || [];
  const myFantasyPts = myPlayers.reduce((sum, p) => sum + (p.points || 0), 0);

  const tipOff = formatTipOff(game.tip_off_time);

  return (
    <div className={`card p-4 transition-all duration-300 ${
      isLive ? 'border-green-500/30 bg-green-950/10' : ''
    }`}>
      <div className="flex flex-col gap-3">
        {/* Top row: round + region + network + live badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <RoundBadge round={game.round_name} />
          {game.region && (
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">{game.region}</span>
          )}
          <NetworkBadge network={game.tv_network} />
          {isLive && (
            <span className="ml-auto inline-flex items-center gap-1.5 bg-green-900/40 border border-green-500/40 text-green-400 text-xs font-bold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
              {game.current_period && ` · ${game.current_period}`}
              {game.game_clock && ` · ${game.game_clock}`}
            </span>
          )}
          {isFinal && !isLive && (
            <span className="ml-auto text-xs text-gray-500 font-medium">Final</span>
          )}
        </div>

        {/* Teams + scores */}
        <div className="space-y-2">
          {/* Team 1 */}
          <div className={`flex items-center justify-between gap-2 ${
            isFinal && winner && winner !== game.team1 ? 'opacity-50' : ''
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {game.team1_seed && (
                <span className="w-5 h-5 flex-shrink-0 text-center text-[10px] font-bold text-gray-500 bg-gray-800 rounded">{game.team1_seed}</span>
              )}
              <span className={`font-semibold text-sm truncate ${
                isFinal && winner === game.team1 ? 'text-green-400' : 'text-white'
              }`}>{game.team1}</span>
              {isFinal && winner === game.team1 && (
                <span className="text-green-400 text-xs">✓</span>
              )}
            </div>
            {(isLive || isFinal) && score1 !== null && (
              <span className={`font-black text-xl tabular-nums ${
                isFinal && winner === game.team1 ? 'text-green-400' : 'text-white'
              }`}>{score1}</span>
            )}
          </div>

          {/* Team 2 */}
          <div className={`flex items-center justify-between gap-2 ${
            isFinal && winner && winner !== game.team2 ? 'opacity-50' : ''
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              {game.team2_seed && (
                <span className="w-5 h-5 flex-shrink-0 text-center text-[10px] font-bold text-gray-500 bg-gray-800 rounded">{game.team2_seed}</span>
              )}
              <span className={`font-semibold text-sm truncate ${
                isFinal && winner === game.team2 ? 'text-green-400' : 'text-white'
              }`}>{game.team2}</span>
              {isFinal && winner === game.team2 && (
                <span className="text-green-400 text-xs">✓</span>
              )}
            </div>
            {(isLive || isFinal) && score2 !== null && (
              <span className={`font-black text-xl tabular-nums ${
                isFinal && winner === game.team2 ? 'text-green-400' : 'text-white'
              }`}>{score2}</span>
            )}
          </div>
        </div>

        {/* Odds row — upcoming games only */}
        {isUpcoming && (game.spread || game.overUnder != null) && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span>📊</span>
            {game.spread && <span>{game.spread}</span>}
            {game.spread && game.overUnder != null && <span className="text-gray-700">|</span>}
            {game.overUnder != null && <span>O/U {game.overUnder}</span>}
          </div>
        )}

        {/* Bottom row: tip-off + location */}
        {isUpcoming && (
          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 pt-1 border-t border-gray-800/60">
            {tipOff && <span>🕐 {tipOff}</span>}
            {game.location && <span>📍 {game.location}</span>}
          </div>
        )}
        {(isLive || isFinal) && game.location && (
          <div className="text-xs text-gray-600 pt-0.5">📍 {game.location}</div>
        )}

        {/* Your players in this game */}
        {myPlayers.length > 0 && (
          <div className="pt-2 border-t border-gray-800/60">
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-[10px] text-brand-400 font-bold uppercase tracking-wider flex-shrink-0 mt-0.5">Your Players:</span>
              <div className="flex flex-wrap gap-1">
                {myPlayers.map(p => (
                  <span
                    key={p.player_id}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${
                      isLive
                        ? 'bg-green-900/30 border-green-700/40 text-green-300'
                        : 'bg-gray-800 border-gray-700 text-gray-300'
                    }`}
                  >
                    {isLive && <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />}
                    {p.player_name}
                    {p.points !== null && p.points > 0 && (
                      <span className={`font-bold ml-0.5 ${isLive ? 'text-green-400' : 'text-brand-400'}`}>
                        {p.points} pts
                      </span>
                    )}
                  </span>
                ))}
              </div>
              {(isLive || isFinal) && myFantasyPts > 0 && (
                <span className="text-xs text-brand-400 font-bold ml-auto">
                  +{myFantasyPts} fantasy pts
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Games() {
  useDocTitle('Tournament Games | TourneyRun');
  const [games, setGames] = useState([]);
  const [myDraftedPlayerIds, setMyDraftedPlayerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeDate, setActiveDate] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [hasLive, setHasLive] = useState(false);

  const applyGames = useCallback((newGames) => {
    setGames(newGames);
    setHasLive(newGames.some(g => g.is_live));
    setUpdatedAt(new Date());
  }, []);

  // Initial REST fetch
  useEffect(() => {
    api.get('/games/schedule')
      .then(res => {
        applyGames(res.data.games || []);
        setMyDraftedPlayerIds(res.data.myDraftedPlayerIds || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [applyGames]);

  // Socket.io live updates
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      socket.emit('join_games_feed');
    });

    socket.on('games_update', ({ games: newGames }) => {
      // Merge server game data with user's my_players (keep existing my_players from REST)
      setGames(prev => {
        const prevMap = {};
        for (const g of prev) prevMap[g.id] = g;
        return newGames.map(g => ({
          ...g,
          my_players: prevMap[g.id]?.my_players || [],
        }));
      });
      setHasLive(newGames.some(g => g.is_live));
      setUpdatedAt(new Date());
    });

    return () => socket.disconnect();
  }, []);

  const grouped = groupByDate(games);

  // Auto-select today's date or first date with games
  useEffect(() => {
    if (!grouped.length || activeDate) return;
    const today = new Date().toISOString().slice(0, 10);
    const todayGroup = grouped.find(([d]) => d === today);
    setActiveDate(todayGroup ? today : grouped[0]?.[0]);
  }, [grouped.length]);

  if (loading) return <BallLoader />;

  const activeDayGames = grouped.find(([d]) => d === activeDate)?.[1] || [];

  // Sort active day games: live first, then upcoming by tip-off, then final
  const sortedDayGames = [...activeDayGames].sort((a, b) => {
    const rank = g => g.is_live ? 0 : (!g.is_completed ? 1 : 2);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.tip_off_time || '').localeCompare(b.tip_off_time || '');
  });

  const liveCount = sortedDayGames.filter(g => g.is_live).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">🏀 Tournament Games</h1>
            {hasLive && (
              <span className="inline-flex items-center gap-1.5 bg-green-900/30 border border-green-500/40 text-green-400 text-xs font-bold px-2.5 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                {liveCount} LIVE
              </span>
            )}
          </div>
          {updatedAt && (
            <p className="text-gray-500 text-xs mt-1">
              Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      {games.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">📅</div>
          <p>No games scheduled yet. Check back when the tournament bracket is set.</p>
        </div>
      ) : (
        <>
          {/* Day tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {grouped.map(([date, dayGames]) => {
              const liveInDay = dayGames.some(g => g.is_live);
              const isActive = activeDate === date;
              return (
                <button
                  key={date}
                  onClick={() => setActiveDate(date)}
                  className={`relative flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {date === 'TBD' ? 'TBD' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {liveInDay && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse border-2 border-gray-950" />
                  )}
                  <span className="ml-1.5 text-xs opacity-60">{dayGames.length}</span>
                </button>
              );
            })}
          </div>

          {/* Date header */}
          {activeDate && activeDate !== 'TBD' && (
            <h2 className="text-gray-400 font-semibold text-sm uppercase tracking-wider mb-4">
              {formatDate(activeDate)}
            </h2>
          )}

          {/* Game cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sortedDayGames.map(game => (
              <GameCard
                key={game.id}
                game={game}
                myDraftedPlayerIds={myDraftedPlayerIds}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
