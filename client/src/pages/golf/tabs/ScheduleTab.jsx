import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import api from '../../../api';

export default function ScheduleTab({ leagueId, isComm }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/golf/tournaments')
      .then(r => setTournaments(r.data.tournaments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-10 text-center text-gray-500">Loading schedule...</div>;

  const today = new Date();
  const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Only gray out / mark done if the end date has actually passed
  function getDisplayStatus(t) {
    if (t.end_date && new Date(t.end_date + 'T23:59:59') < today) return 'completed';
    if (t.status === 'active') return 'active';
    return 'upcoming';
  }

  function StatusPill({ status }) {
    if (status === 'active') return (
      <span className="inline-flex items-center gap-1 bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" /> Live
      </span>
    );
    if (status === 'completed') return (
      <span className="inline-block bg-gray-700/60 border border-gray-700 text-gray-500 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">Done</span>
    );
    return (
      <span className="inline-block bg-gray-800 border border-gray-700 text-gray-300 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">Upcoming</span>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <h3 className="text-white font-bold">2026 Schedule</h3>
        <span className="ml-auto text-gray-600 text-xs">{tournaments.length} events</span>
      </div>
      <div className="divide-y divide-gray-800">
        {tournaments.map(t => {
          const isMajor = !!t.is_major;
          const isSig   = t.is_signature === 1 && !isMajor;
          const displayStatus = getDisplayStatus(t);
          const isDone  = displayStatus === 'completed';
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 px-4 py-4 ${
                isMajor ? 'border-l-2 border-yellow-500 bg-yellow-500/3' : ''
              } ${isDone ? 'opacity-55' : ''}`}
            >
              {/* Date column */}
              <div className="w-14 shrink-0 text-center">
                <div className="text-white text-xs font-bold">{fmt(t.start_date)}</div>
                <div className="text-gray-600 text-[10px]">{fmt(t.end_date)}</div>
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                  <span className={`font-bold text-sm truncate ${isMajor ? 'text-yellow-300' : 'text-white'}`}>
                    {t.name}
                  </span>
                  {isMajor && (
                    <span className="inline-block bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0">MAJOR</span>
                  )}
                  {isSig && (
                    <span className="inline-block bg-green-500/15 border border-green-500/30 text-green-400 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0">SIG</span>
                  )}
                </div>
                <div className="text-gray-500 text-xs truncate">{t.course}</div>
                {t.prize_money > 0 && (
                  <div className="text-gray-600 text-[10px] mt-0.5">${(t.prize_money / 1000000).toFixed(0)}M purse</div>
                )}
              </div>

              {/* Right side: status + commissioner link */}
              <div className="shrink-0 pt-0.5 flex flex-col items-end gap-1.5">
                <StatusPill status={displayStatus} />
                {isComm && (isDone || t.status === 'active') && (
                  <Link
                    to={`/golf/league/${leagueId}/scores?tournament=${t.id}`}
                    className="text-[10px] font-bold text-green-400 hover:text-green-300 transition-colors whitespace-nowrap"
                  >
                    Enter Scores →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
        {tournaments.length === 0 && (
          <div className="py-8 text-center text-gray-500 text-sm">No tournaments found.</div>
        )}
      </div>
    </div>
  );
}
