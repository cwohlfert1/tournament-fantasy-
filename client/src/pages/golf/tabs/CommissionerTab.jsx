import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../../components/ui';
import Alert from '../../../components/ui/Alert';
import api from '../../../api';
import GolfPaymentModal from '../../../components/golf/GolfPaymentModal';
import ReinviteFromPastLeague from '../../../components/golf/ReinviteFromPastLeague';
import { POOL_TIERS } from '../../../utils/poolPricing';
import { showToast } from '../../../components/ui/Toast';
import { showConfirm } from '../../../components/ui/ConfirmDialog';
import EmailCopyModal  from './commissioner/EmailCopyModal';
import BlastModal      from './commissioner/BlastModal';
import MassBlast       from './commissioner/MassBlast';
import ReferralSection from './commissioner/ReferralSection';
import ImportSection   from './commissioner/ImportSection';
import UnpaidSection   from './commissioner/UnpaidSection';
import Select from '../../../components/ui/Select';
import QuickReminders  from './commissioner/QuickReminders';


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
      showToast.success(`Reminders sent to ${r.data.sent} unpaid member${r.data.sent !== 1 ? 's' : ''}`);
      fetchUnpaid();
    } catch (err) {
      const data = err.response?.data;
      // 24h pool-level lockout — ask the commissioner to confirm an override.
      if (err.response?.status === 409 && data?.recently_sent) {
        const when = data.last_sent_at ? new Date(data.last_sent_at).toLocaleString() : 'recently';
        const ok = await showConfirm({
          title: 'Send another reminder?',
          description: `A payment reminder was already sent for this pool ${when}. Send another now anyway?`,
          confirmLabel: 'Send again',
          variant: 'warning',
        });
        if (ok) { setRemindingSending(false); return sendPayReminders({ confirm: true }); }
      } else {
        showToast.error(data?.error || 'Failed to send reminders');
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
      .catch(err => showToast.error(err.response?.data?.error || 'Failed to download CSV'));
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
      .catch(err => showToast.error(err.response?.data?.error || 'Failed to fetch emails'));
  }

  // ── "Send from TourneyRun" — platform-sent blast (Option 2) ───────────────
  const [blastSubject, setBlastSubject] = useState('');
  const [blastBody, setBlastBody] = useState('');
  const [blasting, setBlasting] = useState(false);
  const [blastResult, setBlastResult] = useState(null);
  async function sendCommissionerBlast({ confirm = false } = {}) {
    if (!blastSubject.trim() || !blastBody.trim()) {
      showToast.warning('Both subject and message are required');
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
        const ok = await showConfirm({
          title: 'Send another message?',
          description: `A "${data.last_type}" email was already sent for this pool ${when}. Send this one anyway?`,
          confirmLabel: 'Send message',
          variant: 'warning',
        });
        if (ok) { setBlasting(false); return sendCommissionerBlast({ confirm: true }); }
      } else {
        showToast.error(data?.error || 'Failed to send');
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
      showToast.error(err.response?.data?.error || 'Swap failed');
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
        showToast.error('Delete failed — entry not found');
      }
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Delete failed');
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

  return (
    <div className="space-y-4">
      {/* Unpaid entries banner */}
      {unpaidSummary && unpaidSummary.unpaid > 0 && !unpaidBannerDismissed && league?.buy_in_amount > 0 && (
        <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <AlertTriangle size={18} style={{ color: '#fbbf24', flexShrink: 0 }} />
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
            ><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Unpaid entries detailed table */}
      {league?.buy_in_amount > 0 && (
        <UnpaidSection
          unpaidList={unpaidList}
          onDownloadCsv={downloadUnpaidCsv}
          onSendReminders={() => sendPayReminders()}
          sending={remindingSending}
        />
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
                ><X size={14} /></button>
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
                            ><X size={14} /></button>
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
                  <Select
                    value={missedCutRule}
                    onChange={setMissedCutRule}
                    disabled={tournamentActive}
                    fullWidth
                    size="sm"
                    options={[
                      { value: 'fixed',           label: `Fixed Penalty (+${missedCutPenalty || 8} per missed round)` },
                      { value: 'highest_carded',  label: 'Highest Carded Round (worst score from field)' },
                      { value: 'stroke_penalty',  label: 'Custom Stroke Penalty (set below)' },
                      { value: 'exclude',         label: 'Exclude (no penalty — for no-cut events)' },
                    ]}
                  />
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
          <ImportSection leagueId={leagueId} />

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
            <QuickReminders
              ctx={{
                leagueId, leagueName, league,
                totalPicks, prizePool, scoringLabel,
                p1pct, p2pct, p3pct,
                venmo, zelle, paypal,
                members, poolStandings,
              }}
              onSelect={msg => setBlastModal(msg)}
            />

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
                  const ok = await showConfirm({
                    title: `${action} Round 2 drops?`,
                    description: `Marks the worst ${league.pool_drop_count ?? 2} player(s) on each team as dropped based on R1+R2 scores. ${league.pool_drops_applied ? 'Drops will be recalculated from current scores.' : 'All players are currently counting — this locks in drops.'}`,
                    confirmLabel: `${action} drops`,
                    variant: 'warning',
                  });
                  if (!ok) return;
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
              <button onClick={() => { setEditingEntry(null); setSwapping(null); }} style={{ color: '#6b7280', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
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
