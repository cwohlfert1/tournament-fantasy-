import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../../components/ui';
import api from '../../../api';
import GolfPaymentModal from '../../../components/golf/GolfPaymentModal';
import ReinviteFromPastLeague from '../../../components/golf/ReinviteFromPastLeague';
import { POOL_TIERS } from '../../../utils/poolPricing';
import { parseSheetRows } from '../../../utils/importHelpers';

// ── Email copy modal — proper "Copy All" UX (replaces window.prompt fallback)
// Mobile users got a useless OK/Cancel dialog before. Now they get a textarea
// pre-selected on open + a clipboard-icon button that flips to "Copied!" with
// a checkmark for 2s before resetting.
function EmailCopyModal({ emails, count, onClose }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);

  // Auto-select textarea content on open so even tap-to-copy works
  useEffect(() => {
    const t = textRef.current;
    if (t) { t.focus(); t.select(); }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(emails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers: select + execCommand fallback
      const t = textRef.current;
      if (t) {
        t.focus(); t.select();
        try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      }
    }
  }

  return (
    <div
      onClick={onClose}
      data-testid="email-copy-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520,
        background: '#0d0d0d',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{count} Email Address{count === 1 ? '' : 'es'}</div>
          <button onClick={onClose} type="button" aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 0, marginBottom: 10 }}>
          Tap Copy All, then paste into your email client's BCC field.
        </p>
        <textarea
          ref={textRef}
          readOnly
          value={emails}
          rows={6}
          style={{
            width: '100%', resize: 'vertical', minHeight: 110,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '10px 12px',
            color: '#e5e7eb', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            lineHeight: 1.5, outline: 'none',
          }}
        />
        <button
          type="button"
          data-testid="copy-all-button"
          onClick={handleCopy}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', marginTop: 12, padding: '11px 16px', borderRadius: 10,
            border: copied ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(34,197,94,0.4)',
            background: copied ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.14)',
            color: '#4ade80', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              {/* Two-overlapping-squares clipboard icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy All
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'block', margin: '10px auto 0',
            background: 'transparent', border: 'none', color: '#6b7280',
            fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
          }}
        >Close</button>
      </div>
    </div>
  );
}

// ── Blast confirmation modal ──────────────────────────────────────────────────
function BlastModal({ leagueId, memberCount, initialMsg, onClose }) {
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

// ── Custom blast textarea ─────────────────────────────────────────────────────
function MassBlast({ leagueId }) {
  const [msg, setMsg]         = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function send() {
    if (!msg.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post(`/golf/leagues/${leagueId}/blast`, { message: msg });
      setSent(true);
      setMsg('');
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Or write a custom message to all league members…"
        rows={3}
        className="input w-full resize-none text-sm"
      />
      {sent  && <p className="text-green-400 text-xs">Message sent to all members!</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        onClick={send}
        disabled={loading || !msg.trim()}
        className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Sending…' : 'Send to all members'}
      </button>
    </div>
  );
}

// ── Referral section ──────────────────────────────────────────────────────────
function ReferralSection() {
  const [data, setData]   = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/golf/referral/my-code').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="text-gray-600 text-xs">Loading…</div>;

  function copy() {
    navigator.clipboard.writeText(data.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
        <span className="text-gray-400 text-xs truncate flex-1">{data.link}</span>
        <button onClick={copy} className="text-green-400 text-xs font-bold shrink-0">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-gray-500 text-xs">
        {data.creditsAvailable > 0
          ? `You have $${data.creditsAvailable.toFixed(2)} referral credit available.`
          : `Earn $1 credit for each friend who joins and pays.`}
      </p>
    </div>
  );
}

// ── CSV template download helper ─────────────────────────────────────────────
function downloadCsvTemplate() {
  const csv = 'Name,Email\nAlice Smith,alice@example.com\nBob Jones,bob@example.com\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'league-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── ImportSection ─────────────────────────────────────────────────────────────
function ImportSection({ leagueId, leagueName }) {
  const [preview, setPreview]   = useState(null);  // Array<{email,name}> | null
  const [parseErrors, setParseErrors] = useState([]);
  const [importing, setImporting]     = useState(false);
  const [result, setResult]           = useState(null); // { imported, existing, skipped, errors }
  const [importError, setImportError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setImportError('');

    try {
      const { read, utils } = await import('xlsx');
      const buf  = await file.arrayBuffer();
      const wb   = read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { header: 1, defval: '' });

      const { members, errors } = parseSheetRows(rows);
      setPreview(members);
      setParseErrors(errors);
    } catch (err) {
      setImportError('Could not parse file: ' + err.message);
      setPreview(null);
      setParseErrors([]);
    }
    // Reset file input so the same file can be re-selected after cancel
    e.target.value = '';
  }

  async function confirmImport() {
    if (!preview?.length) return;
    setImporting(true);
    setImportError('');
    try {
      const r = await api.post(`/golf/leagues/${leagueId}/import-members`, { members: preview });
      setResult(r.data);
      setPreview(null);
      setParseErrors([]);
    } catch (err) {
      setImportError(err.response?.data?.error || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  const sectionStyle = { background: '#080f0c', border: '1px solid #1a2e1f', borderRadius: 10, padding: '14px 16px', marginBottom: 0 };
  const labelStyle   = { color: '#4b5563', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' };

  return (
    <div style={sectionStyle}>
      <p style={labelStyle}>Import Members</p>

      {/* Result summary */}
      {result && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ color: '#4ade80', fontWeight: 700, fontSize: 13, margin: '0 0 4px' }}>Import complete</p>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
            {result.imported} added &nbsp;·&nbsp; {result.existing} already in league &nbsp;·&nbsp; {result.skipped} skipped
          </p>
          {result.errors?.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ color: '#f87171', fontSize: 12 }}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* File picker */}
      {!preview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            color: '#4ade80', borderRadius: 8, padding: '6px 14px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <span>📂</span> Choose File (.xlsx, .xls, .csv)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </label>
          <button
            onClick={downloadCsvTemplate}
            style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Download template
          </button>
        </div>
      )}

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
          {parseErrors.map((e, i) => <li key={i} style={{ color: '#fbbf24', fontSize: 12 }}>{e}</li>)}
        </ul>
      )}

      {/* Preview table */}
      {preview && preview.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>
            <strong style={{ color: '#ffffff' }}>{preview.length}</strong> member{preview.length !== 1 ? 's' : ''} detected — confirm to send invites.
          </p>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #1f2937', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0d1117' }}>
                  <th style={{ color: '#6b7280', fontWeight: 600, padding: '6px 12px', textAlign: 'left' }}>Email</th>
                  <th style={{ color: '#6b7280', fontWeight: 600, padding: '6px 12px', textAlign: 'left' }}>Name</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #1f2937' }}>
                    <td style={{ color: '#d1d5db', padding: '5px 12px' }}>{row.email}</td>
                    <td style={{ color: '#9ca3af', padding: '5px 12px' }}>{row.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={confirmImport}
              disabled={importing}
              style={{
                background: importing ? 'rgba(34,197,94,0.3)' : '#22c55e',
                color: '#0a1a10', border: 'none', borderRadius: 8,
                padding: '7px 18px', fontSize: 13, fontWeight: 700,
                cursor: importing ? 'not-allowed' : 'pointer',
              }}
            >
              {importing ? 'Importing…' : `Import ${preview.length} member${preview.length !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={() => { setPreview(null); setParseErrors([]); }}
              disabled={importing}
              style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {importError && (
        <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{importError}</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CommissionerTab({ leagueId, leagueName, members, league }) {
  const [promoData, setPromoData]   = useState(null);
  const [isPaid, setIsPaid]         = useState(false);
  const [showGate, setShowGate]     = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  const [balancePreview, setBalancePreview] = useState(null);
  const [balancing, setBalancing]   = useState(false);
  const [balanceDone, setBalanceDone] = useState(false);

  // Capacity upsell
  const [capacityDismissed, setCapacityDismissed] = useState(false);
  const [upgrading, setUpgrading]   = useState(false);
  const [upgradeError, setUpgradeError] = useState('');

  // Salary cap settings
  const [scCap,          setScCap]          = useState(String(league?.weekly_salary_cap ?? 50000));
  const [scStarters,     setScStarters]     = useState(String(league?.starters_per_week ?? league?.roster_size ?? 6));
  const [scScoringStyle, setScScoringStyle] = useState(league?.scoring_style ?? 'tourneyrun');

  // Pool settings
  const [buyIn, setBuyIn] = useState(String(league?.buy_in_amount ?? 0));

  // Dynamic payout splits — source of truth is payout_places JSONB.
  const [payoutSplits, setPayoutSplits] = useState(() => {
    let places = [];
    try {
      const raw = league?.payout_places;
      if (Array.isArray(raw)) places = raw;
      else if (typeof raw === 'string' && raw) places = JSON.parse(raw);
    } catch {}
    return (Array.isArray(places) && places.length > 0)
      ? places
      : [{ place: 1, pct: 70 }, { place: 2, pct: 20 }, { place: 3, pct: 10 }];
  });
  // Admin fee: type ('flat' | 'percent') + value. Null type = no fee.
  const [adminFeeType, setAdminFeeType] = useState(league?.admin_fee_type || 'percent');
  const [adminFeeValue, setAdminFeeValue] = useState(
    league?.admin_fee_value != null ? String(league.admin_fee_value) : ''
  );
  const [adminFeeEnabled, setAdminFeeEnabled] = useState(
    !!league?.admin_fee_type && parseFloat(league?.admin_fee_value) > 0
  );
  const [picksPerTeam, setPicksPerTeam] = useState(String(league?.picks_per_team ?? 8));
  const [dropCount, setDropCount] = useState(String(league?.pool_drop_count ?? 2));
  const [maxEntries, setMaxEntries] = useState(String(league?.pool_max_entries ?? 1));
  // Highlight the re-invite prompt when the user just landed from create flow
  const [searchParams] = useSearchParams();
  const justCreated = searchParams.get('just_created') === '1';
  // Missed-cut rule: locked once tournament goes active.
  const [missedCutRule, setMissedCutRule] = useState(league?.missed_cut_rule || 'fixed');
  const [missedCutPenalty, setMissedCutPenalty] = useState(String(league?.missed_cut_penalty ?? 8));
  const tournamentActive = league?.pool_tournament_status === 'active';
  const [tierPicksCfg, setTierPicksCfg] = useState(() => {
    try { return JSON.parse(league?.pool_tiers || '[]'); } catch { return []; }
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved,  setSettingsSaved]  = useState(false);
  const [settingsError,  setSettingsError]  = useState('');

  // Payment methods
  const [venmo,  setVenmo]  = useState(league?.venmo  || '');
  const [zelle,  setZelle]  = useState(league?.zelle  || '');
  const [paypal, setPaypal] = useState(league?.paypal || '');
  const [pmSaving, setPmSaving] = useState(false);
  const [pmSaved,  setPmSaved]  = useState(false);

  // Score sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  // Apply Round 2 Drops
  const [applyingDrops, setApplyingDrops] = useState(false);
  const [dropResult, setDropResult] = useState(null);

  // Roster editor
  const [editingEntry, setEditingEntry] = useState(null); // { userId, entryNumber, username, teamName }
  const [entryPicks, setEntryPicks] = useState([]);
  const [availableByTier, setAvailableByTier] = useState({});
  const [swapping, setSwapping] = useState(null); // { pick } when browsing replacements
  const [swapConfirm, setSwapConfirm] = useState(null); // { oldPick, newPlayer } when confirming
  const [swapLoading, setSwapLoading] = useState(false);

  // Delete entry
  const [deletingEntry, setDeletingEntry] = useState(null); // { userId, entryNumber, username, teamName }
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Unpaid entry tracking
  const [unpaidSummary, setUnpaidSummary] = useState(null);
  const [unpaidList, setUnpaidList] = useState(null);   // { unpaid: [...], total_entries, unpaid_count }
  const [remindingSending, setRemindingSending] = useState(false);
  const [unpaidBannerDismissed, setUnpaidBannerDismissed] = useState(false);

  function fetchUnpaid() {
    // Always fetch — Pool Communications + Roster export are valuable on free
    // pools too. Unpaid Entries section gates separately on buy_in_amount > 0.
    api.get(`/golf/leagues/${leagueId}/unpaid-summary`).then(r => setUnpaidSummary(r.data)).catch(() => {});
    api.get(`/golf/commissioner/${leagueId}/unpaid`).then(r => setUnpaidList(r.data)).catch(() => {});
  }
  useEffect(fetchUnpaid, [leagueId, league?.buy_in_amount]); // eslint-disable-line

  async function sendPayReminders({ confirm = false } = {}) {
    setRemindingSending(true);
    try {
      const r = await api.post(`/golf/commissioner/${leagueId}/unpaid/remind`, { confirm });
      alert(`Reminders sent to ${r.data.sent} unpaid member${r.data.sent !== 1 ? 's' : ''}`);
      fetchUnpaid();
    } catch (err) {
      const data = err.response?.data;
      // 24h pool-level lockout — ask the commissioner to confirm an override.
      if (err.response?.status === 409 && data?.recently_sent) {
        const when = data.last_sent_at ? new Date(data.last_sent_at).toLocaleString() : 'recently';
        const ok = window.confirm(
          `A payment reminder was already sent for this pool ${when}.\n\nSend another reminder now anyway?`
        );
        if (ok) { setRemindingSending(false); return sendPayReminders({ confirm: true }); }
      } else {
        alert(data?.error || 'Failed to send reminders');
      }
    }
    setRemindingSending(false);
  }

  // Token-bearing fetch → blob → click-download. window.open can't carry the JWT.
  function downloadCsv(path, fallbackFilename) {
    api.get(path, { responseType: 'blob' })
      .then(r => {
        const cd = r.headers?.['content-disposition'] || '';
        const m  = cd.match(/filename="([^"]+)"/);
        const filename = m ? m[1] : fallbackFilename;
        const url = window.URL.createObjectURL(new Blob([r.data], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => alert(err.response?.data?.error || 'Failed to download CSV'));
  }
  function downloadUnpaidCsv()  { downloadCsv(`/golf/commissioner/${leagueId}/unpaid/csv`,   `unpaid-${leagueId}.csv`); }
  function downloadEntriesCsv() { downloadCsv(`/golf/commissioner/${leagueId}/entries/csv`,  `entries-${leagueId}.csv`); }

  // ── "Get Email Addresses" — opens an in-app modal with a proper Copy All
  // button. Native prompt()/alert() are blocked because they have no copy
  // affordance on mobile and look broken in modern UIs.
  const [emailModal, setEmailModal] = useState(null); // { emails: string, count: number } | null
  const [emailCopyStatus, setEmailCopyStatus] = useState(null); // toast for the inline button
  function copyEntryEmails() {
    api.get(`/golf/commissioner/${leagueId}/entries/emails`)
      .then(r => setEmailModal({ emails: r.data?.emails || '', count: r.data?.count || 0 }))
      .catch(err => alert(err.response?.data?.error || 'Failed to fetch emails'));
  }

  // ── "Send from TourneyRun" — platform-sent blast (Option 2) ───────────────
  const [blastSubject, setBlastSubject] = useState('');
  const [blastBody, setBlastBody] = useState('');
  const [blasting, setBlasting] = useState(false);
  const [blastResult, setBlastResult] = useState(null);
  async function sendCommissionerBlast({ confirm = false } = {}) {
    if (!blastSubject.trim() || !blastBody.trim()) {
      alert('Both subject and message are required');
      return;
    }
    setBlasting(true);
    setBlastResult(null);
    try {
      const r = await api.post(`/golf/commissioner/${leagueId}/entries/blast`, {
        subject: blastSubject.trim(), body: blastBody.trim(), confirm,
      });
      setBlastResult({ ok: true, sent: r.data.sent, total: r.data.total });
      setBlastSubject(''); setBlastBody('');
      setTimeout(() => setBlastResult(null), 6000);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409 && data?.recently_sent) {
        const when = data.last_sent_at ? new Date(data.last_sent_at).toLocaleString() : 'recently';
        const ok = window.confirm(
          `A "${data.last_type}" email was sent for this pool ${when}.\n\nSend this message anyway?`
        );
        if (ok) { setBlasting(false); return sendCommissionerBlast({ confirm: true }); }
      } else {
        alert(data?.error || 'Failed to send');
      }
    }
    setBlasting(false);
  }

  // Blast modal
  const [blastModal, setBlastModal] = useState(null); // string (pre-filled message) or null

  // Member paid status — keyed by "userId_entryNumber" to support multi-entry
  const [paidMap, setPaidMap] = useState(() => {
    const map = {};
    (members || []).forEach(m => { map[`${m.user_id}_1`] = !!m.is_paid; });
    return map;
  });
  const [entryPaidMap, setEntryPaidMap] = useState({});

  // Pool standings (for winner announcement + entry paid status)
  const [poolStandings, setPoolStandings] = useState([]);
  useEffect(() => {
    if (league?.format_type !== 'pool') return;
    api.get(`/golf/leagues/${leagueId}/standings`)
      .then(r => {
        setPoolStandings(r.data.standings || []);
        // Merge entry-level paid status into paidMap
        if (r.data.entry_paid) {
          setPaidMap(prev => ({ ...prev, ...r.data.entry_paid }));
        }
      })
      .catch(() => {});
  }, [leagueId, league?.format_type]); // eslint-disable-line

  useEffect(() => {
    Promise.all([
      api.get('/golf/payments/status'),
      api.post(`/golf/leagues/${leagueId}/check-migration-promo`).catch(() => null),
    ]).then(([statusRes, promoRes]) => {
      const commProLeagues = statusRes.data.commProLeagues || [];
      const paid = commProLeagues.includes(leagueId);
      if (promoRes?.data?.unlocked) {
        setIsPaid(true);
      } else {
        setIsPaid(paid);
      }
      setPromoData(promoRes?.data || null);
      setGateChecked(true);
      if (!paid && !(promoRes?.data?.unlocked)) {
        setShowGate(true);
      }
    }).catch(() => setGateChecked(true));
  }, [leagueId]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const currentMax      = league?.max_teams || 20;
  const currentTierIdx  = POOL_TIERS.findIndex(t => t.maxTeams === currentMax);
  const currentTierData = currentTierIdx >= 0 ? POOL_TIERS[currentTierIdx] : null;
  const nextTierData    = currentTierIdx >= 0 && currentTierIdx < POOL_TIERS.length - 1
    ? POOL_TIERS[currentTierIdx + 1] : null;
  const capacityFill    = currentMax > 0 ? members.length / currentMax : 0;
  const showCapacityBanner = league?.format_type === 'pool' && capacityFill >= 0.80 && !capacityDismissed;
  const priceDiff       = nextTierData && currentTierData
    ? (nextTierData.price - currentTierData.price).toFixed(2) : null;

  const thursdayStart   = league?.pool_tournament_start
    ? new Date(league.pool_tournament_start + 'T12:00:00.000Z') : null;
  const settingsLocked  = !!thursdayStart && new Date() >= thursdayStart;
  const payoutsSum      = payoutSplits.reduce((s, p) => s + (parseFloat(p.pct) || 0), 0);
  const payoutsValid    = Math.abs(payoutsSum - 100) < 0.5;

  // Total picks per player (from pool_tiers JSON)
  const totalPicks = (() => {
    try {
      const tiers = JSON.parse(league?.pool_tiers || '[]');
      const sum = tiers.reduce((a, t) => a + (parseInt(t.picks) || 0), 0);
      return sum > 0 ? sum : null;
    } catch { return null; }
  })();

  // Prize pool
  const grossPool = members.length * (parseFloat(buyIn) || league?.buy_in_amount || 0);
  const feeValue = parseFloat(adminFeeValue) || 0;
  const feeAmount = adminFeeEnabled && feeValue > 0
    ? (adminFeeType === 'flat' ? Math.min(feeValue, grossPool) : grossPool * (feeValue / 100))
    : 0;
  const prizePool = Math.max(0, Math.round((grossPool - feeAmount) * 100) / 100);

  // Scoring label
  const scoringLabel = league?.scoring_style === 'fantasy_points'
    ? 'Most fantasy points wins'
    : 'Lowest combined score wins (Stroke Play)';

  // ── Template generators ─────────────────────────────────────────────────────
  function picksReminderMsg() {
    return `⛳ Reminder — picks for ${leagueName} are due before Thursday 8am ET. Head to TourneyRun to lock in your ${totalPicks ?? 7} golfers before the deadline. Don't get locked out!`;
  }

  function welcomeMsg() {
    const picks = totalPicks ?? 'X';
    const pool  = prizePool > 0 ? `$${prizePool.toFixed(0)}` : '[Prize Pool]';
    return `Welcome to ${leagueName}! Here's how it works:\n- Pick ${picks} golfers before Thursday 8am ET\n- Players are grouped into tiers by betting odds\n- ${scoringLabel}\n- Prize pool: ${pool} — ${p1pct}% to 1st, ${p2pct}% to 2nd, ${p3pct}% to 3rd\n- Standings update automatically from ESPN\n\nGood luck and may the best golfer win! 🏆`;
  }

  function payReminderMsg() {
    const amount = league?.buy_in_amount > 0 ? `$${league.buy_in_amount}` : '[buy-in amount]';
    const methods = [
      venmo  ? `Venmo: ${venmo}`   : '',
      zelle  ? `Zelle: ${zelle}`   : '',
      paypal ? `PayPal: ${paypal}` : '',
    ].filter(Boolean).join('\n');
    const methodsLine = methods || '[Add your payment methods in the Commissioner Hub]';
    return `Hey! Just a reminder to pay your ${amount} buy-in for ${leagueName}.\n\n${methodsLine}\n\nPlease pay as soon as possible so the prize pool is accurate. Thanks!`;
  }

  function leaderboardMsg() {
    const url = `https://www.tourneyrun.app/golf/league/${leagueId}`;
    return `Standings are updated in ${leagueName}! Check where you stand and who you need to beat.\n\u2192 ${url}`;
  }

  function winnerMsg() {
    const url = `https://www.tourneyrun.app/golf/league/${leagueId}`;
    let w1, w2;
    if (league?.format_type === 'pool' && poolStandings.length) {
      // poolStandings already has rank=1 as winner regardless of scoring style
      const byRank = [...poolStandings].sort((a, b) => a.rank - b.rank);
      w1 = byRank[0]?.team_name || '[1st place]';
      w2 = byRank[1]?.team_name || '[2nd place]';
    } else {
      const sorted = [...members].sort((a, b) => Number(b.season_points || 0) - Number(a.season_points || 0));
      w1 = sorted[0]?.team_name || '[1st place]';
      w2 = sorted[1]?.team_name || '[2nd place]';
    }
    const prize1 = prizePool > 0 ? `$${(prizePool * p1pct / 100).toFixed(0)}` : '[prize]';
    const prize2 = prizePool > 0 ? `$${(prizePool * p2pct / 100).toFixed(0)}` : '[prize]';
    return `That's a wrap on ${leagueName}!\n\u{1F3C6} 1st place: ${w1} \u2014 ${prize1}\n\u{1F948} 2nd place: ${w2} \u2014 ${prize2}\n\nThanks everyone for playing \u2014 see you at the next tournament!\n\u2192 ${url}`;
  }

  function inviteMsg() {
    const url = `https://www.tourneyrun.app/golf/league/${leagueId}`;
    const tournament = league?.pool_tournament_name || 'the upcoming tournament';
    const spotsLeft = Math.max(0, (league?.max_teams || 0) - members.length);
    const spotsLine = spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left.` : '';
    const codeLine = league?.invite_code ? `\nInvite code: ${league.invite_code}` : '';
    return `We're running a golf pool for ${tournament}!\n${spotsLine} Join here:${codeLine}\n\u2192 ${url}`;
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function handleUpgrade() {
    setUpgrading(true);
    setUpgradeError('');
    try {
      const r = await api.post(`/golf/leagues/${leagueId}/upgrade-tier`);
      window.location.href = r.data.url;
    } catch {
      setUpgradeError('Something went wrong. Please try again.');
      setUpgrading(false);
    }
  }

  async function saveSettings() {
    if (!payoutsValid) { setSettingsError(`Payouts must sum to 100% (currently ${payoutsSum.toFixed(0)}%)`); return; }
    setSettingsSaving(true);
    setSettingsError('');
    try {
      // Merge updated picks counts back into tier config JSON
      const updatedTiers = tierPicksCfg.map(t => ({ ...t }));
      const isSalaryCap = league?.format_type === 'salary_cap';
      await api.patch(`/golf/leagues/${leagueId}/settings`, {
        buy_in_amount: parseFloat(buyIn) || 0,
        payout_splits: payoutSplits,
        admin_fee_type:  adminFeeEnabled && feeValue > 0 ? adminFeeType : null,
        admin_fee_value: adminFeeEnabled && feeValue > 0 ? feeValue     : null,
        // Missed-cut rule (only sent when not locked by an active tournament)
        ...(!tournamentActive && {
          missed_cut_rule: missedCutRule,
          missed_cut_penalty: Math.max(1, Math.min(10, parseInt(missedCutPenalty) || 8)),
        }),
        ...(!isSalaryCap && {
          picks_per_team: Math.max(1, parseInt(picksPerTeam) || 8),
          pool_drop_count: Math.max(0, parseInt(dropCount) || 0),
          pool_max_entries: Math.max(1, Math.min(3, parseInt(maxEntries) || 1)),
          pool_tiers: updatedTiers.length ? updatedTiers : undefined,
        }),
        ...(isSalaryCap && {
          weekly_salary_cap: Math.max(10000, Math.min(500000, parseInt(scCap) || 50000)),
          starters_per_week: Math.max(3, Math.min(20, parseInt(scStarters) || 6)),
          scoring_style: scScoringStyle,
        }),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch {
      setSettingsError('Failed to save. Try again.');
    }
    setSettingsSaving(false);
  }

  async function savePaymentMethods() {
    setPmSaving(true);
    try {
      await api.patch(`/golf/leagues/${leagueId}/settings`, {
        venmo:  venmo.trim()  || null,
        zelle:  zelle.trim()  || null,
        paypal: paypal.trim() || null,
      });
      setPmSaved(true);
      setTimeout(() => setPmSaved(false), 3000);
    } catch { /* silent */ }
    setPmSaving(false);
  }

  async function openRosterEditor(userId, entryNumber, username, teamName) {
    setEditingEntry({ userId, entryNumber, username, teamName });
    try {
      const r = await api.get(`/golf/leagues/${leagueId}/admin/entry-picks?user_id=${userId}&entry_number=${entryNumber}`);
      setEntryPicks(r.data.picks || []);
      setAvailableByTier(r.data.available_by_tier || {});
    } catch { setEntryPicks([]); setAvailableByTier({}); }
  }

  async function confirmSwap(oldPick, newPlayer) {
    setSwapLoading(true);
    try {
      const r = await api.patch(`/golf/leagues/${leagueId}/admin/swap-pick`, {
        user_id: editingEntry.userId,
        entry_number: editingEntry.entryNumber,
        old_player_id: oldPick.player_id,
        new_player_id: newPlayer.player_id,
      });
      if (r.data.ok) {
        // Refresh picks
        await openRosterEditor(editingEntry.userId, editingEntry.entryNumber, editingEntry.username, editingEntry.teamName);
        setSwapping(null);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Swap failed');
    }
    setSwapLoading(false);
  }

  async function confirmDeleteEntry() {
    setDeleteLoading(true);
    try {
      const r = await api.delete(`/golf/leagues/${leagueId}/admin/delete-entry`, {
        data: { user_id: deletingEntry.userId, entry_number: deletingEntry.entryNumber },
      });
      if (r.data.deleted && r.data.rows_affected > 0) {
        setDeletingEntry(null);
        // Refresh standings to update entry list
        api.get(`/golf/leagues/${leagueId}/standings`)
          .then(r => { setPoolStandings(r.data.standings || []); if (r.data.entry_paid) setPaidMap(prev => ({ ...prev, ...r.data.entry_paid })); })
          .catch(() => {});
      } else {
        alert('Delete failed — entry not found');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
    setDeleteLoading(false);
  }

  async function togglePaid(userId, entryNumber = 1) {
    const key = `${userId}_${entryNumber}`;
    const next = !paidMap[key];
    setPaidMap(prev => ({ ...prev, [key]: next }));
    try {
      await api.post(`/golf/leagues/${leagueId}/members/${userId}/paid`, { is_paid: next, entry_number: entryNumber });
    } catch {
      setPaidMap(prev => ({ ...prev, [key]: !next })); // revert on error
    }
  }

  // ── Gate check ──────────────────────────────────────────────────────────────
  if (!gateChecked) {
    return <div style={{ color: '#4b5563', padding: 32, textAlign: 'center', fontSize: 14 }}>Loading…</div>;
  }

  const memberCount    = promoData?.memberCount || members.length;
  const membersNeeded  = promoData?.membersNeeded ?? Math.max(0, 6 - memberCount);
  const alreadyUsedPromo = promoData?.alreadyUsedPromo || false;

  const showPromoBar = !isPaid && !alreadyUsedPromo && membersNeeded > 0;
  const pct = Math.min(100, Math.round((memberCount / 6) * 100));

  // ── Quick-send button styles ─────────────────────────────────────────────────
  const quickBtnBase = {
    border: 'none', borderRadius: 8, padding: '8px 10px',
    fontWeight: 700, fontSize: 11, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 4, textAlign: 'center', lineHeight: 1.3,
  };
  const quickBtns = [
    { label: '⛳ Picks Reminder',    msg: picksReminderMsg, style: { ...quickBtnBase, background: 'rgba(22,163,74,0.15)',   color: '#4ade80',  border: '1px solid rgba(22,163,74,0.35)'   } },
    { label: '👋 Welcome & Rules',   msg: welcomeMsg,       style: { ...quickBtnBase, background: 'rgba(59,130,246,0.12)',  color: '#93c5fd',  border: '1px solid rgba(59,130,246,0.35)'  } },
    { label: '💰 Pay Your Buy-In',   msg: payReminderMsg,   style: { ...quickBtnBase, background: 'rgba(245,158,11,0.12)', color: '#fbbf24',  border: '1px solid rgba(245,158,11,0.35)'  } },
    { label: '📊 Leaderboard Update',msg: leaderboardMsg,   style: { ...quickBtnBase, background: 'rgba(139,92,246,0.12)', color: '#c4b5fd',  border: '1px solid rgba(139,92,246,0.35)'  } },
    { label: '🎉 Winner Announcement',msg: winnerMsg,       style: { ...quickBtnBase, background: 'rgba(234,179,8,0.12)',  color: '#fde047',  border: '1px solid rgba(234,179,8,0.35)'   } },
    { label: '📣 Invite More Players',msg: inviteMsg,       style: { ...quickBtnBase, background: 'rgba(20,184,166,0.12)', color: '#5eead4',  border: '1px solid rgba(20,184,166,0.35)'  } },
  ];

  return (
    <div className="space-y-4">
      {/* Unpaid entries banner */}
      {unpaidSummary && unpaidSummary.unpaid > 0 && !unpaidBannerDismissed && league?.buy_in_amount > 0 && (
        <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700 }}>
              {unpaidSummary.unpaid} entr{unpaidSummary.unpaid === 1 ? 'y hasn\'t' : 'ies haven\'t'} paid yet
            </div>
            <div style={{ color: '#92400e', fontSize: 12, marginTop: 2 }}>
              Prize pool is currently ${unpaidSummary.prizePool} ({unpaidSummary.paid}/{unpaidSummary.total} paid)
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => sendPayReminders()}
              disabled={remindingSending}
              style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
            >{remindingSending ? 'Sending...' : `Remind Unpaid (${unpaidSummary.unpaid})`}</button>
            <button
              onClick={() => setUnpaidBannerDismissed(true)}
              style={{ color: '#6b7280', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer' }}
            >&times;</button>
          </div>
        </div>
      )}

      {/* Unpaid entries detailed table — bordered rows, no pills */}
      {league?.buy_in_amount > 0 && unpaidList && unpaidList.unpaid_count > 0 && (
        <div data-testid="unpaid-entries-section" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em' }}>Unpaid Entries</div>
              <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
                {unpaidList.unpaid_count} of {unpaidList.total_entries} entries unpaid
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                data-testid="unpaid-csv-button"
                onClick={downloadUnpaidCsv}
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#d1d5db' }}
              >Download Unpaid (CSV)</button>
              <button
                type="button"
                data-testid="unpaid-remind-button"
                onClick={() => sendPayReminders()}
                disabled={remindingSending}
                style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
              >{remindingSending ? 'Sending…' : 'Send Payment Reminder'}</button>
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
      )}

      {/* ─── Re-invite Past Members ─── */}
      {/* Always visible — commissioners can pull members from a prior pool. */}
      {/* When ?just_created=1 is in the URL (post-create flow), wrap with a   */}
      {/* highlight so the prompt draws the eye. Self-fetches past leagues on  */}
      {/* mount; renders nothing if commissioner has no other pools.           */}
      {league && (
        <div style={justCreated ? {
          background: 'linear-gradient(180deg, rgba(34,197,94,0.06), transparent)',
          border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 14,
          padding: 4,
        } : undefined}>
          {justCreated && (
            <div style={{ padding: '6px 12px 0', color: '#4ade80', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              New pool created — invite past members?
            </div>
          )}
          <ReinviteFromPastLeague targetLeagueId={leagueId} targetLeagueName={league.name} />
        </div>
      )}

      {/* ─── Pool Communications: Get Emails (Option 1) + Send via TourneyRun (Option 2) ─── */}
      {/* Gate on member count only (no buy-in dependency) — free pools deserve roster + email tools too. */}
      {unpaidList?.total_entries > 0 && (
        <div data-testid="pool-comms-section" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ color: '#e5e7eb', fontSize: 14, fontWeight: 700, letterSpacing: '0.02em' }}>Message Pool Members</div>
            <div style={{ color: '#6b7280', fontSize: 12 }}>{unpaidList.total_entries} pool member{unpaidList.total_entries === 1 ? '' : 's'}</div>
          </div>

          {/* Option 1 — Get Email Addresses (recommended) */}
          <div data-testid="get-emails-card" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#4ade80', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Recommended</span>
            </div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Option 1 — Get Email Addresses</div>
            <p style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.5, marginTop: 0, marginBottom: 12 }}>
              Send from your own email client. Better deliverability and a personal touch — your members already know your address.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                data-testid="copy-emails-button"
                onClick={copyEntryEmails}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(34,197,94,0.5)', background: 'rgba(34,197,94,0.18)', color: '#4ade80' }}
              >Get Email Addresses</button>
              <button
                type="button"
                data-testid="entries-csv-button-fallback"
                onClick={downloadEntriesCsv}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#d1d5db' }}
              >Download CSV (fallback)</button>
            </div>
          </div>

          {/* Option 2 — Send from TourneyRun */}
          <div data-testid="blast-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Option 2 — Send from TourneyRun</div>
            <p style={{ color: '#6b7280', fontSize: 11, lineHeight: 1.5, marginTop: 0, marginBottom: 12 }}>
              Sends from a TourneyRun email address. May be filtered to spam more often than your own email — use Option 1 when possible.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                data-testid="blast-subject"
                placeholder="Subject"
                value={blastSubject}
                onChange={e => setBlastSubject(e.target.value)}
                maxLength={200}
                className="input w-full text-sm"
                disabled={blasting}
              />
              <textarea
                data-testid="blast-body"
                placeholder="Write your message…"
                value={blastBody}
                onChange={e => setBlastBody(e.target.value)}
                maxLength={5000}
                rows={5}
                className="input w-full text-sm"
                style={{ resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }}
                disabled={blasting}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ color: '#4b5563', fontSize: 11 }}>{blastBody.length}/5000</span>
                <button
                  type="button"
                  data-testid="blast-send-button"
                  onClick={() => sendCommissionerBlast()}
                  disabled={blasting || !blastSubject.trim() || !blastBody.trim()}
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: blasting || !blastSubject.trim() || !blastBody.trim() ? 'not-allowed' : 'pointer',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: blasting || !blastSubject.trim() || !blastBody.trim() ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
                    color: blasting || !blastSubject.trim() || !blastBody.trim() ? '#6b7280' : '#fff',
                  }}
                >{blasting ? 'Sending…' : `Send to ${unpaidList.total_entries} members`}</button>
              </div>
              {blastResult?.ok && (
                <div style={{ color: '#4ade80', fontSize: 12, fontWeight: 600 }} data-testid="blast-toast">
                  ✓ Sent to {blastResult.sent} of {blastResult.total} members
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Blast modal */}
      {blastModal && (
        <BlastModal
          leagueId={leagueId}
          memberCount={members.length}
          initialMsg={blastModal}
          onClose={() => setBlastModal(null)}
        />
      )}

      {/* Email copy modal — replaces window.prompt() fallback so mobile gets a real Copy All button */}
      {emailModal && (
        <EmailCopyModal
          emails={emailModal.emails}
          count={emailModal.count}
          onClose={() => setEmailModal(null)}
        />
      )}

      {/* Gate modal */}
      {showGate && (
        <GolfPaymentModal
          type="comm_pro"
          meta={{ leagueId, memberCount, membersNeeded, alreadyUsedPromo }}
          onClose={() => setShowGate(false)}
          onAlreadyPaid={() => { setIsPaid(true); setShowGate(false); }}
        />
      )}

      {/* "Bring Your League" promo banner */}
      {showPromoBar && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-400 text-sm font-bold">🎁 Invite {membersNeeded} more to unlock Commissioner Pro free</span>
            <span className="text-blue-400 text-sm font-bold">{memberCount}/6</span>
          </div>
          <div className="bg-gray-900 rounded-full h-2 overflow-hidden">
            <div style={{ width: `${pct}%`, transition: 'width 0.4s' }} className="h-full bg-blue-500 rounded-full" />
          </div>
        </div>
      )}

      {!isPaid ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="text-white font-bold text-lg mb-2">Commissioner Pro required</h3>
          <p className="text-gray-400 text-sm mb-4 max-w-sm mx-auto">
            Unlock auto-emails, payment tracking, FAAB results, CSV export, and more for $19.99/season.
          </p>
          <Button variant="primary" color="purple" size="lg" onClick={() => setShowGate(true)}>
            Unlock Commissioner Pro — $19.99
          </Button>
          {!alreadyUsedPromo && (
            <p className="text-gray-600 text-xs mt-3">Or invite {membersNeeded} more members to unlock free ↑</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Capacity upsell banner ── */}
          {showCapacityBanner && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(251,146,60,0.1), rgba(245,158,11,0.07))',
              border: '1.5px solid rgba(251,146,60,0.4)',
              borderRadius: 14, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ color: '#fb923c', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    🔥 You&apos;re popular!
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.5 }}>
                    <strong style={{ color: '#fff' }}>{members.length} of {currentMax}</strong> spots filled.
                    {nextTierData
                      ? ` Upgrade to ${nextTierData.label} for just $${priceDiff} more.`
                      : ' Contact us to expand further.'}
                  </div>
                </div>
                <button
                  onClick={() => setCapacityDismissed(true)}
                  style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '0 2px' }}
                  aria-label="Dismiss"
                >×</button>
              </div>
              {upgradeError && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 6 }}>{upgradeError}</p>}
              {nextTierData ? (
                <button
                  disabled={upgrading}
                  onClick={handleUpgrade}
                  style={{
                    background: 'rgba(251,146,60,0.2)', border: '1px solid rgba(251,146,60,0.5)',
                    borderRadius: 8, padding: '6px 14px',
                    color: '#fb923c', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    opacity: upgrading ? 0.6 : 1,
                  }}
                >
                  {upgrading ? 'Redirecting…' : `Upgrade for $${priceDiff}`}
                </button>
              ) : (
                <a href="mailto:support@tourneyrun.app" style={{ color: '#fb923c', fontSize: 13, fontWeight: 600 }}>
                  Contact us →
                </a>
              )}
            </div>
          )}

          {/* Commissioner Pro header */}
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold">Commissioner Hub</h3>
            <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 text-xs font-bold px-2 py-1 rounded-full">PRO</span>
          </div>

          {/* Member roster — shows each entry as a separate row for multi-entry leagues */}
          {(() => {
            // Build entry rows: one per member entry (entry 1 from members, entries 2+ from standings)
            const entryRows = members.map(m => ({ userId: m.user_id, username: m.username, team_name: m.team_name, full_name: m.full_name, entryNumber: 1 }));
            // Add extra entries from standings data
            const seen = new Set(members.map(m => `${m.user_id}_1`));
            for (const s of poolStandings) {
              const key = `${s.user_id}_${s.entry_number || 1}`;
              if (!seen.has(key)) {
                seen.add(key);
                const member = members.find(m => m.user_id === s.user_id);
                entryRows.push({
                  userId: s.user_id,
                  username: member?.username || s.username || '',
                  team_name: s.team_name || member?.team_name || '',
                  full_name: member?.full_name,
                  entryNumber: s.entry_number || 1,
                });
              }
            }
            const totalEntries = entryRows.length;
            const paidCount = entryRows.filter(r => paidMap[`${r.userId}_${r.entryNumber}`]).length;
            const maxEntries = league?.pool_max_entries || 1;

            return (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                  <h4 className="text-white text-sm font-bold">
                    {maxEntries > 1 ? `Entries (${totalEntries})` : `Member Roster (${members.length})`}
                  </h4>
                  {(league?.buy_in_amount > 0) && (
                    <span className="text-xs text-gray-500">
                      <span className="text-green-400 font-bold">{paidCount}</span>/{totalEntries} paid
                    </span>
                  )}
                </div>
                <div>
                  {entryRows.map((row, i) => {
                    const key = `${row.userId}_${row.entryNumber}`;
                    const isPaid = !!paidMap[key];
                    return (
                      <div key={key}
                        style={{ borderBottom: i < entryRows.length - 1 ? '1px solid #111827' : 'none' }}
                        className="flex items-center justify-between px-4 py-3">
                        <div>
                          <div className="text-white text-sm font-semibold">
                            {row.team_name}
                            {row.entryNumber > 1 && <span className="text-indigo-400 text-xs ml-2">Entry #{row.entryNumber}</span>}
                          </div>
                          {row.full_name && <div className="text-gray-400 text-xs">{row.full_name}</div>}
                          <div className="text-gray-500 text-xs">{row.username}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {(league?.picks_locked || league?.pool_tournament_status === 'active' || league?.pool_tournament_status === 'completed') && (
                            <button
                              onClick={() => openRosterEditor(row.userId, row.entryNumber, row.username, row.team_name)}
                              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#a5b4fc' }}
                            >Edit</button>
                          )}
                          <button
                            onClick={() => setDeletingEntry({ userId: row.userId, entryNumber: row.entryNumber, username: row.username, teamName: row.team_name })}
                            style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171' }}
                          >Del</button>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <button
                              onClick={() => togglePaid(row.userId, row.entryNumber)}
                              title={isPaid ? 'Mark as unpaid' : 'Mark as paid'}
                              style={{
                                width: 26, height: 26, borderRadius: '50%',
                                background: isPaid ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.04)',
                                border: `1.5px solid ${isPaid ? '#22c55e' : '#374151'}`,
                                color: isPaid ? '#22c55e' : '#4b5563',
                                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >{isPaid ? '✓' : '○'}</button>
                            <span style={{ fontSize: 8, fontWeight: 700, color: isPaid ? '#22c55e' : '#4b5563', textTransform: 'uppercase' }}>
                              {isPaid ? 'Paid' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Edit Pool Settings ── */}
          {league?.format_type === 'pool' && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h4 className="text-white text-sm font-bold mb-3">⚙️ Edit Pool Settings</h4>
              <div className="space-y-4">
                {/* Buy-in */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Buy-in per player ($)
                  </label>
                  <input
                    type="number" min="0" step="0.01" value={buyIn}
                    onChange={e => setBuyIn(e.target.value)}
                    className="input w-32 text-sm"
                  />
                </div>

                {/* Dynamic payout splits */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    Payout splits
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {payoutSplits.map((split, i) => {
                      const ordinals = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th','13th','14th','15th','16th','17th','18th','19th','20th'];
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: '#6b7280', fontSize: 12, width: 32, flexShrink: 0 }}>{ordinals[i] || `${i+1}th`}</span>
                          <input
                            type="number" min="1" max="99" step="1"
                            value={split.pct}
                            onChange={e => {
                              const next = [...payoutSplits];
                              next[i] = { ...next[i], pct: parseFloat(e.target.value) || 0 };
                              setPayoutSplits(next);
                            }}
                            className="input w-16 text-sm text-center"
                          />
                          <span style={{ color: '#4b5563', fontSize: 11 }}>%</span>
                          {payoutSplits.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setPayoutSplits(payoutSplits.filter((_, j) => j !== i))}
                              style={{ color: '#6b7280', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                            >&times;</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    {payoutSplits.length < 20 && (
                      <button
                        type="button"
                        onClick={() => setPayoutSplits([...payoutSplits, { place: payoutSplits.length + 1, pct: 0 }])}
                        style={{ color: '#22c55e', fontSize: 12, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
                      >+ Add Place</button>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 600, color: payoutsValid ? '#4ade80' : '#f87171' }}>
                      {payoutsValid
                        ? '100% allocated'
                        : payoutsSum < 100
                          ? `${payoutsSum.toFixed(0)}% allocated · ${(100 - payoutsSum).toFixed(0)}% remaining`
                          : `${payoutsSum.toFixed(0)}% — exceeds 100%`
                      }
                    </span>
                  </div>
                </div>

                {/* Admin fee (commissioner only) — flat $ or % */}
                <div data-testid="admin-fee-section">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Admin Fee</label>
                    <button
                      type="button"
                      data-testid="admin-fee-toggle"
                      onClick={() => {
                        const next = !adminFeeEnabled;
                        setAdminFeeEnabled(next);
                        if (!next) setAdminFeeValue('');
                      }}
                      style={{
                        width: 36, height: 20, borderRadius: 10, padding: 2,
                        background: adminFeeEnabled ? '#22c55e' : '#374151',
                        border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        transition: 'transform 0.15s',
                        transform: adminFeeEnabled ? 'translateX(16px)' : 'translateX(0)',
                      }} />
                    </button>
                  </div>
                  {adminFeeEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Type selector: $ or % */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { key: 'percent', label: '% of pool' },
                          { key: 'flat',    label: 'Flat $'   },
                        ].map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            data-testid={`admin-fee-type-${opt.key}`}
                            onClick={() => setAdminFeeType(opt.key)}
                            style={{
                              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              border: `1.5px solid ${adminFeeType === opt.key ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                              background: adminFeeType === opt.key ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                              color: adminFeeType === opt.key ? '#22c55e' : '#9ca3af',
                              cursor: 'pointer',
                            }}
                          >{opt.label}</button>
                        ))}
                      </div>
                      {/* Value input */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {adminFeeType === 'flat' && <span style={{ color: '#9ca3af', fontSize: 13 }}>$</span>}
                        <input
                          type="number"
                          min={adminFeeType === 'flat' ? '0.01' : '1'}
                          max={adminFeeType === 'flat' ? undefined : '50'}
                          step={adminFeeType === 'flat' ? '0.01' : '1'}
                          value={adminFeeValue}
                          onChange={e => setAdminFeeValue(e.target.value)}
                          placeholder={adminFeeType === 'flat' ? '0.00' : '0'}
                          className="input w-20 text-sm text-center"
                          data-testid="admin-fee-value"
                        />
                        {adminFeeType === 'percent' && <span style={{ color: '#4b5563', fontSize: 11 }}>%</span>}
                        {grossPool > 0 && feeValue > 0 && (
                          <span style={{ color: '#6b7280', fontSize: 11 }} data-testid="admin-fee-preview">
                            (${feeAmount.toFixed(2)} fee · ${prizePool.toFixed(2)} prize pool)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <p style={{ color: '#374151', fontSize: 10, marginTop: 4 }}>Only visible to you. Members see prize pool after fee.</p>
                </div>

                {/* Missed-cut rule (locked when tournament is active) */}
                <div data-testid="missed-cut-section">
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Missed Cut Rule {tournamentActive && <span style={{ color: '#6b7280', fontWeight: 400, textTransform: 'none' }}>(locked — tournament active)</span>}
                  </label>
                  <select
                    value={missedCutRule}
                    onChange={e => setMissedCutRule(e.target.value)}
                    disabled={tournamentActive}
                    className="input w-full text-sm"
                    data-testid="missed-cut-rule-select"
                  >
                    <option value="fixed">Fixed Penalty (+{missedCutPenalty || 8} per missed round)</option>
                    <option value="highest_carded">Highest Carded Round (worst score from field)</option>
                    <option value="stroke_penalty">Custom Stroke Penalty (set below)</option>
                    <option value="exclude">Exclude (no penalty — for no-cut events)</option>
                  </select>
                  {(missedCutRule === 'stroke_penalty' || missedCutRule === 'fixed') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>Strokes per missed round</span>
                      <input
                        type="number" min="1" max="10" step="1"
                        value={missedCutPenalty}
                        onChange={e => setMissedCutPenalty(e.target.value)}
                        disabled={tournamentActive || missedCutRule === 'fixed'}
                        className="input w-16 text-sm text-center"
                        data-testid="missed-cut-penalty"
                      />
                    </div>
                  )}
                  <p style={{ color: '#374151', fontSize: 10, marginTop: 4 }}>
                    {missedCutRule === 'fixed'          && 'Each missed round = par + 8 strokes. Most common.'}
                    {missedCutRule === 'highest_carded' && 'Live: missed players take the worst round score from the field.'}
                    {missedCutRule === 'stroke_penalty' && 'Custom: pick 1–10 strokes over par per unfinished round.'}
                    {missedCutRule === 'exclude'        && 'Missed-cut scores ignored. Use for limited-field/no-cut events.'}
                  </p>
                </div>

                {/* Total picks per team */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Total players drafted per team
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[4, 5, 6, 7, 8, 9, 10, 12, 14, 16].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPicksPerTeam(String(n))}
                        style={{
                          padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${picksPerTeam === String(n) ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                          background: picksPerTeam === String(n) ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                          color: picksPerTeam === String(n) ? '#22c55e' : '#9ca3af',
                          cursor: 'pointer',
                        }}
                      >{n}</button>
                    ))}
                    <input
                      type="number" min="1" max="30" step="1"
                      placeholder="Custom"
                      value={[4,5,6,7,8,9,10,12,14,16].includes(parseInt(picksPerTeam)) ? '' : picksPerTeam}
                      onChange={e => { if (e.target.value) setPicksPerTeam(e.target.value); }}
                      className="input text-sm text-center"
                      style={{ width: 72 }}
                    />
                  </div>
                </div>

                {/* Picks per tier */}
                {tierPicksCfg.length > 0 && (
                  <div>
                    <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                      Picks per tier
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {tierPicksCfg.map((t, i) => (
                        <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ color: '#6b7280', fontSize: 12, width: 52, flexShrink: 0 }}>Tier {t.tier}</span>
                          <input
                            type="number" min="1" max="10" step="1"
                            value={t.picks}
                            onChange={e => {
                              const v = Math.max(1, parseInt(e.target.value) || 1);
                              setTierPicksCfg(prev => prev.map((tier, idx) => idx === i ? { ...tier, picks: v } : tier));
                            }}
                            className="input text-sm text-center"
                            style={{ width: 56 }}
                          />
                          <span style={{ color: '#4b5563', fontSize: 11 }}>
                            pick{t.picks !== 1 ? 's' : ''} · ~{t.approxPlayers ?? '?'} players
                          </span>
                        </div>
                      ))}
                    </div>
                    <p style={{ color: '#4b5563', fontSize: 11, marginTop: 6 }}>
                      Reducing picks after submissions are in will not remove existing picks.
                    </p>
                  </div>
                )}

                {/* Cut / drop rule */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Drops after Round 2 (cut rule)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="number" min="0" max="4" step="1" value={dropCount}
                      onChange={e => setDropCount(e.target.value)}
                      className="input text-sm text-center"
                      style={{ width: 56 }}
                    />
                    <span style={{ color: '#4b5563', fontSize: 12 }}>
                      {parseInt(dropCount) === 0 ? 'No drops — all picks count' : `Worst ${dropCount} pick${parseInt(dropCount) !== 1 ? 's' : ''} dropped after Round 2`}
                    </span>
                  </div>
                </div>

                {/* Max entries per player */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Max entries per player
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMaxEntries(String(n))}
                        style={{
                          padding: '5px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          border: `1.5px solid ${maxEntries === String(n) ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                          background: maxEntries === String(n) ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                          color: maxEntries === String(n) ? '#22c55e' : '#6b7280',
                        }}
                      >{n}</button>
                    ))}
                    <span style={{ color: '#4b5563', fontSize: 12 }}>
                      {parseInt(maxEntries) === 1 ? 'One entry per player' : `Up to ${maxEntries} entries per player`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  disabled={settingsSaving || !payoutsValid}
                  onClick={saveSettings}
                  className="text-sm bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {settingsSaving ? 'Saving…' : 'Save settings'}
                </button>
                {settingsSaved  && <span style={{ color: '#4ade80', fontSize: 13 }}>✓ Saved</span>}
                {settingsError  && <span style={{ color: '#f87171', fontSize: 13 }}>{settingsError}</span>}
              </div>
            </div>
          )}

          {/* ── Edit Salary Cap Settings ── */}
          {league?.format_type === 'salary_cap' && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h4 className="text-white text-sm font-bold mb-3">💰 Edit Salary Cap Settings</h4>
              <div className="space-y-4">

                {/* Weekly cap */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Weekly Salary Cap ($)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    {[25000, 50000, 75000, 100000].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScCap(String(n))}
                        style={{
                          padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${scCap === String(n) ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                          background: scCap === String(n) ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                          color: scCap === String(n) ? '#22c55e' : '#9ca3af',
                          cursor: 'pointer',
                        }}
                      >${(n / 1000).toFixed(0)}k</button>
                    ))}
                    <input
                      type="number" min="10000" max="500000" step="1000"
                      placeholder="Custom"
                      value={[25000, 50000, 75000, 100000].includes(parseInt(scCap)) ? '' : scCap}
                      onChange={e => { if (e.target.value) setScCap(e.target.value); }}
                      className="input text-sm text-center"
                      style={{ width: 90 }}
                    />
                  </div>
                </div>

                {/* Players per team */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Players Per Team
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[4, 5, 6, 7, 8].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScStarters(String(n))}
                        style={{
                          padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${scStarters === String(n) ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                          background: scStarters === String(n) ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                          color: scStarters === String(n) ? '#22c55e' : '#9ca3af',
                          cursor: 'pointer',
                        }}
                      >{n}</button>
                    ))}
                    <input
                      type="number" min="3" max="20" step="1"
                      placeholder="Custom"
                      value={[4,5,6,7,8].includes(parseInt(scStarters)) ? '' : scStarters}
                      onChange={e => { if (e.target.value) setScStarters(e.target.value); }}
                      className="input text-sm text-center"
                      style={{ width: 72 }}
                    />
                  </div>
                </div>

                {/* Scoring style */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Scoring Style
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { value: 'tourneyrun', label: 'TourneyRun' },
                      { value: 'stroke_play', label: 'Stroke Play' },
                      { value: 'total_score', label: 'Total Score' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setScScoringStyle(opt.value)}
                        style={{
                          padding: '5px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${scScoringStyle === opt.value ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                          background: scScoringStyle === opt.value ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.03)',
                          color: scScoringStyle === opt.value ? '#22c55e' : '#9ca3af',
                          cursor: 'pointer',
                        }}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>

                {/* Buy-in */}
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Buy-in per player ($)</label>
                  <input type="number" min="0" step="0.01" value={buyIn} onChange={e => setBuyIn(e.target.value)} className="input w-32 text-sm" />
                </div>

              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  disabled={settingsSaving}
                  onClick={saveSettings}
                  className="text-sm bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  {settingsSaving ? 'Saving…' : 'Save settings'}
                </button>
                {settingsSaved && <span style={{ color: '#4ade80', fontSize: 13 }}>✓ Saved</span>}
                {settingsError && <span style={{ color: '#f87171', fontSize: 13 }}>{settingsError}</span>}
              </div>
            </div>
          )}

          {/* ── Import Members ── */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-4">📥 Import Members</h4>
            <p className="text-gray-500 text-xs mb-4">
              Upload an Excel or CSV file to add members and send them invite emails.
              Need a template?{' '}
              <button
                onClick={downloadCsvTemplate}
                style={{ background: 'none', border: 'none', color: '#4ade80', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Download sample CSV
              </button>
            </p>
            <ImportSection leagueId={leagueId} leagueName={leagueName} />
          </div>

          {/* ── Mass Blast ── */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-4">📣 Mass Blast</h4>

            {/* Payment methods (for pay reminder template) */}
            <div style={{
              background: '#080f0c', border: '1px solid #1a2e1f',
              borderRadius: 10, padding: '12px 14px', marginBottom: 14,
            }}>
              <p style={{ color: '#4b5563', fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>
                Payment Methods
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#374151' }}>
                  {' '}— shown in pay reminder emails
                </span>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {[
                  { label: 'Venmo',  val: venmo,  set: setVenmo,  ph: '@username' },
                  { label: 'Zelle',  val: zelle,  set: setZelle,  ph: 'phone or email' },
                  { label: 'PayPal', val: paypal, set: setPaypal, ph: 'paypal.me/username' },
                ].map(({ label, val, set, ph }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#4b5563', fontSize: 11, fontWeight: 700, width: 42, flexShrink: 0 }}>
                      {label}
                    </span>
                    <input
                      type="text"
                      value={val}
                      onChange={e => set(e.target.value)}
                      placeholder={ph}
                      className="input flex-1"
                      style={{ fontSize: 12, padding: '5px 10px' }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={savePaymentMethods}
                  disabled={pmSaving}
                  style={{
                    background: 'rgba(55,65,81,0.5)', border: '1px solid rgba(55,65,81,0.8)',
                    borderRadius: 7, padding: '4px 14px',
                    color: '#9ca3af', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    opacity: pmSaving ? 0.5 : 1,
                  }}
                >
                  {pmSaving ? 'Saving…' : 'Save'}
                </button>
                {pmSaved && <span style={{ color: '#4ade80', fontSize: 12 }}>✓ Saved</span>}
              </div>
            </div>

            {/* Quick-send template buttons — 3×2 grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
              {quickBtns.map(({ label, msg, style }) => (
                <button key={label} style={style} onClick={() => setBlastModal(msg())}>
                  {label}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div style={{ borderTop: '1px solid #111827', marginBottom: 14 }} />

            {/* Custom message textarea */}
            <MassBlast leagueId={leagueId} />
          </div>

          {/* CSV export */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">📊 Export</h4>
            <button
              onClick={() => {
                const rows = [['Team', 'Username', 'Points']];
                members.forEach(m => rows.push([m.team_name, m.username, m.season_points || 0]));
                const csv = rows.map(r => r.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${leagueName.replace(/\s+/g, '-')}-standings.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="text-sm text-green-400 hover:text-green-300 underline underline-offset-2"
            >
              Download standings CSV
            </button>
          </div>

          {/* Auto-Balance Tiers (pool format only) */}
          {league?.format_type === 'pool' && league?.pool_tournament_id && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h4 className="text-white text-sm font-bold mb-1">⚖️ Auto-Balance Tiers</h4>
              <p className="text-gray-500 text-xs mb-3">
                Divide the field into equal-sized tier groups sorted by odds. Good if T1 has 3 players and T6 has 80.
              </p>

              {balancePreview && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.75)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                  onClick={() => setBalancePreview(null)}>
                  <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 20,
                    padding: 24, maxWidth: 400, width: '100%' }}
                    onClick={e => e.stopPropagation()}>
                    <h3 className="text-white font-bold text-base mb-1">Rebalance Preview</h3>
                    <p className="text-gray-500 text-xs mb-3">{balancePreview.field_size} players across {balancePreview.tiers.length} tiers</p>
                    <div className="space-y-1.5 mb-4">
                      {balancePreview.tiers.map(t => (
                        <div key={t.tier} style={{ background: '#1f2937', borderRadius: 8, padding: '8px 12px' }}>
                          <div className="flex items-center justify-between">
                            <span className="text-white text-sm font-semibold">T{t.tier}</span>
                            <span className="text-gray-400 text-xs">{t.count} players</span>
                          </div>
                          <div className="text-gray-500 text-xs">
                            {t.odds_min}{t.odds_max ? ` – ${t.odds_max}` : '+'}
                            {t.sample?.length > 0 && <span className="ml-2 text-gray-600">({t.sample.join(', ')}…)</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={balancing}
                        onClick={async () => {
                          setBalancing(true);
                          try {
                            await api.post(`/golf/leagues/${leagueId}/tiers/auto-balance`, {});
                            setBalancePreview(null);
                            setBalanceDone(true);
                            setTimeout(() => setBalanceDone(false), 4000);
                          } catch { /* silent */ }
                          setBalancing(false);
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-xl transition-colors"
                      >
                        {balancing ? 'Applying…' : 'Confirm'}
                      </button>
                      <button onClick={() => setBalancePreview(null)}
                        className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {balanceDone && <p className="text-green-400 text-xs mb-2">✓ Tiers rebalanced!</p>}

              <button
                disabled={balancing}
                onClick={async () => {
                  setBalancing(true);
                  try {
                    const r = await api.post(`/golf/leagues/${leagueId}/tiers/auto-balance`, { preview: true });
                    setBalancePreview(r.data);
                  } catch { /* silent */ }
                  setBalancing(false);
                }}
                className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {balancing ? 'Loading…' : 'Preview Rebalance'}
              </button>
            </div>
          )}

          {/* Force score sync */}
          {league?.format_type === 'pool' && league?.pool_tournament_id && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h4 className="text-white text-sm font-bold mb-1">🔄 Sync Live Scores</h4>
              <p className="text-gray-500 text-xs mb-3">
                Scores update automatically every 10 minutes. Use this to force an immediate pull from ESPN.
              </p>
              {syncResult && (
                <p className={`text-xs mb-2 font-semibold ${syncResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {syncResult.msg}
                </p>
              )}
              <button
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  setSyncResult(null);
                  try {
                    const r = await api.post(`/golf/admin/sync/${league.pool_tournament_id}`);
                    setSyncResult({ ok: true, msg: `✓ Synced ${r.data.synced ?? 0} players` });
                  } catch {
                    setSyncResult({ ok: false, msg: '✗ Sync failed — check Railway logs' });
                  }
                  setSyncing(false);
                }}
                className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>
          )}

          {/* Apply Round 2 Drops */}
          {league?.format_type === 'pool' && league?.pool_tournament_id &&
           ['stroke_play', 'total_score', 'total_strokes'].includes(league?.scoring_style) && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h4 className="text-white text-sm font-bold mb-1">✂️ Apply Round 2 Drops</h4>
              <p className="text-gray-500 text-xs mb-3">
                After Friday's R2 scores are confirmed, drop the worst {league.pool_drop_count ?? 2} players
                from each team based on their combined R1+R2 score. Ties broken by R1 score.
                {' '}This locks the drops permanently — re-running updates based on latest R2 scores.
              </p>

              {!league.pool_drops_applied && (
                <div style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
                  <p style={{ fontSize: 12, color: '#fb923c', margin: 0, fontWeight: 600 }}>
                    ⚠️ Only apply drops after R2 is fully complete.
                  </p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>
                    Auto-drops are already showing live in standings. Applying here locks them permanently.
                  </p>
                </div>
              )}

              {league.pool_drops_applied ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#4ade80',
                    background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)',
                    padding: '3px 8px', borderRadius: 6,
                  }}>✓ Drops applied</span>
                  <span className="text-gray-500 text-xs">Standings reflect persisted drops.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#fbbf24',
                    background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
                    padding: '3px 8px', borderRadius: 6,
                  }}>Pending</span>
                  <span className="text-gray-500 text-xs">Worst {league.pool_drop_count ?? 2} players showing as DROPPING live — apply to lock permanently.</span>
                </div>
              )}

              {dropResult && !dropResult.error && (
                <div style={{ marginBottom: 10, background: '#0d1117', borderRadius: 8, padding: '8px 10px' }}>
                  <p style={{ color: '#4ade80', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    ✓ {dropResult.picks_dropped} player{dropResult.picks_dropped !== 1 ? 's' : ''} dropped
                    across {dropResult.teams_processed} team{dropResult.teams_processed !== 1 ? 's' : ''}
                  </p>
                  {dropResult.results?.map(r => (
                    <div key={r.username} style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
                      <span style={{ color: '#d1d5db', fontWeight: 600 }}>{r.username}:</span>{' '}
                      {r.dropped.map(p => p.player_name).join(', ')}
                    </div>
                  ))}
                </div>
              )}

              {dropResult?.error && (
                <p className="text-red-400 text-xs mb-2 font-semibold">✗ {dropResult.error}</p>
              )}

              <button
                disabled={applyingDrops}
                onClick={async () => {
                  const action = league.pool_drops_applied ? 'Re-apply' : 'Apply';
                  if (!window.confirm(
                    `${action} Round 2 drops?\n\nThis will mark the worst ${league.pool_drop_count ?? 2} ` +
                    `players on each team as DROPPED based on their R1+R2 scores.\n\n` +
                    (league.pool_drops_applied
                      ? 'Drops will be recalculated from current scores.'
                      : 'All players are currently counting. This will lock in drops.')
                  )) return;
                  setApplyingDrops(true);
                  setDropResult(null);
                  try {
                    const r = await api.post(`/golf/leagues/${leagueId}/apply-drops`);
                    setDropResult(r.data);
                  } catch (e) {
                    setDropResult({ error: e.response?.data?.error || 'Failed to apply drops' });
                  }
                  setApplyingDrops(false);
                }}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8,
                  border: 'none', cursor: applyingDrops ? 'not-allowed' : 'pointer',
                  opacity: applyingDrops ? 0.5 : 1,
                  background: league.pool_drops_applied ? '#1f2937' : '#7c2d12',
                  color: league.pool_drops_applied ? '#9ca3af' : '#fed7aa',
                  transition: 'background 0.15s',
                }}
              >
                {applyingDrops
                  ? 'Applying drops…'
                  : league.pool_drops_applied
                    ? `Re-apply Drops (${league.pool_drop_count ?? 2} worst)`
                    : `Drop Worst ${league.pool_drop_count ?? 2} Players`}
              </button>
            </div>
          )}

          {/* Referral link */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">🔗 Referral Link</h4>
            <ReferralSection />
          </div>
        </div>
      )}

      {/* ── Roster Editor Modal ── */}
      {editingEntry && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { if (!swapLoading) { setEditingEntry(null); setSwapping(null); } }}>
          <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '80vh', overflow: 'auto', padding: 20 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 800, margin: 0 }}>Edit Roster</h3>
                <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0' }}>
                  {editingEntry.teamName} · {editingEntry.username}{editingEntry.entryNumber > 1 ? ` · Entry #${editingEntry.entryNumber}` : ''}
                </p>
              </div>
              <button onClick={() => { setEditingEntry(null); setSwapping(null); }} style={{ color: '#6b7280', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
            </div>

            {swapping ? (
              <div>
                <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
                  Replace <strong style={{ color: '#f87171' }}>{swapping.pick.player_name}</strong> (T{swapping.pick.tier_number}) with:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflow: 'auto' }}>
                  {(availableByTier[swapping.pick.tier_number] || []).map(p => (
                    <button key={p.player_id} disabled={swapLoading}
                      onClick={() => setSwapConfirm({ oldPick: swapping.pick, newPlayer: p })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid #1f2937', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 16 }}>{p.country && p.country.length === 2 ? p.country.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397)) : '⛳'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{p.player_name}</div>
                        <div style={{ color: '#6b7280', fontSize: 10 }}>{p.odds_display || ''}</div>
                      </div>
                    </button>
                  ))}
                  {(availableByTier[swapping.pick.tier_number] || []).length === 0 && (
                    <p style={{ color: '#4b5563', fontSize: 12, textAlign: 'center', padding: 16 }}>No available replacements in this tier</p>
                  )}
                </div>
                <button onClick={() => setSwapping(null)} style={{ marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 10, background: '#1f2937', border: 'none', color: '#9ca3af', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Back</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entryPicks.map(pick => (
                  <div key={pick.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid #1f2937' }}>
                    <span style={{ fontSize: 16 }}>{pick.country && pick.country.length === 2 ? pick.country.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397)) : '⛳'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{pick.player_name}</div>
                      <div style={{ color: '#6b7280', fontSize: 10 }}>T{pick.tier_number} · {pick.odds_display || ''}</div>
                    </div>
                    <button onClick={() => setSwapping({ pick })}
                      style={{ padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)', color: '#fbbf24' }}>
                      Replace
                    </button>
                  </div>
                ))}
                {entryPicks.length === 0 && (
                  <p style={{ color: '#4b5563', fontSize: 12, textAlign: 'center', padding: 16 }}>No picks submitted for this entry</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Entry Confirmation Modal ── */}
      {deletingEntry && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { if (!deleteLoading) setDeletingEntry(null); }}>
          <div style={{ background: '#111827', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 800, margin: '0 0 8px' }}>Delete Entry</h3>
            <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5, margin: '0 0 16px' }}>
              Delete <strong style={{ color: '#fff' }}>{deletingEntry.teamName}</strong>
              {deletingEntry.entryNumber > 1 ? ` Entry #${deletingEntry.entryNumber}` : "'s picks"}
              ? This will permanently remove their picks and cannot be undone. Payment records will not be affected.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeletingEntry(null)} disabled={deleteLoading}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: '#1f2937', border: 'none', color: '#9ca3af', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={confirmDeleteEntry} disabled={deleteLoading}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Swap Confirmation Modal ── */}
      {swapConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { if (!swapLoading) setSwapConfirm(null); }}>
          <div style={{ background: '#111827', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Confirm Swap</h3>
            <p style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.6, margin: '0 0 16px' }}>
              Replace <strong style={{ color: '#f87171' }}>{swapConfirm.oldPick.player_name}</strong> with{' '}
              <strong style={{ color: '#22c55e' }}>{swapConfirm.newPlayer.player_name}</strong>{' '}
              for <strong style={{ color: '#fff' }}>{editingEntry?.teamName}</strong>?
              <br /><span style={{ fontSize: 11, color: '#4b5563' }}>This cannot be undone.</span>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setSwapConfirm(null)} disabled={swapLoading}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: '#1f2937', border: 'none', color: '#9ca3af', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={() => { confirmSwap(swapConfirm.oldPick, swapConfirm.newPlayer); setSwapConfirm(null); }}
                disabled={swapLoading}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {swapLoading ? 'Swapping...' : 'Confirm Swap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
