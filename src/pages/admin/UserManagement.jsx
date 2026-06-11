import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function UserManagement() {
  const { user: admin } = useAuth();
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return users.filter(user => {
      const active = user.is_active !== false;
      const term = `${user.full_name} ${user.email} ${user.role}`.toLowerCase();
      if (filter === 'active' && !active) return false;
      if (filter === 'removed' && active) return false;
      if (['student', 'teacher', 'main_admin'].includes(filter) && user.role !== filter) return false;
      return term.includes(query.toLowerCase());
    });
  }, [filter, query, users]);

  async function removePerson(person) {
    if (!confirm('Are you sure you want to remove this person? Their previous exam attempts, results, and records will be kept for history, but they will no longer be able to access the portal.')) return;
    const { error } = await supabase.from('profiles').update({
      is_active: false,
      removed_at: new Date().toISOString(),
      removed_by: admin.id,
      removal_reason: 'Removed by admin'
    }).eq('id', person.id);
    if (error) return alert(error.message);
    await supabase.from('teacher_students').update({ status: 'inactive' }).or(`teacher_id.eq.${person.id},student_id.eq.${person.id}`);
    load();
  }

  async function restorePerson(person) {
    const { error } = await supabase.from('profiles').update({ is_active: true }).eq('id', person.id);
    if (error) return alert(error.message);
    load();
  }

  async function updateRole(person, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', person.id);
    if (error) return alert(error.message);
    load();
  }

  return (
    <>
      <section className="dashboard-hero permission-hero">
        <div>
          <span className="eyebrow">User Management</span>
          <h1>Remove, restore, and manage portal users.</h1>
          <p>Removed users keep their historical exams, questions, and results, but cannot access dashboards.</p>
        </div>
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
              {active ? (
                <button className="btn secondary danger-text" type="button" onClick={() => removePerson(person)}><Trash2 size={18} /> Remove Person</button>
              ) : (
                <button className="btn secondary" type="button" onClick={() => restorePerson(person)}><RotateCcw size={18} /> Restore Person</button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
