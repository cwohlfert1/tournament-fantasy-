import { useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

function setMeta(name, content, isProperty = false) {
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

export default function HorsesLayout() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    document.title = 'Horse Racing Pools | TourneyRun';
    setMeta('description', 'Kentucky Derby pools made easy. Random draw, pick win/place/show, or squares.');
    setMeta('og:title', 'Horse Racing Pools | TourneyRun', true);
    setMeta('og:description', 'Kentucky Derby pools made easy.', true);
  }, []);

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/horses/dashboard" className="text-white font-bold text-lg tracking-tight">
            TourneyRun <span className="text-horses-400">Racing</span>
          </Link>
          <div className="flex items-center gap-4">
            {user && (
              <>
                <Link
                  to="/horses/dashboard"
                  className={`text-sm ${isActive('/horses/dashboard') ? 'text-white underline underline-offset-4' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/horses/create"
                  className={`text-sm ${isActive('/horses/create') ? 'text-white underline underline-offset-4' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  Create Pool
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
      <Outlet />
    </>
  );
}
