import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, FileQuestion, Home, Users, ShieldCheck, ClipboardList, LogOut, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function AppLayout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role;

  const roleLinks = role === 'main_admin'
    ? [
      ['/admin', 'Dashboard', Home], ['/admin/chapters', 'Chapters', BookOpen], ['/admin/questions', 'Question Bank', FileQuestion], ['/admin/exams', 'Exams', ClipboardList], ['/admin/reports', 'Reports', Users], ['/admin/permissions', 'Permissions', ShieldCheck]
    ]
    : role === 'teacher'
      ? [['/teacher', 'Dashboard', Home], ['/teacher/exams', 'Assigned Exams', ClipboardList], ['/teacher/reports', 'Reports', Users]]
      : [['/student', 'Dashboard', Home]];
  const links = [...roleLinks, ['/account/password', 'Password', KeyRound]];

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return <div className="layout">
    <aside className="sidebar">
      <div className="brand">ExamPortal</div>
      <div className="account-card">
        <span>{profile?.full_name?.slice(0, 1)?.toUpperCase() || 'U'}</span>
        <div>
          <b>{profile?.full_name || 'User'}</b>
          <small>{profile?.email}</small>
        </div>
      </div>
      <p className="role-pill">{role?.replace('_', ' ')}</p>
      <nav>{links.map(([to, label, Icon]) => <NavLink key={to} to={to} end className={({isActive}) => isActive ? 'nav active' : 'nav'}><Icon size={18}/>{label}</NavLink>)}</nav>
      <button className="nav logout" onClick={handleLogout}><LogOut size={18}/> Logout</button>
    </aside>
    <main className="content"><Outlet /></main>
  </div>;
}
