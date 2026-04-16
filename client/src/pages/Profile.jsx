import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDocTitle } from '../hooks/useDocTitle';
import api from '../api';

// ── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── MyLeaguesDropdown (matches HubLanding exactly) ────────────────────────

function MyLeaguesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => { setOpen(false); logout(); navigate('/'); };

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const Chevron = ({ up }) => (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
      <path d={up ? 'M1 5L5 1L9 5' : 'M1 1L5 5L9 1'} stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'rgba(0,232,122,0.1)', border: '0.5px solid rgba(0,232,122,0.3)',
          color: '#22c55e', fontSize: 13, fontWeight: 600,
          padding: '8px 18px', borderRadius: 7, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 7, transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,232,122,0.16)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,232,122,0.1)'}
      >
        My Leagues <Chevron up={open} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          background: '#13131f', border: '0.5px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: 6, minWidth: 190, zIndex: 200,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {[
            { to: '/golf/dashboard',       dot: '#22c55e', label: 'Golf Leagues' },
            { to: '/basketball/dashboard', dot: '#ff8c00', label: 'College Basketball' },
          ].map(({ to, dot, label }) => (
            <Link
              key={to} to={to} onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', color: '#fff', fontSize: 13, textDecoration: 'none', fontWeight: 500, borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
              {label}
            </Link>
          ))}
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
          {/* Active: Profile highlighted */}
          <Link
            to="/account/profile" onClick={() => setOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', color: '#22c55e', fontSize: 13, textDecoration: 'none', fontWeight: 600, borderRadius: 6, background: 'rgba(0,232,122,0.08)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            Profile
          </Link>
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
          <button
            onClick={handleSignOut}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', color: '#6b7280', fontSize: 13, fontWeight: 500, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Hub Nav ────────────────────────────────────────────────────────────────

function HubNav({ user }) {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#0a0a14',
      borderLeft: '3px solid #22c55e',
      borderBottom: '0.5px solid rgba(255,255,255,0.07)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>
            tourney<span style={{ color: '#22c55e' }}>run</span>
          </span>
        </Link>

        <div className="hidden md:flex" style={{
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {[
            { to: '/golf',       label: 'Golf' },
            { to: '/basketball', label: 'Basketball' },
            { to: '/golf/faq',   label: 'FAQ' },
          ].map(({ to, label }, i, arr) => (
            <Link key={to} to={to}
              style={{
                padding: '8px 18px', color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500,
                textDecoration: 'none', display: 'block',
                borderRight: i < arr.length - 1 ? '0.5px solid rgba(255,255,255,0.1)' : 'none',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.background = 'transparent'; }}
            >
              {label}
            </Link>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {user ? (
            <MyLeaguesDropdown />
          ) : (
            <>
              <Link to="/login"
                className="hidden md:inline-flex items-center border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 px-4 py-1.5 rounded-full text-sm transition-all"
                style={{ textDecoration: 'none' }}
              >
                Sign In
              </Link>
              <Link to="/register"
                style={{
                  background: '#22c55e', color: '#001a0d',
                  fontSize: 13, fontWeight: 700,
                  padding: '8px 22px', borderRadius: 7, textDecoration: 'none',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Card({ children }) {
  return (
    <div style={{
      background: '#111',
      border: '0.5px solid rgba(255,255,255,0.1)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#4b5563', marginBottom: 7,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputBase = {
  width: '100%', boxSizing: 'border-box',
  background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '11px 14px',
  color: '#fff', fontSize: 14, outline: 'none',
  transition: 'border-color 0.15s', fontFamily: 'inherit',
};

function GreenBtn({ children, onClick, loading }) {
  return (
    <button
      type="button" onClick={onClick} disabled={loading}
      style={{
        background: loading ? '#1a3a2a' : '#00c853',
        color: loading ? '#4b6a5a' : '#001a0d',
        border: 'none', borderRadius: 8,
        padding: '10px 26px', fontSize: 13, fontWeight: 700,
        cursor: loading ? 'default' : 'pointer', transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.85'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >
      {children}
    </button>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  const err = type === 'error';
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: err ? '#2a0a0a' : '#0a1f0f',
      border: `0.5px solid ${err ? 'rgba(239,68,68,0.4)' : 'rgba(0,200,83,0.35)'}`,
      color: err ? '#f87171' : '#4ade80',
      borderRadius: 10, padding: '12px 20px',
      fontSize: 13, fontWeight: 600,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      animation: 'tr-toast 0.18s ease',
    }}>
      {msg}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function Profile() {
  useDocTitle('Profile | TourneyRun');
  const { user: authUser, updateUser } = useAuth();

  const [profile, setProfile]         = useState(null);
  const [pageLoading, setPageLoading] = useState(true);

  const [username, setUsername]     = useState('');
  const [email, setEmail]           = useState('');
  const [fullName, setFullName]     = useState('');
  const [acctSaving, setAcctSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving]   = useState(false);

  const [toast, setToast] = useState({ msg: '', type: 'success' });
  const toastRef = useRef(null);

  function showToast(msg, type = 'success') {
    clearTimeout(toastRef.current);
    setToast({ msg, type });
    toastRef.current = setTimeout(() => setToast({ msg: '', type: 'success' }), 3000);
  }

  useEffect(() => {
    api.get('/profile')
      .then(res => {
        const p = res.data.user;
        setProfile(p);
        setUsername(p.username || '');
        setEmail(p.email || '');
        setFullName(p.full_name || '');
      })
      .catch(() => showToast('Failed to load profile', 'error'))
      .finally(() => setPageLoading(false));
    return () => clearTimeout(toastRef.current);
  }, []);

  async function saveAccount() {
    setAcctSaving(true);
    try {
      const res = await api.put('/profile', { username, email, full_name: fullName });
      setProfile(p => ({ ...p, ...res.data.user }));
      updateUser({ username: res.data.user.username, email: res.data.user.email, full_name: res.data.user.full_name });
      showToast('Profile saved ✓');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setAcctSaving(false);
    }
  }

  async function changePassword() {
    if (newPw !== confirmPw) { showToast('Passwords do not match', 'error'); return; }
    if (newPw.length < 6)    { showToast('Password must be at least 6 characters', 'error'); return; }
    setPwSaving(true);
    try {
      await api.put('/profile/password', { currentPassword: currentPw, newPassword: newPw });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      showToast('Password updated ✓');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update password', 'error');
    } finally {
      setPwSaving(false);
    }
  }

  const displayName = profile?.display_name || profile?.username || authUser?.username || '';
  const initials    = getInitials(displayName);
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: '#fff' }}>
      <style>{`
        @keyframes tr-toast {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <HubNav user={authUser} />

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 'clamp(32px,6vw,60px) 20px 80px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem,4vw,2.1rem)', fontWeight: 700, letterSpacing: '-0.04em', color: '#fff' }}>
            Your Profile
          </h1>
          {memberSince && (
            <p style={{ margin: '5px 0 0', fontSize: 13, color: '#4b5563' }}>
              Member since {memberSince}
            </p>
          )}
        </div>

        {pageLoading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#374151', fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Account Settings card ── */}
            <Card>
              {/* Avatar */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '32px 28px 24px',
                borderBottom: '0.5px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{
                  width: 68, height: 68, borderRadius: '50%',
                  background: 'rgba(0,200,83,0.1)',
                  border: '1.5px solid rgba(0,200,83,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em',
                  color: '#00c853', marginBottom: 12, flexShrink: 0,
                }}>
                  {initials}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{displayName}</div>
                <div style={{ fontSize: 12, color: '#374151', marginTop: 3 }}>{profile?.email}</div>
              </div>

              {/* Fields */}
              <div style={{ padding: '22px 28px 26px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                  Account Settings
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
                  <Field label="Username">
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      maxLength={30}
                      style={inputBase}
                      onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,200,83,0.45)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
                    />
                  </Field>
                  <Field label="Email — read only">
                    <input
                      type="email"
                      value={email}
                      readOnly
                      style={{ ...inputBase, color: '#374151', background: '#141414', cursor: 'default' }}
                    />
                  </Field>
                </div>
                <div style={{ marginBottom: 22 }}>
                  <Field label="Full Name">
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. John Smith"
                      maxLength={60}
                      style={inputBase}
                      onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,200,83,0.45)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
                    />
                  </Field>
                  <p style={{ color: '#4b5563', fontSize: 10, marginTop: 5 }}>Used by pool commissioners to identify you for payment tracking</p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <GreenBtn onClick={saveAccount} loading={acctSaving}>
                    {acctSaving ? 'Saving…' : 'Save Changes'}
                  </GreenBtn>
                </div>
              </div>
            </Card>

            {/* ── Change Password card ── */}
            <Card>
              <div style={{ padding: '22px 28px 26px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>
                  Change Password
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
                  <Field label="Current Password">
                    <input
                      type="password"
                      value={currentPw}
                      onChange={e => setCurrentPw(e.target.value)}
                      placeholder="Enter current password"
                      autoComplete="current-password"
                      style={inputBase}
                      onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,200,83,0.45)'}
                      onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
                    />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                    <Field label="New Password">
                      <input
                        type="password"
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        placeholder="Min 6 characters"
                        autoComplete="new-password"
                        style={inputBase}
                        onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,200,83,0.45)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
                      />
                    </Field>
                    <Field label="Confirm New Password">
                      <input
                        type="password"
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        placeholder="Repeat new password"
                        autoComplete="new-password"
                        style={inputBase}
                        onFocus={e => e.currentTarget.style.borderColor = 'rgba(0,200,83,0.45)'}
                        onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
                      />
                    </Field>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <GreenBtn onClick={changePassword} loading={pwSaving}>
                    {pwSaving ? 'Updating…' : 'Update Password'}
                  </GreenBtn>
                </div>
              </div>
            </Card>

          </div>
        )}
      </div>

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
