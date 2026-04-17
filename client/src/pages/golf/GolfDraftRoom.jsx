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
import { ArrowLeft, Clock, Crown, Users, Timer, Shield, ChevronRight } from 'lucide-react';
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
          <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id} size={20} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#d1d5db', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>
              {flipName(p.player_name)?.split(' ').pop()}
            </div>
            <div style={{ color: '#4b5563', fontSize: 9 }}>
              {p.username}{p.auto_pick ? ' (auto)' : ''}
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
  return (
    <div style={{
      background: isMe ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.08)',
      border: `1px solid ${isMe ? 'rgba(34,197,94,0.4)' : 'rgba(139,92,246,0.3)'}`,
      borderRadius: 14, padding: '14px 18px', marginBottom: 14,
    }}>
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
function DraftBoard({ members, picks, numTeams, totalRounds, currentPick }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: numTeams * 100 }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 8px', color: '#4b5563', fontSize: 10, fontWeight: 700, textAlign: 'left', position: 'sticky', left: 0, background: '#111827', zIndex: 1 }}>Rd</th>
            {members.map(m => (
              <th key={m.user_id} style={{ padding: '6px 8px', color: '#9ca3af', fontSize: 10, fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                <td style={{ padding: '6px 8px', color: '#4b5563', fontWeight: 700, fontSize: 10, position: 'sticky', left: 0, background: '#111827', zIndex: 1 }}>
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
function AvailablePlayersList({ players, onPick, isMyTurn, picking, queue, onAddToQueue, onRemoveFromQueue }) {
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
                  <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flipName(p.player_name)}</div>
                    <div style={{ color: '#6b7280', fontSize: 11 }}>{p.odds_display || '—'}{p.world_ranking ? ` · #${p.world_ranking}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button type="button" onClick={() => inQueue ? onRemoveFromQueue(p.player_id) : onAddToQueue(p.player_id)}
                      style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', background: inQueue ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)', color: inQueue ? '#fbbf24' : '#6b7280' }}>
                      {inQueue ? '★ Queued' : '+ Queue'}
                    </button>
                    {isMyTurn && !picking && (
                      <button type="button" onClick={() => onPick(p.player_id)}
                        style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer', background: 'rgba(139,92,246,0.2)', color: '#c4b5fd' }}>
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
              <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id} size={28} />
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
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>My Team ({myPicks.length}/{totalRounds})</div>
      {myPicks.length === 0 ? (
        <p style={{ color: '#4b5563', fontSize: 12 }}>No picks yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {myPicks.map(p => (
            <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id} size={24} />
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
function PreDraftLobby({ league, members, isComm, onStart, starting, leagueId, onRefresh }) {
  return (
    <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Users size={26} style={{ color: '#a78bfa' }} />
      </div>
      <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Snake Draft Lobby</h2>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#c4b5fd', marginBottom: 16 }}>
        Draft Pending
      </div>
      <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
        {members.length} team{members.length !== 1 ? 's' : ''} joined. {isComm ? 'Set a draft time or start when ready.' : 'Waiting for commissioner to start the draft.'}
      </p>

      {/* S1.1: Draft time picker */}
      {isComm && <DraftTimePicker league={league} leagueId={leagueId} onSaved={onRefresh} />}

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, marginBottom: 20, textAlign: 'left' }}>
        <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Teams</div>
        {members.map((m, i) => (
          <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
            <span style={{ color: '#4b5563', fontSize: 11, fontWeight: 700, width: 20 }}>{i + 1}</span>
            <span style={{ color: '#d1d5db', fontSize: 13, fontWeight: 500 }}>{m.team_name || m.username}</span>
            {m.user_id === league.commissioner_id && <Crown size={12} style={{ color: '#fbbf24' }} />}
          </div>
        ))}
      </div>

      {isComm && (
        <button onClick={onStart} disabled={starting || members.length < 1}
          style={{ width: '100%', padding: '14px 24px', borderRadius: 12, background: starting ? '#374151' : 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: starting ? 'not-allowed' : 'pointer', boxShadow: '0 6px 20px rgba(124,58,237,0.25)' }}>
          {starting ? 'Starting…' : `Start Draft Now (${members.length} team${members.length !== 1 ? 's' : ''})`}
        </button>
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
      if (data.pick?.username) {
        const label = data.pick.auto_pick ? '(auto)' : '';
        showToast.info(`${data.pick.username} drafted ${flipName(data.pick.player_name)} ${label}`);
      }
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

  if (loading) return <GolfLoader />;
  if (!state) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <Alert variant="destructive" title="Could not load draft room" />
      <Link to="/golf/dashboard" style={{ color: '#4ade80', fontSize: 13, marginTop: 12, display: 'inline-block' }}>
        <ArrowLeft size={14} style={{ display: 'inline', marginRight: 4 }} /> Back to dashboard
      </Link>
    </div>
  );

  const { league, members, picks, available, currentPick, currentPicker, totalPicks, totalRounds, draftComplete, numTeams } = state;
  const isComm = league.commissioner_id === user?.id;
  const isMyTurn = currentPicker?.user_id === user?.id;

  // Sound: chime when it becomes your turn (false→true transition only)
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurn.current) playTurnChime();
    prevIsMyTurn.current = isMyTurn;
  }, [isMyTurn]);
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
        <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Full Draft Board</div>
          <DraftBoard members={members} picks={picks} numTeams={numTeams} totalRounds={totalRounds} currentPick={totalPicks + 1} />
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

      {/* Live pick ticker */}
      <PickTicker picks={picks} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }} className="draft-layout">
        <style>{`@media (max-width: 768px) { .draft-layout { grid-template-columns: 1fr !important; } }`}</style>

        <div>
          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Draft Board</div>
            <DraftBoard members={members} picks={picks} numTeams={numTeams} totalRounds={totalRounds} currentPick={currentPick} />
          </div>
          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
            <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Available Players ({available.length})</div>
            <AvailablePlayersList players={available} onPick={handlePick} isMyTurn={isMyTurn} picking={picking} queue={queue} onAddToQueue={addToQueue} onRemoveFromQueue={removeFromQueue} />
          </div>
        </div>

        <div>
          <MyRoster picks={picks} userId={user?.id} totalRounds={totalRounds} />
        </div>
      </div>
    </div>
  );
}
