import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, ClipboardCheck, ClipboardList, FileQuestion, GraduationCap, Home, Link2, LogOut, RotateCcw, Settings, Upload, UserCog, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function AppLayout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role;

  const groups = role === 'main_admin'
    ? [
      ['Main', [['/admin', 'Dashboard', Home], ['/admin/users', 'User Management', UserCog], ['/admin/classes', 'Class Management', GraduationCap], ['/admin/assign-students', 'Assign Students', Link2]]],
      ['Exams', [['/admin/upload', 'Question Bank Upload', Upload], ['/admin/questions', 'Manage Questions', FileQuestion], ['/admin/exams', 'Exams', ClipboardList], ['/admin/reports', 'Reports & Analytics', BarChart3]]]
    ]
    : role === 'teacher'
      ? [
        ['Main', [['/teacher', 'Dashboard', Home], ['/teacher/students', 'My Students', Users]]],
        ['Teaching', [['/teacher/upload', 'Question Bank Upload', Upload], ['/teacher/questions', 'Manage Questions', FileQuestion], ['/teacher/exams', 'Exams', ClipboardList], ['/teacher/reports', 'Reports & Analytics', BarChart3]]]
      ]
      : [
        ['Student', [['/student', 'Dashboard', Home], ['/student/exams', 'Available Exams', ClipboardList], ['/student/attempts', 'My Attempts', RotateCcw], ['/student/results', 'My Results', ClipboardCheck]]]
      ];

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
      <nav className="sidebar-nav">
        {groups.map(([group, links]) => (
          <div className="nav-group" key={group}>
            <small>{group}</small>
            {links.map(([to, label, Icon]) => <NavLink key={to} to={to} end className={({isActive}) => isActive ? 'nav active' : 'nav'}><Icon size={18}/>{label}</NavLink>)}
          </div>
        ))}
        <div className="nav-group settings-group">
          <small>Account</small>
          <NavLink to="/account/password" className={({isActive}) => isActive ? 'nav active' : 'nav'}><Settings size={18}/> Password / Settings</NavLink>
        </div>
      </nav>
      <button className="nav logout" onClick={handleLogout}><LogOut size={18}/> Logout</button>
    </aside>
    <main className="content"><Outlet /></main>
  </div>;
}
