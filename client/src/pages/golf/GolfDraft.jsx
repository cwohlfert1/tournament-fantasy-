import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Flag, Zap, Star, Award, ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import GolfLoader from '../../components/golf/GolfLoader';

const TIER_LABEL = {
  800: { label: 'Elite', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  600: { label: 'Star',  color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20'   },
  400: { label: 'Value', color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  300: { label: 'Deep',  color: 'text-gray-400',   bg: 'bg-gray-700/50 border-gray-700'     },
  200: { label: 'Flier', color: 'text-gray-500',   bg: 'bg-gray-800/50 border-gray-800'     },
};

function TierBadge({ salary }) {
  const t = TIER_LABEL[salary] || TIER_LABEL[200];
  return (
    <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${t.bg} ${t.color}`}>
      {t.label}
    </span>
  );
}

export default function GolfDraft() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  useDocTitle('Golf Draft | TourneyRun');

  const [state, setState] = useState(null);    // { league, members, picks, available, myRoster, currentPick, draftComplete, corePlayerIds }
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterSalary, setFilterSalary] = useState('all');
  const pollRef = useRef(null);

  async function loadState() {
    try {
      const r = await api.get(`/golf/leagues/${id}/draft`);
      setState(r.data);
      // DK mode has no draft — redirect to lineup tab
      if (r.data?.league?.format_type === 'dk') {
        navigate(`/golf/league/${id}?tab=lineup`, { replace: true });
      }
      // Auction draft type — redirect to auction page
      if (r.data?.league?.draft_type === 'auction') {
        navigate(`/golf/league/${id}/auction`, { replace: true });
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadState();
    pollRef.current = setInterval(loadState, 4000);
    return () => clearInterval(pollRef.current);
  }, [id]);

  async function startDraft() {
    setStarting(true);
    setError('');
    try {
      await api.post(`/golf/leagues/${id}/draft/start`);
      await loadState();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start draft');
    }
    setStarting(false);
  }

  async function makePick(playerId) {
    setPicking(playerId);
    setError('');
    try {
      await api.post(`/golf/leagues/${id}/draft/pick`, { player_id: playerId });
      await loadState();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to make pick');
    }
    setPicking(null);
  }

  if (loading) return <GolfLoader />;
  if (!state) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <Flag className="w-8 h-8 text-gray-600" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">League not found</h2>
        <Link to="/golf/dashboard" className="inline-flex items-center gap-1.5 text-green-400 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </div>
    );
  }

  const { league, members, picks, available, myRoster, currentPick, draftComplete, corePlayerIds } = state;
  const isComm = league.commissioner_id === user?.id;
  const draftStarted = league.draft_status === 'drafting' || draftComplete;
  const isPool = league.format_type === 'pool';
  const isTourneyRun = league.format_type === 'tourneyrun';
  const coreSet = new Set(corePlayerIds || []);

  // Whose turn is it?
  const numTeams = members.length;
  let currentPickerUserId = null;
  if (draftStarted && !draftComplete && numTeams > 0) {
    const idx = (currentPick - 1) % numTeams;
    const round = Math.ceil(currentPick / numTeams);
    const orderedMembers = round % 2 === 0 ? [...members].reverse() : members;
    currentPickerUserId = orderedMembers[idx % numTeams]?.user_id || null;
  }
  const isMyTurn = currentPickerUserId === user?.id;

  const pickedIds = new Set(picks.map(p => p.player_id));
  const myRosterIds = new Set((myRoster || []).map(r => r.player_id));
  const usedSalary = (myRoster || []).reduce((s, r) => s + (r.salary || 0), 0);
  const cap = league.salary_cap || 2400;

  const filtered = (available || []).filter(p => {
    const inRoster = myRosterIds.has(p.id);
    const inPicked = pickedIds.has(p.id);
    if (inRoster || inPicked) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (!isPool && filterSalary !== 'all' && String(p.salary) !== filterSalary) return false;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-5">
        <Link to={`/golf/league/${id}`} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-400 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to League
        </Link>
        <h1 className="text-3xl font-black text-white mt-2">{league.name} — Draft</h1>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-4">{error}</div>
      )}

      {/* ── Pre-draft: commissioner starts ── */}
      {!draftStarted && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <Flag className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Waiting for Draft to Start</h2>
          <p className="text-gray-400 mb-6">
            {members.length} of {league.max_teams} members joined.
          </p>
          {isComm ? (
            <button
              onClick={startDraft}
              disabled={starting || members.length < 2}
              className="px-8 py-3.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-black rounded-full transition-all shadow-lg shadow-green-500/25"
            >
              {starting ? 'Starting...' : 'Start Draft Now →'}
            </button>
          ) : (
            <p className="text-gray-500 text-sm">Waiting for the commissioner to start the draft.</p>
          )}
        </div>
      )}

      {/* ── Draft complete ── */}
      {draftComplete && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-green-500/15 flex items-center justify-center mx-auto mb-3">
            <Award className="w-7 h-7 text-green-400" />
          </div>
          <h2 className="text-xl font-black text-green-400 mb-1">Draft Complete!</h2>
          <p className="text-gray-400 text-sm mb-4">All picks have been made. Season is underway.</p>
          <Link
            to={`/golf/league/${id}`}
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-2.5 rounded-full transition-all"
          >
            Go to League →
          </Link>
        </div>
      )}

      {/* ── Active draft ── */}
      {draftStarted && !draftComplete && (
        <>
          {/* Status bar */}
          <div className={`rounded-2xl border p-4 mb-6 flex flex-wrap items-center justify-between gap-3 ${
            isMyTurn
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-gray-900 border-gray-800'
          }`}>
            <div>
              {isMyTurn ? (
                <div className="flex items-center gap-2 text-green-400 font-black text-lg">
                  <Zap className="w-5 h-5" /> Your Pick!
                </div>
              ) : (
                <div className="text-gray-300 font-bold">
                  Waiting on {members.find(m => m.user_id === currentPickerUserId)?.team_name || '...'}
                </div>
              )}
              <div className="text-gray-500 text-sm">Pick #{currentPick} of {(members.length) * (league.roster_size || 8)}</div>
            </div>
            {!isPool && (
              <div className="text-right">
                <div className="text-gray-500 text-xs">Your salary</div>
                <div className={`font-black ${usedSalary > cap * 0.9 ? 'text-red-400' : 'text-white'}`}>
                  ${usedSalary.toLocaleString()} / ${cap.toLocaleString()}
                </div>
              </div>
            )}
          </div>

          <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-6 space-y-5 lg:space-y-0">

            {/* ── Left: available players ── */}
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 min-w-0 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search players..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 text-white text-sm pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-green-500"
                  />
                </div>
                {!isPool && (
                  <select
                    value={filterSalary}
                    onChange={e => setFilterSalary(e.target.value)}
                    className="bg-gray-900 border border-gray-700 text-sm text-gray-300 px-3 py-2 rounded-lg focus:outline-none"
                  >
                    <option value="all">All Tiers</option>
                    <option value="800">Elite ($800)</option>
                    <option value="600">Star ($600)</option>
                    <option value="400">Value ($400)</option>
                    <option value="300">Deep ($300)</option>
                    <option value="200">Flier ($200)</option>
                  </select>
                )}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 text-gray-500 text-xs font-bold uppercase tracking-wide">
                  Available Players ({filtered.length})
                </div>
                <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-800">
                  {filtered.map(p => {
                    const canAfford = isPool || (usedSalary + p.salary <= cap);
                    const alreadyHave = myRosterIds.has(p.id);
                    const canPick = isMyTurn && canAfford && !alreadyHave;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between px-4 py-3 gap-3 ${
                          !canAfford ? 'opacity-40' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white text-sm font-medium">{p.name}</span>
                            {!isPool && <TierBadge salary={p.salary} />}
                          </div>
                          <div className="text-gray-500 text-xs mt-0.5">{p.country} · Rank #{p.world_ranking}</div>
                        </div>
                        {!isPool && <div className="text-green-400 font-bold text-sm shrink-0">${p.salary}</div>}
                        <button
                          onClick={() => makePick(p.id)}
                          disabled={!canPick || picking !== null}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            canPick
                              ? 'bg-green-500 border-green-500 text-white hover:bg-green-400'
                              : 'bg-gray-800 border-gray-700 text-gray-500'
                          }`}
                        >
                          {picking === p.id ? '...' : 'Pick'}
                        </button>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="py-8 text-center text-gray-500 text-sm">No players found.</div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right: my roster + pick log ── */}
            <div className="space-y-4">
              {/* My roster */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-gray-400" />
                  <span className="text-white font-bold text-sm">My Picks ({(myRoster || []).length})</span>
                </div>
                <div className="divide-y divide-gray-800 max-h-52 overflow-y-auto">
                  {(myRoster || []).length === 0 ? (
                    <div className="py-4 text-center text-gray-600 text-xs">No picks yet</div>
                  ) : (
                    (myRoster || []).map(p => {
                      const isCore = isTourneyRun && coreSet.has(p.player_id);
                      return (
                        <div key={p.player_id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isTourneyRun && (
                              <span className={`text-[9px] font-black uppercase shrink-0 px-1.5 py-0.5 rounded border ${
                                isCore
                                  ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
                                  : 'text-blue-400 bg-blue-500/10 border-blue-500/30'
                              }`}>
                                {isCore ? <><Star className="w-2.5 h-2.5 fill-current" /> CORE</> : 'FLEX'}
                              </span>
                            )}
                            <span className="text-white text-xs font-medium truncate">{p.name}</span>
                          </div>
                          {!isPool && <span className="text-green-400 text-xs font-bold shrink-0">${p.salary}</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Pick log */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800">
                  <span className="text-white font-bold text-sm">Recent Picks</span>
                </div>
                <div className="divide-y divide-gray-800 max-h-60 overflow-y-auto">
                  {picks.length === 0 ? (
                    <div className="py-4 text-center text-gray-600 text-xs">No picks yet</div>
                  ) : (
                    [...picks].reverse().slice(0, 20).map(p => {
                      const isMyPick = isTourneyRun && coreSet.has(p.player_id);
                      return (
                        <div key={p.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {isMyPick && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded shrink-0">
                                  <Star className="w-2.5 h-2.5 fill-current" /> CORE
                                </span>
                              )}
                              <span className="text-white text-xs truncate">{p.player_name}</span>
                            </div>
                            <div className="text-gray-500 text-[10px]">{p.team_name} — Pick #{p.pick_number}</div>
                          </div>
                          {!isPool && <span className="text-gray-600 text-xs shrink-0">${p.salary}</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
