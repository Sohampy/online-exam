import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, Settings, User } from 'lucide-react';

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

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark">{institutionName.slice(0, 1).toUpperCase()}</span>
        <div>
          <b>{institutionName}</b>
          <small>{institutionSubtitle}</small>
        </div>
      </div>
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
