import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarClock, CheckCircle2, Edit3, Eye, EyeOff, Layers, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';

const empty = {
  title: '',
  total_questions: 20,
  min_chapters: 5,
  duration_minutes: 30,
  marks_per_question: 1,
  difficulty: 'mixed',
  result_visible: false,
  analysis_visible: false
};

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function Exams() {
  const { user } = useAuth();
  const [chapters, setChapters] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [exams, setExams] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [{ data: c }, { data: q }, { data: e }] = await Promise.all([
      supabase.from('chapters').select('*').order('chapter_name'),
      supabase.from('questions').select('id,chapter_id,difficulty'),
      supabase
        .from('exams')
        .select('*, exam_chapters(chapter_id, chapters(chapter_name))')
        .order('created_at', { ascending: false })
    ]);
    setChapters(c || []);
    setQuestions(q || []);
    setExams(e || []);
  }

  useEffect(() => {
    load();
  }, []);

  const questionCounts = useMemo(() => {
    return questions.reduce((map, question) => {
      const key = `${question.chapter_id}:${question.difficulty}`;
      map[key] = (map[key] || 0) + 1;
      map[`${question.chapter_id}:mixed`] = (map[`${question.chapter_id}:mixed`] || 0) + 1;
      return map;
    }, {});
  }, [questions]);

  const selectedStats = useMemo(() => {
    const chapterCount = selected.length;
    const maxNeededPerChapter = chapterCount ? Math.ceil(numberValue(form.total_questions) / chapterCount) : 0;
    const rows = selected.map(id => {
      const chapter = chapters.find(c => c.id === id);
      const available = questionCounts[`${id}:${form.difficulty}`] || 0;
      return { id, name: chapter?.chapter_name || 'Unknown chapter', available };
    });
    const availableTotal = rows.reduce((sum, row) => sum + row.available, 0);
    const weakChapters = rows.filter(row => row.available < maxNeededPerChapter);
    return { rows, availableTotal, maxNeededPerChapter, weakChapters };
  }, [chapters, form.difficulty, form.total_questions, questionCounts, selected]);

  const formIssues = useMemo(() => {
    const issues = [];
    if (!form.title.trim()) issues.push('Add an exam title.');
    if (numberValue(form.total_questions) <= 0) issues.push('Total questions must be greater than 0.');
    if (numberValue(form.duration_minutes) <= 0) issues.push('Duration must be greater than 0.');
    if (numberValue(form.min_chapters) <= 0) issues.push('Minimum chapters must be greater than 0.');
    if (selected.length < numberValue(form.min_chapters)) issues.push(`Select at least ${form.min_chapters} chapters.`);
    if (selectedStats.availableTotal < numberValue(form.total_questions)) issues.push('Selected chapters do not have enough questions.');
    if (selectedStats.weakChapters.length) issues.push('Some selected chapters have fewer questions than the exam distribution needs.');
    return issues;
  }, [form, selected.length, selectedStats]);

  function resetForm() {
    setForm(empty);
    setSelected([]);
    setEditingId(null);
  }

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  }

  function editExam(exam) {
    setEditingId(exam.id);
    setForm({
      title: exam.title,
      total_questions: exam.total_questions,
      min_chapters: exam.min_chapters,
      duration_minutes: exam.duration_minutes,
      marks_per_question: exam.marks_per_question,
      difficulty: exam.difficulty,
      result_visible: exam.result_visible,
      analysis_visible: exam.analysis_visible
    });
    setSelected((exam.exam_chapters || []).map(row => row.chapter_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e) {
    e.preventDefault();
    if (formIssues.length) return alert(formIssues[0]);

    setSaving(true);
    const payload = {
      ...form,
      title: form.title.trim(),
      total_questions: numberValue(form.total_questions),
      min_chapters: numberValue(form.min_chapters),
      duration_minutes: numberValue(form.duration_minutes),
      marks_per_question: numberValue(form.marks_per_question, 1),
      result_visible: form.result_visible || form.analysis_visible,
      analysis_visible: form.analysis_visible
    };

    try {
      let examId = editingId;
      if (editingId) {
        const { error } = await supabase.from('exams').update(payload).eq('id', editingId);
        if (error) throw error;
        const { error: deleteChapterError } = await supabase.from('exam_chapters').delete().eq('exam_id', editingId);
        if (deleteChapterError) throw deleteChapterError;
      } else {
        const { data, error } = await supabase.from('exams').insert({ ...payload, created_by: user.id }).select().single();
        if (error) throw error;
        examId = data.id;
      }

      const { error: chapterError } = await supabase
        .from('exam_chapters')
        .insert(selected.map(chapter_id => ({ exam_id: examId, chapter_id })));
      if (chapterError) throw chapterError;

      resetForm();
      load();
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteExam(id) {
    if (!confirm('Delete this exam? Student attempts linked to it will also be removed by the database.')) return;
    const { error } = await supabase.from('exams').delete().eq('id', id);
    if (error) return alert(error.message);
    load();
  }

  async function updateVisibility(exam, patch) {
    const next = { result_visible: exam.result_visible, analysis_visible: exam.analysis_visible, ...patch };
    if (next.analysis_visible) next.result_visible = true;
    if (!next.result_visible) next.analysis_visible = false;
    const { error } = await supabase.from('exams').update(next).eq('id', exam.id);
    if (error) return alert(error.message);
    setExams(current => current.map(item => item.id === exam.id ? { ...item, ...next } : item));
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Exam Management</h1>
          <p className="muted">Build exams from available chapter questions and control result visibility.</p>
        </div>
        <button className="btn secondary" type="button" onClick={resetForm}><Plus size={18} /> New Exam</button>
      </div>

      <form className="panel exam-builder" onSubmit={save}>
        <div className="section-title">
          <div>
            <h2>{editingId ? 'Edit exam' : 'Create exam'}</h2>
            <p className="muted">{selectedStats.availableTotal} matching questions available in selected chapters.</p>
          </div>
          {editingId && <button className="icon-btn" type="button" onClick={resetForm} title="Cancel edit"><X size={18} /></button>}
        </div>

        <div className="grid-2">
          <label className="field">Title<input placeholder="Exam title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
          <label className="field">Difficulty<select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}><option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
          <label className="field">Total questions<input type="number" min="1" value={form.total_questions} onChange={e => setForm({ ...form, total_questions: numberValue(e.target.value) })} /></label>
          <label className="field">Minimum chapters<input type="number" min="1" value={form.min_chapters} onChange={e => setForm({ ...form, min_chapters: numberValue(e.target.value) })} /></label>
          <label className="field">Duration minutes<input type="number" min="1" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: numberValue(e.target.value) })} /></label>
          <label className="field">Marks per question<input type="number" min="1" value={form.marks_per_question} onChange={e => setForm({ ...form, marks_per_question: numberValue(e.target.value, 1) })} /></label>
        </div>

        <div className="toggle-row">
          <label><input type="checkbox" checked={form.result_visible} onChange={e => setForm({ ...form, result_visible: e.target.checked, analysis_visible: e.target.checked ? form.analysis_visible : false })} /> Publish result</label>
          <label><input type="checkbox" checked={form.analysis_visible} onChange={e => setForm({ ...form, analysis_visible: e.target.checked, result_visible: e.target.checked ? true : form.result_visible })} /> Detailed analysis</label>
        </div>

        <div className="section-title compact">
          <div>
            <h2>Select Chapters</h2>
            <p className="muted">Each selected chapter should have at least {selectedStats.maxNeededPerChapter || 0} matching questions.</p>
          </div>
        </div>

        <div className="chapter-grid">
          {chapters.map(chapter => {
            const available = questionCounts[`${chapter.id}:${form.difficulty}`] || 0;
            const isSelected = selected.includes(chapter.id);
            return (
              <button type="button" className={isSelected ? 'chapter-choice selected' : 'chapter-choice'} onClick={() => toggle(chapter.id)} key={chapter.id}>
                <span><b>{chapter.chapter_name}</b><small>{chapter.subject}</small></span>
                <strong>{available}</strong>
              </button>
            );
          })}
        </div>

        {formIssues.length > 0 && <div className="notice">{formIssues[0]}</div>}

        <button className="btn" disabled={saving || formIssues.length > 0}>
          <CheckCircle2 size={18} /> {saving ? 'Saving...' : editingId ? 'Update Exam' : 'Create Exam'}
        </button>
      </form>

      <div className="exam-list">
        {exams.map(exam => {
          const examChapters = exam.exam_chapters || [];
          return (
            <article className="exam-card" key={exam.id}>
              <div className="exam-card-main">
                <div>
                  <h2>{exam.title}</h2>
                  <p className="muted">{examChapters.map(row => row.chapters?.chapter_name).filter(Boolean).join(', ') || 'No chapters selected'}</p>
                </div>
                <span className="status-pill">{exam.difficulty}</span>
              </div>
              <div className="exam-meta">
                <span><Layers size={16} /> {exam.total_questions} questions</span>
                <span><CalendarClock size={16} /> {exam.duration_minutes} mins</span>
                <span>{exam.result_visible ? <Eye size={16} /> : <EyeOff size={16} />} Result {exam.result_visible ? 'on' : 'off'}</span>
                <span><BarChart3 size={16} /> Details {exam.analysis_visible ? 'on' : 'off'}</span>
              </div>
              <div className="publish-controls">
                <button className={exam.result_visible ? 'mini-toggle active' : 'mini-toggle'} type="button" onClick={() => updateVisibility(exam, { result_visible: !exam.result_visible })}>{exam.result_visible ? 'Result published' : 'Publish result'}</button>
                <button className={exam.analysis_visible ? 'mini-toggle active' : 'mini-toggle'} type="button" onClick={() => updateVisibility(exam, { analysis_visible: !exam.analysis_visible })}>{exam.analysis_visible ? 'Details enabled' : 'Enable details'}</button>
              </div>
              <div className="exam-actions">
                <button className="icon-btn" type="button" onClick={() => editExam(exam)} title="Edit exam"><Edit3 size={18} /></button>
                <button className="icon-btn danger" type="button" onClick={() => deleteExam(exam.id)} title="Delete exam"><Trash2 size={18} /></button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
