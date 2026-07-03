import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';
import logoImg from '../bhlogo.png';

export default function GlobalHeader({ profile, onLogout, institutionName = 'ExamPortal', institutionSubtitle = 'Online Examination Portal' }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onDocClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    }
    function onEsc(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const dashboardPath = profile?.role === 'main_admin' 
    ? '/admin' 
    : profile?.role === 'teacher' 
      ? '/teacher' 
      : '/student';

  return (
    <header className="topbar">
      <Link to={dashboardPath} className="topbar-brand" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <img src={logoImg} alt={institutionName} style={{ height: '36px', objectFit: 'contain' }} />
        <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <b style={{ color: '#0f172a', fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.2 }}>{institutionName}</b>
          <small style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 500 }}>{institutionSubtitle}</small>
        </div>
      </Link>
      <div className="profile-menu" ref={menuRef}>
        <button className="profile-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
          <span className="avatar">{profile?.full_name?.slice(0, 1)?.toUpperCase() || 'U'}</span>
          <span className="profile-text">
            <b>{profile?.full_name || 'User'}</b>
            <small>{profile?.email}</small>
          </span>
          <ChevronDown size={16} />
        </button>
        {open && (
          <div className="profile-dropdown">
            <Link to="/account/profile" onClick={() => setOpen(false)}><User size={16} /> Profile</Link>
            <Link to="/account/password" onClick={() => setOpen(false)}><Settings size={16} /> Change Password</Link>
            <button type="button" onClick={onLogout}><LogOut size={16} /> Logout</button>
          </div>
        )}
      </div>
    </header>
  );
}
