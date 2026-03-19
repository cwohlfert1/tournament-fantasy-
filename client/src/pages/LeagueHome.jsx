import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import BallLoader from '../components/BallLoader';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import Disclaimer from '../components/Disclaimer';
import TeamAvatar from '../components/TeamAvatar';
import { useDocTitle } from '../hooks/useDocTitle';
import { teamEmoji, playerAvatarStyle } from '../teamEmojis';
import TrashTalkTab from './TrashTalkTab';
import LiveGamesBanner from '../components/LiveGamesBanner';
import SindariusTab from '../components/SindariusTab';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  if (!n && n !== 0) return '$0';
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

const ETP_GAMES = {
  1: 3.8, 2: 3.0, 3: 2.5, 4: 2.2, 5: 1.8, 6: 1.7, 7: 1.6,
  8: 1.3, 9: 1.2, 10: 1.1, 11: 1.0, 12: 1.0, 13: 1.0, 14: 1.0, 15: 1.0, 16: 1.0,
};
function calcETP(ppg, seed, isFirstFour = false) {
  if (!ppg || !seed) return null;
  const base = ETP_GAMES[parseInt(seed)] ?? 1.0;
  const games = isFirstFour ? base + 0.5 : base;
  return Math.round(ppg * games * 10) / 10;
}

// ── Payment badges ────────────────────────────────────────────────────────────
const VenmoBadge = () => (
  <span style={{ background: '#008CFF', color: '#fff', fontWeight: 700, fontSize: 10, borderRadius: 20, padding: '2px 7px', lineHeight: 1.4, whiteSpace: 'nowrap' }}>Venmo</span>
);
const ZelleBadge = () => (
  <span style={{ background: '#6D1ED4', color: '#fff', fontWeight: 700, fontSize: 10, borderRadius: 20, padding: '2px 7px', lineHeight: 1.4, whiteSpace: 'nowrap' }}>Zelle</span>
);

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS = {
  pending_payment: { label: 'Awaiting Payment', dot: 'bg-yellow-400', badge: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' },
  lobby:           { label: 'Waiting for Draft', dot: 'bg-yellow-400', badge: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' },
  drafting:        { label: 'Live Draft',         dot: 'bg-brand-400',  badge: 'bg-brand-500/15 border-brand-500/30 text-brand-400'   },
  active:          { label: 'Season Active',      dot: 'bg-green-400',  badge: 'bg-green-500/15 border-green-500/30 text-green-400'   },
  completed:       { label: 'Season Complete',    dot: 'bg-gray-500',   badge: 'bg-gray-800 border-gray-700 text-gray-400'            },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.lobby;
  return (
    <span className={`inline-flex items-center gap-2 border px-3 py-1 rounded-full text-sm font-semibold ${s.badge}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot} animate-pulse`} />
      {s.label}
    </span>
  );
}

function PaymentBadge({ status }) {
  if (status === 'paid') return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">✓ Paid</span>
  );
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Pending</span>
  );
}

