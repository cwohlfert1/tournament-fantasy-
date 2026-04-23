import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Clock, Trophy } from 'lucide-react';
import api from '../../api';
import horsesLogo from '../../assets/TourneyRun_Horses_Logo_Dark.svg';

const FORMAT_META = {
  random_draw: { label: 'Random Draw', color: 'horses' },
  pick_wps:    { label: 'Pick W/P/S', color: 'blue'   },
  squares:     { label: 'Squares',     color: 'amber'  },
};

const STATUS_DOT = {
  open:            'bg-green-400',
  locked:          'bg-yellow-400',
  results_entered: 'bg-blue-400',
  finalized:       'bg-gray-400',
};

export default function HorsesDashboard() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/horses/pools')
      .then(r => setPools(r.data.pools || []))
      .catch(() => setPools([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Logo */}
      <div className="mb-6">
        <img src={horsesLogo} alt="TourneyRun Horse Racing Pools" className="h-14 sm:h-16" />
      </div>

      {/* Beta banner */}
      <div className="mb-6 rounded-2xl border border-horses-500/30 bg-horses-500/10 p-4 text-center">
        <p className="text-sm text-horses-300 font-medium">
          Free beta &mdash; Kentucky Derby 2026. No platform fee.
        </p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-white">My Racing Pools</h1>
        <div className="flex gap-3">
          <Link to="/horses/join"
            className="text-sm font-bold text-white border-[1.5px] border-white/20 hover:border-white/50 hover:bg-white/5 rounded-lg px-4 py-2.5 transition-all">
            Join Pool
          </Link>
          <Link to="/horses/create"
            className="text-sm font-bold text-[#0a1414] rounded-lg px-4 py-2.5 transition-all"
            style={{ background: '#2AA6A6' }}>
            Create Pool
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading...</div>
      ) : pools.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center space-y-4">
          <Trophy size={32} className="mx-auto text-gray-600" />
          <p className="text-gray-400">You haven't joined any racing pools yet.</p>
          <div className="flex justify-center gap-4">
            <Link to="/horses/join" className="text-sm font-bold text-horses-400 hover:text-horses-300">Join a pool</Link>
            <span className="text-gray-700">|</span>
            <Link to="/horses/create" className="text-sm font-bold text-horses-400 hover:text-horses-300">Create one</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {pools.map(pool => {
            const fmt = FORMAT_META[pool.format_type] || { label: pool.format_type, color: 'gray' };
            return (
              <Link key={pool.id} to={`/horses/pool/${pool.id}`}
                className="block rounded-2xl border border-gray-800 bg-gray-900 p-5 hover:border-horses-500/40 hover:shadow-xl hover:shadow-horses-500/10 hover:-translate-y-0.5 transition-all cursor-pointer">
                <div className="h-1 w-full rounded-full mb-3" style={{ background: '#2AA6A6' }} />
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-black text-lg truncate">{pool.name}</h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[pool.status] || 'bg-gray-500'}`} />
                    <span className="text-xs font-bold text-gray-400">{pool.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border bg-${fmt.color}-500/15 border-${fmt.color}-500/30 text-${fmt.color}-400`}>
                    {fmt.label}
                  </span>
                  <span className="flex items-center gap-1"><Users size={12} /> {pool.entrant_count || 0}</span>
                  {pool.lock_time && (
                    <span className="flex items-center gap-1"><Clock size={12} /> {new Date(pool.lock_time).toLocaleDateString()}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
