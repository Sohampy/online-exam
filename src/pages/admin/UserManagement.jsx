import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GraduationCap, Pencil, Plus, RotateCcw, Search, Shield, Sparkles, Trash2, UsersRound, X } from 'lucide-react';
import { createDetachedSupabaseClient, supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';
import { notify } from '../../components/Notifications.jsx';

const emptyPerson = { full_name: '', email: '', password: '', role: 'student', class_id: '' };
const tileMap = [
  { role: 'student', label: 'Add Student', description: 'Create student login', icon: UsersRound },
  { role: 'teacher', label: 'Add Teacher', description: 'Create teacher login', icon: GraduationCap },
  { role: 'main_admin', label: 'Add Admin', description: 'Create admin login', icon: Shield }
];

export default function UserManagement() {
  const { user: admin } = useAuth();
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [person, setPerson] = useState(emptyPerson);
  const [activeRole, setActiveRole] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [classFilter, setClassFilter] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [editDraft, setEditDraft] = useState({ full_name: '', email: '', role: 'student', class_id: '', is_active: true });
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    const [{ data }, { data: classRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('classes').select('*').eq('is_active', true).order('class_name')
    ]);
    setUsers(data || []);
    setClasses(classRows || []);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function onEsc(event) {
      if (event.key === 'Escape') setActiveRole(null);
    }
    if (activeRole) document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [activeRole]);

  useEffect(() => {
    if (activeRole) setPerson({ ...emptyPerson, role: activeRole });
  }, [activeRole]);

  useEffect(() => {
    if (editingUser) {
      setEditDraft({
        full_name: editingUser.full_name || '',
        email: editingUser.email || '',
        role: editingUser.role || 'student',
        class_id: editingUser.class_id || '',
        is_active: editingUser.is_active !== false
      });
    }
  }, [editingUser]);

  const activeClasses = useMemo(() => [...new Map(classes.filter(item => item.is_active !== false).map(item => [item.id, item])).values()], [classes]);

  const filtered = useMemo(() => {
    return users.filter(user => {
      const active = user.is_active !== false;
      const term = `${user.full_name} ${user.email} ${user.role}`.toLowerCase();
      if (filter === 'active' && !active) return false;
      if (filter === 'removed' && active) return false;
      if (['student', 'teacher', 'main_admin'].includes(filter) && user.role !== filter) return false;
      if (classFilter !== 'all' && user.role === 'student' && user.class_id !== classFilter) return false;
      if (classFilter !== 'all' && user.role !== 'student' && filter === 'student') return false;
      return term.includes(query.toLowerCase());
    });
  }, [classFilter, filter, query, users]);

  async function removePerson(person) {
    if (!confirm('Are you sure you want to remove this person? Their previous exam attempts, results, and records will be kept for history, but they will no longer be able to access the portal.')) return;
    const { error } = await supabase.from('profiles').update({
      is_active: false,
      removed_at: new Date().toISOString(),
      removed_by: admin.id,
      removal_reason: 'Removed by admin'
    }).eq('id', person.id);
    if (error) return notify({ type: 'error', title: 'Could not remove user', message: error.message });
    await supabase.from('teacher_students').update({ status: 'inactive' }).or(`teacher_id.eq.${person.id},student_id.eq.${person.id}`);
    notify({ type: 'success', title: 'User removed' });
    load();
  }

  async function restorePerson(person) {
    const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', person.id);
    if (error) return notify({ type: 'error', title: 'Could not restore user', message: error.message });
    notify({ type: 'success', title: 'User restored' });
    load();
  }

  async function updateRole(person, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', person.id);
    if (error) return notify({ type: 'error', title: 'Could not update role', message: error.message });
    notify({ type: 'success', title: 'Role updated' });
    load();
  }

  function startEditUser(person) {
    setEditingUser(person);
  }

  function closeEditUser() {
    setEditingUser(null);
    setEditDraft({ full_name: '', email: '', role: 'student', class_id: '', is_active: true });
    setSavingEdit(false);
  }

  async function saveEditUser(e) {
    e.preventDefault();
    if (!editingUser) return;
    if (!editDraft.full_name.trim() || !editDraft.email.trim()) return notify({ type: 'warning', title: 'Missing details', message: 'Name and email are required.' });

    setSavingEdit(true);
    const selectedClass = classes.find(item => item.id === editDraft.class_id);
    const classLabel = selectedClass ? `${selectedClass.class_name} ${selectedClass.section_name || ''}`.trim() : '';
    const payload = {
      full_name: editDraft.full_name.trim(),
      email: editDraft.email.trim(),
      role: editDraft.role,
      class_id: editDraft.class_id || null,
      class_name: classLabel || null,
      is_active: editDraft.is_active
    };
    const { error } = await supabase.from('profiles').update(payload).eq('id', editingUser.id);
    setSavingEdit(false);
    if (error) return notify({ type: 'error', title: 'Could not update user', message: error.message });
    notify({ type: 'success', title: 'User updated' });
    closeEditUser();
    load();
  }

  async function createPerson(e, roleOverride = null) {
    e.preventDefault();
    setCreateMessage('');
    const draft = { ...person, role: roleOverride || person.role };
    if (!draft.full_name.trim() || !draft.email.trim() || !draft.password) return setCreateMessage('Fill name, email, and temporary password.');
    if (draft.password.length < 6) return setCreateMessage('Temporary password must be at least 6 characters.');
    if (draft.role === 'student' && !draft.class_id) return setCreateMessage('Please select a class for the student.');

    setCreating(true);
    const detached = createDetachedSupabaseClient();
    const selectedClass = classes.find(item => item.id === draft.class_id);
    const classLabel = selectedClass ? `${selectedClass.class_name} ${selectedClass.section_name || ''}`.trim() : '';
    const { data, error } = await detached.auth.signUp({
      email: draft.email.trim(),
      password: draft.password,
      options: {
        data: {
          full_name: draft.full_name.trim(),
          role: draft.role,
          class_id: draft.class_id,
          class_name: classLabel
        }
      }
    });

    if (error) {
      setCreateMessage(error.message);
      setCreating(false);
      return;
    }

    if (data.user?.id) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: draft.full_name.trim(),
        email: draft.email.trim(),
        role: draft.role,
        class_id: draft.class_id || null,
        class_name: classLabel || null,
        is_active: true
      });
      if (profileError) {
        setCreateMessage(profileError.message);
        setCreating(false);
        return;
      }
    }

    setPerson(emptyPerson);
    setActiveRole(null);
    setCreateMessage('User added. Share the temporary password and ask them to change it after login.');
    await load();
    setCreating(false);
  }

  return (
    <>
      <HeroHeader badge="User Management" title="User Management" singleLine />

      <section className="action-tiles">
        {tileMap.map(tile => {
          const Icon = tile.icon;
          return (
            <button key={tile.role} type="button" className="action-tile" onClick={() => setActiveRole(tile.role)}>
              <span><Icon size={22} /></span>
              <b>{tile.label}</b>
              <small>{tile.description}</small>
            </button>
          );
        })}
      </section>

      <div className="panel management-toolbar">
        <label className="search-field"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email, role" /></label>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All Users</option>
          <option value="active">Active Users</option>
          <option value="removed">Removed Users</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="main_admin">Admins</option>
        </select>
        <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="all">All Classes</option>
          {classes.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}
        </select>
      </div>

      <div className="user-table">
        <div className="user-row header"><b>Name</b><b>Email</b><b>Role</b><b>Class</b><b>Status</b><b>Actions</b></div>
        {filtered.map(person => {
          const active = person.is_active !== false;
          return (
            <div className="user-row" key={person.id}>
              <span>{person.full_name}</span>
              <span>{person.email}</span>
              <select value={person.role} onChange={e => updateRole(person, e.target.value)}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="main_admin">Main Admin</option>
              </select>
              <span>{person.class_name || '-'}</span>
              <span className={active ? 'status-pill done' : 'status-pill'}>{active ? 'Active' : 'Removed'}</span>
              <span className="row-actions">
                <button className="btn secondary" type="button" onClick={() => startEditUser(person)}><Pencil size={18} /> Edit</button>
                {active ? (
                  <button className="btn secondary danger-text" type="button" onClick={() => removePerson(person)}><Trash2 size={18} /> Remove</button>
                ) : (
                  <button className="btn secondary" type="button" onClick={() => restorePerson(person)}><RotateCcw size={18} /> Restore Person</button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {editingUser && (
        <div className="modal-backdrop" role="presentation" onClick={closeEditUser}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Edit user</span>
                {/* <h2>Edit</h2> */}
              </div>
              <button type="button" className="icon-btn" onClick={closeEditUser} aria-label="Close modal"><X size={18} /></button>
            </div>
            <form className="modal-form" onSubmit={saveEditUser}>
              <label className="field">Full name<input value={editDraft.full_name} onChange={e => setEditDraft({ ...editDraft, full_name: e.target.value })} /></label>
              <label className="field">Email<input type="email" value={editDraft.email} onChange={e => setEditDraft({ ...editDraft, email: e.target.value })} /></label>
              <label className="field">Role<select value={editDraft.role} onChange={e => setEditDraft({ ...editDraft, role: e.target.value })}><option value="student">Student</option><option value="teacher">Teacher</option><option value="main_admin">Main Admin</option></select></label>
              <label className="field">Class<select value={editDraft.class_id} onChange={e => setEditDraft({ ...editDraft, class_id: e.target.value })}><option value="">Select class</option>{activeClasses.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}</select></label>
              <label className="field">Account status<select value={editDraft.is_active ? 'active' : 'removed'} onChange={e => setEditDraft({ ...editDraft, is_active: e.target.value === 'active' })}><option value="active">Active</option><option value="removed">Removed</option></select></label>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={closeEditUser}>Cancel</button>
                <button className="btn" type="submit" disabled={savingEdit}><CheckCircle2 size={18} /> {savingEdit ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeRole && (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveRole(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">User Creation</span>
                <h2>{tileMap.find(tile => tile.role === activeRole)?.label}</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setActiveRole(null)} aria-label="Close modal"><X size={18} /></button>
            </div>
            <form className="modal-form" onSubmit={e => createPerson(e, activeRole)}>
              <label className="field">Full name<input value={person.full_name} onChange={e => setPerson({ ...person, full_name: e.target.value })} placeholder="User name" autoFocus /></label>
              <label className="field">Email<input type="email" value={person.email} onChange={e => setPerson({ ...person, email: e.target.value })} placeholder="email@example.com" /></label>
              {activeRole === 'student' && <label className="field">Class<select value={person.class_id} onChange={e => setPerson({ ...person, class_id: e.target.value })}><option value="">Select class</option>{activeClasses.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}</select></label>}
              <label className="field">Temporary password<input type="text" value={person.password} onChange={e => setPerson({ ...person, password: e.target.value })} placeholder="Minimum 6 characters" /></label>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => setActiveRole(null)}>Cancel</button>
                <button className="btn" disabled={creating}><Sparkles size={18} /> {creating ? 'Saving...' : 'Save User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
