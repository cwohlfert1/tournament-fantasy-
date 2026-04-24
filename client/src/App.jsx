import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Component, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import BallLoader from './components/BallLoader';
import GolfLoader from './components/golf/GolfLoader';
import BossMode from './components/BossMode';
import FloatingChat from './components/FloatingChat';
import SindariusWidget from './components/SindariusWidget';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#fff', background: '#111', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ fontSize: 40 }}>💥</div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h2>
          <p style={{ color: '#94a3b8', margin: 0 }}>Try refreshing the page.</p>
          <button onClick={() => window.history.back()} style={{ padding: '8px 20px', borderRadius: 8, background: '#378ADD', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14 }}>
            ← Go Back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { useParams } from 'react-router-dom';
import HubLanding from './pages/HubLanding';

// Auth-aware login redirects — send logged-in users to their dashboard,
// unauthenticated users to the shared /login page.
function GolfLoginRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <GolfLoader fullScreen />;
  return <Navigate to={user ? '/golf/dashboard' : '/login?then=%2Fgolf%2Fdashboard'} replace />;
}
function BasketballLoginRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <BallLoader fullScreen />;
  return <Navigate to={user ? '/basketball/dashboard' : '/login'} replace />;
}

// Redirect /golf/join/:code → /golf/join?code=CODE
function GolfJoinCode() {
  const { code } = useParams();
  return <Navigate to={`/golf/join?code=${code}`} replace />;
}

// Redirect helpers that preserve dynamic :id params
function RedirectLeague() { const { id } = useParams(); return <Navigate to={`/basketball/league/${id}`} replace />; }
function RedirectLeagueDraft() { const { id } = useParams(); return <Navigate to={`/basketball/league/${id}/draft`} replace />; }
function RedirectLeagueLeaderboard() { const { id } = useParams(); return <Navigate to={`/basketball/league/${id}/leaderboard`} replace />; }
function RedirectLeagueAdmin() { const { id } = useParams(); return <Navigate to={`/basketball/league/${id}/admin`} replace />; }
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import CreateLeague from './pages/CreateLeague';
import JoinLeague from './pages/JoinLeague';
import LeagueHome from './pages/LeagueHome';
import DraftRoom from './pages/DraftRoom';
import Leaderboard from './pages/Leaderboard';
import AdminScores from './pages/AdminScores';
import PaymentSuccess from './pages/PaymentSuccess';
import EntryPaymentSuccess from './pages/EntryPaymentSuccess';
import Login from './pages/Login';
import Register from './pages/Register';
import RefRedirect from './pages/RefRedirect';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import ForcePasswordReset from './pages/ForcePasswordReset';
import StrategyHub from './pages/StrategyHub';
import FAQ from './pages/FAQ';
import SuperAdmin from './pages/SuperAdmin';
import Games from './pages/Games';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import GolfLanding from './pages/golf/GolfLanding';
import GolfDashboard from './pages/golf/GolfDashboard';
import CreateGolfLeague from './pages/golf/CreateGolfLeague';
import JoinGolfLeague from './pages/golf/JoinGolfLeague';
import GolfLeague from './pages/golf/GolfLeague';
import GolfDraft from './pages/golf/GolfDraft';
import GolfAuctionDraft from './pages/golf/GolfAuctionDraft';
import GolfScoreEntry from './pages/golf/GolfScoreEntry';
import GolfStrategy from './pages/golf/GolfStrategy';
import GolfNews from './pages/golf/GolfNews';
import GolfFaq from './pages/golf/GolfFaq';
import GolfPaymentSuccess from './pages/golf/GolfPaymentSuccess';
import GolfSuperAdmin from './pages/golf/GolfSuperAdmin';
import GolfLeagueSettings from './pages/golf/GolfLeagueSettings';
import GolfPoolPicks from './pages/golf/GolfPoolPicks';
import GolfPoolPicksSubmitted from './pages/golf/GolfPoolPicksSubmitted';
import GolfLayout from './components/GolfLayout';
import HorsesLayout from './pages/horses/HorsesLayout';
import HorsesDashboard from './pages/horses/HorsesDashboard';
import CreateHorsesPool from './pages/horses/CreateHorsesPool';
import JoinHorsesPool from './pages/horses/JoinHorsesPool';
import HorsesPool from './pages/horses/HorsesPool';
import HorsesAdmin from './pages/horses/HorsesAdmin';
import InviteSignup from './pages/InviteSignup';

