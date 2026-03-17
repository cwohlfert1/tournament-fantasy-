import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import socket from '../socket';
import TeamAvatar from '../components/TeamAvatar';
import { useDocTitle } from '../hooks/useDocTitle';
import BallLoader from '../components/BallLoader';
import { teamEmoji, teamColor, playerAvatarStyle } from '../utils/teamBranding';

// ─── Position styling (complete Tailwind strings — no dynamic construction) ──

const POS_STYLES = {
  G:  { badge: 'bg-blue-500/20 text-blue-400 border border-blue-500/40',    dot: 'bg-blue-400',   cell: 'bg-blue-500/10 border-blue-500/30 text-blue-300'    },
  PG: { badge: 'bg-blue-500/20 text-blue-400 border border-blue-500/40',    dot: 'bg-blue-400',   cell: 'bg-blue-500/10 border-blue-500/30 text-blue-300'    },
  SG: { badge: 'bg-blue-500/20 text-blue-400 border border-blue-500/40',    dot: 'bg-blue-400',   cell: 'bg-blue-500/10 border-blue-500/30 text-blue-300'    },
  F:  { badge: 'bg-green-500/20 text-green-400 border border-green-500/40', dot: 'bg-green-400',  cell: 'bg-green-500/10 border-green-500/30 text-green-300' },
  SF: { badge: 'bg-green-500/20 text-green-400 border border-green-500/40', dot: 'bg-green-400',  cell: 'bg-green-500/10 border-green-500/30 text-green-300' },
  PF: { badge: 'bg-green-500/20 text-green-400 border border-green-500/40', dot: 'bg-green-400',  cell: 'bg-green-500/10 border-green-500/30 text-green-300' },
  C:  { badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/40', dot: 'bg-orange-400', cell: 'bg-orange-500/10 border-orange-500/30 text-orange-300' },
};
const FALLBACK_STYLE = { badge: 'bg-gray-700 text-gray-400 border border-gray-600', dot: 'bg-gray-500', cell: 'bg-gray-800 border-gray-700 text-gray-400' };

function ps(pos) { return POS_STYLES[pos] || FALLBACK_STYLE; }

// ─── Region styling ───────────────────────────────────────────────────────────

const REGION_STYLES = {
  South:   { badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',  btn: 'bg-orange-500 text-white', dim: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  East:    { badge: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',         btn: 'bg-blue-500 text-white',   dim: 'bg-blue-500/15 text-blue-400 border-blue-500/25'       },
  West:    { badge: 'bg-green-500/20 text-green-400 border border-green-500/30',      btn: 'bg-green-600 text-white',  dim: 'bg-green-500/15 text-green-400 border-green-500/25'    },
  Midwest: { badge: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',   btn: 'bg-purple-600 text-white', dim: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
};
const REGION_FALLBACK = { badge: 'bg-gray-700 text-gray-400 border border-gray-600', btn: 'bg-gray-600 text-white', dim: 'bg-gray-700 text-gray-400 border-gray-600' };
function rs(region) { return REGION_STYLES[region] || REGION_FALLBACK; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentPicker(currentPick, numTeams, members) {
  if (!members?.length) return null;
  const round = Math.ceil(currentPick / numTeams);
  const pickInRound = (currentPick - 1) % numTeams;
  const draftPos = round % 2 === 1 ? pickInRound + 1 : numTeams - pickInRound;
  return members.find(m => m.draft_order === draftPos);
}

function r64Opp(seed) {
  return seed >= 1 && seed <= 16 ? 17 - seed : null;
}

// ─── ETP (Expected Tournament Points) ────────────────────────────────────────
// Historical NCAA tournament win probabilities → expected games per seed

const ETP_GAMES = {
  1: 3.8, 2: 3.0, 3: 2.5, 4: 2.2, 5: 1.8, 6: 1.7, 7: 1.6,
  8: 1.3, 9: 1.2, 10: 1.1, 11: 1.0, 12: 1.0, 13: 1.0, 14: 1.0, 15: 1.0, 16: 1.0,
};

function expectedGames(seed, isFirstFour = false) {
  if (!seed) return null;
  const n = parseInt(seed);
  const base = ETP_GAMES[n] ?? 1.0;
  return isFirstFour ? base + 0.5 : base;
}

function calcETP(ppg, seed, isFirstFour = false) {
  const games = expectedGames(seed, isFirstFour);
  if (!games || !ppg) return null;
  return Math.round(ppg * games * 10) / 10;
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

function launchConfetti(scale = 1) {
  try {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const colors = ['#378ADD', '#22C55E', '#F97316', '#A855F7', '#EF4444', '#EAB308', '#EC4899'];
    const pieces = Array.from({ length: Math.floor(55 * scale) }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 80,
      w: Math.random() * 10 + 4, h: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2,
      rot: Math.random() * 360, spin: (Math.random() - 0.5) * 8, opacity: 1,
    }));
    let frame = 0;
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let active = false;
      for (const p of pieces) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.rot += p.spin;
        if (frame > 70) p.opacity = Math.max(0, p.opacity - 0.022);
        if (p.opacity > 0 && p.y < canvas.height + 20) active = true;
        ctx.save(); ctx.globalAlpha = p.opacity; ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180); ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      frame++;
      if (active) requestAnimationFrame(tick); else canvas.remove();
    }
    tick();
  } catch (e) {}
}

// ─── Web Audio ────────────────────────────────────────────────────────────────

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function playTone(freq, dur, type = 'sine', vol = 0.25, delay = 0) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);
  } catch (e) {}
}
function playYourTurnChime() {
  playTone(523, 0.18, 'sine', 0.3, 0.00);
  playTone(659, 0.18, 'sine', 0.3, 0.16);
  playTone(784, 0.30, 'sine', 0.3, 0.32);
}
function playCountdownTick(urgent) {
  playTone(urgent ? 900 : 520, 0.06, 'square', urgent ? 0.18 : 0.08);
}

// ─── Owner accent color (stable hash → one of 10 colors) ─────────────────────

const OWNER_ACCENT_COLORS = [
  '#378ADD', '#22c55e', '#f97316', '#a855f7', '#ec4899',
  '#14b8a6', '#eab308', '#ef4444', '#06b6d4', '#f59e0b',
];
function ownerAccentColor(username) {
  if (!username) return OWNER_ACCENT_COLORS[0];
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return OWNER_ACCENT_COLORS[h % OWNER_ACCENT_COLORS.length];
}

// ─── Player initials avatar ───────────────────────────────────────────────────

function PlayerInitialsAvatar({ name, team, size = 24 }) {
  const { initials, bg, textColor } = playerAvatarStyle(name, team);
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0"
      style={{ width: size, height: size, background: bg, color: textColor, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PosBadge({ pos, small }) {
  const style = ps(pos);
  return (
    <span className={`inline-flex items-center rounded font-bold ${style.badge} ${small ? 'px-1 py-px text-[9px]' : 'px-1.5 py-0.5 text-[10px]'}`}>
      {pos}
    </span>
  );
}

function SeedBadge({ seed }) {
  if (!seed) return null;
  const n = parseInt(seed);
  const cls = n <= 4 ? 'text-yellow-400' : n <= 8 ? 'text-gray-300' : n <= 12 ? 'text-gray-500' : 'text-gray-600';
  return <span className={`font-mono font-bold text-[10px] ${cls}`}>#{seed}</span>;
}

function RegionBadge({ region }) {
  if (!region) return null;
  const style = rs(region);
  return (
    <span className={`inline-flex items-center rounded border px-1 py-px font-bold text-[9px] ${style.badge}`}>
      {region}
    </span>
  );
}

function InjuryBadge({ player, isCommissioner, onClear }) {
  if (!player.injury_flagged) return null;
  const s = (player.injury_status || '').toUpperCase();
  const isRed    = s === 'OUT' || s === 'OUT FOR SEASON';
  const isOrange = s === 'DOUBTFUL' || s === 'NOT EXPECTED TO PLAY';
  const isGreen  = s === 'WILL PLAY' || s === 'EXPECTED TO PLAY';
  // yellow = QUESTIONABLE, DAY-TO-DAY, or anything else

  const colorCls = isRed
    ? 'bg-red-500/20 border-red-500/40 text-red-400'
    : isOrange
      ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
      : isGreen
        ? 'bg-green-500/20 border-green-500/40 text-green-400'
        : 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400';

  const label = isRed ? '🚫 OUT' : isOrange ? '🟠 DOUBT' : isGreen ? '🟢 ETP' : '⚠️ INJ';
  const tip = player.injury_headline || (isRed ? 'Ruled OUT — not expected to play' : 'Injury alert — verify before drafting');

  return (
    <span className={`relative group/inj inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-bold cursor-help border ${colorCls}`}>
      {label}
      <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 w-max max-w-[260px] rounded bg-gray-950 border border-gray-800 px-2 py-1.5 text-[10px] leading-snug text-gray-200 opacity-0 group-hover/inj:opacity-100 transition-opacity duration-150 z-50 text-left shadow-lg whitespace-normal">
        {tip}
      </span>
      {isCommissioner && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClear(player.id); }}
          className={`ml-0.5 pointer-events-auto ${isRed ? 'text-red-600 hover:text-red-300' : 'text-yellow-600 hover:text-yellow-300'}`}
          title="Clear injury flag"
        >✕</button>
      )}
    </span>
  );
}

