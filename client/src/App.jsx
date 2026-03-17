import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Component } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
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
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-950">
          <Navbar />
          <BossMode />
          <FloatingChat />
          <SindariusWidget />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/create-league" element={<ProtectedRoute><CreateLeague /></ProtectedRoute>} />
            <Route path="/join-league" element={<ProtectedRoute><JoinLeague /></ProtectedRoute>} />
            <Route path="/league/:id" element={<ProtectedRoute><LeagueHome /></ProtectedRoute>} />
            <Route path="/league/:id/draft" element={<ProtectedRoute><ErrorBoundary><DraftRoom /></ErrorBoundary></ProtectedRoute>} />
            <Route path="/league/:id/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
            <Route path="/league/:id/admin" element={<ProtectedRoute><AdminScores /></ProtectedRoute>} />
            {/* Legacy commissioner payment success — kept so old bookmarks don't 404 */}
            <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
            {/* Per-league access fee payment success page */}
            <Route path="/payment/entry-success" element={<ProtectedRoute><EntryPaymentSuccess /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/strategy" element={<ProtectedRoute><StrategyHub /></ProtectedRoute>} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/games" element={<ProtectedRoute><Games /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
            <Route path="/golf" element={<GolfLanding />} />
            <Route path="/golf/dashboard" element={<ProtectedRoute><GolfDashboard /></ProtectedRoute>} />
            <Route path="/golf/create" element={<ProtectedRoute><CreateGolfLeague /></ProtectedRoute>} />
            <Route path="/golf/join" element={<ProtectedRoute><JoinGolfLeague /></ProtectedRoute>} />
            <Route path="/golf/league/:id" element={<ProtectedRoute><GolfLeague /></ProtectedRoute>} />
            <Route path="/golf/league/:id/draft" element={<ProtectedRoute><GolfDraft /></ProtectedRoute>} />
            <Route path="/golf/league/:id/auction" element={<ProtectedRoute><GolfAuctionDraft /></ProtectedRoute>} />
            <Route path="/golf/league/:id/scores" element={<ProtectedRoute><GolfScoreEntry /></ProtectedRoute>} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
