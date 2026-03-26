import { useState, useEffect } from 'react';
import { Button } from '../../../components/ui';
import api from '../../../api';
import GolfPaymentModal from '../../../components/golf/GolfPaymentModal';
import { POOL_TIERS } from '../../../utils/poolPricing';

// ── Blast confirmation modal ──────────────────────────────────────────────────
function BlastModal({ leagueId, memberCount, initialMsg, onClose }) {
  const [msg, setMsg]       = useState(initialMsg);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(null);

  async function send() {
    if (!msg.trim()) return;
    setSending(true);
    try {
      const r = await api.post(`/golf/leagues/${leagueId}/blast`, { message: msg });
      setSentCount(r.data.sent ?? 0);
      setTimeout(() => onClose(), 3000);
    } catch { /* silent */ }
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
  const [msg, setMsg]     = useState('');
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!msg.trim()) return;
    setLoading(true);
    try {
      await api.post(`/golf/leagues/${leagueId}/blast`, { message: msg });
      setSent(true);
      setMsg('');
      setTimeout(() => setSent(false), 4000);
    } catch { /* silent */ }
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
      {sent && <p className="text-green-400 text-xs">Message sent to all members!</p>}
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

  // Pool settings
  const [buyIn,   setBuyIn]   = useState(String(league?.buy_in_amount  ?? 0));
  const [payout1, setPayout1] = useState(String(league?.payout_first   ?? 70));
  const [payout2, setPayout2] = useState(String(league?.payout_second  ?? 20));
  const [payout3, setPayout3] = useState(String(league?.payout_third   ?? 10));
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

  // Tournament readiness
  const [readiness, setReadiness] = useState(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);

  // Blast modal
  const [blastModal, setBlastModal] = useState(null); // string (pre-filled message) or null

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
  const payoutsSum      = (parseFloat(payout1) || 0) + (parseFloat(payout2) || 0) + (parseFloat(payout3) || 0);
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
  const prizePool = members.length * (parseFloat(buyIn) || league?.buy_in_amount || 0);
  const p1pct = parseFloat(payout1) || league?.payout_first  || 70;
  const p2pct = parseFloat(payout2) || league?.payout_second || 20;
  const p3pct = parseFloat(payout3) || league?.payout_third  || 10;

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
    const sorted = [...members].sort((a, b) => Number(b.season_points || 0) - Number(a.season_points || 0));
    const w1 = sorted[0]?.team_name || '[1st place]';
    const w2 = sorted[1]?.team_name || '[2nd place]';
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
    if (!payoutsValid) { setSettingsError('Payouts must sum to exactly 100%'); return; }
    setSettingsSaving(true);
    setSettingsError('');
    try {
      await api.patch(`/golf/leagues/${leagueId}/settings`, {
        buy_in_amount: parseFloat(buyIn) || 0,
        payout_1st: parseFloat(payout1) || 0,
        payout_2nd: parseFloat(payout2) || 0,
        payout_3rd: parseFloat(payout3) || 0,
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
      {/* Blast modal */}
      {blastModal && (
        <BlastModal
          leagueId={leagueId}
          memberCount={members.length}
          initialMsg={blastModal}
          onClose={() => setBlastModal(null)}
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

          {/* Member roster */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h4 className="text-white text-sm font-bold">Member Roster ({members.length})</h4>
            </div>
            <div>
              {members.map((m, i) => (
                <div key={m.user_id}
                  style={{ borderBottom: i < members.length - 1 ? '1px solid #111827' : 'none' }}
                  className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-white text-sm font-semibold">{m.team_name}</div>
                    <div className="text-gray-500 text-xs">{m.username}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 text-sm font-bold tabular-nums">{Number(m.season_points || 0).toFixed(1)} pts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Edit Pool Settings ── */}
          {league?.format_type === 'pool' && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h4 className="text-white text-sm font-bold mb-1">⚙️ Edit Pool Settings</h4>
              {settingsLocked ? (
                <p style={{ color: '#eab308', fontSize: 12, marginBottom: 12 }}>
                  🔒 Settings locked — tournament starts Thursday
                </p>
              ) : (
                <p className="text-gray-500 text-xs mb-3">Editable until Thursday 8am ET</p>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    Buy-in per player ($)
                  </label>
                  <input
                    type="number" min="0" step="0.01" value={buyIn}
                    disabled={settingsLocked}
                    onChange={e => setBuyIn(e.target.value)}
                    className="input w-32 text-sm"
                    style={settingsLocked ? { opacity: 0.5 } : {}}
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    Payout splits
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    {[
                      { label: '1st %', val: payout1, set: setPayout1 },
                      { label: '2nd %', val: payout2, set: setPayout2 },
                      { label: '3rd %', val: payout3, set: setPayout3 },
                    ].map(({ label, val, set }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="text-gray-500 text-xs w-9">{label}</span>
                        <input
                          type="number" min="0" max="100" step="1" value={val}
                          disabled={settingsLocked}
                          onChange={e => set(e.target.value)}
                          className="input w-16 text-sm text-center"
                          style={settingsLocked ? { opacity: 0.5 } : {}}
                        />
                      </div>
                    ))}
                    <span style={{ fontSize: 12, fontWeight: 600, color: payoutsValid ? '#4ade80' : '#f87171' }}>
                      {payoutsSum.toFixed(0)}%
                    </span>
                  </div>
                  {!payoutsValid && (
                    <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>
                      Must sum to 100% (currently {payoutsSum.toFixed(0)}%)
                    </p>
                  )}
                </div>
              </div>
              {!settingsLocked && (
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
              )}
            </div>
          )}

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
                  <span className="text-gray-500 text-xs">All {league.picks_per_team ?? 7} players counting until drops are applied.</span>
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

          {/* Tournament readiness check */}
          {league?.format_type === 'pool' && league?.pool_tournament_id && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
              <h4 className="text-white text-sm font-bold mb-1">🏁 Tournament Readiness</h4>
              <p className="text-gray-500 text-xs mb-3">
                Run before each tournament to catch setup issues before they cost teams points.
              </p>

              {readiness && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 8, marginBottom: 10, fontSize: 12, fontWeight: 700,
                    background: readiness.overall === 'pass' ? 'rgba(74,222,128,0.1)'
                      : readiness.overall === 'fail' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)',
                    border: `1px solid ${readiness.overall === 'pass' ? 'rgba(74,222,128,0.35)'
                      : readiness.overall === 'fail' ? 'rgba(248,113,113,0.35)' : 'rgba(251,191,36,0.35)'}`,
                    color: readiness.overall === 'pass' ? '#4ade80'
                      : readiness.overall === 'fail' ? '#f87171' : '#fbbf24',
                  }}>
                    {readiness.overall === 'pass' ? '✓ All checks passed'
                      : readiness.overall === 'fail' ? '✗ Issues found'
                      : '⚠ Warnings'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {readiness.checks.map(c => (
                      <div key={c.name} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        background: '#0d1117', borderRadius: 8, padding: '7px 10px',
                      }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                          color: c.status === 'pass' ? '#4ade80' : c.status === 'fail' ? '#f87171' : '#fbbf24',
                        }}>
                          {c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '⚠'}
                        </span>
                        <div>
                          <div style={{ color: '#e5e7eb', fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>{c.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                disabled={checkingReadiness}
                onClick={async () => {
                  setCheckingReadiness(true);
                  setReadiness(null);
                  try {
                    const r = await api.get(`/golf/admin/tournament-readiness/${league.pool_tournament_id}`);
                    setReadiness(r.data);
                  } catch {
                    setReadiness({ overall: 'fail', checks: [{ name: 'Request failed', status: 'fail', detail: 'Could not reach server' }] });
                  }
                  setCheckingReadiness(false);
                }}
                className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {checkingReadiness ? 'Checking…' : 'Run Readiness Check'}
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
    </div>
  );
}
