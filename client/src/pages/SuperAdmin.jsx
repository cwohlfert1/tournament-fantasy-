import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import BallLoader from '../components/BallLoader';

const TABS = ['Leagues', 'Users', 'Players', 'Financials', 'Draft Import'];

const LEAGUE_ID = '6ce9da4a-89b1-4d13-ad70-f21e9c0bfe93';

const DRAFT_DATA = {
  leagueId: LEAGUE_ID,
  teams: [
    { ownerName: 'Collin Wohlfert', players: [
      { name: 'Kingston Flemings', school: 'Houston', seed: 2, region: 'South' },
      { name: 'Graham Ike', school: 'Gonzaga', seed: 3, region: 'West' },
      { name: 'Silas Demary Jr.', school: 'UConn', seed: 2, region: 'East' },
      { name: 'Christian Anderson', school: 'Texas Tech', seed: 5, region: 'Midwest' },
      { name: 'Robert Wright III', school: 'BYU', seed: 6, region: 'West' },
      { name: "Ja'Kobi Gillespie", school: 'Tennessee', seed: 6, region: 'Midwest' },
      { name: 'Coen Carr', school: 'Michigan St', seed: 3, region: 'East' },
      { name: 'Tomislav Ivisic', school: 'Illinois', seed: 3, region: 'South' },
      { name: 'Paul McNeil Jr.', school: 'NC State', seed: 11, region: 'West' },
      { name: 'Mason Falslev', school: 'Utah State', seed: 9, region: 'West' },
      { name: 'John Mobley Jr.', school: 'Ohio State', seed: 8, region: 'East' },
      { name: 'Christian Hammond', school: 'Santa Clara', seed: 10, region: 'Midwest' },
    ]},
    { ownerName: 'Jack Wohlfert', players: [
      { name: 'Milan Momcilovic', school: 'Iowa State', seed: 2, region: 'Midwest' },
      { name: 'Emanuel Sharp', school: 'Houston', seed: 2, region: 'South' },
      { name: 'Ivan Kharchenkov', school: 'Arizona', seed: 1, region: 'West' },
      { name: 'Tyler Tanner', school: 'Vanderbilt', seed: 5, region: 'South' },
      { name: 'John Blackwell', school: 'Wisconsin', seed: 5, region: 'West' },
      { name: 'Mikel Brown Jr.', school: 'Louisville', seed: 6, region: 'East' },
      { name: 'Seth Trimble', school: 'North Carolina', seed: 6, region: 'South' },
      { name: 'Tyler Bilodeau', school: 'UCLA', seed: 7, region: 'East' },
      { name: 'Donovan Atwell', school: 'Texas Tech', seed: 5, region: 'Midwest' },
      { name: 'Mikey Lewis', school: "Saint Mary's", seed: 7, region: 'South' },
      { name: 'Larry Johnson', school: 'McNeese', seed: 12, region: 'South' },
      { name: 'Nikolas Khamenia', school: 'Duke', seed: 1, region: 'East' },
    ]},
    { ownerName: 'Garrett Washenko', players: [
      { name: 'Yaxel Lendeborg', school: 'Michigan', seed: 1, region: 'Midwest' },
      { name: 'Boogie Fland', school: 'Florida', seed: 1, region: 'South' },
      { name: 'Solo Ball', school: 'UConn', seed: 2, region: 'East' },
      { name: "Anthony Dell'Orso", school: 'Arizona', seed: 1, region: 'West' },
      { name: 'Trevon Brazile', school: 'Arkansas', seed: 4, region: 'West' },
      { name: 'Chris Cenac Jr.', school: 'Houston', seed: 2, region: 'South' },
      { name: 'Dame Sarr', school: 'Duke', seed: 1, region: 'East' },
      { name: 'Denzel Aberdeen', school: 'Kentucky', seed: 7, region: 'Midwest' },
      { name: 'Izaiyah Nelson', school: 'South Florida', seed: 11, region: 'East' },
      { name: 'AK Okereke', school: 'Vanderbilt', seed: 5, region: 'South' },
      { name: 'Cruz Davis', school: 'Hofstra', seed: 13, region: 'Midwest' },
      { name: 'Tru Washington', school: 'Miami', seed: 7, region: 'West' },
    ]},
    { ownerName: 'Sean Meekins', players: [
      { name: 'Thomas Haugh', school: 'Florida', seed: 1, region: 'South' },
      { name: 'Thijs De Ridder', school: 'Virginia', seed: 3, region: 'Midwest' },
      { name: 'Darryn Peterson', school: 'Kansas', seed: 4, region: 'East' },
      { name: 'Milos Uzan', school: 'Houston', seed: 2, region: 'South' },
      { name: 'Nimari Burnett', school: 'Michigan', seed: 1, region: 'Midwest' },
      { name: 'Oscar Cluff', school: 'Purdue', seed: 2, region: 'West' },
      { name: 'Billy Richmond III', school: 'Arkansas', seed: 4, region: 'West' },
      { name: 'Nasir Whitlock', school: 'Lehigh', seed: 16, region: 'South' },
      { name: 'Bryce Hopkins', school: "St John's", seed: 5, region: 'East' },
      { name: 'Shelton Henderson', school: 'Miami', seed: 7, region: 'West' },
      { name: 'Tramon Mark', school: 'Texas', seed: 11, region: 'West' },
      { name: 'Corey Washington', school: 'SMU', seed: 11, region: 'Midwest' },
    ]},
    { ownerName: 'Austin Helms', players: [
      { name: 'Alex Condon', school: 'Florida', seed: 1, region: 'South' },
      { name: 'Tarris Reed Jr.', school: 'UConn', seed: 2, region: 'East' },
      { name: 'Motiejus Krivas', school: 'Arizona', seed: 1, region: 'West' },
      { name: 'Meleek Thomas', school: 'Arkansas', seed: 4, region: 'West' },
      { name: 'Ryan Conwell', school: 'Louisville', seed: 6, region: 'East' },
      { name: 'Bennett Stirtz', school: 'Iowa', seed: 9, region: 'South' },
      { name: 'Zuby Ejiofor', school: "St John's", seed: 5, region: 'East' },
      { name: 'Blake Buchanan', school: 'Iowa State', seed: 2, region: 'Midwest' },
      { name: 'Tyler Nickel', school: 'Vanderbilt', seed: 5, region: 'South' },
      { name: 'Chance Mallory', school: 'Virginia', seed: 3, region: 'Midwest' },
      { name: 'MJ Collins Jr.', school: 'Utah State', seed: 9, region: 'West' },
      { name: 'Sam Hoiberg', school: 'Nebraska', seed: 4, region: 'South' },
    ]},
    { ownerName: 'Tom Sheehan', players: [
      { name: 'Cameron Boozer', school: 'Duke', seed: 1, region: 'East' },
      { name: 'Xaivian Lee', school: 'Florida', seed: 1, region: 'South' },
      { name: 'Braden Smith', school: 'Purdue', seed: 2, region: 'West' },
      { name: 'Braylon Mullins', school: 'UConn', seed: 2, region: 'East' },
      { name: 'Andrej Stojakovic', school: 'Illinois', seed: 3, region: 'South' },
      { name: 'Tre White', school: 'Kansas', seed: 4, region: 'East' },
      { name: 'Bruce Thornton', school: 'Ohio State', seed: 8, region: 'East' },
      { name: 'Tyon Grant-Foster', school: 'Gonzaga', seed: 3, region: 'West' },
      { name: 'Carson Cooper', school: 'Michigan St', seed: 3, region: 'East' },
      { name: 'C.J. Cox', school: 'Purdue', seed: 2, region: 'West' },
      { name: 'Amari Allen', school: 'Alabama', seed: 4, region: 'Midwest' },
      { name: 'Robbie Avila', school: 'Saint Louis', seed: 9, region: 'Midwest' },
    ]},
    { ownerName: 'Tate Small', players: [
      { name: 'Brayden Burries', school: 'Arizona', seed: 1, region: 'West' },
      { name: 'Tamin Lipsey', school: 'Iowa State', seed: 2, region: 'Midwest' },
      { name: 'Jeremy Fears Jr.', school: 'Michigan St', seed: 3, region: 'East' },
      { name: 'Tre Donaldson', school: 'Miami', seed: 7, region: 'West' },
      { name: 'David Mirkovic', school: 'Illinois', seed: 3, region: 'South' },
      { name: 'Cayden Boozer', school: 'Duke', seed: 1, region: 'East' },
      { name: 'Tavari Johnson', school: 'Akron', seed: 12, region: 'Midwest' },
      { name: 'Darrion Williams', school: 'NC State', seed: 11, region: 'West' },
      { name: 'Braden Frager', school: 'Nebraska', seed: 4, region: 'South' },
      { name: 'Terry Anderson', school: 'High Point', seed: 12, region: 'West' },
      { name: 'Riley Kugel', school: 'UCF', seed: 10, region: 'East' },
      { name: 'Jordan Watford', school: 'Queens', seed: 15, region: 'West' },
    ]},
    { ownerName: 'Patrick Taylor', players: [
      { name: 'Koa Peat', school: 'Arizona', seed: 1, region: 'West' },
      { name: 'Labaron Philon Jr.', school: 'Alabama', seed: 4, region: 'Midwest' },
      { name: 'Rueben Chinyelu', school: 'Florida', seed: 1, region: 'South' },
      { name: 'Trey McKenney', school: 'Michigan', seed: 1, region: 'Midwest' },
      { name: 'Tobe Awaka', school: 'Arizona', seed: 1, region: 'West' },
      { name: 'Nate Ament', school: 'Tennessee', seed: 6, region: 'Midwest' },
      { name: 'Paulius Murauskas', school: "Saint Mary's", seed: 7, region: 'South' },
      { name: 'Melvin Council Jr.', school: 'Kansas', seed: 4, region: 'East' },
      { name: 'Peter Suder', school: 'Miami OH', seed: 11, region: 'Midwest' },
      { name: 'Ven-Allen Lubin', school: 'NC State', seed: 11, region: 'West' },
      { name: 'Dominique Daniels Jr.', school: 'CA Baptist', seed: 13, region: 'East' },
      { name: 'Eian Elmer', school: 'Miami OH', seed: 11, region: 'Midwest' },
    ]},
    { ownerName: 'Alex Manton', players: [
      { name: 'Morez Johnson Jr.', school: 'Michigan', seed: 1, region: 'Midwest' },
      { name: 'Joshua Jefferson', school: 'Iowa State', seed: 2, region: 'Midwest' },
      { name: 'Elliot Cadeau', school: 'Michigan', seed: 1, region: 'Midwest' },
      { name: 'Nick Boyd', school: 'Wisconsin', seed: 5, region: 'West' },
      { name: 'Dailyn Swain', school: 'Texas', seed: 11, region: 'West' },
      { name: 'Jaron Pierre Jr.', school: 'SMU', seed: 11, region: 'Midwest' },
      { name: 'Otega Oweh', school: 'Kentucky', seed: 7, region: 'Midwest' },
      { name: 'Flory Bidunga', school: 'Kansas', seed: 4, region: 'East' },
      { name: 'Brant Byers', school: 'Miami OH', seed: 11, region: 'Midwest' },
      { name: 'Dontae Horne', school: 'Prairie View', seed: 16, region: 'South' },
      { name: 'Aiden Sherrell', school: 'Alabama', seed: 4, region: 'Midwest' },
      { name: "Tai'Reon Joseph", school: 'Prairie View', seed: 16, region: 'South' },
    ]},
    { ownerName: 'Preston Trout', players: [
      { name: 'Darius Acuff Jr.', school: 'Arkansas', seed: 4, region: 'West' },
      { name: 'Keaton Wagler', school: 'Illinois', seed: 3, region: 'South' },
      { name: 'Trey Kaufman-Renn', school: 'Purdue', seed: 2, region: 'West' },
      { name: 'Urban Klavzar', school: 'Florida', seed: 1, region: 'South' },
      { name: 'Duke Miles', school: 'Vanderbilt', seed: 5, region: 'South' },
      { name: 'Malik Thomas', school: 'Virginia', seed: 3, region: 'Midwest' },
      { name: 'Patrick Ngongba II', school: 'Duke', seed: 1, region: 'East' },
      { name: 'Quadir Copeland', school: 'NC State', seed: 11, region: 'West' },
      { name: 'Donovan Dent', school: 'UCLA', seed: 7, region: 'East' },
      { name: 'Joseph Tugler', school: 'Houston', seed: 2, region: 'South' },
      { name: 'Wes Enis', school: 'South Florida', seed: 11, region: 'East' },
      { name: 'Preston Edmead', school: 'Hofstra', seed: 13, region: 'Midwest' },
    ]},
    { ownerName: 'Jon Pack', players: [
      { name: 'Isaiah Evans', school: 'Duke', seed: 1, region: 'East' },
      { name: 'Aday Mara', school: 'Michigan', seed: 1, region: 'Midwest' },
      { name: 'Fletcher Loyer', school: 'Purdue', seed: 2, region: 'West' },
      { name: 'Boopie Miller', school: 'SMU', seed: 11, region: 'Midwest' },
      { name: 'Kylan Boswell', school: 'Illinois', seed: 3, region: 'South' },
      { name: 'Malik Reneau', school: 'Miami', seed: 7, region: 'West' },
      { name: 'Sam Lewis', school: 'Virginia', seed: 3, region: 'Midwest' },
      { name: 'Latrell Wrightsell', school: 'Alabama', seed: 4, region: 'Midwest' },
      { name: 'Jeremiah Wilkinson', school: 'Georgia', seed: 8, region: 'Midwest' },
      { name: 'Nolan Winter', school: 'Wisconsin', seed: 5, region: 'West' },
      { name: "J'Vonne Hadley", school: 'Louisville', seed: 6, region: 'East' },
      { name: 'Malique Ewin', school: 'Arkansas', seed: 4, region: 'West' },
    ]},
    { ownerName: 'Brian Sowinski', players: [
      { name: 'Jaden Bradley', school: 'Arizona', seed: 1, region: 'West' },
      { name: 'AJ Dybantsa', school: 'BYU', seed: 6, region: 'West' },
      { name: 'Pryce Sandfort', school: 'Nebraska', seed: 4, region: 'South' },
      { name: 'Alex Karaban', school: 'UConn', seed: 2, region: 'East' },
      { name: 'Henri Veesaar', school: 'North Carolina', seed: 6, region: 'South' },
      { name: 'Jaxon Kohler', school: 'Michigan St', seed: 3, region: 'East' },
      { name: 'Rienk Mast', school: 'Nebraska', seed: 4, region: 'South' },
      { name: 'Matas Vokietaitis', school: 'Texas', seed: 11, region: 'West' },
      { name: 'Roddy Gayle Jr.', school: 'Michigan', seed: 1, region: 'Midwest' },
      { name: 'Mark Mitchell', school: 'Missouri', seed: 10, region: 'West' },
      { name: 'Jordan Pope', school: 'Texas', seed: 11, region: 'West' },
      { name: 'Killyan Toure', school: 'Iowa State', seed: 2, region: 'Midwest' },
    ]},
  ],
};

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

