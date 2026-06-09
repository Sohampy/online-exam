import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, FileQuestion, Plus, ShieldCheck, Users } from 'lucide-react';
import { createDetachedSupabaseClient, supabase } from '../../lib/supabaseClient';

const emptyPerson = { full_name: '', email: '', password: '', role: 'student' };

export default function Permissions() {
  const [users, setUsers] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [person, setPerson] = useState(emptyPerson);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState('');

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    return {
      users: users.length,
      teachers: users.filter(user => user.role === 'teacher').length,
      questionAccess: users.filter(user => user.can_manage_questions).length,
      reportAccess: users.filter(user => user.can_view_reports).length
    };
  }, [users]);

  async function update(user, patch) {
    setSavingId(user.id);
    const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
    if (error) alert(error.message);
    await load();
    setSavingId(null);
  }

  async function createPerson(e) {
    e.preventDefault();
    setCreateMessage('');
    if (!person.full_name.trim() || !person.email.trim() || !person.password) return setCreateMessage('Fill name, email, and temporary password.');
    if (person.password.length < 6) return setCreateMessage('Temporary password must be at least 6 characters.');

    setCreating(true);
    const detached = createDetachedSupabaseClient();
    const { data, error } = await detached.auth.signUp({
      email: person.email.trim(),
      password: person.password,
      options: {
        data: { full_name: person.full_name.trim(), role: person.role }
      }
    });

    if (error) {
      setCreateMessage(error.message);
      setCreating(false);
      return;
    }

    if (data.user?.id) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: person.full_name.trim(),
        email: person.email.trim(),
        role: person.role
      });
    }

    setPerson(emptyPerson);
    setCreateMessage('Person added. Share the temporary password and ask them to change it after login.');
    await load();
    setCreating(false);
  }

  return (
    <>
      <section className="dashboard-hero permission-hero">
        <div>
          <span className="eyebrow">Access Settings</span>
          <h1>Control who can manage questions and view reports.</h1>
          <p>These permissions are for admins and teachers. Student result and detailed-analysis access is controlled from Exam Management.</p>
        </div>
        <div className="hero-stat">
          <ShieldCheck size={28} />
          <strong>{stats.teachers}</strong>
          <span>Teachers</span>
        </div>
      </section>

      <div className="cards stat-strip">
        <div className="card soft-card"><Users size={22} /><h3>{stats.users}</h3><p>Total users</p></div>
        <div className="card soft-card"><FileQuestion size={22} /><h3>{stats.questionAccess}</h3><p>Question access</p></div>
        <div className="card soft-card"><BookOpenCheck size={22} /><h3>{stats.reportAccess}</h3><p>Report access</p></div>
      </div>

      <form className="panel add-person-panel" onSubmit={createPerson}>
        <div className="section-title">
          <div>
            <h2>Add Person</h2>
            <p className="muted">Create a login with a temporary password. The person can change it from the Password page.</p>
          </div>
          <Plus size={24} />
        </div>
        <div className="grid-2">
          <label className="field">Full name<input value={person.full_name} onChange={e => setPerson({ ...person, full_name: e.target.value })} placeholder="Person name" /></label>
          <label className="field">Email<input type="email" value={person.email} onChange={e => setPerson({ ...person, email: e.target.value })} placeholder="email@example.com" /></label>
          <label className="field">Role<select value={person.role} onChange={e => setPerson({ ...person, role: e.target.value })}><option value="student">Student</option><option value="teacher">Teacher</option><option value="main_admin">Main Admin</option></select></label>
          <label className="field">Temporary password<input type="text" value={person.password} onChange={e => setPerson({ ...person, password: e.target.value })} placeholder="Minimum 6 characters" /></label>
        </div>
        <button className="btn" disabled={creating}><Plus size={18} /> {creating ? 'Adding...' : 'Add Person'}</button>
        {createMessage && <p className="muted">{createMessage}</p>}
      </form>

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
            <div className="permission-switches">
              <label><input type="checkbox" checked={user.can_manage_questions} onChange={e => update(user, { can_manage_questions: e.target.checked })} disabled={savingId === user.id} /> Question bank</label>
              <label><input type="checkbox" checked={user.can_view_reports} onChange={e => update(user, { can_view_reports: e.target.checked })} disabled={savingId === user.id} /> Reports</label>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
