import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BallLoader from './BallLoader';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <BallLoader fullScreen />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
