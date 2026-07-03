import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Eraser, Flag, Save, SendHorizonal, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { getAttemptQuestions, getSavedAnswers, saveAttemptAnswer, submitExam } from '../../services/examService.js';
import LoadingScreen from '../../components/LoadingScreen.jsx';

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const mins = String(Math.floor(safe / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function AttemptExam() {
  const { attemptId } = useParams();
  const nav = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [review, setReview] = useState({});
  const [visited, setVisited] = useState({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const answersRef = useRef({});
  const reviewRef = useRef({});

  useEffect(() => {
    answersRef.current = answers;
    reviewRef.current = review;
  }, [answers, review]);

  useEffect(() => {
    async function load() {
      const { data: a } = await supabase.from('student_attempts').select('*, exams(*)').eq('id', attemptId).single();
      if (a?.status === 'submitted') {
        nav(a?.attempt_type === 'practice' ? `/student/practice/review/${attemptId}` : `/student/result/${attemptId}`);
        return;
      }
      const questionRows = await getAttemptQuestions(attemptId);
      const saved = await getSavedAnswers(attemptId);
      setAttempt(a);
      setExam(a?.exams);
      setQuestions(questionRows);
      setAnswers(Object.fromEntries(Object.entries(saved).map(([id, row]) => [id, row.selected_option])));
      setReview(Object.fromEntries(Object.entries(saved).map(([id, row]) => [id, row.review_status])));
      setVisited(questionRows[0] ? { [questionRows[0].id]: true } : {});
    }
    load();
  }, [attemptId, nav]);

  useEffect(() => {
    if (!attempt) return;
    const durationMinutes = Number(exam?.duration_minutes || attempt.practice_duration_minutes || 0);
    const endTime = new Date(attempt.started_at).getTime() + durationMinutes * 60 * 1000;
    const timer = setInterval(() => {
      const next = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setRemaining(next);
      if (next <= 0) {
        clearInterval(timer);
        handleSubmit(true, answersRef.current, reviewRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [attempt, exam]);

  const active = questions[current];
  const isLastQuestion = current === questions.length - 1;

  const counts = useMemo(() => {
    return questions.reduce((map, question) => {
      const status = getStatus(question.id);
      map[status] = (map[status] || 0) + 1;
      return map;
    }, {});
  }, [answers, review, visited, questions]);

  function getStatus(questionId) {
    const isVisited = visited[questionId];
    const hasAnswer = Boolean(answers[questionId]);
    const isReview = review[questionId]?.includes('review');
    if (hasAnswer && isReview) return 'answered_review';
    if (isReview) return 'review';
    if (hasAnswer) return 'answered';
    if (isVisited) return 'not_answered';
    return 'not_visited';
  }

  async function setAnswer(value) {
    if (!active) return;
    const nextStatus = review[active.id]?.includes('review') ? 'answered_review' : 'answered';
    setAnswers(prev => ({ ...prev, [active.id]: value }));
    setReview(prev => ({ ...prev, [active.id]: nextStatus }));
    await saveAttemptAnswer(attemptId, active.id, value, nextStatus);
  }

  async function saveAndNext() {
    if (!active) return;
    const status = answers[active.id] ? review[active.id] || 'answered' : 'not_answered';
    await saveAttemptAnswer(attemptId, active.id, answers[active.id], status);
    if (isLastQuestion) {
      // Last question → open submit modal instead of looping
      setShowSubmitModal(true);
    } else {
      goTo(current + 1);
    }
  }

  async function markForReview() {
    if (!active) return;
    const status = answers[active.id] ? 'answered_review' : 'review';
    setReview(prev => ({ ...prev, [active.id]: status }));
    await saveAttemptAnswer(attemptId, active.id, answers[active.id], status);
  }

  async function clearResponse() {
    if (!active) return;
    setAnswers(prev => ({ ...prev, [active.id]: null }));
    setReview(prev => ({ ...prev, [active.id]: 'not_answered' }));
    await saveAttemptAnswer(attemptId, active.id, null, 'not_answered');
  }

  function goTo(index) {
    const next = questions[index];
    if (!next) return;
    setCurrent(index);
    setVisited(prev => ({ ...prev, [next.id]: true }));
  }

  async function handleSubmit(auto = false, finalAnswers = answers, finalReview = review) {
    if (submitting) return;
    if (!auto) {
      setShowSubmitModal(true);
      return;
    }
    // Auto-submit (timer ended) – skip modal
    doSubmit(finalAnswers, finalReview);
  }

  async function doSubmit(finalAnswers = answers, finalReview = review) {
    if (submitting) return;
    setSubmitError('');
    try {
      setSubmitting(true);
      setShowSubmitModal(false);
      await submitExam(attemptId, finalAnswers, finalReview);
      nav(`/student/result/${attemptId}`);
    } catch (e) {
      setSubmitError(e.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
      setShowSubmitModal(true);
    }
  }

  if (!attempt || !active) return <LoadingScreen label="Loading exam attempt..." />;

  const answeredCount = questions.filter(q => answers[q.id]).length;
  const unansweredCount = questions.length - answeredCount;
  const markedCount = questions.filter(q => review[q.id]?.includes('review')).length;

  return (
    <div className="exam-shell">
      <header className="exam-header">
        <div>
          <h1>{exam?.title}</h1>
          <p className="muted">Attempt {attempt.attempt_number || 1} • Question {current + 1} of {questions.length}</p>
        </div>
        <div className={remaining < 300 ? 'timer danger' : 'timer'}>{formatTime(remaining)}</div>
      </header>

      <main className="exam-workspace">
        <section className="panel live-question">
          <div className="question-stem">
            <span>Q{current + 1}</span>
            <h2>{active.question_text}</h2>
          </div>
          <div className="live-options">
            {[
              ['A', active.option_a],
              ['B', active.option_b],
              ['C', active.option_c],
              ['D', active.option_d]
            ].map(([key, text]) => (
              <label className={answers[active.id] === key ? 'live-option selected' : 'live-option'} key={key}>
                <input type="radio" name={active.id} checked={answers[active.id] === key} onChange={() => setAnswer(key)} />
                <b>{key}</b>
                <span>{text}</span>
              </label>
            ))}
          </div>
          <div className="exam-actions-row">
            <button className="btn secondary" type="button" onClick={() => goTo(current - 1)} disabled={current === 0}><ChevronLeft size={18} /> Previous</button>
            <button className="btn secondary" type="button" onClick={clearResponse}><Eraser size={18} /> Clear Response</button>
            <button className="btn secondary" type="button" onClick={markForReview}><Flag size={18} /> Mark for Review</button>
            <button className="btn" type="button" onClick={saveAndNext}>
              <Save size={18} /> {isLastQuestion ? 'Save & Submit' : 'Save & Next'}
            </button>
            <button 
              className="btn secondary" 
              type="button" 
              onClick={() => {
                if (isLastQuestion) {
                  setShowSubmitModal(true);
                } else {
                  goTo(current + 1);
                }
              }}
            >
              Next <ChevronRight size={18} />
            </button>
          </div>
        </section>

        <aside className="panel question-palette">
          <h2>Question Palette</h2>
          <div className="palette-grid">
            {questions.map((question, index) => <button type="button" className={`palette-btn ${getStatus(question.id)}`} onClick={() => goTo(index)} key={question.id}>{index + 1}</button>)}
          </div>
          <div className="palette-legend">
            <span><i className="not_visited" /> Not Visited ({counts.not_visited || 0})</span>
            <span><i className="not_answered" /> Not Answered ({counts.not_answered || 0})</span>
            <span><i className="answered" /> Answered ({counts.answered || 0})</span>
            <span><i className="review" /> Review ({counts.review || 0})</span>
            <span><i className="answered_review" /> Answered + Review ({counts.answered_review || 0})</span>
          </div>
          <div className="notice info"><AlertTriangle size={18} /> Answers are saved when you choose, clear, review, or save &amp; next.</div>
          <button className="btn submit-wide" type="button" onClick={() => handleSubmit(false)} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Exam'}</button>
        </aside>
      </main>

      {/* Custom Submit Confirmation Modal */}
      {showSubmitModal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => { if (!submitting) setShowSubmitModal(false); }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-modal-title"
            style={{ maxWidth: '500px', padding: '32px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <span style={{
                flexShrink: 0,
                width: 48, height: 48,
                borderRadius: '50%',
                background: 'linear-gradient(135deg,#f97316,#ef4444)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <SendHorizonal size={22} color="#fff" />
              </span>
              <div style={{ flex: 1 }}>
                <h2 id="submit-modal-title" style={{ marginBottom: 6, fontSize: '1.15rem' }}>Submit Exam?</h2>
                <p className="muted" style={{ marginBottom: 16, lineHeight: 1.5 }}>
                  You are about to submit your exam. <strong>You cannot change your answers after submission.</strong>
                </p>
                 <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', marginBottom: submitError ? 14 : 0 }}>
                  <span className="chip" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 10px', flex: '1 1 auto', minWidth: '0', cursor: 'default' }}>
                    <b style={{ fontSize: '1rem', lineHeight: '1.2' }}>{answeredCount}</b>
                    <small style={{ fontSize: '11px', marginTop: '2px' }}>Answered</small>
                  </span>
                  {unansweredCount > 0 && (
                    <span className="chip" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fff3cd', color: '#92400e', borderColor: '#fef3c7', padding: '8px 10px', flex: '1.2 1 auto', minWidth: '0', cursor: 'default' }}>
                      <b style={{ fontSize: '1rem', lineHeight: '1.2' }}>{unansweredCount}</b>
                      <small style={{ color: '#92400e', fontSize: '11px', marginTop: '2px' }}>Unanswered</small>
                    </span>
                  )}
                  {markedCount > 0 && (
                    <span className="chip" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#1d4ed8', borderColor: '#dbeafe', padding: '8px 10px', flex: '1 1 auto', minWidth: '0', cursor: 'default' }}>
                      <b style={{ fontSize: '1rem', lineHeight: '1.2' }}>{markedCount}</b>
                      <small style={{ color: '#1d4ed8', fontSize: '11px', marginTop: '2px' }}>Marked</small>
                    </span>
                  )}
                  <span className="chip" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 10px', flex: '1 1 auto', minWidth: '0', cursor: 'default' }}>
                    <b style={{ fontSize: '1rem', lineHeight: '1.2' }}>{questions.length}</b>
                    <small style={{ fontSize: '11px', marginTop: '2px' }}>Total</small>
                  </span>
                </div>
                {submitError && (
                  <div className="notice" style={{ marginTop: 12, color: '#b91c1c', background: '#fef2f2', borderColor: '#fca5a5' }}>
                    <AlertTriangle size={16} /> {submitError}
                  </div>
                )}
              </div>
              {!submitting && (
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  aria-label="Close"
                  style={{ flexShrink: 0 }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                Go Back
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => doSubmit()}
                disabled={submitting}
                style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)', borderColor: 'transparent' }}
              >
                <SendHorizonal size={16} /> {submitting ? 'Submitting…' : 'Yes, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
