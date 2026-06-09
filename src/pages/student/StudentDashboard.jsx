import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, FileText, PlayCircle, Trophy } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      const [{ data: examRows }, { data: attemptRows }] = await Promise.all([
        supabase.from('exams').select('*').order('created_at', { ascending: false }),
        supabase
          .from('student_attempts')
          .select('*')
          .eq('student_id', user.id)
          .order('started_at', { ascending: false })
      ]);
      setExams(examRows || []);
      setAttempts(attemptRows || []);
      setLoading(false);
    }
    load();
  }, [user?.id]);

  const attemptsByExam = useMemo(() => {
    return attempts.reduce((map, attempt) => {
      if (!map[attempt.exam_id] || attempt.status === 'in_progress') map[attempt.exam_id] = attempt;
      return map;
    }, {});
  }, [attempts]);

  const stats = useMemo(() => {
    const completed = attempts.filter(attempt => attempt.status === 'submitted').length;
    const inProgress = attempts.filter(attempt => attempt.status === 'in_progress').length;
    const bestAccuracy = attempts
      .filter(attempt => attempt.status === 'submitted')
      .reduce((best, attempt) => Math.max(best, Number(attempt.accuracy || 0)), 0);
    return { completed, inProgress, bestAccuracy };
  }, [attempts]);

  if (loading) return <p>Loading...</p>;

  return (
    <>
      <section className="dashboard-hero student-hero">
        <div>
          <span className="eyebrow">Student Workspace</span>
          <h1>Your exams, neatly lined up.</h1>
          <p>Start pending tests, resume active attempts, and review completed results from one place.</p>
        </div>
        <div className="hero-stat">
          <Trophy size={28} />
          <strong>{stats.bestAccuracy}%</strong>
          <span>Best accuracy</span>
        </div>
      </section>

      <div className="cards stat-strip">
        <div className="card soft-card"><h3>{exams.length}</h3><p>Available exams</p></div>
        <div className="card soft-card"><h3>{stats.inProgress}</h3><p>In progress</p></div>
        <div className="card soft-card"><h3>{stats.completed}</h3><p>Completed</p></div>
      </div>

      <div className="exam-list">
        {exams.map(exam => {
          const attempt = attemptsByExam[exam.id];
          const isSubmitted = attempt?.status === 'submitted';
          const isInProgress = attempt?.status === 'in_progress';
          const actionLink = isSubmitted ? `/student/result/${attempt.id}` : isInProgress ? `/student/attempt/${attempt.id}` : `/student/instructions/${exam.id}`;
          const actionText = isSubmitted ? 'View Result' : isInProgress ? 'Resume Exam' : 'View Instructions';
          const ActionIcon = isSubmitted ? CheckCircle2 : isInProgress ? PlayCircle : FileText;

          return (
            <article className="exam-card student-exam-card" key={exam.id}>
              <div className="exam-card-main">
                <div>
                  <h2>{exam.title}</h2>
                  <p className="muted">{exam.total_questions} questions • {exam.duration_minutes} minutes • {exam.difficulty}</p>
                </div>
                <span className={isSubmitted ? 'status-pill done' : isInProgress ? 'status-pill live' : 'status-pill'}>{isSubmitted ? 'Completed' : isInProgress ? 'In progress' : 'Ready'}</span>
              </div>
              {attempt && (
                <div className="attempt-summary">
                  <Clock3 size={16} />
                  <span>{isSubmitted ? `Submitted ${formatDate(attempt.submitted_at)}` : `Started ${formatDate(attempt.started_at)}`}</span>
                </div>
              )}
              {isSubmitted && (
                <div className="mini-score">
                  <span><b>{attempt.total_score}</b><small>Score</small></span>
                  <span><b>{attempt.correct_count}</b><small>Correct</small></span>
                  <span><b>{attempt.accuracy}%</b><small>Accuracy</small></span>
                </div>
              )}
              <Link className={isSubmitted ? 'btn secondary' : 'btn'} to={actionLink}>
                <ActionIcon size={18} /> {actionText} <ArrowRight size={18} />
              </Link>
            </article>
          );
        })}
      </div>
    </>
  );
}
