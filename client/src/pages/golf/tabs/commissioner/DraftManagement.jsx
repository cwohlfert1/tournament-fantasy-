/**
 * DraftManagement — commissioner controls for snake draft leagues.
 *
 * Shows inside the Commissioner tab when league.format_type === 'draft'.
 * Provides: draft time picker, start/reset controls, draft room link,
 * override panel (post-draft), and draft status display.
 */
import { useState, useEffect } from 'react';
import { Users, Clock, Shield, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../../api';
import { showToast } from '../../../../components/ui/Toast';
import { showConfirm } from '../../../../components/ui/ConfirmDialog';
import Select from '../../../../components/ui/Select';
import PlayerAvatar from '../../../../components/golf/PlayerAvatar';

function flipName(name) {
  if (!name) return name;
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    return first ? `${first} ${last}` : last;
  }
  return name;
}

export default function DraftManagement({ leagueId, league, members }) {
  const navigate = useNavigate();
  const [draftTime, setDraftTime] = useState(league.draft_start_time ? new Date(league.draft_start_time).toISOString().slice(0, 16) : '');
  const [savingTime, setSavingTime] = useState(false);
  const [starting, setStarting] = useState(false);

  // Override state
  const [draftState, setDraftState] = useState(null);
  const [overrideUser, setOverrideUser] = useState('');
  const [overrideOld, setOverrideOld] = useState('');
  const [overrideNew, setOverrideNew] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);

  useEffect(() => {
    if (league.draft_status === 'completed') {
      api.get(`/golf/draft/${leagueId}/state`).then(r => setDraftState(r.data)).catch(() => {});
    }
  }, [leagueId, league.draft_status]);

  const isLocked = league.draft_start_time && (new Date(league.draft_start_time) - Date.now()) < 10 * 60 * 1000 && (new Date(league.draft_start_time) - Date.now()) > 0;

  async function saveDraftTime() {
    if (!draftTime) return;
    setSavingTime(true);
    try {
      await api.patch(`/golf/draft/${leagueId}/time`, { draft_start_time: new Date(draftTime).toISOString() });
      showToast.success('Draft time updated');
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to update time');
    } finally {
      setSavingTime(false);
    }
  }

  async function startDraft() {
    const ok = await showConfirm({
      title: 'Start the draft now?',
      description: `${members.length} team${members.length !== 1 ? 's' : ''} will draft ${league.picks_per_team || 7} players each in snake order. This cannot be undone.`,
      confirmLabel: 'Start draft',
      variant: 'warning',
    });
    if (!ok) return;
    setStarting(true);
    try {
      await api.post(`/golf/draft/${leagueId}/start`);
      showToast.success('Draft started!');
      navigate(`/golf/league/${leagueId}/draft-room`);
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to start draft');
    } finally {
      setStarting(false);
    }
  }

  async function handleOverride() {
    if (!overrideUser || !overrideOld || !overrideNew || overrideReason.trim().length < 3) return;
    const ok = await showConfirm({
      title: 'Override this pick?',
      description: 'This swap will be logged. Scores update on next sync.',
      confirmLabel: 'Override pick',
      variant: 'warning',
    });
    if (!ok) return;
    setOverriding(true);
    try {
      await api.post(`/golf/draft/${leagueId}/override-pick`, {
        user_id: overrideUser, old_player_id: overrideOld, new_player_id: overrideNew, reason: overrideReason.trim(),
      });
      showToast.success('Pick overridden');
      setOverrideOld(''); setOverrideNew(''); setOverrideReason('');
      api.get(`/golf/draft/${leagueId}/state`).then(r => setDraftState(r.data)).catch(() => {});
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Override failed');
    } finally {
      setOverriding(false);
    }
  }

  const userPicks = draftState?.picks?.filter(p => p.user_id === overrideUser) || [];
  const allDraftedIds = new Set((draftState?.picks || []).map(p => p.player_id));

  return (
    <div style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Users size={16} style={{ color: '#a78bfa' }} />
        <span style={{ color: '#c4b5fd', fontSize: 13, fontWeight: 700 }}>Snake Draft Management</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: league.draft_status === 'completed' ? 'rgba(34,197,94,0.15)' : league.draft_status === 'drafting' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
          color: league.draft_status === 'completed' ? '#4ade80' : league.draft_status === 'drafting' ? '#c4b5fd' : '#6b7280',
          border: `1px solid ${league.draft_status === 'completed' ? 'rgba(34,197,94,0.3)' : league.draft_status === 'drafting' ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.1)'}`,
        }}>
          {league.draft_status === 'completed' ? 'Complete' : league.draft_status === 'drafting' ? 'Live' : 'Pending'}
        </span>
      </div>

      {/* Draft time picker — pre-draft only */}
      {league.draft_status === 'pending' && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#9ca3af', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
            Draft Time {isLocked && <span style={{ color: '#f59e0b', marginLeft: 4 }}>🔒 Locked</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="datetime-local" value={draftTime} onChange={e => setDraftTime(e.target.value)} disabled={isLocked}
              style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' }} />
            <button type="button" onClick={saveDraftTime} disabled={savingTime || isLocked || !draftTime}
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', cursor: 'pointer', opacity: savingTime || isLocked ? 0.5 : 1 }}>
              {savingTime ? 'Saving…' : 'Set'}
            </button>
          </div>
          {league.draft_start_time && (
            <p style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
              Scheduled: {new Date(league.draft_start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}

      {/* Start draft button — pre-draft only */}
      {league.draft_status === 'pending' && (
        <button type="button" onClick={startDraft} disabled={starting || members.length < 1}
          style={{ width: '100%', padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', boxShadow: '0 4px 14px rgba(124,58,237,0.25)', marginBottom: 12 }}>
          {starting ? 'Starting…' : `🐍 Start Draft (${members.length} team${members.length !== 1 ? 's' : ''})`}
        </button>
      )}

      {/* Enter draft room — drafting or completed */}
      {league.draft_status !== 'pending' && (
        <button type="button" onClick={() => navigate(`/golf/league/${leagueId}/draft-room`)}
          style={{ width: '100%', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.1)', color: '#c4b5fd', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
          {league.draft_status === 'drafting' ? '🐍 Join Draft Room' : 'View Draft Results'} <ArrowRight size={14} />
        </button>
      )}

      {/* Commissioner override — post-draft only */}
      {league.draft_status === 'completed' && draftState && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Shield size={13} style={{ color: '#f59e0b' }} />
            <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pick Override</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Select value={overrideUser} onChange={setOverrideUser} placeholder="Select team" fullWidth size="sm"
              options={members.map(m => ({ value: m.user_id, label: m.team_name || m.username }))} />
            {overrideUser && (
              <Select value={overrideOld} onChange={setOverrideOld} placeholder="Player to replace" fullWidth size="sm"
                options={userPicks.map(p => ({ value: p.player_id, label: `${flipName(p.player_name)} (Rd ${p.round})` }))} />
            )}
            {overrideOld && (
              <Select value={overrideNew} onChange={setOverrideNew} placeholder="Replacement player" fullWidth size="sm"
                options={(draftState.available || []).filter(p => !allDraftedIds.has(p.player_id) || p.player_id === overrideOld).map(p => ({
                  value: p.player_id, label: `${flipName(p.player_name)} — ${p.odds_display || '?'}`,
                }))} />
            )}
            <input type="text" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} placeholder="Reason (required, min 3 chars)"
              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 12, outline: 'none' }} />
            <button type="button" disabled={overriding || !overrideUser || !overrideOld || !overrideNew || overrideReason.trim().length < 3} onClick={handleOverride}
              style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#fbbf24', cursor: 'pointer', opacity: overriding ? 0.5 : 1 }}>
              {overriding ? 'Overriding…' : 'Override Pick'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
