import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, Download, Edit3, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';
import QuestionUploadModal from '../../components/QuestionUploadModal.jsx';
import { notify } from '../../components/Notifications.jsx';

const empty = { chapter_id: '', question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', difficulty: 'medium', marks: 1, explanation: '' };
const defaultFilters = { q: '', subject: 'all', chapter: 'all', difficulty: 'all', createdBy: 'all' };

export default function Questions() {
  const { user, profile } = useAuth();
  const [chapters, setChapters] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(empty);
  const [edit, setEdit] = useState(null);
  const [selected, setSelected] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [visibleLimit, setVisibleLimit] = useState(25);
  const [openForm, setOpenForm] = useState(false);
  const [openUpload, setOpenUpload] = useState(false);
  const [modalSubject, setModalSubject] = useState('all');
  const selectAllRef = useRef(null);

  const uniqueSubjects = useMemo(() => {
    const list = chapters.map(c => c.subject).filter(Boolean);
    return Array.from(new Set(list));
  }, [chapters]);

  const filteredModalChapters = useMemo(() => {
    if (modalSubject === 'all') return chapters;
    return chapters.filter(c => c.subject === modalSubject);
  }, [chapters, modalSubject]);

  useEffect(() => {
    if (form.chapter_id && chapters.length) {
      const selectedChapter = chapters.find(c => String(c.id) === String(form.chapter_id));
      if (selectedChapter && selectedChapter.subject) {
        setModalSubject(selectedChapter.subject);
      }
    }
  }, [form.chapter_id, chapters]);

  async function load() {
    setLoadError('');
    const [{ data: c, error: chapterError }, { data: q, error: questionError }, { data: p }] = await Promise.all([
      supabase.from('chapters').select('*').order('subject'),
      supabase.from('questions').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id,full_name,email,role')
    ]);

    if (chapterError || questionError) {
      setLoadError(questionError?.message || chapterError?.message || 'Could not load questions.');
    }

    const chapterRows = c || [];
    const profileRows = p || [];
    const chapterMap = chapterRows.reduce((map, chapter) => {
      map[chapter.id] = chapter;
      return map;
    }, {});
    const visibleCreators = profileRows.filter(person => person.role !== 'student');
    const profileMap = visibleCreators.reduce((map, person) => {
      map[person.id] = person;
      return map;
    }, {});

    setChapters(chapterRows);
    setQuestions((q || [])
      .filter(question => question.is_deleted !== true)
      .map(question => ({
        ...question,
        chapters: chapterMap[question.chapter_id] || null,
        profiles: profileMap[question.created_by] || null
      })));
    setProfiles(visibleCreators);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setVisibleLimit(25);
  }, [filters]);

  const questionChapters = useMemo(() => {
    const map = new Map();
    questions.forEach(question => {
      const chapter = question.chapters || chapters.find(item => item.id === question.chapter_id);
      if (chapter?.id) map.set(chapter.id, chapter);
    });
    chapters.forEach(chapter => {
      if (chapter?.id) map.set(chapter.id, chapter);
    });
    return [...map.values()].sort((a, b) => `${a.subject || ''} ${a.chapter_name || ''}`.localeCompare(`${b.subject || ''} ${b.chapter_name || ''}`));
  }, [chapters, questions]);

  const subjects = [...new Set(questionChapters.map(chapter => chapter.subject).filter(Boolean))].sort();
  const filteredChapters = questionChapters.filter(chapter => filters.subject === 'all' || chapter.subject === filters.subject);

  const filtered = useMemo(() => {
    return questions.filter(question => {
      const difficulty = String(question.difficulty || '').toLowerCase();
      const subject = question.chapters?.subject || '';
      const chapterName = question.chapters?.chapter_name || '';
      const haystack = `${question.question_text || ''} ${chapterName} ${subject}`.toLowerCase();
      if (filters.subject !== 'all' && subject !== filters.subject) return false;
      if (filters.chapter !== 'all' && question.chapter_id !== filters.chapter) return false;
      if (filters.difficulty !== 'all' && difficulty !== filters.difficulty) return false;
      if (filters.createdBy !== 'all' && question.created_by !== filters.createdBy) return false;
      return haystack.includes(filters.q.trim().toLowerCase());
    });
  }, [filters, questions]);

  const visibleQuestions = filtered.slice(0, visibleLimit);
  const selectedChapter = chapters.find(item => item.id === filters.chapter);
  const selectedChapterQuestionCount = filters.chapter === 'all'
    ? 0
    : questions.filter(question => question.chapter_id === filters.chapter && (profile?.role === 'main_admin' || question.created_by === user.id)).length;
  const selectedChapterTotalCount = filters.chapter === 'all'
    ? 0
    : questions.filter(question => question.chapter_id === filters.chapter).length;

  async function save(e) {
    e.preventDefault();
    const payload = { ...form, created_by: edit ? form.created_by : user.id };
    const { error } = edit
      ? await supabase.from('questions').update(payload).eq('id', edit)
      : await supabase.from('questions').insert(payload);
    if (error) return notify({ type: 'error', title: 'Could not save question', message: error.message });
    setForm(empty);
    setEdit(null);
    setOpenForm(false);
    notify({ type: 'success', title: edit ? 'Question updated' : 'Question added' });
    load();
  }

  async function findUsedQuestionIds(ids) {
    if (!ids.length) return new Set();
    const [{ data: examQuestionRows, error: examQuestionError }, { data: answerRows, error: answerError }] = await Promise.all([
      supabase.from('exam_questions').select('question_id').in('question_id', ids),
      supabase.from('student_answers').select('question_id').in('question_id', ids)
    ]);
    if (examQuestionError || answerError) throw new Error(examQuestionError?.message || answerError?.message);
    return new Set([...(examQuestionRows || []), ...(answerRows || [])].map(row => row.question_id));
  }

  async function permanentlyDelete(ids, label = 'selected questions', options = {}) {
    if (!ids.length) return;
    const allowedIds = ids.filter(id => {
      const question = questions.find(item => item.id === id);
      return profile?.role === 'main_admin' || question?.created_by === user.id;
    });
    if (!allowedIds.length) return notify({ type: 'warning', title: 'Nothing to delete', message: 'No questions selected that you are allowed to delete.' });
    if (!options.skipConfirm && !confirm(ids.length === 1 ? 'Are you sure you want to permanently delete this question from the database? This action cannot be undone.' : `Are you sure you want to permanently delete ${label} from the database? This action cannot be undone.`)) return;

    try {
      const usedIds = await findUsedQuestionIds(allowedIds);
      const safeIds = allowedIds.filter(id => !usedIds.has(id));
      let deletedCount = 0;
      let blockedCount = usedIds.size;
      for (const id of safeIds) {
        const { error } = await supabase.from('questions').delete().eq('id', id);
        if (error) blockedCount += 1;
        else deletedCount += 1;
      }
      setSelected([]);
      await load();
      if (blockedCount) {
        notify({ type: 'warning', title: 'Some questions were kept', message: `${deletedCount} questions deleted. ${blockedCount} questions were not deleted because they are already used in student attempts.` });
      } else {
        notify({ type: 'success', title: 'Question deleted', message: deletedCount === 1 ? 'Question permanently deleted.' : `${deletedCount} questions permanently deleted.` });
      }
    } catch (error) {
      notify({ type: 'error', title: 'Delete failed', message: error.message });
    }
  }

  async function deleteChapterQuestions() {
    if (filters.chapter === 'all') return notify({ type: 'warning', title: 'Select a chapter', message: 'Choose a chapter first.' });
    const chapter = chapters.find(item => item.id === filters.chapter);
    const ownedQuestions = questions.filter(question => question.chapter_id === filters.chapter && (profile?.role === 'main_admin' || question.created_by === user.id));
    const count = ownedQuestions.length;
    if (!count) return notify({ type: 'warning', title: 'No questions found', message: 'No questions found in this chapter.' });
    if (!confirm('This will permanently delete all questions from this chapter from the database. This action cannot be undone. Continue?')) return;
    await permanentlyDelete(ownedQuestions.map(question => question.id), `all safe questions from ${chapter?.chapter_name || 'this chapter'}`, { skipConfirm: true });
  }

  async function removeChapter() {
    if (filters.chapter === 'all') return notify({ type: 'warning', title: 'Select a chapter', message: 'Choose a chapter first.' });
    const chapter = chapters.find(item => item.id === filters.chapter);
    const chapterQuestions = questions.filter(question => question.chapter_id === filters.chapter);
    const blockedByOwnership = profile?.role !== 'main_admin' && chapterQuestions.some(question => question.created_by !== user.id);
    if (blockedByOwnership) return notify({ type: 'warning', title: 'Chapter locked', message: 'This chapter has questions uploaded by another user, so you cannot remove the whole chapter.' });
    if (!confirm(`Remove the chapter "${chapter?.chapter_name || 'selected chapter'}" permanently? This will also delete unused questions inside it. This action cannot be undone.`)) return;

    try {
      const ids = chapterQuestions.map(question => question.id);
      const usedIds = await findUsedQuestionIds(ids);
      if (usedIds.size) {
        return notify({ type: 'warning', title: 'Remove chapter blocked', message: 'This chapter has questions already used in student attempts. Remove Chapter is blocked so old reports do not break.' });
      }

      for (const id of ids) {
        const { error } = await supabase.from('questions').delete().eq('id', id);
        if (error) throw error;
      }
      const { error: chapterError } = await supabase.from('chapters').delete().eq('id', filters.chapter);
      if (chapterError) throw chapterError;
      setFilters(defaultFilters);
      setSelected([]);
      await load();
      notify({ type: 'success', title: 'Chapter removed', message: 'Chapter permanently removed.' });
    } catch (error) {
      notify({ type: 'error', title: 'Remove failed', message: error.message });
    }
  }

  function startEdit(question) {
    setEdit(question.id);
    setForm({ ...question, chapters: undefined, profiles: undefined });
    setOpenForm(true);
  }

  function toggleSelected(id) {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  const visibleManageableIds = visibleQuestions
    .filter(question => profile?.role === 'main_admin' || question.created_by === user.id)
    .map(question => question.id);
  const allVisibleSelected = visibleManageableIds.length > 0 && visibleManageableIds.every(id => selected.includes(id));

  function toggleSelectAllVisible() {
    setSelected(current => {
      if (allVisibleSelected) return current.filter(id => !visibleManageableIds.includes(id));
      return [...new Set([...current, ...visibleManageableIds])];
    });
  }

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.some(id => visibleManageableIds.includes(id)) && !allVisibleSelected;
    }
  }, [allVisibleSelected, selected, visibleManageableIds]);

  return (
    <>
      <HeroHeader
        badge="Manage Questions"
        title="Manage Questions"
        singleLine
        actions={
          <>
            <button type="button" className="btn" onClick={() => { setEdit(null); setForm(empty); setModalSubject('all'); setOpenForm(true); }}>
              <Plus size={18} /> Add Question
            </button>
            <button type="button" className="btn secondary" onClick={() => setOpenUpload(true)}>
              <UploadCloud size={18} /> Upload Bank
            </button>
            {profile?.role === 'main_admin' && (
              <Link className="btn secondary" to="/admin/chapters">
                <BookOpen size={18} /> Add Chapter
              </Link>
            )}
          </>
        }
      />

      <section className="panel management-toolbar question-toolbar">
        <label className="search-field"><Search size={18} /><input value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} placeholder="Search questions" /></label>
        <select value={filters.subject} onChange={e => setFilters({ ...filters, subject: e.target.value, chapter: 'all' })}><option value="all">All subjects</option>{subjects.map(subject => <option value={subject} key={subject}>{subject}</option>)}</select>
        <select value={filters.chapter} onChange={e => setFilters({ ...filters, chapter: e.target.value })}><option value="all">All chapters</option>{filteredChapters.map(chapter => <option value={chapter.id} key={chapter.id}>{chapter.chapter_name}</option>)}</select>
        <select value={filters.difficulty} onChange={e => setFilters({ ...filters, difficulty: e.target.value })}><option value="all">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
        {profile?.role === 'main_admin' && <select value={filters.createdBy} onChange={e => setFilters({ ...filters, createdBy: e.target.value })}><option value="all">All creators</option>{profiles.map(person => <option value={person.id} key={person.id}>{person.full_name}</option>)}</select>}
        <button className="btn secondary" type="button" onClick={toggleSelectAllVisible} disabled={!visibleManageableIds.length}>{allVisibleSelected ? 'Clear Visible' : 'Select All Visible'}</button>
        <button className="btn secondary" type="button" onClick={() => permanentlyDelete(selected, `${selected.length} selected questions`)} disabled={!selected.length}>Bulk Delete ({selected.length})</button>
        <button className="btn secondary" type="button" onClick={() => setFilters(defaultFilters)}>Reset Filters</button>
      </section>

      <section className="panel chapter-delete-panel">
        <div>
          <h2>Delete Chapter Questions</h2>
          {selectedChapter ? <p className="muted">{selectedChapterQuestionCount} manageable questions found in {selectedChapter.subject} - {selectedChapter.chapter_name}.</p> : null}
        </div>
        <div className="chapter-delete-actions">
          <button className="btn secondary danger-text" type="button" onClick={deleteChapterQuestions} disabled={filters.chapter === 'all' || selectedChapterQuestionCount === 0}>
            <Trash2 size={18} /> Delete This Chapter's Questions
          </button>
          <button className="btn secondary danger-text" type="button" onClick={removeChapter} disabled={filters.chapter === 'all' || (profile?.role !== 'main_admin' && selectedChapterTotalCount !== selectedChapterQuestionCount)}>
            <Trash2 size={18} /> Remove Chapter
          </button>
        </div>
      </section>

      {loadError && <div className="notice">Could not load questions: {loadError}. Run the latest Supabase upgrade SQL if columns like created_by/is_deleted are missing.</div>}

      <div className="question-bank-table">
        <div className="qb-row header">
          <span>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              aria-label={allVisibleSelected ? 'Clear all visible questions' : 'Select all visible questions'}
              disabled={!visibleManageableIds.length}
            />
          </span>
          <b>Question</b><b>Subject</b><b>Chapter</b><b>Difficulty</b><b>Marks</b><b>Created By</b><b>Actions</b>
        </div>
        {visibleQuestions.map(q => {
          const canManage = profile?.role === 'main_admin' || q.created_by === user.id;
          return (
            <div className="qb-row" key={q.id}>
              <span>
                <input
                  type="checkbox"
                  checked={selected.includes(q.id)}
                  onChange={() => toggleSelected(q.id)}
                  disabled={!canManage}
                  aria-label={`Select question: ${q.question_text}`}
                />
              </span>
              <span>{q.question_text}</span>
              <span>{q.chapters?.subject || '-'}</span>
              <span>{q.chapters?.chapter_name || '-'}</span>
              <span>{q.difficulty}</span>
              <span>{q.marks}</span>
              <span>{q.profiles?.full_name || '-'}</span>
              <span className="row-actions">
                {canManage && <button className="icon-btn" type="button" onClick={() => startEdit(q)} title="Edit question"><Edit3 size={18} /></button>}
                {canManage && <button className="icon-btn danger" type="button" onClick={() => permanentlyDelete([q.id], 'this question')} title="Permanently delete question"><Trash2 size={18} /></button>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="pagination-row">
        <span className="muted">Showing {Math.min(visibleLimit, filtered.length)} of {filtered.length} questions</span>
        {visibleLimit < filtered.length && <button className="btn secondary" type="button" onClick={() => setVisibleLimit(limit => limit + 25)}>Load More</button>}
      </div>

      {!filtered.length && !loadError && (
        <div className="panel empty-state">
          <b>No questions found.</b>
          <p className="muted">Try Reset Filters. If this stays empty after an upload, run the latest Supabase upgrade SQL and check that your account has Admin or Teacher role.</p>
        </div>
      )}

      {openForm && (
        <div className="modal-backdrop" role="presentation" onClick={() => { setOpenForm(false); setEdit(null); setForm(empty); }}>
          <div className="modal-card question-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">{edit ? 'Edit question' : 'Add question'}</span>
                <h2>{edit ? 'Edit Question' : 'Add Question'}</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => { setOpenForm(false); setEdit(null); setForm(empty); }}><X size={18} /></button>
            </div>
            <form className="modal-form" onSubmit={save}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                <label className="field">Subject
                  <select value={modalSubject} onChange={e => { setModalSubject(e.target.value); setForm(f => ({ ...f, chapter_id: '' })); }}>
                    <option value="all">All Subjects</option>
                    {uniqueSubjects.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </label>
                <label className="field">Chapter
                  <select value={form.chapter_id} onChange={e => setForm(f => ({ ...f, chapter_id: e.target.value }))}>
                    <option value="">Select chapter</option>
                    {filteredModalChapters.map(c => (
                      <option value={c.id} key={c.id}>{c.subject} - {c.chapter_name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">Difficulty
                  <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
              </div>
              <label className="field">Question text<textarea placeholder="Type the full question here" value={form.question_text} onChange={e => setForm({ ...form, question_text: e.target.value })} /></label>
              <div className="grid-2">{['a', 'b', 'c', 'd'].map(x => <label className="field" key={x}>Option {x.toUpperCase()}<input placeholder={`Answer choice ${x.toUpperCase()}`} value={form[`option_${x}`]} onChange={e => setForm({ ...form, [`option_${x}`]: e.target.value })} /></label>)}</div>
              <div className="grid-2">
                <label className="field">Correct answer<select value={form.correct_option} onChange={e => setForm({ ...form, correct_option: e.target.value })}><option value="A">Option A</option><option value="B">Option B</option><option value="C">Option C</option><option value="D">Option D</option></select></label>
                <label className="field">Marks per question<input type="number" min="1" value={form.marks} onChange={e => setForm({ ...form, marks: Number(e.target.value) })} /></label>
              </div>
              <label className="field">Explanation<textarea placeholder="Explain the correct answer" value={form.explanation || ''} onChange={e => setForm({ ...form, explanation: e.target.value })} /></label>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => { setOpenForm(false); setEdit(null); setForm(empty); }}>Cancel</button>
                <button className="btn" type="submit"><CheckCircle2 size={18} /> {edit ? 'Update Question' : 'Add Question'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <QuestionUploadModal open={openUpload} onClose={() => setOpenUpload(false)} onImported={load} />
    </>
  );
}
