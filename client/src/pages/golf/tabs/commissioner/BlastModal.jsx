/**
 * BlastModal — editable-before-send confirmation modal for commissioner
 * messages (the "Picks Reminder", "Pay Your Buy-In" quick-send buttons
 * open this with a pre-filled message).
 */
import { useState } from 'react';
import api from '../../../../api';

export default function BlastModal({ leagueId, memberCount, initialMsg, onClose }) {
  const [msg, setMsg]           = useState(initialMsg);
  const [sending, setSending]   = useState(false);
  const [sentCount, setSentCount] = useState(null);
  const [sendError, setSendError] = useState('');

  async function send() {
    if (!msg.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const r = await api.post(`/golf/leagues/${leagueId}/blast`, { message: msg });
      setSentCount(r.data.sent ?? 0);
      setTimeout(() => onClose(), 3000);
    } catch (err) {
      setSendError(err.response?.data?.error || 'Failed to send. Please try again.');
    }
    setSending(false);
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={() => { if (!sending) onClose(); }}
    >
      <div
        style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 20,
          padding: 24, maxWidth: 480, width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ color: '#fff', fontWeight: 800, fontSize: 15, margin: '0 0 4px' }}>
          Send to all members
        </h3>
        <p style={{ color: '#4b5563', fontSize: 12, margin: '0 0 14px' }}>
          Edit the message below before sending.
        </p>
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={9}
          disabled={sentCount !== null}
          style={{
            width: '100%', background: '#111827', border: '1px solid #1f2937',
            borderRadius: 10, padding: '10px 12px', color: '#e5e7eb', fontSize: 13,
            resize: 'vertical', lineHeight: 1.65, fontFamily: 'inherit',
            boxSizing: 'border-box', opacity: sentCount !== null ? 0.5 : 1,
          }}
        />
        {sendError && (
          <p style={{ color: '#f87171', fontSize: 12, margin: '10px 0 0' }}>{sendError}</p>
        )}
        {sentCount !== null ? (
          <p style={{ color: '#4ade80', fontSize: 14, fontWeight: 700,
            textAlign: 'center', margin: '14px 0 0' }}>
            ✓ Sent to {sentCount} members
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              disabled={sending || !msg.trim()}
              onClick={send}
              style={{
                flex: 1, background: '#16a34a', border: 'none', borderRadius: 10,
                padding: '11px 0', color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: sending || !msg.trim() ? 'not-allowed' : 'pointer',
                opacity: sending || !msg.trim() ? 0.5 : 1,
              }}
            >
              {sending ? 'Sending…' : `Send to all ${memberCount ?? ''} members`}
            </button>
            <button
              onClick={onClose}
              style={{
                background: '#1f2937', border: 'none', borderRadius: 10,
                padding: '11px 18px', color: '#9ca3af', fontWeight: 600,
                fontSize: 13, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
