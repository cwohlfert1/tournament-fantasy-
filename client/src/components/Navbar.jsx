import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function userInitials(user) {
  const src = user?.display_name || user?.username || '';
  const words = src.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// ── Theme tokens per variant ─────────────────────────────────────────────────

const GOLF_THEME = {
  bg:              '#0a1a0f',
  border:          '#14532d55',
  activeBg:        '#14532d33',
  hoverBg:         '#14532d33',
  avatarBg:        '#14532d33',
  avatarBorder:    '#22c55e55',
  avatarText:      '#4ade80',
  divider:         '#1a3a1a',
  logoutBorder:    '#1a3a1a',
  adminColor:      '#4ade80',
  adminHoverColor: '#86efac',
  runColor:        '#22c55e',
  subtitleColor:   '#16a34a',
};

const BBALL_THEME = {
  bg:              '#111827',
  border:          '#1f2937',
  activeBg:        '#1f2937',
  hoverBg:         '#1f2937',
  avatarBg:        '#7c3aed22',
  avatarBorder:    '#7c3aed55',
  avatarText:      '#a78bfa',
  divider:         '#374151',
  logoutBorder:    '#374151',
  adminColor:      '#f59e0b',
  adminHoverColor: '#fcd34d',
  runColor:        '#f97316',
  subtitleColor:   '#888780',
};

// ── Nav link definitions ─────────────────────────────────────────────────────

const GOLF_NAV = [
  { to: '/',               label: 'Home'      },
  { to: '/golf/dashboard', label: 'My Leagues' },
  { to: '/golf/strategy',  label: 'Strategy'  },
  { to: '/golf/faq',       label: 'FAQ'       },
];

const BBALL_NAV = [
  { to: '/',                     label: 'Home'      },
  { to: '/basketball/dashboard', label: 'Dashboard' },
  { to: '/basketball/games',     label: 'Games', live: true },
  { to: '/basketball/strategy',  label: 'Strategy'  },
  { to: '/basketball/faq',       label: 'FAQ'       },
];

// ── Golf ball SVG (shared between both variants' logo) ───────────────────────

function GolfBallSVG() {
  return (
    <svg viewBox="0 0 32 32" fill="none" style={{ width: 26, height: 26, flexShrink: 0 }}>
      <circle cx="16" cy="16" r="15" fill="white" stroke="#d1d5db" strokeWidth="0.8"/>
      <circle cx="12" cy="11" r="1.1" fill="#9ca3af"/>
      <circle cx="17" cy="9"  r="1.1" fill="#9ca3af"/>
      <circle cx="21" cy="13" r="1.1" fill="#9ca3af"/>
      <circle cx="10" cy="16" r="1.1" fill="#9ca3af"/>
      <circle cx="15" cy="15" r="1.1" fill="#9ca3af"/>
      <circle cx="20" cy="18" r="1.1" fill="#9ca3af"/>
      <circle cx="13" cy="20" r="1.1" fill="#9ca3af"/>
      <circle cx="19" cy="22" r="1.1" fill="#9ca3af"/>
    </svg>
  );
}

// ── Unified Navbar ────────────────────────────────────────────────────────────
//
// variant="golf"       — always renders the golf nav (used by GolfLayout)
// variant unset/other  — renders basketball nav; returns null on /, /golf/*,
//                        and auth pages so GolfNavbar can render instead

export default function Navbar({ variant }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasLiveGames, setHasLiveGames] = useState(false);

  const isGolf = variant === 'golf';
  const theme    = isGolf ? GOLF_THEME : BBALL_THEME;
  const navLinks = isGolf ? GOLF_NAV   : BBALL_NAV;

  // ── Visibility guard for the global (non-variant) navbar ──────────────────
  const path        = location.pathname;
  const isGolfRoute = path.startsWith('/golf');
  const isHub       = path === '/';
  const isAuthPage  = path === '/login' || path === '/register' ||
                      path === '/forgot-password' || path === '/reset-password';

  // ── Live games polling (basketball only, when logged in) ──────────────────
  useEffect(() => {
    if (!user || isGolf) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await api.get('/games/schedule');
        if (!cancelled) setHasLiveGames((res.data.games || []).some(g => g.is_live));
      } catch {}
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user, isGolf]);

  if (!isGolf && (isGolfRoute || isHub || isAuthPage)) return null;

  // ── Shared handlers / helpers ─────────────────────────────────────────────

  const handleLogout = () => {
    logout();
    navigate(isGolf ? '/golf' : '/basketball');
    setMenuOpen(false);
  };

  const isActive = (p) => path === p || path.startsWith(p + '/');

  const adminPath = isGolf ? '/golf/admin' : '/basketball/admin';

  const navLinkStyle = (to) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: isActive(to) ? 500 : 400,
    color: isActive(to) ? '#ffffff' : '#6b7280',
    background: isActive(to) ? theme.activeBg : 'transparent',
    transition: 'color 0.15s, background 0.15s',
    textDecoration: 'none',
    cursor: 'pointer',
  });

  const hoverIn  = (to) => (e) => {
    if (!isActive(to)) { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.background = theme.hoverBg; }
  };
  const hoverOut = (to) => (e) => {
    if (!isActive(to)) { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }
  };

  const initials = userInitials(user);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <nav style={{ background: theme.bg, borderBottom: `0.5px solid ${theme.border}`, position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* ── Logo ── */}
        <Link
          to={isGolf ? '/golf' : '/basketball'}
          className="select-none"
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
        >
          {isGolf ? <GolfBallSVG /> : <span style={{ fontSize: 22, lineHeight: 1 }}>🏀</span>}
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <span style={{ color: '#ffffff', fontWeight: 400 }}>tourney</span>
              <span style={{ color: theme.runColor, fontWeight: 500 }}>run</span>
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.subtitleColor, marginTop: 2 }}>
              {isGolf ? 'Fantasy Golf' : 'Player Pool Fantasy'}
            </div>
          </div>
        </Link>

        {/* ── Center: nav links (desktop, hidden on mobile) ── */}
        {(user || isGolf) && (
          <div className="hidden md:flex items-center" style={{ gap: 2 }}>
            {navLinks.map(({ to, label, live }) => (
              <Link key={to} to={to} style={navLinkStyle(to)} onMouseEnter={hoverIn(to)} onMouseLeave={hoverOut(to)}>
                {live && hasLiveGames && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0, animation: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite' }} />
                )}
                {label}
              </Link>
            ))}
            {isGolf && (
              <a
                href="/golf#how-it-works"
                style={navLinkStyle('/golf#how-it-works')}
                onMouseEnter={e => { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.background = theme.hoverBg; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
              >
                How to Play
              </a>
            )}
          </div>
        )}

        {/* ── Right: auth actions (desktop, hidden on mobile) ── */}
        <div className="hidden md:flex items-center" style={{ gap: 10 }}>
          {user ? (
            <>
              {user.role === 'superadmin' && (
                <Link
                  to={adminPath}
                  style={{ ...navLinkStyle(adminPath), color: isActive(adminPath) ? '#fff' : theme.adminColor, fontWeight: isGolf ? 600 : 500 }}
                  onMouseEnter={e => { if (!isActive(adminPath)) { e.currentTarget.style.color = theme.adminHoverColor; e.currentTarget.style.background = theme.hoverBg; } }}
                  onMouseLeave={e => { if (!isActive(adminPath)) { e.currentTarget.style.color = theme.adminColor; e.currentTarget.style.background = 'transparent'; } }}
                >
                  {isGolf ? 'Golf Admin' : 'Admin'}
                </Link>
              )}
              <div style={{ width: '0.5px', height: 18, background: theme.divider, flexShrink: 0 }} />
              <Link
                to="/profile"
                title={user.display_name || user.username}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: theme.avatarBg, border: `1px solid ${theme.avatarBorder}`,
                  color: theme.avatarText, fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none', flexShrink: 0, letterSpacing: '0.02em',
                }}
              >
                {initials}
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12,
                  color: '#6b7280', border: `0.5px solid ${theme.logoutBorder}`,
                  background: 'transparent', cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.borderColor = '#6b7280'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = theme.logoutBorder; }}
              >
                Logout
              </button>
            </>
          ) : isGolf ? (
            <div className="flex items-center" style={{ gap: 10 }}>
              <Link
                to="/login"
                style={{ fontSize: 14, color: '#9ca3af', textDecoration: 'none', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
              >
                Login
              </Link>
              <Link
                to="/register"
                style={{ fontSize: 14, background: '#16a34a', color: '#fff', padding: '6px 16px', borderRadius: 8, fontWeight: 500, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
                onMouseLeave={e => e.currentTarget.style.background = '#16a34a'}
              >
                Register
              </Link>
            </div>
          ) : (
            <div className="flex items-center" style={{ gap: 10 }}>
              <Link to="/login" className="border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 px-4 py-1.5 rounded-full text-sm transition-all" style={{ textDecoration: 'none' }}>
                Sign In
              </Link>
              <Link to="/register" className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium transition-colors" style={{ fontSize: 14 }}>
                Register
              </Link>
            </div>
          )}
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          className="md:hidden p-2 rounded-lg transition-colors"
          style={{ color: '#9ca3af', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* ── Mobile menu ── */}
      {menuOpen && (
        <div style={{ borderTop: `0.5px solid ${theme.border}`, padding: '12px 24px' }}>
          {user ? (
            <>
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}
              >
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: theme.avatarBg, border: `1px solid ${theme.avatarBorder}`, color: theme.avatarText, fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {initials}
                </span>
                <span>{user.display_name || user.username}</span>
              </Link>
              {navLinks.map(({ to, label, live }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, color: isActive(to) ? (isGolf ? '#4ade80' : '#e5e7eb') : '#d1d5db', textDecoration: 'none', fontSize: 14 }}
                >
                  {live && hasLiveGames && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0, animation: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite' }} />
                  )}
                  {label}
                </Link>
              ))}
              {isGolf && (
                <a href="/golf#how-it-works" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}>
                  How to Play
                </a>
              )}
              {user.role === 'superadmin' && (
                <Link
                  to={adminPath}
                  onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: isGolf ? '#4ade80' : '#f59e0b', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}
                >
                  {isGolf ? 'Golf Admin' : 'Admin'}
                </Link>
              )}
              <button
                onClick={handleLogout}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, color: '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              {isGolf && (
                <a href="/golf#how-it-works" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}>
                  How to Play
                </a>
              )}
              <Link to="/login" onClick={() => setMenuOpen(false)} style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}>
                {isGolf ? 'Login' : 'Login'}
              </Link>
              <Link
                to="/register"
                onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: isGolf ? '#4ade80' : '#a5b4fc', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}
              >
                Register
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
