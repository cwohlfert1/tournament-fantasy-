/**
 * GolfDraftRoom — real-time snake draft room for golf pools.
 *
 * States: Pre-draft lobby → Active draft → Draft complete
 *
 * S1.1: Draft time picker (commissioner edits via PATCH /golf/draft/:id/time)
 * S1.2: Commissioner override panel (POST /golf/draft/:id/override-pick)
 * S1.3: Draft-specific badges (pending/live/complete)
 * S1.4: Draft results tab (read-only board after completion)
 * S1.5: Pick timer with countdown + auto-pick on timeout
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Crown, Users, Timer, Shield, ChevronRight, ListOrdered, LayoutGrid, Star, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import socket, { connectSocket } from '../../socket';
import GolfLoader from '../../components/golf/GolfLoader';
import PlayerAvatar from '../../components/golf/PlayerAvatar';
import Alert from '../../components/ui/Alert';
import { showToast } from '../../components/ui/Toast';
import { showConfirm } from '../../components/ui/ConfirmDialog';
import Select from '../../components/ui/Select';

// ── Web Audio: golf chime (clean two-tone, G5→C6) ────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function playTurnChime() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Two ascending notes: G5 (784Hz) → C6 (1047Hz), sine wave, soft
    [784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.35);
    });
  } catch (_) {}
}

// ── Pick Ticker ──────────────────────────────────────────────────────────────
function PickTicker({ picks }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [picks.length]);
  if (picks.length === 0) return null;
  const recent = picks.slice(-8);
  return (
    <div ref={ref} style={{
      display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 0', marginBottom: 10,
      scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
    }}>
      <style>{`.pick-ticker::-webkit-scrollbar { display: none; }`}</style>
      {recent.map(p => (
        <div key={p.pick_number} className="pick-ticker" style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          background: p.auto_pick ? 'rgba(245,158,11,0.08)' : 'rgba(139,92,246,0.08)',
          border: `1px solid ${p.auto_pick ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)'}`,
          borderRadius: 8, padding: '5px 10px',
        }}>
          <span style={{ color: '#6b7280', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>#{p.pick_number}</span>
          <PlayerAvatar name={p.player_name} tier={null} espnPlayerId={p.espn_player_id} size={20} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#d1d5db', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>
              {flipName(p.player_name)?.split(' ').pop()}
            </div>
            <div style={{ color: '#4b5563', fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
              {p.username}
              {p.auto_pick && <Timer size={8} style={{ color: '#f59e0b' }} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function flipName(name) {
  if (!name) return name;
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    return first ? `${first} ${last}` : last;
  }
  return name;
}

const toFlag = code => {
  if (!code || code.length !== 2) return '';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
};

// ── T1.1: Draft Order Strip (next picks lookahead) ──────────────────────────
function DraftOrderStrip({ currentPick, totalPicks, numTeams, members, userId }) {
  if (!members.length || currentPick > totalPicks) return null;
  const upcoming = [];
  for (let i = 0; i < Math.min(8, totalPicks - currentPick + 1); i++) {
    const pickNum = currentPick + i;
    const round = Math.ceil(pickNum / numTeams);
    const posInRound = (pickNum - 1) % numTeams;
    const draftPos = round % 2 === 1 ? posInRound + 1 : numTeams - posInRound;
    const member = members.find(m => m.draft_order === draftPos);
    upcoming.push({ pickNum, member, isMe: member?.user_id === userId });
  }
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 0', marginBottom: 10, scrollbarWidth: 'none' }}>
      {upcoming.map((u, i) => (
        <div key={u.pickNum} style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8,
          background: i === 0 ? (u.isMe ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.12)') : 'rgba(255,255,255,0.03)',
          border: `1px solid ${i === 0 ? (u.isMe ? 'rgba(34,197,94,0.4)' : 'rgba(139,92,246,0.3)') : 'rgba(255,255,255,0.06)'}`,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#6b7280' }}>#{u.pickNum}</span>
          <span style={{ fontSize: 12, fontWeight: u.isMe ? 700 : 500, color: u.isMe ? '#4ade80' : '#d1d5db', whiteSpace: 'nowrap' }}>
            {u.isMe ? 'YOU' : (u.member?.team_name || u.member?.username || '?').split(' ')[0]}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── T1.2: Pick Animation (last pick slide-in) ───────────────────────────────
function PickAnimation({ lastPick }) {
  const [visible, setVisible] = useState(false);
  const [currentPick, setCurrentPick] = useState(null);
  useEffect(() => {
    if (!lastPick) return;
    setCurrentPick(lastPick);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [lastPick?.pick_number]);
  if (!visible || !currentPick) return null;
  return (
    <>
      <style>{`
        @keyframes draftSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes draftFadeOut { from { opacity: 1; } to { opacity: 0; } }
      `}</style>
      <div style={{
        position: 'fixed', top: 80, right: 16, zIndex: 9000, width: 280,
        background: 'linear-gradient(135deg, rgba(10,26,15,0.97), rgba(15,35,20,0.97))',
        border: '1px solid rgba(34,197,94,0.4)', borderLeft: '3px solid #22c55e',
        borderRadius: 12, padding: '12px 14px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5), -4px 0 16px rgba(34,197,94,0.15)',
        animation: 'draftSlideIn 0.3s ease-out, draftFadeOut 0.5s ease-in 3s forwards',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <PlayerAvatar name={currentPick.player_name} tier={null} espnPlayerId={currentPick.espn_player_id} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#4ade80', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Pick #{currentPick.pick_number} · Rd {currentPick.round}
          </div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {flipName(currentPick.player_name)}
          </div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>
            {currentPick.username}{currentPick.auto_pick ? ' · auto' : ''}
          </div>
        </div>
      </div>
    </>
  );
}

// ── T1.3: Player Card Modal ─────────────────────────────────────────────────
function PlayerCardModal({ player, recentForm, onDraft, isMyTurn, picking, onClose }) {
  useEffect(() => {
    if (!player) return;
    function esc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [player, onClose]);
  if (!player) return null;
  const form = recentForm?.[player.player_id] || [];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 360, background: '#0a1a0f', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 16, padding: '24px 20px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        {/* Header: photo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <PlayerAvatar name={player.player_name} tier={null} espnPlayerId={player.espn_player_id} size={64} />
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{flipName(player.player_name)}</div>
            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
              {toFlag(player.country)} {player.country} · World #{player.world_ranking || '—'}
            </div>
          </div>
        </div>
        {/* Odds */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Odds</div>
            <div style={{ color: '#fbbf24', fontSize: 18, fontWeight: 800 }}>{player.odds_display || '—'}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Ranking</div>
            <div style={{ color: '#e5e7eb', fontSize: 18, fontWeight: 800 }}>#{player.world_ranking || '—'}</div>
          </div>
        </div>
        {/* Recent form */}
        {form.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent Form</div>
            {form.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span style={{ color: '#9ca3af', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{f.tournament}</span>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                  <span style={{ color: f.finish && f.finish <= 10 ? '#4ade80' : '#d1d5db', fontSize: 12, fontWeight: 600 }}>
                    {f.finish ? (f.finish === 1 ? '🏆 1st' : `T${f.finish}`) : f.made_cut === 0 ? 'MC' : '—'}
                  </span>
                  <span style={{ color: f.total < 0 ? '#4ade80' : f.total > 0 ? '#f87171' : '#9ca3af', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>
                    {f.total === 0 ? 'E' : f.total > 0 ? `+${f.total}` : f.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {form.length === 0 && (
          <p style={{ color: '#4b5563', fontSize: 12, marginBottom: 16, textAlign: 'center' }}>No recent tournament data</p>
        )}
        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isMyTurn && (
            <button type="button" disabled={picking} onClick={() => { onDraft(player.player_id); onClose(); }}
              style={{ flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: picking ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}>
              {picking ? 'Drafting…' : 'Draft Player'}
            </button>
          )}
          <button type="button" onClick={onClose}
            style={{ flex: isMyTurn ? 0 : 1, padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── T1.4: Team Summary Modal ────────────────────────────────────────────────
function TeamSummaryModal({ member, picks, onClose }) {
  useEffect(() => {
    if (!member) return;
    function esc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [member, onClose]);
  if (!member) return null;
  const teamPicks = picks.filter(p => p.user_id === member.user_id).sort((a, b) => a.pick_number - b.pick_number);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, background: '#0a1a0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '20px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: 0 }}>{member.team_name || member.username}</h3>
          <span style={{ color: '#6b7280', fontSize: 12 }}>{teamPicks.length} pick{teamPicks.length !== 1 ? 's' : ''}</span>
        </div>
        {teamPicks.length === 0 ? (
          <p style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: 20 }}>No picks yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {teamPicks.map(p => (
              <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, width: 28, flexShrink: 0 }}>Rd {p.round}</span>
                <PlayerAvatar name={p.player_name} tier={null} espnPlayerId={p.espn_player_id} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#d1d5db', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flipName(p.player_name)}</div>
                  <div style={{ color: '#6b7280', fontSize: 11 }}>{p.odds_display || ''}{p.world_ranking ? ` · #${p.world_ranking}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} style={{ width: '100%', marginTop: 14, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  );
}

// ── Pick History Log ─────────────────────────────────────────────────────────
function PickHistoryLog({ picks }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [picks.length]);
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 12px', maxHeight: 260, overflowY: 'auto' }} ref={ref}>
      <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, position: 'sticky', top: 0, background: 'rgba(10,26,15,0.95)', padding: '2px 0' }}>Pick History</div>
      {picks.length === 0 && <p style={{ color: '#374151', fontSize: 12 }}>No picks yet</p>}
      {picks.map(p => (
        <div key={p.pick_number} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
          <span style={{ color: '#374151', fontSize: 10, fontWeight: 700, width: 24, flexShrink: 0 }}>#{p.pick_number}</span>
          <PlayerAvatar name={p.player_name} tier={null} espnPlayerId={p.espn_player_id} size={20} />
          <span style={{ color: '#d1d5db', fontSize: 11, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flipName(p.player_name)}</span>
          <span style={{ color: '#4b5563', fontSize: 10, flexShrink: 0 }}>{p.username}</span>
          {p.auto_pick && <Timer size={9} style={{ color: '#f59e0b', flexShrink: 0 }} />}
        </div>
      ))}
    </div>
  );
}

// ── Pick Countdown Timer (S1.5) ──────────────────────────────────────────────
function PickCountdown({ secondsRemaining }) {
  const [secs, setSecs] = useState(secondsRemaining);
  useEffect(() => { setSecs(secondsRemaining); }, [secondsRemaining]);
  useEffect(() => {
    if (secs <= 0) return;
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secs > 0]); // eslint-disable-line
  const pct = secondsRemaining > 0 ? (secs / secondsRemaining) * 100 : 0;
  const urgent = secs <= 10;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Timer size={14} style={{ color: urgent ? '#ef4444' : '#a78bfa' }} />
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: urgent ? '#ef4444' : '#a78bfa', borderRadius: 999, transition: 'width 1s linear' }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: urgent ? '#ef4444' : '#e5e7eb', minWidth: 36 }}>
        {m}:{String(s).padStart(2, '0')}
      </span>
    </div>
  );
}

// ── On-the-clock banner ──────────────────────────────────────────────────────
function ClockBanner({ picker, isMe, pickNumber, totalPicks, round, timerSecs }) {
  const urgent = timerSecs > 0 && timerSecs <= 10;
  return (
    <div style={{
      background: urgent ? 'rgba(239,68,68,0.1)' : isMe ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.08)',
      border: `1px solid ${urgent ? 'rgba(239,68,68,0.5)' : isMe ? 'rgba(34,197,94,0.4)' : 'rgba(139,92,246,0.3)'}`,
      borderRadius: 14, padding: '14px 18px', marginBottom: 14,
      animation: urgent ? 'urgentPulse 1s ease-in-out infinite' : 'none',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
    <style>{`@keyframes urgentPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: timerSecs > 0 ? 10 : 0 }}>
        <div>
          <div style={{ color: isMe ? '#4ade80' : '#c4b5fd', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
            {isMe ? 'Your pick' : 'On the clock'}
          </div>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>
            {isMe ? 'Make your pick!' : `${picker?.username || 'Waiting...'}`}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#9ca3af', fontSize: 11 }}>Pick {pickNumber} of {totalPicks}</div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>Round {round}</div>
        </div>
      </div>
      {timerSecs > 0 && <PickCountdown secondsRemaining={timerSecs} />}
    </div>
  );
}

// ── Draft Board Grid ─────────────────────────────────────────────────────────
function DraftBoard({ members, picks, numTeams, totalRounds, currentPick, onTeamTap }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: numTeams * 100 }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 8px', color: '#4b5563', fontSize: 10, fontWeight: 700, textAlign: 'left', position: 'sticky', left: 0, background: '#0a1a0f', zIndex: 1 }}>Rd</th>
            {members.map(m => (
              <th key={m.user_id} onClick={() => onTeamTap?.(m)} style={{ padding: '6px 8px', color: '#9ca3af', fontSize: 10, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = '#e5e7eb'}
                onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
                {m.team_name || m.username}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: totalRounds }, (_, ri) => {
            const round = ri + 1;
            const isReverse = round % 2 === 0;
            const ordered = isReverse ? [...members].reverse() : members;
            const isActive = round === Math.ceil((currentPick || 1) / numTeams);
            return (
              <tr key={round} style={{ background: isActive ? 'rgba(139,92,246,0.05)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', color: '#4b5563', fontWeight: 700, fontSize: 10, position: 'sticky', left: 0, background: '#0a1a0f', zIndex: 1 }}>
                  {round} <span style={{ color: '#374151', fontSize: 8 }}>{isReverse ? '←' : '→'}</span>
                </td>
                {ordered.map((m, ci) => {
                  const pickNum = (round - 1) * numTeams + ci + 1;
                  const pick = picks.find(p => p.pick_number === pickNum);
                  const isCurrent = pickNum === currentPick;
                  return (
                    <td key={m.user_id} style={{
                      padding: '5px 6px', textAlign: 'center',
                      background: isCurrent ? 'rgba(139,92,246,0.15)' : pick ? 'rgba(255,255,255,0.02)' : 'transparent',
                      border: isCurrent ? '1.5px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.03)',
                      borderRadius: 4,
                    }}>
                      {pick ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <PlayerAvatar name={pick.player_name} tier={pick.tier_number} espnPlayerId={pick.espn_player_id} size={24} />
                          <span style={{ color: pick.auto_pick ? '#f59e0b' : '#d1d5db', fontSize: 10, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                            {flipName(pick.player_name)?.split(' ').pop()}
                          </span>
                          {pick.override_reason && <span style={{ fontSize: 8, color: '#f59e0b' }}>edited</span>}
                        </div>
                      ) : isCurrent ? (
                        <Clock size={14} style={{ color: '#a78bfa', margin: '0 auto' }} />
                      ) : null}
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

// ── Available Players List + Queue ────────────────────────────────────────────
function AvailablePlayersList({ players, onPick, isMyTurn, picking, queue, onAddToQueue, onRemoveFromQueue, onPlayerTap }) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('available'); // 'available' | 'queue'
  const q = search.trim().toLowerCase();
  const filtered = q ? players.filter(p => flipName(p.player_name)?.toLowerCase().includes(q)) : players;
  const queueSet = new Set(queue);
  const queuePlayers = queue.map(id => players.find(p => p.player_id === id)).filter(Boolean);

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 2 }}>
        {[['available', `Available (${players.length})`], ['queue', `My Queue (${queuePlayers.length})`]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === k ? 'rgba(139,92,246,0.2)' : 'transparent', color: tab === k ? '#c4b5fd' : '#6b7280', transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'available' && (
        <>
          <div style={{ marginBottom: 10 }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search available players…"
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filtered.length === 0 && <p style={{ color: '#4b5563', textAlign: 'center', padding: 24, fontSize: 13 }}>No players available</p>}
            {filtered.map(p => {
              const inQueue = queueSet.has(p.player_id);
              return (
                <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div onClick={e => { e.stopPropagation(); onPlayerTap?.(p); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <PlayerAvatar name={p.player_name} tier={null} espnPlayerId={p.espn_player_id} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flipName(p.player_name)}</div>
                      <div style={{ color: '#6b7280', fontSize: 11 }}>{p.odds_display || '—'}{p.world_ranking ? ` · #${p.world_ranking}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button type="button" onClick={() => inQueue ? onRemoveFromQueue(p.player_id) : onAddToQueue(p.player_id)}
                      style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', background: inQueue ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)', color: inQueue ? '#fbbf24' : '#6b7280' }}>
                      {inQueue ? '★ Queued' : '+ Queue'}
                    </button>
                    {isMyTurn && !picking && (
                      <button type="button" onClick={() => onPick(p.player_id)}
                        style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', background: 'rgba(34,197,94,0.2)', color: '#4ade80' }}>
                        Draft
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'queue' && (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {queuePlayers.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
              <p style={{ marginBottom: 4 }}>No players queued</p>
              <p style={{ fontSize: 11 }}>Add players from the Available tab to pre-rank your picks.</p>
            </div>
          )}
          {queuePlayers.map((p, i) => (
            <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700, width: 20, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
              <PlayerAvatar name={p.player_name} tier={null} espnPlayerId={p.espn_player_id} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flipName(p.player_name)}</div>
                <div style={{ color: '#6b7280', fontSize: 11 }}>{p.odds_display || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                {i > 0 && <button type="button" onClick={() => onRemoveFromQueue(p.player_id) || onAddToQueue(p.player_id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: 2 }}>↑</button>}
                <button type="button" onClick={() => onRemoveFromQueue(p.player_id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: 2 }}>✕</button>
              </div>
            </div>
          ))}
          {queuePlayers.length > 0 && (
            <p style={{ color: '#6b7280', fontSize: 11, padding: '10px 10px 4px', textAlign: 'center' }}>
              When it's your turn, the top queued player still available will be suggested first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── My Roster ────────────────────────────────────────────────────────────────
function MyRoster({ picks, userId, totalRounds }) {
  const myPicks = picks.filter(p => p.user_id === userId);
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid #22c55e', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ color: '#4ade80', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>My Team ({myPicks.length}/{totalRounds})</div>
      {myPicks.length === 0 ? (
        <p style={{ color: '#4b5563', fontSize: 12 }}>No picks yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {myPicks.map(p => (
            <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlayerAvatar name={p.player_name} tier={null} espnPlayerId={p.espn_player_id} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#d1d5db', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{flipName(p.player_name)}</div>
              </div>
              <span style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>Rd {p.round}</span>
              {p.override_reason && <span style={{ fontSize: 8, color: '#f59e0b', fontWeight: 700 }}>edited</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Commissioner Override Panel (S1.2) ───────────────────────────────────────
function OverridePanel({ leagueId, members, picks, available, onDone }) {
  const [userId, setUserId] = useState('');
  const [oldPlayerId, setOldPlayerId] = useState('');
  const [newPlayerId, setNewPlayerId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const userPicks = picks.filter(p => p.user_id === userId);
  const allDraftedIds = new Set(picks.map(p => p.player_id));

  async function handleOverride() {
    if (!userId || !oldPlayerId || !newPlayerId || reason.trim().length < 3) return;
    const ok = await showConfirm({
      title: 'Override this pick?',
      description: `This swap will be logged and visible to you as commissioner. The player's score will update on the next sync cycle.`,
      confirmLabel: 'Override pick',
      variant: 'warning',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await api.post(`/golf/draft/${leagueId}/override-pick`, { user_id: userId, old_player_id: oldPlayerId, new_player_id: newPlayerId, reason: reason.trim() });
      showToast.success('Pick overridden');
      setOldPlayerId(''); setNewPlayerId(''); setReason('');
      onDone();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Override failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Shield size={14} style={{ color: '#f59e0b' }} />
        <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Commissioner Override</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Select value={userId} onChange={setUserId} placeholder="Select team" fullWidth size="sm"
          options={members.map(m => ({ value: m.user_id, label: m.team_name || m.username }))} />

        {userId && (
          <Select value={oldPlayerId} onChange={setOldPlayerId} placeholder="Player to replace" fullWidth size="sm"
            options={userPicks.map(p => ({ value: p.player_id, label: `${flipName(p.player_name)} (Rd ${p.round})` }))} />
        )}

        {oldPlayerId && (
          <Select value={newPlayerId} onChange={setNewPlayerId} placeholder="Replacement player" fullWidth size="sm"
            options={(available || []).filter(p => !allDraftedIds.has(p.player_id) || p.player_id === oldPlayerId).map(p => ({
              value: p.player_id, label: `${flipName(p.player_name)} — ${p.odds_display || '?'}`,
            }))} />
        )}

        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for override (required)"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none' }} />

        <button type="button" disabled={submitting || !userId || !oldPlayerId || !newPlayerId || reason.trim().length < 3} onClick={handleOverride}
          style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#fbbf24', opacity: submitting ? 0.5 : 1 }}>
          {submitting ? 'Overriding…' : 'Override Pick'}
        </button>
      </div>
    </div>
  );
}

// ── Draft Time Picker (S1.1) ─────────────────────────────────────────────────
function DraftTimePicker({ league, leagueId, onSaved }) {
  const current = league.draft_start_time ? new Date(league.draft_start_time) : null;
  const [value, setValue] = useState(current ? current.toISOString().slice(0, 16) : '');
  const [saving, setSaving] = useState(false);

  const isLocked = current && (current - Date.now()) < 10 * 60 * 1000 && (current - Date.now()) > 0;

  async function save() {
    if (!value) return;
    setSaving(true);
    try {
      await api.patch(`/golf/draft/${leagueId}/time`, { draft_start_time: new Date(value).toISOString() });
      showToast.success('Draft time updated');
      onSaved();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to update time');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Draft Time {isLocked && <span style={{ color: '#f59e0b', marginLeft: 6 }}>🔒 Locked (within 10 min)</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="datetime-local"
          value={value}
          onChange={e => setValue(e.target.value)}
          disabled={isLocked}
          style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }}
        />
        <button type="button" onClick={save} disabled={saving || isLocked || !value}
          style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', cursor: 'pointer', opacity: saving || isLocked ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Set'}
        </button>
      </div>
      {current && !isLocked && (
        <p style={{ color: '#6b7280', fontSize: 11, marginTop: 6 }}>
          Currently: {current.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}

// ── Pre-Draft Lobby ──────────────────────────────────────────────────────────
function useDraftCountdown(draftTime) {
  const [display, setDisplay] = useState('');
  const [canEnter, setCanEnter] = useState(!draftTime);
  useEffect(() => {
    function tick() {
      if (!draftTime) { setDisplay(''); setCanEnter(true); return; }
      const diff = new Date(draftTime) - Date.now();
      if (diff <= 0) { setDisplay('Starting soon…'); setCanEnter(true); return; }
      setCanEnter(diff <= 30 * 60 * 1000);
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [draftTime]);
  return { display, canEnter };
}

function PreDraftLobby({ league, members, isComm, onStart, starting, leagueId, onRefresh }) {
  const { display: countdown, canEnter } = useDraftCountdown(league.draft_start_time);
  const hasDraftTime = !!league.draft_start_time;

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Users size={26} style={{ color: '#a78bfa' }} />
      </div>
      <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Snake Draft Lobby</h2>

      {/* Countdown to draft */}
      {hasDraftTime && countdown && (
        <div style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ color: '#c4b5fd', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>Draft Starts In</div>
          <div style={{ color: '#fff', fontSize: 28, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{countdown}</div>
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
            {new Date(league.draft_start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
          {!canEnter && (
            <p style={{ color: '#4b5563', fontSize: 11, marginTop: 8 }}>Draft room opens 30 minutes before start</p>
          )}
        </div>
      )}

      {!hasDraftTime && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#c4b5fd', marginBottom: 16 }}>
          No draft time set yet
        </div>
      )}

      <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
        {members.length} team{members.length !== 1 ? 's' : ''} joined.
        {isComm ? ' Set a draft time or start when ready.' : hasDraftTime ? '' : ' Waiting for commissioner to schedule the draft.'}
      </p>

      {/* Draft time picker — commissioner only */}
      {isComm && <DraftTimePicker league={league} leagueId={leagueId} onSaved={onRefresh} />}

      {/* Teams list */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, marginBottom: 20, textAlign: 'left' }}>
        <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Teams ({members.length})</div>
        {members.map((m, i) => (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <span style={{ color: '#4b5563', fontSize: 11, fontWeight: 700, width: 20 }}>{i + 1}</span>
            <span style={{ color: '#d1d5db', fontSize: 13, fontWeight: 500 }}>{m.team_name || m.username}</span>
            {m.user_id === league.commissioner_id && <Crown size={12} style={{ color: '#fbbf24' }} />}
          </div>
        ))}
      </div>

      {/* Commissioner: start draft */}
      {isComm && (
        <button onClick={onStart} disabled={starting || members.length < 1}
          style={{ width: '100%', padding: '14px 24px', borderRadius: 12, background: starting ? '#374151' : 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: starting ? 'not-allowed' : 'pointer', boxShadow: '0 6px 20px rgba(124,58,237,0.25)' }}>
          {starting ? 'Starting…' : `🐍 Start Draft Now (${members.length} team${members.length !== 1 ? 's' : ''})`}
        </button>
      )}

      {/* Non-commissioner: waiting message */}
      {!isComm && (
        <p style={{ color: '#4b5563', fontSize: 12, marginTop: 8 }}>
          {hasDraftTime && canEnter ? 'Draft room is open — waiting for commissioner to start.' : hasDraftTime ? 'Come back when the countdown reaches 30 minutes.' : 'The commissioner will schedule and start the draft.'}
        </p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function GolfDraftRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [timerSecs, setTimerSecs] = useState(0);
  const prevIsMyTurn = useRef(false);
  const [mobilePanel, setMobilePanel] = useState('players');
  const [playerModal, setPlayerModal] = useState(null); // player object or null
  const [teamModal, setTeamModal] = useState(null); // member object or null
  const [lastPick, setLastPick] = useState(null); // for pick animation

  // Queue: persisted to localStorage (survives page reload)
  const [queue, setQueue] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`dq_${id}_${user?.id}`) || '[]'); }
    catch { return []; }
  });
  useEffect(() => {
    if (user?.id) localStorage.setItem(`dq_${id}_${user.id}`, JSON.stringify(queue));
  }, [queue, id, user?.id]);

  function addToQueue(playerId) {
    setQueue(prev => prev.includes(playerId) ? prev : [...prev, playerId]);
  }
  function removeFromQueue(playerId) {
    setQueue(prev => prev.filter(id => id !== playerId));
  }

  async function loadState() {
    try {
      const r = await api.get(`/golf/draft/${id}/state`);
      setState(r.data);
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to load draft');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadState(); }, [id]);

  // Socket events
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    connectSocket(token);
    socket.emit('join_golf_draft', { leagueId: id, token });

    socket.on('golf_draft_pick', (data) => {
      loadState();
      if (data.pick) setLastPick(data.pick); // trigger pick animation
      if (data.draftComplete) showToast.success('Draft complete!');
    });
    socket.on('golf_draft_started', () => { showToast.info('Draft started!'); loadState(); });
    socket.on('golf_draft_timer', ({ secondsRemaining }) => { setTimerSecs(secondsRemaining); });

    return () => {
      socket.off('golf_draft_pick');
      socket.off('golf_draft_started');
      socket.off('golf_draft_timer');
    };
  }, [id, user]);

  // Sound: chime when it becomes your turn (false→true transition only)
  // Must be above early returns to maintain consistent hook count
  const currentPicker = state?.currentPicker;
  const isMyTurnForChime = currentPicker?.user_id === user?.id;
  useEffect(() => {
    if (!state) return;
    if (isMyTurnForChime && !prevIsMyTurn.current) playTurnChime();
    prevIsMyTurn.current = isMyTurnForChime;
  }, [isMyTurnForChime, state]);

  if (loading) return <GolfLoader />;
  if (!state) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <Alert variant="destructive" title="Could not load draft room" />
      <Link to="/golf/dashboard" style={{ color: '#4ade80', fontSize: 13, marginTop: 12, display: 'inline-block' }}>
        <ArrowLeft size={14} style={{ display: 'inline', marginRight: 4 }} /> Back to dashboard
      </Link>
    </div>
  );

  const { league, members, picks, available, currentPick, totalPicks, totalRounds, draftComplete, numTeams } = state;
  const isComm = league.commissioner_id === user?.id;
  const isMyTurn = isMyTurnForChime;
  const currentRound = Math.ceil((currentPick || 1) / numTeams);

  async function handlePick(playerId) {
    setPicking(true);
    try {
      await api.post(`/golf/draft/${id}/pick`, { player_id: playerId });
      loadState();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Pick failed');
    } finally {
      setPicking(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    try {
      await api.post(`/golf/draft/${id}/start`);
      showToast.success('Draft started!');
      loadState();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to start draft');
    } finally {
      setStarting(false);
    }
  }

  // ── Pre-draft lobby ──
  if (league.draft_status === 'pending') {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <Link to={`/golf/league/${id}`} style={{ color: '#6b7280', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
          <ArrowLeft size={14} /> Back to league
        </Link>
        <PreDraftLobby league={league} members={members} isComm={isComm} onStart={handleStart} starting={starting} leagueId={id} onRefresh={loadState} />
      </div>
    );
  }

  // ── Draft complete (S1.4: read-only draft board) ──
  if (draftComplete) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <Link to={`/golf/league/${id}?tab=standings`} style={{ color: '#6b7280', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
          <ArrowLeft size={14} /> Back to standings
        </Link>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#4ade80', marginBottom: 14 }}>
          Draft Complete
        </div>
        <Alert variant="success" title="All picks are in!" style={{ marginBottom: 16 }}>
          {totalPicks} picks across {totalRounds} rounds. Scores update automatically when the tournament begins.
        </Alert>
        <div style={{ background: '#0a1a0f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Full Draft Board</div>
          <DraftBoard members={members} picks={picks} numTeams={numTeams} totalRounds={totalRounds} currentPick={totalPicks + 1} onTeamTap={setTeamModal} />
        </div>
        <MyRoster picks={picks} userId={user?.id} totalRounds={totalRounds} />

        {/* S1.2: Commissioner override (post-draft corrections) */}
        {isComm && (
          <div style={{ marginTop: 16 }}>
            <OverridePanel leagueId={id} members={members} picks={picks} available={available} onDone={loadState} />
          </div>
        )}
      </div>
    );
  }

  // ── Active draft ──
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Link to={`/golf/league/${id}`} style={{ color: '#6b7280', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> {league.name}
          </Link>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginTop: 2 }}>Snake Draft</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#4ade80' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} /> LIVE
          </span>
          <span style={{ color: '#6b7280', fontSize: 12 }}>
            {numTeams} teams · Rd {currentRound}/{totalRounds}
          </span>
        </div>
      </div>

      <ClockBanner picker={currentPicker} isMe={isMyTurn} pickNumber={currentPick} totalPicks={totalPicks} round={currentRound} timerSecs={timerSecs} />

      {/* Draft order strip — next picks lookahead */}
      <DraftOrderStrip currentPick={currentPick} totalPicks={totalPicks} numTeams={numTeams} members={members} userId={user?.id} />

      {/* Live pick ticker */}
      <PickTicker picks={picks} />

      {/* Pick animation overlay */}
      <PickAnimation lastPick={lastPick} />

      {/* Desktop: two-panel grid. Mobile: single panel controlled by bottom nav */}
      <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ background: '#0a1a0f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Draft Board</div>
            <DraftBoard members={members} picks={picks} numTeams={numTeams} totalRounds={totalRounds} currentPick={currentPick} onTeamTap={setTeamModal} />
          </div>
          <div style={{ background: '#0a1a0f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
            <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Available Players ({available.length})</div>
            <AvailablePlayersList players={available} onPick={handlePick} isMyTurn={isMyTurn} picking={picking} queue={queue} onAddToQueue={addToQueue} onRemoveFromQueue={removeFromQueue} onPlayerTap={setPlayerModal} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MyRoster picks={picks} userId={user?.id} totalRounds={totalRounds} />
          <PickHistoryLog picks={picks} />
        </div>
      </div>

      {/* Mobile panels — one visible at a time, controlled by bottom nav */}
      <div className="lg:hidden" style={{ paddingBottom: 72 }}>
        {mobilePanel === 'players' && (
          <div style={{ background: '#0a1a0f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, minHeight: '60vh' }}>
            <AvailablePlayersList players={available} onPick={handlePick} isMyTurn={isMyTurn} picking={picking} queue={queue} onAddToQueue={addToQueue} onRemoveFromQueue={removeFromQueue} onPlayerTap={setPlayerModal} />
          </div>
        )}
        {mobilePanel === 'board' && (
          <div style={{ background: '#0a1a0f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, minHeight: '60vh' }}>
            <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Draft Board</div>
            <DraftBoard members={members} picks={picks} numTeams={numTeams} totalRounds={totalRounds} currentPick={currentPick} onTeamTap={setTeamModal} />
          </div>
        )}
        {mobilePanel === 'queue' && (
          <div style={{ background: '#0a1a0f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, minHeight: '60vh' }}>
            {/* Force queue sub-tab open — dedicated queue view on mobile */}
            <div style={{ color: '#fbbf24', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              My Queue ({queue.filter(id => available.some(p => p.player_id === id)).length} available)
            </div>
            {queue.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
                <p style={{ marginBottom: 4 }}>No players queued</p>
                <p style={{ fontSize: 11 }}>Go to Players tab → tap "+ Queue" to pre-rank your picks.</p>
              </div>
            ) : (
              queue.map(id => available.find(p => p.player_id === id)).filter(Boolean).map((p, i) => (
                <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700, width: 20, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <PlayerAvatar name={p.player_name} tier={null} espnPlayerId={p.espn_player_id} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flipName(p.player_name)}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{p.odds_display || '—'}</div>
                  </div>
                  <button type="button" onClick={() => removeFromQueue(p.player_id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12, padding: 4 }}>✕</button>
                </div>
              ))
            )}
          </div>
        )}
        {mobilePanel === 'myteam' && (
          <div style={{ minHeight: '60vh' }}>
            <MyRoster picks={picks} userId={user?.id} totalRounds={totalRounds} />
          </div>
        )}
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 inset-x-0 z-50 lg:hidden" style={{ background: '#0a1a0f', borderTop: `1px solid ${isMyTurn ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.08)'}`, boxShadow: isMyTurn ? '0 -4px 20px rgba(34,197,94,0.15)' : 'none', paddingBottom: 'env(safe-area-inset-bottom)', transition: 'border-color 0.3s, box-shadow 0.3s' }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {[
            { id: 'players', Icon: ListOrdered, label: 'Players' },
            { id: 'board',   Icon: LayoutGrid,  label: 'Board' },
            { id: 'queue',   Icon: Star,         label: 'Queue' },
            { id: 'myteam',  Icon: User,         label: 'My Team' },
          ].map(t => {
            const isActive = mobilePanel === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMobilePanel(t.id)}
                style={{
                  position: 'relative',
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '10px 0 8px', gap: 3, background: 'transparent', border: 'none', cursor: 'pointer',
                  color: isActive ? '#a78bfa' : '#4b5563', transition: 'color 0.15s',
                }}
              >
                <t.Icon size={18} />
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</span>
                {t.id === 'players' && isMyTurn && (
                  <span style={{ position: 'absolute', top: 6, right: '22%', width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px #0a1a0f', animation: 'pulse 1.5s infinite' }} />
                )}
                {t.id === 'queue' && queue.length > 0 && (
                  <span style={{ position: 'absolute', top: 4, right: '18%', minWidth: 14, height: 14, borderRadius: 999, background: '#fbbf24', color: '#000', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', boxShadow: '0 0 0 2px #0a1a0f' }}>
                    {queue.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Player card modal (T1.3) */}
      {playerModal && (
        <PlayerCardModal player={playerModal} recentForm={state.recentForm} onDraft={handlePick} isMyTurn={isMyTurn} picking={picking} onClose={() => setPlayerModal(null)} />
      )}
      {/* Team summary modal (T1.4) */}
      {teamModal && (
        <TeamSummaryModal member={teamModal} picks={picks} onClose={() => setTeamModal(null)} />
      )}
    </div>
  );
}
