/**
 * GolfDraftRoom — real-time snake draft room for golf pools.
 *
 * Core flow:
 *   1. Commissioner clicks "Start Draft" → draft_status = 'drafting'
 *   2. Players take turns picking golfers in snake order
 *   3. "On the clock" indicator + countdown timer
 *   4. Available players sorted by odds (favorites first)
 *   5. Draft board shows all picks in grid layout
 *   6. When complete → pool_picks populated → scoring works
 *
 * Socket events (via golf_draft room):
 *   - golf_draft_pick: { pick, nextPickUserId, draftComplete }
 *   - golf_draft_started: { leagueId }
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Crown, Search, Check, Lock, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import socket, { connectSocket } from '../../socket';
import GolfLoader from '../../components/golf/GolfLoader';
import PlayerAvatar from '../../components/golf/PlayerAvatar';
import Alert from '../../components/ui/Alert';
import { showToast } from '../../components/ui/Toast';

function flipName(name) {
  if (!name) return name;
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    return first ? `${first} ${last}` : last;
  }
  return name;
}

// ── On-the-clock banner ──────────────────────────────────────────────────────
function ClockBanner({ picker, isMe, pickNumber, totalPicks, round }) {
  return (
    <div style={{
      background: isMe ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.08)',
      border: `1px solid ${isMe ? 'rgba(34,197,94,0.4)' : 'rgba(139,92,246,0.3)'}`,
      borderRadius: 14, padding: '14px 18px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: isMe ? '#4ade80' : '#c4b5fd', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
            {isMe ? 'You are on the clock' : 'On the clock'}
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
    </div>
  );
}

// ── Draft board grid ─────────────────────────────────────────────────────────
function DraftBoard({ members, picks, numTeams, totalRounds, currentPick }) {
  const currentRound = Math.ceil((currentPick || 1) / numTeams);
  return (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
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
            const isSnakeReverse = round % 2 === 0;
            const orderedMembers = isSnakeReverse ? [...members].reverse() : members;
            const isActiveRound = round === currentRound;
            return (
              <tr key={round} style={{ background: isActiveRound ? 'rgba(139,92,246,0.05)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '6px 8px', color: '#4b5563', fontWeight: 700, fontSize: 10, position: 'sticky', left: 0, background: '#111827', zIndex: 1 }}>
                  {round} <span style={{ color: '#374151', fontSize: 8 }}>{isSnakeReverse ? '←' : '→'}</span>
                </td>
                {orderedMembers.map((m, ci) => {
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
                          <span style={{ color: '#d1d5db', fontSize: 10, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                            {flipName(pick.player_name)?.split(' ').pop()}
                          </span>
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

// ── Available players list ───────────────────────────────────────────────────
function AvailablePlayersList({ players, onPick, isMyTurn, picking }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = q ? players.filter(p => flipName(p.player_name)?.toLowerCase().includes(q)) : players;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search available players…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
            padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none',
          }}
        />
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <p style={{ color: '#4b5563', textAlign: 'center', padding: 24, fontSize: 13 }}>No players available</p>
        )}
        {filtered.map(p => (
          <button
            key={p.player_id}
            type="button"
            disabled={!isMyTurn || picking}
            onClick={() => onPick(p.player_id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: 'transparent', border: 'none', textAlign: 'left',
              cursor: isMyTurn && !picking ? 'pointer' : 'default',
              opacity: isMyTurn ? 1 : 0.5,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (isMyTurn) e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {flipName(p.player_name)}
              </div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>
                {p.odds_display || '—'}{p.world_ranking ? ` · #${p.world_ranking}` : ''}
              </div>
            </div>
            {isMyTurn && !picking && (
              <div style={{ color: '#a78bfa', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>Draft</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── My roster sidebar ────────────────────────────────────────────────────────
function MyRoster({ picks, userId, totalRounds }) {
  const myPicks = picks.filter(p => p.user_id === userId);
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        My Team ({myPicks.length}/{totalRounds})
      </div>
      {myPicks.length === 0 ? (
        <p style={{ color: '#4b5563', fontSize: 12 }}>No picks yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {myPicks.map(p => (
            <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlayerAvatar name={p.player_name} tier={p.tier_number} espnPlayerId={p.espn_player_id} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#d1d5db', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {flipName(p.player_name)}
                </div>
              </div>
              <span style={{ color: '#6b7280', fontSize: 10, flexShrink: 0 }}>Rd {p.round}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pre-draft lobby ──────────────────────────────────────────────────────────
function PreDraftLobby({ league, members, isComm, onStart, starting }) {
  return (
    <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Users size={26} style={{ color: '#a78bfa' }} />
      </div>
      <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Snake Draft Lobby</h2>
      <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 24 }}>
        {members.length} of {league.max_teams} teams joined. {isComm ? 'Start the draft when ready.' : 'Waiting for commissioner to start the draft.'}
      </p>

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
        <button
          onClick={onStart}
          disabled={starting || members.length < 2}
          style={{
            width: '100%', padding: '14px 24px', borderRadius: 12,
            background: starting || members.length < 2 ? '#374151' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            color: '#fff', fontWeight: 700, fontSize: 15, border: 'none',
            cursor: starting || members.length < 2 ? 'not-allowed' : 'pointer',
            boxShadow: '0 6px 20px rgba(124,58,237,0.25)',
          }}
        >
          {starting ? 'Starting…' : `Start Draft (${members.length} teams)`}
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
  const boardRef = useRef(null);

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

  // Socket: real-time draft events
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    connectSocket(token);
    socket.emit('join_golf_draft', { leagueId: id, token });

    socket.on('golf_draft_pick', (data) => {
      // Reload full state on each pick for simplicity
      loadState();
      if (data.pick?.username) {
        showToast.info(`${data.pick.username} drafted ${flipName(data.pick.player_name)}`);
      }
      if (data.draftComplete) {
        showToast.success('Draft complete! Picks have been locked in.');
      }
    });

    socket.on('golf_draft_started', () => {
      showToast.info('The draft has started!');
      loadState();
    });

    return () => {
      socket.off('golf_draft_pick');
      socket.off('golf_draft_started');
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
  const currentRound = Math.ceil((currentPick || 1) / numTeams);

  async function handlePick(playerId) {
    setPicking(true);
    try {
      const r = await api.post(`/golf/draft/${id}/pick`, { player_id: playerId });
      // Socket will handle state refresh, but optimistic update too
      loadState();
      if (r.data.draftComplete) {
        showToast.success('Draft complete!');
      }
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

  // Pre-draft lobby
  if (league.draft_status === 'pending') {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <Link to={`/golf/league/${id}`} style={{ color: '#6b7280', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
          <ArrowLeft size={14} /> Back to league
        </Link>
        <PreDraftLobby league={league} members={members} isComm={isComm} onStart={handleStart} starting={starting} />
      </div>
    );
  }

  // Draft complete
  if (draftComplete) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <Link to={`/golf/league/${id}?tab=standings`} style={{ color: '#6b7280', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
          <ArrowLeft size={14} /> Back to standings
        </Link>
        <Alert variant="success" title="Draft complete!" style={{ marginBottom: 16 }}>
          All {totalPicks} picks are locked in. Scores will update automatically once the tournament begins.
        </Alert>
        <DraftBoard members={members} picks={picks} numTeams={numTeams} totalRounds={totalRounds} currentPick={totalPicks + 1} />
        <MyRoster picks={picks} userId={user?.id} totalRounds={totalRounds} />
      </div>
    );
  }

  // Active draft
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Link to={`/golf/league/${id}`} style={{ color: '#6b7280', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft size={12} /> {league.name}
          </Link>
          <h1 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginTop: 2 }}>Snake Draft</h1>
        </div>
        <div style={{ color: '#6b7280', fontSize: 12 }}>
          {league.pool_tournament_name || 'Tournament'} · {numTeams} teams · {totalRounds} rounds
        </div>
      </div>

      {/* On-the-clock */}
      <ClockBanner
        picker={currentPicker}
        isMe={isMyTurn}
        pickNumber={currentPick}
        totalPicks={totalPicks}
        round={currentRound}
      />

      {/* Main layout: board + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }} className="draft-layout">
        <style>{`@media (max-width: 768px) { .draft-layout { grid-template-columns: 1fr !important; } }`}</style>

        {/* Left: Draft board + available players */}
        <div>
          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Draft Board</div>
            <DraftBoard members={members} picks={picks} numTeams={numTeams} totalRounds={totalRounds} currentPick={currentPick} />
          </div>

          <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14 }}>
            <div style={{ color: '#9ca3af', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Available Players ({available.length})
            </div>
            <AvailablePlayersList players={available} onPick={handlePick} isMyTurn={isMyTurn} picking={picking} />
          </div>
        </div>

        {/* Right: My roster */}
        <div>
          <MyRoster picks={picks} userId={user?.id} totalRounds={totalRounds} />
        </div>
      </div>
    </div>
  );
}
