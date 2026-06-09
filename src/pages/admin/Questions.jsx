import { useEffect, useState } from 'react';
import { CheckCircle2, Edit3, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const empty = { chapter_id: '', question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', difficulty: 'medium', marks: 1 };

export default function Questions() {
  const [chapters, setChapters] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(empty);
  const [edit, setEdit] = useState(null);

  async function load() {
    const [{ data: c }, { data: q }] = await Promise.all([
      supabase.from('chapters').select('*'),
      supabase.from('questions').select('*, chapters(chapter_name)').order('created_at', { ascending: false })
    ]);
    setChapters(c || []);
    setQuestions(q || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    if (edit) await supabase.from('questions').update(form).eq('id', edit);
    else await supabase.from('questions').insert(form);
    setForm(empty);
    setEdit(null);
    load();
  }

  async function del(id) {
    if (confirm('Delete question?')) {
      await supabase.from('questions').delete().eq('id', id);
      load();
    }
  }

  function startEdit(question) {
    setEdit(question.id);
    setForm({ ...question, chapters: undefined });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Question Bank</h1>
          <p className="muted">Create questions with clear options, correct answer, difficulty, and marks.</p>
        </div>
        {edit && <button className="btn secondary" type="button" onClick={() => { setEdit(null); setForm(empty); }}><X size={18} /> Cancel Edit</button>}
      </div>

      <form className="panel question-form" onSubmit={save}>
        <div className="section-title">
          <div>
            <h2>{edit ? 'Edit Question' : 'Add Question'}</h2>
            <p className="muted">The correct answer and marks fields are used for scoring.</p>
          </div>
          <Plus size={24} />
        </div>

        <div className="grid-2">
          <label className="field">Chapter<select value={form.chapter_id} onChange={e => setForm({ ...form, chapter_id: e.target.value })}><option value="">Select chapter</option>{chapters.map(c => <option value={c.id} key={c.id}>{c.chapter_name}</option>)}</select></label>
          <label className="field">Difficulty<select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
        </div>

        <label className="field">Question text<textarea placeholder="Type the full question here" value={form.question_text} onChange={e => setForm({ ...form, question_text: e.target.value })} /></label>

        <div className="grid-2">
          {['a', 'b', 'c', 'd'].map(x => <label className="field" key={x}>Option {x.toUpperCase()}<input placeholder={`Answer choice ${x.toUpperCase()}`} value={form[`option_${x}`]} onChange={e => setForm({ ...form, [`option_${x}`]: e.target.value })} /></label>)}
        </div>

        <div className="grid-2">
          <label className="field">Correct answer<select value={form.correct_option} onChange={e => setForm({ ...form, correct_option: e.target.value })}><option value="A">Option A</option><option value="B">Option B</option><option value="C">Option C</option><option value="D">Option D</option></select></label>
          <label className="field">Marks per question<input type="number" min="1" value={form.marks} onChange={e => setForm({ ...form, marks: Number(e.target.value) })} /></label>
        </div>

        <button className="btn"><CheckCircle2 size={18} /> {edit ? 'Update Question' : 'Add Question'}</button>
      </form>

      <div className="table">
        {questions.map(q => <div className="tr" key={q.id}>
          <span><b>{q.question_text}</b><small>{q.chapters?.chapter_name} • {q.difficulty} • Correct: Option {q.correct_option} • Marks: {q.marks}</small></span>
          <button className="icon-btn" type="button" onClick={() => startEdit(q)} title="Edit question"><Edit3 size={18} /></button>
          <button className="icon-btn danger" type="button" onClick={() => del(q.id)} title="Delete question"><Trash2 size={18} /></button>
        </div>)}
      </div>
    </>
  );
}
