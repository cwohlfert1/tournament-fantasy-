import { useState, useEffect } from 'react';
import { Button } from '../../../components/ui';
import api from '../../../api';
import GolfPaymentModal from '../../../components/golf/GolfPaymentModal';

function MassBlast({ leagueId }) {
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!msg.trim()) return;
    setLoading(true);
    try {
      await api.post(`/golf/leagues/${leagueId}/blast`, { message: msg });
      setSent(true);
      setMsg('');
      setTimeout(() => setSent(false), 4000);
    } catch {
      // silently fail
    }
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Send a message to all league members…"
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

function ReferralSection() {
  const [data, setData] = useState(null);
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

export default function CommissionerTab({ leagueId, leagueName, members, league }) {
  const [promoData, setPromoData]   = useState(null);
  const [isPaid, setIsPaid]         = useState(false);
  const [showGate, setShowGate]     = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  const [balancePreview, setBalancePreview] = useState(null);
  const [balancing, setBalancing]   = useState(false);
  const [balanceDone, setBalanceDone] = useState(false);

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
          <Button
            variant="primary"
            color="purple"
            size="lg"
            onClick={() => setShowGate(true)}
          >
            Unlock Commissioner Pro — $19.99
          </Button>
          {!alreadyUsedPromo && (
            <p className="text-gray-600 text-xs mt-3">Or invite {membersNeeded} more members to unlock free ↑</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
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
                <div key={m.user_id} style={{ borderBottom: i < members.length - 1 ? '1px solid #111827' : 'none' }}
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

          {/* Mass blast */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">📣 Mass Blast</h4>
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
                a.href = url; a.download = `${leagueName.replace(/\s+/g,'-')}-standings.csv`;
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

              {/* Preview modal */}
              {balancePreview && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                  onClick={() => setBalancePreview(null)}>
                  <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 20, padding: 24, maxWidth: 400, width: '100%' }}
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
