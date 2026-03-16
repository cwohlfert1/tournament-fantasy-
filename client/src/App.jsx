import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-950">
          <Navbar />
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
            <Route path="/league/:id/draft" element={<ProtectedRoute><DraftRoom /></ProtectedRoute>} />
            <Route path="/league/:id/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
            <Route path="/league/:id/admin" element={<ProtectedRoute><AdminScores /></ProtectedRoute>} />
            {/* Legacy commissioner payment success — kept so old bookmarks don't 404 */}
            <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
            {/* Per-league access fee payment success page */}
            <Route path="/payment/entry-success" element={<ProtectedRoute><EntryPaymentSuccess /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/strategy" element={<ProtectedRoute><StrategyHub /></ProtectedRoute>} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/admin" element={<ProtectedRoute><SuperAdmin /></ProtectedRoute>} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
