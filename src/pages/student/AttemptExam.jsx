import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Eraser, Flag, Save } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { getAttemptQuestions, getSavedAnswers, saveAttemptAnswer, submitExam } from '../../services/examService.js';

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
        nav(`/student/result/${attemptId}`);
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
    if (!attempt || !exam) return;
    const endTime = new Date(attempt.started_at).getTime() + Number(exam.duration_minutes || 0) * 60 * 1000;
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
    goTo(Math.min(current + 1, questions.length - 1));
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
    if (!auto && !confirm('Submit exam now? You cannot change answers after final submission.')) return;
    try {
      setSubmitting(true);
      await submitExam(attemptId, finalAnswers, finalReview);
      nav(`/student/result/${attemptId}`);
    } catch (e) {
      alert(e.message);
      setSubmitting(false);
    }
  }

  if (!attempt || !active) return <p>Loading...</p>;

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
            <button className="btn" type="button" onClick={saveAndNext}><Save size={18} /> Save & Next</button>
            <button className="btn secondary" type="button" onClick={() => goTo(current + 1)} disabled={current === questions.length - 1}>Next <ChevronRight size={18} /></button>
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
          <div className="notice info"><AlertTriangle size={18} /> Answers are saved when you choose, clear, review, or save & next.</div>
          <button className="btn submit-wide" type="button" onClick={() => handleSubmit(false)} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Exam'}</button>
        </aside>
      </main>
    </div>
  );
}
