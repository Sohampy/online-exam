import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen, ClipboardCheck, ClipboardList, FileQuestion, GraduationCap, Home, Menu, RotateCcw, UserCog, Users, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import GlobalHeader from './GlobalHeader.jsx';
import { NotificationsProvider } from './Notifications.jsx';

export default function AppLayout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const role = profile?.role;
  const [collapsed, setCollapsed] = useState(false);
  const institutionName = 'BrainzHive';

  const groups = role === 'main_admin'
    ? [
      ['Main', [['/admin', 'Dashboard', Home], ['/admin/users', 'User Management', UserCog], ['/admin/classes', 'Class Management', GraduationCap]]],
      ['Exams', [['/admin/questions', 'Manage Questions', FileQuestion], ['/admin/exams', 'Exams', ClipboardList], ['/admin/reports', 'Reports & Analytics', BarChart3]]]
    ]
    : role === 'teacher'
      ? [
        ['Main', [['/teacher', 'Dashboard', Home], ['/teacher/students', 'My Students', Users]]],
        ['Teaching', [['/teacher/questions', 'Manage Questions', FileQuestion], ['/teacher/exams', 'Exams', ClipboardList], ['/teacher/reports', 'Reports & Analytics', BarChart3]]]
      ]
      : [
        ['Student', [['/student', 'Dashboard', Home], ['/student/exams', 'Available Exams', ClipboardList], ['/student/practice', 'Practice Test', BookOpen], ['/student/results', 'My Results', ClipboardCheck]]]
      ];

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <NotificationsProvider>
      <div className={collapsed ? 'layout sidebar-collapsed' : 'layout'}>
        <aside className="sidebar">
          <button className="sidebar-toggle" type="button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
          <nav className="sidebar-nav">
            {groups.map(([group, links]) => (
              <div className="nav-group" key={group}>
                <small>{group}</small>
                {links.map(([to, label, Icon]) => (
                  <NavLink key={to} to={to} end title={collapsed ? label : undefined} className={({ isActive }) => (isActive ? 'nav active' : 'nav')}>
                    <Icon size={18} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <section className="app-frame">
          <GlobalHeader profile={profile} onLogout={handleLogout} institutionName={institutionName} institutionSubtitle="Online Examination Portal" />
          <main className="content">
            <Outlet />
          </main>
        </section>
      </div>
    </NotificationsProvider>
  );
}