// Position pill style for the draft board (inline hex colors)
const BOARD_POS_PILL = {
  G:  { background: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' },
  PG: { background: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' },
  SG: { background: '#3b82f622', color: '#60a5fa', border: '1px solid #3b82f644' },
  F:  { background: '#22c55e22', color: '#4ade80', border: '1px solid #22c55e44' },
  SF: { background: '#22c55e22', color: '#4ade80', border: '1px solid #22c55e44' },
  PF: { background: '#22c55e22', color: '#4ade80', border: '1px solid #22c55e44' },
  C:  { background: '#f9731622', color: '#fb923c', border: '1px solid #f9731644' },
};
const BOARD_POS_FALLBACK = { background: '#6b728022', color: '#9ca3af', border: '1px solid #6b728044' };
function boardPosPill(pos) { return BOARD_POS_PILL[pos] || BOARD_POS_FALLBACK; }

// Draft board grid
function DraftBoardGrid({ league, members, picks, currentPick, currentPicker, numTeams, userId, etpByPlayerId = {} }) {
  const rounds = league?.total_rounds || 0;
  const pickMap = {};
  for (const p of picks) {
    if (!pickMap[p.round]) pickMap[p.round] = {};
    pickMap[p.round][p.user_id] = p;
  }
  const currentRound = currentPick && numTeams ? Math.ceil(currentPick / numTeams) : null;

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[10px]" style={{ minWidth: `${members.length * 116 + 48}px` }}>
        <thead>
          <tr>
            <th className="sticky left-0 bg-gray-950 z-10 w-12 pb-2 text-left">
              <span className="text-gray-600 uppercase tracking-wider text-[9px]">Rd</span>
            </th>
            {members.map(m => {
              const accent = ownerAccentColor(m.username);
              return (
                <th key={m.id} className="text-left w-[114px]" style={{ borderTop: `2px solid ${accent}`, padding: '8px 10px' }}>
                  <div className="font-bold truncate text-white" style={{ fontSize: 12 }}>
                    {m.team_name}
                  </div>
                  <div className="truncate text-gray-500" style={{ fontSize: 11 }}>{m.username}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rounds }, (_, ri) => {
            const round = ri + 1;
            const isActive = round === currentRound;
            return (
              <tr key={round} className={isActive ? 'bg-gray-900/50' : ''}>
                <td className="sticky left-0 bg-gray-950 z-10 py-0.5 pr-1 text-gray-600 font-mono">
                  <div className="flex items-center gap-0.5">
                    <span className="w-4">{round}</span>
                    <span className="text-gray-700 text-[8px]">{round % 2 === 1 ? '→' : '←'}</span>
                  </div>
                </td>
                {members.map(m => {
                  const pick = pickMap[round]?.[m.user_id];
                  const isActivePick = isActive && currentPicker?.user_id === m.user_id;
                  const tColor = pick ? teamColor(pick.team) : null;
                  const pillStyle = pick ? boardPosPill(pick.position) : null;
                  return (
                    <td key={m.id} className="px-0.5 py-0.5">
                      {pick ? (
                        <div className="rounded border border-gray-700/50 bg-gray-900/60 flex items-start gap-1.5"
                          style={{ padding: '10px' }}>
                          {/* Avatar */}
                          <PlayerInitialsAvatar name={pick.player_name} team={pick.team} size={26} />
                          {/* Text stack */}
                          <div className="min-w-0 flex-1">
                            <div className="truncate leading-tight text-white" style={{ fontSize: 12, fontWeight: 500 }}>
                              {pick.player_name}
                            </div>
                            <div className="truncate leading-tight" style={{ fontSize: 11, color: tColor || '#6b7280' }}>
                              {pick.team} {teamEmoji(pick.team)}
                            </div>
                            <div className="mt-0.5 inline-flex items-center rounded px-1 py-px leading-none"
                              style={{ fontSize: 9, fontWeight: 700, ...pillStyle }}>
                              {pick.position}{pick.seed ? ` · #${pick.seed}` : ''}
                            </div>
                          </div>
                        </div>
                      ) : isActivePick ? (
                        <div className="rounded border-2 border-brand-500 bg-brand-500/10 flex items-center justify-center animate-pulse" style={{ height: 72 }}>
                          <span className="text-brand-400 font-bold" style={{ fontSize: 9 }}>PICK</span>
                        </div>
                      ) : (
                        <div className="rounded border border-gray-800/40 bg-gray-900/10" style={{ height: 72 }} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Live pick ticker
function PickTicker({ picks, userId }) {
  const recent = [...picks].reverse().slice(0, 6);
  if (!recent.length) {
    return <p className="text-gray-600 text-xs text-center py-4">Picks appear here</p>;
  }
  return (
    <div className="space-y-1">
      {recent.map((pick, i) => {
        const style = ps(pick.position);
        return (
          <div key={pick.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
            i === 0 ? 'bg-gray-800 border border-gray-700' : 'bg-gray-900/40'
          } ${pick.user_id === userId ? 'border-brand-500/40' : ''}`}>
            <span className="text-gray-600 font-mono text-[10px] w-5 shrink-0">#{pick.pick_number}</span>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
            <div className="flex-1 min-w-0">
              <div className={`font-semibold truncate ${pick.user_id === userId ? 'text-brand-400' : 'text-white'}`} style={{ fontSize: 10 }}>
                {pick.player_name}
              </div>
              <div className="truncate" style={{ fontSize: 9, color: pick.team ? (teamColor(pick.team) || '#6b7280') : '#6b7280' }}>
                {pick.team
                  ? `${teamEmoji(pick.team)} ${pick.team}${pick.region ? ` · ${pick.region}` : ''}`
                  : pick.username}
              </div>
            </div>
            <PosBadge pos={pick.position} small />
          </div>
        );
      })}
    </div>
  );
}

// Manager roster card
function ManagerRosterCard({ member, picks, currentPicker, userId, hasSmartDraft }) {
  const myPicks = picks.filter(p => p.user_id === member.user_id);
  const isOnClock = currentPicker?.user_id === member.user_id;
  const isMe = member.user_id === userId;

  return (
    <div className={`rounded-xl border p-2.5 transition-all duration-300 ${
      isOnClock ? 'border-brand-500 bg-brand-500/5 shadow-md shadow-brand-500/10'
        : isMe ? 'border-brand-500/30 bg-brand-500/5'
        : 'border-gray-800 bg-gray-900/30'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <TeamAvatar avatarUrl={member.avatar_url} teamName={member.team_name} size="xs" />
          <div className="min-w-0 flex-1">
          <div className={`font-bold truncate text-[11px] ${isMe ? 'text-brand-400' : 'text-white'}`}>
            {member.team_name}{hasSmartDraft ? ' 🤖' : ''}
          </div>
          <div className="text-gray-600 truncate" style={{ fontSize: 9 }}>{member.username}</div>
          </div>
        </div>
        {isOnClock && (
          <span className="ml-1.5 shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-brand-500 text-white animate-pulse">
            Clock
          </span>
        )}
      </div>
      {myPicks.length > 0 ? (
        <div className="space-y-0.5 max-h-28 overflow-y-auto">
          {myPicks.map(p => (
            <div key={p.id} className="flex items-start gap-1">
              <div className={`w-1 h-1 rounded-full shrink-0 mt-0.5 ${ps(p.position).dot}`} />
              <div className="min-w-0">
                <span className="truncate block font-medium" style={{ fontSize: 9, color: teamColor(p.team) || '#d1d5db' }}>{p.player_name}</span>
                <span className="truncate block" style={{ fontSize: 8, color: teamColor(p.team) || '#6b7280', opacity: 0.75 }}>
                  {teamEmoji(p.team)} {p.team}{p.region ? ` · ${p.region}` : (p.seed ? ` · #${p.seed}` : '')}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-700 text-[9px]">No picks yet</p>
      )}
    </div>
  );
}

// ─── My Roster panel ─────────────────────────────────────────────────────────

function MyRoster({ picks, userId, etpByPlayerId, isMobile = false }) {
  const myPicks = picks.filter(p => p.user_id === userId);

  const totalETP = myPicks.reduce((sum, p) => {
    const v = etpByPlayerId[p.player_id] ?? calcETP(p.season_ppg, p.seed, !!p.is_first_four) ?? 0;
    return sum + (v || 0);
  }, 0);

  if (myPicks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600">
        <div className="text-2xl mb-2">🏀</div>
        <p className="text-sm">No picks yet</p>
      </div>
    );
  }

  return (
    <div className={isMobile ? 'p-3' : ''}>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-gray-500 text-[10px] uppercase tracking-wider">{myPicks.length} players</span>
        <span className="text-brand-400 font-bold text-sm">{totalETP.toFixed(1)} proj. ETP</span>
      </div>
      <div className="space-y-1.5">
        {myPicks.map(p => {
          const etp = etpByPlayerId[p.player_id] ?? calcETP(p.season_ppg, p.seed, !!p.is_first_four);
          const injuryFlagged = p.injury_flagged;
          const isElim = !!p.is_eliminated;
          const tColor = teamColor(p.team);
          return (
            <div key={p.id} className="rounded-lg border border-gray-700/50 bg-gray-900/50 px-2.5 py-2"
              style={{ opacity: isElim ? 0.45 : 1 }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <PlayerInitialsAvatar name={p.player_name} team={p.team} size={28} />
                  <div className="min-w-0">
                    <div className="font-semibold text-xs truncate flex items-center gap-1"
                      style={{ color: isElim ? '#6b7280' : (tColor || '#fff'), textDecoration: isElim ? 'line-through' : 'none' }}>
                      {p.player_name}
                      {injuryFlagged && !isElim ? <span className="text-red-400 text-[9px]">🤕</span> : null}
                    </div>
                    <div className="text-[10px] truncate flex items-center gap-1">
                      <PosBadge pos={p.position} small />
                      <span style={{ color: tColor || '#6b7280', opacity: 0.85 }}>
                        {teamEmoji(p.team)} {p.team}{p.seed ? ` · #${p.seed}` : ''}{p.region ? ` · ${p.region}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-xs" style={{ color: isElim ? '#6b7280' : '#f59e0b' }}>{etp != null ? etp : '—'}</div>
                  <div className="text-gray-600 text-[9px]">ETP · Rd {p.round}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Draft Chat ───────────────────────────────────────────────────────────────

function DraftChat({ leagueId, user, token, members, isMobileFull = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typingUsers, setTypingUsers] = useState({});
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);

  const chatScrollRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingClearRefs = useRef({});

  // Join chat room and wire socket events
  useEffect(() => {
    socket.emit('chat_join', { leagueId, token });

    socket.on('chat_history', history => setMessages(history));

    socket.on('chat_message', msg => {
      setMessages(prev => [...prev, msg].slice(-50));
    });

    socket.on('chat_typing', ({ userId, username }) => {
      setTypingUsers(prev => ({ ...prev, [userId]: username }));
      if (typingClearRefs.current[userId]) clearTimeout(typingClearRefs.current[userId]);
      typingClearRefs.current[userId] = setTimeout(() => {
        setTypingUsers(prev => { const n = { ...prev }; delete n[userId]; return n; });
      }, 3500);
    });

    socket.on('chat_stop_typing', ({ userId }) => {
      if (typingClearRefs.current[userId]) clearTimeout(typingClearRefs.current[userId]);
      setTypingUsers(prev => { const n = { ...prev }; delete n[userId]; return n; });
    });

    return () => {
      socket.off('chat_history');
      socket.off('chat_message');
      socket.off('chat_typing');
      socket.off('chat_stop_typing');
    };
  }, [leagueId, token]);

  // Auto-scroll to bottom within chat container only (never scrolls the page)
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendTyping = () => {
    socket.emit('chat_typing', { leagueId, token });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat_stop_typing', { leagueId, token });
    }, 2000);
  };

  const sendMessage = (text = input, gifUrl = null) => {
    const trimmed = text.trim();
    if (!trimmed && !gifUrl) return;
    socket.emit('chat_send', { leagueId, token, text: trimmed, gifUrl });
    setInput('');
    setShowGifPicker(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('chat_stop_typing', { leagueId, token });
  };

  const loadGifs = async (q) => {
    setGifLoading(true);
    try {
      const endpoint = q.trim()
        ? `/giphy/search?q=${encodeURIComponent(q)}&limit=12`
        : '/giphy/trending?limit=12';
      const res = await api.get(endpoint);
      setGifResults(res.data.results || []);
    } catch (err) {
      console.error('GIF search error', err);
      setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  };

  // Load trending GIFs when picker opens
  useEffect(() => {
    if (showGifPicker && gifResults.length === 0) loadGifs('');
  }, [showGifPicker]);

  const handleGifSearch = (val) => {
    setGifSearch(val);
    if (val.length === 0 || val.length > 1) loadGifs(val);
  };

  const typingNames = Object.values(typingUsers);

  return (
    <div className={`card overflow-hidden flex flex-col ${isMobileFull ? 'flex-1 min-h-0' : ''}`} style={isMobileFull ? {} : { height: 400 }}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-800 shrink-0 flex items-center justify-between">
        <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Chat
        </h3>
        <span className="text-gray-600 text-[10px]">{members.length} teams</span>
      </div>

      {/* Messages */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        {messages.length === 0 && (
          <p className="text-center text-gray-600 text-xs py-4">No messages yet. Say something!</p>
        )}
        {messages.map(msg => {
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="text-center py-0.5">
                <span className="text-[10px] text-brand-400/80 bg-brand-500/10 border border-brand-500/20 px-2.5 py-1 rounded-full">
                  {msg.text}
                </span>
              </div>
            );
          }
          const isMe = msg.userId === user?.id;
          const member = members.find(m => m.user_id === msg.userId);
          return (
            <div key={msg.id} className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              <TeamAvatar
                avatarUrl={member?.avatar_url}
                teamName={msg.teamName || msg.username}
                size="xs"
                className="shrink-0 mb-0.5"
              />
              <div className={`max-w-[78%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                {/* Name above bubble */}
                <span className={`text-[10px] px-1 font-semibold ${isMe ? 'text-brand-400' : 'text-gray-400'}`}>
                  {isMe
                    ? (msg.teamName || 'You')
                    : <>{msg.username} <span className="text-gray-600 font-normal">· {msg.teamName}</span></>
                  }
                </span>
                {msg.gifUrl ? (
                  <div className={`rounded-xl overflow-hidden border border-gray-700 ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
                    <img src={msg.gifUrl} alt="GIF" className="max-w-[160px] max-h-28 object-cover block" />
                  </div>
                ) : (
                  <div className={`px-3 py-1.5 text-xs leading-relaxed break-words ${
                    isMe
                      ? 'bg-brand-500 text-white rounded-2xl rounded-br-sm'
                      : 'bg-gray-800 text-gray-200 rounded-2xl rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                )}
                <span className="text-[9px] text-gray-600 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {typingNames.length > 0 && (
          <div className="flex items-center gap-1.5 pl-1">
            <div className="flex gap-0.5">
              {[0, 150, 300].map(d => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce"
                  style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
            <span className="text-[10px] text-gray-500">
              {typingNames.slice(0, 2).join(', ')}
              {typingNames.length > 2 ? ` +${typingNames.length - 2}` : ''}
              {' '}{typingNames.length === 1 ? 'is' : 'are'} typing
            </span>
          </div>
        )}
      </div>

      {/* GIF picker */}
      {showGifPicker && (
        <div className="border-t border-gray-800 bg-gray-900/90 shrink-0">
          <div className="p-2">
            <input
              type="text"
              className="input text-xs py-1 w-full mb-1.5"
              placeholder="Search GIFs..."
              value={gifSearch}
              onChange={e => handleGifSearch(e.target.value)}
              autoFocus
            />
            {gifLoading ? (
              <div className="text-center text-gray-500 text-xs py-3">Loading...</div>
            ) : gifResults.length === 0 ? (
              <div className="text-center text-gray-600 text-xs py-3">No GIFs found</div>
            ) : (
              <div className="grid grid-cols-3 gap-1 max-h-36 overflow-y-auto">
                {gifResults.map(result => {
                  const url = result.media_formats?.tinygif?.url || result.media_formats?.gif?.url;
                  if (!url) return null;
                  return (
                    <button
                      key={result.id}
                      onClick={() => sendMessage('', url)}
                      className="rounded overflow-hidden hover:opacity-80 transition-opacity focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <img src={url} alt={result.title || 'GIF'} className="w-full h-14 object-cover" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-gray-800 px-2 py-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setShowGifPicker(v => !v); setGifSearch(''); }}
            className={`shrink-0 text-[10px] font-bold px-1.5 py-1 rounded border transition-colors ${
              showGifPicker
                ? 'bg-brand-500/20 text-brand-400 border-brand-500/40'
                : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
            }`}
            title="Send a GIF"
          >
            GIF
          </button>
          <input
            type="text"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-brand-500/50 transition-colors"
            placeholder="Message the league..."
            value={input}
            maxLength={200}
            onChange={e => { setInput(e.target.value); if (e.target.value) sendTyping(); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim()}
            className="shrink-0 w-7 h-7 rounded-full bg-brand-500 disabled:bg-gray-700 flex items-center justify-center text-white disabled:text-gray-500 transition-colors"
            title="Send"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        {input.length > 160 && (
          <div className={`text-right text-[9px] mt-0.5 ${input.length >= 200 ? 'text-red-400' : 'text-gray-500'}`}>
            {input.length}/200
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tip({ text, children }) {
  return (
    <span className="relative group/tip inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[220px] rounded bg-gray-950 border border-gray-800 px-2 py-1.5 text-[10px] leading-snug text-gray-200 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50 text-center whitespace-normal shadow-lg">
        {text}
      </span>
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'etp',  label: 'ETP',  tip: 'Expected Tournament Points — projected total points based on the player\'s PPG and how far their team is expected to go in the tournament' },
  { value: 'ppg',  label: 'PPG',  tip: 'Points Per Game — player\'s scoring average this season' },
  { value: 'seed', label: 'Seed', tip: null },
  { value: 'name', label: 'Name', tip: null },
];

export default function DraftRoom() {
  useDocTitle('🏀 Draft Live | TourneyRun');
  const { id: leagueId } = useParams();
  const { user, token } = useAuth();

  const [state, setState] = useState(null);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('All');
  const [regionFilter, setRegionFilter] = useState('All');
  const [sortBy, setSortBy] = useState('etp');
  const [playerTab, setPlayerTab] = useState('available'); // 'available' | 'queue'
  const [mobilePanel, setMobilePanel] = useState('players'); // 'board' | 'players' | 'queue' | 'myteam' | 'chat'
  const [teamsPanelTab, setTeamsPanelTab] = useState('my'); // 'my' | 'all'
  const [timeLeft, setTimeLeft] = useState(60);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [autoDraftToast, setAutoDraftToast] = useState(null);
  const [draftConfirm, setDraftConfirm] = useState(null); // player to confirm drafting despite injury flag
  const [pickConfirm, setPickConfirm] = useState(null);   // accidental-pick confirmation modal

  // Smart Draft
  const [mySmartDraft, setMySmartDraft]           = useState(false);
  const [smartDraftEnabled, setSmartDraftEnabled] = useState(true);
  const [smartDraftUsers, setSmartDraftUsers]     = useState(new Set());
  const [sdCheckoutLoading, setSdCheckoutLoading] = useState(false);
  const [sdToggleLoading, setSdToggleLoading]     = useState(false);
  const [sdUpsellOpen, setSdUpsellOpen]           = useState(false); // "How it works" expanded
  const mySmartDraftRef = useRef(false);

  // Watchlist stored in localStorage per user per league
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`dq_${leagueId}_${user?.id}`) || '[]'); }
    catch { return []; }
  });

  const timerRef = useRef(null);
  const isMyTurnRef = useRef(false);
  const wasMyTurnRef = useRef(false);
  const pickingRef = useRef(false);
  const availablePlayersRef = useRef([]);
  const watchlistRef = useRef(watchlist);
  // Cache all player data so we can look up seed/ppg even after a player is drafted
  const playerCacheRef = useRef({});

  // Keep refs in sync
  useEffect(() => { availablePlayersRef.current = availablePlayers; }, [availablePlayers]);
  useEffect(() => {
    watchlistRef.current = watchlist;
    localStorage.setItem(`dq_${leagueId}_${user?.id}`, JSON.stringify(watchlist));
  }, [watchlist]);

  const updateWatchlist = useCallback((fn) => {
    setWatchlist(prev => fn(prev));
  }, []);

  const addToQueue = useCallback((playerId) => {
    updateWatchlist(prev => prev.includes(playerId) ? prev : [...prev, playerId]);
  }, [updateWatchlist]);

  const removeFromQueue = useCallback((playerId) => {
    updateWatchlist(prev => prev.filter(id => id !== playerId));
  }, [updateWatchlist]);

  const moveInQueue = useCallback((playerId, dir) => {
    updateWatchlist(prev => {
      const idx = prev.indexOf(playerId);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, [updateWatchlist]);

  const resetTimer = useCallback((limit) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(limit || 60);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const fetchAvailablePlayers = useCallback(async () => {
    try {
      const res = await api.get(`/players/available/${leagueId}`);
      const players = res.data.players;
      // Populate cache
      for (const p of players) playerCacheRef.current[p.id] = p;
      setAvailablePlayers(players);
    } catch (err) { console.error('Failed to fetch players', err); }
  }, [leagueId]);


  // ── Sound: chime on your turn ────────────────────────────────────────────
  useEffect(() => {
    if (!state) return;
    const isMyTurn = !state.draftComplete && state.currentPicker?.user_id === user?.id;
    isMyTurnRef.current = isMyTurn;
    if (isMyTurn && !wasMyTurnRef.current) playYourTurnChime();
    wasMyTurnRef.current = isMyTurn;
  }, [state?.currentPicker?.user_id, state?.draftComplete]);

  // ── Countdown ticks + auto-draft ─────────────────────────────────────────
  useEffect(() => {
    if (timeLeft <= 0) {
      if (isMyTurnRef.current && !pickingRef.current) {
        const available    = availablePlayersRef.current;
        const availableSet = new Set(available.map(p => p.id));

        // Queue-first (queue players can be injured — draft room already warned)
        const queuedId = watchlistRef.current.find(id => availableSet.has(id));

        let targetId   = queuedId || null;
        let fromSmart  = false;

        if (!targetId) {
          // Skip injured players if possible
          const healthy = available.filter(p => !p.injury_flagged);
          const pool    = healthy.length ? healthy : available;

          if (mySmartDraftRef.current) {
            // Client-side smart draft: penalise stacked teams, boost mid-seeds
            // (simplified — full algo runs server-side as authoritative backup)
            const myPickIds = new Set(
              (state?.picks || []).filter(p => p.user_id === user?.id).map(p => p.player_id)
            );
            const myTeams = {};
            for (const pk of (state?.picks || [])) {
              if (pk.user_id === user?.id) {
                const cached = playerCacheRef.current[pk.player_id];
                if (cached?.team) myTeams[cached.team] = (myTeams[cached.team] || 0) + 1;
              }
            }
            targetId = [...pool].sort((a, b) => {
              const score = p => {
                const base = calcETP(p.season_ppg, p.seed, !!p.is_first_four) ?? p.season_ppg ?? 0;
                let s = base;
                if (p.team && (myTeams[p.team] || 0) >= 2) s *= 0.60;
                return s;
              };
              return score(b) - score(a);
            })[0]?.id || null;
            fromSmart = true;
          } else {
            targetId = [...pool].sort((a, b) => {
              const etpA = calcETP(a.season_ppg, a.seed, !!a.is_first_four) ?? a.season_ppg ?? 0;
              const etpB = calcETP(b.season_ppg, b.seed, !!b.is_first_four) ?? b.season_ppg ?? 0;
              return etpB - etpA;
            })[0]?.id || null;
          }
        }

        if (targetId) {
          const picked = playerCacheRef.current[targetId] || available.find(p => p.id === targetId);
          setAutoDraftToast({
            playerName: picked?.name || 'a player',
            fromQueue:  !!queuedId,
            fromSmart:  !queuedId && fromSmart,
          });
          setTimeout(() => setAutoDraftToast(null), 4000);
          pickingRef.current = true;
          setPicking(true);
          socket.emit('make_pick', { leagueId, playerId: targetId, token });
        }
      }
      return;
    }
    if (timeLeft <= 10 && isMyTurnRef.current) playCountdownTick(timeLeft <= 3);
  }, [timeLeft]);

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    try { socket.connect(); } catch (e) { console.error('Socket connect failed', e); }

    socket.emit('join_draft_room', { leagueId, token });

    socket.on('draft_state', (data) => {
      if (!data || !data.league) { setLoading(false); return; }
      setState(data);
      setLoading(false);
      if (data.league?.status === 'drafting' && !data.draftComplete) resetTimer(data.league.pick_time_limit);
    });

    socket.on('draft_started', (data) => {
      if (!data || !data.league) return;
      setState(data);
      setLoading(false);
      resetTimer(data.league?.pick_time_limit);
      fetchAvailablePlayers();
    });

    socket.on('pick_made', (data) => {
      if (!data) return;
      setState(prev => {
        if (!prev) return prev;
        const numTeams = prev.members.length;
        const nextPicker = data.draftComplete ? null : getCurrentPicker(data.currentPick, numTeams, prev.members);
        return {
          ...prev,
          picks: [...prev.picks, data.pick],
          currentPick: data.currentPick,
          currentPicker: nextPicker,
          draftComplete: data.draftComplete,
          league: { ...prev.league, current_pick: data.currentPick },
        };
      });
      // If Smart Draft picked for the current user from the server, show notification
      if (data.pick?.user_id === user?.id && data.pick?.smart_drafted) {
        setAutoDraftToast({ playerName: data.pick.player_name, fromQueue: false, fromSmart: true });
        setTimeout(() => setAutoDraftToast(null), 5000);
      }
      // Confetti — bigger burst for your own pick
      launchConfetti(data.pick?.user_id === user?.id ? 1.4 : 0.5);
      fetchAvailablePlayers();
      if (!data.draftComplete) resetTimer(state?.league?.pick_time_limit || 60);
      else if (timerRef.current) clearInterval(timerRef.current);
      pickingRef.current = false;
      setPicking(false);
    });

    socket.on('draft_completed', (data) => {
      if (!data) return;
      setState(data);
      if (timerRef.current) clearInterval(timerRef.current);
    });

    socket.on('error', (data) => {
      setError(data?.message || 'An error occurred');
      setLoading(false);
      pickingRef.current = false;
      setPicking(false);
      setTimeout(() => setError(''), 4000);
    });

    Promise.all([api.get(`/draft/${leagueId}/state`), fetchAvailablePlayers()])
      .then(([draftRes]) => {
        const data = draftRes.data;
        if (!data || !data.league) { setLoading(false); return; }
        setState(data);
        setLoading(false);
        if (data.league?.status === 'drafting' && !data.draftComplete) resetTimer(data.league.pick_time_limit);
      })
      .catch(() => setLoading(false));

    return () => {
      socket.off('draft_state');
      socket.off('draft_started');
      socket.off('pick_made');
      socket.off('draft_completed');
      socket.off('error');
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [leagueId, token]);

  const makePick = useCallback((playerId) => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    setPicking(true);
    socket.emit('make_pick', { leagueId, playerId, token });
  }, [leagueId, token]);

  // Shows injury warning modal if the player is flagged; otherwise picks immediately
  const requestPick = useCallback((player) => {
    if (!player) return;
    if (player.injury_flagged) {
      setDraftConfirm(player);
    } else {
      makePick(player.id);
    }
  }, [makePick]);  // eslint-disable-line react-hooks/exhaustive-deps

  const clearInjuryFlag = useCallback(async (playerId) => {
    try {
      await api.delete(`/players/${playerId}/injury-flag`);
      // Update available list (shown in Available tab)
      setAvailablePlayers(prev => prev.map(p => p.id === playerId ? { ...p, injury_flagged: 0, injury_headline: '' } : p));
      // Update cache so the Queue tab also reflects the change immediately
      if (playerCacheRef.current[playerId]) {
        playerCacheRef.current[playerId] = { ...playerCacheRef.current[playerId], injury_flagged: 0, injury_headline: '' };
      }
    } catch (err) {
      console.error('Failed to clear injury flag:', err);
    }
  }, []);

  // ── Smart Draft fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!leagueId) return;
    api.get(`/payments/smart-draft/${leagueId}/status`)
      .then(res => {
        setMySmartDraft(res.data.purchased);
        setSmartDraftEnabled(res.data.enabled ?? res.data.purchased);
        mySmartDraftRef.current = res.data.enabled ?? res.data.purchased;
        setSmartDraftUsers(new Set(res.data.purchasedUsers));
      })
      .catch(() => {});
  }, [leagueId]);

  const handleSmartDraftToggle = async () => {
    setSdToggleLoading(true);
    try {
      const res = await api.patch(`/payments/smart-draft/${leagueId}/toggle`);
      const nowEnabled = res.data.enabled;
      setSmartDraftEnabled(nowEnabled);
      mySmartDraftRef.current = nowEnabled;
      // Update the set of smart draft users
      setSmartDraftUsers(prev => {
        const next = new Set(prev);
        if (nowEnabled) next.add(user?.id);
        else next.delete(user?.id);
        return next;
      });
    } catch (err) {
      console.error('Smart Draft toggle failed', err);
    } finally {
      setSdToggleLoading(false);
    }
  };


  const handleSmartDraftCheckout = async () => {
    setSdCheckoutLoading(true);
    try {
      const res = await api.post('/payments/smart-draft-checkout', { leagueId });
      window.location.href = res.data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not start checkout');
      setSdCheckoutLoading(false);
    }
  };

  // ── Memos that must be above early returns (Rules of Hooks) ─────────────

  // Map { region -> { seed -> teamName } } built from all seen players
  const regionSeedMap = useMemo(() => {
    const map = {};
    for (const p of Object.values(playerCacheRef.current)) {
      if (p.region && p.seed) {
        if (!map[p.region]) map[p.region] = {};
        map[p.region][p.seed] = p.team;
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePlayers]);

  // ETP lookup map for draft board cells (keyed by player_id)
  const etpByPlayerId = useMemo(() => {
    const map = {};
    for (const p of Object.values(playerCacheRef.current)) {
      const etp = calcETP(p.season_ppg, p.seed, !!p.is_first_four);
      if (etp !== null) map[p.id] = etp;
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePlayers]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) return <BallLoader fullScreen message="Loading draft room..." />;

  if (!state) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Draft room not available</p>
        <Link to={`/league/${leagueId}`} className="text-brand-400 mt-2 inline-block">Back to league</Link>
      </div>
    );
  }

  const { league, members, picks, currentPick, currentPicker, totalPicks, draftComplete } = state;
  const isMyTurn = !draftComplete && currentPicker?.user_id === user?.id;
  const isCommissioner = league?.commissioner_id === user?.id;
  const numTeams = members.length;
  const timerPercent = Math.round((timeLeft / (league?.pick_time_limit || 60)) * 100);
  const timerColor = timeLeft <= 3 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#378ADD';

  // ── Derived values ────────────────────────────────────────────────────────

  const availableIds = new Set(availablePlayers.map(p => p.id));
  const queuedPlayers = watchlist
    .map(id => playerCacheRef.current[id])
    .filter(p => p && availableIds.has(p.id));

  const POSITIONS = ['All', 'G', 'F', 'C', 'PG', 'SG', 'SF', 'PF'];
  const uniquePositions = ['All', ...new Set(availablePlayers.map(p => p.position))];
  const REGIONS = ['All', 'South', 'East', 'West', 'Midwest'];

  const filteredSorted = availablePlayers
    .filter(p => {
      const matchPos = posFilter === 'All' || p.position === posFilter;
      const matchRegion = regionFilter === 'All' || p.region === regionFilter;
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.team.toLowerCase().includes(search.toLowerCase());
      return matchPos && matchRegion && matchSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'etp') {
        const ea = calcETP(a.season_ppg, a.seed, !!a.is_first_four) ?? -1;
        const eb = calcETP(b.season_ppg, b.seed, !!b.is_first_four) ?? -1;
        return eb - ea;
      }
      if (sortBy === 'seed') return (a.seed || 99) - (b.seed || 99);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.season_ppg - a.season_ppg;
    });

  // Enrich picks with team/region from the player cache (for ticker + roster cards)
  const enrichedPicks = picks.map(p => {
    const cached = playerCacheRef.current[p.player_id];
    return { ...p, team: p.team || cached?.team || '', region: p.region || cached?.region || '' };
  });

  // On mobile, the "Queue" bottom tab forces the queue sub-view in the player panel
  const effectivePlayerTab = mobilePanel === 'queue' ? 'queue' : playerTab;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1600px] mx-auto lg:block lg:h-auto">

      {/* ── Fixed top section (shrinks to natural height; flex child) ── */}
      <div className="px-3 pt-2 lg:px-3 lg:pt-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          🎯 <span className="text-brand-400">{league.name}</span>
          <span className="text-gray-600 font-normal text-sm">— Draft Room</span>
        </h1>
        <Link to={`/league/${leagueId}`} className="text-gray-500 hover:text-white text-sm transition-colors">
          ← Back
        </Link>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-2.5 text-sm mb-3">
          {error}
        </div>
      )}

      {/* ── Auto-draft toast ── */}
      {autoDraftToast && (
        <div className={`border rounded-lg p-2.5 text-sm mb-3 flex items-center gap-2 ${
          autoDraftToast.fromSmart
            ? 'bg-green-900/40 border-green-700/60 text-green-300'
            : 'bg-yellow-900/40 border-yellow-700/60 text-yellow-300'
        }`}>
          <span>{autoDraftToast.fromSmart ? '🤖' : '⚡'}</span>
          <span>
            {autoDraftToast.fromSmart
              ? <>🤖 Smart Draft picked <span className="font-semibold">{autoDraftToast.playerName}</span> for you!</>
              : <>Auto-drafted <span className="font-semibold">{autoDraftToast.playerName}</span>{autoDraftToast.fromQueue ? ' (from your queue)' : ' (highest available ETP)'}</>
            }
          </span>
        </div>
      )}

      {/* ── On the clock bar ── */}
      {!draftComplete && league.status === 'drafting' && (
        <div className={`rounded-xl border-2 p-3 mb-3 transition-colors duration-300 overflow-y-auto max-h-36 lg:max-h-none ${
          isMyTurn ? 'border-brand-500 bg-brand-500/5' : 'border-gray-800 bg-gray-900/40'
        }`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              {/* Timer ring */}
              <div className="relative w-12 h-12 shrink-0">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1f2937" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke={timerColor}
                    strokeWidth="3" strokeDasharray={`${timerPercent} 100`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-bold text-sm"
                  style={{ color: timerColor }}>
                  {timeLeft}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Pick #{currentPick} of {totalPicks}</div>
                {isMyTurn ? (
                  <div className="text-brand-400 font-bold text-base animate-pulse">Your turn to pick!</div>
                ) : (
                  <div className="text-white font-semibold text-sm">
                    On the clock: <span className="text-brand-400">{currentPicker?.team_name}</span>
                    <span className="text-gray-500 text-xs ml-1">({currentPicker?.username})</span>
                  </div>
                )}
                {timeLeft <= 10 && isMyTurn && (
                  <div className={`text-xs font-bold ${timeLeft <= 3 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {timeLeft <= 3 ? '⚠ Pick now or auto-draft fires!' : 'Auto-draft in ' + timeLeft + 's'}
                  </div>
                )}
              </div>
            </div>

            {/* Draft order strip */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 flex-1 min-w-0">
              {members.map(m => (
                <div key={m.id} className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all duration-300 ${
                  m.user_id === currentPicker?.user_id
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30 scale-105'
                    : m.user_id === user?.id
                    ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                    : 'bg-gray-800/60 text-gray-500'
                }`}>
                  <TeamAvatar avatarUrl={m.avatar_url} teamName={m.team_name} size="xs" />
                  <div className="font-bold">{m.draft_order}. {m.team_name}{smartDraftUsers.has(m.user_id) ? ' 🤖' : ''}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Draft complete banner ── */}
      {draftComplete && (
        <div className="card p-6 text-center mb-4 border-green-500/30 bg-green-500/5">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-xl font-bold text-white mb-1">Draft Complete!</h2>
          <p className="text-gray-400 mb-4">All {totalPicks} picks have been made. Good luck!</p>
          <Link to={`/league/${leagueId}/leaderboard`} className="btn-primary px-6 py-2 inline-block">
            View Standings →
          </Link>
        </div>
      )}

      {league.status === 'lobby' && (
        <div className="card p-8 text-center mb-4">
          <div className="text-4xl mb-2">⏳</div>
          <h2 className="text-xl font-bold text-white mb-1">Draft Not Started</h2>
          <p className="text-gray-400">Waiting for the commissioner to start the draft.</p>
          {mySmartDraft && smartDraftEnabled && (
            <div className="mt-4 inline-flex items-center gap-2 bg-green-500/15 border border-green-500/30 text-green-400 px-4 py-2 rounded-full text-sm font-semibold">
              <span>🤖</span>
              Smart Draft Active — we'll pick for you if you miss your turn
            </div>
          )}
        </div>
      )}

      {/* ── Smart Draft status banner (purchased) ── */}
      {mySmartDraft && !draftComplete && league.status === 'drafting' && (
        <div className={`rounded-xl border p-3 mb-3 transition-colors ${
          smartDraftEnabled
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-gray-700/40 bg-gray-800/30'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg shrink-0">🤖</span>
              <div className="min-w-0">
                <div className={`font-semibold text-sm ${smartDraftEnabled ? 'text-green-400' : 'text-gray-400'}`}>
                  Smart Draft {smartDraftEnabled ? 'ON' : 'OFF'}
                </div>
                <div className="text-gray-500 text-xs">
                  {smartDraftEnabled
                    ? "We'll pick for you if your timer runs out"
                    : 'Smart Draft is paused — you must pick manually'}
                </div>
              </div>
            </div>
            <button
              onClick={handleSmartDraftToggle}
              disabled={sdToggleLoading}
              className={`shrink-0 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-60 ${
                smartDraftEnabled
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              {sdToggleLoading ? '…' : smartDraftEnabled ? 'Turn OFF' : 'Turn ON'}
            </button>
          </div>
        </div>
      )}

      {/* ── Smart Draft upsell banner (not purchased) ── */}
      {!mySmartDraft && !draftComplete && league.status === 'drafting' && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 mb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg shrink-0">🤖</span>
              <div className="min-w-0">
                <div className="text-white font-semibold text-sm">Running late? Smart Draft has your back 🏀</div>
                <div className="text-gray-400 text-xs">
                  Our AI picks like a pro if your timer runs out — avoids injuries, balances your roster.{' '}
                  <button
                    onClick={() => setSdUpsellOpen(v => !v)}
                    className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
                  >
                    {sdUpsellOpen ? 'Hide details' : 'How it works'}
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={handleSmartDraftCheckout}
              disabled={sdCheckoutLoading}
              className="shrink-0 bg-brand-500 hover:bg-brand-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
            >
              {sdCheckoutLoading ? 'Loading…' : 'Add Smart Draft — $2.99'}
            </button>
          </div>
          {sdUpsellOpen && (
            <div className="mt-3 pt-3 border-t border-brand-500/20 text-xs text-gray-300 space-y-1">
              <p className="font-semibold text-white mb-1">Smart Draft is an AI-powered algorithm that drafts for you when you can't make it. It automatically:</p>
              <p>✓ Avoids injured players</p>
              <p>✓ Balances your roster across regions and teams</p>
              <p>✓ Targets high ETP players with the best tournament upside</p>
              <p>✓ Fills position needs intelligently</p>
              <p className="text-gray-500 mt-1">Much smarter than just grabbing the highest rated player available.</p>
            </div>
          )}
        </div>
      )}

      </div>{/* end shrink-0 top section */}

      {/* ── Content area: flex-1 on mobile, block on desktop ── */}
      <div className="px-3 mt-3 pb-20 lg:pb-0 lg:overflow-visible lg:px-3 lg:mt-3">

      {/* ── Three-panel layout (desktop) + mobile single-panel view ── */}
      <div className="lg:h-auto lg:grid lg:grid-cols-12 lg:gap-3">

        {/* ── LEFT: Draft Board Grid ── */}
        <div className={`lg:col-span-5 flex flex-col min-h-0 ${mobilePanel !== 'board' ? 'hidden lg:flex' : 'min-h-[65vh]'}`}>
          <div className="card overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-white text-sm">Draft Board</h2>
              <span className="text-xs text-gray-500">{picks.length} / {totalPicks} picks</span>
            </div>
            <div className="p-2 overflow-x-auto overflow-y-auto flex-1 min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              <DraftBoardGrid
                league={league} members={members} picks={picks}
                currentPick={currentPick} currentPicker={currentPicker}
                numTeams={numTeams} userId={user?.id}
                etpByPlayerId={etpByPlayerId}
              />
            </div>
          </div>
        </div>

        {/* ── CENTER: Player Pool ── */}
        <div className={`lg:col-span-4 flex flex-col min-h-0 ${mobilePanel !== 'players' && mobilePanel !== 'queue' ? 'hidden lg:flex' : 'min-h-[65vh]'}`}>
          <div className="card overflow-hidden flex flex-col h-full lg:max-h-[calc(100vh-240px)]">
            {/* Player pool tabs — desktop only (mobile uses bottom nav) */}
            <div className="px-3 pt-3 pb-2 border-b border-gray-800 shrink-0">
              <div className="hidden lg:flex gap-1 mb-2">
                <button onClick={() => setPlayerTab('available')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    playerTab === 'available' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}>
                  Available ({availablePlayers.length})
                </button>
                <button onClick={() => setPlayerTab('queue')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors relative ${
                    playerTab === 'queue' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}>
                  My Queue
                  {queuedPlayers.length > 0 && (
                    <span className="ml-1 bg-yellow-500 text-black text-[9px] font-bold px-1 rounded-full">
                      {queuedPlayers.length}
                    </span>
                  )}
                </button>
              </div>
              {/* Mobile queue header */}
              {mobilePanel === 'queue' && (
                <div className="lg:hidden flex items-center gap-2 mb-2">
                  <span className="text-white font-bold text-sm">My Queue</span>
                  {queuedPlayers.length > 0 && (
                    <span className="bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full">
                      {queuedPlayers.length}
                    </span>
                  )}
                </div>
              )}

              {effectivePlayerTab === 'available' && (
                <>
                  <input type="text" className="input text-xs mb-2 py-1.5"
                    placeholder="Search name or team..." value={search}
                    onChange={e => setSearch(e.target.value)} />
                  <div className="flex items-center gap-1 flex-wrap">
                    {uniquePositions.slice(0, 6).map(pos => (
                      <button key={pos} type="button" onClick={() => setPosFilter(pos)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          posFilter === pos ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}>
                        {pos}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-1">
                      <span
                        className="text-[10px] text-gray-600 cursor-help"
                        title="ETP = Expected Tournament Points — PPG × projected games based on seed. Cooper Flagg: 19.5 PPG × 3.8 games (1-seed) = 74.1 ETP"
                      >Sort <span className="text-gray-700">ⓘ</span></span>
                      {SORT_OPTIONS.map(s => (
                        <button key={s.value} type="button" onClick={() => setSortBy(s.value)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            sortBy === s.value ? 'bg-brand-500/30 text-brand-400' : 'text-gray-500 hover:text-gray-300'
                          }`}>
                          {s.tip ? <Tip text={s.tip}>{s.label}</Tip> : s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Region filters */}
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {REGIONS.map(r => {
                      const active = regionFilter === r;
                      const style = r !== 'All' ? rs(r) : null;
                      return (
                        <button key={r} type="button" onClick={() => setRegionFilter(r)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                            active
                              ? r === 'All'
                                ? 'bg-gray-600 text-white border-gray-500'
                                : `${style.btn} border-transparent`
                              : r === 'All'
                              ? 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                              : `${style.dim} hover:opacity-80`
                          }`}>
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Injury disclaimer */}
            {availablePlayers.some(p => p.injury_flagged) && (
              <div className="px-3 py-1.5 bg-yellow-500/5 border-b border-yellow-500/20 text-yellow-600/80 text-[10px] leading-snug">
                ⚠️ Injury alerts sourced from news — always verify before drafting.
              </div>
            )}

            {/* Player list */}
            <div className="overflow-y-auto flex-1 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              {effectivePlayerTab === 'queue' ? (
                queuedPlayers.length === 0 ? (
                  <div className="text-center py-10 text-gray-600 text-sm">
                    <div className="text-2xl mb-2">📋</div>
                    <p>Your queue is empty.</p>
                    <p className="text-xs mt-1">Star (☆) players in the Available tab to queue them.</p>
                  </div>
                ) : (
                  queuedPlayers.map((player, i) => {
                    const oppSeed = r64Opp(player.seed);
                    const oppName = oppSeed && player.region ? (regionSeedMap[player.region]?.[oppSeed] || `#${oppSeed}`) : null;
                    const canPick = isMyTurn && !picking;
                    const etp = calcETP(player.season_ppg, player.seed, !!player.is_first_four);
                    const tColor = teamColor(player.team);
                    return (
                      <div key={player.id}
                        className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/50 transition-all ${
                          canPick ? 'hover:bg-brand-500/8 cursor-pointer' : 'cursor-default'
                        }`}
                        onClick={() => canPick && setPickConfirm(player)}>
                        <span className="text-gray-600 font-mono text-[10px] w-4 shrink-0">{i + 1}</span>
                        <PlayerInitialsAvatar name={player.name} team={player.team} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {player.espn_athlete_id ? (
                              <a
                                href={`https://www.espn.com/mens-college-basketball/player/_/id/${player.espn_athlete_id}/${player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className={`font-semibold text-sm hover:underline ${player.injury_flagged ? 'text-gray-400 hover:text-gray-300' : 'text-white hover:text-brand-300'}`}
                              >
                                {player.name}
                              </a>
                            ) : (
                              <span className={`font-semibold text-sm ${player.injury_flagged ? 'text-gray-400' : 'text-white'}`}>
                                {player.name}
                              </span>
                            )}
                            <PosBadge pos={player.position} small />
                            {player.seed ? <SeedBadge seed={player.seed} /> : null}
                            {player.region ? <RegionBadge region={player.region} /> : null}
                            <InjuryBadge player={player} isCommissioner={isCommissioner} onClear={clearInjuryFlag} />
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px]" style={{ color: tColor || '#6b7280' }}>{teamEmoji(player.team)} {player.team}</span>
                            {oppName && <span className="text-gray-600 text-[10px]">vs {oppName}</span>}
                          </div>
                        </div>
                        {/* ETP / PPG display */}
                        <div className="text-right shrink-0 min-w-[42px]">
                          {etp !== null ? (
                            <>
                              <div className="text-brand-400 text-xs font-bold">{etp}</div>
                              <Tip text="Expected Tournament Points — projected total points based on the player's PPG and how far their team is expected to go in the tournament">
                                <div className="text-gray-600 text-[9px] leading-none cursor-help">ETP</div>
                              </Tip>
                              <div className="text-gray-700 text-[9px] leading-none mt-0.5">{parseFloat(player.season_ppg || 0).toFixed(1)}ppg</div>
                            </>
                          ) : (
                            <>
                              <div className="text-brand-400 text-xs font-bold">{parseFloat(player.season_ppg || 0).toFixed(1)}</div>
                              <Tip text="Points Per Game — player's scoring average this season">
                                <div className="text-gray-600 text-[9px] cursor-help">PPG</div>
                              </Tip>
                            </>
                          )}
                        </div>
                        {/* Queue management — always active */}
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button type="button" onClick={e => { e.stopPropagation(); moveInQueue(player.id, -1); }}
                            className="text-gray-600 hover:text-gray-300 text-[10px] leading-none px-1" title="Move up">▲</button>
                          <button type="button" onClick={e => { e.stopPropagation(); moveInQueue(player.id, 1); }}
                            className="text-gray-600 hover:text-gray-300 text-[10px] leading-none px-1" title="Move down">▼</button>
                          <button type="button" onClick={e => { e.stopPropagation(); removeFromQueue(player.id); }}
                            className="text-red-600 hover:text-red-400 text-[10px] leading-none px-1" title="Remove from queue">✕</button>
                        </div>
                        {/* Draft button — only active on your turn */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); if (canPick) requestPick(player); }}
                          title={canPick ? 'Draft this player' : 'Wait for your turn to pick'}
                          className={`w-7 h-7 rounded text-xs font-bold flex items-center justify-center transition-colors shrink-0 ${
                            canPick
                              ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-sm shadow-brand-500/30'
                              : 'bg-gray-800/40 text-gray-700 cursor-not-allowed'
                          }`}
                        >
                          +
                        </button>
                      </div>
                    );
                  })
                )
              ) : filteredSorted.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">No players found</div>
              ) : (
                filteredSorted.map(player => {
                  const oppSeed = r64Opp(player.seed);
                  const oppName = oppSeed && player.region ? (regionSeedMap[player.region]?.[oppSeed] || `#${oppSeed}`) : null;
                  const inQueue = watchlist.includes(player.id);
                  const canPick = isMyTurn && !picking;
                  const etp = calcETP(player.season_ppg, player.seed, !!player.is_first_four);
                  const tColor = teamColor(player.team);
                  return (
                    <div key={player.id}
                      className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/40 transition-all group ${
                        canPick ? 'hover:bg-brand-500/8 cursor-pointer hover:border-brand-500/20' : 'cursor-default'
                      }`}
                      onClick={() => canPick && setPickConfirm(player)}>
                      <PlayerInitialsAvatar name={player.name} team={player.team} size={30} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {player.espn_athlete_id ? (
                            <a
                              href={`https://www.espn.com/mens-college-basketball/player/_/id/${player.espn_athlete_id}/${player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className={`font-semibold text-sm hover:underline ${player.injury_flagged ? 'text-gray-400 hover:text-gray-300' : 'text-white hover:text-brand-300'}`}
                            >
                              {player.name}
                            </a>
                          ) : (
                            <span className={`font-semibold text-sm ${player.injury_flagged ? 'text-gray-400' : 'text-white'}`}>
                              {player.name}
                            </span>
                          )}
                          <PosBadge pos={player.position} small />
                          {player.seed ? <SeedBadge seed={player.seed} /> : null}
                          {player.region ? <RegionBadge region={player.region} /> : null}
                          <InjuryBadge player={player} isCommissioner={isCommissioner} onClear={clearInjuryFlag} />
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px]" style={{ color: tColor || '#6b7280' }}>{teamEmoji(player.team)} {player.team}</span>
                          {oppName && <span className="text-gray-600 text-[10px]">vs {oppName}</span>}
                        </div>
                      </div>
                      {/* Metric display — ETP primary, PPG secondary */}
                      <div className="text-right shrink-0 min-w-[42px]">
                        {etp !== null ? (
                          <>
                            <div className="text-brand-400 text-xs font-bold">{etp}</div>
                            <Tip text="Expected Tournament Points — projected total points based on the player's PPG and how far their team is expected to go in the tournament">
                              <div className="text-gray-600 text-[9px] leading-none cursor-help">ETP</div>
                            </Tip>
                            <div className="text-gray-700 text-[9px] leading-none mt-0.5">{parseFloat(player.season_ppg || 0).toFixed(1)}ppg</div>
                          </>
                        ) : (
                          <>
                            <div className="text-brand-400 text-xs font-bold">{parseFloat(player.season_ppg || 0).toFixed(1)}</div>
                            <Tip text="Points Per Game — player's scoring average this season">
                              <div className="text-gray-600 text-[9px] cursor-help">PPG</div>
                            </Tip>
                          </>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Queue star — always active regardless of turn */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); inQueue ? removeFromQueue(player.id) : addToQueue(player.id); }}
                          className={`w-7 h-7 rounded text-sm flex items-center justify-center transition-colors ${
                            inQueue
                              ? 'bg-yellow-500/20 text-yellow-400 hover:bg-red-500/20 hover:text-red-400'
                              : 'bg-gray-800 text-gray-500 hover:bg-yellow-500/20 hover:text-yellow-400'
                          }`}
                          title={inQueue ? 'Remove from watchlist' : 'Add to watchlist'}
                        >
                          {inQueue ? '★' : '☆'}
                        </button>
                        {/* Draft button — only active on your turn */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); if (canPick) requestPick(player); }}
                          title={canPick ? 'Draft this player' : "Wait for your turn to pick"}
                          className={`w-7 h-7 rounded text-xs font-bold flex items-center justify-center transition-colors ${
                            canPick
                              ? 'bg-brand-500 hover:bg-brand-400 text-white shadow-sm shadow-brand-500/30'
                              : 'bg-gray-800/40 text-gray-700 cursor-not-allowed'
                          }`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Ticker + Manager Cards + Chat ── */}
        <div className={`lg:col-span-3 flex flex-col min-h-0 lg:h-auto lg:space-y-3 ${mobilePanel !== 'chat' ? 'hidden lg:flex' : 'min-h-[65vh]'}`}>
          {/* Live ticker — desktop only */}
          <div className="hidden lg:block card p-3 shrink-0">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              Live Feed
            </h3>
            <PickTicker picks={enrichedPicks} userId={user?.id} />
          </div>

          {/* My Team / All Teams panel — desktop only */}
          <div className="hidden lg:flex flex-col card p-3 shrink-0">
            {/* Tab row */}
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setTeamsPanelTab('my')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
                  teamsPanelTab === 'my' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                My Team
                {mySmartDraft && smartDraftEnabled && (
                  <span
                    title="Smart Draft is ON — auto-picking using injury filters, ETP scoring, region balance, and upside targeting"
                    className="inline-flex items-center gap-0.5 bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 rounded px-1 py-px text-[9px] font-bold leading-none"
                  >
                    ⚡ ON
                  </span>
                )}
              </button>
              <button
                onClick={() => setTeamsPanelTab('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  teamsPanelTab === 'all' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                All Teams
              </button>
            </div>
            {teamsPanelTab === 'my' ? (
              <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: '30vh', WebkitOverflowScrolling: 'touch' }}>
                <MyRoster picks={enrichedPicks} userId={user?.id} etpByPlayerId={etpByPlayerId} />
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto overscroll-contain" style={{ maxHeight: '30vh', WebkitOverflowScrolling: 'touch' }}>
                {members.map(m => (
                  <ManagerRosterCard
                    key={m.id} member={m} picks={enrichedPicks}
                    currentPicker={draftComplete ? null : currentPicker}
                    userId={user?.id}
                    hasSmartDraft={smartDraftUsers.has(m.user_id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Chat panel — full height on mobile, 400px on desktop */}
          <DraftChat
            leagueId={leagueId}
            user={user}
            token={token}
            members={members}
            isMobileFull={mobilePanel === 'chat'}
          />
        </div>

        {/* ── Mobile: My Team full-screen panel (sibling to L/C/R columns) ── */}
        <div className={`lg:hidden flex flex-col min-h-0 ${mobilePanel !== 'myteam' ? 'hidden' : 'min-h-[65vh]'}`}>
          <div className="px-3 pt-3 pb-2 border-b border-gray-800 shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-sm">My Team</span>
              {mySmartDraft && smartDraftEnabled && (
                <span
                  title="Smart Draft is ON — auto-picking using injury filters, ETP scoring, region balance, and upside targeting"
                  className="inline-flex items-center gap-0.5 bg-yellow-400/20 text-yellow-300 border border-yellow-400/30 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none"
                >
                  ⚡ Smart Draft ON
                </span>
              )}
            </div>
            {(() => {
              const myPicks = enrichedPicks.filter(p => p.user_id === user?.id);
              const totalETP = myPicks.reduce((sum, p) => {
                const v = etpByPlayerId[p.player_id] ?? calcETP(p.season_ppg, p.seed, !!p.is_first_four) ?? 0;
                return sum + (v || 0);
              }, 0);
              return myPicks.length > 0
                ? <span className="text-brand-400 font-bold text-sm">{totalETP.toFixed(1)} Proj. ETP</span>
                : null;
            })()}
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            <MyRoster picks={enrichedPicks} userId={user?.id} etpByPlayerId={etpByPlayerId} isMobile />
          </div>
        </div>

      </div>{/* end three-panel grid */}
      </div>{/* end content area */}

      {/* ── Mobile bottom tab bar ── */}
      <div className="fixed bottom-0 inset-x-0 z-50 lg:hidden bg-gray-900 border-t border-gray-800" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch overflow-x-auto">
          {[
            { id: 'players', icon: '🏀', label: 'Players' },
            { id: 'board',   icon: '🗂',  label: 'Board'   },
            { id: 'queue',   icon: '⭐',  label: 'Queue'   },
            { id: 'myteam',  icon: '👤',  label: 'My Team' },
            { id: 'chat',    icon: '💬',  label: 'Chat'    },
          ].map(t => {
            const isActive = mobilePanel === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMobilePanel(t.id)}
                className={`relative flex-none min-w-[72px] flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors touch-manipulation ${
                  isActive ? 'text-brand-400' : 'text-gray-500'
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide">{t.label}</span>
                {/* Your turn pulse on Players tab */}
                {t.id === 'players' && isMyTurn && !draftComplete && (
                  <span className="absolute top-1.5 right-[20%] w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                )}
                {/* Queue count badge */}
                {t.id === 'queue' && queuedPlayers.length > 0 && (
                  <span className="absolute top-1.5 right-[18%] min-w-[14px] h-3.5 bg-yellow-500 text-black text-[8px] font-black rounded-full flex items-center justify-center px-0.5">
                    {queuedPlayers.length}
                  </span>
                )}
                {/* Smart Draft ON indicator on My Team tab */}
                {t.id === 'myteam' && mySmartDraft && smartDraftEnabled && (
                  <span className="absolute top-1 right-[14%] text-[8px] leading-none">⚡</span>
                )}
                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-brand-400 rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Pick Confirmation Modal (accidental pick guard) ── */}
      {pickConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-white font-bold text-lg mb-1">Draft this player?</h3>
            <p className="text-gray-300 text-sm mb-1">
              <span className="text-white font-semibold">{pickConfirm.name}</span>
            </p>
            <p className="text-gray-500 text-xs mb-5">
              {pickConfirm.team}{pickConfirm.region ? ` · ${pickConfirm.region}` : ''}{pickConfirm.seed ? ` · #${pickConfirm.seed} seed` : ''}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPickConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { requestPick(pickConfirm); setPickConfirm(null); }}
                className="flex-1 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-bold transition-colors"
              >
                Yes, Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Injury Draft Confirmation Modal ── */}
      {draftConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-yellow-500/40 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="text-2xl mb-3">⚠️</div>
            <h3 className="text-white font-bold text-lg mb-1">Injury Alert</h3>
            <p className="text-gray-300 text-sm mb-2">
              <span className="text-white font-semibold">{draftConfirm.name}</span> has been flagged in recent injury news.
            </p>
            {draftConfirm.injury_headline && (
              <p className="text-yellow-400/80 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2 mb-4 leading-snug">
                "{draftConfirm.injury_headline}"
              </p>
            )}
            <p className="text-gray-500 text-xs mb-5">Injury alerts are sourced from news feeds and may not be current. Verify before drafting.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDraftConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { makePick(draftConfirm.id); setDraftConfirm(null); }}
                className="flex-1 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-bold transition-colors"
              >
                Draft Anyway
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
