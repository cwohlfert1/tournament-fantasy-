import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Users, Zap, Star, Flag, Trophy, Target, Check, Lock, ArrowLeft, ArrowRight, ChevronRight, Award, Copy, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import BallLoader from '../../components/BallLoader';
import GolfPaymentModal from '../../components/golf/GolfPaymentModal';

// ── Helpers ────────────────────────────────────────────────────────────────────

function Chip({ children, color = 'gray' }) {
  const colors = {
    gray:   'bg-gray-700/60 text-gray-400 border-gray-700',
    green:  'bg-green-500/15 text-green-400 border-green-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    blue:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
    red:    'bg-red-500/15 text-red-400 border-red-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
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

const FORMAT_META = {
  pool:        { label: 'Pool',          color: 'blue'  },
  dk:          { label: 'Daily Fantasy', color: 'purple' },
  tourneyrun:  { label: 'TourneyRun',    color: 'green' },
};

function OverviewTab({ league, members, user, isComm, navigate }) {
  const inviteUrl = `${window.location.origin}/golf/join?code=${league.invite_code}`;
  const [copied, setCopied] = useState(false);
  const fmt = FORMAT_META[league.format_type] || FORMAT_META.tourneyrun;

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Format-specific stat cards
  const statCards = (() => {
    if (league.format_type === 'pool') return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Picks Per Team',  value: String(league.picks_per_team || 8) },
      { label: 'Format',          value: 'Pool' },
    ];
    if (league.format_type === 'dk') return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Weekly Cap',      value: `$${(league.weekly_salary_cap || 50000).toLocaleString()}` },
      { label: 'Starters / Wk',   value: String(league.starters_per_week || 6) },
    ];
    // tourneyrun default
    return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Core + Flex',     value: `${league.core_spots || 4} + ${league.flex_spots || 4}` },
      { label: 'FAAB Budget',     value: `$${(league.faab_budget || 500).toLocaleString()}` },
    ];
  })();

  return (
    <div className="space-y-5">
      {/* Format badge */}
      <div className="flex items-center gap-2">
        <Chip color={fmt.color}>{fmt.label}</Chip>
        {league.format_type === 'tourneyrun' && league.use_faab
          ? <Chip color="yellow">FAAB Wire</Chip>
          : league.format_type === 'tourneyrun'
          ? <Chip color="gray">Priority Wire</Chip>
          : null
        }
      </div>

      {/* League info card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          {statCards.map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl px-4 py-3 text-center">
              <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">{s.label}</div>
              <div className="text-white font-black text-2xl">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Invite code */}
        <div className="border border-gray-700 rounded-xl p-4 bg-gray-800/30">
          <div className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-2">Invite Code</div>
          <div className="flex items-center gap-3">
            <span className="text-white font-black text-2xl tracking-widest flex-1">{league.invite_code}</span>
            <button
              onClick={copyInvite}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${
                copied
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:text-white hover:border-gray-500'
              }`}
            >
              {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy Link</>}
            </button>
          </div>
        </div>

        {/* Text to join — visible to all members */}
        <a
          href={`sms:?body=${encodeURIComponent(
            `Join my golf fantasy league "${league.name}" on TourneyRun! ` +
            `One draft, all season, majors count 1.5x. ` +
            `Use invite code ${league.invite_code} or join here: ` +
            `https://www.tourneyrun.app/golf/join?code=${league.invite_code}`
          )}`}
          title="Opens your texts on mobile"
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold text-sm rounded-xl transition-all"
        >
          <MessageSquare className="w-4 h-4" /> Text Friends to Join
        </a>
      </div>

      {/* Members list */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
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
      {isComm && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
            <Zap className="w-4 h-4 text-green-400" />
            <h3 className="text-white font-bold text-sm">Commissioner Actions</h3>
          </div>
          {league.format_type !== 'dk' && league.draft_status !== 'completed' && (
            <>
              <button
                onClick={() => navigate(`/golf/league/${league.id}/draft`)}
                className="w-full py-3 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl transition-all mb-2"
              >
                Go to Draft Room →
              </button>
              <p className="text-gray-600 text-xs mb-3 text-center">
                {league.format_type === 'pool'
                  ? 'Snake draft — each pick is a golfer for the season.'
                  : 'Draft core players. Flex spots fill via waiver wire.'}
              </p>
            </>
          )}
          <button
            onClick={() => navigate(`/golf/league/${league.id}/scores`)}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-200 font-bold rounded-xl transition-all"
          >
            Enter Scores →
          </button>
        </div>
      )}

      {/* DK mode: no draft, direct to lineup */}
      {league.format_type === 'dk' && (
        <div className="bg-purple-500/8 border border-purple-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-purple-400" />
            <span className="text-purple-400 font-bold text-sm">Daily Fantasy Mode</span>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            No draft — pick {league.starters_per_week || 6} golfers fresh each tournament with a ${(league.weekly_salary_cap || 50000).toLocaleString()} cap.
          </p>
          <button
            onClick={() => navigate(`/golf/league/${league.id}?tab=lineup`)}
            className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl transition-all"
          >
            Set This Week's Lineup →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Roster ────────────────────────────────────────────────────────────────

function RosterTab({ leagueId, league }) {
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
  const [showPoolGate, setShowPoolGate] = useState(false);
  const [paidTournaments, setPaidTournaments] = useState([]);

  useEffect(() => {
    api.get('/golf/tournaments').then(r => {
      const upcoming = (r.data.tournaments || []).filter(t => t.status !== 'completed');
      setTournaments(upcoming);
      if (upcoming.length > 0) setSelectedTournId(upcoming[0].id);
    }).catch(() => setLoading(false));
    // Load paid office pool entries
    if (league.format_type === 'office_pool') {
      api.get('/golf/payments/status').then(r => setPaidTournaments(r.data.paidTournaments || [])).catch(() => {});
    }
  }, [league.format_type]);

  useEffect(() => {
    if (!selectedTournId) return;
    setLoading(true);
    api.get(`/golf/leagues/${leagueId}/lineup/${selectedTournId}`)
      .then(r => {
        setLineup((r.data.lineup || []).filter(l => l.is_started).map(l => l.player_id));
        setRoster(r.data.roster || []);
        setLocked(r.data.isLocked || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId, selectedTournId]);

  function toggleStarter(playerId) {
    if (locked) return;
    const maxStarters = league.starters_per_week || 6;
    setLineup(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
      if (prev.length >= maxStarters) return prev;
      return [...prev, playerId];
    });
  }

  async function saveLineup() {
    // Gate 1: office_pool format requires entry fee per tournament
    if (league.format_type === 'office_pool' && selectedTournId && !paidTournaments.includes(String(selectedTournId))) {
      setShowPoolGate(true);
      return;
    }
    await doSaveLineup();
  }

  async function doSaveLineup() {
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

  const maxStarters = league.starters_per_week || 6;

  const selectedTourn = tournaments.find(t => t.id === selectedTournId || t.id === Number(selectedTournId));

  return (
    <div className="space-y-4">
      {/* Gate 1: Office Pool entry modal */}
      {showPoolGate && (
        <GolfPaymentModal
          type="office_pool"
          meta={{
            tournamentId: String(selectedTournId),
            tournamentName: selectedTourn?.name,
            isMajor: !!selectedTourn?.is_major,
            leagueId,
          }}
          onClose={() => setShowPoolGate(false)}
          onAlreadyPaid={() => {
            setPaidTournaments(p => [...p, String(selectedTournId)]);
            setShowPoolGate(false);
            doSaveLineup();
          }}
        />
      )}

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
                {t.name} — {t.start_date?.slice(0, 10)}{t.is_major ? ' ★' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {locked && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl px-4 py-3 text-sm font-semibold">
          <Lock className="w-4 h-4 shrink-0" /> Lineup locked — tournament has started.
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
                <Target className="w-4 h-4 text-gray-400" />
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
                  {saving ? 'Saving...' : saved ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" />Saved</span> : 'Save Lineup'}
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
                          {isStarter && <Check className="w-3 h-3 text-white" />}
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

// ── Tab: Free Agency ───────────────────────────────────────────────────────────

const getTier = (salary) => {
  if (salary >= 800) return { label: 'Elite', color: '#f59e0b' };
  if (salary >= 700) return { label: 'Prem',  color: '#8b5cf6' };
  if (salary >= 550) return { label: 'Mid',   color: '#3b82f6' };
  if (salary >= 400) return { label: 'Val',   color: '#22c55e' };
  return                     { label: 'Slpr',  color: '#6b7280' };
};

function TierBadge({ salary }) {
  const { label, color } = getTier(salary || 0);
  return (
    <span style={{ color, borderColor: color + '55', backgroundColor: color + '18' }}
      className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border shrink-0">
      {label}
    </span>
  );
}

function FreeAgencyTab({ leagueId, league }) {
  console.log('[FreeAgency] render', { leagueId, league: !!league });
  const [waivers, setWaivers] = useState(null);  // { available, myBids, faabBudget, faabRemaining, useFaab }
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [bidTarget, setBidTarget] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [dropPlayerId, setDropPlayerId] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState('');
  const [bidSuccess, setBidSuccess] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [logs, setLogs] = useState({});  // { [playerId]: { loading, data, error } }

  async function load() {
    setLoadError('');
    try {
      const [wRes, rRes] = await Promise.all([
        api.get(`/golf/leagues/${leagueId}/waivers`),
        api.get(`/golf/leagues/${leagueId}/roster`),
      ]);
      setWaivers(wRes.data);
      setRoster(rRes.data.roster || []);
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Failed to load waiver data');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [leagueId]);

  const available = (waivers?.available || []).filter(p =>
    !p.on_roster &&
    (!search || (p.name || '').toLowerCase().includes(search.toLowerCase()))
  );

  const rosterFull = roster.length >= (league.roster_size || 8);
  const droppable = roster.filter(p => !p.is_core);

  function openBid(p) {
    setBidTarget(p);
    setBidAmount('');
    setDropPlayerId('');
    setBidError('');
    setBidSuccess('');
  }

  async function toggleRow(playerId) {
    if (expandedId === playerId) { setExpandedId(null); return; }
    setExpandedId(playerId);
    if (logs[playerId]) return; // already cached
    setLogs(prev => ({ ...prev, [playerId]: { loading: true } }));
    try {
      const r = await api.get(`/golf/players/${playerId}/gamelog`);
      setLogs(prev => ({ ...prev, [playerId]: { loading: false, data: r.data } }));
    } catch {
      setLogs(prev => ({ ...prev, [playerId]: { loading: false, error: 'Failed to load' } }));
    }
  }

  async function placeBid(e) {
    e.preventDefault();
    setBidding(true);
    setBidError('');
    try {
      const body = {
        player_id: bidTarget.id,
        bid_amount: parseInt(bidAmount) || 0,
      };
      if (dropPlayerId) body.drop_player_id = dropPlayerId;
      await api.post(`/golf/leagues/${leagueId}/waivers/bid`, body);
      setBidSuccess(`Bid of $${bidAmount || 0} placed on ${bidTarget.name}`);
      setBidTarget(null);
      await load();
    } catch (err) {
      setBidError(err.response?.data?.error || 'Failed to place bid');
    }
    setBidding(false);
  }

  if (loading) return <div className="py-10 text-center text-gray-500">Loading...</div>;

  if (loadError) {
    return (
      <div className="py-10 text-center">
        <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-2xl p-6 text-sm max-w-sm mx-auto">
          {loadError}
        </div>
      </div>
    );
  }

  const pendingBids = (waivers?.myBids || []).filter(b => b.status === 'pending');

  return (
    <div className="space-y-4">
      {/* Budget card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
          <Trophy className="w-4 h-4 text-green-400" />
          <h3 className="text-white font-bold">My FAAB Budget</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Remaining</div>
            <div className="text-green-400 font-black text-xl tabular-nums">${waivers?.faabRemaining ?? '—'}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Budget</div>
            <div className="text-white font-black text-xl tabular-nums">${waivers?.faabBudget ?? '—'}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Pending</div>
            <div className="text-yellow-400 font-black text-xl tabular-nums">{pendingBids.length}</div>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {bidSuccess && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-xl p-3 text-sm flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" /> {bidSuccess}
        </div>
      )}

      {/* Bid modal */}
      {bidTarget && (
        <div className="bg-gray-900 border border-green-500/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold">Place FAAB Bid</h3>
            <button onClick={() => setBidTarget(null)} className="text-gray-500 hover:text-gray-300 text-sm">Cancel</button>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold">{bidTarget.name}</div>
              <div className="text-gray-500 text-xs">{bidTarget.country} · Rank #{bidTarget.world_ranking}</div>
            </div>
            <TierBadge salary={bidTarget.salary} />
            <div className="text-green-400 font-bold text-sm shrink-0">${bidTarget.salary}</div>
          </div>
          {bidError && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-3">{bidError}</div>
          )}
          <form onSubmit={placeBid} className="space-y-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
              <input
                type="number"
                min="0"
                max={waivers?.faabRemaining ?? 9999}
                className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 focus:outline-none text-white text-sm rounded-xl pl-7 pr-4 py-2.5"
                placeholder="Bid amount"
                value={bidAmount}
                onChange={e => setBidAmount(e.target.value)}
                autoFocus
              />
            </div>
            {rosterFull && (
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1.5">Drop player (roster full)</label>
                <select
                  value={dropPlayerId}
                  onChange={e => setDropPlayerId(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 focus:outline-none text-white text-sm rounded-xl px-3 py-2.5"
                >
                  <option value="">Select player to drop...</option>
                  {droppable.map(p => (
                    <option key={p.player_id} value={p.player_id}>{p.name} (${p.salary})</option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="submit"
              disabled={bidding || (rosterFull && !dropPlayerId)}
              className="w-full py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all"
            >
              {bidding ? 'Placing bid...' : 'Place Blind Bid'}
            </button>
          </form>
          <p className="text-gray-600 text-xs mt-2">Bids are blind — processed at waiver deadline.</p>
        </div>
      )}

      {/* Available players */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-gray-400" />
              <h3 className="text-white font-bold">Free Agents</h3>
            </div>
            <span className="text-gray-600 text-xs">{available.length} available</span>
          </div>
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
          />
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {available.slice(0, 60).map(p => {
            const isOpen = expandedId === p.id;
            const log = logs[p.id];
            return (
              <div key={p.id} className="border-b border-gray-800 last:border-0">
                {/* ── Main row ── */}
                <div
                  onClick={() => toggleRow(p.id)}
                  className="flex items-center gap-2 px-4 min-h-[48px] py-2.5 cursor-pointer active:bg-gray-800/50 transition-colors select-none"
                >
                  {/* Chevron */}
                  <svg
                    style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    className="w-3 h-3 text-gray-500 shrink-0"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-600 text-[11px] font-bold tabular-nums w-6 text-center shrink-0">#{p.world_ranking}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-semibold truncate">{p.name}</div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-gray-500">{p.country}</span>
                      {Number(p.season_points) > 0 && (
                        <span className="text-green-400 font-bold tabular-nums">· +{Number(p.season_points).toFixed(1)} pts</span>
                      )}
                    </div>
                  </div>
                  <TierBadge salary={p.salary} />
                  <span className="text-green-400 font-bold text-sm shrink-0 tabular-nums">${p.salary}</span>
                  <button
                    onClick={e => { e.stopPropagation(); openBid(p); }}
                    className="text-xs px-2.5 py-1.5 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg active:bg-green-500/25 transition-colors font-semibold shrink-0"
                  >
                    Bid
                  </button>
                </div>

                {/* ── Game log (expanded) ── */}
                {isOpen && (
                  <div className="bg-gray-950/70 border-t border-gray-800/60 px-4 py-3">
                    {log?.loading && (
                      <div className="py-3 text-center text-gray-500 text-xs">Loading...</div>
                    )}
                    {log?.error && (
                      <div className="py-2 text-center text-red-400 text-xs">{log.error}</div>
                    )}
                    {log?.data && (
                      log.data.gamelog.length === 0 ? (
                        <div className="py-3 text-center text-gray-500 text-xs">No results this season</div>
                      ) : (
                        <>
                          {/* Table — horizontally scrollable */}
                          <div className="overflow-x-auto -mx-4 px-4">
                            <table className="w-full text-xs min-w-[400px]">
                              <thead>
                                <tr className="text-gray-600 text-[10px] uppercase tracking-wide">
                                  <th className="text-left pb-2 font-semibold pr-2">Tournament</th>
                                  <th className="text-center pb-2 font-semibold w-9">R1</th>
                                  <th className="text-center pb-2 font-semibold w-9">R2</th>
                                  <th className="text-center pb-2 font-semibold w-9">R3</th>
                                  <th className="text-center pb-2 font-semibold w-9">R4</th>
                                  <th className="text-center pb-2 font-semibold w-8">Cut</th>
                                  <th className="text-center pb-2 font-semibold w-10">Fin</th>
                                  <th className="text-right pb-2 font-semibold w-12">Pts</th>
                                </tr>
                              </thead>
                              <tbody>
                                {log.data.gamelog.map((g, i) => (
                                  <tr key={i} className="border-t border-gray-800/50">
                                    <td className="py-1.5 pr-2 text-gray-300 max-w-[120px]">
                                      <span className="truncate block">{g.tournament_name}{g.is_major ? ' ★' : ''}</span>
                                    </td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.r1 ?? '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.r2 ?? '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.made_cut ? (g.r3 ?? '—') : '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.made_cut ? (g.r4 ?? '—') : '—'}</td>
                                    <td className="py-1.5 text-center font-bold">
                                      {g.made_cut
                                        ? <span style={{ color: '#22c55e' }}>Y</span>
                                        : <span style={{ color: '#ef4444' }}>N</span>}
                                    </td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.finish_position ?? '—'}</td>
                                    <td className="py-1.5 text-right tabular-nums font-bold"
                                      style={{ color: g.fantasy_points >= 0 ? '#22c55e' : '#ef4444' }}>
                                      {g.fantasy_points > 0 ? '+' : ''}{g.fantasy_points}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Summary */}
                          <div className="mt-3 pt-2.5 border-t border-gray-800/60 grid grid-cols-4 gap-2">
                            {[
                              { label: 'Avg Pts', value: `${log.data.season_avg > 0 ? '+' : ''}${log.data.season_avg}`, color: log.data.season_avg >= 0 ? '#22c55e' : '#ef4444' },
                              { label: 'Events',  value: String(log.data.events_played), color: '#9ca3af' },
                              { label: 'Cuts',    value: `${log.data.cuts_made}/${log.data.events_played}`, color: '#9ca3af' },
                              { label: 'Best',    value: log.data.best_finish ?? '—', color: '#f59e0b' },
                            ].map(s => (
                              <div key={s.label} className="text-center">
                                <div className="text-gray-600 text-[10px] uppercase tracking-wide mb-0.5">{s.label}</div>
                                <div className="font-black text-sm tabular-nums" style={{ color: s.color }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {available.length === 0 && !search && (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
                <Flag className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-gray-500 text-sm">All players are rostered.</p>
            </div>
          )}
          {available.length === 0 && search && (
            <div className="py-8 text-center text-gray-500 text-sm">No players match "{search}".</div>
          )}
        </div>
      </div>

      {/* Pending bids */}
      {pendingBids.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-yellow-400" />
            <h3 className="text-white font-bold">My Pending Bids</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {pendingBids.map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">{b.player_name}</div>
                  {b.drop_player_name && (
                    <div className="text-gray-500 text-xs">Drop: {b.drop_player_name}</div>
                  )}
                </div>
                <Chip color="yellow">${b.bid_amount}</Chip>
              </div>
            ))}
          </div>
        </div>
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
        <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
          <Flag className="w-7 h-7 text-gray-600" />
        </div>
        <p>No scores yet — season hasn't started.</p>
      </div>
    );
  }

  const MEDAL_COLORS = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

  // Determine tied ranks
  const ptsList = standings.map(s => s.season_points || 0);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <h3 className="text-white font-bold">Season Standings</h3>
      </div>
      <div className="divide-y divide-gray-800">
        {standings.map((s, i) => {
          const isMe = s.user_id === currentUserId;
          const pts = s.season_points || 0;
          const isTied = ptsList.filter(p => p === pts).length > 1;
          const rankLabel = isTied ? `T${i + 1}` : `${i + 1}`;
          const weekPts = s.points_this_week != null ? Number(s.points_this_week).toFixed(1) : null;
          const tournsPlayed = s.tournaments_played || 0;

          return (
            <div
              key={s.user_id}
              className={`flex items-center justify-between px-5 py-3.5 gap-3 ${isMe ? 'bg-green-500/5' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 flex items-center justify-center shrink-0">
                  {i < 3
                    ? <Award className={`w-5 h-5 ${MEDAL_COLORS[i]}`} />
                    : <span className="text-gray-500 text-sm font-bold">{rankLabel}</span>}
                </span>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold truncate ${isMe ? 'text-green-400' : 'text-white'}`}>
                    {s.team_name}
                  </div>
                  <div className="text-gray-500 text-xs flex items-center gap-2">
                    <span>{s.username}</span>
                    {tournsPlayed > 0 && (
                      <span className="text-gray-600">· {tournsPlayed} event{tournsPlayed !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-white font-black tabular-nums">{pts.toFixed(1)}</div>
                {weekPts !== null && Number(weekPts) !== 0 ? (
                  <div className="text-gray-500 text-xs tabular-nums">{Number(weekPts) > 0 ? '+' : ''}{weekPts} this wk</div>
                ) : (
                  <div className="text-gray-600 text-xs">pts</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab: Schedule ──────────────────────────────────────────────────────────────

function ScheduleTab({ leagueId, isComm }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/golf/tournaments')
      .then(r => setTournaments(r.data.tournaments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-10 text-center text-gray-500">Loading schedule...</div>;

  const fmt = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
          const isDone  = t.status === 'completed';
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
                <StatusPill status={t.status} />
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

// ── Tab: Commissioner Hub ──────────────────────────────────────────────────────

function CommissionerTab({ leagueId, leagueName, members }) {
  const [promoData, setPromoData]   = useState(null);
  const [isPaid, setIsPaid]         = useState(false);
  const [showGate, setShowGate]     = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  const [copied, setCopied]         = useState('');

  useEffect(() => {
    // Check payment status + run migration promo check simultaneously
    Promise.all([
      api.get('/golf/payments/status'),
      api.post(`/golf/leagues/${leagueId}/check-migration-promo`).catch(() => null),
    ]).then(([statusRes, promoRes]) => {
      const commProLeagues = statusRes.data.commProLeagues || [];
      const paid = commProLeagues.includes(leagueId);
      if (promoRes?.data?.unlocked) {
        setIsPaid(true);
      } else {
        setIsPaid(paid);
      }
      setPromoData(promoRes?.data || null);
      setGateChecked(true);
      if (!paid && !(promoRes?.data?.unlocked)) {
        setShowGate(true);
      }
    }).catch(() => setGateChecked(true));
  }, [leagueId]);

  if (!gateChecked) {
    return <div style={{ color: '#4b5563', padding: 32, textAlign: 'center', fontSize: 14 }}>Loading…</div>;
  }

  const memberCount    = promoData?.memberCount || members.length;
  const membersNeeded  = promoData?.membersNeeded ?? Math.max(0, 6 - memberCount);
  const alreadyUsedPromo = promoData?.alreadyUsedPromo || false;

  // Promo progress bar (shown even when not yet unlocked)
  const showPromoBar = !isPaid && !alreadyUsedPromo && membersNeeded > 0;
  const pct = Math.min(100, Math.round((memberCount / 6) * 100));

  return (
    <div className="space-y-4">
      {/* Gate modal */}
      {showGate && (
        <GolfPaymentModal
          type="comm_pro"
          meta={{ leagueId, memberCount, membersNeeded, alreadyUsedPromo }}
          onClose={() => setShowGate(false)}
          onAlreadyPaid={() => { setIsPaid(true); setShowGate(false); }}
        />
      )}

      {/* "Bring Your League" promo banner */}
      {showPromoBar && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-400 text-sm font-bold">🎁 Invite {membersNeeded} more to unlock Commissioner Pro free</span>
            <span className="text-blue-400 text-sm font-bold">{memberCount}/6</span>
          </div>
          <div className="bg-gray-900 rounded-full h-2 overflow-hidden">
            <div style={{ width: `${pct}%`, transition: 'width 0.4s' }} className="h-full bg-blue-500 rounded-full" />
          </div>
        </div>
      )}

      {!isPaid ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h3 className="text-white font-bold text-lg mb-2">Commissioner Pro required</h3>
          <p className="text-gray-400 text-sm mb-4 max-w-sm mx-auto">
            Unlock auto-emails, payment tracking, FAAB results, CSV export, and more for $19.99/season.
          </p>
          <button
            onClick={() => setShowGate(true)}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors"
          >
            Unlock Commissioner Pro — $19.99
          </button>
          {!alreadyUsedPromo && (
            <p className="text-gray-600 text-xs mt-3">Or invite {membersNeeded} more members to unlock free ↑</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Commissioner Pro header */}
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold">Commissioner Hub</h3>
            <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 text-xs font-bold px-2 py-1 rounded-full">PRO</span>
          </div>

          {/* Member roster */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h4 className="text-white text-sm font-bold">Member Roster ({members.length})</h4>
            </div>
            <div>
              {members.map((m, i) => (
                <div key={m.user_id} style={{ borderBottom: i < members.length - 1 ? '1px solid #111827' : 'none' }}
                  className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-white text-sm font-semibold">{m.team_name}</div>
                    <div className="text-gray-500 text-xs">{m.username}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 text-sm font-bold tabular-nums">{Number(m.season_points || 0).toFixed(1)} pts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mass blast */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">📣 Mass Blast</h4>
            <MassBlast leagueId={leagueId} />
          </div>

          {/* CSV export */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">📊 Export</h4>
            <button
              onClick={() => {
                const rows = [['Team', 'Username', 'Points']];
                members.forEach(m => rows.push([m.team_name, m.username, m.season_points || 0]));
                const csv = rows.map(r => r.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `${leagueName.replace(/\s+/g,'-')}-standings.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="text-sm text-green-400 hover:text-green-300 underline underline-offset-2"
            >
              Download standings CSV
            </button>
          </div>

          {/* Referral link */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <h4 className="text-white text-sm font-bold mb-3">🔗 Referral Link</h4>
            <ReferralSection />
          </div>
        </div>
      )}
    </div>
  );
}

