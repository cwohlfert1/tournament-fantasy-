import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import { useGolfNotifications, NOTIF_STYLE } from '../hooks/useGolfNotifications';
// Logo SVG file available at ../assets/TourneyRun_Horses_Logo_Dark.svg for marketing pages
// Navbar uses inline rendering to match golf pattern (icon + text at same size)

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

const HORSES_THEME = {
  bg:              '#0a1414',
  border:          '#2AA6A633',
  activeBg:        '#2AA6A633',
  hoverBg:         '#2AA6A622',
  avatarBg:        '#2AA6A622',
  avatarBorder:    '#2AA6A655',
  avatarText:      '#5cd4d4',
  divider:         '#1a2d2d',
  logoutBorder:    '#1a2d2d',
  adminColor:      '#5cd4d4',
  adminHoverColor: '#99e5e5',
  runColor:        '#2AA6A6',
  subtitleColor:   '#36bfbf',
};

const FOOTBALL_THEME = {
  bg:              '#0a0c14',
  border:          '#3b82f633',
  activeBg:        '#3b82f633',
  hoverBg:         '#3b82f622',
  avatarBg:        '#3b82f622',
  avatarBorder:    '#3b82f655',
  avatarText:      '#93c5fd',
  divider:         '#1a2030',
  logoutBorder:    '#1a2030',
  adminColor:      '#93c5fd',
  adminHoverColor: '#bfdbfe',
  runColor:        '#3b82f6',
  subtitleColor:   '#60a5fa',
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
  { to: '/golf/news',      label: 'News'      },
  { to: '/golf/faq',       label: 'FAQ'       },
];

const HORSES_NAV = [
  { to: '/',                  label: 'Home'      },
  { to: '/horses/dashboard',  label: 'My Pools'  },
  { to: '/horses/create',     label: 'Create'    },
];

const FOOTBALL_NAV = [
  { to: '/',                  label: 'Home'       },
  { to: '/football',          label: 'NFL Pools'  },
];

const BBALL_NAV = [
  { to: '/',                     label: 'Home'      },
  { to: '/basketball/dashboard', label: 'Dashboard' },
  { to: '/basketball/games',     label: 'Games', live: true },
  { to: '/basketball/strategy',  label: 'Strategy'  },
  { to: '/basketball/faq',       label: 'FAQ'       },
];

// ── Golf notification bell ────────────────────────────────────────────────────

function BellSVG() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function NotifRow({ notif, onDismiss, onClose }) {
  const navigate = useNavigate();
  const s = NOTIF_STYLE[notif.type] || { color: '#6b7280', label: '' };

  function handleRowClick() {
    onDismiss(notif.id);
    onClose();
    if (notif.cta?.href) navigate(notif.cta.href);
  }

  return (
    <div
      onClick={handleRowClick}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 16px', cursor: notif.cta ? 'pointer' : 'default', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.1s' }}
      onMouseEnter={e => { if (notif.cta) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0, marginTop: 5 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.label}</div>
        <p style={{ fontSize: 13, color: '#d1d5db', margin: 0, lineHeight: 1.4 }}>{notif.body}</p>
        {notif.cta && (
          <span style={{ fontSize: 11, color: '#4b5563', marginTop: 2, display: 'block' }}>{notif.cta.label} →</span>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDismiss(notif.id); }}
        aria-label="Dismiss notification"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', padding: 3, lineHeight: 0, flexShrink: 0, borderRadius: 4, transition: 'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = '#9ca3af'}
        onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}
      ><X size={13} /></button>
    </div>
  );
}

