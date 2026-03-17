import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import BallLoader from '../../components/BallLoader';

// ── Helpers ────────────────────────────────────────────────────────────────────

function Chip({ children, color = 'gray' }) {
  const colors = {
    gray:  'bg-gray-700/60 text-gray-400 border-gray-700',
    green: 'bg-green-500/15 text-green-400 border-green-500/30',
    yellow:'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    blue:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
    red:   'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${colors[color]}`}>
      {children}
    </span>
  );
}

function SalaryCap({ used, cap }) {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Salary used</span>
        <span className={pct > 90 ? 'text-red-400 font-bold' : 'text-gray-300'}>
          ${used.toLocaleString()} / ${cap.toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────────

function OverviewTab({ league, members, user, isComm, navigate }) {
  const inviteUrl = `${window.location.origin}/golf/join?code=${league.invite_code}`;
  const [copied, setCopied] = useState(false);

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-5">
      {/* League info card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          <div className="bg-gray-800/60 rounded-xl px-4 py-3 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Members</div>
            <div className="text-white font-black text-2xl">{members.length}/{league.max_teams}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-4 py-3 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Salary Cap</div>
            <div className="text-white font-black text-2xl">${league.salary_cap?.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-4 py-3 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Starters</div>
            <div className="text-white font-black text-2xl">{league.starters_count} / week</div>
          </div>
        </div>

        {/* Invite code */}
        <div className="border border-gray-700 rounded-xl p-4 bg-gray-800/30">
          <div className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-2">Invite Code</div>
          <div className="flex items-center gap-3">
            <span className="text-white font-black text-2xl tracking-widest flex-1">{league.invite_code}</span>
            <button
              onClick={copyInvite}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${
                copied
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:text-white hover:border-gray-500'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
      </div>

      {/* Members list */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <span>👥</span>
          <h3 className="text-white font-bold">Members</h3>
        </div>
        <div className="divide-y divide-gray-800">
          {members.map((m, i) => (
            <div key={m.user_id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                  {i + 1}
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">{m.team_name}</div>
                  <div className="text-gray-500 text-xs">{m.username}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.user_id === league.commissioner_id && <Chip color="green">Comm</Chip>}
                {m.user_id === user.id && <Chip color="blue">You</Chip>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Commissioner actions */}
      {isComm && league.draft_status !== 'completed' && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
            <span>⚡</span>
            <h3 className="text-white font-bold text-sm">Commissioner Actions</h3>
          </div>
          <button
            onClick={() => navigate(`/golf/league/${league.id}/draft`)}
            className="w-full py-3 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl transition-all"
          >
            Start Draft →
          </button>
          <p className="text-gray-600 text-xs mt-2 text-center">
            Once you start the draft, all members can pick golfers.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Roster ────────────────────────────────────────────────────────────────

function RosterTab({ leagueId, league }) {
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

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">{error}</div>
      )}

      <SalaryCap used={usedSalary} cap={league.salary_cap || 3000} />

      {/* Roster */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🏌️</span>
            <h3 className="text-white font-bold">My Roster ({roster.length}/{league.roster_size || 8})</h3>
          </div>
          {roster.length < (league.roster_size || 8) && (
            <button
              onClick={() => setAddMode(m => !m)}
              className="text-xs px-3 py-1.5 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg font-semibold hover:bg-green-500/25 transition-colors"
            >
              {addMode ? 'Cancel' : '+ Add Player'}
            </button>
          )}
        </div>

        {roster.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">
            No players on your roster yet.{' '}
            <button onClick={() => setAddMode(true)} className="text-green-400 hover:underline">Add players →</button>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {roster.map(p => (
              <div key={p.player_id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-gray-500 text-xs">{p.country}</div>
                </div>
                <div className="text-green-400 font-bold text-sm shrink-0">${p.salary}</div>
                <button
                  onClick={() => handleDrop(p.player_id)}
                  disabled={dropping === p.player_id}
                  className="text-xs px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  Drop
                </button>
              </div>
            ))}
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
                <div className="text-green-400 font-bold text-sm shrink-0">${p.salary}</div>
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

// ── Tab: Lineup ────────────────────────────────────────────────────────────────

function LineupTab({ leagueId, league }) {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournId, setSelectedTournId] = useState(null);
  const [lineup, setLineup] = useState([]);
  const [roster, setRoster] = useState([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/golf/tournaments').then(r => {
      const upcoming = (r.data.tournaments || []).filter(t => t.status !== 'completed');
      setTournaments(upcoming);
      if (upcoming.length > 0) setSelectedTournId(upcoming[0].id);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTournId) return;
    setLoading(true);
    api.get(`/golf/leagues/${leagueId}/lineup/${selectedTournId}`)
      .then(r => {
        setLineup(r.data.lineup_player_ids || []);
        setRoster(r.data.roster || []);
        setLocked(r.data.locked || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId, selectedTournId]);

  function toggleStarter(playerId) {
    if (locked) return;
    const maxStarters = league.starters_count || 6;
    setLineup(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
      if (prev.length >= maxStarters) return prev;
      return [...prev, playerId];
    });
  }

  async function saveLineup() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.post(`/golf/leagues/${leagueId}/lineup/${selectedTournId}`, { starter_ids: lineup });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save lineup');
    }
    setSaving(false);
  }

  const maxStarters = league.starters_count || 6;

  return (
    <div className="space-y-4">
      {/* Tournament selector */}
      {tournaments.length > 0 && (
        <div>
          <label className="label mb-2">Select Tournament</label>
          <select
            value={selectedTournId || ''}
            onChange={e => setSelectedTournId(Number(e.target.value))}
            className="input"
          >
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.start_date?.slice(0, 10)}{t.is_major ? ' 🏆' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {locked && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl px-4 py-3 text-sm font-semibold">
          🔒 Lineup locked — tournament has started.
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-8 text-center text-gray-500">Loading lineup...</div>
      ) : (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🎯</span>
                <h3 className="text-white font-bold">
                  Set Starters ({lineup.length}/{maxStarters})
                </h3>
              </div>
              {!locked && (
                <button
                  onClick={saveLineup}
                  disabled={saving}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all disabled:opacity-50 ${
                    saved
                      ? 'bg-green-500/20 border-green-500/40 text-green-400'
                      : 'bg-green-500 border-green-500 text-white hover:bg-green-400'
                  }`}
                >
                  {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Lineup'}
                </button>
              )}
            </div>
            {roster.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">
                Add players to your roster first to set a lineup.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {roster.map(p => {
                  const isStarter = lineup.includes(p.player_id);
                  const canAdd = !isStarter && lineup.length < maxStarters && !locked;
                  return (
                    <button
                      key={p.player_id}
                      onClick={() => toggleStarter(p.player_id)}
                      disabled={locked || (!isStarter && !canAdd)}
                      className={`w-full flex items-center justify-between px-5 py-3.5 gap-3 transition-colors text-left ${
                        isStarter
                          ? 'bg-green-500/8 hover:bg-green-500/12'
                          : locked || !canAdd
                          ? 'opacity-50 cursor-default'
                          : 'hover:bg-gray-800/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          isStarter ? 'bg-green-500 border-green-500' : 'border-gray-600'
                        }`}>
                          {isStarter && <span className="text-white text-[10px]">✓</span>}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white text-sm font-medium truncate">{p.name}</div>
                          <div className="text-gray-500 text-xs">{p.country}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isStarter && <Chip color="green">Starter</Chip>}
                        <span className="text-green-400 font-bold text-sm">${p.salary}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-gray-600 text-xs text-center">
            Lineups lock Thursday 12pm ET each tournament week.
          </p>
        </>
      )}
    </div>
  );
}

// ── Tab: Standings ─────────────────────────────────────────────────────────────

function StandingsTab({ leagueId, currentUserId }) {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/golf/leagues/${leagueId}/standings`)
      .then(r => setStandings(r.data.standings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  if (loading) return <div className="py-10 text-center text-gray-500">Loading standings...</div>;

  if (standings.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500">
        <div className="text-4xl mb-3">🏌️</div>
        <p>No scores yet — season hasn't started.</p>
      </div>
    );
  }

  const medal = ['🥇', '🥈', '🥉'];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <span>🏆</span>
        <h3 className="text-white font-bold">Season Standings</h3>
      </div>
      <div className="divide-y divide-gray-800">
        {standings.map((s, i) => {
          const isMe = s.user_id === currentUserId;
          return (
            <div
              key={s.user_id}
              className={`flex items-center justify-between px-5 py-3.5 gap-3 ${isMe ? 'bg-green-500/5' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-7 text-center font-black text-sm shrink-0">
                  {i < 3 ? medal[i] : <span className="text-gray-500">{i + 1}</span>}
                </span>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold truncate ${isMe ? 'text-green-400' : 'text-white'}`}>
                    {s.team_name}
                  </div>
                  <div className="text-gray-500 text-xs">{s.username}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-white font-black">{(s.total_points || 0).toFixed(1)}</div>
                <div className="text-gray-600 text-xs">pts</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'roster',   label: 'Roster'   },
  { key: 'lineup',   label: 'Lineup'   },
  { key: 'standings',label: 'Standings'},
];

export default function GolfLeague() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useDocTitle(league ? `${league.name} | Golf` : 'Golf League | TourneyRun');

  useEffect(() => {
    api.get(`/golf/leagues/${id}`)
      .then(r => {
        setLeague(r.data.league);
        setMembers(r.data.members || []);
      })
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <BallLoader />;

  if (notFound) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="text-5xl mb-4">⛳</div>
        <h2 className="text-2xl font-black text-white mb-2">League not found</h2>
        <Link to="/golf/dashboard" className="text-green-400 hover:underline">← Back to dashboard</Link>
      </div>
    );
  }

  if (!league) return null;

  const isComm = league.commissioner_id === user?.id;

  function setTab(t) {
    setSearchParams({ tab: t });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 overflow-x-hidden">

      {/* ── Header ── */}
      <div className="mb-6">
        <Link to="/golf/dashboard" className="text-gray-500 hover:text-gray-400 text-sm transition-colors">
          ← Golf Leagues
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-white break-words">{league.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Chip color="green">Golf</Chip>
              {isComm && <Chip color="blue">Commissioner</Chip>}
              {league.draft_status === 'completed'
                ? <Chip color="green">Season Active</Chip>
                : <Chip color="yellow">Draft Pending</Chip>
              }
            </div>
          </div>
          {league.draft_status !== 'completed' && (
            <Link
              to={`/golf/league/${id}/draft`}
              className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-500/20 text-sm"
            >
              {isComm ? 'Go to Draft →' : 'Join Draft →'}
            </Link>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
              tab === t.key
                ? 'bg-green-500 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 'overview' && (
        <OverviewTab league={league} members={members} user={user} isComm={isComm} navigate={navigate} />
      )}
      {tab === 'roster' && (
        <RosterTab leagueId={id} league={league} />
      )}
      {tab === 'lineup' && (
        <LineupTab leagueId={id} league={league} />
      )}
      {tab === 'standings' && (
        <StandingsTab leagueId={id} currentUserId={user?.id} />
      )}
    </div>
  );
}
