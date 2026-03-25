import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from '../Navbar';
import { useAuth } from '../../contexts/AuthContext';

// Mock the auth context so tests never touch localStorage or real providers
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));

// Mock the api module to prevent the games-schedule polling useEffect from
// making real HTTP calls (and to avoid import.meta.env evaluation in jsdom)
vi.mock('../../api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { games: [] } }) },
}));

// ── Shared auth states ──────────────────────────────────────────────────────

const LOGGED_OUT = { user: null, logout: vi.fn() };
const LOGGED_IN = {
  user: { id: '1', username: 'alice', display_name: 'Alice', role: 'user' },
  logout: vi.fn(),
};
const SUPERADMIN = {
  user: { id: '2', username: 'bob', display_name: 'Bob', role: 'superadmin' },
  logout: vi.fn(),
};

function renderOn(path, auth = LOGGED_OUT) {
  vi.mocked(useAuth).mockReturnValue(auth);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
    </MemoryRouter>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Navbar', () => {
  beforeEach(() => vi.mocked(useAuth).mockReturnValue(LOGGED_OUT));

  // ── Null-render routes ───────────────────────────────────────────────────
  // Navbar.jsx explicitly returns null on these routes; GolfNavbar or the
  // hub's own nav handles them instead.

  describe('returns null on non-basketball routes', () => {
    it('hub (/)', () => {
      const { container } = renderOn('/');
      expect(container.firstChild).toBeNull();
    });
    it('/golf', () => {
      const { container } = renderOn('/golf');
      expect(container.firstChild).toBeNull();
    });
    it('/golf/league/abc123', () => {
      const { container } = renderOn('/golf/league/abc123');
      expect(container.firstChild).toBeNull();
    });
    it('/golf/dashboard', () => {
      const { container } = renderOn('/golf/dashboard');
      expect(container.firstChild).toBeNull();
    });
    it('/login', () => {
      const { container } = renderOn('/login');
      expect(container.firstChild).toBeNull();
    });
    it('/register', () => {
      const { container } = renderOn('/register');
      expect(container.firstChild).toBeNull();
    });
    it('/forgot-password', () => {
      const { container } = renderOn('/forgot-password');
      expect(container.firstChild).toBeNull();
    });
    it('/reset-password', () => {
      const { container } = renderOn('/reset-password');
      expect(container.firstChild).toBeNull();
    });
  });

  // ── Basketball, logged out ───────────────────────────────────────────────

  describe('/basketball, logged out', () => {
    it('renders a nav element', () => {
      const { container } = renderOn('/basketball');
      expect(container.firstChild).not.toBeNull();
    });
    it('shows Sign In link', () => {
      renderOn('/basketball');
      expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
    });
    it('shows Register link', () => {
      renderOn('/basketball');
      expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
    });
    it('does not show Logout button', () => {
      renderOn('/basketball');
      expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
    });
    // Nav links hidden when logged out on basketball (user || isGolf guard)
    it('does not show Dashboard nav link', () => {
      renderOn('/basketball');
      expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    });
    it('shows the basketball logo emoji', () => {
      renderOn('/basketball');
      expect(screen.getByText('🏀')).toBeInTheDocument();
    });
    it('shows Player Pool Fantasy subtitle', () => {
      renderOn('/basketball');
      expect(screen.getByText('Player Pool Fantasy')).toBeInTheDocument();
    });
  });

  // ── Basketball, logged in ────────────────────────────────────────────────

  describe('/basketball, logged in', () => {
    it('shows user initials in avatar', () => {
      renderOn('/basketball', LOGGED_IN);
      // display_name 'Alice' → slice(0,2).toUpperCase() = 'AL'
      expect(screen.getAllByText('AL').length).toBeGreaterThan(0);
    });
    it('shows Logout button', () => {
      renderOn('/basketball', LOGGED_IN);
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
    it('does not show Sign In link', () => {
      renderOn('/basketball', LOGGED_IN);
      expect(screen.queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument();
    });
    it('does not show Register link', () => {
      renderOn('/basketball', LOGGED_IN);
      expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument();
    });
    it('shows Dashboard nav link', () => {
      renderOn('/basketball', LOGGED_IN);
      expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    });
    it('shows Home nav link', () => {
      renderOn('/basketball', LOGGED_IN);
      expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0);
    });
    it('shows Strategy nav link', () => {
      renderOn('/basketball', LOGGED_IN);
      expect(screen.getAllByRole('link', { name: 'Strategy' }).length).toBeGreaterThan(0);
    });
    it('shows FAQ nav link', () => {
      renderOn('/basketball', LOGGED_IN);
      expect(screen.getAllByRole('link', { name: 'FAQ' }).length).toBeGreaterThan(0);
    });
    it('does not show Admin link for regular user', () => {
      renderOn('/basketball', LOGGED_IN);
      expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    });
    it('avatar links to /profile', () => {
      renderOn('/basketball', LOGGED_IN);
      const profileLinks = screen.getAllByRole('link', { name: 'AL' });
      expect(profileLinks.some(l => l.getAttribute('href') === '/profile')).toBe(true);
    });
  });

  // ── Basketball, superadmin ───────────────────────────────────────────────

  describe('/basketball, superadmin', () => {
    it('shows Admin link', () => {
      renderOn('/basketball', SUPERADMIN);
      expect(screen.getAllByRole('link', { name: 'Admin' }).length).toBeGreaterThan(0);
    });
    it('Admin link points to /basketball/admin', () => {
      renderOn('/basketball', SUPERADMIN);
      const adminLinks = screen.getAllByRole('link', { name: 'Admin' });
      expect(adminLinks.some(l => l.getAttribute('href') === '/basketball/admin')).toBe(true);
    });
  });

  // ── Nested basketball route ──────────────────────────────────────────────

  describe('/basketball/dashboard route', () => {
    it('renders (does not return null)', () => {
      const { container } = renderOn('/basketball/dashboard', LOGGED_IN);
      expect(container.firstChild).not.toBeNull();
    });
  });
});