function MassBlast({ leagueId }) {
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!msg.trim()) return;
    setLoading(true);
    try {
      await api.post(`/golf/leagues/${leagueId}/blast`, { message: msg });
      setSent(true);
      setMsg('');
      setTimeout(() => setSent(false), 4000);
    } catch {
      // silently fail — feature may not be wired on backend yet
    }
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Send a message to all league members…"
        rows={3}
        className="input w-full resize-none text-sm"
      />
      {sent && <p className="text-green-400 text-xs">Message sent to all members!</p>}
      <button
        onClick={send}
        disabled={loading || !msg.trim()}
        className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Sending…' : 'Send to all members'}
      </button>
    </div>
  );
}

function ReferralSection() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get('/golf/referral/my-code').then(r => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="text-gray-600 text-xs">Loading…</div>;

  function copy() {
    navigator.clipboard.writeText(data.link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
        <span className="text-gray-400 text-xs truncate flex-1">{data.link}</span>
        <button onClick={copy} className="text-green-400 text-xs font-bold shrink-0">
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-gray-500 text-xs">
        {data.creditsAvailable > 0
          ? `You have $${data.creditsAvailable.toFixed(2)} referral credit available.`
          : `Earn $1 credit for each friend who joins and pays.`}
      </p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function getTabs(league, isComm) {
  const base = [
    { key: 'overview',  label: 'Overview'  },
    { key: 'schedule',  label: 'Schedule'  },
    { key: 'roster',    label: 'Roster'    },
  ];
  if (league?.format_type === 'tourneyrun') {
    base.push({ key: 'freeagency', label: 'Free Agency' });
  }
  base.push(
    { key: 'lineup',    label: 'Lineup'    },
    { key: 'standings', label: 'Standings' },
  );
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
  const tab = searchParams.get('tab') || 'overview';

  const [league, setLeague] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useDocTitle(league ? `${league.name} | Golf` : 'Golf League | TourneyRun');

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
              className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-5 py-2.5 rounded-full transition-all shadow-lg shadow-green-500/20 text-sm shrink-0"
            >
              {isComm ? 'Go to Draft' : 'Join Draft'} <ChevronRight className="w-4 h-4" />
            </Link>
          )}
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
        <OverviewTab league={league} members={members} user={user} isComm={isComm} navigate={navigate} />
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
        <StandingsTab leagueId={id} currentUserId={user?.id} />
      )}
      {tab === 'commissioner' && isComm && (
        <CommissionerTab leagueId={id} leagueName={league.name} members={members} />
      )}
    </div>
  );
}
