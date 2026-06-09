import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ProtectedRoute({ children, roles = [] }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles.length && !roles.includes(profile?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}
