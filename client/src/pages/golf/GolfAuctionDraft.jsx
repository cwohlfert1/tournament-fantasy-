import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, Flag, Trophy, ArrowLeft, Search, ChevronDown, ChevronUp, Zap, Check, Clock, DollarSign } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import GolfLoader from '../../components/golf/GolfLoader';

// ── Tier helpers ────────────────────────────────────────────────────────────────

const TIER_LABEL = {
  800: { label: 'Elite',  color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  600: { label: 'Star',   color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20'    },
  400: { label: 'Value',  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20'  },
  300: { label: 'Deep',   color: 'text-gray-400',   bg: 'bg-gray-700/50 border-gray-700'      },
  200: { label: 'Sleeper',color: 'text-gray-500',   bg: 'bg-gray-800/50 border-gray-800'      },
};

function getTierKey(salary) {
  if (salary >= 800) return 800;
  if (salary >= 600) return 600;
  if (salary >= 400) return 400;
  if (salary >= 300) return 300;
  return 200;
}

function TierBadge({ salary }) {
  const t = TIER_LABEL[getTierKey(salary)] || TIER_LABEL[200];
  return (
    <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${t.bg} ${t.color}`}>
      {t.label}
    </span>
  );
}

// ── Timer bar ───────────────────────────────────────────────────────────────────

function TimerBar({ endsAt, timerSecs = 30 }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!endsAt) { setSecs(0); return; }
    function tick() {
      const remaining = Math.max(0, (new Date(endsAt) - Date.now()) / 1000);
      setSecs(remaining);
    }
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [endsAt]);

  const pct = Math.min(100, (secs / timerSecs) * 100);
  const barColor = secs <= 5 ? 'bg-red-500' : secs <= 10 ? 'bg-orange-500' : 'bg-green-500';
  const textColor = secs <= 5 ? 'text-red-400' : secs <= 10 ? 'text-orange-400' : 'text-green-400';

  if (!endsAt) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Bidding closes</span>
        <span className={`font-bold text-base tabular-nums ${textColor}`}>{Math.ceil(secs)}s</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-250 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────

export default function GolfAuctionDraft() {
  const { id } = useParams();
  const { user } = useAuth();
  useDocTitle('Auction Draft | TourneyRun');

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [rosterOpen, setRosterOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [nominating, setNominating] = useState(false);
  const [nominateId, setNominateId] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [actionError, setActionError] = useState('');
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/golf/leagues/${id}/auction/state`);
      setState(r.data);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 2500);
    return () => clearInterval(pollRef.current);
  }, [load]);

  async function startAuction() {
    setStarting(true);
    setActionError('');
    try {
      await api.post(`/golf/leagues/${id}/auction/start`);
      await load();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to start');
    }
    setStarting(false);
  }

  async function nominate(playerId) {
    setNominating(true);
    setActionError('');
    try {
      await api.post(`/golf/leagues/${id}/auction/nominate`, { player_id: playerId });
      setNominateId(null);
      await load();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to nominate');
    }
    setNominating(false);
  }

  async function placeBid(e) {
    e.preventDefault();
    setBidding(true);
    setActionError('');
    try {
      await api.post(`/golf/leagues/${id}/auction/bid`, { amount: parseInt(bidAmount) || 1 });
      setBidAmount('');
      await load();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to bid');
    }
    setBidding(false);
  }

  if (loading) return <GolfLoader />;
  if (!state) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <Flag className="w-8 h-8 text-gray-600" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">League not found</h2>
        <Link to="/golf/dashboard" className="text-green-400 hover:underline flex items-center gap-1 justify-center">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  const { league, session, currentPlayer, currentHighBidderTeam, isAmIHighBidder, members, wonPlayers, availablePlayers, myRoster, myBudget, isMyNominationTurn, isCommissioner } = state;

  // Tier filter logic
  const TIER_FILTERS = [
    { key: 'all',    label: 'All' },
    { key: 'elite',  label: 'Elite $600+',    fn: p => p.salary >= 600 },
    { key: 'value',  label: 'Value $300–599', fn: p => p.salary >= 300 && p.salary < 600 },
    { key: 'sleeper',label: 'Sleeper <$300',  fn: p => p.salary < 300 },
  ];
  const activeTierFn = TIER_FILTERS.find(t => t.key === tierFilter)?.fn;

  const wonIds = new Set(wonPlayers.map(p => p.player_id));

  // All players (available + won) for the board
  const allBoardPlayers = [
    ...availablePlayers,
    ...wonPlayers.map(w => ({ ...w, id: w.player_id, _won: true, _winnerTeam: w.winner_team, _winAmount: w.amount })),
  ].sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999));

  const boardPlayers = allBoardPlayers.filter(p => {
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTierFn && !activeTierFn(p)) return false;
    return true;
  });

  const isWaiting  = session?.status === 'waiting';
  const isActive   = session?.status === 'active';
  const isComplete = session?.status === 'completed' || league?.draft_status === 'completed';

  const coreRoster  = myRoster.filter(p => p.is_core);
  const flexRoster  = myRoster.filter(p => !p.is_core);
  const coreSpots   = league.core_spots || 4;
  const flexSpots   = league.flex_spots || 4;
  const myBudgetAmt = myBudget?.auction_credits_remaining ?? (league.auction_budget || 1000);

  const currentNominator = members.find(m => m.id === session?.current_nomination_member_id);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">

      {/* ── Back link ── */}
      <Link
        to={`/golf/league/${id}`}
        className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-400 text-sm transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> {league.name}
      </Link>

      {/* ── Top bar: league name + status ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Auction Draft</h1>
          <p className="text-gray-400 text-sm mt-0.5">{league.name}</p>
        </div>
        {/* Budget pill */}
        {myBudget && (
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-white font-bold text-lg">{myBudgetAmt}</span>
            <span className="text-gray-500 text-xs">credits left</span>
          </div>
        )}
      </div>

      {/* Error */}
      {actionError && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-4">
          {actionError}
        </div>
      )}

      {/* ── Waiting room ── */}
      {isWaiting && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Waiting for Commissioner</h2>
          <p className="text-gray-400 text-sm mb-2">
            {members.length} team{members.length !== 1 ? 's' : ''} registered · Budget: ${league.auction_budget || 1000} per team
          </p>
          <p className="text-gray-500 text-xs mb-6">
            Timer: {league.bid_timer_seconds || 30}s per nomination
          </p>
          {isCommissioner && (
            <button
              onClick={startAuction}
              disabled={starting || members.length < 2}
              className="px-8 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20"
            >
              {starting ? 'Starting...' : 'Start Auction →'}
            </button>
          )}
          {!isCommissioner && <p className="text-gray-600 text-sm">The commissioner will start the auction.</p>}
        </div>
      )}

      {/* ── Auction complete ── */}
      {isComplete && (
        <div className="bg-green-500/8 border border-green-500/25 rounded-2xl p-6 text-center mb-6">
          <Trophy className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-1">Auction Complete!</h2>
          <p className="text-gray-400 text-sm mb-4">All roster spots have been filled. The season is now active.</p>
          <Link
            to={`/golf/league/${id}`}
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-2.5 rounded-xl transition-all"
          >
            Go to League <ArrowLeft className="w-4 h-4 rotate-180" />
          </Link>
        </div>
      )}

      {/* ── Active auction layout ── */}
      {isActive && (
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 space-y-5 lg:space-y-0">

          {/* ── Left column ── */}
          <div className="space-y-5 min-w-0">

            {/* Current nomination card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              {currentPlayer ? (
                <>
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-400 font-bold text-sm">Nominated by {currentNominator?.team_name || '—'}</span>
                  </div>

                  <div className="flex items-start gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-white text-xl font-bold truncate">{currentPlayer.name}</div>
                      <div className="text-gray-400 text-sm mt-0.5">{currentPlayer.country} · Rank #{currentPlayer.world_ranking}</div>
                      <TierBadge salary={currentPlayer.salary} />
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-green-400 font-bold text-3xl">${session.current_high_bid}</div>
                      <div className="text-gray-500 text-xs">
                        {isAmIHighBidder
                          ? <span className="text-green-400 font-semibold">You're winning!</span>
                          : currentHighBidderTeam
                          ? <span>{currentHighBidderTeam} leads</span>
                          : 'Opening bid'
                        }
                      </div>
                    </div>
                  </div>

                  <TimerBar endsAt={session.nomination_ends_at} timerSecs={league.bid_timer_seconds || 30} />

                  {!isAmIHighBidder && (
                    <form onSubmit={placeBid} className="flex gap-2 mt-4">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                        <input
                          type="number"
                          min={session.current_high_bid + 1}
                          max={myBudgetAmt}
                          className="w-full bg-gray-800 text-white text-sm pl-7 pr-3 py-2.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500 font-bold"
                          placeholder={`>${session.current_high_bid}`}
                          value={bidAmount}
                          onChange={e => setBidAmount(e.target.value)}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={bidding || !bidAmount}
                        className="px-5 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold rounded-lg transition-all shrink-0"
                      >
                        {bidding ? '...' : 'Bid'}
                      </button>
                    </form>
                  )}
                  {isAmIHighBidder && (
                    <div className="mt-4 py-2.5 text-center bg-green-500/15 border border-green-500/30 rounded-lg text-green-400 font-bold text-sm flex items-center justify-center gap-2">
                      <Check className="w-4 h-4" /> You have the high bid — hold on!
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-4">
                  {isMyNominationTurn ? (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-3">
                        <Zap className="w-5 h-5 text-yellow-400" />
                      </div>
                      <h3 className="text-white font-bold mb-1">Your Turn to Nominate!</h3>
                      <p className="text-gray-400 text-sm">Pick a player from the board below to start bidding.</p>
                    </>
                  ) : (
                    <>
                      <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-400">
                        Waiting for <span className="text-white font-semibold">{currentNominator?.team_name || '—'}</span> to nominate.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Player board */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800 space-y-3">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-gray-400" />
                  <h3 className="text-white font-bold">Player Board</h3>
                  <span className="text-gray-600 text-xs ml-auto">{availablePlayers.length} available</span>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-gray-800 text-white text-sm pl-8 pr-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                  />
                </div>

                {/* Tier filter */}
                <div className="flex gap-1.5 flex-wrap">
                  {TIER_FILTERS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTierFilter(t.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        tierFilter === t.key
                          ? 'bg-green-500/20 border-green-500/50 text-green-400'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-800">
                {boardPlayers.map(p => {
                  const isWon = !!p._won;
                  const isCurrent = currentPlayer?.id === (p.id || p.player_id);
                  const canNominate = isMyNominationTurn && !currentPlayer && !isWon;
                  return (
                    <div
                      key={p.id || p.player_id}
                      className={`flex items-center justify-between px-5 py-3.5 gap-3 transition-colors ${
                        isCurrent ? 'bg-yellow-500/8 border-l-2 border-yellow-500' :
                        isWon ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${isCurrent ? 'text-yellow-300' : isWon ? 'text-gray-400' : 'text-white'}`}>
                          {p.name}
                        </div>
                        <div className="text-gray-500 text-xs flex items-center gap-2 flex-wrap">
                          {p.country} · Rank #{p.world_ranking}
                          {isWon && p._winnerTeam && (
                            <span className="text-gray-600">→ {p._winnerTeam} (${p._winAmount})</span>
                          )}
                        </div>
                      </div>
                      <TierBadge salary={p.salary} />
                      <div className="text-green-400 font-bold text-sm shrink-0">${p.salary}</div>
                      {canNominate && !isWon && (
                        <button
                          onClick={() => nominate(p.id)}
                          disabled={nominating}
                          className="text-xs px-2.5 py-1.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 rounded-lg hover:bg-yellow-500/25 transition-colors font-semibold shrink-0"
                        >
                          {nominating ? '...' : 'Nominate'}
                        </button>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/15 border border-yellow-500/25 px-2 py-0.5 rounded-full shrink-0">LIVE</span>
                      )}
                      {isWon && (
                        <Check className="w-4 h-4 text-gray-600 shrink-0" />
                      )}
                    </div>
                  );
                })}
                {boardPlayers.length === 0 && (
                  <div className="py-8 text-center text-gray-500 text-sm">No players match this filter.</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right column: My Roster ── */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            {/* Mobile: collapsible */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => setRosterOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-800 lg:cursor-default"
              >
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  <h3 className="text-white font-bold">My Roster ({myRoster.length}/{coreSpots + flexSpots})</h3>
                </div>
                <span className="lg:hidden text-gray-400">
                  {rosterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              <div className={`${rosterOpen ? 'block' : 'hidden'} lg:block`}>
                {/* Budget display */}
                <div className="px-5 py-3 border-b border-gray-800 bg-gray-800/30">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">Budget used</span>
                    <span className="text-gray-300 font-semibold">
                      {(league.auction_budget || 1000) - myBudgetAmt} / {league.auction_budget || 1000}
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.min(100, ((league.auction_budget || 1000) - myBudgetAmt) / (league.auction_budget || 1000) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Core spots */}
                <div className="px-5 pt-4 pb-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
                    <span className="text-yellow-400 text-xs font-bold uppercase tracking-wide">Core ({coreRoster.length}/{coreSpots})</span>
                  </div>
                  <div className="space-y-1.5">
                    {Array.from({ length: coreSpots }).map((_, i) => {
                      const p = coreRoster[i];
                      return p ? (
                        <div key={p.player_id} className="flex items-center gap-2 bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-3 py-2">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />
                          <span className="text-white text-xs font-medium truncate flex-1">{p.name}</span>
                        </div>
                      ) : (
                        <div key={i} className="border border-dashed border-yellow-500/20 rounded-lg px-3 py-2 text-center text-yellow-700/60 text-xs">
                          Core slot {i + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Flex spots */}
                <div className="px-5 pt-2 pb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Flag className="w-3 h-3 text-blue-400 shrink-0" />
                    <span className="text-blue-400 text-xs font-bold uppercase tracking-wide">Flex ({flexRoster.length}/{flexSpots})</span>
                  </div>
                  <div className="space-y-1.5">
                    {Array.from({ length: flexSpots }).map((_, i) => {
                      const p = flexRoster[i];
                      return p ? (
                        <div key={p.player_id} className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/20 rounded-lg px-3 py-2">
                          <Flag className="w-3 h-3 text-blue-400 shrink-0" />
                          <span className="text-white text-xs font-medium truncate flex-1">{p.name}</span>
                        </div>
                      ) : (
                        <div key={i} className="border border-dashed border-blue-500/20 rounded-lg px-3 py-2 text-center text-blue-700/60 text-xs">
                          Flex slot {i + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Budget table (desktop only) */}
            <div className="hidden lg:block mt-4 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <h3 className="text-white font-bold text-sm">All Budgets</h3>
              </div>
              <div className="divide-y divide-gray-800 max-h-64 overflow-y-auto">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="text-white text-xs font-medium truncate">{m.team_name}</div>
                    </div>
                    <div className="text-green-400 font-bold text-sm shrink-0">
                      ${m.auction_credits_remaining ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Won players log (always visible) ── */}
      {wonPlayers.length > 0 && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400" />
            <h3 className="text-white font-bold">Auction Results ({wonPlayers.length})</h3>
          </div>
          <div className="divide-y divide-gray-800 max-h-64 overflow-y-auto">
            {wonPlayers.map(w => (
              <div key={w.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{w.name}</div>
                  <div className="text-gray-500 text-xs">{w.winner_team}</div>
                </div>
                <TierBadge salary={w.salary} />
                <div className="text-green-400 font-bold text-sm shrink-0">${w.amount}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