const GOLF_FAVICON = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='white' stroke='%23d1d5db' stroke-width='2'/><circle cx='38' cy='34' r='5' fill='%239ca3af'/><circle cx='55' cy='28' r='5' fill='%239ca3af'/><circle cx='68' cy='42' r='5' fill='%239ca3af'/><circle cx='32' cy='50' r='5' fill='%239ca3af'/><circle cx='50' cy='47' r='5' fill='%239ca3af'/><circle cx='65' cy='58' r='5' fill='%239ca3af'/><circle cx='40' cy='63' r='5' fill='%239ca3af'/><circle cx='60' cy='70' r='5' fill='%239ca3af'/></svg>`;
const BASKETBALL_FAVICON = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%23f97316' stroke='%23ea6900' stroke-width='1.5'/><path d='M50 2 Q65 25 65 50 Q65 75 50 98' fill='none' stroke='%23c2410c' stroke-width='3.5'/><path d='M50 2 Q35 25 35 50 Q35 75 50 98' fill='none' stroke='%23c2410c' stroke-width='3.5'/><path d='M2 50 Q25 38 50 38 Q75 38 98 50' fill='none' stroke='%23c2410c' stroke-width='3.5'/><path d='M2 50 Q25 62 50 62 Q75 62 98 50' fill='none' stroke='%23c2410c' stroke-width='3.5'/></svg>`;
const HUB_FAVICON = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%23111'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='900' font-size='52' fill='white'>TR</text></svg>`;
const HORSES_FAVICON = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%230a1414'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='900' font-size='52' fill='%232AA6A6'>TR</text></svg>`;

