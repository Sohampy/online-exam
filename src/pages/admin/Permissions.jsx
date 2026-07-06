import { useEffect, useMemo, useState } from 'react';
import { Plus, ShieldCheck, Users } from 'lucide-react';
import { createDetachedSupabaseClient, supabase } from '../../lib/supabaseClient';
import { notify } from '../../components/Notifications.jsx';

const emptyPerson = { full_name: '', email: '', password: '', role: 'student', class_id: '' };

export default function Permissions() {
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [person, setPerson] = useState(emptyPerson);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState('');
  const [openPersonForm, setOpenPersonForm] = useState(false);

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

  const stats = useMemo(() => {
    return {
      users: users.length,
      teachers: users.filter(user => user.role === 'teacher').length,
      students: users.filter(user => user.role === 'student').length
    };
  }, [users]);
  const activeClasses = useMemo(() => [...new Map(classes.filter(item => item.is_active !== false).map(item => [item.id, item])).values()], [classes]);

  async function update(user, patch) {
    setSavingId(user.id);
    const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
    if (error) notify({ type: 'error', title: 'Could not update user', message: error.message });
    if (!error) notify({ type: 'success', title: 'User updated' });
    await load();
    setSavingId(null);
  }

  async function createPerson(e) {
    e.preventDefault();
    setCreateMessage('');
    if (!person.full_name.trim() || !person.email.trim() || !person.password) return notify({ type: 'warning', title: 'Missing details', message: 'Fill name, email, and temporary password.' });
    if (person.password.length < 6) return notify({ type: 'warning', title: 'Weak password', message: 'Temporary password must be at least 6 characters.' });

    setCreating(true);
    const detached = createDetachedSupabaseClient();
    const selectedClass = classes.find(item => item.id === person.class_id);
    const classLabel = selectedClass ? `${selectedClass.class_name} ${selectedClass.section_name || ''}`.trim() : '';
    const { data, error } = await detached.auth.signUp({
      email: person.email.trim(),
      password: person.password,
      options: {
        data: { full_name: person.full_name.trim(), role: person.role, class_id: person.class_id, class_name: classLabel }
      }
    });

    if (error) {
      notify({ type: 'error', title: 'Could not create person', message: error.message });
      setCreating(false);
      return;
    }

    if (data.user?.id) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: person.full_name.trim(),
        email: person.email.trim(),
        role: person.role,
        class_id: person.class_id || null,
        class_name: classLabel || null
      });
    }

    setPerson(emptyPerson);
    setCreateMessage('Person added. Share the temporary password and ask them to change it after login.');
    notify({ type: 'success', title: 'Person added' });
    await load();
    setCreating(false);
  }

  return (
    <>
      <section className="dashboard-hero permission-hero compact-hero">
        <div>
          <span className="eyebrow">Access Settings</span>
        </div>
        <div className="hero-stat">
          <ShieldCheck size={28} />
          <strong>{stats.teachers}</strong>
          <span>Teachers</span>
        </div>
      </section>

      <div className="cards stat-strip">
        <div className="card soft-card"><Users size={22} /><h3>{stats.users}</h3><p>Total users</p></div>
        <div className="card soft-card"><Users size={22} /><h3>{stats.teachers}</h3><p>Teachers</p></div>
        <div className="card soft-card"><Users size={22} /><h3>{stats.students}</h3><p>Students</p></div>
      </div>

      <section className="action-tiles">
        <button type="button" className="action-tile" onClick={() => setOpenPersonForm(true)}>
          <span><Plus size={22} /></span>
          <b>Add Person</b>
          <small>Create student, teacher, or admin logins</small>
        </button>
      </section>

      {openPersonForm && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpenPersonForm(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Add person</span>
                <h2>Add Person</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setOpenPersonForm(false)} aria-label="Close modal">×</button>
            </div>
            <form className="modal-form" onSubmit={createPerson}>
          <div className="grid-2">
            <label className="field">Full name<input value={person.full_name} onChange={e => setPerson({ ...person, full_name: e.target.value })} placeholder="Person name" /></label>
            <label className="field">Email<input type="email" value={person.email} onChange={e => setPerson({ ...person, email: e.target.value })} placeholder="email@example.com" /></label>
            <label className="field">Role<select value={person.role} onChange={e => setPerson({ ...person, role: e.target.value })}><option value="student">Student</option><option value="teacher">Teacher</option><option value="main_admin">Main Admin</option></select></label>
            {person.role === 'student' && <label className="field">Class<select value={person.class_id} onChange={e => setPerson({ ...person, class_id: e.target.value })}><option value="">Select class</option>{activeClasses.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}</select></label>}
            <label className="field">Temporary password<input type="text" value={person.password} onChange={e => setPerson({ ...person, password: e.target.value })} placeholder="Minimum 6 characters" /></label>
          </div>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => setOpenPersonForm(false)}>Cancel</button>
                <button className="btn" disabled={creating}><Plus size={18} /> {creating ? 'Adding...' : 'Add Person'}</button>
              </div>
              {createMessage && <p className="muted">{createMessage}</p>}
            </form>
          </div>
        </div>
      )}

      <div className="permission-list">
        {users.map(user => (
          <article className="permission-card" key={user.id}>
            <div>
              <h2>{user.full_name}</h2>
              <p className="muted">{user.email}</p>
            </div>
            <select value={user.role} onChange={e => update(user, { role: e.target.value })} disabled={savingId === user.id}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="main_admin">Main Admin</option>
            </select>
            <span className={user.is_active === false ? 'status-pill' : 'status-pill done'}>{user.is_active === false ? 'Removed' : 'Active'}</span>
          </article>
        ))}
      </div>
    </>
  );
}
