import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
    setMenuOpen(false);
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 select-none">
            <span className="text-2xl flex items-center justify-center w-9 h-9 shrink-0">🏀</span>
            <div className="flex flex-col leading-none">
              <div style={{ fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1 }}>
                <span style={{ color: '#B5D4F4', fontWeight: 300 }}>tourney</span><span style={{ color: '#378ADD', fontWeight: 800 }}>run</span>
              </div>
              <div className="text-[10px] tracking-[0.18em] uppercase mt-0.5" style={{ color: '#888780', fontVariant: 'small-caps' }}>
                Player Pool Fantasy
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {user ? (
              <>
                <Link to="/dashboard" className="text-gray-300 hover:text-brand-400 transition-colors font-medium">
                  Dashboard
                </Link>
                <Link to="/strategy" className="text-gray-300 hover:text-brand-400 transition-colors font-medium">
                  Strategy
                </Link>
                <Link to="/faq" className="text-gray-300 hover:text-brand-400 transition-colors font-medium">
                  FAQ
                </Link>
                {user?.role === 'superadmin' && (
                  <Link to="/admin" className="text-yellow-400 hover:text-yellow-300 transition-colors font-medium">
                    Admin
                  </Link>
                )}
                <div className="flex items-center gap-3">
                  <Link to="/profile" className="text-gray-400 text-sm hover:text-brand-300 transition-colors">
                    <span className="text-brand-400 font-semibold hover:text-brand-300">{user.username}</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="text-gray-300 hover:text-white font-medium transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
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

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-800 py-3 space-y-1">
            {user ? (
              <>
                <Link
                  to="/profile"
                  className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors text-sm"
                  onClick={() => setMenuOpen(false)}
                >
                  Signed in as <span className="text-brand-400 font-semibold">{user.username}</span>
                </Link>
                <Link
                  to="/dashboard"
                  className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  to="/strategy"
                  className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Strategy
                </Link>
                <Link
                  to="/faq"
                  className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  FAQ
                </Link>
                {user?.role === 'superadmin' && (
                  <Link
                    to="/admin"
                    className="block px-3 py-2 text-yellow-400 hover:text-yellow-300 hover:bg-gray-800 rounded-lg transition-colors font-medium"
                    onClick={() => setMenuOpen(false)}
                  >
                    Admin
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="block px-3 py-2 text-brand-400 hover:text-brand-300 hover:bg-gray-800 rounded-lg transition-colors font-medium"
                  onClick={() => setMenuOpen(false)}
                >
                  Register
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
