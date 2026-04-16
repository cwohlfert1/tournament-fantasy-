import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ChevronDown, AlertCircle, Users, Bell } from 'lucide-react';
import Select from '../../components/ui/Select';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ordinalPlace(n) {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

// ── Tournament Selector ───────────────────────────────────────────────────────

function TournamentSelector({ tournaments, selectedId, onChange }) {
  return (
    <div className="bg-gray-900 border border-amber-500/30 rounded-2xl p-5 mb-6">
      <div className="flex items-start gap-3 mb-4">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-white font-bold text-sm">Select a Tournament</p>
          <p className="text-gray-400 text-xs mt-0.5">Choose which tournament to build the pick sheet for.</p>
        </div>
      </div>
      <Select
        value={selectedId || ''}
        onChange={onChange}
        options={tournaments.map(t => ({
          value: t.id,
          label: `${t.name} (${t.start_date?.slice(0, 10)})`,
        }))}
        placeholder="-- Select tournament --"
        fullWidth
      />
    </div>
  );
}

// ── Tiered Draft View ─────────────────────────────────────────────────────────

function TieredView({ tiers, leagueId, tournamentId, onRefresh }) {
  const [moving, setMoving] = useState(null); // player_id being moved
  const tierNumbers = tiers.map(t => t.tier);

  async function movePlayer(playerId, toTier) {
    setMoving(playerId);
    try {
      await api.post(`/golf/leagues/${leagueId}/tier-players/${playerId}/move`, {
        tier_number: toTier,
        tournament_id: tournamentId,
      });
      onRefresh();
    } catch (_) {}
    setMoving(null);
  }

  if (!tiers.length) return (
    <p className="text-gray-500 text-sm text-center py-8">No players assigned yet. Click "Run Auto Assignment" above.</p>
  );

  return (
    <div className="space-y-4">
      {tiers.map(tier => (
        <div key={tier.tier} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {/* Tier header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 bg-gray-800/40">
            <div>
              <span className="text-white font-bold text-sm">Tier {tier.tier}</span>
              <span className="text-gray-500 text-xs ml-2">
                {tier.odds_min} – {tier.odds_max}
              </span>
              <span className="ml-2 text-xs text-green-400 font-semibold">Pick {tier.picks}</span>
            </div>
            <span className="text-gray-500 text-xs">{tier.players.length} players</span>
          </div>

          {/* Players */}
          <div className="divide-y divide-gray-800/60">
            {tier.players.length === 0 ? (
              <p className="text-gray-600 text-xs px-5 py-3">No players in this tier</p>
            ) : tier.players.map(p => (
              <div key={p.player_id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="text-gray-500 text-xs w-6 shrink-0">#{p.world_ranking}</span>
                <span className={`text-sm font-medium flex-1 ${p.manually_overridden ? 'text-amber-300' : 'text-gray-200'}`}>
                  {p.player_name}
                  {p.manually_overridden ? <span className="text-[10px] text-amber-400/70 ml-1.5">moved</span> : null}
                </span>
                <span className="text-gray-600 text-xs shrink-0">{(p.odds_display || '').replace(':', '/')}</span>

                {/* Move dropdown */}
                <div className="shrink-0">
                  <Select
                    value={tier.tier}
                    onChange={v => movePlayer(p.player_id, parseInt(v))}
                    disabled={moving === p.player_id}
                    options={tierNumbers.map(n => ({
                      value: n,
                      label: `Tier ${n}${n === tier.tier ? ' \u2713' : ''}`,
                    }))}
                    size="sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Salary Cap View ───────────────────────────────────────────────────────────

function SalaryCapView({ tiers, cap, leagueId, tournamentId, onRefresh }) {
  const [sortBy, setSortBy] = useState('salary');
  const [saving, setSaving] = useState(null);
  const [localSalaries, setLocalSalaries] = useState({});

  // Flatten all players across tiers
  const allPlayers = tiers.flatMap(t => t.players).sort((a, b) => {
    if (sortBy === 'salary')  return b.salary - a.salary;
    if (sortBy === 'ranking') return a.world_ranking - b.world_ranking;
    return a.player_name.localeCompare(b.player_name);
  });

  async function saveSalary(playerId) {
    const salary = parseInt(localSalaries[playerId]);
    if (isNaN(salary)) return;
    setSaving(playerId);
    try {
      await api.patch(`/golf/leagues/${leagueId}/tier-players/${playerId}`, {
        salary, tournament_id: tournamentId,
      });
    } catch (_) {}
    setSaving(null);
  }

  async function resetSalary(playerId) {
    setSaving(playerId);
    try {
      await api.patch(`/golf/leagues/${leagueId}/tier-players/${playerId}`, {
        reset_salary: true, tournament_id: tournamentId,
      });
      setLocalSalaries(prev => { const n = { ...prev }; delete n[playerId]; return n; });
      onRefresh();
    } catch (_) {}
    setSaving(null);
  }

  if (!allPlayers.length) return (
    <p className="text-gray-500 text-sm text-center py-8">No players assigned yet. Click "Run Auto Assignment" above.</p>
  );

  return (
    <div>
      {/* Cap reminder */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <span className="text-gray-400 text-sm">Cap per team</span>
        <span className="text-white font-bold">${(cap || 50000).toLocaleString()}</span>
      </div>

      {/* Sort controls */}
      <div className="flex gap-2 mb-3">
        {['salary', 'ranking', 'name'].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSortBy(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${
              sortBy === s
                ? 'bg-green-500/20 border-green-500/60 text-green-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Player table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 text-[10px] font-bold uppercase tracking-wide text-gray-600 px-4 py-2 border-b border-gray-800">
          <span className="w-8">#</span>
          <span>Player</span>
          <span className="w-16 text-right">Odds</span>
          <span className="w-24 text-right">Salary</span>
          <span className="w-14" />
        </div>
        <div className="divide-y divide-gray-800/50">
          {allPlayers.map(p => {
            const displaySalary = localSalaries[p.player_id] !== undefined
              ? localSalaries[p.player_id]
              : p.salary;
            return (
              <div key={p.player_id} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-0 px-4 py-2.5">
                <span className="text-gray-500 text-xs w-8">#{p.world_ranking}</span>
                <span className={`text-sm font-medium ${p.manually_overridden ? 'text-amber-300' : 'text-gray-200'}`}>
                  {p.player_name}
                </span>
                <span className="text-gray-600 text-xs w-16 text-right">{p.odds_display}</span>
                {/* Editable salary */}
                <div className="w-24 flex justify-end">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                    <input
                      type="number"
                      className="input py-1 pl-5 pr-1 text-xs text-right w-20 font-bold"
                      value={displaySalary}
                      onChange={e => setLocalSalaries(prev => ({ ...prev, [p.player_id]: e.target.value }))}
                      onBlur={() => saveSalary(p.player_id)}
                      disabled={saving === p.player_id}
                    />
                  </div>
                </div>
                {/* Reset button */}
                <div className="w-14 flex justify-end">
                  {p.manually_overridden ? (
                    <button
                      type="button"
                      onClick={() => resetSalary(p.player_id)}
                      disabled={saving === p.player_id}
                      className="text-[10px] text-gray-500 hover:text-green-400 transition-colors font-semibold"
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Member Picks Status ───────────────────────────────────────────────────────

function MemberPicksSection({ leagueId, tournamentId }) {
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [sending, setSending]     = useState(false);
  const [remindMsg, setRemindMsg] = useState('');

  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    api.get(`/golf/leagues/${leagueId}/picks/all`, { params: { tournament_id: tournamentId } })
      .then(res => setMembers(res.data.members || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId, tournamentId]);

  async function sendReminder() {
    setSending(true);
    setRemindMsg('');
    try {
      const res = await api.post(`/golf/leagues/${leagueId}/picks/remind`, { tournament_id: tournamentId });
      setRemindMsg(`✓ Reminded ${res.data.reminded ?? 'all'} members`);
    } catch (err) {
      setRemindMsg(err.response?.data?.error || 'Failed to send reminders');
    }
    setSending(false);
  }

  if (!tournamentId) return null;

  const submitted = members.filter(m => m.submitted);
  const pending   = members.filter(m => !m.submitted);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h2 className="text-white font-bold text-sm">Member Picks</h2>
          {!loading && (
            <span className="text-gray-500 text-xs">
              {submitted.length} submitted · {pending.length} pending
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={sendReminder}
          disabled={sending || loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-semibold transition-all disabled:opacity-50"
        >
          <Bell className="w-3 h-3" />
          {sending ? 'Sending…' : 'Remind unpicked'}
        </button>
      </div>

      {remindMsg && (
        <p className={`text-xs mb-3 font-medium ${remindMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
          {remindMsg}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {members.length === 0 ? (
            <p className="text-gray-500 text-sm px-5 py-6 text-center">No members have submitted picks yet.</p>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {members.map(m => (
                <div key={m.user_id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${m.submitted ? 'bg-green-400' : 'bg-gray-600'}`} />
                  <span className="text-gray-200 text-sm font-medium flex-1">
                    {m.team_name || m.username}
                  </span>
                  {m.submitted ? (
                    <span className="text-green-400 text-xs font-semibold">{m.picks_count} picks</span>
                  ) : (
                    <span className="text-gray-500 text-xs">Not submitted</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GolfLeagueSettings() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [league, setLeague]           = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournId, setSelectedTournId] = useState('');
  const [tiers, setTiers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [assigning, setAssigning]     = useState(false);
  const [assignMsg, setAssignMsg]     = useState('');

  useDocTitle('Pick Sheet Settings | Golf');

  useEffect(() => {
    Promise.all([
      api.get(`/golf/leagues/${id}`),
      api.get('/golf/tournaments'),
    ]).then(([leagueRes, tournRes]) => {
      const l = leagueRes.data.league;
      if (l.commissioner_id !== user?.id) { navigate(`/golf/league/${id}`); return; }
      if (l.format_type !== 'pool') { navigate(`/golf/league/${id}`); return; }
      setLeague(l);
      setTournaments(tournRes.data.tournaments || []);
      const tid = l.pool_tournament_id || '';
      setSelectedTournId(tid);
      if (tid) loadTierPlayers(tid);
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, [id, user]);

  const loadTierPlayers = useCallback(async (tid) => {
    setLoading(true);
    try {
      const res = await api.get(`/golf/leagues/${id}/tier-players`, { params: { tournament_id: tid } });
      setTiers(res.data.tiers || []);
    } catch (_) {}
    setLoading(false);
  }, [id]);

  async function handleTournamentChange(tid) {
    setSelectedTournId(tid);
    if (tid) await loadTierPlayers(tid);
    else setTiers([]);
  }

  async function runAutoAssign() {
    if (!selectedTournId) return;
    setAssigning(true);
    setAssignMsg('');
    try {
      const res = await api.post(`/golf/leagues/${id}/assign-tiers`, { tournament_id: selectedTournId });
      setTiers(res.data.tiers || []);
      setAssignMsg('✓ Players assigned successfully');
    } catch (err) {
      setAssignMsg(err.response?.data?.error || 'Assignment failed');
    }
    setAssigning(false);
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (!league) return (
    <div className="max-w-3xl mx-auto px-4 py-10 text-center text-gray-500">League not found.</div>
  );

  const isSalaryCap = league.pick_sheet_format === 'salary_cap';
  const hasTiers    = tiers.some(t => t.players?.length > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">

      {/* Back link */}
      <Link to={`/golf/league/${id}`} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to league
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Pick Sheet Settings</h1>
        <p className="text-gray-400 text-sm mt-1">{league.name} · {isSalaryCap ? 'Salary Cap' : 'Tiered Draft'}</p>
      </div>

      {/* Tournament selector */}
      <TournamentSelector
        tournaments={tournaments}
        selectedId={selectedTournId}
        onChange={handleTournamentChange}
      />

      {/* Run assignment */}
      {selectedTournId && (
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={runAutoAssign}
            disabled={assigning}
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl transition-all text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${assigning ? 'animate-spin' : ''}`} />
            {assigning ? 'Assigning…' : hasTiers ? 'Re-run Auto Assignment' : 'Run Auto Assignment'}
          </button>
          {assignMsg && (
            <span className={`text-sm font-medium ${assignMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
              {assignMsg}
            </span>
          )}
        </div>
      )}

      {/* Note about manually moved players */}
      {hasTiers && (
        <p className="text-gray-600 text-xs mb-4">
          Re-running auto assignment preserves manually moved players (shown in <span className="text-amber-400">amber</span>).
        </p>
      )}

      {/* Pick sheet view */}
      {selectedTournId && (
        isSalaryCap ? (
          <SalaryCapView
            tiers={tiers}
            cap={league.pool_salary_cap}
            leagueId={id}
            tournamentId={selectedTournId}
            onRefresh={() => loadTierPlayers(selectedTournId)}
          />
        ) : (
          <TieredView
            tiers={tiers}
            leagueId={id}
            tournamentId={selectedTournId}
            onRefresh={() => loadTierPlayers(selectedTournId)}
          />
        )
      )}

      {/* Member picks status */}
      <MemberPicksSection leagueId={id} tournamentId={selectedTournId} />

    </div>
  );
}
