import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ children, color = 'gray' }) {
  const styles = {
    gray:   { background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' },
    green:  { background: '#14532d33', color: '#4ade80', border: '1px solid #166534' },
    yellow: { background: '#451a0333', color: '#fbbf24', border: '1px solid #78350f' },
    red:    { background: '#450a0a33', color: '#f87171', border: '1px solid #7f1d1d' },
    blue:   { background: '#1e3a5f33', color: '#60a5fa', border: '1px solid #1e40af' },
    purple: { background: '#2e106533', color: '#a78bfa', border: '1px solid #4c1d95' },
  };
  return (
    <span style={{ ...styles[color], fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function Stat({ label, value, sub, color = '#4ade80' }) {
  return (
    <div style={{ background: '#0a1a0f', border: '1px solid #14532d55', borderRadius: 14, padding: '16px 20px' }}>
      <div style={{ color: '#4b5563', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ color: '#374151', fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Err({ msg }) {
  if (!msg) return null;
  return <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{msg}</div>;
}

function EmptyState({ icon = '⛳', text = 'No data yet' }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: '#374151' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  );
}

const TH = ({ children, right }) => (
  <th style={{ padding: '10px 14px', textAlign: right ? 'right' : 'left', color: '#4b5563', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #111827', whiteSpace: 'nowrap' }}>
    {children}
  </th>
);
const TD = ({ children, right, muted }) => (
  <td style={{ padding: '11px 14px', textAlign: right ? 'right' : 'left', color: muted ? '#4b5563' : '#d1d5db', fontSize: 13, borderBottom: '1px solid #0d1410', whiteSpace: 'nowrap' }}>
    {children}
  </td>
);

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtMoney(n) { return '$' + Number(n || 0).toFixed(2); }

// ── Tab 1: Leagues ────────────────────────────────────────────────────────────

function LeaguesTab() {
  const [leagues, setLeagues]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [err, setErr]               = useState('');
  const [msg, setMsg]               = useState('');

  useEffect(() => {
    api.get('/golf/admin/leagues')
      .then(r => setLeagues(r.data.leagues || []))
      .catch(e => setErr(e.response?.data?.error || 'Load failed'))
      .finally(() => setLoading(false));
  }, []);

  async function doAction(action, id) {
    setErr(''); setMsg('');
    try {
      if (action === 'archive') {
        await api.post(`/golf/admin/leagues/${id}/archive`);
        setLeagues(ls => ls.map(l => l.id === id ? { ...l, status: 'archived' } : l));
        setMsg('League archived.');
      } else if (action === 'sync') {
        await api.post(`/golf/admin/leagues/${id}/sync`);
        setMsg('Sync triggered.');
      } else if (action === 'email') {
        const r = await api.post(`/golf/admin/leagues/${id}/email`);
        setMsg(`Standings email sent to ${r.data.sent} members.`);
      } else if (action === 'delete') {
        await api.delete(`/golf/admin/leagues/${id}`);
        setLeagues(ls => ls.filter(l => l.id !== id));
        setConfirmDel(null);
        setMsg('League deleted.');
      }
    } catch (e) { setErr(e.response?.data?.error || 'Action failed'); }
  }

  function statusColor(s) {
    if (s === 'active' || s === 'completed') return 'green';
    if (s === 'archived') return 'gray';
    return 'yellow';
  }
  function formatLabel(f) {
    if (f === 'pool')        return 'Pool';
    if (f === 'dk')          return 'DFS';
    if (f === 'tourneyrun')  return 'TourneyRun';
    if (f === 'office_pool') return 'Office Pool';
    if (f === 'pickem')      return 'Pick\'em';
    return f || 'TourneyRun';
  }
  function formatColor(f) {
    if (f === 'pool') return 'green';
    if (f === 'dk')   return 'purple';
    return 'blue';
  }

  if (loading) return <EmptyState icon="⏳" text="Loading leagues…" />;

  return (
    <div>
      <Err msg={err} />
      {msg && <div style={{ background: '#14532d33', border: '1px solid #166534', color: '#4ade80', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0d1f0f' }}>
              <TH>League</TH><TH>Commissioner</TH><TH>Format</TH><TH>Status</TH>
              <TH right>Teams</TH><TH right>Buy-in</TH><TH right>Pass Rev</TH>
              <TH right>Comm Rev</TH><TH>Created</TH>
            </tr>
          </thead>
          <tbody>
            {leagues.length === 0 && (
              <tr><td colSpan={9}><EmptyState text="No leagues yet" /></td></tr>
            )}
            {leagues.map(l => (
              <>
                <tr
                  key={l.id}
                  onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                  style={{ cursor: 'pointer', background: expanded === l.id ? '#0d1f0f' : 'transparent' }}
                >
                  <TD><span style={{ color: '#fff', fontWeight: 600 }}>{l.name}</span></TD>
                  <TD muted>{l.commissioner_name}</TD>
                  <TD><Badge color={formatColor(l.format_type)}>{formatLabel(l.format_type)}</Badge></TD>
                  <TD><Badge color={statusColor(l.status)}>{l.status || 'lobby'}</Badge></TD>
                  <TD right>{l.member_count}</TD>
                  <TD right muted>{l.buy_in_amount > 0 ? fmtMoney(l.buy_in_amount) : 'Free'}</TD>
                  <TD right style={{ color: '#4ade80' }}>{fmtMoney(l.season_pass_rev)}</TD>
                  <TD right style={{ color: '#4ade80' }}>{fmtMoney(l.comm_pro_rev)}</TD>
                  <TD muted>{fmt(l.created_at)}</TD>
                </tr>
                {expanded === l.id && (
                  <tr key={l.id + '-exp'}>
                    <td colSpan={9} style={{ background: '#080f09', padding: '16px 20px', borderBottom: '1px solid #111827' }}>
                      {/* Members */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ color: '#4b5563', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Members</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {(l.members || []).map(m => (
                            <div key={m.user_id} style={{ background: '#0a1a0f', border: '1px solid #14532d33', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                              <span style={{ color: '#d1d5db', fontWeight: 600 }}>{m.team_name}</span>
                              <span style={{ color: '#4b5563' }}> ({m.username})</span>
                              <span style={{ color: '#4ade80', marginLeft: 8 }}>{Number(m.season_points || 0).toFixed(1)} pts</span>
                            </div>
                          ))}
                          {(l.members || []).length === 0 && <span style={{ color: '#374151', fontSize: 12 }}>No members</span>}
                        </div>
                      </div>
                      {/* Actions */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {[
                          { label: '⚡ Force Sync',       action: 'sync',    color: '#1e3a5f', textColor: '#60a5fa' },
                          { label: '📧 Send Standings',   action: 'email',   color: '#14532d', textColor: '#4ade80' },
                          { label: '📦 Archive',          action: 'archive', color: '#1f2937', textColor: '#9ca3af' },
                          { label: '🗑 Delete',           action: 'delete',  color: '#450a0a', textColor: '#f87171' },
                        ].map(({ label, action, color, textColor }) => (
                          <button key={action}
                            onClick={e => { e.stopPropagation(); action === 'delete' ? setConfirmDel(l.id) : doAction(action, l.id); }}
                            style={{ background: color, color: textColor, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            {label}
                          </button>
                        ))}
                        <Link to={`/golf/league/${l.id}`}
                          style={{ background: '#14532d', color: '#4ade80', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}
                        >
                          View League →
                        </Link>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#0a1a0f', border: '1px solid #7f1d1d', borderRadius: 16, padding: '28px 24px', maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ color: '#fff', margin: '0 0 8px', fontWeight: 800 }}>Delete league?</h3>
            <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 20px' }}>This removes all members and data. Cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '9px 20px', background: '#1f2937', color: '#9ca3af', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => doAction('delete', confirmDel)} style={{ padding: '9px 20px', background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Users ──────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers]   = useState([]);
  const [q, setQ]           = useState('');
  const [loading, setLoad]  = useState(true);
  const [err, setErr]       = useState('');
  const [msg, setMsg]       = useState('');
  const [tempPw, setTempPw] = useState(null);

  useEffect(() => {
    api.get('/golf/admin/users')
      .then(r => setUsers(r.data.users || []))
      .catch(e => setErr(e.response?.data?.error || 'Load failed'))
      .finally(() => setLoad(false));
  }, []);

  async function doAction(action, id) {
    setErr(''); setMsg('');
    try {
      if (action === 'ban') {
        const r = await api.post(`/golf/admin/users/${id}/ban`);
        setUsers(us => us.map(u => u.id === id ? { ...u, role: r.data.role } : u));
        setMsg(`User ${r.data.role === 'banned' ? 'banned' : 'unbanned'}.`);
      } else if (action === 'reset') {
        const r = await api.post(`/golf/admin/users/${id}/reset-password`);
        setTempPw(r.data.tempPassword);
      } else if (action === 'delete') {
        await api.delete(`/golf/admin/users/${id}`);
        setUsers(us => us.filter(u => u.id !== id));
        setMsg('User removed from golf platform.');
      }
    } catch (e) { setErr(e.response?.data?.error || 'Action failed'); }
  }

  const filtered = users.filter(u =>
    !q || u.username?.toLowerCase().includes(q.toLowerCase()) ||
          u.email?.toLowerCase().includes(q.toLowerCase())
  );

  function ageFromDob(dob) {
    if (!dob) return '—';
    return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
  }

  if (loading) return <EmptyState icon="⏳" text="Loading users…" />;

  return (
    <div>
      <Err msg={err} />
      {msg && <div style={{ background: '#14532d33', border: '1px solid #166534', color: '#4ade80', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{msg}</div>}
      {tempPw && (
        <div style={{ background: '#1e3a5f33', border: '1px solid #1e40af', color: '#60a5fa', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          Temp password: <strong style={{ fontFamily: 'monospace' }}>{tempPw}</strong>
          <button onClick={() => setTempPw(null)} style={{ marginLeft: 12, color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>×</button>
        </div>
      )}

      <input
        value={q} onChange={e => setQ(e.target.value)}
        placeholder="Search username or email…"
        style={{ background: '#111', border: '1px solid #1f2937', color: '#d1d5db', borderRadius: 10, padding: '9px 14px', fontSize: 13, width: '100%', maxWidth: 320, marginBottom: 16 }}
      />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0d1f0f' }}>
              <TH>Username</TH><TH>Email</TH><TH>Gender</TH><TH>DOB</TH>
              <TH right>Age</TH><TH>Role</TH><TH right>Leagues</TH>
              <TH>Pass</TH><TH>Joined</TH><TH>Actions</TH>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10}><EmptyState text="No users found" /></td></tr>}
            {filtered.map(u => (
              <tr key={u.id}>
                <TD><span style={{ color: '#fff', fontWeight: 600 }}>{u.username}</span></TD>
                <TD muted>{u.email}</TD>
                <TD muted>{u.gender?.replace(/_/g, ' ') || '—'}</TD>
                <TD muted>{u.dob || '—'}</TD>
                <TD right muted>{ageFromDob(u.dob)}</TD>
                <TD>
                  {u.role === 'superadmin' ? <Badge color="purple">Superadmin</Badge>
                   : u.role === 'banned'   ? <Badge color="red">Banned</Badge>
                   :                         <Badge>User</Badge>}
                </TD>
                <TD right>{u.league_count}</TD>
                <TD>{u.season_pass_paid ? <Badge color="green">✓</Badge> : <Badge color="gray">—</Badge>}</TD>
                <TD muted>{fmt(u.created_at)}</TD>
                <TD>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => doAction('reset', u.id)} style={{ background: '#1e3a5f', color: '#60a5fa', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Reset PW</button>
                    {u.role !== 'superadmin' && (
                      <button onClick={() => doAction('ban', u.id)} style={{ background: '#451a03', color: '#fbbf24', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                        {u.role === 'banned' ? 'Unban' : 'Ban'}
                      </button>
                    )}
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab 3: Players ────────────────────────────────────────────────────────────

function PlayersTab() {
  const [players, setPlayers]   = useState([]);
  const [q, setQ]               = useState('');
  const [tierFilter, setTier]   = useState('');
  const [loading, setLoad]      = useState(true);
  const [editId, setEditId]     = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ name: '', country: 'USA', world_ranking: '', salary: 200 });
  const [err, setErr]           = useState('');
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    api.get('/golf/admin/players')
      .then(r => setPlayers(r.data.players || []))
      .catch(e => setErr(e.response?.data?.error || 'Load failed'))
      .finally(() => setLoad(false));
  }, []);

  function tier(salary) {
    if (salary >= 500) return { label: 'Elite',   color: 'yellow'  };
    if (salary >= 350) return { label: 'Premium', color: 'purple'  };
    if (salary >= 250) return { label: 'Mid',     color: 'blue'    };
    if (salary >= 150) return { label: 'Value',   color: 'green'   };
    return                     { label: 'Sleeper', color: 'gray'   };
  }

  async function saveEdit(id) {
    setErr('');
    try {
      const r = await api.put(`/golf/admin/players/${id}`, editForm);
      setPlayers(ps => ps.map(p => p.id === id ? { ...p, ...r.data.player } : p));
      setEditId(null);
      setMsg('Player updated.');
    } catch (e) { setErr(e.response?.data?.error || 'Update failed'); }
  }

  async function addPlayer() {
    setErr('');
    try {
      const r = await api.post('/golf/admin/players', addForm);
      setPlayers(ps => [...ps, { ...r.data.player, season_pts: 0 }]);
      setShowAdd(false);
      setAddForm({ name: '', country: 'USA', world_ranking: '', salary: 200 });
      setMsg('Player added.');
    } catch (e) { setErr(e.response?.data?.error || 'Add failed'); }
  }

  async function deactivate(id) {
    await api.delete(`/golf/admin/players/${id}`).catch(() => {});
    setPlayers(ps => ps.map(p => p.id === id ? { ...p, is_active: 0 } : p));
  }

  const filtered = players.filter(p => {
    const matchQ = !q || p.name?.toLowerCase().includes(q.toLowerCase());
    const matchTier = !tierFilter || tier(p.salary).label === tierFilter;
    return matchQ && matchTier;
  });

  const inputStyle = { background: '#111', border: '1px solid #1f2937', color: '#d1d5db', borderRadius: 6, padding: '5px 8px', fontSize: 12, width: 80 };

  if (loading) return <EmptyState icon="⏳" text="Loading players…" />;

  return (
    <div>
      <Err msg={err} />
      {msg && <div style={{ background: '#14532d33', border: '1px solid #166634', color: '#4ade80', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…"
          style={{ background: '#111', border: '1px solid #1f2937', color: '#d1d5db', borderRadius: 10, padding: '9px 14px', fontSize: 13, flex: 1, minWidth: 180 }} />
        <select value={tierFilter} onChange={e => setTier(e.target.value)}
          style={{ background: '#111', border: '1px solid #1f2937', color: '#d1d5db', borderRadius: 10, padding: '9px 14px', fontSize: 13 }}>
          <option value="">All tiers</option>
          {['Elite','Premium','Mid','Value','Sleeper'].map(t => <option key={t}>{t}</option>)}
        </select>
        <button onClick={() => setShowAdd(true)}
          style={{ background: '#22c55e', color: '#001a0d', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#16a34a'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#22c55e'; }}>
          + Add Player
        </button>
      </div>

      {showAdd && (
        <div style={{ background: '#0a1a0f', border: '1px solid #166634', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <h4 style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Add New Player</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            {[['Name','name','text','200'],['Country','country','text','100'],['Ranking','world_ranking','number','80'],['Salary','salary','number','80']].map(([label, key, type]) => (
              <div key={key}>
                <div style={{ color: '#4b5563', fontSize: 11, marginBottom: 4 }}>{label}</div>
                <input type={type} value={addForm[key]} onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ background: '#111', border: '1px solid #1f2937', color: '#d1d5db', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addPlayer} style={{ background: '#22c55e', color: '#001a0d', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#16a34a'; }} onMouseLeave={e => { e.currentTarget.style.background = '#22c55e'; }}>Add</button>
            <button onClick={() => setShowAdd(false)} style={{ background: '#1f2937', color: '#9ca3af', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0d1f0f' }}>
              <TH>Name</TH><TH>Country</TH><TH right>Rank</TH><TH right>Salary</TH>
              <TH>Tier</TH><TH right>Season Pts</TH><TH>Status</TH><TH>Actions</TH>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8}><EmptyState text="No players found" /></td></tr>}
            {filtered.map(p => {
              const t = tier(p.salary);
              const isEditing = editId === p.id;
              return (
                <tr key={p.id} style={{ opacity: p.is_active ? 1 : 0.4 }}>
                  <TD>
                    {isEditing
                      ? <input value={editForm.name ?? p.name} onChange={e => setEditForm(f => ({...f,name:e.target.value}))} style={{...inputStyle,width:140}}/>
                      : <span style={{ color: '#fff', fontWeight: 600 }}>{p.name}</span>}
                  </TD>
                  <TD muted>{p.country}</TD>
                  <TD right muted>
                    {isEditing
                      ? <input type="number" value={editForm.world_ranking ?? p.world_ranking} onChange={e => setEditForm(f => ({...f,world_ranking:e.target.value}))} style={inputStyle}/>
                      : p.world_ranking || '—'}
                  </TD>
                  <TD right>
                    {isEditing
                      ? <input type="number" value={editForm.salary ?? p.salary} onChange={e => setEditForm(f => ({...f,salary:e.target.value}))} style={inputStyle}/>
                      : <span style={{ color: '#4ade80', fontWeight: 700 }}>${p.salary}</span>}
                  </TD>
                  <TD><Badge color={t.color}>{t.label}</Badge></TD>
                  <TD right muted>{Number(p.season_pts || 0).toFixed(1)}</TD>
                  <TD><Badge color={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'Active' : 'Inactive'}</Badge></TD>
                  <TD>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(p.id)} style={{ background: '#14532d', color: '#4ade80', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>Save</button>
                          <button onClick={() => setEditId(null)} style={{ background: '#1f2937', color: '#9ca3af', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditId(p.id); setEditForm({}); }} style={{ background: '#1e3a5f', color: '#60a5fa', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                          {p.is_active ? <button onClick={() => deactivate(p.id)} style={{ background: '#450a0a', color: '#f87171', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Deactivate</button> : null}
                        </>
                      )}
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Ambassador Codes sub-component ───────────────────────────────────────────

function AmbassadorCodes() {
  const [codes, setCodes]               = useState([]);
  const [monthStats, setMonthStats]     = useState(null);
  const [expanded, setExpanded]         = useState(null); // code id → uses array
  const [expandedUses, setExpandedUses] = useState({});   // id → uses[]
  const [showCreate, setShowCreate]     = useState(false);
  const [qrModal, setQrModal]           = useState(null); // { id, code, referralUrl, blobUrl }
  const [qrLoading, setQrLoading]       = useState(false);
  const [err, setErr]                   = useState('');
  const [saving, setSaving]             = useState(false);
  const [form, setForm] = useState({
    code: '', ambassador_name: '', ambassador_email: '',
    discount_type: 'free', discount_value: 100, active: true,
  });

  const BASE_URL = 'https://www.tourneyrun.app';

  function load() {
    api.get('/golf/admin/promo-codes')
      .then(r => { setCodes(r.data.codes || []); setMonthStats(r.data.monthStats); })
      .catch(e => setErr(e.response?.data?.error || 'Load failed'));
  }
  useEffect(load, []);

  function suggestCode(name) {
    const parts = name.trim().split(/\s+/);
    const first = (parts[0] || '').toUpperCase().slice(0, 8);
    const num = Math.floor(Math.random() * 90) + 10;
    return first + num;
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await api.post('/golf/admin/promo-codes', form);
      setShowCreate(false);
      setForm({ code: '', ambassador_name: '', ambassador_email: '', discount_type: 'free', discount_value: 100, active: true });
      load();
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Failed to create code');
    } finally { setSaving(false); }
  }

  async function toggleActive(c) {
    try {
      await api.patch(`/golf/admin/promo-codes/${c.id}`, { active: !c.active });
      load();
    } catch (ex) { setErr(ex.response?.data?.error || 'Failed'); }
  }

  async function deleteCode(id) {
    if (!window.confirm('Delete this promo code and all its use records?')) return;
    try {
      await api.delete(`/golf/admin/promo-codes/${id}`);
      load();
    } catch (ex) { setErr(ex.response?.data?.error || 'Failed'); }
  }

  async function loadUses(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (expandedUses[id]) return;
    try {
      const r = await api.get(`/golf/admin/promo-codes/${id}/uses`);
      setExpandedUses(u => ({ ...u, [id]: r.data.uses || [] }));
    } catch (_) {}
  }

  async function openQr(c) {
    const referralUrl = `${BASE_URL}/golf/create?promo=${encodeURIComponent(c.code)}`;
    setQrModal({ id: c.id, code: c.code, referralUrl, blobUrl: null });
    setQrLoading(true);
    try {
      // Fetch via axios so the JWT auth header is sent
      const res = await api.get(`/golf/admin/promo-codes/${c.id}/qr`, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(res.data);
      setQrModal(m => m ? { ...m, blobUrl } : null);
    } catch (e) {
      setErr('Failed to load QR code');
    } finally {
      setQrLoading(false);
    }
  }

  const discountLabel = c => c.discount_type === 'free'
    ? 'Free (100%)'
    : `${c.discount_value}% off`;

  const inputStyle = { background: '#0d1a0e', border: '1px solid #1a3320', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 13, width: '100%', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { color: '#6b7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 };

  return (
    <div>
      <Err msg={err} />

      {/* Stats row */}
      {monthStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
          <Stat label="Active Codes"      value={monthStats.activeCodes}   color="#4ade80" />
          <Stat label="Uses This Month"   value={monthStats.usesThisMonth} color="#4ade80" />
          <Stat label="Total Discounts Given" value={`$${Number(monthStats.discountsGiven || 0).toFixed(2)}`} color="#fbbf24" />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h4 style={{ margin: 0, color: '#fff', fontSize: 14, fontWeight: 700 }}>Ambassador Codes</h4>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + Create Code
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div style={{ background: '#0a1a0f', border: '1px solid #14532d', borderRadius: 20, padding: 32, width: '100%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 24px', color: '#fff', fontSize: 18, fontWeight: 800 }}>Create Ambassador Code</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Ambassador Name *</label>
                <input style={inputStyle} required value={form.ambassador_name}
                  onChange={e => {
                    const n = e.target.value;
                    setForm(f => ({ ...f, ambassador_name: n, code: f.code || suggestCode(n) }));
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Ambassador Email</label>
                <input style={inputStyle} type="email" value={form.ambassador_email}
                  onChange={e => setForm(f => ({ ...f, ambassador_email: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Code *</label>
                <input style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}
                  required value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. JAKE10"
                />
                <div style={{ color: '#374151', fontSize: 11, marginTop: 4 }}>URL: tourneyrun.app/golf/create?promo={form.code || 'CODE'}</div>
              </div>
              <div>
                <label style={labelStyle}>Discount Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { value: 'free',    label: 'Free First Pool' },
                    { value: 'percent', label: 'Custom %' },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm(f => ({ ...f, discount_type: opt.value, discount_value: opt.value === 'free' ? 100 : 50 }))}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${form.discount_type === opt.value ? '#22c55e' : '#1a3320'}`, background: form.discount_type === opt.value ? 'rgba(34,197,94,0.1)' : 'transparent', color: form.discount_type === opt.value ? '#4ade80' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              {form.discount_type === 'percent' && (
                <div>
                  <label style={labelStyle}>Discount % (1–100)</label>
                  <input style={inputStyle} type="number" min="1" max="100"
                    value={form.discount_value}
                    onChange={e => setForm(f => ({ ...f, discount_value: parseInt(e.target.value) || 50 }))}
                  />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Active</label>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  style={{ width: 40, height: 22, borderRadius: 11, border: 'none', background: form.active ? '#16a34a' : '#374151', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                >
                  <span style={{ position: 'absolute', top: 3, left: form.active ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >{saving ? 'Creating…' : 'Create Code'}</button>
                <button type="button" onClick={() => setShowCreate(false)}
                  style={{ flex: 1, background: 'transparent', color: '#6b7280', border: '1px solid #1a3320', borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR code modal */}
      {qrModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { if (qrModal.blobUrl) URL.revokeObjectURL(qrModal.blobUrl); setQrModal(null); } }}
        >
          <div style={{ background: '#0a1a0f', border: '1px solid #14532d', borderRadius: 20, padding: 32, width: '100%', maxWidth: 380, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: 18, fontWeight: 800 }}>Card Assets — {qrModal.code}</h3>
            <p style={{ color: '#6b7280', fontSize: 12, margin: '0 0 20px', wordBreak: 'break-all' }}>{qrModal.referralUrl}</p>
            <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, display: 'inline-block', minWidth: 200, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {qrLoading && <span style={{ color: '#6b7280', fontSize: 13 }}>Generating…</span>}
              {!qrLoading && qrModal.blobUrl && (
                <img src={qrModal.blobUrl} alt={`QR for ${qrModal.code}`} style={{ width: 200, height: 200, display: 'block' }} />
              )}
              {!qrLoading && !qrModal.blobUrl && <span style={{ color: '#f87171', fontSize: 13 }}>Failed to load</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {qrModal.blobUrl && (
                <a
                  href={qrModal.blobUrl}
                  download={`qr-${qrModal.code}.png`}
                  style={{ background: '#16a34a', color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700 }}
                >Download QR PNG</a>
              )}
              <button
                onClick={() => { navigator.clipboard.writeText(qrModal.referralUrl); }}
                style={{ background: 'transparent', color: '#6b7280', border: '1px solid #1a3320', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >Copy URL</button>
              <button onClick={() => { if (qrModal.blobUrl) URL.revokeObjectURL(qrModal.blobUrl); setQrModal(null); }}
                style={{ background: 'transparent', color: '#6b7280', border: '1px solid #1a3320', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Codes table */}
      {codes.length === 0 ? (
        <EmptyState icon="🏷️" text="No ambassador codes yet — create one above" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#080f09', borderRadius: 12, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#0d1f0f' }}>
                <TH>Code</TH><TH>Ambassador</TH><TH>Discount</TH>
                <TH right>Uses</TH><TH>Status</TH><TH>Created</TH><TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {codes.map(c => (
                <>
                  <tr key={c.id}>
                    <TD>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#4ade80', fontSize: 14, letterSpacing: '0.05em' }}>{c.code}</span>
                    </TD>
                    <TD>
                      <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{c.ambassador_name || '—'}</div>
                      {c.ambassador_email && <div style={{ color: '#374151', fontSize: 11 }}>{c.ambassador_email}</div>}
                    </TD>
                    <TD muted>{discountLabel(c)}</TD>
                    <TD right>
                      <button
                        onClick={() => loadUses(c.id)}
                        style={{ background: 'transparent', border: 'none', color: c.uses_count_live > 0 ? '#60a5fa' : '#4b5563', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: c.uses_count_live > 0 ? 'underline' : 'none' }}
                      >
                        {c.uses_count_live}
                      </button>
                    </TD>
                    <TD>
                      <button
                        onClick={() => toggleActive(c)}
                        style={{ background: c.active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: c.active ? '#4ade80' : '#f87171', border: `1px solid ${c.active ? '#166534' : '#7f1d1d'}`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {c.active ? 'Active' : 'Inactive'}
                      </button>
                    </TD>
                    <TD muted>{fmt(c.created_at)}</TD>
                    <TD>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => openQr(c)}
                          style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid #1e40af44', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >QR / Card</button>
                        <button
                          onClick={() => deleteCode(c.id)}
                          style={{ background: 'transparent', color: '#6b7280', border: '1px solid #1a2520', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        >Delete</button>
                      </div>
                    </TD>
                  </tr>
                  {expanded === c.id && (
                    <tr key={`${c.id}-uses`}>
                      <td colSpan={7} style={{ background: '#060e07', padding: '0 0 0 20px' }}>
                        {!expandedUses[c.id] ? (
                          <div style={{ padding: '14px 14px', color: '#374151', fontSize: 13 }}>Loading…</div>
                        ) : expandedUses[c.id].length === 0 ? (
                          <div style={{ padding: '14px 14px', color: '#374151', fontSize: 13 }}>No uses yet.</div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr><TH>User</TH><TH>League</TH><TH right>Original</TH><TH right>Discount</TH><TH right>Paid</TH><TH>Date</TH></tr>
                            </thead>
                            <tbody>
                              {expandedUses[c.id].map(u => (
                                <tr key={u.id}>
                                  <TD><span style={{ color: '#fff', fontWeight: 600 }}>{u.username || u.user_id}</span><br /><span style={{ color: '#374151', fontSize: 11 }}>{u.email}</span></TD>
                                  <TD muted>{u.league_name || '—'}</TD>
                                  <TD right muted>${Number(u.original_price).toFixed(2)}</TD>
                                  <TD right><span style={{ color: '#fbbf24' }}>−${Number(u.discount_amount).toFixed(2)}</span></TD>
                                  <TD right><span style={{ color: '#4ade80', fontWeight: 700 }}>${Number(u.final_price).toFixed(2)}</span></TD>
                                  <TD muted>{fmt(u.used_at)}</TD>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Financials ─────────────────────────────────────────────────────────

function FinancialsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoad] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/golf/admin/financials')
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.error || 'Load failed'))
      .finally(() => setLoad(false));
  }, []);

  if (loading) return <EmptyState icon="⏳" text="Loading financials…" />;
  if (!data)   return <Err msg={err} />;
  const { summary, revenueByFormat, recentPayments, referralStats } = data;

  return (
    <div className="space-y-6">
      <Err msg={err} />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        <Stat label="Total Golf Revenue" value={fmtMoney(summary.totalRev)} color="#4ade80" />
        <Stat label="Season Pass Rev"    value={fmtMoney(summary.seasonPassRev)} sub={`${summary.seasonPassCount} × $4.99`} />
        <Stat label="Office Pool Rev"    value={fmtMoney(summary.poolEntryRev)}  sub={`${summary.poolEntryCount} × $0.99`} />
        <Stat label="Comm Pro Rev"       value={fmtMoney(summary.commProRev)}    sub={`${summary.commProCount} paid`} />
        <Stat label="Active Leagues"     value={summary.activeLeagues} color="#60a5fa" />
        <Stat label="Total Golf Users"   value={summary.totalUsers}   color="#60a5fa" />
        <Stat label="Promo Leagues"      value={summary.promoCount}   color="#fbbf24" sub="Bring Your League" />
        <Stat label="Referral Credits $" value={fmtMoney(summary.referralCredits)} color="#a78bfa" />
      </div>

      {/* Revenue by product */}
      <div>
        <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Revenue by Product</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#080f09', borderRadius: 12, overflow: 'hidden' }}>
            <thead><tr style={{ background: '#0d1f0f' }}><TH>Product</TH><TH right>Units</TH><TH right>Unit Price</TH><TH right>Total</TH></tr></thead>
            <tbody>
              {[
                { name: 'Season Pass',       units: summary.seasonPassCount, price: 4.99,  rev: summary.seasonPassRev  },
                { name: 'Office Pool Entry', units: summary.poolEntryCount,  price: 0.99,  rev: summary.poolEntryRev  },
                { name: 'Commissioner Pro',  units: summary.commProCount,    price: 19.99, rev: summary.commProRev    },
              ].map(r => (
                <tr key={r.name}>
                  <TD>{r.name}</TD><TD right muted>{r.units}</TD>
                  <TD right muted>{fmtMoney(r.price)}</TD>
                  <TD right><span style={{ color: '#4ade80', fontWeight: 700 }}>{fmtMoney(r.rev)}</span></TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revenue by format */}
      {revenueByFormat.length > 0 && (
        <div>
          <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>By Format</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#080f09' }}>
              <thead><tr style={{ background: '#0d1f0f' }}><TH>Format</TH><TH right>Leagues</TH><TH right>Players</TH></tr></thead>
              <tbody>
                {revenueByFormat.map(r => (
                  <tr key={r.format}><TD>{r.format || 'TourneyRun'}</TD><TD right muted>{r.leagues}</TD><TD right muted>{r.players}</TD></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent payments */}
      <div>
        <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Payments</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#080f09' }}>
            <thead><tr style={{ background: '#0d1f0f' }}><TH>User</TH><TH>Product</TH><TH right>Amount</TH><TH>League / Tourn</TH><TH>Paid At</TH></tr></thead>
            <tbody>
              {recentPayments.length === 0 && <tr><td colSpan={5}><EmptyState text="No payments yet" /></td></tr>}
              {recentPayments.map((p, i) => (
                <tr key={i}>
                  <TD><span style={{ color: '#fff', fontWeight: 600 }}>{p.username}</span></TD>
                  <TD muted>{p.product}</TD>
                  <TD right><span style={{ color: '#4ade80', fontWeight: 700 }}>{fmtMoney(p.amount)}</span></TD>
                  <TD muted>{p.league_name || '—'}</TD>
                  <TD muted>{fmt(p.paid_at)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ambassador / Promo Codes */}
      <div style={{ borderTop: '1px solid #111827', paddingTop: 24 }}>
        <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Ambassador Codes</h3>
        <AmbassadorCodes />
      </div>

      {/* Referral program */}
      <div>
        <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Referral Program</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
          <Stat label="Codes Issued"   value={referralStats.codesIssued}   color="#a78bfa" />
          <Stat label="Redemptions"    value={referralStats.redemptions}   color="#a78bfa" />
          <Stat label="Credits Earned" value={fmtMoney(referralStats.creditsEarned)} color="#a78bfa" />
          <Stat label="Credits Used"   value={referralStats.creditsUsed}   color="#a78bfa" />
        </div>
        {referralStats.topReferrers.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#080f09' }}>
              <thead><tr style={{ background: '#0d1f0f' }}><TH>Username</TH><TH right>Referrals</TH><TH right>Credits Earned</TH></tr></thead>
              <tbody>
                {referralStats.topReferrers.map(r => (
                  <tr key={r.username}>
                    <TD><span style={{ fontWeight: 600, color: '#fff' }}>{r.username}</span></TD>
                    <TD right muted>{r.referral_count}</TD>
                    <TD right><span style={{ color: '#a78bfa', fontWeight: 700 }}>{fmtMoney(r.credits_earned)}</span></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 5: Dev Tools ──────────────────────────────────────────────────────────

function DevToolsTab() {
  const [health, setHealth]         = useState(null);
  const [tournaments, setTourneys]  = useState([]);
  const [selectedT, setSelectedT]   = useState('');
  const [results, setResults]       = useState({});
  const [loading, setLoading]       = useState({});
  const [valsparModal, setValsparModal] = useState(null); // { inviteCode, leagueName, tournament, botsAdded, playersAssigned }
  const [copied, setCopied]         = useState(false);
  const [readiness, setReadiness]   = useState(null);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/golf/admin/dev/db-health').then(r => setHealth(r.data)).catch(() => {});
    api.get('/golf/tournaments').then(r => {
      const ts = (r.data.tournaments || []).filter(t => t.status !== 'completed');
      setTourneys(ts);
      if (ts.length > 0) setSelectedT(ts[0].id);
    }).catch(() => {});
  }, []);

  async function run(action) {
    setLoading(l => ({ ...l, [action]: true }));
    setResults(r => ({ ...r, [action]: null }));
    try {
      let res;
      if (action === 'sync')       res = await api.post(`/golf/admin/dev/sync/${selectedT}`);
      if (action === 'email')      res = await api.post('/golf/admin/dev/test-email');
      if (action === 'sandbox')    res = await api.post('/golf/admin/sandbox/auction-draft');
      if (action === 'valspar')    res = await api.post('/golf/admin/dev/create-valspar-test-pool');
      if (action === 'syncTiers')     res = await api.post('/golf/admin/dev/sync-pool-tiers');
      if (action === 'syncEspnField') res = await api.post('/golf/admin/dev/sync-espn-field', { tournament_id: selectedT });
      setResults(r => ({ ...r, [action]: res?.data }));
      if (action === 'sandbox' && res?.data?.url) navigate(res.data.url);
      if (action === 'valspar' && res?.data?.success) setValsparModal(res.data);
    } catch (e) {
      setResults(r => ({ ...r, [action]: { error: e.response?.data?.error || 'Failed' } }));
    }
    setLoading(l => ({ ...l, [action]: false }));
  }

  function copyInviteCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function Result({ action }) {
    const r = results[action];
    if (!r) return null;
    if (r.error) return <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>⚠ {r.error}</div>;
    if (action === 'syncTiers' && r.results) {
      return (
        <div style={{ marginTop: 8 }}>
          {r.results.map((row, i) => (
            <div key={i} style={{ color: row.skipped ? '#fbbf24' : '#4ade80', fontSize: 12, lineHeight: 1.6 }}>
              {row.skipped ? `⚠ ${row.league}: ${row.skipped}` : `✓ ${row.league}: ${row.players_assigned} players`}
            </div>
          ))}
        </div>
      );
    }
    if (action === 'syncEspnField' && r.field_size != null) {
      return (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#4ade80', fontSize: 12, lineHeight: 1.6 }}>
            ✓ {r.tournament}: {r.field_size} players{r.odds_fetched ? `, ${r.odds_fetched} odds` : ''}
          </div>
          {(r.leagues_rebuilt || []).map((row, i) => (
            <div key={i} style={{ color: row.skipped ? '#fbbf24' : '#60a5fa', fontSize: 12, lineHeight: 1.6, paddingLeft: 10 }}>
              {row.skipped ? `⚠ ${row.league}: ${row.skipped}` : `↳ ${row.league}: ${row.players_assigned} assigned`}
            </div>
          ))}
        </div>
      );
    }
    return <div style={{ color: '#4ade80', fontSize: 12, marginTop: 6 }}>✓ {r.message || r.sentTo || 'Done'}</div>;
  }

  const toolCard = (icon, title, desc, action, content, accentColor = '#0a1a0f', borderColor = '#14532d33') => (
    <div style={{ background: accentColor, border: `1px solid ${borderColor}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      <h4 style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>{title}</h4>
      <p style={{ color: '#4b5563', fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>{desc}</p>
      {content}
      <Result action={action} />
    </div>
  );

  return (
    <>
      {/* ── Valspar success modal ── */}
      {valsparModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }} onClick={() => setValsparModal(null)}>
          <div style={{
            background: '#111827', border: '1px solid #f59e0b44',
            borderRadius: 20, padding: 32, maxWidth: 460, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏌️</div>
            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 4px' }}>
              Valspar Pool Created!
            </h3>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>
              {valsparModal.tournament} · {valsparModal.leagueName}
            </p>

            <div style={{ background: '#0d1117', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Invite Code
              </div>
              <div style={{ color: '#f59e0b', fontSize: 32, fontWeight: 900, letterSpacing: '0.12em', fontFamily: 'monospace' }}>
                {valsparModal.inviteCode}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[
                { label: 'Bots added', value: valsparModal.botsAdded },
                { label: 'Players assigned', value: valsparModal.playersAssigned },
                { label: 'Tiers', value: valsparModal.tiersConfigured },
              ].map(({ label, value }) => (
                <div key={label} style={{ flex: 1, background: '#1f2937', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ color: '#f59e0b', fontSize: 20, fontWeight: 900 }}>{value}</div>
                  <div style={{ color: '#4b5563', fontSize: 11 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => copyInviteCode(valsparModal.inviteCode)}
                style={{
                  flex: 1, background: copied ? '#16a34a' : '#f59e0b',
                  color: copied ? '#fff' : '#000',
                  border: 'none', borderRadius: 10, padding: '11px 0',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {copied ? '✓ Copied!' : 'Copy Invite Code'}
              </button>
              <button
                onClick={() => setValsparModal(null)}
                style={{
                  background: '#1f2937', color: '#9ca3af',
                  border: 'none', borderRadius: 10, padding: '11px 18px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', sm: 'grid-cols-2', gap: 16 }} className="sm:grid-cols-2">
        {toolCard('⛳🏆', 'Valspar Test Pool',
          'Sets up Beta Group 1.0 as a Valspar Championship pool with 50 bots and open invite. Idempotent — safe to run multiple times.',
          'valspar',
          <button onClick={() => run('valspar')} disabled={loading.valspar}
            style={{ background: loading.valspar ? '#92400e' : '#f59e0b', color: '#000', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {loading.valspar ? 'Setting up…' : 'Create Valspar Pool →'}
          </button>,
          '#1a1200', '#f59e0b33'
        )}
        {toolCard('🏌️', 'Test Auction Draft Sandbox',
          '8 teams: you + 7 bots (Birdie, Eagle, Par…). $1,000 auction budget, 10s timers. Bots auto-nominate and bid. Redirects straight to the draft room.',
          'sandbox',
          <button onClick={() => run('sandbox')} disabled={loading.sandbox}
            style={{ background: loading.sandbox ? 'rgba(0,232,122,0.4)' : '#22c55e', color: '#001a0d', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: loading.sandbox ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => { if (!loading.sandbox) e.currentTarget.style.background = '#16a34a'; }}
            onMouseLeave={e => { if (!loading.sandbox) e.currentTarget.style.background = '#22c55e'; }}>
            {loading.sandbox ? 'Creating…' : '+ Test Auction Draft'}
          </button>
        )}
        {toolCard('⛳', 'Force ESPN Sync',
          'Manually trigger score sync for a specific tournament.',
          'sync',
          <div>
            <select value={selectedT} onChange={e => setSelectedT(e.target.value)}
              style={{ background: '#111', border: '1px solid #1f2937', color: '#d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 12, width: '100%', marginBottom: 10 }}>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={() => run('sync')} disabled={loading.sync || !selectedT}
              style={{ background: (loading.sync || !selectedT) ? 'rgba(0,232,122,0.4)' : '#22c55e', color: '#001a0d', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: (loading.sync || !selectedT) ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => { if (!loading.sync && selectedT) e.currentTarget.style.background = '#16a34a'; }}
              onMouseLeave={e => { if (!loading.sync && selectedT) e.currentTarget.style.background = '#22c55e'; }}>
              {loading.sync ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        )}
        {toolCard('📧', 'Test Email',
          'Send a test confirmation email to your account to preview what members receive.',
          'email',
          <button onClick={() => run('email')} disabled={loading.email}
            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {loading.email ? 'Sending…' : 'Send Test Email'}
          </button>
        )}
        {toolCard('⛳🔄', 'Re-Sync Pool Tiers',
          'Re-assigns players to tiers for all active pool leagues. Run this if picks show 0 players after a new tournament is linked.',
          'syncTiers',
          <button onClick={() => run('syncTiers')} disabled={loading.syncTiers}
            style={{ background: loading.syncTiers ? '#065f46' : '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: loading.syncTiers ? 'not-allowed' : 'pointer' }}>
            {loading.syncTiers ? 'Syncing…' : 'Re-Sync Tiers →'}
          </button>,
          '#071a0f', '#05966933'
        )}
        {toolCard('🏌️📋', 'Sync ESPN Field',
          'Fetches the official entry list from ESPN for the selected tournament and rebuilds pool_tier_players for any linked pool leagues.',
          'syncEspnField',
          <div>
            <select value={selectedT} onChange={e => setSelectedT(e.target.value)}
              style={{ background: '#111', border: '1px solid #1f2937', color: '#d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 12, width: '100%', marginBottom: 10 }}>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={() => run('syncEspnField')} disabled={loading.syncEspnField || !selectedT}
              style={{ background: (loading.syncEspnField || !selectedT) ? '#1e3a5f' : '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: (loading.syncEspnField || !selectedT) ? 'not-allowed' : 'pointer' }}>
              {loading.syncEspnField ? 'Fetching…' : 'Sync ESPN Field →'}
            </button>
          </div>,
          '#0a0f1a', '#2563eb33'
        )}
        {toolCard('🗄️', 'DB Health Check',
          'Current row counts for all golf tables.',
          'health',
          health ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Object.entries(health.counts).map(([table, count]) => (
                <div key={table} style={{ display: 'flex', justifyContent: 'space-between', background: '#111', borderRadius: 6, padding: '5px 10px' }}>
                  <span style={{ color: '#4b5563', fontSize: 11, truncate: true }}>{table.replace('golf_', '')}</span>
                  <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 700 }}>{count}</span>
                </div>
              ))}
              <div style={{ gridColumn: '1/-1', color: '#4b5563', fontSize: 11, marginTop: 6 }}>
                Last sync: {health.lastSync ? fmt(health.lastSync) : 'Never'} · Uptime: {Math.round(health.uptime / 60)}m
              </div>
            </div>
          ) : <div style={{ color: '#374151', fontSize: 12 }}>Loading…</div>
        )}
      </div>

      {/* ── Tournament Management ── */}
      <div style={{ marginTop: 28, marginBottom: 14 }}>
        <div style={{ color: '#4b5563', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Tournament Management
        </div>
      </div>
      <div style={{ background: '#060e08', border: '1px solid #fbbf2433', borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🏁</div>
        <h4 style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>Tournament Readiness Check</h4>
        <p style={{ color: '#4b5563', fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          Run before each tournament to verify ESPN event ID, player pool, status, API reachability, and score sync are all healthy.
        </p>

        <select
          value={selectedT}
          onChange={e => { setSelectedT(e.target.value); setReadiness(null); }}
          style={{ background: '#111', border: '1px solid #1f2937', color: '#d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 12, width: '100%', marginBottom: 12 }}
        >
          {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {readiness && (
          <div style={{ marginBottom: 14 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 8, marginBottom: 10, fontSize: 12, fontWeight: 700,
              background: readiness.overall === 'pass' ? 'rgba(74,222,128,0.1)' : readiness.overall === 'fail' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)',
              border: `1px solid ${readiness.overall === 'pass' ? 'rgba(74,222,128,0.35)' : readiness.overall === 'fail' ? 'rgba(248,113,113,0.35)' : 'rgba(251,191,36,0.35)'}`,
              color: readiness.overall === 'pass' ? '#4ade80' : readiness.overall === 'fail' ? '#f87171' : '#fbbf24',
            }}>
              {readiness.overall === 'pass' ? '✓ All checks passed' : readiness.overall === 'fail' ? '✗ Issues found' : '⚠ Warnings'}
            </div>
            {readiness.tournament && (
              <div style={{ color: '#4b5563', fontSize: 11, marginBottom: 8 }}>
                {readiness.tournament.name} · espn_event_id: {readiness.tournament.espn_event_id || 'NULL'} · status: {readiness.tournament.status}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {readiness.checks.map(c => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#0d1117', borderRadius: 8, padding: '7px 10px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1, color: c.status === 'pass' ? '#4ade80' : c.status === 'fail' ? '#f87171' : '#fbbf24' }}>
                    {c.status === 'pass' ? '✓' : c.status === 'fail' ? '✗' : '⚠'}
                  </span>
                  <div>
                    <div style={{ color: '#e5e7eb', fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          disabled={checkingReadiness || !selectedT}
          onClick={async () => {
            setCheckingReadiness(true);
            setReadiness(null);
            try {
              const r = await api.get(`/golf/admin/tournament-readiness/${selectedT}`);
              setReadiness(r.data);
            } catch {
              setReadiness({ overall: 'fail', checks: [{ name: 'Request failed', status: 'fail', detail: 'Could not reach server' }] });
            }
            setCheckingReadiness(false);
          }}
          style={{
            background: (checkingReadiness || !selectedT) ? '#78350f' : '#d97706',
            color: '#fff', border: 'none', borderRadius: 10,
            padding: '9px 20px', fontSize: 13, fontWeight: 700,
            cursor: (checkingReadiness || !selectedT) ? 'not-allowed' : 'pointer',
            opacity: (checkingReadiness || !selectedT) ? 0.6 : 1,
          }}
        >
          {checkingReadiness ? 'Checking…' : 'Run Readiness Check'}
        </button>
      </div>
    </>
  );
}

// ── Tab 6: Analytics ──────────────────────────────────────────────────────────

const GENDER_COLORS = { male: '#60a5fa', female: '#f472b6', prefer_not_to_say: '#a78bfa', not_provided: '#374151' };
const GENDER_LABELS = { male: 'Male', female: 'Female', prefer_not_to_say: 'Prefer not to say', not_provided: 'Not provided' };

function AnalyticsTab() {
  const [data, setData]   = useState(null);
  const [loading, setLoad] = useState(true);
  const [err, setErr]      = useState('');

  useEffect(() => {
    api.get('/golf/admin/analytics')
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.error || 'Load failed'))
      .finally(() => setLoad(false));
  }, []);

  function handleExport() {
    window.location.href = '/api/golf/admin/export/users';
  }

  if (loading) return <EmptyState icon="⏳" text="Loading analytics…" />;

  const hasGender  = data?.genderData?.some(d => d.count > 0);
  const hasAge     = data?.ageDistribution?.some(d => d.count > 0);
  const hasSignups = data?.signupsPerWeek?.length > 0;
  const hasPool    = data?.poolByTournament?.length > 0;

  const genderChartData = (data?.genderData || []).map(d => ({
    name: GENDER_LABELS[d.gender] || d.gender,
    value: d.count,
    fill: GENDER_COLORS[d.gender] || '#374151',
  }));

  return (
    <div className="space-y-8">
      <Err msg={err} />

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
        <Stat label="Avg League Size"   value={data?.metrics?.avgLeagueSize ?? '—'} color="#4ade80" />
        <Stat label="Avg FAAB Spent"    value={data?.metrics?.avgFaabSpend ? `$${data.metrics.avgFaabSpend}` : '—'} color="#fbbf24" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 24 }}>

        {/* Gender pie */}
        <div style={{ background: '#080f09', border: '1px solid #111827', borderRadius: 16, padding: 20 }}>
          <h4 style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>Gender Distribution</h4>
          {hasGender ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={genderChartData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {genderChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #1f2937', borderRadius: 8, color: '#d1d5db', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState text="No profile data yet" />}
        </div>

        {/* Age bar chart */}
        <div style={{ background: '#080f09', border: '1px solid #111827', borderRadius: 16, padding: 20 }}>
          <h4 style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>Age Distribution</h4>
          {hasAge ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.ageDistribution} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#111827" />
                <XAxis dataKey="range" tick={{ fill: '#4b5563', fontSize: 11 }} />
                <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #1f2937', borderRadius: 8, color: '#d1d5db', fontSize: 12 }} />
                <Bar dataKey="count" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState text="No DOB data yet" />}
        </div>

        {/* Signups over time */}
        <div style={{ background: '#080f09', border: '1px solid #111827', borderRadius: 16, padding: 20 }}>
          <h4 style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>New Golf Users (last 12 weeks)</h4>
          {hasSignups ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.signupsPerWeek} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#111827" />
                <XAxis dataKey="week" tick={{ fill: '#4b5563', fontSize: 10 }} />
                <YAxis tick={{ fill: '#4b5563', fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #1f2937', borderRadius: 8, color: '#d1d5db', fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyState text="No signup data yet" />}
        </div>

        {/* Office pool by tournament */}
        <div style={{ background: '#080f09', border: '1px solid #111827', borderRadius: 16, padding: 20 }}>
          <h4 style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: '0 0 16px' }}>Office Pool Entries by Tournament</h4>
          {hasPool ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.poolByTournament} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#111827" />
                <XAxis type="number" tick={{ fill: '#4b5563', fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#4b5563', fontSize: 10 }} width={80} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #1f2937', borderRadius: 8, color: '#d1d5db', fontSize: 12 }} />
                <Bar dataKey="entries" fill="#fbbf24" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState text="No office pool entries yet" />}
        </div>

      </div>

      {/* Geographic placeholder */}
      <div style={{ background: '#080f09', border: '1px dashed #1f2937', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🌍</div>
        <div style={{ color: '#374151', fontSize: 14 }}>Location data coming soon</div>
      </div>

      {/* Export */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleExport}
          style={{ background: '#14532d', color: '#4ade80', border: '1px solid #166634', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ↓ Export All Golf Users (CSV)
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'leagues',    label: 'Leagues'    },
  { key: 'users',      label: 'Users'      },
  { key: 'players',    label: 'Players'    },
  { key: 'financials', label: 'Financials' },
  { key: 'devtools',   label: 'Dev Tools'  },
  { key: 'analytics',  label: 'Analytics'  },
];

export default function GolfSuperAdmin() {
  useDocTitle('Golf Admin | TourneyRun');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('leagues');

  useEffect(() => {
    if (user && user.role !== 'superadmin') navigate('/golf');
  }, [user]);

  if (!user || user.role !== 'superadmin') return null;

  return (
    <div style={{ minHeight: '100vh', background: '#030b05', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ background: '#050f07', borderBottom: '1px solid #14532d33', padding: '28px 24px 20px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
            {/* Shield with golf ball */}
            <div style={{ width: 44, height: 44, background: '#14532d33', border: '1px solid #22c55e33', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              🛡️
            </div>
            <div>
              <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
                Golf Superadmin Panel
              </h1>
              <p style={{ color: '#4b5563', fontSize: 13, margin: 0 }}>TourneyRun Golf platform management</p>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <Link to="/admin" style={{ color: '#4b5563', fontSize: 12, textDecoration: 'none', border: '1px solid #1f2937', borderRadius: 8, padding: '6px 12px' }}>
                ← Basketball Admin
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: '#050f07', borderBottom: '1px solid #111827', overflowX: 'auto' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 2, minWidth: 'max-content' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '12px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid #22c55e' : '2px solid transparent',
                color: tab === t.key ? '#4ade80' : '#4b5563',
                fontWeight: tab === t.key ? 700 : 400,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px' }}>
        {tab === 'leagues'    && <LeaguesTab />}
        {tab === 'users'      && <UsersTab />}
        {tab === 'players'    && <PlayersTab />}
        {tab === 'financials' && <FinancialsTab />}
        {tab === 'devtools'   && <DevToolsTab />}
        {tab === 'analytics'  && <AnalyticsTab />}
      </div>
    </div>
  );
}
