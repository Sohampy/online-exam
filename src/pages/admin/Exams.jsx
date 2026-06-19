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
  total_marks: 20,
  passing_marks: 0,
  difficulty: 'mixed',
  result_visible: false,
  analysis_visible: false,
  allow_multiple_attempts: false,
  max_attempts: 2,
  show_correct_answers: true,
  randomize_questions: true,
  randomize_options: false,
  status: 'published'
};

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function Exams() {
  const { user, profile } = useAuth();
  const [chapters, setChapters] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState([]);
  const [visibility, setVisibility] = useState({ type: 'all_students', classIds: [], studentIds: [] });
  const [exams, setExams] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  async function load() {
    const [{ data: c }, { data: q }, { data: e }, { data: classRows }, { data: studentRows }] = await Promise.all([
      supabase.from('chapters').select('*').order('chapter_name'),
      supabase.from('questions').select('id,chapter_id,difficulty,is_deleted'),
      supabase
        .from('exams')
        .select('*, exam_chapters(chapter_id, chapters(chapter_name)), exam_visibility(*)')
        .order('created_at', { ascending: false }),
      supabase.from('classes').select('*').eq('is_active', true).order('class_name'),
      supabase.from('profiles').select('id,full_name,email,class_id,class_name,role,is_active').eq('role', 'student')
    ]);
    setChapters(c || []);
    setQuestions(q || []);
    setExams(e || []);
    setClasses(classRows || []);
    setStudents((studentRows || []).filter(row => row.is_active !== false));
  }

  useEffect(() => {
    load();
  }, []);

  const questionCounts = useMemo(() => {
    return questions.filter(question => question.is_deleted !== true).reduce((map, question) => {
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
    return issues;
  }, [form, selected.length, selectedStats]);

  const formWarnings = useMemo(() => {
    const warnings = [];
    if (selectedStats.weakChapters.length && selectedStats.availableTotal >= numberValue(form.total_questions)) {
      warnings.push('Some chapters have fewer questions than the even distribution. The exam can still be created; missing questions will be filled from other selected chapters.');
    }
    return warnings;
  }, [form.total_questions, selectedStats]);

  function resetForm() {
    setForm(empty);
    setSelected([]);
    setVisibility({ type: 'all_students', classIds: [], studentIds: [] });
    setEditingId(null);
    setShowValidation(false);
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
      total_marks: exam.total_marks || exam.total_questions * exam.marks_per_question,
      passing_marks: exam.passing_marks || 0,
      difficulty: exam.difficulty,
      result_visible: exam.result_visible,
      analysis_visible: exam.analysis_visible,
      allow_multiple_attempts: Boolean(exam.allow_multiple_attempts),
      max_attempts: exam.max_attempts || 2,
      show_correct_answers: exam.show_correct_answers ?? true,
      randomize_questions: exam.randomize_questions ?? true,
      randomize_options: exam.randomize_options ?? false,
      status: exam.status || 'published'
    });
    setSelected((exam.exam_chapters || []).map(row => row.chapter_id));
    const rows = exam.exam_visibility || [];
    setVisibility({
      type: exam.visibility_type || rows[0]?.visibility_type || 'all_students',
      classIds: rows.filter(row => row.class_id).map(row => row.class_id),
      studentIds: rows.filter(row => row.student_id).map(row => row.student_id)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e) {
    e.preventDefault();
    setShowValidation(true);
    setSuccessMessage('');
    if (formIssues.length) {
      document.querySelector('.exam-builder .notice')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSaving(true);
    const wasEditing = Boolean(editingId);
    const payload = {
      ...form,
      title: form.title.trim(),
      total_questions: numberValue(form.total_questions),
      min_chapters: numberValue(form.min_chapters),
      duration_minutes: numberValue(form.duration_minutes),
      marks_per_question: numberValue(form.marks_per_question, 1),
      total_marks: numberValue(form.total_marks, numberValue(form.total_questions) * numberValue(form.marks_per_question, 1)),
      passing_marks: numberValue(form.passing_marks),
      allow_multiple_attempts: Boolean(form.allow_multiple_attempts),
      max_attempts: form.allow_multiple_attempts ? numberValue(form.max_attempts, 2) : null,
      show_correct_answers: Boolean(form.show_correct_answers),
      randomize_questions: Boolean(form.randomize_questions),
      randomize_options: Boolean(form.randomize_options),
      status: form.status || 'published',
      is_published: (form.status || 'published') === 'published',
      is_active: (form.status || 'published') !== 'archived',
      visibility_type: profile?.role === 'main_admin' ? visibility.type : 'specific_students',
      created_by_role: profile?.role || 'teacher',
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

      await supabase.from('exam_visibility').delete().eq('exam_id', examId);
      if (profile?.role === 'main_admin') {
        const visibilityRows = visibility.type === 'all_students'
          ? [{ exam_id: examId, visibility_type: 'all_students', assigned_by: user.id }]
          : visibility.type === 'class_wise'
            ? visibility.classIds.map(class_id => ({ exam_id: examId, visibility_type: 'class_wise', class_id, assigned_by: user.id }))
            : visibility.studentIds.map(student_id => ({ exam_id: examId, visibility_type: 'specific_students', student_id, assigned_by: user.id }));
        if (visibilityRows.length) {
          const { error: visibilityError } = await supabase.from('exam_visibility').insert(visibilityRows);
          if (visibilityError) throw visibilityError;
        }
      }

      resetForm();
      setSuccessMessage(wasEditing ? 'Exam updated successfully.' : 'Exam created successfully.');
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

  function toggleMulti(key, id) {
    setVisibility(current => ({
      ...current,
      [key]: current[key].includes(id) ? current[key].filter(item => item !== id) : [...current[key], id]
    }));
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
          <label className="field">Total marks<input type="number" min="1" value={form.total_marks} onChange={e => setForm({ ...form, total_marks: numberValue(e.target.value) })} /></label>
          <label className="field">Passing marks<input type="number" min="0" value={form.passing_marks} onChange={e => setForm({ ...form, passing_marks: numberValue(e.target.value) })} /></label>
        </div>

        <div className="toggle-row">
          <label><input type="checkbox" checked={form.result_visible} onChange={e => setForm({ ...form, result_visible: e.target.checked, analysis_visible: e.target.checked ? form.analysis_visible : false })} /> Publish result</label>
          <label><input type="checkbox" checked={form.analysis_visible} onChange={e => setForm({ ...form, analysis_visible: e.target.checked, result_visible: e.target.checked ? true : form.result_visible })} /> Detailed analysis</label>
          <label><input type="checkbox" checked={form.show_correct_answers} onChange={e => setForm({ ...form, show_correct_answers: e.target.checked })} /> Show correct answers</label>
          <label><input type="checkbox" checked={form.randomize_questions} onChange={e => setForm({ ...form, randomize_questions: e.target.checked })} /> Randomize questions</label>
          <label><input type="checkbox" checked={form.randomize_options} onChange={e => setForm({ ...form, randomize_options: e.target.checked })} /> Randomize options</label>
          <label><input type="checkbox" checked={form.allow_multiple_attempts} onChange={e => setForm({ ...form, allow_multiple_attempts: e.target.checked })} /> Allow multiple attempts</label>
        </div>
        {form.allow_multiple_attempts && <div className="grid-2"><label className="field">Maximum attempts<input type="number" min="1" value={form.max_attempts} onChange={e => setForm({ ...form, max_attempts: numberValue(e.target.value, 2) })} /></label><label className="field">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label></div>}

        {profile?.role === 'main_admin' && (
          <section className="visibility-box">
            <h2>Who can see this exam?</h2>
            <div className="toggle-row">
              <label><input type="radio" name="visibility" checked={visibility.type === 'all_students'} onChange={() => setVisibility({ type: 'all_students', classIds: [], studentIds: [] })} /> All Students</label>
              <label><input type="radio" name="visibility" checked={visibility.type === 'class_wise'} onChange={() => setVisibility({ ...visibility, type: 'class_wise' })} /> Class-wise</label>
              <label><input type="radio" name="visibility" checked={visibility.type === 'specific_students'} onChange={() => setVisibility({ ...visibility, type: 'specific_students' })} /> Specific Students</label>
            </div>
            {visibility.type === 'class_wise' && <div className="chip-list">{classes.map(item => <button type="button" className={visibility.classIds.includes(item.id) ? 'chip selected' : 'chip'} onClick={() => toggleMulti('classIds', item.id)} key={item.id}>{item.class_name} {item.section_name}</button>)}</div>}
            {visibility.type === 'specific_students' && <div className="chip-list">{students.map(item => <button type="button" className={visibility.studentIds.includes(item.id) ? 'chip selected' : 'chip'} onClick={() => toggleMulti('studentIds', item.id)} key={item.id}>{item.full_name}<small>{item.class_name}</small></button>)}</div>}
          </section>
        )}

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

        {showValidation && formIssues.length > 0 && <div className="notice">{formIssues[0]}</div>}
        {formWarnings.length > 0 && <div className="notice info">{formWarnings[0]}</div>}
        {successMessage && <div className="notice success">{successMessage}</div>}

        <button className="btn" disabled={saving}>
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
                <span>Attempts {exam.allow_multiple_attempts ? `up to ${exam.max_attempts || 'unlimited'}` : 'single'}</span>
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
