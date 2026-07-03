import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Plus, Search, X, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';
import { notify } from '../../components/Notifications.jsx';

const empty = { class_name: '', section_name: '', description: '' };

export default function Classes() {
  const { user } = useAuth();
  const [classes, setClasses] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [openModal, setOpenModal] = useState(false);

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

  function openCreate() {
    setEditId(null);
    setForm(empty);
    setOpenModal(true);
  }

  function openEdit(item) {
    setEditId(item.id);
    setForm({ class_name: item.class_name || '', section_name: item.section_name || '', description: item.description || '' });
    setOpenModal(true);
  }

  function closeModal() {
    setOpenModal(false);
    setEditId(null);
    setForm(empty);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.class_name.trim()) return notify({ type: 'warning', title: 'Missing class name', message: 'Class name is required.' });
    const payload = {
      ...form,
      class_name: form.class_name.trim(),
      section_name: form.section_name.trim(),
      description: form.description.trim()
    };
    const { error } = editId
      ? await supabase.from('classes').update(payload).eq('id', editId)
      : await supabase.from('classes').insert({ ...payload, created_by: user.id });
    if (error) return notify({ type: 'error', title: 'Could not save class', message: error.message });
    notify({ type: 'success', title: editId ? 'Class updated' : 'Class added' });
    closeModal();
    load();
  }

  async function setActive(item, isActive) {
    const { error } = await supabase.from('classes').update({ is_active: isActive }).eq('id', item.id);
    if (error) return notify({ type: 'error', title: 'Could not update class', message: error.message });
    notify({ type: 'success', title: isActive ? 'Class restored' : 'Class deactivated' });
    load();
  }

  return (
    <>
      <HeroHeader
        badge="Class Management"
        title="Class Management"
        singleLine
        actions={
          <button type="button" className="btn" onClick={openCreate}>
            <Plus size={18} /> Add Class
          </button>
        }
      />

      <section className="panel management-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search classes" />
        </label>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="active">Active classes</option>
          <option value="inactive">Inactive classes</option>
          <option value="all">All classes</option>
        </select>
      </section>

      <div className="class-grid">
        {filtered.map(item => (
          <article className="class-card" key={item.id}>
            <div className="class-card-body">
              <h3>{item.class_name}</h3>
              {item.section_name && <span className="batch-badge">{item.section_name}</span>}
              <p className="muted">{item.description || 'No description'}</p>
            </div>
            <div className="class-card-footer">
              <span className={`status-tag ${item.is_active !== false ? 'active' : 'inactive'}`}>
                {item.is_active !== false ? 'Active' : 'Inactive'}
              </span>
              <div className="actions">
                <button className="icon-btn" type="button" onClick={() => openEdit(item)} title="Edit class"><Edit3 size={18} /></button>
                {item.is_active === false ? (
                  <button className="btn secondary" type="button" onClick={() => setActive(item, true)}><CheckCircle2 size={18} /> Restore</button>
                ) : (
                  <button className="btn secondary danger-text" type="button" onClick={() => setActive(item, false)}><XCircle size={18} /> Deactivate</button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {openModal && (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">{editId ? 'Edit class' : 'Add class'}</span>
                <h2>{editId ? 'Edit Class' : 'Add Class'}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={closeModal} aria-label="Close modal"><X size={18} /></button>
            </div>
            <form className="modal-form" onSubmit={save}>
              <div className="grid-2">
                <label className="field">Class name<input value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })} placeholder="Class 10" autoFocus /></label>
                <label className="field">Section / batch<input value={form.section_name} onChange={e => setForm({ ...form, section_name: e.target.value })} placeholder="A / Science Batch" /></label>
              </div>
              <label className="field">Description<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional details" /></label>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={closeModal}>Cancel</button>
                <button className="btn" type="submit"><CheckCircle2 size={18} /> {editId ? 'Update Class' : 'Add Class'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
