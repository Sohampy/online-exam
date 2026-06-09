import { Navigate } from 'react-router-dom';import { useAuth } from '../../contexts/AuthContext.jsx';
export default function DashboardRedirect(){const {profile}=useAuth();if(profile?.role==='main_admin')return <Navigate to="/admin" replace/>;if(profile?.role==='teacher')return <Navigate to="/teacher" replace/>;return <Navigate to="/student" replace/>;}
