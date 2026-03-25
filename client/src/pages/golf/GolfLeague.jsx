import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Flag, Trophy, ArrowLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import BallLoader from '../../components/BallLoader';
import socket, { connectSocket } from '../../socket';
import { Badge } from '../../components/ui';

// Tab components
import OverviewTab from './tabs/OverviewTab';
import RosterTab from './tabs/RosterTab';
import LineupTab from './tabs/LineupTab';
import FreeAgencyTab from './tabs/FreeAgencyTab';
import StandingsTab from './tabs/StandingsTab';
import ScheduleTab from './tabs/ScheduleTab';
import CommissionerTab from './tabs/CommissionerTab';
import PGALiveTab from './tabs/PGALiveTab';

function getTabs(league, isComm) {
  const isPool = league?.format_type === 'pool';
  const base = [
    { key: 'overview',  label: 'Overview' },
    { key: 'roster',    label: isPool ? 'My Picks' : 'Roster' },
  ];
  if (!isPool) {
    base.push({ key: 'lineup', label: 'My Lineup' });
  }
  if (!isPool) {
    base.push({ key: 'freeagency', label: 'Free Agency' });
  }
  base.push({ key: 'standings', label: 'Standings' });
  if (isPool && league?.pool_tournament_id) {
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
    if (!league || league.format_type !== 'pool' || !league.pool_tournament_id) return;
    api.get(`/golf/leagues/${id}/my-roster`)
      .then(r => setPicksStatus({ submitted: r.data.submitted, picks_locked: r.data.picks_locked }))
      .catch(() => {});
  }, [id, league?.format_type, league?.pool_tournament_id]); // eslint-disable-line

  // Live standings push for pool leagues
  useEffect(() => {
    if (!league || league.format_type !== 'pool' || !user) return;
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

  if (loading) return <BallLoader />;

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <Flag className="w-8 h-8 text-gray-600" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">{loadError}</h2>
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
        <h2 className="text-2xl font-black text-white mb-2">
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
            <h1 className="text-3xl font-black text-white break-words">{league.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge color="green">Golf</Badge>
              {isComm && <Badge color="blue">Commissioner</Badge>}
              {league.format_type === 'pool'
                ? (() => {
                    const ts = league.pool_tournament_status;
                    if (ts === 'active')    return <Badge color="green"><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse mr-1" />Live</Badge>;
                    if (ts === 'completed') return <Badge color="gray">Complete</Badge>;
                    if (league.picks_locked) return <Badge color="yellow">Picks Locked</Badge>;
                    return <Badge color="green">Picks Open</Badge>;
                  })()
                : (league.draft_status === 'completed'
                    ? <Badge color="green">Season Active</Badge>
                    : <Badge color="yellow">Draft Pending</Badge>)
              }
            </div>
          </div>
          {league.format_type === 'pool'
            ? (() => {
                const ts = league.pool_tournament_status;
                const ctaClass = "inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-500/20 text-sm shrink-0";
                if (!league.picks_locked)
                  return <Link to={`/golf/league/${id}/picks`} className={ctaClass}>Make My Picks <ChevronRight className="w-4 h-4" /></Link>;
                if (ts === 'completed')
                  return <Link to={`/golf/league/${id}?tab=standings`} className={ctaClass}>Final Results <ChevronRight className="w-4 h-4" /></Link>;
                if (ts === 'active')
                  return <Link to={`/golf/league/${id}?tab=standings`} className={ctaClass}>Pool Standings <ChevronRight className="w-4 h-4" /></Link>;
                return <Link to={`/golf/league/${id}?tab=standings`} className={ctaClass}>View Standings <ChevronRight className="w-4 h-4" /></Link>;
              })()
            : (league.draft_status !== 'completed' && (
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
          {getTabs(league, isComm).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                tab === t.key
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
      {tab === 'overview' && (
        <OverviewTab league={league} members={members} user={user} isComm={isComm} navigate={navigate} picksStatus={picksStatus} />
      )}
      {tab === 'schedule' && (
        <ScheduleTab leagueId={id} isComm={isComm} />
      )}
      {tab === 'roster' && (
        <RosterTab leagueId={id} league={league} />
      )}
      {tab === 'freeagency' && league.format_type === 'tourneyrun' && (
        <FreeAgencyTab leagueId={id} league={league} />
      )}
      {tab === 'lineup' && (
        <LineupTab leagueId={id} league={league} />
      )}
      {tab === 'standings' && (
        <StandingsTab leagueId={id} league={league} currentUserId={user?.id} />
      )}
      {tab === 'pga-live' && (
        <PGALiveTab leagueId={id} league={league} />
      )}
      {tab === 'commissioner' && isComm && (
        <CommissionerTab leagueId={id} leagueName={league.name} members={members} league={league} />
      )}
    </div>
  );
}
