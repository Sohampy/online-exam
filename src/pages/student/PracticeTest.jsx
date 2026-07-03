import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, BookOpen, CheckCircle2, LoaderCircle, PlayCircle, RotateCcw, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';
import { notify } from '../../components/Notifications.jsx';
import {
  buildPracticeSignature,
  findPracticeAttemptBySignature,
  restartPracticeTest,
  startPracticeTest
} from '../../services/practiceService.js';

const questionOptions = [10, 20, 30];
const difficultyOptions = ['mixed', 'easy', 'medium', 'hard'];

export default function PracticeTest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('mixed');
  const [loading, setLoading] = useState(true);
  const [countLoading, setCountLoading] = useState(false);
  const [chapterCounts, setChapterCounts] = useState({});
  const [starting, setStarting] = useState(false);
  const [conflictAttempt, setConflictAttempt] = useState(null);
  const [pendingConfig, setPendingConfig] = useState(null);

  const [practiceAttempts, setPracticeAttempts] = useState([]);
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [showAttemptsModal, setShowAttemptsModal] = useState(false);
  const [insightsSubject, setInsightsSubject] = useState('all');
  const [attemptsSubject, setAttemptsSubject] = useState('all');

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      const [{ data: chapterRows, error }, { data: attemptRows }] = await Promise.all([
        supabase.from('chapters').select('id,chapter_name,subject').order('subject'),
        supabase.from('student_attempts').select('*').eq('student_id', user.id).eq('attempt_type', 'practice').order('started_at', { ascending: false })
      ]);
      if (error) {
        notify({ type: 'error', title: 'Could not load practice setup', message: error.message });
      }
      setChapters(chapterRows || []);
      setPracticeAttempts(attemptRows || []);
      setLoading(false);
    }
    load();
  }, [user?.id]);

  const filteredInsightsAttempts = useMemo(() => {
    if (insightsSubject === 'all') return practiceAttempts;
    return practiceAttempts.filter(a => a.practice_subject === insightsSubject);
  }, [practiceAttempts, insightsSubject]);

  const filteredInsightsSubmitted = useMemo(() => {
    return filteredInsightsAttempts.filter(a => a.status === 'submitted');
  }, [filteredInsightsAttempts]);

  const filteredInsightsStats = useMemo(() => {
    const scores = filteredInsightsSubmitted.map(a => Number(a.total_score || 0));
    const accuracies = filteredInsightsSubmitted.map(a => Number(a.accuracy || a.percentage || 0));
    return {
      taken: filteredInsightsAttempts.length,
      averageAccuracy: filteredInsightsSubmitted.length ? accuracies.reduce((sum, value) => sum + value, 0) / filteredInsightsSubmitted.length : 0,
      bestScore: scores.length ? Math.max(...scores) : 0
    };
  }, [filteredInsightsAttempts, filteredInsightsSubmitted]);

  const filteredHistoryAttempts = useMemo(() => {
    if (attemptsSubject === 'all') return practiceAttempts;
    return practiceAttempts.filter(a => a.practice_subject === attemptsSubject);
  }, [practiceAttempts, attemptsSubject]);

  useEffect(() => {
    setSelectedChapters([]);
  }, [selectedSubject]);

  useEffect(() => {
    async function loadCounts() {
      if (!selectedSubject) {
        setChapterCounts({});
        setCountLoading(false);
        return;
      }
      setCountLoading(true);
      const { data, error } = await supabase.rpc('get_practice_chapter_counts', {
        p_subject: selectedSubject,
        p_difficulty: difficulty
      });
      if (error) {
        notify({ type: 'error', title: 'Could not load chapter counts', message: error.message });
        setChapterCounts({});
      } else {
        setChapterCounts((data || []).reduce((map, row) => {
          map[row.chapter_id] = Number(row.available_count || 0);
          return map;
        }, {}));
      }
      setCountLoading(false);
    }

    loadCounts();
  }, [difficulty, selectedSubject]);

  const subjects = useMemo(() => [...new Set(chapters.map(chapter => chapter.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [chapters]);
  const filteredChapters = useMemo(() => chapters.filter(chapter => chapter.subject === selectedSubject), [chapters, selectedSubject]);
  const selectedCount = selectedChapters.length;
  const canStart = Boolean(selectedSubject && selectedChapters.length && questionCount);

  function toggleChapter(id) {
    setSelectedChapters(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  async function beginPractice(config, { reattempt = false } = {}) {
    if (!user?.id) return;
    try {
      setStarting(true);
      const attemptId = reattempt
        ? await restartPracticeTest(config.existingAttemptId)
        : await startPracticeTest({
            subject: config.subject,
            chapterIds: config.chapterIds,
            questionCount: config.questionCount,
            difficulty: config.difficulty,
            signature: config.signature
          });
      setConflictAttempt(null);
      setPendingConfig(null);
      navigate(`/student/attempt/${attemptId}`);
    } catch (error) {
      notify({
        type: 'error',
        title: 'Could not start practice test',
        message: error.message || 'Please make sure the practice SQL has been deployed in Supabase.'
      });
    } finally {
      setStarting(false);
    }
  }

  async function handleStart() {
    if (!canStart) {
      notify({ type: 'warning', title: 'Complete the setup', message: 'Choose a subject, at least one chapter, and a question count.' });
      return;
    }

    const chapterIds = [...selectedChapters].sort();
    const signature = buildPracticeSignature({
      subject: selectedSubject,
      chapterIds,
      questionCount,
      difficulty
    });

    try {
      setStarting(true);
      const existing = await findPracticeAttemptBySignature(user.id, signature);
      if (existing) {
        setConflictAttempt(existing);
        setPendingConfig({
          subject: selectedSubject,
          chapterIds,
          questionCount,
          difficulty,
          signature
        });
        return;
      }

      await beginPractice({
        subject: selectedSubject,
        chapterIds,
        questionCount,
        difficulty,
        signature
      });
    } catch (error) {
      notify({ type: 'error', title: 'Could not check practice history', message: error.message });
    } finally {
      setStarting(false);
    }
  }

  async function handleReattempt(attempt) {
    if (!user?.id) return;
    try {
      setStarting(true);
      const { data, error } = await supabase
        .from('exam_questions')
        .select('question_id, questions(chapter_id)')
        .eq('attempt_id', attempt.id);
      
      if (error) throw error;
      
      const chapterIds = Array.from(
        new Set((data || []).map(row => row.questions?.chapter_id).filter(Boolean))
      ).sort();
      
      if (!chapterIds.length) {
        throw new Error('No chapter data found for this attempt.');
      }
      
      const subject = attempt.practice_subject;
      const difficulty = attempt.difficulty || 'mixed';
      const questionCount = data.length || 10;
      
      const signature = buildPracticeSignature({
        subject,
        chapterIds,
        questionCount,
        difficulty
      });
      
      setShowAttemptsModal(false);
      
      await beginPractice({
        subject,
        chapterIds,
        questionCount,
        difficulty,
        signature
      });
    } catch (err) {
      notify({
        type: 'error',
        title: 'Could not re-attempt',
        message: err.message || 'An error occurred while setting up the re-attempt.'
      });
    } finally {
      setStarting(false);
    }
  }

  if (loading) return <LoadingScreen label="Loading practice test..." />;

  return (
    <>
      <HeroHeader
        badge="Practice Workspace"
        // title="Practice Test"
        actions={<Link className="btn secondary" to="/student/results"><RotateCcw size={18} /> My Results</Link>}
      />
      {/* <p className="muted hero-caption">Improve your understanding by practicing chapter-wise tests.</p> */}

      <div className="cards grid-2" style={{ marginBottom: '16px', gap: '12px' }}>
        <button
          type="button"
          className="card soft-card clickable-card"
          onClick={() => { setInsightsSubject('all'); setShowInsightsModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 16px', cursor: 'pointer', background: '#fff', border: '1px solid #dbe3ef', borderRadius: '10px', width: '100%' }}
        >
          <span style={{ display: 'inline-flex', padding: '6px', background: '#e0f2fe', color: '#0284c7', borderRadius: '6px', flexShrink: 0 }}>
            <BarChart3 size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b', fontWeight: 600 }}>Practice Insights</h3>
            <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.75rem', lineHeight: '1.3' }}>View overall stats, accuracy, and top scores.</p>
          </div>
        </button>

        <button
          type="button"
          className="card soft-card clickable-card"
          onClick={() => { setAttemptsSubject('all'); setShowAttemptsModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 16px', cursor: 'pointer', background: '#fff', border: '1px solid #dbe3ef', borderRadius: '10px', width: '100%' }}
        >
          <span style={{ display: 'inline-flex', padding: '6px', background: '#f0fdf4', color: '#16a34a', borderRadius: '6px', flexShrink: 0 }}>
            <RotateCcw size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b', fontWeight: 600 }}>My Practice Attempts</h3>
            <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.75rem', lineHeight: '1.3' }}>Browse and review complete history of practice tests.</p>
          </div>
        </button>
      </div>

      <section className="panel practice-setup-panel">
        <label className="field" style={{ display: 'block' }}>
          Select Subject
          <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
            <option value="">Select a subject</option>
            {subjects.map(subject => <option value={subject} key={subject}>{subject}</option>)}
          </select>
        </label>

        {selectedSubject ? (
          <>
            <div className="section-title compact">
              <div>
                <h2>Chapters</h2>
                <p className="muted">Choose one chapter or select multiple chapters for a mixed practice set.</p>
              </div>
              <span className="status-pill">{selectedCount} selected</span>
            </div>

            <div className="chapter-grid">
              {filteredChapters.map(chapter => {
                const selected = selectedChapters.includes(chapter.id);
                const available = chapterCounts[chapter.id] || 0;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    className={selected ? 'chapter-choice selected' : 'chapter-choice'}
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <span>
                      <b>{chapter.chapter_name}</b>
                      <small>{chapter.subject}</small>
                    </span>
                    <strong>{countLoading ? '...' : available}</strong>
                  </button>
                );
              })}
            </div>

            {!filteredChapters.length && <div className="notice info"><BookOpen size={18} /> No chapters are available for this subject yet.</div>}
          </>
        ) : (
          <div className="notice info"><BookOpen size={18} /> Select a subject to load its available chapters.</div>
        )}

        <div className="grid-2">
          <label className="field">
            Question Count
            <select value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))}>
              {questionOptions.map(option => <option value={option} key={option}>{option}</option>)}
            </select>
          </label>

          <label className="field">
            Difficulty
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              {difficultyOptions.map(option => <option value={option} key={option}>{option === 'mixed' ? 'Mixed' : option.charAt(0).toUpperCase() + option.slice(1)}</option>)}
            </select>
          </label>
        </div>

        <div className="practice-summary-row">
          <span><b>{selectedCount}</b><small>Selected chapters</small></span>
          <span><b>{questionCount}</b><small>Questions</small></span>
          <span><b>{difficulty === 'mixed' ? 'Mixed' : difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</b><small>Difficulty</small></span>
        </div>

        <button className="btn submit-wide" type="button" onClick={handleStart} disabled={starting || !canStart}>
          {starting ? <LoaderCircle size={18} className="spin" /> : <PlayCircle size={18} />} {starting ? 'Starting...' : 'Start Practice Test'}
        </button>
      </section>

      {conflictAttempt && (
        <div className="modal-backdrop" role="presentation" onClick={() => { if (!starting) { setConflictAttempt(null); setPendingConfig(null); } }}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="practice-test-found" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Practice Test Found</span>
                <h2 id="practice-test-found">Practice Test Found</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => { setConflictAttempt(null); setPendingConfig(null); }} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            <p className="muted">You have already attempted this practice test. Choose whether to reopen the same paper or generate a fresh one.</p>

            <div className="practice-conflict-summary">
              <span><b>{conflictAttempt.attempt_number || 1}</b><small>Attempt</small></span>
              <span><b>{conflictAttempt.status}</b><small>Status</small></span>
              <span><b>{conflictAttempt.practice_question_count || questionCount}</b><small>Questions</small></span>
            </div>

            <div className="modal-actions">
              <button
                className="btn secondary"
                type="button"
                disabled={starting}
                onClick={() => beginPractice({ existingAttemptId: conflictAttempt.id }, { reattempt: true })}
              >
                <RotateCcw size={18} /> Reattempt Previous Test
              </button>
              <button
                className="btn"
                type="button"
                disabled={starting || !pendingConfig}
                onClick={() => beginPractice(pendingConfig)}
              >
                <CheckCircle2 size={18} /> Generate New Practice Test
              </button>
            </div>
          </div>
        </div>
      )}

      {showInsightsModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowInsightsModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', padding: '24px' }}>
            <div className="modal-head" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <span className="eyebrow">Performance Overview</span>
                <h2>Practice Insights</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setShowInsightsModal(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label className="field" style={{ display: 'block' }}>
                  Filter by Subject
                  <select value={insightsSubject} onChange={e => setInsightsSubject(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.9rem', borderRadius: '6px' }}>
                    <option value="all">All Subjects</option>
                    {subjects.map(subj => <option value={subj} key={subj}>{subj}</option>)}
                  </select>
                </label>
              </div>

              <div className="cards stat-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div className="card soft-card" style={{ padding: '16px', textAlign: 'center', background: '#f8fafc' }}>
                  <h3 style={{ fontSize: '1.8rem', margin: '0 0 4px 0' }}>{filteredInsightsStats.taken}</h3>
                  <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>Tests Taken</p>
                </div>
                <div className="card soft-card" style={{ padding: '16px', textAlign: 'center', background: '#f8fafc' }}>
                  <h3 style={{ fontSize: '1.8rem', margin: '0 0 4px 0' }}>{filteredInsightsStats.averageAccuracy.toFixed(1)}%</h3>
                  <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>Average Accuracy</p>
                </div>
                <div className="card soft-card" style={{ padding: '16px', textAlign: 'center', background: '#f8fafc' }}>
                  <h3 style={{ fontSize: '1.8rem', margin: '0 0 4px 0' }}>{filteredInsightsStats.bestScore}</h3>
                  <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>Best Score</p>
                </div>
              </div>

              <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '10px', border: '1px solid #bae6fd' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#0369a1' }}>Practice Tips</h4>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.875rem', lineHeight: '1.6', color: '#0c4a6e' }}>
                  <li>Practice tests are designed to help you prepare chapter-by-chapter without impacting your GPA or official grades.</li>
                  <li>Target your weakest subjects and chapters regularly to improve your average practice accuracy.</li>
                  <li>Review detailed explanations of incorrect answers by using the review button on any past attempt.</li>
                </ul>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
              <button className="btn secondary" type="button" onClick={() => setShowInsightsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showAttemptsModal && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowAttemptsModal(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px', padding: '24px' }}>
            <div className="modal-head" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <span className="eyebrow">Attempt History</span>
                <h2>My Practice Attempts</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setShowAttemptsModal(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label className="field" style={{ display: 'block' }}>
                  Filter by Subject
                  <select value={attemptsSubject} onChange={e => setAttemptsSubject(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.9rem', borderRadius: '6px' }}>
                    <option value="all">All Subjects</option>
                    {subjects.map(subj => <option value={subj} key={subj}>{subj}</option>)}
                  </select>
                </label>
              </div>

              <div className="table compact-table">
                {filteredHistoryAttempts.map(attempt => (
                  <div className="tr" key={attempt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 8px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ textAlign: 'left' }}>
                      <b style={{ display: 'block', fontSize: '0.95rem' }}>{attempt.practice_subject || 'Practice Test'}</b>
                      <small className="muted" style={{ display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>
                        Attempt {attempt.attempt_number || 1} • Score {attempt.total_score || 0} • Accuracy {Number(attempt.accuracy || attempt.percentage || 0)}% • Started {attempt.started_at ? new Date(attempt.started_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}
                      </small>
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => {
                          setShowAttemptsModal(false);
                          navigate(attempt.status === 'in_progress' ? `/student/attempt/${attempt.id}` : `/student/practice/review/${attempt.id}`);
                        }}
                        style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      >
                        {attempt.status === 'in_progress' ? 'Resume' : 'Review'}
                      </button>
                      {attempt.status === 'submitted' && (
                        <button
                          className="btn"
                          type="button"
                          disabled={starting}
                          onClick={() => handleReattempt(attempt)}
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                        >
                          Re-attempt
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {!filteredHistoryAttempts.length && (
                  <p className="muted" style={{ textAlign: 'center', padding: '20px 0' }}>No practice tests attempted yet.</p>
                )}
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '20px', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
              <button className="btn secondary" type="button" onClick={() => setShowAttemptsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
