import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check, Trophy, Lock, ArrowLeft } from 'lucide-react';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';

// Convert "Last, First" (DataGolf format) → "First Last"
function flipName(name) {
  if (!name) return name;
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    return first ? `${first} ${last}` : last;
  }
  return name;
}

// ── Countdown to tournament start ─────────────────────────────────────────────

function Countdown({ targetDate }) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    function tick() {
      const diff = new Date(targetDate) - Date.now();
      if (diff <= 0) { setDisplay('In progress'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      if (d > 0) setDisplay(`${d}d ${h}h`);
      else if (h > 0) setDisplay(`${h}h ${m}m`);
      else setDisplay(`${m}m`);
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [targetDate]);

  return <span className="font-mono font-bold text-green-400">{display}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GolfPoolPicksSubmitted() {
  const { id } = useParams();

  const [league, setLeague]       = useState(null);
  const [tournament, setTournament] = useState(null);
  const [picks, setPicks]         = useState([]);
  const [loading, setLoading]     = useState(true);

  useDocTitle('Picks Confirmed | Golf Pool');

  useEffect(() => {
    async function load() {
      try {
        const [leagueRes, picksRes] = await Promise.all([
          api.get(`/golf/leagues/${id}`),
          api.get(`/golf/leagues/${id}/picks/my`),
        ]);
        setLeague(leagueRes.data.league);
        setPicks(picksRes.data.picks || []);
        setTournament(picksRes.data.tournament || null);
      } catch (_) {}
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return (
    <div className="max-w-xl mx-auto px-4 py-16 flex justify-center">
      <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!league) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center text-gray-500">League not found.</div>
  );

  const isSalaryCap = league.pick_sheet_format === 'salary_cap';
  const started = tournament?.start_date ? new Date(tournament.start_date + 'T12:00:00Z') <= Date.now() : false;

  // Group picks by tier for tiered display
  const picksByTier = picks.reduce((acc, p) => {
    const k = p.tier_number || 0;
    if (!acc[k]) acc[k] = [];
    acc[k].push(p);
    return acc;
  }, {});
  const tierKeys = Object.keys(picksByTier).map(Number).sort((a, b) => a - b);

  const totalSalary = picks.reduce((s, p) => s + (p.salary_used || 0), 0);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">

      {/* Back */}
      <Link to={`/golf/league/${id}`} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to league
      </Link>

      {/* Hero */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 mb-4">
          <Check className="w-8 h-8 text-green-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">You're locked in!</h1>
        <p className="text-gray-400 text-sm">
          {tournament ? `${tournament.name} · ` : ''}Your picks are submitted and can't be changed.
        </p>
      </div>

      {/* Tournament info */}
      {tournament && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5">
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">{tournament.name}</p>
              <p className="text-gray-500 text-xs mt-0.5">
                {tournament.start_date?.slice(0, 10)}
                {tournament.end_date ? ` – ${tournament.end_date.slice(0, 10)}` : ''}
                {tournament.course ? ` · ${tournament.course}` : ''}
              </p>
            </div>
            {!started && tournament.start_date && (
              <div className="text-right shrink-0">
                <p className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Starts in</p>
                <Countdown targetDate={tournament.start_date} />
              </div>
            )}
            {started && (
              <span className="bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0">
                Live
              </span>
            )}
          </div>
        </div>
      )}

      {/* Picks summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-500" />
            <span className="text-white font-bold text-sm">Your Picks</span>
          </div>
          {isSalaryCap && (
            <span className="text-gray-400 text-xs">
              ${totalSalary.toLocaleString()} used
            </span>
          )}
        </div>

        {isSalaryCap ? (
          /* Salary cap: flat list */
          <div className="divide-y divide-gray-800/50">
            {picks.length === 0 ? (
              <p className="text-gray-500 text-sm px-5 py-4 text-center">No picks on file.</p>
            ) : picks.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <span className="text-gray-200 text-sm font-medium">{flipName(p.player_name)}</span>
                {p.salary_used ? (
                  <span className="text-gray-500 text-xs">${p.salary_used.toLocaleString()}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          /* Tiered: grouped by tier */
          tierKeys.length === 0 ? (
            <p className="text-gray-500 text-sm px-5 py-4 text-center">No picks on file.</p>
          ) : tierKeys.map(tierNum => (
            <div key={tierNum}>
              <div className="px-5 py-2 bg-gray-800/30 border-b border-gray-800">
                <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wide">
                  Tier {tierNum}
                </span>
              </div>
              {picksByTier[tierNum].map((p, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 border-b border-gray-800/40 last:border-b-0">
                  <div className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-green-400" />
                    </div>
                    <span className="text-gray-200 text-sm font-medium">{flipName(p.player_name)}</span>
                  </div>
                  {p.odds_display ? (
                    <span className="text-gray-500 text-xs">{p.odds_display}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* View leaderboard */}
      <Link
        to={`/golf/league/${id}?tab=standings`}
        className={`block w-full text-center py-3.5 rounded-xl font-bold text-sm transition-all ${
          started
            ? 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/20'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed pointer-events-none border border-gray-700'
        }`}
      >
        {started ? 'View Leaderboard →' : 'Leaderboard available when tournament starts'}
      </Link>

    </div>
  );
}
