/**
 * UnpaidSection — amber Broadcast Ticker banner + detailed unpaid-entry
 * table with "Download CSV" and "Send Reminder" actions.
 *
 * Shows only when the league has a buy-in AND at least one entry is
 * still unpaid. Parent (CommissionerTab) owns data fetching, CSV
 * download, and reminder-send side effects — this component is pure
 * presentation.
 */
export default function UnpaidSection({
  unpaidList,
  onDownloadCsv,
  onSendReminders,
  sending,
}) {
  if (!unpaidList || !unpaidList.unpaid_count) return null;

  return (
    <div data-testid="unpaid-entries-section" style={{
      position: 'relative',
      background: 'linear-gradient(to right, rgba(245,158,11,0.06), rgba(15,23,35,0.4) 50%)',
      border: '1px solid rgba(245,158,11,0.28)',
      borderLeft: '3px solid #f59e0b',
      borderRadius: 10,
      padding: '14px 16px',
      boxShadow: '-4px 0 14px -3px rgba(245,158,11,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <div>
            <div style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em', lineHeight: 1.35 }}>Unpaid Entries</div>
            <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 3, lineHeight: 1.45 }}>
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>{unpaidList.unpaid_count}</span> of {unpaidList.total_entries} entries still need payment
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="unpaid-csv-button"
            onClick={onDownloadCsv}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#d1d5db' }}
          >Download CSV</button>
          <button
            type="button"
            data-testid="unpaid-remind-button"
            onClick={onSendReminders}
            disabled={sending}
            style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.18)', color: '#fbbf24', letterSpacing: '-0.005em' }}
          >{sending ? 'Sending…' : 'Send Reminder'}</button>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {unpaidList.unpaid.map((u, i) => (
          <div
            key={`${u.user_id}_${u.entry_number}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1.6fr 0.5fr 0.9fr 0.5fr',
              gap: 10,
              alignItems: 'center',
              padding: '10px 4px',
              borderBottom: i === unpaidList.unpaid.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
              fontSize: 12,
            }}
          >
            <div style={{ color: '#ffffff', fontWeight: 600 }}>{u.full_name || u.username}</div>
            <div style={{ color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
            <div style={{ color: '#6b7280' }}>#{u.entry_number}</div>
            <div style={{ color: '#6b7280' }}>{u.entry_date ? new Date(u.entry_date).toLocaleDateString() : '—'}</div>
            <div style={{ color: '#fbbf24', fontWeight: 700, textAlign: 'right' }}>UNPAID</div>
          </div>
        ))}
      </div>
    </div>
  );
}
