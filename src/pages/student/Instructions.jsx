import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock3, FileText, PlayCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { startExam } from '../../services/examService.js';

export default function Instructions() {
  const { examId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [exam, setExam] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: examData }, { data: attemptData }] = await Promise.all([
        supabase.from('exams').select('*').eq('id', examId).single(),
        supabase
          .from('student_attempts')
          .select('*')
          .eq('exam_id', examId)
          .eq('student_id', user.id)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);
      setExam(examData);
      setAttempt(attemptData);
    }
    if (user?.id) load();
  }, [examId, user?.id]);

  async function begin() {
    try {
      setLoading(true);
      const attemptId = await startExam(examId);
      nav(`/student/attempt/${attemptId}`);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!exam) return <p>Loading...</p>;

  const isSubmitted = attempt?.status === 'submitted';
  const isInProgress = attempt?.status === 'in_progress';

  return (
    <div className="instructions-shell">
      <section className="panel instruction-card">
        <span className="eyebrow">Exam Brief</span>
        <h1>{exam.title}</h1>
        <p className="muted">Read the basic details once before entering the test screen.</p>

        <div className="instruction-grid">
          <div><FileText size={18} /><b>{exam.total_questions}</b><span>Questions</span></div>
          <div><Clock3 size={18} /><b>{exam.duration_minutes}</b><span>Minutes</span></div>
          <div><AlertCircle size={18} /><b>{exam.difficulty}</b><span>Difficulty</span></div>
        </div>

        {isSubmitted ? (
          <div className="notice success"><CheckCircle2 size={18} /> You have already submitted this exam.</div>
        ) : isInProgress ? (
          <div className="notice info"><PlayCircle size={18} /> You already have an active attempt for this exam.</div>
        ) : (
          <ul className="clean-list">
            <li>Do not refresh after starting.</li>
            <li>Skipped questions are counted as incorrect after submission.</li>
            <li>Result appears only if admin enabled it.</li>
          </ul>
        )}

        {isSubmitted ? (
          <Link className="btn secondary" to={`/student/result/${attempt.id}`}><CheckCircle2 size={18} /> View Result</Link>
        ) : isInProgress ? (
          <Link className="btn" to={`/student/attempt/${attempt.id}`}><PlayCircle size={18} /> Resume Exam</Link>
        ) : (
          <button className="btn" onClick={begin} disabled={loading}><PlayCircle size={18} /> {loading ? 'Starting...' : 'Start Exam'}</button>
        )}
      </section>
    </div>
  );
}
