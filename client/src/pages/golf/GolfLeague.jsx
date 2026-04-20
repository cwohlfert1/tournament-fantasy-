import { useState, useEffect, Component } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Flag, Trophy, ArrowLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import GolfLoader from '../../components/golf/GolfLoader';
import socket, { connectSocket } from '../../socket';
import { Badge } from '../../components/ui';

// Catches render errors in tab content so the page shows an error message instead of blank
class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[TabError]', error, info); }
  componentDidUpdate(prevProps) { if (prevProps.tab !== this.props.tab) this.setState({ error: null }); }
  render() {
    if (this.state.error) return (
      <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 text-center">
        <p className="text-red-400 font-semibold mb-1">Something went wrong loading this tab</p>
        <p className="text-gray-500 text-sm">{this.state.error?.message || 'Unknown error'}</p>
      </div>
    );
    return this.props.children;
  }
}

// Tab components
import OverviewTab from './tabs/OverviewTab';
import RosterTab from './tabs/RosterTab';
import LineupTab from './tabs/LineupTab';
import FreeAgencyTab from './tabs/FreeAgencyTab';
import StandingsTab from './tabs/StandingsTab';
import ScheduleTab from './tabs/ScheduleTab';
import CommissionerTab from './tabs/CommissionerTab';
import PGALiveTab from './tabs/PGALiveTab';
import OwnershipTab from './tabs/OwnershipTab';
import SalaryCapPicksTab from './tabs/SalaryCapPicksTab';

function getTabs(league, isComm, hideOverview = false) {
  const isPool = league?.format_type === 'pool' || league?.format_type === 'salary_cap' || league?.format_type === 'draft';
  const isSalaryCap = league?.format_type === 'salary_cap';
  const isDraft = league?.format_type === 'draft';
  const draftDone = isDraft && league?.draft_status === 'completed';
  const base = [];
  if (!hideOverview) base.push({ key: 'overview', label: 'Overview' });
  // Draft shows roster tab only after draft completes (pool_picks bridged).
  // Before that, the draft room CTA is the primary action — no picks tab.
  if (isDraft) {
    if (draftDone) base.push({ key: 'roster', label: 'My Picks' });
  } else if (isSalaryCap) {
    base.push({ key: 'picks', label: 'My Picks' });
  } else {
    base.push({ key: 'roster', label: isPool ? 'My Picks' : 'Roster' });
  }
  if (!isPool && !isSalaryCap) {
    base.push({ key: 'lineup', label: 'My Lineup' });
  }
  if (!isPool && !isSalaryCap) {
    base.push({ key: 'freeagency', label: 'Free Agency' });
  }
  if (isPool) {
    base.push({ key: 'owned', label: '% Owned' });
  }
  base.push({ key: 'standings', label: 'Standings' });
  if ((isPool || isSalaryCap) && league?.pool_tournament_id) {
    base.push({ key: 'pga-live', label: 'PGA Scoreboard' });
  }
  if (isComm) {
    base.push({ key: 'commissioner', label: '⚙ Commissioner' });
  }
  return base;
}

