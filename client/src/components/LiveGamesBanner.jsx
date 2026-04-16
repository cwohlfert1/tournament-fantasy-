import { useState, useEffect } from 'react';
import api from '../api';
import { playerAvatarStyle, teamEmoji } from '../teamEmojis';

export default function LiveGamesBanner({ leagueId, onLiveStatus }) {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(() => window.innerWidth >= 768);

  const fetchLive = async () => {
    try {
      const res = await api.get(`/leagues/${leagueId}/live-games`);
      setData(res.data);
      if (onLiveStatus) onLiveStatus(res.data.liveGames?.length > 0);
    } catch {
      // silently fail — banner just stays hidden
    }
  };

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 60_000);
    return () => clearInterval(interval);
  }, [leagueId]); // eslint-disable-line

  if (!data || !data.liveGames || data.liveGames.length === 0) return null;

  const { liveGames, hasLeaguePlayers } = data;

  // STATE 2: games live, but no league players currently playing
  if (!hasLeaguePlayers) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-4 text-sm">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <span className="text-amber-300 font-semibold">Games Live</span>
        <span className="text-gray-400">— no players from your league are currently playing.</span>
      </div>
    );
  }

  // STATE 1: live games with league players
  const gamesWithPlayers = liveGames.filter(g => g.team1_players.length || g.team2_players.length);
  const totalPlayers = gamesWithPlayers.reduce(
    (s, g) => s + g.team1_players.length + g.team2_players.length, 0
  );

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/5 mb-4 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-red-500/5 transition-colors text-left"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
        <span className="text-red-400 font-bold text-sm">Games Live</span>
        <span className="text-gray-400 text-sm">
          {gamesWithPlayers.length} game{gamesWithPlayers.length !== 1 ? 's' : ''} · {totalPlayers} league player{totalPlayers !== 1 ? 's' : ''} active
        </span>
        <svg
          className="w-4 h-4 text-gray-500 ml-auto transition-transform duration-200 shrink-0"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Per-game cards */}
      {expanded && (
        <div className="border-t border-red-500/20 divide-y divide-red-500/10">
          {gamesWithPlayers.map(game => {
            const allPlayers = [
              ...game.team1_players.map(p => ({ ...p, side: 'team1' })),
              ...game.team2_players.map(p => ({ ...p, side: 'team2' })),
            ];

            return (
              <div key={game.id} className="px-4 py-3">
                {/* Scoreboard */}
                <div className="mb-2.5">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-white font-bold">{game.team1}</span>
                    <span className="text-red-400 font-bold text-lg tabular-nums">{game.team1_score ?? 0}</span>
                    <span className="text-gray-600">–</span>
                    <span className="text-red-400 font-bold text-lg tabular-nums">{game.team2_score ?? 0}</span>
                    <span className="text-white font-bold">{game.team2}</span>
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5 flex items-center gap-1.5">
                    {game.current_period && <span>{game.current_period}</span>}
                    {game.game_clock && game.current_period && <span>·</span>}
                    {game.game_clock && <span>{game.game_clock}</span>}
                    {game.round_name && (
                      <>
                        <span className="text-gray-700">·</span>
                        <span className="text-gray-600">{game.round_name}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Players in this game from league */}
                <div className="space-y-1.5">
                  {allPlayers.map(player => {
                    const av = playerAvatarStyle(player.player_name, player.team);
                    return (
                      <div key={player.player_id} className="flex items-center gap-2">
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: av.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 8, color: av.textColor, flexShrink: 0,
                        }}>
                          {av.initials}
                        </div>
                        <span className="text-gray-200 text-xs font-medium leading-tight">{player.player_name}{player.jersey_number ? <span className="text-gray-600 font-normal text-[10px] ml-1.5">· #{player.jersey_number}</span> : null}</span>
                        <span className="text-gray-600 text-[10px]">{player.team} {teamEmoji(player.team)}</span>
                        <span className="text-gray-500 text-[10px] ml-auto whitespace-nowrap">
                          {player.owner_team_name}
                          <span className="text-gray-700"> @{player.owner_username}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
