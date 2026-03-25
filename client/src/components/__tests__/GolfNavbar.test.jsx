import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GolfNavbar from '../GolfNavbar';
import { useAuth } from '../../contexts/AuthContext';

// GolfNavbar has no api import, but mock AuthContext to avoid real providers
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));

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

function renderGolfNavbar(path = '/golf', auth = LOGGED_OUT) {
  vi.mocked(useAuth).mockReturnValue(auth);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GolfNavbar />
    </MemoryRouter>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GolfNavbar', () => {
  beforeEach(() => vi.mocked(useAuth).mockReturnValue(LOGGED_OUT));

  // ── Branding (invariant across auth state) ───────────────────────────────

  describe('branding', () => {
    it('logo links to /golf', () => {
      renderGolfNavbar();
      const logoLink = screen.getAllByRole('link').find(
        l => l.getAttribute('href') === '/golf'
      );
      expect(logoLink).toBeDefined();
    });
    it('shows Fantasy Golf subtitle', () => {
      renderGolfNavbar();
      expect(screen.getByText('Fantasy Golf')).toBeInTheDocument();
    });
    it('shows "tourney" and "run" logo text', () => {
      renderGolfNavbar();
      expect(screen.getByText('tourney')).toBeInTheDocument();
      expect(screen.getByText('run')).toBeInTheDocument();
    });
  });

  // ── Nav links (always rendered regardless of auth) ───────────────────────

  describe('nav links', () => {
    it('shows My Leagues link', () => {
      renderGolfNavbar();
      expect(screen.getAllByRole('link', { name: 'My Leagues' }).length).toBeGreaterThan(0);
    });
    it('My Leagues points to /golf/dashboard', () => {
      renderGolfNavbar();
      const links = screen.getAllByRole('link', { name: 'My Leagues' });
      expect(links.some(l => l.getAttribute('href') === '/golf/dashboard')).toBe(true);
    });
    it('shows Strategy link', () => {
      renderGolfNavbar();
      expect(screen.getAllByRole('link', { name: 'Strategy' }).length).toBeGreaterThan(0);
    });
    it('shows FAQ link', () => {
      renderGolfNavbar();
      expect(screen.getAllByRole('link', { name: 'FAQ' }).length).toBeGreaterThan(0);
    });
    it('shows How to Play anchor', () => {
      renderGolfNavbar();
      // Anchor href contains #how-it-works; match by text since it is an <a>
      expect(screen.getAllByText('How to Play').length).toBeGreaterThan(0);
    });
  });

  // ── Logged out ───────────────────────────────────────────────────────────

  describe('logged out', () => {
    it('shows Login link', () => {
      renderGolfNavbar();
      expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
    });
    it('shows Register link', () => {
      renderGolfNavbar();
      expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
    });
    it('does not show Logout button', () => {
      renderGolfNavbar();
      expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument();
    });
    it('does not show Golf Admin link', () => {
      renderGolfNavbar();
      expect(screen.queryByRole('link', { name: 'Golf Admin' })).not.toBeInTheDocument();
    });
  });

  // ── Logged in ────────────────────────────────────────────────────────────

  describe('logged in', () => {
    it('shows user initials in avatar', () => {
      renderGolfNavbar('/golf', LOGGED_IN);
      // display_name 'Alice' → slice(0,2).toUpperCase() = 'AL'
      expect(screen.getAllByText('AL').length).toBeGreaterThan(0);
    });
    it('avatar links to /profile', () => {
      renderGolfNavbar('/golf', LOGGED_IN);
      const profileLinks = screen.getAllByRole('link', { name: 'AL' });
      expect(profileLinks.some(l => l.getAttribute('href') === '/profile')).toBe(true);
    });
    it('shows Logout button', () => {
      renderGolfNavbar('/golf', LOGGED_IN);
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
    it('does not show Login link', () => {
      renderGolfNavbar('/golf', LOGGED_IN);
      expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    });
    it('does not show Register link', () => {
      renderGolfNavbar('/golf', LOGGED_IN);
      expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument();
    });
    it('does not show Golf Admin link for regular user', () => {
      renderGolfNavbar('/golf', LOGGED_IN);
      expect(screen.queryByRole('link', { name: 'Golf Admin' })).not.toBeInTheDocument();
    });
  });

  // ── Superadmin ───────────────────────────────────────────────────────────

  describe('superadmin', () => {
    it('shows Golf Admin link', () => {
      renderGolfNavbar('/golf/league/abc', SUPERADMIN);
      expect(screen.getAllByRole('link', { name: 'Golf Admin' }).length).toBeGreaterThan(0);
    });
    it('Golf Admin link points to /golf/admin', () => {
      renderGolfNavbar('/golf/league/abc', SUPERADMIN);
      const links = screen.getAllByRole('link', { name: 'Golf Admin' });
      expect(links.some(l => l.getAttribute('href') === '/golf/admin')).toBe(true);
    });
  });

  // ── Golf league route (/golf/league/:id) ─────────────────────────────────

  describe('/golf/league/:id route', () => {
    it('renders on league page (does not throw)', () => {
      const { container } = renderGolfNavbar('/golf/league/tournament-abc123', LOGGED_IN);
      expect(container.firstChild).not.toBeNull();
    });
    it('shows Logout on league page', () => {
      renderGolfNavbar('/golf/league/tournament-abc123', LOGGED_IN);
      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });
  });
});
