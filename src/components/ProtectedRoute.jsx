import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ProtectedRoute({ children, roles = [] }) {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.is_active === false) return <div className="center-screen"><div className="panel"><h1>Account Removed</h1><p>Your account is inactive. Contact the main admin for access.</p></div></div>;
  if (roles.length && !roles.includes(profile?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}
