import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Search, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';

const empty = { class_name: '', section_name: '', description: '' };

export default function Classes() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');

  async function load() {
    const { data } = await supabase.from('classes').select('*').order('created_at', { ascending: false });
    setClasses(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => classes.filter(item => {
    const active = item.is_active !== false;
    if (status === 'active' && !active) return false;
    if (status === 'inactive' && active) return false;
    return `${item.class_name} ${item.section_name} ${item.description}`.toLowerCase().includes(query.toLowerCase());
  }), [classes, query, status]);

  async function save(e) {
    e.preventDefault();
    if (!form.class_name.trim()) return alert('Class name is required.');
    const payload = { ...form, class_name: form.class_name.trim(), section_name: form.section_name.trim(), description: form.description.trim() };
    const { error } = editId
      ? await supabase.from('classes').update(payload).eq('id', editId)
      : await supabase.from('classes').insert({ ...payload, created_by: user.id });
    if (error) return alert(error.message);
    setForm(empty);
    setEditId(null);
    load();
  }

  async function setActive(item, isActive) {
    const { error } = await supabase.from('classes').update({ is_active: isActive }).eq('id', item.id);
    if (error) return alert(error.message);
    load();
  }

  return (
    <>
      <section className="dashboard-hero permission-hero">
        <div>
          <span className="eyebrow">Class Management</span>
          <h1>Create and manage student classes.</h1>
          <p>Classes are used for student profiles and admin exam visibility.</p>
        </div>
      </section>

      <form className="panel question-form" onSubmit={save}>
        <div className="grid-2">
          <label className="field">Class name<input value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })} placeholder="Class 10" /></label>
          <label className="field">Section / batch<input value={form.section_name} onChange={e => setForm({ ...form, section_name: e.target.value })} placeholder="A / Science Batch" /></label>
        </div>
        <label className="field">Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional details" /></label>
        <button className="btn"><CheckCircle2 size={18} /> {editId ? 'Update Class' : 'Add Class'}</button>
      </form>

      <section className="panel management-toolbar">
        <label className="search-field"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search classes" /></label>
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="active">Active classes</option><option value="inactive">Inactive classes</option><option value="all">All classes</option></select>
      </section>

      <div className="assignment-list">
        {filtered.map(item => (
          <article className="assignment-card" key={item.id}>
            <div><h2>{item.class_name} {item.section_name}</h2><p className="muted">{item.description || 'No description'} • {item.is_active === false ? 'Inactive' : 'Active'}</p></div>
            <span className="row-actions">
              <button className="icon-btn" type="button" onClick={() => { setEditId(item.id); setForm({ class_name: item.class_name, section_name: item.section_name || '', description: item.description || '' }); }} title="Edit class"><Edit3 size={18} /></button>
              {item.is_active === false ? <button className="btn secondary" type="button" onClick={() => setActive(item, true)}>Restore</button> : <button className="btn secondary danger-text" type="button" onClick={() => setActive(item, false)}><XCircle size={18} /> Deactivate</button>}
            </span>
          </article>
        ))}
      </div>
    </>
  );
}
