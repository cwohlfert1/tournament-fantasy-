import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

// Derive 1–2 initials from display_name or username
function userInitials(user) {
  const src = user?.display_name || user?.username || '';
  const words = src.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasLiveGames, setHasLiveGames] = useState(false);

  // Poll for live games every 60s (only when logged in)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await api.get('/games/schedule');
        if (!cancelled) {
          setHasLiveGames((res.data.games || []).some(g => g.is_live));
        }
      } catch {}
    };
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/basketball');
    setMenuOpen(false);
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isGolf = location.pathname.startsWith('/golf');
  const isHub  = location.pathname === '/';

  // Golf routes render their own GolfNavbar; hub has its own minimal nav
  if (isGolf || isHub) return null;

  // Pill link style helper
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
      background: active ? '#1f2937' : 'transparent',
      transition: 'color 0.15s, background 0.15s',
      textDecoration: 'none',
      cursor: 'pointer',
    };
  };

  const initials = userInitials(user);

  return (
    <nav style={{
      background: '#111827',
      borderBottom: '0.5px solid #1f2937',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* ── LEFT: Logo ── */}
        <Link to={isGolf ? '/golf' : '/basketball'} className="flex items-center gap-2.5 select-none" style={{ textDecoration: 'none' }}>
          {isGolf ? (
            <svg viewBox="0 0 32 32" fill="none" style={{ width: 26, height: 26, lineHeight: 1, flexShrink: 0 }}>
              <circle cx="16" cy="16" r="15" fill="white" stroke="#d1d5db" strokeWidth="0.8"/>
              <circle cx="12" cy="11" r="1.1" fill="#9ca3af"/>
              <circle cx="17" cy="9" r="1.1" fill="#9ca3af"/>
              <circle cx="21" cy="13" r="1.1" fill="#9ca3af"/>
              <circle cx="10" cy="16" r="1.1" fill="#9ca3af"/>
              <circle cx="15" cy="15" r="1.1" fill="#9ca3af"/>
              <circle cx="20" cy="18" r="1.1" fill="#9ca3af"/>
              <circle cx="13" cy="20" r="1.1" fill="#9ca3af"/>
              <circle cx="19" cy="22" r="1.1" fill="#9ca3af"/>
            </svg>
          ) : (
            <span style={{ fontSize: 22, lineHeight: 1 }}>🏀</span>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <div style={{ fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1 }}>
              <span style={{ color: '#ffffff', fontWeight: 400 }}>tourney</span><span style={{ color: '#f97316', fontWeight: 500 }}>run</span>
            </div>
            <div style={{ fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: isGolf ? '#22c55e' : '#888780', marginTop: 2 }}>
              {isGolf ? 'Fantasy Golf' : 'Player Pool Fantasy'}
            </div>
          </div>
        </Link>

        {/* ── CENTER: Nav links (desktop) ── */}
        {(user || isGolf) && (
          <div className="hidden md:flex items-center" style={{ gap: 2 }}>
            {(isGolf ? [
              { to: '/golf/dashboard', label: 'My Leagues' },
              { to: '/golf/strategy',  label: 'Strategy'   },
              { to: '/golf/faq',       label: 'FAQ'        },
              { to: '/golf#how-it-works', label: 'How to Play', isAnchor: true },
            ] : [
              { to: '/basketball/dashboard', label: 'Dashboard' },
              { to: '/basketball/games',     label: 'Games', live: true },
              { to: '/basketball/strategy',  label: 'Strategy' },
              { to: '/basketball/faq',       label: 'FAQ'      },
            ]).map(({ to, label, live, isAnchor }) => {
              const style = navLink(to);
              const hoverIn  = e => { if (!isActive(to)) { e.currentTarget.style.color = '#e5e7eb'; e.currentTarget.style.background = '#1f2937'; } };
              const hoverOut = e => { if (!isActive(to)) { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; } };
              if (isAnchor) {
                return (
                  <a key={to} href={to} style={style} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                    {label}
                  </a>
                );
              }
              return (
                <Link key={to} to={to} style={style} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                  {live && hasLiveGames && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0, animation: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite' }} />
                  )}
                  {label}
                </Link>
              );
            })}
          </div>
        )}

        {/* ── RIGHT: Actions (desktop) ── */}
        <div className="hidden md:flex items-center" style={{ gap: 10 }}>
          {user ? (
            <>
              {user.role === 'superadmin' && (
                <Link
                  to="/basketball/admin"
                  style={{ ...navLink('/basketball/admin'), color: isActive('/basketball/admin') ? '#fff' : '#f59e0b', fontWeight: 500 }}
                  onMouseEnter={e => {
                    if (!isActive('/basketball/admin')) {
                      e.currentTarget.style.color = '#fcd34d';
                      e.currentTarget.style.background = '#1f2937';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive('/basketball/admin')) {
                      e.currentTarget.style.color = '#f59e0b';
                      e.currentTarget.style.background = isActive('/basketball/admin') ? '#1f2937' : 'transparent';
                    }
                  }}
                >
                  Admin
                </Link>
              )}

              {/* Divider */}
              <div style={{ width: '0.5px', height: 18, background: '#374151', flexShrink: 0 }} />

              {/* Avatar */}
              <Link
                to="/profile"
                title={user.display_name || user.username}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: '#7c3aed22',
                  border: '1px solid #7c3aed55',
                  color: '#a78bfa',
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

              {/* Logout */}
              <button
                onClick={handleLogout}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#6b7280',
                  border: '0.5px solid #374151',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#e5e7eb';
                  e.currentTarget.style.borderColor = '#6b7280';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#6b7280';
                  e.currentTarget.style.borderColor = '#374151';
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <div className="flex items-center" style={{ gap: 10 }}>
              <Link to="/login" className="text-gray-300 hover:text-white font-medium transition-colors" style={{ fontSize: 14 }}>
                Login
              </Link>
              <Link to="/register" className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium transition-colors" style={{ fontSize: 14 }}>
                Register
              </Link>
            </div>
          )}
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
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
        <div className="md:hidden border-t border-gray-800 py-3 space-y-1" style={{ padding: '12px 24px' }}>
          {isGolf ? (
            <>
              {user && (
                <>
                  <Link to="/profile" className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm" onClick={() => setMenuOpen(false)}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#7c3aed22', border: '1px solid #7c3aed55', color: '#a78bfa', fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</span>
                    <span>{user.display_name || user.username}</span>
                  </Link>
                  <Link to="/golf/dashboard" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>My Leagues</Link>
                  <Link to="/golf/strategy" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>Strategy</Link>
                  <Link to="/golf/faq" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>FAQ</Link>
                  <a href="/golf#how-it-works" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm" onClick={() => setMenuOpen(false)}>How to Play</a>
                  {user.role === 'superadmin' && (
                    <Link to="/admin" className="block px-3 py-2 text-yellow-400 hover:text-yellow-300 hover:bg-gray-800 rounded-lg transition-colors font-medium" onClick={() => setMenuOpen(false)}>Admin</Link>
                  )}
                  <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm">Logout</button>
                </>
              )}
              {!user && (
                <>
                  <a href="/golf#how-it-works" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm" onClick={() => setMenuOpen(false)}>How to Play</a>
                  <Link to="/login" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>Login</Link>
                  <Link to="/register" className="block px-3 py-2 text-green-400 hover:text-green-300 hover:bg-gray-800 rounded-lg transition-colors font-medium" onClick={() => setMenuOpen(false)}>Register</Link>
                </>
              )}
            </>
          ) : (
            <>
              {user ? (
                <>
                  <Link to="/profile" className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm" onClick={() => setMenuOpen(false)}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#7c3aed22', border: '1px solid #7c3aed55', color: '#a78bfa', fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</span>
                    <span>{user.display_name || user.username}</span>
                  </Link>
                  <Link to="/basketball/dashboard" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>Dashboard</Link>
                  <Link to="/basketball/games" className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>
                    {hasLiveGames && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', flexShrink: 0, animation: 'pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite' }} />}
                    Games
                  </Link>
                  <Link to="/basketball/strategy" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>Strategy</Link>
                  <Link to="/basketball/faq" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>FAQ</Link>
                  {user.role === 'superadmin' && (
                    <Link to="/basketball/admin" className="block px-3 py-2 text-yellow-400 hover:text-yellow-300 hover:bg-gray-800 rounded-lg transition-colors font-medium" onClick={() => setMenuOpen(false)}>Admin</Link>
                  )}
                  <button onClick={handleLogout} className="block w-full text-left px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm">Logout</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setMenuOpen(false)}>Login</Link>
                  <Link to="/register" className="block px-3 py-2 text-brand-400 hover:text-brand-300 hover:bg-gray-800 rounded-lg transition-colors font-medium" onClick={() => setMenuOpen(false)}>Register</Link>
                </>
              )}
            </>
          )}
        </div>
      )}
    </nav>
  );
}
