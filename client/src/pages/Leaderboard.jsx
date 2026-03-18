import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import TeamAvatar from '../components/TeamAvatar';
import { useDocTitle } from '../hooks/useDocTitle';
import BallLoader from '../components/BallLoader';
import { teamEmoji, teamColor, playerAvatarStyle } from '../teamEmojis';
import LiveGamesBanner from '../components/LiveGamesBanner';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function fmt(n) {
  if (!n && n !== 0) return '$0';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\.00$/, '');
}

const ETP_GAMES = {
  1: 3.8, 2: 3.0, 3: 2.5, 4: 2.2, 5: 1.8, 6: 1.7, 7: 1.6,
  8: 1.3, 9: 1.2, 10: 1.1, 11: 1.0, 12: 1.0, 13: 1.0, 14: 1.0, 15: 1.0, 16: 1.0,
};
function calcETP(ppg, seed, isFirstFour = false) {
  if (!ppg || !seed) return null;
  const base = ETP_GAMES[parseInt(seed)] ?? 1.0;
  const games = isFirstFour ? base + 0.5 : base;
  return ppg * games;
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

function SgBonusCard({ sgLeader, sgBoard, bonus }) {
  const [expanded, setExpanded] = useState(false);
  if (!bonus || bonus <= 0) return null;

  return (
    <div className="card mb-6 bg-gradient-to-br from-purple-900/20 via-gray-900 to-gray-900 border-purple-500/25 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <span className="text-lg">🎯</span>
        <h3 className="text-white font-bold text-base">Single Game Bonus</h3>
        <span className="text-purple-400 font-bold">{fmt(bonus)}</span>
        <InfoTooltip text="Paid to the owner of the player with the highest single game point total during the tournament. Example: John Tonje scored 37 points vs BYU last March — his owner won the bonus." />
      </div>

      {!sgLeader ? (
        <div className="px-5 pb-5 text-gray-500 text-sm">
          No games played yet — check back once the tournament tips off.
        </div>
      ) : (
        <>
          {/* Leader hero */}
          <div className="px-5 pb-4 border-b border-purple-500/15">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Player name — hero */}
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-white font-black text-2xl leading-tight">{sgLeader.player_name}</span>
                  <span className="text-purple-400 font-black text-2xl">{sgLeader.points} pts</span>
                </div>
                {/* School · round · opponent */}
                <div className="text-gray-400 text-sm mt-1 flex flex-wrap items-center gap-1.5">
                  {sgLeader.player_team && <span className="font-medium text-gray-300">{sgLeader.player_team} <span style={{ fontSize: 16 }}>{teamEmoji(sgLeader.player_team)}</span></span>}
                  {sgLeader.player_team && <span className="text-gray-600">·</span>}
                  {sgLeader.round_name && <span>{sgLeader.round_name}</span>}
                  {sgLeader.round_name && sgLeader.opponent && <span className="text-gray-600">·</span>}
                  {sgLeader.opponent && <span>vs {sgLeader.opponent}</span>}
                </div>
                {/* Owner line */}
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  {sgLeader.owner_user_id ? (
                    <>
                      <span className="text-gray-500 text-xs">Owner:</span>
                      <span className="text-green-400 font-semibold text-sm">{sgLeader.owner_team_name}</span>
                      <span className="text-gray-600 text-xs">@{sgLeader.owner_username}</span>
                      {sgLeader.owner_venmo && (
                        <span className="inline-flex items-center gap-1">
                          <VenmoBadge /><span className="text-gray-300 text-xs">{sgLeader.owner_venmo}</span>
                        </span>
                      )}
                      <span className="text-gray-600 text-xs">← send {fmt(bonus)} here</span>
                    </>
                  ) : (
                    <span className="text-xs bg-gray-800 border border-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
                      Not drafted — no bonus awarded yet
                    </span>
                  )}
                </div>
              </div>
              <span className="text-4xl select-none shrink-0">👑</span>
            </div>
          </div>

          {/* Expandable full leaderboard */}
          {sgBoard && sgBoard.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 transition-colors"
              >
                <span>{expanded ? 'Hide' : 'Show all top scores'}</span>
                <svg className="w-3.5 h-3.5 transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expanded && (
                <div className="divide-y divide-gray-800/60 border-t border-gray-800/60">
                  {sgBoard.map((row, i) => (
                    <div key={`${row.player_id}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="text-gray-600 text-xs font-bold w-5 shrink-0 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`font-bold text-sm ${i === 0 ? 'text-white' : 'text-gray-300'}`}>{row.player_name}</span>
                          <span className="text-gray-500 text-xs">{row.player_team} <span style={{ fontSize: 16 }}>{teamEmoji(row.player_team)}</span></span>
                          {row.round_name && <span className="text-gray-600 text-xs">· {row.round_name}</span>}
                        </div>
                        {row.owner_user_id ? (
                          <div className="text-gray-500 text-xs mt-0.5">
                            {row.owner_team_name} <span className="text-gray-700">@{row.owner_username}</span>
                          </div>
                        ) : (
                          <div className="text-gray-700 text-xs mt-0.5">Undrafted</div>
                        )}
                      </div>
                      <span className={`font-black text-sm shrink-0 ${i === 0 ? 'text-purple-400' : 'text-gray-400'}`}>
                        {row.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Payment badges ──────────────────────────────────────────────────────────────

const VenmoBadge = () => (
  <span style={{ background: '#008CFF', color: '#fff', fontWeight: 700, fontSize: 10, borderRadius: 20, padding: '2px 7px', lineHeight: 1.4, whiteSpace: 'nowrap' }}>Venmo</span>
);
const ZelleBadge = () => (
  <span style={{ background: '#6D1ED4', color: '#fff', fontWeight: 700, fontSize: 10, borderRadius: 20, padding: '2px 7px', lineHeight: 1.4, whiteSpace: 'nowrap' }}>Zelle</span>
);

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

const ROUND_ORDER = ['First Four', 'R64', 'R32', 'S16', 'E8', 'F4', 'NCG'];
const ROUND_SHORT = { 'First Four': 'FF', R64: 'R64', R32: 'R32', S16: 'S16', E8: 'E8', F4: 'F4', NCG: 'NCG' };

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
  const [sgBoard, setSgBoard] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [livePlayerIds, setLivePlayerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [secondsSince, setSecondsSince] = useState(null);
  const [sortBy, setSortBy] = useState('points');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
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
    const rows = data.standings || [];
    if (rows.length > 0) {
      console.log('[Leaderboard] first team:', rows[0]);
    }
    setStandings(rows);
    setSettings(data.settings || null);
    setSgLeader(data.sgLeader || null);
    setSgBoard(data.sgBoard || []);
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

      {/* Live game banner */}
      {league?.status === 'active' && (
        <LiveGamesBanner leagueId={leagueId} />
      )}

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
                <span className="text-gray-600 text-xs hidden sm:inline">highest single-game scorer</span>
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
      <SgBonusCard sgLeader={sgLeader} sgBoard={sgBoard} bonus={bonus} />

      {standings.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">📊</div>
          <p>No standings yet. Stats will appear here once games are played.</p>
        </div>
      ) : (() => {
        const handleSort = (col) => {
          if (sortBy === col) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc');
          } else {
            setSortBy(col);
            setSortDir(col === 'name' ? 'asc' : 'desc');
          }
        };

        const sortedStandings = [...standings].sort((a, b) => {
          let cmp = 0;
          if (sortBy === 'points') {
            cmp = a.total_points - b.total_points;
          } else if (sortBy === 'etp') {
            const etpA = a.players?.filter(p => !p.is_eliminated).reduce((s, p) => s + (calcETP(p.season_ppg, p.seed, p.is_first_four) ?? 0), 0) ?? 0;
            const etpB = b.players?.filter(p => !p.is_eliminated).reduce((s, p) => s + (calcETP(p.season_ppg, p.seed, p.is_first_four) ?? 0), 0) ?? 0;
            cmp = etpA - etpB;
          } else if (sortBy === 'name') {
            cmp = a.team_name.localeCompare(b.team_name);
          } else if (sortBy === 'alive') {
            const aliveA = a.players?.filter(p => !p.is_eliminated).length ?? 0;
            const aliveB = b.players?.filter(p => !p.is_eliminated).length ?? 0;
            cmp = aliveA - aliveB;
          }
          return sortDir === 'desc' ? -cmp : cmp;
        });

        const ColHdr = ({ col, label }) => {
          const active = sortBy === col;
          const arrow = active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
          return (
            <span
              onClick={() => handleSort(col)}
              className={`cursor-pointer select-none text-xs font-semibold uppercase tracking-wider transition-colors ${
                active ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}{arrow}
            </span>
          );
        };

        return (
        <>
          {/* Column header bar */}
          <div className="flex items-center justify-between px-4 py-2.5 mb-3 rounded-xl bg-gray-900 border border-gray-800">
            <ColHdr col="name"   label="Team" />
            <div className="flex items-center gap-5">
              <ColHdr col="etp"    label="Proj. ETP" />
              <ColHdr col="alive"  label="Alive" />
              <ColHdr col="points" label="Pts" />
            </div>
          </div>
          <div key={`${sortBy}-${sortDir}`} className="space-y-3 animate-sort">
          {sortedStandings.map((team, i) => {
            const isMe = team.user_id === user?.id;
            const isLast = i === sortedStandings.length - 1 && sortedStandings.length > 1;
            const ptsColor = isMe ? '#378ADD'
              : i === 0 ? '#facc15'
              : i === 1 ? '#d1d5db'
              : i === 2 ? '#f97316'
              : '#ffffff';
            // Use server-computed counts (reliable even pre-tournament / no scoring settings)
            const totalPlayers = team.totalPlayers ?? (team.players ? team.players.length : 0);
            const aliveCount = team.aliveCount ?? (team.players ? team.players.filter(p => !p.is_eliminated).length : 0);
            const alivePlayers = team.players?.filter(p => !p.is_eliminated) ?? [];
            const projETP = team.players
              ? alivePlayers.reduce((s, p) => s + (calcETP(p.season_ppg, p.seed, p.is_first_four) ?? 0), 0)
              : null;
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
                          <span className="inline-flex items-center gap-1">
                            <VenmoBadge /><span className="text-gray-400 text-[10px]">{team.venmo_handle}</span>
                          </span>
                        )}
                        {team.zelle_handle && (
                          <span className="inline-flex items-center gap-1">
                            <ZelleBadge /><span className="text-gray-400 text-[10px]">{team.zelle_handle}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: proj etp + alive pill + points + chevron */}
                    <div className="flex items-center gap-2.5 flex-shrink-0">
                      {projETP !== null && projETP > 0 && (
                        <div className="text-right hidden sm:block">
                          <div className="text-amber-400 font-bold text-sm">{projETP.toFixed(1)}</div>
                          <div className="text-gray-600 text-[9px]">Proj. ETP</div>
                        </div>
                      )}
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
                        <div className="font-black leading-tight" style={{ fontSize: 22, color: ptsColor }}>{team.total_points > 0 ? team.total_points : '—'}</div>
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
                      <div className="divide-y divide-gray-800/40">
                        {[...team.players]
                          .sort((a, b) => b.fantasy_points - a.fantasy_points)
                          .map(player => {
                            const playerIsLive = liveSet.has(player.player_id);
                            const expandKey = `${team.user_id}-${player.player_id}`;
                            const isPlayerExpanded = expandedPlayerId === expandKey;
                            const gameLog = player.game_log || [];
                            const playedRoundSet = new Set(gameLog.map(g => g.round_code));
                            const lastPlayedRound = gameLog.length > 0 ? gameLog[gameLog.length - 1].round_code : null;
                            const hasFirstFour = playedRoundSet.has('First Four');
                            const shownRounds = hasFirstFour ? ROUND_ORDER : ROUND_ORDER.slice(1);
                            const getPillColors = (r) => {
                              if (!playedRoundSet.has(r)) return { bg: 'transparent', color: '#4b5563', border: '#374151' };
                              if (player.is_eliminated && r === lastPlayedRound) return { bg: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'rgba(239,68,68,0.3)' };
                              return { bg: 'rgba(55,138,221,0.2)', color: '#60a5fa', border: 'rgba(55,138,221,0.35)' };
                            };
                            const hasPlayed = player.fantasy_points > 0 || playerIsLive || !!player.is_eliminated;
                            const dotColor = !hasPlayed ? null : player.is_eliminated ? '#ef4444' : '#34d399';
                            const av = playerAvatarStyle(player.name, player.team);

                            return (
                              <div key={player.player_id}>
                                {/* Clickable row */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedPlayerId(prev => prev === expandKey ? null : expandKey)}
                                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
                                  style={{ opacity: player.is_eliminated ? 0.7 : 1 }}
                                >
                                  {/* Player avatar */}
                                  <div className="relative flex-shrink-0">
                                    <div style={{
                                      width: 28, height: 28, borderRadius: '50%',
                                      background: av.bg,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontWeight: 700, fontSize: 10, color: av.textColor,
                                      flexShrink: 0,
                                    }}>
                                      {av.initials}
                                    </div>
                                    {dotColor && (
                                      <div style={{
                                        position: 'absolute', bottom: 0, right: 0,
                                        width: 7, height: 7, borderRadius: '50%',
                                        backgroundColor: dotColor,
                                        border: '1.5px solid #111827',
                                      }} />
                                    )}
                                  </div>

                                  {/* Name + team */}
                                  <div className="flex-1 min-w-0">
                                    <div className={`font-medium text-sm leading-tight ${player.is_eliminated ? 'line-through text-gray-500' : 'text-white'}`}>
                                      {player.name}
                                      {playerIsLive && <span className="ml-1.5 text-[9px] font-bold text-green-400 animate-pulse not-italic">● LIVE</span>}
                                    </div>
                                    <div className="text-gray-500 text-[10px] mt-0.5">
                                      <span style={{ color: teamColor(player.team) || '#6b7280' }}>{player.team}</span>{' '}
                                      <span style={{ fontSize: 12 }}>{teamEmoji(player.team)}</span>{player.position ? ` · ${player.position}` : ''}
                                    </div>
                                  </div>

                                  {/* Round pills */}
                                  <div className="flex items-center gap-0.5 flex-shrink-0">
                                    {shownRounds.map(r => {
                                      const c = getPillColors(r);
                                      return (
                                        <span key={r} className="text-[9px] font-bold px-1 py-0.5 rounded leading-none"
                                          style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                                          {ROUND_SHORT[r]}
                                        </span>
                                      );
                                    })}
                                  </div>

                                  {/* Points */}
                                  <div className="font-bold text-sm flex-shrink-0 w-7 text-right"
                                    style={{ color: player.fantasy_points > 0 ? '#378ADD' : '#4b5563' }}>
                                    {player.fantasy_points > 0 ? player.fantasy_points : '—'}
                                  </div>

                                  {/* Chevron */}
                                  <svg className="w-3 h-3 text-gray-600 flex-shrink-0 transition-transform duration-200"
                                    style={{ transform: isPlayerExpanded ? 'rotate(180deg)' : 'none' }}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>

                                {/* Slide-down game log */}
                                <div style={{ maxHeight: isPlayerExpanded ? '350px' : '0', overflow: 'hidden', transition: 'max-height 0.25s ease-out' }}>
                                  <div className="bg-gray-950/60 border-t border-gray-800/50 px-4 py-2">
                                    {gameLog.length === 0 ? (
                                      <div className="text-gray-600 text-xs italic py-1">No games played yet</div>
                                    ) : (
                                      <div>
                                        {gameLog.map((game, idx) => {
                                          const isElimGame = !!player.is_eliminated && idx === gameLog.length - 1;
                                          return (
                                            <div key={idx} className="flex items-center gap-3 py-1.5">
                                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                                style={isElimGame
                                                  ? { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                                                  : { background: 'rgba(55,138,221,0.12)', color: '#60a5fa', border: '1px solid rgba(55,138,221,0.25)' }}>
                                                {game.round_code || '—'}
                                              </span>
                                              <span className="text-gray-400 text-xs flex-1 truncate">vs {game.opponent || '—'}</span>
                                              <span className="text-xs font-semibold shrink-0"
                                                style={{ color: game.points > 0 ? '#60a5fa' : '#6b7280' }}>
                                                {game.points > 0 ? `${game.points} pts` : '0 pts'}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Upcoming rounds */}
                                    {!player.is_eliminated && (() => {
                                      const upcoming = shownRounds.filter(r => !playedRoundSet.has(r));
                                      if (!upcoming.length) return null;
                                      return (
                                        <div className="border-t border-gray-800/40 mt-1 pt-1">
                                          {upcoming.map(r => (
                                            <div key={r} className="flex items-center gap-3 py-1.5 opacity-35">
                                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                                style={{ background: '#1f2937', color: '#6b7280', border: '1px solid #374151' }}>
                                                {ROUND_SHORT[r]}
                                              </span>
                                              <span className="text-gray-600 text-xs flex-1">upcoming</span>
                                              <span className="text-gray-600 text-xs">—</span>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}

                                    {player.is_eliminated && (
                                      <div className="mt-1.5 pt-1.5 border-t border-red-900/30 text-xs" style={{ color: '#f87171' }}>
                                        Eliminated — tournament over
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                        {/* Team total footer */}
                        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800">
                          <span className="text-gray-500 text-xs">Total</span>
                          <span className="font-bold text-brand-400">{team.total_points > 0 ? team.total_points : '—'} pts</span>
                        </div>
                      </div>
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
        </>
        );
      })()}

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
