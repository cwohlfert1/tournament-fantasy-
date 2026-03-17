import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import BallLoader from '../components/BallLoader';

const TABS = ['Leagues', 'Users', 'Players', 'Financials', 'Dev Tools'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ children, color = 'gray' }) {
  const colors = {
    green:  'bg-green-900 text-green-300',
    red:    'bg-red-900 text-red-300',
    yellow: 'bg-yellow-900 text-yellow-300',
    blue:   'bg-blue-900 text-blue-300',
    gray:   'bg-gray-700 text-gray-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

function statusColor(status) {
  if (status === 'active' || status === 'paid') return 'green';
  if (status === 'drafting') return 'blue';
  if (status === 'lobby') return 'yellow';
  return 'gray';
}

function Spinner() {
  return <BallLoader />;
}

function Err({ msg }) {
  return <p className="text-red-400 text-sm py-4">{msg}</p>;
}

// ── Leagues Tab ───────────────────────────────────────────────────────────────

function LeaguesTab() {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [busy, setBusy] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/superadmin/leagues');
      setLeagues(res.data.leagues);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to load leagues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (league) => {
    setSelected(league);
    setDetail(null);
    try {
      const res = await api.get(`/superadmin/leagues/${league.id}`);
      setDetail(res.data);
    } catch (e) {
      setDetail({ error: e.response?.data?.error || 'Failed to load' });
    }
  };

  const startDraft = async (leagueId) => {
    if (!confirm('Force-start draft for this league?')) return;
    setBusy(leagueId + '-start');
    try {
      await api.post(`/superadmin/leagues/${leagueId}/start-draft`);
      await load();
      if (selected?.id === leagueId) openDetail(leagues.find(l => l.id === leagueId) || selected);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setBusy('');
    }
  };

  const deleteLeague = async (leagueId, name) => {
    if (!confirm(`DELETE league "${name}" and all its data? This cannot be undone.`)) return;
    setBusy(leagueId + '-del');
    try {
      await api.delete(`/superadmin/leagues/${leagueId}`);
      setSelected(null);
      setDetail(null);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setBusy('');
    }
  };

  const openEdit = (league) => {
    setEditForm({
      name: league.name,
      max_teams: league.max_teams,
      total_rounds: league.total_rounds,
      pick_time_limit: league.pick_time_limit,
      buy_in_amount: league.buy_in_amount,
      payout_first: league.payout_first,
      payout_second: league.payout_second,
      payout_third: league.payout_third,
      status: league.status,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setBusy('edit');
    try {
      await api.put(`/superadmin/leagues/${selected.id}`, editForm);
      setEditOpen(false);
      await load();
      openDetail({ ...selected, ...editForm });
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <Spinner />;
  if (err) return <Err msg={err} />;

  return (
    <div className="flex gap-4 h-full">
      {/* League list */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="pb-2 pr-4">League</th>
              <th className="pb-2 pr-4">Commissioner</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Teams</th>
              <th className="pb-2 pr-4">Buy-in</th>
              <th className="pb-2 pr-4">Revenue</th>
              <th className="pb-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {leagues.map(l => (
              <tr
                key={l.id}
                onClick={() => openDetail(l)}
                className={`border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors ${selected?.id === l.id ? 'bg-gray-800' : ''}`}
              >
                <td className="py-2 pr-4 font-medium text-white">{l.name}</td>
                <td className="py-2 pr-4 text-gray-300">{l.commissioner_username}</td>
                <td className="py-2 pr-4"><Badge color={statusColor(l.status)}>{l.status}</Badge></td>
                <td className="py-2 pr-4 text-gray-300">{l.member_count}/{l.max_teams}</td>
                <td className="py-2 pr-4 text-gray-300">${l.buy_in_amount || 0}</td>
                <td className="py-2 pr-4 text-green-400">${Number(l.total_paid).toFixed(2)}</td>
                <td className="py-2 text-gray-500">{l.created_at?.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 flex-shrink-0 bg-gray-800 rounded-lg p-4 overflow-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white truncate">{selected.name}</h3>
            <button onClick={() => { setSelected(null); setDetail(null); }} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => navigate(`/league/${selected.id}`)}
              className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded"
            >View League</button>
            <button
              onClick={() => openEdit(selected)}
              className="text-xs px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded"
            >Edit</button>
            {selected.status === 'lobby' && (
              <button
                onClick={() => startDraft(selected.id)}
                disabled={busy === selected.id + '-start'}
                className="text-xs px-3 py-1 bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50"
              >Force Start</button>
            )}
            <button
              onClick={() => deleteLeague(selected.id, selected.name)}
              disabled={busy === selected.id + '-del'}
              className="text-xs px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded disabled:opacity-50"
            >Delete</button>
          </div>

          {!detail ? (
            <Spinner />
          ) : detail.error ? (
            <Err msg={detail.error} />
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-gray-400 space-y-1">
                <div><span className="text-gray-500">ID:</span> <span className="font-mono text-gray-300 break-all">{detail.league.id}</span></div>
                <div><span className="text-gray-500">Invite:</span> <span className="font-mono text-gray-300">{detail.league.invite_code}</span></div>
                <div><span className="text-gray-500">Rounds:</span> {detail.league.total_rounds}</div>
                <div><span className="text-gray-500">Timer:</span> {detail.league.pick_time_limit}s</div>
                <div><span className="text-gray-500">Payouts:</span> {detail.league.payout_first}/{detail.league.payout_second}/{detail.league.payout_third}%</div>
              </div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Members</h4>
              <div className="space-y-1">
                {detail.members.map(m => (
                  <div key={m.id} className="text-xs flex items-center justify-between gap-2">
                    <span className="text-white truncate">{m.username}</span>
                    <span className="text-gray-400 truncate">{m.team_name}</span>
                    <Badge color={statusColor(m.payment_status)}>{m.payment_status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditOpen(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-96 max-h-screen overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Edit League</h3>
            <div className="space-y-3">
              {[
                ['name', 'Name', 'text'],
                ['max_teams', 'Max Teams', 'number'],
                ['total_rounds', 'Total Rounds', 'number'],
                ['pick_time_limit', 'Pick Timer (s)', 'number'],
                ['buy_in_amount', 'Buy-in ($)', 'number'],
                ['payout_first', '1st Place %', 'number'],
                ['payout_second', '2nd Place %', 'number'],
                ['payout_third', '3rd Place %', 'number'],
              ].map(([key, label, type]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input
                    type={type}
                    value={editForm[key] ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {['lobby', 'drafting', 'active', 'complete'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditOpen(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">Cancel</button>
              <button onClick={saveEdit} disabled={busy === 'edit'} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [pwModal, setPwModal] = useState(null);
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/superadmin/users');
      setUsers(res.data.users);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteUser = async (user) => {
    if (!confirm(`Are you sure you want to delete @${user.username}? This cannot be undone.`)) return;
    setBusy(user.id);
    try {
      await api.delete(`/superadmin/users/${user.id}`);
      setUsers(prev => prev.filter(u => u.id !== user.id));
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete user');
    } finally {
      setBusy('');
    }
  };

  const toggleBan = async (user) => {
    const banning = user.role !== 'banned';
    if (!confirm(`${banning ? 'Ban' : 'Unban'} ${user.username}?`)) return;
    setBusy(user.id);
    try {
      await api.put(`/superadmin/users/${user.id}/ban`, { banned: banning });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setBusy('');
    }
  };

  const resetPassword = async () => {
    if (!newPw || newPw.length < 6) return alert('Password must be at least 6 characters');
    setBusy('pw');
    try {
      await api.put(`/superadmin/users/${pwModal.id}/reset-password`, { password: newPw });
      setPwModal(null);
      setNewPw('');
      alert(`Password for ${pwModal.username} reset successfully`);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setBusy('');
    }
  };

  const filtered = users.filter(u =>
    !search || u.username.includes(search) || u.email.includes(search)
  );

  if (loading) return <Spinner />;
  if (err) return <Err msg={err} />;

  return (
    <div>
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search username or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 w-72"
        />
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="pb-2 pr-4">Username</th>
              <th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">Role</th>
              <th className="pb-2 pr-4">Leagues</th>
              <th className="pb-2 pr-4">Joined</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} className="border-b border-gray-800">
                <td className="py-2 pr-4 font-medium text-white">{u.username}</td>
                <td className="py-2 pr-4 text-gray-300">{u.email}</td>
                <td className="py-2 pr-4">
                  <Badge color={u.role === 'superadmin' ? 'blue' : u.role === 'banned' ? 'red' : 'gray'}>
                    {u.role}
                  </Badge>
                </td>
                <td className="py-2 pr-4 text-gray-300">{u.league_count}</td>
                <td className="py-2 pr-4 text-gray-500">{u.created_at?.slice(0, 10)}</td>
                <td className="py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setPwModal(u); setNewPw(''); }}
                      className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded"
                    >Reset PW</button>
                    {u.role !== 'superadmin' && (
                      <>
                        <button
                          onClick={() => toggleBan(u)}
                          disabled={busy === u.id}
                          className={`text-xs px-2 py-1 rounded text-white disabled:opacity-50 ${u.role === 'banned' ? 'bg-green-800 hover:bg-green-700' : 'bg-red-800 hover:bg-red-700'}`}
                        >{u.role === 'banned' ? 'Unban' : 'Ban'}</button>
                        <button
                          onClick={() => deleteUser(u)}
                          disabled={busy === u.id}
                          className="text-xs px-2 py-1 rounded text-white disabled:opacity-50 bg-red-700 hover:bg-red-600 border border-red-500"
                          style={{ background: '#DC2626' }}
                        >Delete</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pwModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPwModal(null)}>
          <div className="bg-gray-800 rounded-xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">Reset Password</h3>
            <p className="text-sm text-gray-400 mb-4">For: <span className="text-white">{pwModal.username}</span></p>
            <input
              type="text"
              placeholder="New password (min 6 chars)"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setPwModal(null)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">Cancel</button>
              <button onClick={resetPassword} disabled={busy === 'pw'} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50">Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Players Tab ───────────────────────────────────────────────────────────────

const INJURY_STATUSES = ['', 'OUT', 'DOUBTFUL', 'QUESTIONABLE'];

function PlayersTab() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [editPlayer, setEditPlayer] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', team: '', position: '', seed: '', region: '', season_ppg: '' });
  const [busy, setBusy] = useState('');
  const [pullLoading, setPullLoading]     = useState(false);
  const [pullMsg, setPullMsg]             = useState('');
  const [schedLoading, setSchedLoading]   = useState(false);
  const [schedMsg, setSchedMsg]           = useState('');
  const [setupLoading, setSetupLoading]   = useState(false);
  const [setupMsg, setSetupMsg]           = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/superadmin/players');
      setPlayers(res.data.players);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to load players');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (p) => {
    setEditPlayer(p);
    setEditForm({
      name: p.name,
      team: p.team,
      position: p.position || '',
      seed: p.seed || '',
      region: p.region || '',
      season_ppg: p.season_ppg || 0,
      is_eliminated: p.is_eliminated || 0,
      injury_status: p.injury_status || '',
      injury_headline: p.injury_headline || '',
    });
  };

  const saveEdit = async () => {
    setBusy('edit');
    try {
      await api.put(`/superadmin/players/${editPlayer.id}`, {
        name: editForm.name,
        team: editForm.team,
        position: editForm.position,
        seed: editForm.seed ? Number(editForm.seed) : null,
        region: editForm.region,
        season_ppg: Number(editForm.season_ppg),
        is_eliminated: Number(editForm.is_eliminated),
      });
      if (editForm.injury_status !== undefined) {
        await api.put(`/superadmin/players/${editPlayer.id}/injury`, {
          status: editForm.injury_status,
          headline: editForm.injury_headline,
        });
      }
      setEditPlayer(null);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setBusy('');
    }
  };

  const deletePlayer = async (p) => {
    if (!confirm(`Delete ${p.name} from ${p.team}? This removes all their draft picks too.`)) return;
    setBusy(p.id);
    try {
      await api.delete(`/superadmin/players/${p.id}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setBusy('');
    }
  };

  const addPlayer = async () => {
    setBusy('add');
    try {
      await api.post('/superadmin/players', {
        ...addForm,
        seed: addForm.seed ? Number(addForm.seed) : null,
        season_ppg: Number(addForm.season_ppg) || 0,
      });
      setAddOpen(false);
      setAddForm({ name: '', team: '', position: '', seed: '', region: '', season_ppg: '' });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed');
    } finally {
      setBusy('');
    }
  };

  const pullBracket = async () => {
    setPullLoading(true);
    setPullMsg('');
    try {
      const res = await api.post('/superadmin/pull-bracket');
      setPullMsg(res.data.message || 'Bracket pulled successfully');
      await load();
    } catch (e) {
      setPullMsg(e.response?.data?.error || 'Pull failed');
    } finally {
      setPullLoading(false);
    }
  };

  const setupTestLeague = async () => {
    if (!window.confirm('This will DELETE all existing leagues and create a fresh "Test Draft 2026" with 9 bots. Continue?')) return;
    setSetupLoading(true);
    setSetupMsg('');
    try {
      const res = await api.post('/superadmin/setup-test-league');
      setSetupMsg(`✓ ${res.data.message}`);
      // Navigate to the new league
      window.open(`/league/${res.data.leagueId}`, '_blank');
    } catch (e) {
      setSetupMsg(e.response?.data?.error || 'Setup failed');
    } finally {
      setSetupLoading(false);
    }
  };

  const pullSchedule = async () => {
    setSchedLoading(true);
    setSchedMsg('');
    try {
      const res = await api.post('/superadmin/pull-schedule');
      setSchedMsg(`Schedule pulled — ${res.data.inserted ?? 0} inserted, ${res.data.updated ?? 0} updated`);
    } catch (e) {
      setSchedMsg(e.response?.data?.error || 'Pull failed');
    } finally {
      setSchedLoading(false);
    }
  };

  const filtered = players.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.team.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Spinner />;
  if (err) return <Err msg={err} />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          placeholder="Search player or team..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 w-64"
        />
        <button onClick={() => setAddOpen(true)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">+ Add Player</button>
        <button onClick={pullBracket} disabled={pullLoading} className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded text-sm disabled:opacity-50">
          {pullLoading ? 'Pulling...' : 'Pull ESPN Bracket'}
        </button>
        <button onClick={pullSchedule} disabled={schedLoading} className="px-3 py-1.5 bg-teal-700 hover:bg-teal-600 text-white rounded text-sm disabled:opacity-50">
          {schedLoading ? 'Pulling...' : 'Pull Schedule'}
        </button>
        <button onClick={setupTestLeague} disabled={setupLoading} className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded text-sm disabled:opacity-50">
          {setupLoading ? 'Setting up...' : '🧪 Setup Test League'}
        </button>
        {pullMsg && <span className="text-xs text-green-400">{pullMsg}</span>}
        {schedMsg && <span className="text-xs text-teal-400">{schedMsg}</span>}
        {setupMsg && <span className="text-xs text-purple-300">{setupMsg}</span>}
        <span className="text-xs text-gray-500 ml-auto">{players.length} players</span>
      </div>

      <div className="overflow-auto max-h-[calc(100vh-240px)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900">
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="pb-2 pr-3">Name</th>
              <th className="pb-2 pr-3">Team</th>
              <th className="pb-2 pr-3">Pos</th>
              <th className="pb-2 pr-3">Seed</th>
              <th className="pb-2 pr-3">Region</th>
              <th className="pb-2 pr-3">PPG</th>
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3">Elim</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="py-1.5 pr-3 text-white font-medium">{p.name}</td>
                <td className="py-1.5 pr-3 text-gray-300">{p.team}</td>
                <td className="py-1.5 pr-3 text-gray-400">{p.position}</td>
                <td className="py-1.5 pr-3 text-gray-400">{p.seed}</td>
                <td className="py-1.5 pr-3 text-gray-400">{p.region}</td>
                <td className="py-1.5 pr-3 text-gray-400">{p.season_ppg}</td>
                <td className="py-1.5 pr-3">
                  {p.injury_status ? <Badge color={p.injury_status === 'OUT' ? 'red' : 'yellow'}>{p.injury_status}</Badge> : <span className="text-gray-600">—</span>}
                </td>
                <td className="py-1.5 pr-3">
                  {p.is_eliminated ? <Badge color="red">OUT</Badge> : <span className="text-gray-600">—</span>}
                </td>
                <td className="py-1.5">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white rounded">Edit</button>
                    <button onClick={() => deletePlayer(p)} disabled={busy === p.id} className="text-xs px-2 py-0.5 bg-red-800 hover:bg-red-700 text-white rounded disabled:opacity-50">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit player modal */}
      {editPlayer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditPlayer(null)}>
          <div className="bg-gray-800 rounded-xl p-6 w-96 max-h-screen overflow-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Edit Player</h3>
            <div className="space-y-3">
              {[
                ['name', 'Name', 'text'],
                ['team', 'Team', 'text'],
                ['position', 'Position', 'text'],
                ['seed', 'Seed', 'number'],
                ['region', 'Region', 'text'],
                ['season_ppg', 'PPG', 'number'],
              ].map(([key, label, type]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input
                    type={type}
                    value={editForm[key] ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Injury Status</label>
                <select
                  value={editForm.injury_status}
                  onChange={e => setEditForm(f => ({ ...f, injury_status: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {INJURY_STATUSES.map(s => <option key={s} value={s}>{s || 'Healthy'}</option>)}
                </select>
              </div>
              {editForm.injury_status && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Injury Headline</label>
                  <input
                    type="text"
                    value={editForm.injury_headline}
                    onChange={e => setEditForm(f => ({ ...f, injury_headline: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="elim"
                  checked={!!editForm.is_eliminated}
                  onChange={e => setEditForm(f => ({ ...f, is_eliminated: e.target.checked ? 1 : 0 }))}
                  className="rounded"
                />
                <label htmlFor="elim" className="text-sm text-gray-300">Mark as eliminated</label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditPlayer(null)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">Cancel</button>
              <button onClick={saveEdit} disabled={busy === 'edit'} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add player modal */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setAddOpen(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Add Player</h3>
            <div className="space-y-3">
              {[
                ['name', 'Name *', 'text'],
                ['team', 'Team *', 'text'],
                ['position', 'Position', 'text'],
                ['seed', 'Seed', 'number'],
                ['region', 'Region', 'text'],
                ['season_ppg', 'PPG', 'number'],
              ].map(([key, label, type]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input
                    type={type}
                    value={addForm[key]}
                    onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setAddOpen(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">Cancel</button>
              <button onClick={addPlayer} disabled={busy === 'add'} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Financials Tab ────────────────────────────────────────────────────────────

function FinancialsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/superadmin/financials')
      .then(res => setData(res.data))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (err) return <Err msg={err} />;

  const { totals, byEntryFee, recentPayments } = data;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['Total Revenue', `$${Number(totals.total_revenue).toFixed(2)}`, 'text-green-400'],
          ['Paid Entries', totals.paid_count, 'text-blue-400'],
          ['Pending', totals.pending_count, 'text-yellow-400'],
          ['Total Payments', totals.total_payments, 'text-gray-300'],
        ].map(([label, value, cls]) => (
          <div key={label} className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Revenue by entry fee */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Revenue by Entry Fee</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-700">
              <th className="pb-2 pr-4">Entry Fee</th>
              <th className="pb-2 pr-4">Leagues</th>
              <th className="pb-2 pr-4">Paid Entries</th>
              <th className="pb-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byEntryFee.map(row => (
              <tr key={row.entry_fee} className="border-b border-gray-800">
                <td className="py-2 pr-4 text-white">${row.entry_fee}</td>
                <td className="py-2 pr-4 text-gray-300">{row.league_count}</td>
                <td className="py-2 pr-4 text-gray-300">{row.paid_entries}</td>
                <td className="py-2 text-green-400 font-medium">${Number(row.revenue).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent payments */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">Recent Payments</h3>
        <div className="overflow-auto max-h-72">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="text-left text-gray-500 border-b border-gray-700">
                <th className="pb-2 pr-4">User</th>
                <th className="pb-2 pr-4">League</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2">Paid At</th>
              </tr>
            </thead>
            <tbody>
              {recentPayments.map(p => (
                <tr key={p.id} className="border-b border-gray-800">
                  <td className="py-1.5 pr-4 text-white">{p.username}</td>
                  <td className="py-1.5 pr-4 text-gray-300 truncate max-w-40">{p.league_name}</td>
                  <td className="py-1.5 pr-4 text-green-400">${Number(p.amount).toFixed(2)}</td>
                  <td className="py-1.5 text-gray-500">{p.paid_at?.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Dev Tools Tab ─────────────────────────────────────────────────────────────

function DevToolsTab() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [sandboxes, setSandboxes] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { fetchSandboxes(); }, []);

  const fetchSandboxes = async () => {
    try {
      const res = await api.get('/superadmin/sandboxes');
      setSandboxes(res.data.sandboxes || []);
    } catch {}
  };

  const createSandbox = async () => {
    setCreating(true);
    setMsg('');
    try {
      const res = await api.post('/superadmin/create-sandbox');
      setMsg(`✓ Sandbox created: ${res.data.leagueName}`);
      fetchSandboxes();
      navigate(`/league/${res.data.leagueId}/draft`);
    } catch (e) {
      setMsg(e.response?.data?.error || 'Failed to create sandbox');
    } finally {
      setCreating(false);
    }
  };

  const deleteSandbox = async (id, name) => {
    if (!window.confirm(`Delete sandbox "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/superadmin/sandbox/${id}`);
      setSandboxes(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Developer Tools header */}
      <div>
        <h2 className="text-white font-bold text-base mb-1">Developer Tools</h2>
        <p className="text-gray-500 text-xs">Sandbox environments are fully isolated from real leagues.</p>
      </div>

      {/* Create sandbox */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-white font-semibold text-sm mb-1">🧪 Test Draft Sandbox</div>
            <div className="text-gray-400 text-xs leading-relaxed">
              Creates an isolated draft with 8 bots (auto-pick by ETP) + your account.<br />
              12 rounds · 30s timer · starts immediately · no real data affected.
            </div>
          </div>
          <button
            onClick={createSandbox}
            disabled={creating}
            className="shrink-0 px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating…' : '+ Test Draft'}
          </button>
        </div>
        {msg && (
          <div className={`mt-3 text-xs font-medium ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
            {msg}
          </div>
        )}
      </div>

      {/* Existing sandboxes */}
      {sandboxes.length > 0 && (
        <div>
          <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Active Sandboxes</h3>
          <div className="space-y-2">
            {sandboxes.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 bg-gray-800/40 border border-gray-700/50 rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded">🧪 TEST</span>
                    <span className="text-white text-sm font-medium truncate">{s.name}</span>
                  </div>
                  <div className="text-gray-500 text-[11px] mt-0.5">
                    {s.member_count} teams · status: {s.status} · {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/league/${s.id}/draft`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Open →
                  </a>
                  <button
                    onClick={() => deleteSandbox(s.id, s.name)}
                    disabled={deleting === s.id}
                    className="px-2.5 py-1 bg-red-900/50 hover:bg-red-800 text-red-400 hover:text-red-200 border border-red-800/50 rounded text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {deleting === s.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sandboxes.length === 0 && (
        <p className="text-gray-600 text-sm text-center py-4">No active sandboxes</p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('Leagues');

  useEffect(() => {
    if (!loading && (!user || user.role !== 'superadmin')) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading || !user) return <Spinner />;
  if (user.role !== 'superadmin') return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-2xl">🛡️</span>
          <div>
            <h1 className="text-xl font-bold">Superadmin Panel</h1>
            <p className="text-xs text-gray-500">TourneyRun platform management</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-6">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >{t}</button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'Leagues'      && <LeaguesTab />}
        {tab === 'Users'        && <UsersTab />}
        {tab === 'Players'      && <PlayersTab />}
        {tab === 'Financials'   && <FinancialsTab />}
        {tab === 'Dev Tools'    && <DevToolsTab />}
      </div>
    </div>
  );
}