// ── Draft Import Tab ──────────────────────────────────────────────────────────

function DraftImportTab() {
  const [importing, setImporting]   = useState(false);
  const [result, setResult]         = useState(null);
  const [seeding, setSeeding]       = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [unmatched, setUnmatched]   = useState([]);
  const [mapForm, setMapForm]       = useState({}); // ghostUserId → realUsername
  const [mapBusy, setMapBusy]       = useState('');
  const [mapMsg, setMapMsg]         = useState({});
  const [loadingUM, setLoadingUM]   = useState(false);

  const loadUnmatched = async () => {
    setLoadingUM(true);
    try {
      const res = await api.get(`/admin/import-draft/unmatched/${LEAGUE_ID}`);
      setUnmatched(res.data.unmatched || []);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to load unmatched owners');
    } finally {
      setLoadingUM(false);
    }
  };

  useEffect(() => { loadUnmatched(); }, []);

  const runImport = async (force = false) => {
    const msg = force
      ? 'FORCE re-import: this deletes ALL existing draft picks for this league and re-inserts them. Continue?'
      : 'Run the draft import for the Wohlfert league? This is idempotent — safe to re-run.';
    if (!confirm(msg)) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await api.post('/admin/import-draft', { ...DRAFT_DATA, force });
      setResult(res.data);
      await loadUnmatched();
    } catch (e) {
      alert(e.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const seedMissingPlayers = async () => {
    if (!confirm('Add the 8 missing NC State / Texas players to the DB and insert their picks?')) return;
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await api.post('/admin/import-draft/seed-missing-players', { leagueId: LEAGUE_ID });
      setSeedResult(res.data);
    } catch (e) {
      alert(e.response?.data?.error || 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  const mapOwner = async (ghostUserId) => {
    const realUsername = mapForm[ghostUserId]?.trim();
    if (!realUsername) return;
    setMapBusy(ghostUserId);
    setMapMsg(m => ({ ...m, [ghostUserId]: '' }));
    try {
      const res = await api.post('/admin/import-draft/map-owner', {
        leagueId: LEAGUE_ID,
        ghostUserId,
        realUsername,
      });
      setMapMsg(m => ({ ...m, [ghostUserId]: `✓ Mapped to ${res.data.mapped.to}` }));
      await loadUnmatched();
    } catch (e) {
      setMapMsg(m => ({ ...m, [ghostUserId]: `✗ ${e.response?.data?.error || 'Failed'}` }));
    } finally {
      setMapBusy('');
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Import section */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-1">Wohlfert League Draft Import</h2>
        <p className="text-xs text-gray-400 mb-4">
          League ID: <span className="font-mono text-gray-300">{LEAGUE_ID}</span><br />
          12 teams · 12 rounds · 144 total picks · 4 TBD owners (ghost placeholders)
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => runImport(false)}
            disabled={importing}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Run Import'}
          </button>
          <button
            onClick={() => runImport(true)}
            disabled={importing}
            className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded disabled:opacity-50"
          >
            {importing ? 'Importing…' : '⚠ Force Clear & Re-Import'}
          </button>
          <button
            onClick={seedMissingPlayers}
            disabled={seeding}
            className="px-5 py-2 bg-amber-700 hover:bg-amber-600 text-white text-sm font-semibold rounded disabled:opacity-50"
          >
            {seeding ? 'Seeding…' : 'Seed Missing NC State / Texas Players'}
          </button>
        </div>

        {result && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="text-green-400 font-medium">
              ✓ Import complete — {result.imported} picks inserted, {result.skipped} skipped (already existed)
            </div>
            {result.unmatched?.length > 0 && (
              <div className="text-yellow-400">
                ⚠ Ghost placeholders created for: {result.unmatched.join(', ')}
              </div>
            )}
            {result.playerNotFound?.length > 0 && (
              <div className="bg-red-900/40 border border-red-700 rounded p-3">
                <p className="text-red-300 font-medium mb-1">Players not found ({result.playerNotFound.length}) — use "Seed Missing" button:</p>
                <ul className="text-red-400 text-xs space-y-0.5">
                  {result.playerNotFound.map((p, i) => (
                    <li key={i}>{p.name} ({p.school}) — for {p.ownerName}, pick #{p.pickNumber}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {seedResult && (
          <div className="mt-4 space-y-1 text-sm">
            <div className="text-green-400 font-medium">
              ✓ Seed complete — {seedResult.playersAdded?.length} players added, {seedResult.picksInserted?.length} picks inserted
            </div>
            {seedResult.picksInserted?.map((p, i) => (
              <div key={i} className="text-gray-400 text-xs pl-2">{p}</div>
            ))}
            {seedResult.errors?.length > 0 && (
              <div className="text-red-400 text-xs">{seedResult.errors.join(', ')}</div>
            )}
          </div>
        )}
      </div>

      {/* Owner mapping section */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Map TBD Owners to Real Accounts</h2>
            <p className="text-xs text-gray-400 mt-0.5">Assign a real username/email once they sign up</p>
          </div>
          <button
            onClick={loadUnmatched}
            disabled={loadingUM}
            className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded disabled:opacity-50"
          >
            {loadingUM ? '…' : 'Refresh'}
          </button>
        </div>

        {unmatched.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {loadingUM ? 'Loading…' : 'No unmatched owners — all picks are assigned to real accounts.'}
          </p>
        ) : (
          <div className="space-y-3">
            {unmatched.map(u => (
              <div key={u.user_id} className="bg-gray-700/50 border border-gray-600 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-white font-medium text-sm">{u.pending_owner_name}</p>
                    <p className="text-gray-400 text-xs">Draft position #{u.draft_order} · {u.pick_count} picks</p>
                    <p className="text-gray-500 text-xs font-mono">{u.username}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="username or email"
                      value={mapForm[u.user_id] || ''}
                      onChange={e => setMapForm(f => ({ ...f, [u.user_id]: e.target.value }))}
                      className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 w-48"
                    />
                    <button
                      onClick={() => mapOwner(u.user_id)}
                      disabled={mapBusy === u.user_id || !mapForm[u.user_id]?.trim()}
                      className="px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded disabled:opacity-50"
                    >
                      {mapBusy === u.user_id ? '…' : 'Assign'}
                    </button>
                  </div>
                </div>
                {mapMsg[u.user_id] && (
                  <p className={`text-xs mt-2 ${mapMsg[u.user_id].startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                    {mapMsg[u.user_id]}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
        {tab === 'Draft Import' && <DraftImportTab />}
      </div>
    </div>
  );
}
