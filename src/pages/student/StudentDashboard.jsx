import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, FileText, PlayCircle, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const view = location.pathname.endsWith('/attempts') ? 'attempts' : location.pathname.endsWith('/results') ? 'results' : location.pathname.endsWith('/exams') ? 'exams' : 'dashboard';

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      const [{ data: examRows }, { data: attemptRows }, { data: links }] = await Promise.all([
        supabase.from('exams').select('*, profiles(full_name,role,is_active), exam_visibility(*)').order('created_at', { ascending: false }),
        supabase.from('student_attempts').select('*').eq('student_id', user.id).order('started_at', { ascending: false }),
        supabase.from('teacher_students').select('teacher_id').eq('student_id', user.id).eq('status', 'active')
      ]);
      const assignedTeachers = (links || []).map(link => link.teacher_id);
      setExams((examRows || []).filter(exam => {
        if ((exam.status && exam.status !== 'published') || exam.is_published === false || exam.is_active === false) return false;
        if (exam.profiles?.is_active === false) return false;
        const creatorRole = exam.created_by_role || exam.profiles?.role || 'main_admin';
        if (creatorRole === 'teacher') return assignedTeachers.includes(exam.created_by);
        const visibilityRows = exam.exam_visibility || [];
        if (!visibilityRows.length || exam.visibility_type === 'all_students' || visibilityRows.some(row => row.visibility_type === 'all_students')) return true;
        if (visibilityRows.some(row => row.class_id && row.class_id === profile?.class_id)) return true;
        if (visibilityRows.some(row => row.student_id && row.student_id === user.id)) return true;
        return false;
      }));
      setAttempts(attemptRows || []);
      setLoading(false);
    }
    load();
  }, [profile?.class_id, user?.id]);

  const attemptsByExam = useMemo(() => {
    return attempts.reduce((map, attempt) => {
      if (!map[attempt.exam_id]) map[attempt.exam_id] = [];
      map[attempt.exam_id].push(attempt);
      return map;
    }, {});
  }, [attempts]);

  const stats = useMemo(() => {
    const completed = attempts.filter(attempt => attempt.status === 'submitted').length;
    const inProgress = attempts.filter(attempt => attempt.status === 'in_progress').length;
    const bestAccuracy = attempts.filter(attempt => attempt.status === 'submitted').reduce((best, attempt) => Math.max(best, Number(attempt.accuracy || 0)), 0);
    return { completed, inProgress, bestAccuracy };
  }, [attempts]);

  const submittedAttempts = useMemo(() => attempts.filter(attempt => attempt.status === 'submitted'), [attempts]);
  const visibleExams = useMemo(() => {
    if (view !== 'exams') return exams;
    return exams.filter(exam => {
      const rows = attemptsByExam[exam.id] || [];
      const submitted = rows.filter(attempt => attempt.status === 'submitted');
      const inProgress = rows.some(attempt => attempt.status === 'in_progress');
      if (inProgress) return true;
      if (exam.allow_multiple_attempts) {
        return !exam.max_attempts || submitted.length < exam.max_attempts;
      }
      return submitted.length === 0;
    });
  }, [attemptsByExam, exams, view]);

  function titleForView() {
    if (view === 'exams') return ['Available Exams', 'Start new exams, resume active exams, or retake allowed exams.'];
    if (view === 'attempts') return ['My Attempts', 'Track every exam attempt separately.'];
    if (view === 'results') return ['My Results', 'Open submitted attempts and review your performance.'];
    return ['Student Dashboard', 'Start new exams, resume active attempts, retake allowed exams, and review detailed summaries.'];
  }

  if (loading) return <LoadingScreen label="Loading student dashboard..." />;
  return (
    <>
      <HeroHeader
        badge="Student Workspace"
        title="Student Dashboard"
        singleLine
        actions={(
          <>
          <Link className="btn" to="/student/exams"><PlayCircle size={18} /> Available Exams</Link>
          <Link className="btn secondary" to="/student/attempts"><RotateCcw size={18} /> My Attempts</Link>
          <Link className="btn secondary" to="/student/results"><CheckCircle2 size={18} /> My Results</Link>
          </>
        )}
      />

      <div className="cards stat-strip">
        <Link className="card soft-card clickable-card" to="/student/exams" aria-label="Open available exams"><h3>{exams.length}</h3><p>Available exams</p></Link>
        <Link className="card soft-card clickable-card" to="/student/attempts" aria-label="Open previous attempts"><h3>{attempts.length}</h3><p>My attempts</p></Link>
        <Link className="card soft-card clickable-card" to="/student/results" aria-label="Open my results"><h3>{stats.completed}</h3><p>My results</p></Link>
      </div>

      {view === 'attempts' && (
        <section className="panel">
          <h2>My Attempts</h2>
          <div className="table">
            {attempts.map(attempt => {
              const exam = exams.find(item => item.id === attempt.exam_id);
              return (
                <div className="tr" key={attempt.id}>
                  <span><b>{exam?.title || 'Exam'}</b><small>Attempt {attempt.attempt_number || 1} • {attempt.status} • Started {formatDate(attempt.started_at)}</small></span>
                  {attempt.status === 'in_progress'
                    ? <Link className="btn" to={`/student/attempt/${attempt.id}`}>Resume Exam</Link>
                    : <Link className="btn secondary" to={`/student/result/${attempt.id}`}>View Result</Link>}
                </div>
              );
            })}
            {!attempts.length && <p className="muted">No attempts yet.</p>}
          </div>
        </section>
      )}

      {view === 'results' && (
        <section className="panel">
          <h2>My Results</h2>
          <div className="table">
            {submittedAttempts.map(attempt => {
              const exam = exams.find(item => item.id === attempt.exam_id);
              return (
                <div className="tr" key={attempt.id}>
                  <span><b>{exam?.title || 'Exam'}</b><small>Attempt {attempt.attempt_number || 1} • Score {attempt.total_score || 0} • Accuracy {attempt.accuracy || attempt.percentage || 0}% • Submitted {formatDate(attempt.submitted_at)}</small></span>
                  <Link className="btn secondary" to={`/student/result/${attempt.id}`}>Open Result</Link>
                </div>
              );
            })}
            {!submittedAttempts.length && <p className="muted">No submitted results yet.</p>}
          </div>
        </section>
      )}

      {(view === 'dashboard' || view === 'exams') && <div className="exam-list">
        {visibleExams.map(exam => {
          const examAttempts = attemptsByExam[exam.id] || [];
          const inProgress = examAttempts.find(attempt => attempt.status === 'in_progress');
          const submitted = examAttempts.filter(attempt => attempt.status === 'submitted');
          const latest = examAttempts[0];
          const best = submitted.reduce((top, attempt) => Number(attempt.total_score || 0) > Number(top?.total_score || -1) ? attempt : top, null);
          const maxAttempts = exam.allow_multiple_attempts ? exam.max_attempts : 1;
          const remaining = exam.allow_multiple_attempts && maxAttempts ? Math.max(0, maxAttempts - submitted.length) : exam.allow_multiple_attempts ? 'Unlimited' : Math.max(0, 1 - submitted.length);
          const canStart = inProgress || exam.allow_multiple_attempts ? remaining === 'Unlimited' || remaining > 0 || inProgress : submitted.length === 0 || inProgress;
          const actionLink = inProgress ? `/student/attempt/${inProgress.id}` : canStart ? `/student/instructions/${exam.id}` : latest ? `/student/result/${latest.id}` : `/student/instructions/${exam.id}`;
          const actionText = inProgress ? 'Resume Exam' : submitted.length && canStart ? 'Retake Exam' : submitted.length ? 'View Result' : 'Start Exam';
          const ActionIcon = inProgress ? PlayCircle : submitted.length && canStart ? RotateCcw : submitted.length ? CheckCircle2 : FileText;

          return (
            <article className="exam-card student-exam-card" key={exam.id}>
              <div className="exam-card-main">
                <div>
                  <h2>{exam.title}</h2>
                  <p className="muted">{exam.total_questions} questions • {exam.duration_minutes} minutes • {exam.difficulty} • By {exam.profiles?.full_name || 'Admin'}</p>
                </div>
                <span className={inProgress ? 'status-pill live' : submitted.length ? 'status-pill done' : 'status-pill'}>{inProgress ? 'In progress' : submitted.length ? 'Attempted' : 'Ready'}</span>
              </div>
              <div className="mini-score">
                <span><b>{submitted.length}</b><small>Attempts</small></span>
                <span><b>{remaining}</b><small>Remaining</small></span>
                <span><b>{best?.total_score || 0}</b><small>Best score</small></span>
              </div>
              {latest && <div className="attempt-summary"><Clock3 size={16} /><span>Latest: {latest.status} {formatDate(latest.submitted_at || latest.started_at)}</span></div>}
              <Link className={submitted.length && !canStart ? 'btn secondary' : 'btn'} to={actionLink}>
                <ActionIcon size={18} /> {actionText} <ArrowRight size={18} />
              </Link>
              {submitted.length > 1 && (
                <div className="attempt-chips">
                  {submitted.map(attempt => <Link to={`/student/result/${attempt.id}`} key={attempt.id}>Attempt {attempt.attempt_number || 1}: {attempt.total_score}</Link>)}
                </div>
              )}
            </article>
          );
        })}
        {!visibleExams.length && <div className="panel empty-state"><b>No available exams found.</b><p className="muted">When an exam is assigned to you, it will appear here.</p></div>}
      </div>}
    </>
  );
}
