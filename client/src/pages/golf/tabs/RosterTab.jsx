import { useState, useEffect } from 'react';
import { Star, Flag, Zap } from 'lucide-react';
import { Badge } from '../../../components/ui';
import api from '../../../api';
import SalaryCap from '../../../components/golf/SalaryCap';
import PoolRosterTab from './PoolRosterTab';

export default function RosterTab({ leagueId, league }) {
  // Pool + tiered pick sheet — replace generic roster UI entirely
  if (league.format_type === 'pool' && league.pick_sheet_format === 'tiered') {
    return <PoolRosterTab leagueId={leagueId} league={league} />;
  }

  const fmt = league.format_type || 'tourneyrun';
  const [roster, setRoster] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState(false);
  const [dropping, setDropping] = useState(null);
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const [rRes, pRes] = await Promise.all([
        api.get(`/golf/leagues/${leagueId}/roster`),
        api.get('/golf/players'),
      ]);
      setRoster(rRes.data.roster || []);
      setAllPlayers(pRes.data.players || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [leagueId]);

  async function handleDrop(playerId) {
    setDropping(playerId);
    setError('');
    try {
      await api.post(`/golf/leagues/${leagueId}/roster/drop`, { player_id: playerId });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to drop player');
    }
    setDropping(null);
  }

  async function handleAdd(playerId) {
    setAdding(playerId);
    setError('');
    try {
      await api.post(`/golf/leagues/${leagueId}/roster/add`, { player_id: playerId });
      await load();
      setAddMode(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add player');
    }
    setAdding(null);
  }

  const rosterIds = new Set(roster.map(r => r.player_id));
  const usedSalary = roster.reduce((sum, r) => sum + (r.salary || 0), 0);
  const available = allPlayers.filter(p =>
    !rosterIds.has(p.id) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <div className="py-10 text-center text-gray-500">Loading roster...</div>;

  // DK mode — no persistent roster
  if (fmt === 'dk') {
    return (
      <div className="py-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
          <Zap className="w-7 h-7 text-purple-400" />
        </div>
        <h3 className="text-white font-bold mb-2">Daily Fantasy Mode</h3>
        <p className="text-gray-400 text-sm max-w-xs mx-auto">
          No persistent roster in DFS mode. Set your {league.starters_per_week || 6} starters fresh each tournament from the Lineup tab.
        </p>
      </div>
    );
  }

  const coreRoster = roster.filter(p => p.is_core);
  const flexRoster = roster.filter(p => !p.is_core);
  const maxRoster = league.roster_size || 8;
  const flexMax = fmt === 'tourneyrun' ? (league.flex_spots || 4) : maxRoster;

  function PlayerRow({ p, isCore = false }) {
    return (
      <div className={`flex items-center justify-between px-5 py-3.5 gap-3 ${isCore ? 'bg-yellow-500/3' : ''}`}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {isCore && <Star className="w-4 h-4 text-yellow-400 shrink-0 fill-yellow-400" />}
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">{p.name}</div>
            <div className="text-gray-500 text-xs">{p.country} · Rank #{p.world_ranking}</div>
          </div>
        </div>
        {fmt !== 'pool' && <div className="text-green-400 font-bold text-sm shrink-0">${p.salary}</div>}
        {isCore ? (
          <span className="text-[10px] font-bold text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full">CORE</span>
        ) : (
          <button
            onClick={() => handleDrop(p.player_id)}
            disabled={dropping === p.player_id}
            className="text-xs px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            Drop
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* Salary bar — not for Pool mode */}
      {fmt !== 'pool' && <SalaryCap used={usedSalary} cap={league.salary_cap || 2400} />}

      {/* TourneyRun: Core Players section */}
      {fmt === 'tourneyrun' && (
        <div className="bg-gray-900 border border-yellow-500/25 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-yellow-500/15 flex items-center gap-2 bg-yellow-500/5">
            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 shrink-0" />
            <h3 className="text-yellow-400 font-bold">Core Players ({coreRoster.length}/{league.core_spots || 4})</h3>
            <span className="ml-auto text-[10px] text-yellow-600 font-semibold uppercase tracking-wide">Season-locked</span>
          </div>
          {coreRoster.length === 0 ? (
            <div className="py-6 text-center text-gray-500 text-sm">Core players are set during the draft.</div>
          ) : (
            <div className="divide-y divide-yellow-500/10">
              {coreRoster.map(p => <PlayerRow key={p.player_id} p={p} isCore />)}
            </div>
          )}
        </div>
      )}

      {/* Flex / standard roster */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-gray-400" />
            <h3 className="text-white font-bold">
              {fmt === 'tourneyrun'
                ? `Flex Players (${flexRoster.length}/${flexMax})`
                : fmt === 'pool'
                ? `My Picks (${roster.length}/${maxRoster})`
                : `My Roster (${roster.length}/${maxRoster})`
              }
            </h3>
          </div>
          {roster.length < maxRoster && (
            <button
              onClick={() => setAddMode(m => !m)}
              className="text-xs px-3 py-1.5 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg font-semibold hover:bg-green-500/25 transition-colors"
            >
              {addMode ? 'Cancel' : '+ Add Player'}
            </button>
          )}
        </div>

        {(fmt === 'tourneyrun' ? flexRoster : roster).length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">
            {fmt === 'tourneyrun' ? 'No flex players yet. Use the waiver wire to add players.' : 'No players yet.'}
            {fmt !== 'tourneyrun' && (
              <button onClick={() => setAddMode(true)} className="text-green-400 hover:underline ml-1">Add players →</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {(fmt === 'tourneyrun' ? flexRoster : roster).map(p => <PlayerRow key={p.player_id} p={p} />)}
          </div>
        )}
      </div>

      {/* Add player panel */}
      {addMode && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-800">
            {available.slice(0, 40).map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{p.name}</div>
                  <div className="text-gray-500 text-xs">{p.country} · Rank #{p.world_ranking}</div>
                </div>
                {fmt !== 'pool' && <div className="text-green-400 font-bold text-sm shrink-0">${p.salary}</div>}
                <button
                  onClick={() => handleAdd(p.id)}
                  disabled={adding === p.id}
                  className="text-xs px-2.5 py-1 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/25 transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ))}
            {available.length === 0 && (
              <div className="py-6 text-center text-gray-500 text-sm">No players found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