function GolfBellMenu({ notifications, dismissed, dismiss, markAllRead, unreadCount }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visible = notifications.filter(n => !dismissed.has(n.id));

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        style={{
          position: 'relative', background: open ? 'rgba(34,197,94,0.1)' : 'none',
          border: 'none', cursor: 'pointer', padding: '5px 6px', borderRadius: 8,
          color: unreadCount > 0 ? '#4ade80' : '#6b7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.color = unreadCount > 0 ? '#4ade80' : '#6b7280'; e.currentTarget.style.background = 'none'; } }}
      >
        <BellSVG />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 15, height: 15, borderRadius: 999,
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 800, lineHeight: 1, padding: '0 3px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 1.5px #0a1a0f',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          width: 320, maxHeight: 400, overflowY: 'auto',
          background: '#0f1923', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, zIndex: 9000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'sticky', top: 0, background: '#0f1923' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Notifications</span>
            {visible.length > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 12, padding: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#d1d5db'}
                onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
              >
                Mark all read
              </button>
            )}
          </div>
          {visible.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#4b5563', fontSize: 13 }}>
              You're all caught up ✓
            </div>
          ) : (
            visible.map(n => (
              <NotifRow key={n.id} notif={n} onDismiss={dismiss} onClose={() => setOpen(false)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Basketball SVG ───────────────────────────────────────────────────────────

function BasketballSVG() {
  return (
    <svg viewBox="0 0 32 32" fill="none" style={{ width: 26, height: 26, flexShrink: 0 }}>
      <defs>
        <radialGradient id="bb-nav-shade" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="60%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#bb-nav-shade)" stroke="#7c2d12" strokeWidth="0.6"/>
      <path d="M16 1 Q21 8.5 21 16 Q21 23.5 16 31" fill="none" stroke="#7c2d12" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M16 1 Q11 8.5 11 16 Q11 23.5 16 31" fill="none" stroke="#7c2d12" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M1 16 Q8.5 12 16 12 Q23.5 12 31 16" fill="none" stroke="#7c2d12" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M1 16 Q8.5 20 16 20 Q23.5 20 31 16" fill="none" stroke="#7c2d12" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

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

function HorseHeadSVG() {
  // Chess knight — universally recognized horse head shape
  // Based on Font Awesome chess-knight (CC BY 4.0), scaled to 32x32
  return (
    <svg viewBox="0 0 384 512" style={{ width: 26, height: 26, flexShrink: 0 }}>
      <path fill="#2AA6A6" d="M19 345.5l-10.1 10.1c-4.7 4.7-12.3 4.7-17 0l-5.7-5.7c-4.7-4.7-4.7-12.3 0-17l6.1-6.1c-3.1-6.2-5.1-13.2-5.1-20.5V208c0-34.2 19.1-63.8 47.2-79.1C24.4 112.2 16 91.5 16 68.8 16 30.8 46.8 0 84.8 0c11.8 0 22.9 3 32.6 8.2C125.5 3.1 134.5 0 144 0c44.2 0 80 35.8 80 80v16.2c18.8 15.3 37.6 34.6 37.6 78.4 0 4.1-.3 8.1-.8 12L304 208c12.4 4.4 22.4 13.3 28.2 24.8l38.1 76.2c6.1 12.2 8.8 25.8 7.7 39.4l-4.5 58.4C371.7 429.1 352.5 448 330.2 448H192c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64v-38.5zm64-188.9V306c0 5.5 4.5 10 10 10h2.3c4 0 7.5-2.4 9.1-6l48-112c2.8-6.5-2.1-13.6-9.1-13.6H96.8c-8 0-13.8 7.7-13.8 15.1V156.6zM80 96a16 16 0 1 0 0-32 16 16 0 1 0 0 32z"/>
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

  const isGolf     = variant === 'golf';
  const isHorses   = variant === 'horses';
  const isFootball = variant === 'football';
  const theme    = isGolf ? GOLF_THEME : isHorses ? HORSES_THEME : isFootball ? FOOTBALL_THEME : BBALL_THEME;
  const navLinks = isGolf ? GOLF_NAV   : isHorses ? HORSES_NAV   : isFootball ? FOOTBALL_NAV   : BBALL_NAV;

  // ── Visibility guard for the global (non-variant) navbar ──────────────────
  const path        = location.pathname;
  const isGolfRoute   = path.startsWith('/golf');
  const isHorsesRoute   = path.startsWith('/horses');
  const isFootballRoute = path.startsWith('/football');
  const isHub       = path === '/';
  const isAuthPage  = path === '/login' || path === '/register' ||
                      path === '/forgot-password' || path === '/reset-password';
  // /account/* uses its own hub-style nav embedded in the page
  const isAccountPage = path.startsWith('/account');

  // ── Live games polling (basketball only, when logged in, not on golf routes) ─
  useEffect(() => {
    if (!user || isGolf || isGolfRoute) return;
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
  }, [user, isGolf, isGolfRoute]);

  if (!isGolf && !isHorses && !isFootball && (isGolfRoute || isHorsesRoute || isFootballRoute || isHub || isAuthPage || isAccountPage)) return null;

  // ── Shared handlers / helpers ─────────────────────────────────────────────

  const handleLogout = () => {
    logout();
    navigate(isGolf ? '/golf' : isHorses ? '/horses' : isFootball ? '/football' : '/basketball');
    setMenuOpen(false);
  };

  const isActive = (p) => path === p || path.startsWith(p + '/');

  const adminPath = isGolf ? '/golf/admin' : isHorses ? '/horses/admin' : isFootball ? '/football' : '/basketball/admin';

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
  const golfNotif = useGolfNotifications(isGolf && user ? user.id : null);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <nav style={{ background: theme.bg, borderBottom: `0.5px solid ${theme.border}`, borderLeft: isHorses ? '3px solid #2AA6A6' : undefined, position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* ── Logo ── */}
        <Link
          to={isGolf ? '/golf' : isHorses ? '/horses/dashboard' : isFootball ? '/football' : '/basketball'}
          className="select-none"
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
        >
          {!isHorses && !isFootball && (isGolf ? <GolfBallSVG /> : <BasketballSVG />)}
          {isFootball && <span style={{ fontSize: 22, lineHeight: 1 }}>🏈</span>}
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1, fontWeight: isHorses ? 800 : undefined }}>
              <span style={{ color: '#ffffff', fontWeight: isHorses ? 800 : 400 }}>tourney</span>
              <span style={{ color: theme.runColor, fontWeight: isHorses ? 800 : 500 }}>run</span>
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: theme.subtitleColor, marginTop: 2 }}>
              {isGolf ? 'Fantasy Golf' : isHorses ? 'Horse Racing' : isFootball ? 'Fantasy Football' : 'Player Pool Fantasy'}
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
              {isGolf && <GolfBellMenu {...golfNotif} />}
              <div style={{ width: '0.5px', height: 18, background: theme.divider, flexShrink: 0 }} />
              <Link
                to="/account/profile"
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

        {/* ── Mobile: bell (golf + logged in) + hamburger ── */}
        <div className="md:hidden flex items-center" style={{ gap: 2 }}>
          {isGolf && user && (
            // Wrap in div so clicking bell also closes the hamburger menu
            <div onClick={() => setMenuOpen(false)}>
              <GolfBellMenu {...golfNotif} />
            </div>
          )}
          <button
            className="p-2 rounded-lg transition-colors"
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
      </div>

      {/* ── Mobile menu ── */}
      {menuOpen && (
        <div style={{ borderTop: `0.5px solid ${theme.border}`, padding: '12px 24px' }}>
          {user ? (
            <>
              <Link
                to="/account/profile"
                onClick={() => setMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}
              >
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: theme.avatarBg, border: `1px solid ${theme.avatarBorder}`, color: theme.avatarText, fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {initials}
                </span>
                <span>{user.display_name || user.username}</span>
              </Link>
              {isGolf && (
                <button
                  onClick={() => { golfNotif.markAllRead(); setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: golfNotif.unreadCount > 0 ? '#4ade80' : '#6b7280' }}
                >
                  <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                    <BellSVG />
                    {golfNotif.unreadCount > 0 && (
                      <span style={{ position: 'absolute', top: -3, right: -4, minWidth: 14, height: 14, borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px' }}>
                        {golfNotif.unreadCount > 9 ? '9+' : golfNotif.unreadCount}
                      </span>
                    )}
                  </span>
                  <span>
                    {golfNotif.unreadCount > 0 ? `Notifications (${golfNotif.unreadCount} unread)` : 'Notifications'}
                  </span>
                </button>
              )}
              {navLinks.map(({ to, label, live }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, color: isActive(to) ? (isGolf ? '#4ade80' : isHorses ? '#5cd4d4' : '#e5e7eb') : '#d1d5db', textDecoration: 'none', fontSize: 14 }}
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
                  style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: isGolf ? '#4ade80' : isHorses ? '#5cd4d4' : '#f59e0b', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}
                >
                  {isGolf ? 'Golf Admin' : isHorses ? 'Racing Admin' : 'Admin'}
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