export default function GolfLeague() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const _rawTab = searchParams.get('tab') || 'overview';
  const tab = _rawTab === 'pga-scoreboard' ? 'pga-live' : _rawTab;

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [picksStatus, setPicksStatus] = useState(null);

  useDocTitle(
    league ? `${league.name} | Golf` : 'Golf League | TourneyRun',
    league ? {
      description: `${league.name} — a golf ${league.format_type === 'pool' ? 'pool' : 'fantasy league'} on TourneyRun. Track standings, manage your picks, and compete for the prize pool.`,
      image: 'https://www.tourneyrun.app/golf-og-image.png',
    } : {},
  );

  useEffect(() => {
    api.get(`/golf/leagues/${id}`)
      .then(r => {
        setLeague(r.data.league);
        setMembers(r.data.members || []);
      })
      .catch(err => {
        const status = err.response?.status;
        if (status === 404) {
          setLoadError('League not found.');
        } else if (status === 403) {
          setLoadError("You don't have access to this league.");
        } else {
          setLoadError('Failed to load league. Check your connection and try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!league || !['pool', 'salary_cap', 'draft'].includes(league.format_type) || !league.pool_tournament_id) return;
    api.get(`/golf/leagues/${id}/my-roster`)
      .then(r => setPicksStatus({ submitted: r.data.submitted, picks_locked: r.data.picks_locked }))
      .catch(() => {});
  }, [id, league?.format_type, league?.pool_tournament_id]); // eslint-disable-line

  // Live standings push for pool / salary_cap leagues
  useEffect(() => {
    if (!league || !['pool', 'salary_cap', 'draft'].includes(league.format_type) || !user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    connectSocket(token);
    socket.emit('join_golf_pool', { leagueId: id, token });
    function onStandingsUpdate({ leagueId, standings }) {
      if (leagueId !== id) return;
      setMembers(prev => prev.map(m => {
        const updated = standings.find(s => s.member_id === m.id);
        return updated ? { ...m, season_points: updated.total_points } : m;
      }));
    }
    socket.on('pool_standings_update', onStandingsUpdate);
    return () => { socket.off('pool_standings_update', onStandingsUpdate); };
  }, [league?.format_type, id, user]); // eslint-disable-line

  if (loading) return <GolfLoader />;

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <Flag className="w-8 h-8 text-gray-600" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{loadError}</h2>
        <Link to="/golf/dashboard" className="inline-flex items-center gap-1.5 text-green-400 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
      </div>
    );
  }

  if (!league) return null;

  // Payment just completed but webhook may not have fired yet
  if (league.status === 'pending_payment') {
    const justPaid = searchParams.get('paid') === 'true';
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-900/40 border border-green-700/40 flex items-center justify-center mx-auto mb-5">
          <Trophy className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {justPaid ? 'Confirming your payment…' : 'Payment required'}
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          {justPaid
            ? 'Your league will be live in a few seconds once we confirm your payment. Refresh the page to continue.'
            : 'This league is pending payment. Complete checkout to activate it.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors"
          >
            Refresh
          </button>
          <Link to="/golf/dashboard" className="px-6 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold text-sm transition-colors">
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isComm = league.commissioner_id === user?.id;
  const isPool = league.format_type === 'pool' || league.format_type === 'salary_cap' || league.format_type === 'draft';

  // Hide Overview tab once picks are submitted and tournament has started.
  // picksStatus loads async — stays false until resolved (no flash risk).
  const shouldHideOverview =
    ['pool', 'salary_cap', 'draft'].includes(league.format_type) &&
    !!picksStatus?.submitted &&
    (league.pool_tournament_status === 'active' ||
     league.pool_tournament_status === 'completed' ||
     !!picksStatus?.picks_locked);

  // If the URL tab is 'overview' but it's hidden, fall through to picks.
  // salary_cap uses 'picks' tab; pool uses 'roster' — both show the user's lineup.
  const defaultPicksTab = league.format_type === 'salary_cap' ? 'picks' : league.format_type === 'draft' ? 'standings' : 'roster';
  const effectiveTab = tab === 'overview' && shouldHideOverview ? defaultPicksTab : tab;

  function setTab(t) {
    setSearchParams({ tab: t });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 overflow-x-hidden">

      {/* ── Header ── */}
      <div className="mb-6">
        <Link to="/golf/dashboard" className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-400 text-sm transition-colors">
          <ArrowLeft className="w-4 h-4" /> Golf Leagues
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white break-words">{league.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {isComm && <Badge color="blue">Commissioner</Badge>}
              {(() => {
                // Draft-specific badges
                if (league.format_type === 'draft') {
                  if (league.draft_status === 'drafting') return <Badge color="purple"><span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse mr-1" />Draft Live</Badge>;
                  if (league.draft_status === 'pending') return <Badge color="purple">Draft Pending</Badge>;
                }
                // Pool/salary_cap badges
                if (isPool) {
                  const ts = league.pool_tournament_status;
                  if (ts === 'active')    return <Badge color="green"><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1" />Live</Badge>;
                  if (ts === 'completed') return <Badge color="gray">Complete</Badge>;
                  if (league.picks_locked) return <Badge color="yellow">Picks Locked</Badge>;
                  return <Badge color="green">Picks Open</Badge>;
                }
                return league.draft_status === 'completed' ? <Badge color="green">Season Active</Badge> : null;
              })()
              }
            </div>
          </div>
          {(league.format_type === 'pool' || league.format_type === 'salary_cap') && league.format_type !== 'draft'
            ? (() => {
                const ts = league.pool_tournament_status;
                const ctaClass = "inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-500/20 text-sm shrink-0";
                // Check tournament status FIRST so Live/Complete always shows the right CTA
                if (ts === 'completed')
                  return <Link to={`/golf/league/${id}?tab=standings`} className={ctaClass}>Final Results <ChevronRight className="w-4 h-4" /></Link>;
                if (ts === 'active')
                  return <Link to={`/golf/league/${id}?tab=standings`} className={ctaClass}>Pool Standings <ChevronRight className="w-4 h-4" /></Link>;
                if (league.picks_locked || picksStatus?.picks_locked)
                  return <Link to={`/golf/league/${id}?tab=${defaultPicksTab}`} className={ctaClass}>View My Picks <ChevronRight className="w-4 h-4" /></Link>;
                if (picksStatus?.submitted)
                  return <Link to={`/golf/league/${id}?tab=${defaultPicksTab}`} className={ctaClass}>✓ View/Edit Picks <ChevronRight className="w-4 h-4" /></Link>;
                return <Link to={`/golf/league/${id}/picks`} className={ctaClass}>Make My Picks <ChevronRight className="w-4 h-4" /></Link>;
              })()
            : league.format_type === 'draft' && league.draft_status !== 'completed'
              ? (
                <Link
                  to={`/golf/league/${id}/draft-room`}
                  className="inline-flex items-center gap-2 text-white font-bold px-5 py-2.5 rounded-full transition-all shadow-lg text-sm shrink-0"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 6px 20px rgba(124,58,237,0.25)' }}
                >
                  {league.draft_status === 'drafting' ? '🐍 Join Draft' : isComm ? '🐍 Start Draft' : '🐍 Draft Lobby'} <ChevronRight className="w-4 h-4" />
                </Link>
              )
              : (league.draft_status !== 'completed' && league.format_type === 'tourneyrun' && (
                <Link
                  to={`/golf/league/${id}/draft`}
                  className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-500/20 text-sm shrink-0"
                >
                  {isComm ? 'Go to Draft' : 'Join Draft'} <ChevronRight className="w-4 h-4" />
                </Link>
              ))
          }
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="relative mb-6">
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {getTabs(league, isComm, shouldHideOverview).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                effectiveTab === t.key
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-900 to-transparent rounded-r-xl pointer-events-none" />
      </div>

      {/* ── Tab content ── */}
      <TabErrorBoundary tab={effectiveTab}>
      {effectiveTab === 'overview' && (
        <OverviewTab league={league} members={members} user={user} isComm={isComm} navigate={navigate} picksStatus={picksStatus} />
      )}
      {effectiveTab === 'schedule' && (
        <ScheduleTab leagueId={id} isComm={isComm} />
      )}
      {effectiveTab === 'roster' && (
        <RosterTab leagueId={id} league={league} />
      )}
      {effectiveTab === 'picks' && league.format_type === 'salary_cap' && (
        <SalaryCapPicksTab leagueId={id} league={league} />
      )}
      {effectiveTab === 'freeagency' && league.format_type === 'tourneyrun' && (
        <FreeAgencyTab leagueId={id} league={league} />
      )}
      {effectiveTab === 'lineup' && (
        <LineupTab leagueId={id} league={league} />
      )}
      {effectiveTab === 'owned' && (
        <OwnershipTab leagueId={id} />
      )}
      {effectiveTab === 'standings' && (
        <StandingsTab leagueId={id} league={league} currentUserId={user?.id} />
      )}
      {effectiveTab === 'pga-live' && (
        <PGALiveTab leagueId={id} league={league} />
      )}
      {effectiveTab === 'commissioner' && isComm && (
        <CommissionerTab leagueId={id} leagueName={league.name} members={members} league={league} />
      )}
      </TabErrorBoundary>
    </div>
  );
}
