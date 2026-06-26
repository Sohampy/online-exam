import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock3, FileText, PlayCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { startExam } from '../../services/examService.js';
import LoadingScreen from '../../components/LoadingScreen.jsx';

export default function Instructions() {
  const { examId } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [exam, setExam] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: examData }, { data: attemptRows }] = await Promise.all([
        supabase.from('exams').select('*').eq('id', examId).single(),
        supabase
          .from('student_attempts')
          .select('*')
          .eq('exam_id', examId)
          .eq('student_id', user.id)
          .order('started_at', { ascending: false })
      ]);
      setExam(examData);
      setAttempts(attemptRows || []);
      setAttempt((attemptRows || [])[0] || null);
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

  if (!exam) return <LoadingScreen label="Loading exam instructions..." />;

  const isSubmitted = attempt?.status === 'submitted';
  const isInProgress = attempt?.status === 'in_progress';
  const submittedCount = attempts.filter(row => row.status === 'submitted').length;
  const canRetake = exam.allow_multiple_attempts && (!exam.max_attempts || submittedCount < exam.max_attempts);

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

        {isSubmitted && !canRetake ? (
          <div className="notice success"><CheckCircle2 size={18} /> You have already submitted this exam.</div>
        ) : isSubmitted && canRetake ? (
          <div className="notice info"><PlayCircle size={18} /> You have submitted {submittedCount} attempt(s). Another attempt is available.</div>
        ) : isInProgress ? (
          <div className="notice info"><PlayCircle size={18} /> You already have an active attempt for this exam.</div>
        ) : (
          <ul className="clean-list">
            <li>Do not refresh after starting.</li>
            <li>Skipped questions are counted as incorrect after submission.</li>
            <li>Result appears only if admin enabled it.</li>
          </ul>
        )}

        {isSubmitted && !canRetake ? (
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
