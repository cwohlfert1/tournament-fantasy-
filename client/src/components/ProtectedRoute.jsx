import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BallLoader from './BallLoader';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <BallLoader fullScreen />;

  if (!user) {
    const then = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?then=${then}`} replace />;
  }

  return children;
}