function FaviconSwap() {
  const location = useLocation();
  useEffect(() => {
    const isGolf = location.pathname.startsWith('/golf');
    const isHorses = location.pathname.startsWith('/horses');
    const isHub = location.pathname === '/';
    const icon = isGolf ? GOLF_FAVICON : isHorses ? HORSES_FAVICON : isHub ? HUB_FAVICON : BASKETBALL_FAVICON;
    const favicon = document.querySelector("link[rel*='icon']");
    const appleIcon = document.querySelector("link[rel*='apple-touch-icon']");
    if (favicon) favicon.href = icon;
    if (appleIcon) appleIcon.href = icon;
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <FaviconSwap />
        <div className="min-h-screen bg-gray-950">
          <Navbar />
          <BossMode />
          <FloatingChat />
          <SindariusWidget />
          <Routes>
            {/* ── Hub root ── */}
            <Route path="/" element={<HubLanding />} />

            {/* ── Auth (shared between products) ── */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/ref/:code" element={<RefRedirect />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/signup" element={<InviteSignup />} />
            {/* Force-reset: shown when superadmin sets a temp password */}
            <Route path="/account/set-password" element={<ForcePasswordReset />} />

            {/* ── Shared ── */}
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            {/* Canonical profile route — old paths redirect here */}
            <Route path="/account/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/profile" element={<Navigate to="/account/profile" replace />} />

            {/* ── Basketball (primary routes at /basketball/*) ── */}
            <Route path="/basketball" element={<Landing />} />
            <Route path="/basketball/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/basketball/create-league" element={<ProtectedRoute><CreateLeague /></ProtectedRoute>} />
            <Route path="/basketball/join-league" element={<ProtectedRoute><JoinLeague /></ProtectedRoute>} />
            <Route path="/basketball/league/:id" element={<ProtectedRoute><LeagueHome /></ProtectedRoute>} />
            <Route path="/basketball/league/:id/draft" element={<ProtectedRoute><ErrorBoundary><DraftRoom /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/basketball/league/:id/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
            <Route path="/basketball/league/:id/admin" element={<ProtectedRoute><AdminScores /></ProtectedRoute>} />
            <Route path="/basketball/payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
            <Route path="/basketball/payment/entry-success" element={<ProtectedRoute><EntryPaymentSuccess /></ProtectedRoute>} />
            <Route path="/basketball/strategy" element={<ProtectedRoute><StrategyHub /></ProtectedRoute>} />
            <Route path="/basketball/faq" element={<FAQ />} />
            <Route path="/basketball/games" element={<ProtectedRoute><Games /></ProtectedRoute>} />
            <Route path="/basketball/admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
            <Route path="/basketball/home" element={<Navigate to="/basketball/dashboard" replace />} />
            <Route path="/basketball/login" element={<BasketballLoginRedirect />} />

            {/* ── Basketball legacy redirects (backward compat for old bookmarks / internal nav) ── */}
            <Route path="/dashboard" element={<Navigate to="/basketball/dashboard" replace />} />
            <Route path="/create-league" element={<Navigate to="/basketball/create-league" replace />} />
            <Route path="/join-league" element={<Navigate to="/basketball/join-league" replace />} />
            <Route path="/league/:id" element={<RedirectLeague />} />
            <Route path="/league/:id/draft" element={<RedirectLeagueDraft />} />
            <Route path="/league/:id/leaderboard" element={<RedirectLeagueLeaderboard />} />
            <Route path="/league/:id/admin" element={<RedirectLeagueAdmin />} />
            <Route path="/payment/success" element={<Navigate to="/basketball/payment/success" replace />} />
            <Route path="/payment/entry-success" element={<Navigate to="/basketball/payment/entry-success" replace />} />
            <Route path="/strategy" element={<Navigate to="/basketball/strategy" replace />} />
            <Route path="/faq" element={<Navigate to="/basketball/faq" replace />} />
            <Route path="/games" element={<Navigate to="/basketball/games" replace />} />
            <Route path="/admin" element={<Navigate to="/basketball/admin" replace />} />

            {/* ── Golf standalone redirects (outside GolfLayout to avoid layout flash) ── */}
            <Route path="/golf/login" element={<GolfLoginRedirect />} />
            <Route path="/golf/home" element={<Navigate to="/golf/dashboard" replace />} />

            {/* ── Golf ── */}
            <Route element={<GolfLayout />}>
              <Route path="/golf" element={<GolfLanding />} />
              <Route path="/golf/dashboard" element={<ProtectedRoute><GolfDashboard /></ProtectedRoute>} />
              <Route path="/golf/create" element={<ProtectedRoute><CreateGolfLeague /></ProtectedRoute>} />
              <Route path="/golf/join" element={<JoinGolfLeague />} />
              <Route path="/golf/join/:code" element={<GolfJoinCode />} />
              <Route path="/golf/register" element={<Navigate to="/register" replace />} />
              <Route path="/golf/league/:id" element={<ProtectedRoute><GolfLeague /></ProtectedRoute>} />
              <Route path="/golf/league/:id/draft" element={<ProtectedRoute><GolfDraft /></ProtectedRoute>} />
              <Route path="/golf/league/:id/auction" element={<ProtectedRoute><GolfAuctionDraft /></ProtectedRoute>} />
              <Route path="/golf/league/:id/scores" element={<ProtectedRoute><GolfScoreEntry /></ProtectedRoute>} />
              <Route path="/golf/league/:id/settings" element={<ProtectedRoute><GolfLeagueSettings /></ProtectedRoute>} />
              <Route path="/golf/league/:id/picks" element={<ProtectedRoute><GolfPoolPicks /></ProtectedRoute>} />
              <Route path="/golf/league/:id/picks/submitted" element={<ProtectedRoute><GolfPoolPicksSubmitted /></ProtectedRoute>} />
              <Route path="/golf/strategy" element={<GolfStrategy />} />
              <Route path="/golf/news" element={<GolfNews />} />
              <Route path="/golf/profile" element={<Navigate to="/account/profile" replace />} />
              <Route path="/golf/faq" element={<GolfFaq />} />
              <Route path="/golf/payment/success" element={<GolfPaymentSuccess />} />
              <Route path="/golf/admin" element={<ProtectedRoute><GolfSuperAdmin /></ProtectedRoute>} />
            </Route>

            {/* ── Horses ── */}
            <Route element={<HorsesLayout />}>
              <Route path="/horses" element={<Navigate to="/horses/dashboard" replace />} />
              <Route path="/horses/dashboard" element={<ProtectedRoute><HorsesDashboard /></ProtectedRoute>} />
              <Route path="/horses/create" element={<ProtectedRoute><CreateHorsesPool /></ProtectedRoute>} />
              <Route path="/horses/join" element={<JoinHorsesPool />} />
              <Route path="/horses/join/:code" element={<JoinHorsesPool />} />
              <Route path="/horses/pool/:id" element={<ProtectedRoute><HorsesPool /></ProtectedRoute>} />
              <Route path="/horses/admin" element={<ProtectedRoute><HorsesAdmin /></ProtectedRoute>} />
            </Route>
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
