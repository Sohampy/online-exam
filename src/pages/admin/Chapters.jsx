import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import HeroHeader from '../../components/HeroHeader.jsx';
import { notify } from '../../components/Notifications.jsx';

const empty = { chapter_name: '', subject: '' };

export default function Chapters() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [edit, setEdit] = useState(null);
  const [query, setQuery] = useState('');
  const [openForm, setOpenForm] = useState(false);

  async function load() {
    const { data } = await supabase.from('chapters').select('*').order('created_at', { ascending: false });
    setRows(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    if (!form.chapter_name.trim() || !form.subject.trim()) {
      return notify({ type: 'warning', title: 'Missing details', message: 'Please add both chapter name and subject.' });
    }

    const payload = {
      chapter_name: form.chapter_name.trim(),
      subject: form.subject.trim()
    };

    const { error } = edit
      ? await supabase.from('chapters').update(payload).eq('id', edit)
      : await supabase.from('chapters').insert(payload);

    if (error) return notify({ type: 'error', title: 'Could not save chapter', message: error.message });

    setForm(empty);
    setEdit(null);
    setOpenForm(false);
    notify({ type: 'success', title: edit ? 'Chapter updated' : 'Chapter added' });
    load();
  }

  async function remove(id) {
    if (!confirm('Delete this chapter? This will remove the chapter and its list entry.')) return;
    const { error } = await supabase.from('chapters').delete().eq('id', id);
    if (error) return notify({ type: 'error', title: 'Could not delete chapter', message: error.message });
    notify({ type: 'success', title: 'Chapter deleted' });
    load();
  }

  function startEdit(row) {
    setEdit(row.id);
    setForm({ chapter_name: row.chapter_name || '', subject: row.subject || '' });
    setOpenForm(true);
  }

  const filtered = rows.filter(row => `${row.chapter_name || ''} ${row.subject || ''}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <HeroHeader
        badge="Chapter Management"
        title="Chapter Management"
        singleLine
      />

      <section className="action-tiles">
        <button type="button" className="action-tile" onClick={() => { setEdit(null); setForm(empty); setOpenForm(true); }}>
          <span><Plus size={22} /></span>
          <b>Add Chapter</b>
          <small>Create a chapter inside a popup form</small>
        </button>
      </section>

      <section className="panel management-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chapters" />
        </label>
      </section>

      <div className="table">
        {filtered.map(row => (
          <div className="tr" key={row.id}>
            <span>
              <b>{row.chapter_name}</b>
              <small>{row.subject}</small>
            </span>
            <div className="row-actions">
              <button className="btn secondary" type="button" onClick={() => startEdit(row)}>Edit</button>
              <button className="btn secondary danger-text" type="button" onClick={() => remove(row.id)}><Trash2 size={16} /> Delete</button>
            </div>
          </div>
        ))}
        {!filtered.length && <p className="muted">No chapters found.</p>}
      </div>

      {openForm && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setOpenForm(false); setEdit(null); setForm(empty); }}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">{edit ? 'Edit chapter' : 'Add chapter'}</span>
                <h2>{edit ? 'Edit Chapter' : 'Add Chapter'}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => { setOpenForm(false); setEdit(null); setForm(empty); }} aria-label="Close modal"><X size={18} /></button>
            </div>
            <form className="modal-form" onSubmit={save}>
              <div className="grid-2">
                <label className="field">Chapter name<input placeholder="Chapter name" value={form.chapter_name} onChange={e => setForm({ ...form, chapter_name: e.target.value })} /></label>
                <label className="field">Subject<input placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></label>
              </div>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => { setOpenForm(false); setEdit(null); setForm(empty); }}>Cancel</button>
                <button className="btn" type="submit"><CheckCircle2 size={18} /> {edit ? 'Update Chapter' : 'Add Chapter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
