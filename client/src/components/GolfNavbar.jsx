import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function userInitials(user) {
  const src = user?.display_name || user?.username || '';
  const words = src.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const NAV_LINKS = [
  { to: '/golf/dashboard', label: 'My Leagues' },
  { to: '/golf/strategy',  label: 'Strategy'   },
  { to: '/golf/faq',       label: 'FAQ'        },
];

export default function GolfNavbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/golf');
    setMenuOpen(false);
  };

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const navLink = (path) => {
    const active = isActive(path);
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: active ? 500 : 400,
      color: active ? '#ffffff' : '#6b7280',
      background: active ? '#14532d33' : 'transparent',
      transition: 'color 0.15s, background 0.15s',
      textDecoration: 'none',
      cursor: 'pointer',
    };
  };

  const initials = userInitials(user);

  return (
    <nav style={{
      background: '#0a1a0f',
      borderBottom: '0.5px solid #14532d55',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* LEFT: Logo */}
        <Link to="/golf" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <span style={{ color: '#ffffff', fontWeight: 400 }}>tourney</span>
              <span style={{ color: '#22c55e', fontWeight: 500 }}>run</span>
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#16a34a', marginTop: 2 }}>
              Fantasy Golf
            </div>
          </div>
        </Link>

        {/* CENTER: Nav links (desktop) */}
        <div className="hidden md:flex items-center" style={{ gap: 2 }}>
          {NAV_LINKS.map(({ to, label }) => {
            const style = navLink(to);
            const hoverIn  = e => { if (!isActive(to)) { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.background = '#14532d33'; } };
            const hoverOut = e => { if (!isActive(to)) { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; } };
            return (
              <Link key={to} to={to} style={style} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                {label}
              </Link>
            );
          })}
          <a
            href="/golf#how-it-works"
            style={navLink('/golf#how-it-works')}
            onMouseEnter={e => { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.background = '#14532d33'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
          >
            How to Play
          </a>
        </div>

        {/* RIGHT: Auth (desktop) */}
        <div className="hidden md:flex items-center" style={{ gap: 10 }}>
          {user ? (
            <>
              {user.role === 'superadmin' && (
                <Link
                  to="/golf/admin"
                  style={{ ...navLink('/golf/admin'), color: isActive('/golf/admin') ? '#fff' : '#4ade80', fontWeight: 600 }}
                  onMouseEnter={e => { if (!isActive('/golf/admin')) { e.currentTarget.style.color = '#86efac'; e.currentTarget.style.background = '#14532d33'; } }}
                  onMouseLeave={e => { if (!isActive('/golf/admin')) { e.currentTarget.style.color = '#4ade80'; e.currentTarget.style.background = 'transparent'; } }}
                >
                  Golf Admin
                </Link>
              )}
              <div style={{ width: '0.5px', height: 18, background: '#1a3a1a', flexShrink: 0 }} />
              <Link
                to="/profile"
                title={user.display_name || user.username}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: '#14532d33',
                  border: '1px solid #22c55e55',
                  color: '#4ade80',
                  fontSize: 11,
                  fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none',
                  flexShrink: 0,
                  letterSpacing: '0.02em',
                }}
              >
                {initials}
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#6b7280',
                  border: '0.5px solid #1a3a1a',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.borderColor = '#6b7280'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#1a3a1a'; }}
              >
                Logout
              </button>
            </>
          ) : (
            <div className="flex items-center" style={{ gap: 10 }}>
              <Link to="/login" style={{ fontSize: 14, color: '#9ca3af', textDecoration: 'none', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
              >
                Login
              </Link>
              <Link to="/register" style={{
                fontSize: 14,
                background: '#16a34a',
                color: '#fff',
                padding: '6px 16px',
                borderRadius: 8,
                fontWeight: 500,
                textDecoration: 'none',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
                onMouseLeave={e => e.currentTarget.style.background = '#16a34a'}
              >
                Register
              </Link>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
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

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{ borderTop: '0.5px solid #14532d55', padding: '12px 24px' }}>
          {user ? (
            <>
              <Link to="/profile" onClick={() => setMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}
              >
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#14532d33', border: '1px solid #22c55e55', color: '#4ade80', fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {initials}
                </span>
                <span>{user.display_name || user.username}</span>
              </Link>
              {NAV_LINKS.map(({ to, label }) => (
                <Link key={to} to={to} onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: isActive(to) ? '#4ade80' : '#d1d5db', textDecoration: 'none', fontSize: 14 }}
                >
                  {label}
                </Link>
              ))}
              <a href="/golf#how-it-works" onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}
              >
                How to Play
              </a>
              {user.role === 'superadmin' && (
                <Link to="/golf/admin" onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: '#4ade80', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}
                >
                  Golf Admin
                </Link>
              )}
              <button onClick={handleLogout}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, color: '#6b7280', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <a href="/golf#how-it-works" onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}
              >
                How to Play
              </a>
              <Link to="/login" onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: '#d1d5db', textDecoration: 'none', fontSize: 14 }}
              >
                Login
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)}
                style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: '#4ade80', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}
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
