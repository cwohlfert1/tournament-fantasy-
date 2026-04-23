import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';

const FORMAT_LABELS = {
  random_draw: 'Random Draw',
  pick_wps:    'Pick W/P/S',
  squares:     'Squares',
};

export default function RacingDashboard() {
  const { user } = useAuth();
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/racing/pools')
      .then(r => setPools(r.data.pools || []))
      .catch(() => setPools([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Free beta banner */}
      <div className="mb-6 border border-racing-500/30 bg-racing-500/5 rounded-lg px-4 py-3 text-center">
        <span className="text-racing-300 text-sm">
          Free beta &mdash; Kentucky Derby 2026. No platform fee.
        </span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">My Racing Pools</h1>
        <div className="flex gap-3">
          <Link
            to="/racing/join"
            className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-4 py-2"
          >
            Join Pool
          </Link>
          <Link
            to="/racing/create"
            className="text-sm text-white bg-racing-500 hover:bg-racing-600 rounded-lg px-4 py-2"
          >
            + Create Pool
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading...</div>
      ) : pools.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-gray-500">You haven't joined any racing pools yet.</p>
          <div className="flex justify-center gap-3">
            <Link to="/racing/join" className="text-racing-400 hover:text-racing-300 text-sm underline">Join a pool</Link>
            <span className="text-gray-700">|</span>
            <Link to="/racing/create" className="text-racing-400 hover:text-racing-300 text-sm underline">Create one</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {pools.map(pool => (
            <Link
              key={pool.id}
              to={`/racing/pool/${pool.id}`}
              className="block border border-gray-700/50 rounded-lg p-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-semibold">{pool.name}</h3>
                <span className="text-xs text-gray-400 uppercase tracking-wide">{pool.status}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{FORMAT_LABELS[pool.format_type] || pool.format_type}</span>
                <span>{pool.entrant_count || 0} entrants</span>
                {pool.lock_time && (
                  <span>Locks {new Date(pool.lock_time).toLocaleDateString()}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