// ── Smart Draft upsell banner ─────────────────────────────────────────────────
function SmartDraftBanner({ leagueId }) {
  const [purchased, setPurchased]     = useState(null); // null = loading
  const [expanded, setExpanded]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [dismissed, setDismissed]     = useState(false);

  useEffect(() => {
    api.get(`/payments/smart-draft/${leagueId}/status`)
      .then(res => setPurchased(res.data.purchased))
      .catch(() => setPurchased(false));
  }, [leagueId]);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await api.post('/payments/smart-draft-checkout', { leagueId });
      window.location.href = res.data.url;
    } catch (err) {
      alert(err.response?.data?.error || 'Could not start checkout');
      setLoading(false);
    }
  };

  // Don't show if still loading, already purchased, or dismissed
  if (purchased === null || purchased || dismissed) return null;

  return (
    <div className="relative rounded-xl border border-brand-500/30 bg-gradient-to-r from-brand-900/30 via-gray-900 to-gray-900 p-4 mb-6">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-gray-600 hover:text-gray-400 text-lg leading-none"
        title="Dismiss"
      >×</button>

      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">⚡</span>
        <div className="flex-1 min-w-0">
          <div className="text-white font-bold text-base mb-0.5">Can't make the draft? Forgot about date night?</div>
          <div className="text-gray-300 text-sm mb-3">
            Let Smart Draft handle it — <span className="text-brand-400 font-semibold">$2.99</span>.
            Our AI drafts like a seasoned pro while you're stuck in traffic.{' '}
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-brand-400 hover:text-brand-300 underline underline-offset-2 text-sm"
            >
              {expanded ? 'Show less' : 'How Smart Draft works'}
            </button>
          </div>

          {expanded && (
            <div className="bg-gray-800/60 rounded-lg p-3 mb-3 text-xs text-gray-300 space-y-1">
              <p className="font-semibold text-white mb-1.5">Smart Draft is an AI-powered algorithm that drafts for you when you can't make it. It automatically:</p>
              <p>✓ Avoids injured players</p>
              <p>✓ Balances your roster across regions and teams</p>
              <p>✓ Targets high ETP players with the best tournament upside</p>
              <p>✓ Fills position needs intelligently</p>
              <p className="text-gray-500 mt-1.5">Much smarter than just grabbing the highest rated player available.</p>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="bg-brand-500 hover:bg-brand-400 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Add Smart Draft — $2.99'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Promo code input ─────────────────────────────────────────────────────────
function PromoInput({ code, onCodeChange, status, message, onApply }) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => onCodeChange(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && onApply()}
          placeholder="Promo code"
          disabled={status === 'valid'}
          className={`flex-1 bg-gray-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-colors ${
            status === 'valid'   ? 'border-green-500/60 bg-green-950/20' :
            status === 'invalid' ? 'border-red-500/60' :
            'border-gray-700 focus:border-brand-500'
          }`}
        />
        <button
          type="button"
          onClick={onApply}
          disabled={!code.trim() || status === 'loading' || status === 'valid'}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 bg-gray-700 hover:bg-gray-600 text-white whitespace-nowrap"
        >
          {status === 'loading' ? '…' : status === 'valid' ? '✓ Applied' : 'Apply'}
        </button>
      </div>
      {message && (
        <p className={`text-xs font-medium ${status === 'valid' ? 'text-green-400' : 'text-red-400'}`}>
          {status === 'valid' ? '🎉 ' : '⚠️ '}{message}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LeagueHome() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentResult = searchParams.get('payment');

  const [league, setLeague]           = useState(null);
  const [isCommissioner, setIsCommissioner] = useState(false);
  useDocTitle(league ? `${league.name} | TourneyRun` : 'TourneyRun');
  const [members, setMembers]     = useState([]);
  const [settings, setSettings]   = useState(null);
  const [myPicks, setMyPicks]     = useState([]);
  const [myStandingsPlayers, setMyStandingsPlayers] = useState([]);
  const [allStandings, setAllStandings] = useState([]);
  const [sgLeader, setSgLeader] = useState(null);
  const [sgBoard, setSgBoard]   = useState([]);
  const [sgExpanded, setSgExpanded] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [standingsSort, setStandingsSort] = useState('points');
  const [standingsSortDir, setStandingsSortDir] = useState('desc');
  const [tab, setTab]             = useState(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return ['overview','roster','standings','trashtalk'].includes(t) ? t : 'overview';
  });
  const [loading, setLoading]     = useState(true);
  const [copied, setCopied]       = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [starting, setStarting]   = useState(false);

  const [paymentInfo, setPaymentInfo]         = useState(null);
  const [paymentLoading, setPaymentLoading]   = useState(false);
  const [entryPayLoading, setEntryPayLoading] = useState(false);
  const [promoCode, setPromoCode]       = useState('');
  const [promoStatus, setPromoStatus]   = useState(''); // '' | 'loading' | 'valid' | 'invalid'
  const [promoMessage, setPromoMessage] = useState('');
  const [promoWaived, setPromoWaived]   = useState(false); // true when 100% off
  const [populateLoading, setPopulateLoading] = useState(false);
  const [populateResult, setPopulateResult]   = useState(null);
  const [randomizing, setRandomizing]         = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError]         = useState('');
  const [smartDraftUsers, setSmartDraftUsers] = useState(new Set());
  const [instrCopied, setInstrCopied]         = useState(false);
  const [hasLiveGames, setHasLiveGames]       = useState(false);
  const [payHandleDismissed, setPayHandleDismissed] = useState(
    () => !!sessionStorage.getItem('payHandleBannerDismissed')
  );

  // Edit settings modal
  const [editOpen, setEditOpen]       = useState(false);
  const [editForm, setEditForm]       = useState({});
  const [editSaving, setEditSaving]   = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);
  const [editError, setEditError]     = useState('');

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError('');
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      fd.append('leagueId', id);
      await api.post('/upload/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await fetchData();
    } catch (err) {
      setAvatarError(err.response?.data?.error || 'Upload failed');
    } finally {
      setAvatarUploading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const fetchData = async () => {
    try {
      const [leagueRes, payRes] = await Promise.all([
        api.get(`/leagues/${id}`),
        api.get(`/payments/league/${id}/status`).catch(() => null),
        api.get(`/payments/smart-draft/${id}/status`).then(r => {
          setSmartDraftUsers(new Set(r.data.purchasedUsers));
        }).catch(() => {}),
      ]);

      setLeague(leagueRes.data.league);
      setMembers(leagueRes.data.members);
      setSettings(leagueRes.data.settings);
      setIsCommissioner(leagueRes.data.isCommissioner === true);
      if (payRes) setPaymentInfo(payRes.data);

      if (['active', 'drafting', 'completed'].includes(leagueRes.data.league.status)) {
        const draftRes = await api.get(`/draft/${id}/state`);
        setMyPicks(draftRes.data.picks.filter(p => p.user_id === user.id));
      }
      if (['active', 'completed'].includes(leagueRes.data.league.status)) {
        const standingsRes = await api.get(`/scores/league/${id}/standings`).catch(() => null);
        if (standingsRes) {
          const allRows = standingsRes.data.standings || [];
          const myTeam = allRows.find(t => t.user_id === user.id);
          setMyStandingsPlayers(myTeam?.players || []);
          setAllStandings(allRows);
          setSgLeader(standingsRes.data.sgLeader || null);
          setSgBoard(standingsRes.data.sgBoard || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentInfo = async () => {
    setPaymentLoading(true);
    try {
      const res = await api.get(`/payments/league/${id}/status`);
      setPaymentInfo(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setPaymentLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'payments' && !paymentInfo) fetchPaymentInfo();
  }, [tab]);

  const randomizeDraftOrder = async () => {
    if (!window.confirm('Randomize the draft order? This cannot be undone.')) return;
    setRandomizing(true);
    try {
      const res = await api.post(`/admin/leagues/${id}/randomize-order`);
      setMembers(res.data.members.map((m, i) => ({ ...m, draft_order: i + 1 })));
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to randomize draft order');
    } finally {
      setRandomizing(false);
    }
  };

  const startDraft = async () => {
    setStarting(true);
    try {
      await api.post(`/admin/leagues/${id}/start-draft`);
      navigate(`/league/${id}/draft`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start draft');
      setStarting(false);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(league.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleForceStart = async () => {
    if (!window.confirm('This will mark all pending payments as paid and start the draft immediately. Continue?')) return;
    try {
      await api.post(`/admin/leagues/${id}/force-start`);
      navigate(`/league/${id}/draft`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to force-start draft');
    }
  };

  const handlePopulateTestLeague = async () => {
    setPopulateLoading(true);
    setPopulateResult(null);
    try {
      const res = await api.post(`/admin/leagues/${id}/populate-test`);
      setPopulateResult(res.data);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to populate test league');
    } finally {
      setPopulateLoading(false);
    }
  };

  const openEditSettings = () => {
    setEditForm({
      draft_start_time: league.draft_start_time
        ? new Date(league.draft_start_time).toISOString().slice(0, 16)
        : '',
      pick_time_limit: league.pick_time_limit  || 60,
      max_teams:       league.max_teams         || 10,
      total_rounds:    league.total_rounds      || 10,
      autodraft_mode:  league.autodraft_mode    || 'best_available',
    });
    setEditSuccess(false);
    setEditError('');
    setEditOpen(true);
  };

  const saveSettings = async () => {
    setEditSaving(true);
    setEditError('');
    try {
      const payload = {
        pick_time_limit:  editForm.pick_time_limit,
        autodraft_mode:   editForm.autodraft_mode,
        max_teams:        editForm.max_teams,
        total_rounds:     editForm.total_rounds,
        draft_start_time: editForm.draft_start_time || null,
      };
      const res = await api.patch(`/leagues/${id}/settings`, payload);
      setLeague(res.data.league);
      setEditSuccess(true);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setEditSaving(false);
    }
  };

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoStatus('loading');
    setPromoMessage('');
    try {
      const res = await api.post('/payments/validate-promo', { code: promoCode.trim() });
      if (res.data.valid) {
        setPromoStatus('valid');
        setPromoMessage(res.data.message);
        setPromoWaived(res.data.discountPct === 100);
      } else {
        setPromoStatus('invalid');
        setPromoMessage(res.data.error || 'Invalid promo code');
        setPromoWaived(false);
      }
    } catch {
      setPromoStatus('invalid');
      setPromoMessage('Could not validate code');
      setPromoWaived(false);
    }
  };

  const handlePayEntryFee = async () => {
    setEntryPayLoading(true);
    try {
      const body = { leagueId: id };
      if (promoStatus === 'valid') body.promoCode = promoCode.trim();
      const res = await api.post('/payments/entry-checkout', body);
      if (res.data.free) {
        await fetchData();
        setPromoCode('');
        setPromoStatus('');
        setPromoMessage('');
        setPromoWaived(false);
      } else {
        window.location.href = res.data.url;
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start payment');
      setEntryPayLoading(false);
    }
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) return <BallLoader />;

  if (!league) return <div className="text-center py-12 text-gray-400">League not found</div>;

  // ── Derived state ─────────────────────────────────────────────────────────
  const buyIn          = league.buy_in_amount || 0;
  const bonus          = parseFloat(league.payout_bonus) || 0;
  const prizePool      = buyIn * members.length;
  const maxPrizePool   = buyIn * league.max_teams;
  // Subtract single-game bonus before applying payout percentages
  const mainPool       = Math.max(0, prizePool - bonus);
  const maxMainPool    = Math.max(0, maxPrizePool - bonus);
  const spotsLeft      = league.max_teams - members.length;

  const myPayment    = paymentInfo?.payments?.find(p => p.user_id === user?.id);
  const myPaymentDue = myPayment?.status === 'pending';

  const myMember = members.find(m => m.user_id === user?.id);
  const showPayHandleBanner = !payHandleDismissed && !!myMember && !myMember.venmo_handle && !myMember.zelle_handle;
  const paidCount    = paymentInfo?.paid_count ?? 0;
  const totalCount   = paymentInfo?.total_count ?? 0;
  const allPaid      = totalCount > 0 && paidCount === totalCount;

  const paymentMap = {};
  paymentInfo?.payments?.forEach(p => { paymentMap[p.user_id] = p.status; });

  const tabs = [
    { id: 'overview',    label: 'Overview'      },
    { id: 'roster',      label: 'My Roster'     },
    { id: 'standings',   label: 'Standings', dot: hasLiveGames, dotPulse: hasLiveGames },
    { id: 'trashtalk',   label: '💬 Trash Talk' },
    { id: 'sindarius',   label: '🧠 Ask AI'     },
    { id: 'payments',    label: 'Payments', dot: myPaymentDue },
    ...(isCommissioner ? [{ id: 'admin', label: 'Admin' }] : []),
  ];

  const statCards = [
    {
      icon: '👥', label: 'Teams',
      value: `${members.length}/${league.max_teams}`,
      sub: spotsLeft > 0 ? `${spotsLeft} spots left` : 'League full',
      gold: false,
    },
    {
      icon: '📋', label: 'Draft Rounds',
      value: league.total_rounds,
      sub: `${league.total_rounds * league.max_teams} total picks`,
      gold: false,
    },
    {
      icon: '⏱', label: 'Pick Timer',
      value: `${league.pick_time_limit}s`,
      sub: 'per pick',
      gold: false,
    },
    buyIn > 0
      ? { icon: '🏆', label: 'Prize Pool', value: fmt(prizePool), sub: bonus > 0 ? `${fmt(mainPool)} standings + ${fmt(bonus)} bonus` : `up to ${fmt(maxPrizePool)}`, gold: true }
      : { icon: '🏆', label: 'Prize Pool', value: 'No buy-in', sub: 'free league', gold: true },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 overflow-x-hidden">

      {/* ── Payment handle reminder banner ── */}
      {showPayHandleBanner && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3 mb-4 text-sm">
          <span>⚠️</span>
          <span className="flex-1">
            Add your Venmo or Zelle so your commissioner can collect your buy-in.
          </span>
          <Link
            to="/profile"
            className="font-semibold text-amber-200 hover:text-white underline underline-offset-2 whitespace-nowrap transition-colors"
          >
            Update Profile
          </Link>
          <button
            onClick={() => {
              sessionStorage.setItem('payHandleBannerDismissed', '1');
              setPayHandleDismissed(true);
            }}
            className="text-amber-500 hover:text-amber-300 text-lg leading-none transition-colors ml-1"
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

      {/* ── Post-payment banners ── */}
      {paymentResult === 'success' && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl px-4 py-3 mb-6 text-sm font-medium">
          <span className="text-lg">✅</span>
          <span>Payment confirmed — you're officially in! Invite your crew and get ready to draft.</span>
          <button onClick={() => setSearchParams({})} className="ml-auto text-green-600 hover:text-green-400 transition-colors text-lg leading-none">×</button>
        </div>
      )}
      {paymentResult === 'cancelled' && (
        <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-xl px-4 py-3 mb-6 text-sm font-medium">
          <span className="text-lg">⚠️</span>
          <span>Payment was cancelled. You can complete it below when you're ready.</span>
          <button onClick={() => setSearchParams({})} className="ml-auto text-yellow-600 hover:text-yellow-400 transition-colors text-lg leading-none">×</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="relative mb-8">
        <div className="absolute -inset-y-6 inset-x-0 bg-brand-500/5 rounded-3xl blur-2xl pointer-events-none" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-5xl font-black text-white mb-3 leading-tight break-words">
              {league.name}
            </h1>
            <StatusBadge status={league.status} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {league.status === 'drafting' && (
              <Link to={`/league/${id}/draft`} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-base">
                🚀 Enter Draft Room
              </Link>
            )}
            {(league.status === 'active' || league.status === 'completed') && (
              <Link to={`/league/${id}/leaderboard`} className="btn-secondary px-5 py-2.5">
                Leaderboard
              </Link>
            )}
            {isCommissioner && league.status === 'active' && (
              <Link to={`/league/${id}/admin`} className="btn-secondary px-5 py-2.5">
                Enter Stats
              </Link>
            )}
            {isCommissioner && league.status === 'lobby' && (
              <button onClick={openEditSettings} className="btn-secondary px-5 py-2.5 flex items-center gap-2">
                ⚙️ Edit Settings
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Access fee banner ── */}
      {myPaymentDue && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-red-300 font-semibold">Access Fee Due</div>
              <div className="text-red-400/80 text-sm">
                {promoWaived ? 'Your $5 access fee has been waived 🎉' : 'Pay your $5.00 access fee to participate in the draft.'}
              </div>
            </div>
            <button onClick={handlePayEntryFee} disabled={entryPayLoading}
              className="bg-red-600 hover:bg-red-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap shrink-0">
              {entryPayLoading ? 'Loading...' : promoWaived ? 'Claim Free Access' : 'Pay $5.00'}
            </button>
          </div>
          <PromoInput
            code={promoCode} onCodeChange={setPromoCode}
            status={promoStatus} message={promoMessage}
            onApply={applyPromo}
          />
        </div>
      )}

      {/* ── Smart Draft lobby upsell ── */}
      {(league.status === 'lobby' || league.status === 'drafting') && (
        <SmartDraftBanner leagueId={id} />
      )}

      {/* ── Pill tabs ── */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
              tab === t.id
                ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}>
            {t.label}
            {t.dot && <span className={`w-2 h-2 bg-red-500 rounded-full${t.dotPulse ? ' animate-pulse' : ''}`} />}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* OVERVIEW TAB                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="space-y-6">

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map(card => (
              <div key={card.label}
                className={`relative group rounded-2xl p-5 border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                  card.gold
                    ? 'bg-gradient-to-br from-amber-900/30 to-gray-900 border-amber-500/30 hover:border-amber-500/60 hover:shadow-amber-500/10'
                    : 'bg-gray-900 border-gray-800 hover:border-brand-500/30 hover:shadow-brand-500/10'
                }`}>
                <div className="text-2xl mb-2">{card.icon}</div>
                <div className={`text-2xl font-black mb-0.5 ${card.gold ? 'text-amber-400' : 'text-brand-400'}`}>
                  {card.value}
                </div>
                <div className="text-gray-200 text-sm font-semibold">{card.label}</div>
                <div className="text-gray-500 text-xs mt-0.5">{card.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Prize pool card ── */}
          {buyIn > 0 && (
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-900/20 via-gray-900 to-gray-900 p-6">
              <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              <div className="relative space-y-5">

                {/* Total */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-amber-500 text-xs font-bold uppercase tracking-widest mb-2">Prize Pool</div>
                    <div className="flex items-end gap-3 flex-wrap">
                      <span className="text-5xl sm:text-6xl font-black text-white">{fmt(prizePool)}</span>
                      {members.length < league.max_teams && (
                        <span className="text-amber-400/50 text-xl font-bold mb-2">/ {fmt(maxPrizePool)} max</span>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm mt-1">{fmt(buyIn)} × {members.length} teams</div>
                  </div>
                  <span className="text-6xl select-none" aria-hidden>🏆</span>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-300 text-sm font-medium">
                      {members.length} of {league.max_teams} teams joined
                    </span>
                    {spotsLeft > 0
                      ? <span className="text-red-400 text-sm font-bold">{spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left!</span>
                      : <span className="text-green-400 text-sm font-bold">League full 🔥</span>
                    }
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-700 ease-out"
                      style={{ width: `${(members.length / league.max_teams) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Payout breakdown */}
                {(league.payout_first > 0 || league.payout_second > 0 || league.payout_third > 0 || league.payout_bonus > 0) && (
                  <div className="space-y-3">
                    {/* Show main pool note when a bonus is set */}
                    {bonus > 0 && (
                      <div className="text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-2">
                        💰 <span className="text-white font-semibold">{fmt(prizePool)}</span> total pool ·{' '}
                        <span className="text-purple-400 font-semibold">{fmt(bonus)}</span> single game bonus ={' '}
                        <span className="text-yellow-400 font-semibold">{fmt(mainPool)}</span> standings pool
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { icon: '🥇', label: '1st Place',  pct: league.payout_first,  ring: 'border-yellow-500/40 bg-yellow-500/10',   text: 'text-yellow-400' },
                        { icon: '🥈', label: '2nd Place',  pct: league.payout_second, ring: 'border-gray-400/30 bg-gray-400/10',       text: 'text-gray-300'  },
                        { icon: '🥉', label: '3rd Place',  pct: league.payout_third,  ring: 'border-amber-700/40 bg-amber-900/20',     text: 'text-amber-600' },
                      ].filter(p => p.pct > 0).map(p => {
                        const cur = mainPool * p.pct / 100;
                        const max = maxMainPool * p.pct / 100;
                        return (
                          <div key={p.label} className={`rounded-xl border p-3 ${p.ring}`}>
                            <div className="text-xl mb-1">{p.icon}</div>
                            <div className={`text-xl font-black ${p.text}`}>{fmt(cur)}</div>
                            {members.length < league.max_teams && (
                              <div className="text-gray-500 text-xs">up to {fmt(max)}</div>
                            )}
                            <div className="text-gray-400 text-xs mt-0.5">{p.label} · {p.pct}%</div>
                            {bonus > 0 && (
                              <div className="text-gray-600 text-xs">of {fmt(mainPool)}</div>
                            )}
                          </div>
                        );
                      })}
                      {bonus > 0 && (
                        <div className="rounded-xl border border-purple-500/30 bg-purple-900/15 p-3">
                          <div className="text-xl mb-1">🎯</div>
                          <div className="text-xl font-black text-purple-400">{fmt(bonus)}</div>
                          <div className="text-gray-400 text-xs mt-0.5">Single game bonus</div>
                          <div className="text-gray-600 text-xs">highest single-game scorer</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment instructions */}
                {league.payment_instructions && (
                  <div className="border-t border-amber-500/10 pt-4">
                    <div className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-2">How to Pay Your Buy-in</div>
                    <div className="flex items-center justify-between gap-3 bg-gray-800/80 rounded-xl px-4 py-3">
                      <span className="text-gray-200 text-sm">{league.payment_instructions}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(league.payment_instructions);
                          setInstrCopied(true);
                          setTimeout(() => setInstrCopied(false), 2000);
                        }}
                        className="text-brand-400 hover:text-brand-300 text-xs font-bold shrink-0 transition-colors"
                      >
                        {instrCopied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-gray-600 text-xs mt-2">Paid outside the app · {fmt(buyIn)} per team</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Auto-start / scheduled draft banner ── */}
          {league.status === 'lobby' && (league.auto_start_on_full || league.draft_start_time) && (
            <div className="flex items-start gap-3 bg-brand-500/10 border border-brand-500/25 rounded-xl p-4">
              <span className="text-2xl shrink-0">{league.auto_start_on_full ? '⚡' : '🕐'}</span>
              <div>
                <div className="text-brand-400 font-bold">
                  {league.auto_start_on_full ? 'Auto-start enabled' : 'Draft scheduled'}
                </div>
                <p className="text-gray-400 text-sm mt-0.5">
                  {league.auto_start_on_full
                    ? `Draft will begin automatically once all ${league.max_teams} teams have joined and paid.`
                    : `Draft starts at ${new Date(league.draft_start_time).toLocaleString()}`}
                </p>
              </div>
            </div>
          )}

          {/* ── Draft live banner ── */}
          {league.status === 'drafting' && (
            <div className="text-center bg-brand-500/10 border border-brand-500/25 rounded-2xl p-10">
              <div className="text-6xl mb-3">⚡</div>
              <h3 className="text-2xl font-black text-white mb-2">Draft Is Live!</h3>
              <p className="text-gray-400 mb-6">Get in there before your pick timer runs out.</p>
              <Link to={`/league/${id}/draft`} className="btn-primary px-10 py-3 text-lg inline-flex items-center gap-2">
                🚀 Enter Draft Room
              </Link>
            </div>
          )}

          {/* ── Invite code (lobby only) ── */}
          {league.status === 'lobby' && (
            <div className="rounded-2xl border border-gray-700 bg-gray-900 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="font-bold text-white">Invite Your League</h3>
                {spotsLeft > 0 && (
                  <span className="text-red-400 text-sm font-bold">
                    {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left — fill up fast!
                  </span>
                )}
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-gray-800/60 rounded-xl p-6 text-center">
                  <p className="text-gray-500 text-xs uppercase tracking-widest mb-3">Invite Code</p>
                  <p className="text-brand-400 font-mono font-black text-3xl sm:text-5xl tracking-widest sm:tracking-[0.25em] mb-5 select-all">
                    {league.invite_code}
                  </p>
                  <div className="flex gap-3 justify-center flex-wrap">
                    <button onClick={copyInviteCode}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                        copied
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-brand-500 hover:bg-brand-400 text-white hover:scale-105'
                      }`}>
                      {copied ? '✓ Copied!' : '📋 Copy Code'}
                    </button>
                    <button onClick={() => {
                        const shareText = `Join my TourneyRun league "${league.name}"! Invite code: ${league.invite_code}`;
                        const shareUrl  = `${window.location.origin}/join`;
                        if (navigator.share) {
                          navigator.share({ title: 'Join my TourneyRun league!', text: shareText, url: shareUrl }).catch(() => {});
                        } else {
                          navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                          setLinkCopied(true);
                          setTimeout(() => setLinkCopied(false), 2000);
                        }
                      }}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm border transition-all duration-200 ${
                        linkCopied
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-200 border-gray-600 hover:scale-105'
                      }`}>
                      {linkCopied ? '✓ Link copied!' : '📲 Text Your Friends!'}
                    </button>
                  </div>
                </div>
                <p className="text-gray-600 text-xs text-center">
                  Friends enter the code at{' '}
                  <span className="text-gray-400 font-mono">{window.location.origin}/join</span>
                </p>
              </div>
            </div>
          )}

          {/* ── Teams grid ── */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-bold text-white">Teams</h3>
              <span className="text-gray-500 text-sm">{members.length} / {league.max_teams} joined</span>
            </div>
            <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Filled slots */}
              {members.map(member => (
                <div key={member.id}
                  className="group flex items-center gap-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/40 hover:border-brand-500/30 rounded-xl p-3 transition-all duration-200">
                  <div className="relative group/av shrink-0">
                    <TeamAvatar avatarUrl={member.avatar_url} teamName={member.team_name} size="md" />
                    {member.user_id === user?.id && (
                      <label
                        className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover/av:opacity-100 transition-opacity cursor-pointer flex items-center justify-center"
                        title="Upload team logo"
                      >
                        <span className="text-white text-[9px] font-bold">✏️</span>
                        <input
                          type="file" accept=".jpg,.jpeg,.png,.gif" className="hidden"
                          onChange={handleAvatarUpload} disabled={avatarUploading}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-sm truncate">{member.team_name}</div>
                    <div className="text-gray-500 text-xs truncate">@{member.username}</div>
                    {member.venmo_handle && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <VenmoBadge />
                        <span className="text-gray-400 text-[10px] truncate">{member.venmo_handle}</span>
                      </div>
                    )}
                    {member.zelle_handle && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <ZelleBadge />
                        <span className="text-gray-400 text-[10px] truncate">{member.zelle_handle}</span>
                      </div>
                    )}
                    {member.user_id === user?.id && avatarError && (
                      <div className="text-red-400 text-[10px] mt-0.5">{avatarError}</div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {member.user_id === league.commissioner_id && (
                      <span className="text-[9px] font-bold text-brand-400 bg-brand-500/15 border border-brand-500/25 px-1.5 py-0.5 rounded-full">
                        COMM
                      </span>
                    )}
                    {smartDraftUsers.has(member.user_id) && (
                      <span className="text-[9px] font-bold text-green-400 bg-green-500/15 border border-green-500/25 px-1.5 py-0.5 rounded-full">
                        🤖 Smart Draft
                      </span>
                    )}
                    {paymentMap[member.user_id] && (
                      <PaymentBadge status={paymentMap[member.user_id]} />
                    )}
                    {member.total_points > 0 && (
                      <span className="text-brand-400 font-bold text-xs">{member.total_points}pt</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Empty slots */}
              {Array.from({ length: spotsLeft }).map((_, i) => (
                <div key={`empty-${i}`}
                  className="flex items-center gap-3 bg-gray-800/20 border border-dashed border-gray-700/40 rounded-xl p-3">
                  <div className="w-9 h-9 rounded-full bg-gray-700/40 flex items-center justify-center text-gray-600 font-bold shrink-0">
                    +
                  </div>
                  <div>
                    <div className="text-gray-600 text-sm font-medium">Open Slot</div>
                    <div className="text-gray-700 text-xs">Waiting for team</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Randomize draft order (commissioner + lobby) ── */}
          {isCommissioner && league.status === 'lobby' && (
            <div className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <div>
                <div className="text-white font-semibold text-sm">🎲 Randomize Draft Order</div>
                <div className="text-gray-500 text-xs mt-0.5">
                  {league.draft_order_randomized
                    ? 'Draft order has been randomized — one and done, just like Duke and Kentucky players'
                    : 'Shuffle the draft order randomly. One-and-done — cannot be undone.'}
                </div>
              </div>
              <button
                onClick={randomizeDraftOrder}
                disabled={randomizing || !!league.draft_order_randomized}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-500 text-white"
              >
                {league.draft_order_randomized ? '✓ Done' : randomizing ? 'Shuffling...' : 'Randomize'}
              </button>
            </div>
          )}

          {/* ── Start draft button (commissioner + lobby) ── */}
          {isCommissioner && league.status === 'lobby' && (
            <div className="space-y-2">
              <button
                onClick={startDraft}
                disabled={starting || members.length < 2}
                className="w-full py-5 text-xl font-black bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white rounded-2xl transition-all duration-200 hover:scale-[1.01] hover:shadow-2xl hover:shadow-brand-500/30 disabled:hover:scale-100 flex items-center justify-center gap-3"
              >
                <span className="text-3xl">🚀</span>
                {starting ? 'Starting Draft...' : 'Start Draft'}
              </button>
              {members.length < 2 && (
                <p className="text-yellow-400 text-sm text-center">Need at least 2 teams to start</p>
              )}
              {!allPaid && totalCount > 0 && members.length >= 2 && (
                <p className="text-yellow-400/70 text-xs text-center">
                  {totalCount - paidCount} team{totalCount - paidCount !== 1 ? 's' : ''} {totalCount - paidCount !== 1 ? 'haven\'t' : 'hasn\'t'} paid yet — you can still start manually.
                </p>
              )}
            </div>
          )}

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MY ROSTER TAB                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'roster' && (() => {
        const scoreMap = Object.fromEntries(myStandingsPlayers.map(p => [p.player_id, p]));
        const hasScores = myStandingsPlayers.length > 0;
        const totalPts = myPicks.reduce((sum, p) => sum + (scoreMap[p.player_id]?.fantasy_points ?? 0), 0);
        const totalETP = myPicks.reduce((sum, p) => sum + (scoreMap[p.player_id]?.proj_etp ?? 0), 0);
        const aliveCount = myPicks.filter(p => !p.is_eliminated).length;

        return (
          <div>
            {myPicks.length === 0 ? (
              <div className="card p-12 text-center text-gray-400">
                <div className="text-4xl mb-3">📋</div>
                <p>No players drafted yet.</p>
                {league.status === 'drafting' && (
                  <Link to={`/league/${id}/draft`} className="btn-primary mt-4 inline-block px-6">
                    Go to Draft Room
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary header */}
                <div className="card px-4 py-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">{myPicks.length} players</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}>
                        {aliveCount} alive
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      {hasScores && (
                        <div className="text-right">
                          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Points</div>
                          <div className="font-black text-brand-400" style={{ fontSize: 18 }}>{totalPts.toFixed(1)}</div>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Proj. ETP</div>
                        <div className="font-black text-gray-300" style={{ fontSize: 18 }}>{totalETP.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Player rows */}
                {myPicks.map(pick => {
                  const scored = scoreMap[pick.player_id];
                  const isElim = !!pick.is_eliminated;
                  const isLive = !!scored?.is_live;
                  const fantasyPts = scored?.fantasy_points ?? null;
                  const gameLog = scored?.game_log || [];
                  const isExpanded = expandedPlayerId === pick.player_id;

                  const av = playerAvatarStyle(pick.player_name, pick.team);
                  return (
                    <div key={pick.id} className="card overflow-hidden"
                      style={{ opacity: isElim ? 0.55 : 1 }}>
                      {/* Main row — clickable */}
                      <button
                        type="button"
                        onClick={() => setExpandedPlayerId(isExpanded ? null : pick.player_id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
                      >
                        {/* Player avatar */}
                        <div className="relative flex-shrink-0">
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: av.bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 11, color: av.textColor,
                          }}>
                            {av.initials}
                          </div>
                          {pick.seed ? (
                            <div style={{
                              position: 'absolute', bottom: -2, right: -4,
                              background: '#1f2937', border: '1px solid #374151',
                              borderRadius: 4, padding: '0 3px',
                              fontSize: 8, fontWeight: 700, color: '#9ca3af',
                              lineHeight: '12px',
                            }}>
                              #{pick.seed}
                            </div>
                          ) : null}
                        </div>

                        {/* Name + school */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate"
                            style={{ color: isElim ? '#6b7280' : '#fff', textDecoration: isElim ? 'line-through' : 'none' }}>
                            {pick.player_name}
                          </div>
                          <div className="text-gray-500 text-xs truncate">
                            {pick.team} <span style={{ fontSize: 14 }}>{teamEmoji(pick.team)}</span>{pick.position ? ` · ${pick.position}` : ''}
                            {pick.region ? ` · ${pick.region}` : ''}
                          </div>
                        </div>

                        {/* PPG */}
                        <div className="text-right shrink-0 min-w-[36px]">
                          <div className="text-gray-300 text-xs font-semibold">{parseFloat(pick.season_ppg || 0).toFixed(1)}</div>
                          <div className="text-gray-600 text-[10px]">PPG</div>
                        </div>

                        {/* Points scored */}
                        {hasScores && (
                          <div className="text-right shrink-0 min-w-[36px]">
                            <div className="font-bold text-xs" style={{ color: fantasyPts > 0 ? '#60a5fa' : '#6b7280' }}>
                              {fantasyPts != null && fantasyPts > 0 ? fantasyPts.toFixed(1) : '—'}
                            </div>
                            <div className="text-gray-600 text-[10px]">pts</div>
                          </div>
                        )}

                        {/* Status pill */}
                        <div className="shrink-0">
                          {isElim ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                              ELIM
                            </span>
                          ) : isLive ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }}>
                              ● LIVE
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399' }}>
                              ✓ Alive
                            </span>
                          )}
                        </div>

                        {/* Chevron */}
                        <svg
                          className="w-3.5 h-3.5 text-gray-600 shrink-0 transition-transform duration-200"
                          style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Game log dropdown */}
                      {isExpanded && (
                        <div className="border-t border-gray-800 bg-gray-900/60 px-4 py-3">
                          {gameLog.length === 0 ? (
                            <p className="text-gray-500 text-xs text-center py-1">No games played yet.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-600 uppercase tracking-wider text-[10px]">
                                  <th className="text-left pb-1.5 font-semibold">Date</th>
                                  <th className="text-left pb-1.5 font-semibold">Opponent</th>
                                  <th className="text-left pb-1.5 font-semibold">Round</th>
                                  <th className="text-right pb-1.5 font-semibold">PTS</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-800/60">
                                {gameLog.map((g, i) => (
                                  <tr key={i}>
                                    <td className="py-1 text-gray-400">{g.game_date}</td>
                                    <td className="py-1 text-gray-300">{g.opponent || '—'}</td>
                                    <td className="py-1 text-gray-500">{g.round_code || '—'}</td>
                                    <td className="py-1 text-right font-bold" style={{ color: g.points > 0 ? '#60a5fa' : '#6b7280' }}>
                                      {g.points ?? '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STANDINGS TAB                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'standings' && (() => {
        const hasStandingsData = allStandings.length > 0;

        const handleStandingsSort = (col) => {
          if (!hasStandingsData) return;
          if (standingsSort === col) {
            setStandingsSortDir(d => d === 'desc' ? 'asc' : 'desc');
          } else {
            setStandingsSort(col);
            setStandingsSortDir(col === 'name' ? 'asc' : 'desc');
          }
        };

        const sortedRows = hasStandingsData
          ? [...allStandings].sort((a, b) => {
              let cmp = 0;
              if (standingsSort === 'points') {
                cmp = a.total_points - b.total_points;
              } else if (standingsSort === 'etp') {
                const etpA = a.players?.reduce((s, p) => s + (p.proj_etp ?? 0), 0) ?? 0;
                const etpB = b.players?.reduce((s, p) => s + (p.proj_etp ?? 0), 0) ?? 0;
                cmp = etpA - etpB;
              } else if (standingsSort === 'name') {
                cmp = a.team_name.localeCompare(b.team_name);
              } else if (standingsSort === 'alive') {
                const aliveA = a.players?.filter(p => !p.is_eliminated).length ?? 0;
                const aliveB = b.players?.filter(p => !p.is_eliminated).length ?? 0;
                cmp = aliveA - aliveB;
              }
              return standingsSortDir === 'desc' ? -cmp : cmp;
            })
          : [...members].sort((a, b) => b.total_points - a.total_points);

        const ColHeader = ({ col, label, align = 'right' }) => {
          const active = standingsSort === col;
          const arrow = active ? (standingsSortDir === 'desc' ? ' ↓' : ' ↑') : '';
          return (
            <span
              onClick={() => handleStandingsSort(col)}
              className={`select-none transition-colors ${
                hasStandingsData ? 'cursor-pointer' : ''
              } ${
                active
                  ? 'text-white font-bold'
                  : 'text-gray-500 hover:text-gray-300 font-semibold'
              } ${align === 'left' ? '' : ''}`}
            >
              {label}{arrow}
            </span>
          );
        };

        const bonus = parseFloat(league?.payout_bonus) || 0;

        return (
          <div>
            {/* ── Live Game Banner ── */}
            {league.status === 'active' && (
              <LiveGamesBanner leagueId={id} onLiveStatus={setHasLiveGames} />
            )}

            {/* ── Single Game Bonus card ── */}
            {bonus > 0 && (
              <div
                className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-900/15 via-gray-900 to-gray-900 mb-4 overflow-hidden cursor-pointer"
                onClick={() => setSgExpanded(v => !v)}
              >
                {/* Header row */}
                <div className="flex items-center gap-2 px-5 pt-4 pb-1">
                  <span className="text-base">🎯</span>
                  <span className="text-amber-400 font-bold text-sm">Single Game Bonus</span>
                  <span className="text-amber-300 font-black text-sm">{fmt(bonus)}</span>
                  <span className="ml-auto text-gray-600 text-xs">{sgExpanded ? '▲ collapse' : '▼ expand'}</span>
                </div>

                {/* Body */}
                {!sgLeader ? (
                  <div className="px-5 pb-4 pt-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span className="text-gray-400 text-sm">Tournament tips off March 20 — check back Thursday!</span>
                  </div>
                ) : (
                  <>
                    {/* Leader hero */}
                    <div className="px-5 pb-4 pt-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="text-white font-black text-xl leading-tight">{sgLeader.player_name}</span>
                            <span className="text-amber-400 font-black text-xl">{sgLeader.points} pts</span>
                            {sgLeader.is_live && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                                LIVE
                              </span>
                            )}
                          </div>
                          <div className="text-gray-400 text-xs mt-0.5 flex flex-wrap items-center gap-1">
                            {sgLeader.player_team && <span className="text-gray-300 font-medium">{sgLeader.player_team}</span>}
                            {sgLeader.player_team && <span className="text-gray-600">·</span>}
                            {sgLeader.round_name && <span>{sgLeader.round_name}</span>}
                            {sgLeader.round_name && sgLeader.opponent && <span className="text-gray-600">·</span>}
                            {sgLeader.opponent && <span>vs {sgLeader.opponent}</span>}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                            {sgLeader.owner_user_id ? (
                              <>
                                <span className="text-gray-500 text-xs">Owner:</span>
                                <span className="text-green-400 font-semibold text-xs">{sgLeader.owner_team_name}</span>
                                <span className="text-gray-600 text-xs">@{sgLeader.owner_username}</span>
                                {sgLeader.owner_venmo && (
                                  <span className="inline-flex items-center gap-1">
                                    <VenmoBadge /><span className="text-gray-300 text-[10px]">{sgLeader.owner_venmo}</span>
                                  </span>
                                )}
                                <span className="text-gray-700 text-[10px]">← send {fmt(bonus)} here</span>
                              </>
                            ) : (
                              <span className="text-xs text-gray-600">Not drafted — no bonus awarded yet</span>
                            )}
                          </div>
                        </div>
                        <span className="text-3xl select-none shrink-0">👑</span>
                      </div>
                    </div>

                    {/* Expanded full board */}
                    {sgExpanded && sgBoard.length > 1 && (
                      <div className="border-t border-amber-500/15 divide-y divide-gray-800/60">
                        {sgBoard.map((row, i) => (
                          <div key={`${row.player_id}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                            <span className="text-gray-600 text-xs font-bold w-5 shrink-0 text-right">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className={`font-bold text-sm ${i === 0 ? 'text-white' : 'text-gray-300'}`}>{row.player_name}</span>
                                <span className="text-gray-500 text-xs">{row.player_team}</span>
                                {row.round_name && <span className="text-gray-600 text-xs">· {row.round_name}</span>}
                                {row.is_live && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1 py-0.5 rounded"
                                    style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' }}>
                                    <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse inline-block" />
                                    LIVE
                                  </span>
                                )}
                              </div>
                              {row.owner_user_id ? (
                                <div className="text-gray-500 text-xs mt-0.5">
                                  {row.owner_team_name} <span className="text-gray-700">@{row.owner_username}</span>
                                </div>
                              ) : (
                                <div className="text-gray-700 text-xs mt-0.5">Undrafted</div>
                              )}
                            </div>
                            <span className={`font-black text-sm shrink-0 ${i === 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                              {row.points} pts
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end mb-3">
              <Link to={`/league/${id}/leaderboard`} className="text-brand-400 hover:text-brand-300 text-sm font-medium">
                Full Leaderboard →
              </Link>
            </div>
            <div className="card overflow-hidden">
              {/* Column headers */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-800 text-xs">
                <ColHeader col="name" label="Team" align="left" />
                {hasStandingsData && (
                  <div className="flex items-center gap-3 sm:gap-5">
                    <span className="hidden sm:inline-block"><ColHeader col="etp" label="Proj. ETP" /></span>
                    <ColHeader col="alive" label="Alive" />
                    <ColHeader col="points" label="Pts" />
                  </div>
                )}
              </div>
              {/* Rows — key triggers fade animation on sort change */}
              <div key={`${standingsSort}-${standingsSortDir}`} className="divide-y divide-gray-800 animate-sort">
                {sortedRows.map((row, i) => {
                  const alivePlayers = row.players?.filter(p => !p.is_eliminated) ?? [];
                  const aliveCount = row.players ? alivePlayers.length : null;
                  const projETP = row.players
                    ? row.players.reduce((s, p) => s + (p.proj_etp ?? 0), 0)
                    : null;
                  return (
                    <div key={row.id || row.user_id} className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                          i === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          i === 1 ? 'bg-gray-400/20 text-gray-300'   :
                          i === 2 ? 'bg-amber-900/30 text-amber-600'  :
                                    'bg-gray-800 text-gray-500'
                        }`}>{i + 1}</span>
                        <TeamAvatar avatarUrl={row.avatar_url} teamName={row.team_name} size="sm" />
                        <div className="min-w-0">
                          <div className="text-white font-medium truncate">{row.team_name}</div>
                          <div className="text-gray-500 text-xs">@{row.username}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:gap-5 shrink-0 ml-2">
                        {projETP !== null && (
                          <div className="hidden sm:block text-right w-14">
                            <div className={`font-bold text-sm ${projETP > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                              {projETP > 0 ? projETP.toFixed(1) : '—'}
                            </div>
                          </div>
                        )}
                        {aliveCount !== null && (
                          <div className="text-right w-8">
                            <div className={`font-bold text-sm ${aliveCount === 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {aliveCount}
                            </div>
                          </div>
                        )}
                        <div className="text-right w-10">
                          <div className="text-brand-400 font-bold">{row.total_points > 0 ? row.total_points : '—'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TRASH TALK TAB                                                       */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'trashtalk' && (
        <TrashTalkTab leagueId={id} isCommissioner={isCommissioner} />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* PAYMENTS TAB                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'payments' && (
        <div className="space-y-5">
          {paymentLoading ? (
            <div className="card p-12 text-center text-gray-400 animate-pulse">Loading payment info...</div>
          ) : (
            <>
              {myPaymentDue && (
                <div className="card p-5 border-red-500/30 space-y-4">
                  <div>
                    <h3 className="font-bold text-white mb-1">Access Fee Due</h3>
                    <p className="text-gray-400 text-sm">
                      {promoWaived
                        ? 'Your $5 access fee has been waived by a promo code 🎉'
                        : 'Pay the $5.00 TourneyRun access fee to participate in the draft.'}
                    </p>
                  </div>
                  <PromoInput
                    code={promoCode} onCodeChange={setPromoCode}
                    status={promoStatus} message={promoMessage}
                    onApply={applyPromo}
                  />
                  <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-3 text-sm text-brand-300">
                    Test card: <span className="font-mono font-semibold">4242 4242 4242 4242</span> — any future date, any CVC
                  </div>
                  <button onClick={handlePayEntryFee} disabled={entryPayLoading}
                    className="btn-primary px-6 py-2.5 text-lg w-full">
                    {entryPayLoading
                      ? (promoWaived ? 'Activating...' : 'Redirecting...')
                      : promoWaived ? 'Claim Free Access 🎉' : 'Pay $5.00 Access Fee'}
                  </button>
                </div>
              )}

              {league.status === 'lobby' && paymentInfo && (
                <div className={`rounded-xl p-4 text-sm ${
                  allPaid
                    ? 'bg-green-900/20 border border-green-700/40 text-green-300'
                    : 'bg-yellow-900/20 border border-yellow-700/40 text-yellow-300'
                }`}>
                  {allPaid
                    ? `All ${totalCount} teams have paid — the draft is ready to start.`
                    : `${paidCount} of ${totalCount} teams have paid. Draft cannot begin until everyone pays.`}
                </div>
              )}

              {paymentInfo?.payments?.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h3 className="font-bold text-white">
                      {isCommissioner ? 'All Member Payments' : 'Payment Status'}
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {(isCommissioner
                      ? paymentInfo.payments
                      : paymentInfo.payments.filter(p => p.user_id === user?.id)
                    ).map(p => (
                      <div key={p.user_id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <div className="text-white text-sm font-medium">{p.username}</div>
                          {p.paid_at && (
                            <div className="text-gray-500 text-xs">
                              Paid {new Date(p.paid_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400 text-sm">${p.amount?.toFixed(2)}</span>
                          <PaymentBadge status={p.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {isCommissioner && (
                    <div className="px-5 py-3 bg-gray-800/50 border-t border-gray-800 text-sm text-gray-400">
                      {paidCount} of {totalCount} paid
                    </div>
                  )}
                </div>
              )}

              <Disclaimer className="text-center pt-2" />
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ADMIN TAB                                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'admin' && isCommissioner && (
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-bold text-white mb-4">Commissioner Controls</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {league.status === 'lobby' && (
                <button onClick={startDraft} disabled={starting || members.length < 2}
                  className="btn-primary py-3 text-center disabled:opacity-50 flex items-center justify-center gap-2">
                  🚀 {starting ? 'Starting...' : 'Start Draft'}
                </button>
              )}
              {league.status === 'lobby' && members.length >= 2 && (
                <button onClick={handleForceStart}
                  className="py-3 text-center flex items-center justify-center gap-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 border border-yellow-600/40 rounded-lg font-semibold text-sm transition-colors">
                  ⚡ Force Start (Skip Payments)
                </button>
              )}
              {league.status === 'drafting' && (
                <Link to={`/league/${id}/draft`} className="btn-primary py-3 text-center block">
                  Go to Draft Room
                </Link>
              )}
              {(league.status === 'active' || league.status === 'completed') && (
                <Link to={`/league/${id}/admin`} className="btn-primary py-3 text-center block">
                  Enter Game Stats
                </Link>
              )}
              <Link to={`/league/${id}/leaderboard`} className="btn-secondary py-3 text-center block">
                View Leaderboard
              </Link>
            </div>
          </div>

          {settings && (
            <div className="card p-5">
              <h3 className="font-bold text-white text-sm mb-1">Scoring</h3>
              <p className="text-gray-400 text-sm">
                <span className="text-brand-400 font-bold">+{settings.pts_per_point} fantasy pt</span> per point scored
              </p>
            </div>
          )}

          <div className="card p-5">
            <h3 className="font-bold text-white text-sm mb-3">League Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">TourneyRun Access Fee</span>
                <span className="text-white">$5.00 per team</span>
              </div>
              {buyIn > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Group Buy-in</span>
                  <span className="text-amber-400 font-semibold">{fmt(buyIn)} per team</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Status</span>
                <StatusBadge status={league.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Invite Code</span>
                <span className="text-brand-400 font-mono font-bold tracking-widest">{league.invite_code}</span>
              </div>
            </div>
            {league.payment_instructions && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-gray-400 text-xs font-medium mb-1">Payment Instructions</div>
                <div className="text-gray-300 text-sm">{league.payment_instructions}</div>
              </div>
            )}
          </div>

          {league.status === 'lobby' && (
            <div className="card p-5 border-dashed border-yellow-700/40">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-white text-sm">Test Tools</h3>
                <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                  dev only
                </span>
              </div>
              <p className="text-gray-400 text-sm mb-3">
                Fill remaining slots with test accounts (
                <span className="font-mono text-gray-300">testuser01</span>–
                <span className="font-mono text-gray-300">testuser12</span>,
                password: <span className="font-mono text-gray-300">testpass123</span>).
                All payments auto-marked paid.
              </p>
              {populateResult && (
                <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 text-sm text-green-300 mb-3">
                  {populateResult.message}
                  {populateResult.added?.length > 0 && (
                    <div className="mt-1 text-green-400/70 font-mono text-xs">
                      {populateResult.added.map(u => u.username).join(', ')}
                    </div>
                  )}
                </div>
              )}
              <button onClick={handlePopulateTestLeague} disabled={populateLoading}
                className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors">
                {populateLoading ? 'Populating...' : 'Populate Test League'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SINDARIUS TAB                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'sindarius' && (
        <SindariusTab leagueId={id} />
      )}

      {/* ── Edit Settings Modal ── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { if (!editSaving) setEditOpen(false); }}
          />

          <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-white">⚙️ Edit League Settings</h2>
                <p className="text-gray-500 text-xs mt-0.5">Settings lock once the draft begins</p>
              </div>
              {!editSaving && (
                <button onClick={() => setEditOpen(false)}
                  className="text-gray-500 hover:text-white transition-colors text-xl leading-none">
                  ×
                </button>
              )}
            </div>

            {editSuccess ? (
              /* ── Success state ── */
              <div className="px-6 py-10 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-white font-semibold text-lg mb-1">Settings updated</p>
                <p className="text-gray-400 text-sm">All team members will see the changes immediately.</p>
                <button onClick={() => setEditOpen(false)}
                  className="btn-primary px-8 py-2.5 mt-6">
                  Done
                </button>
              </div>
            ) : (
              /* ── Form ── */
              <div className="px-6 py-5 space-y-5">

                {/* Draft start time */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1.5">
                    Draft Start Time <span className="text-gray-600 font-normal">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-brand-500 transition-colors"
                    value={editForm.draft_start_time}
                    onChange={e => setEditForm(f => ({ ...f, draft_start_time: e.target.value }))}
                  />
                  {editForm.draft_start_time && (
                    <button onClick={() => setEditForm(f => ({ ...f, draft_start_time: '' }))}
                      className="text-xs text-gray-500 hover:text-red-400 mt-1 transition-colors">
                      Clear scheduled time
                    </button>
                  )}
                </div>

                {/* Pick timer */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">Pick Timer</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[{ v: 30, l: '30s' }, { v: 60, l: '60s' }, { v: 90, l: '90s' }, { v: 120, l: '2 min' }].map(({ v, l }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f, pick_time_limit: v }))}
                        className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                          editForm.pick_time_limit === v
                            ? 'bg-brand-500/20 border-brand-500/60 text-brand-400'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max teams + Draft rounds */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">
                      Max Teams
                    </label>
                    <input
                      type="number"
                      min={members.length}
                      max={20}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-brand-500 transition-colors"
                      value={editForm.max_teams}
                      onChange={e => setEditForm(f => ({ ...f, max_teams: parseInt(e.target.value) || f.max_teams }))}
                    />
                    <p className="text-gray-600 text-[10px] mt-1">min {members.length} (current members)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1.5">
                      Draft Rounds
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-brand-500 transition-colors"
                      value={editForm.total_rounds}
                      onChange={e => setEditForm(f => ({ ...f, total_rounds: parseInt(e.target.value) || f.total_rounds }))}
                    />
                    <p className="text-gray-600 text-[10px] mt-1">players per team</p>
                  </div>
                </div>

                {/* Autodraft mode */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1">
                    League Auto-Draft Default
                  </label>
                  <p className="text-gray-500 text-[11px] mb-2">
                    Sets the fallback algorithm for all teams when their pick timer expires.
                    Individual teams can always upgrade to Smart Draft regardless.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: 'best_available', l: 'Best Available', sub: 'Highest ETP, skip injured' },
                      { v: 'smart_draft',    l: '⚡ Smart Draft',  sub: 'AI-balanced (free for league)' },
                    ].map(({ v, l, sub }) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f, autodraft_mode: v }))}
                        className={`py-2 px-3 rounded-xl text-left text-sm border transition-all ${
                          editForm.autodraft_mode === v
                            ? 'bg-brand-500/20 border-brand-500/60 text-brand-400'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-white'
                        }`}
                      >
                        <div className="font-semibold text-sm">{l}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">{sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Lock notice */}
                <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3.5 py-2.5">
                  <span className="text-yellow-500 text-sm mt-0.5 shrink-0">🔒</span>
                  <p className="text-yellow-400/80 text-xs leading-relaxed">
                    These settings will be locked permanently once you start the draft.
                  </p>
                </div>

                {editError && (
                  <p className="text-red-400 text-sm text-center">{editError}</p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setEditOpen(false)} disabled={editSaving}
                    className="flex-1 btn-secondary py-2.5 disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={saveSettings} disabled={editSaving}
                    className="flex-1 btn-primary py-2.5 disabled:opacity-50">
                    {editSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
