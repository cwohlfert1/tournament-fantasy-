/**
 * ReinviteFromPastLeague — shared UI block for the "Re-invite Past Members" flow.
 *
 * Used in two places:
 *   1. CreateGolfLeague success screen (right after a new pool is created)
 *   2. CommissionerTab settings panel (anytime, for an existing pool)
 *
 * Behavior:
 *   - Fetches GET /golf/commissioner/past-leagues on mount (pool format only)
 *   - Excludes the target league itself from the dropdown
 *   - Shows member count for the selected source league
 *   - POST /golf/commissioner/{targetId}/reinvite with source_league_id
 *   - Handles 409 (24h guard) with confirm dialog
 *   - Reports "X of Y sent" or "X of Y sent (Z failed)"
 */
import { useState, useEffect } from 'react';
import api from '../../api';
import { showConfirm } from '../ui/ConfirmDialog';

export default function ReinviteFromPastLeague({ targetLeagueId, targetLeagueName, onClose }) {
  const [pastLeagues, setPastLeagues]     = useState(null); // null = loading, [] = none
  const [selectedId, setSelectedId]       = useState('');
  const [sending, setSending]             = useState(false);
  const [result, setResult]               = useState(null); // { ok, sent, total, failed } | null
  const [error, setError]                 = useState('');

  useEffect(() => {
    api.get('/golf/commissioner/past-leagues')
      .then(r => {
        // Exclude the target itself + leagues with no members
        const list = (r.data?.leagues || []).filter(l => l.id !== targetLeagueId && l.member_count > 0);
        setPastLeagues(list);
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Failed to load past leagues');
        setPastLeagues([]);
      });
  }, [targetLeagueId]);

  const selected = pastLeagues?.find(l => l.id === selectedId) || null;

  async function send({ confirm = false } = {}) {
    if (!selectedId) return;
    setSending(true);
    setError('');
    try {
      const r = await api.post(`/golf/commissioner/${targetLeagueId}/reinvite`, {
        source_league_id: selectedId,
        confirm,
      });
      setResult(r.data);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.recently_sent) {
        const when = data.last_sent_at ? new Date(data.last_sent_at).toLocaleString() : 'recently';
        const ok = await showConfirm({
          title: 'Send re-invites again?',
          description: `Re-invite emails were already sent for this pool ${when}. Send again anyway?`,
          confirmLabel: 'Send again',
          variant: 'warning',
        });
        if (ok) { setSending(false); return send({ confirm: true }); }
      } else {
        setError(data?.error || 'Failed to send invites');
      }
    }
    setSending(false);
  }

  if (pastLeagues === null) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#6b7280', fontSize: 13 }}>Loading past leagues…</div>
      </div>
    );
  }

  if (pastLeagues.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Re-invite Past Members</div>
        <div style={{ color: '#6b7280', fontSize: 12 }}>
          You don't have any other pool leagues with members yet.
        </div>
        {onClose && (
          <button type="button" onClick={onClose} style={{ ...btnSecondary, marginTop: 12 }}>Close</button>
        )}
      </div>
    );
  }

  if (result) {
    return (
      <div data-testid="reinvite-success" style={{ ...cardStyle, borderColor: 'rgba(34,197,94,0.4)' }}>
        <div style={{ color: '#4ade80', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          ✓ {result.sent} of {result.total} invites sent{result.failed > 0 ? ` (${result.failed} failed)` : ''}
        </div>
        {result.skipped_existing > 0 && (
          <div style={{ color: '#9ca3af', fontSize: 12 }}>
            {result.skipped_existing} member{result.skipped_existing === 1 ? '' : 's'} already in this pool — skipped.
          </div>
        )}
        {onClose && (
          <button type="button" onClick={onClose} style={{ ...btnSecondary, marginTop: 12 }}>Done</button>
        )}
      </div>
    );
  }

  return (
    <div data-testid="reinvite-section" style={cardStyle}>
      <div style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        Re-invite Past Members
      </div>
      <p style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.5, marginTop: 0, marginBottom: 12 }}>
        Pick a past pool — we'll email those members a link to join{targetLeagueName ? ` "${targetLeagueName}"` : ' this pool'}.
        Members already in this pool are skipped automatically.
      </p>

      <select
        data-testid="reinvite-source-select"
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        disabled={sending}
        className="input w-full text-sm"
        style={{ marginBottom: 10 }}
      >
        <option value="">— Select a past pool —</option>
        {pastLeagues.map(l => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.member_count} member{l.member_count === 1 ? '' : 's'})
            {l.tournament_name ? ` · ${l.tournament_name}` : ''}
          </option>
        ))}
      </select>

      {selected && (
        <div data-testid="reinvite-preview" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#d1d5db' }}>
          <strong style={{ color: '#fff' }}>{selected.member_count}</strong> member{selected.member_count === 1 ? '' : 's'} from <strong style={{ color: '#fff' }}>{selected.name}</strong> will be invited.
        </div>
      )}

      {error && (
        <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          data-testid="reinvite-send-button"
          onClick={() => send()}
          disabled={!selectedId || sending}
          style={!selectedId || sending ? btnPrimaryDisabled : btnPrimary}
        >{sending ? 'Sending…' : 'Send Invites'}</button>
        {onClose && (
          <button type="button" onClick={onClose} disabled={sending} style={btnSecondary}>Skip</button>
        )}
      </div>
    </div>
  );
}

const cardStyle = {
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '14px 16px',
};
const btnPrimary = {
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  border: '1px solid rgba(34,197,94,0.5)', background: 'rgba(34,197,94,0.18)', color: '#4ade80',
};
const btnPrimaryDisabled = { ...btnPrimary, cursor: 'not-allowed', opacity: 0.5 };
const btnSecondary = {
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#d1d5db',
};
