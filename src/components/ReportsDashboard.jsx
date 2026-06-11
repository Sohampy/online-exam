import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileQuestion, TrendingDown, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';

const defaultFilters = { examId: 'all', studentId: 'all', classId: 'all', teacherId: 'all', attemptNumber: 'all', chapterId: 'all', difficulty: 'all', from: '', to: '' };

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function avg(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, item) => sum + item, 0) / nums.length : 0;
}

function minutes(seconds) {
  const total = Number(seconds || 0);
  if (!total) return '-';
  return `${Math.max(1, Math.round(total / 60))} min`;
}

function toCsv(rows) {
  return rows.map(row => row.map(cell => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
}

function downloadCsv(name, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function trendLabel(first, latest) {
  const change = Number(latest || 0) - Number(first || 0);
  if (change > 0) return { text: `Improved by ${change.toFixed(1)}%`, type: 'good' };
  if (change < 0) return { text: `Dropped by ${Math.abs(change).toFixed(1)}%`, type: 'weak' };
  return { text: 'Stable', type: 'average' };
}

function levelFor(accuracy) {
  if (accuracy >= 75) return 'Strong';
  if (accuracy >= 50) return 'Average';
  return 'Weak';
}

export default function ReportsDashboard({ scope = 'admin' }) {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState([]);
  const [details, setDetails] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teacherLinks, setTeacherLinks] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      setError('');

      const [{ data: classRows }, { data: profileRows }, { data: assignments }] = await Promise.all([
        supabase.from('classes').select('*').order('class_name'),
        supabase.from('profiles').select('id,full_name,email,role,class_id,class_name,is_active'),
        supabase.from('teacher_students').select('*').eq('status', 'active')
      ]);

      const allStudents = (profileRows || []).filter(person => person.role === 'student' && person.is_active !== false);
      const allTeachers = (profileRows || []).filter(person => person.role === 'teacher' && person.is_active !== false);
      const assignedStudentIds = scope === 'teacher'
        ? (assignments || []).filter(row => row.teacher_id === user.id).map(row => row.student_id)
        : allStudents.map(student => student.id);

      let attemptQuery = supabase
        .from('student_attempts')
        .select('*, profiles(full_name,email,class_id,class_name), exams(id,title,total_questions,total_marks,passing_marks,duration_minutes,created_by)')
        .eq('status', 'submitted')
        .order('started_at', { ascending: false });

      if (scope === 'teacher') {
        if (!assignedStudentIds.length) {
          setAttempts([]);
          setDetails([]);
          setStudents([]);
          setTeachers(allTeachers);
          setClasses(classRows || []);
          setLoading(false);
          return;
        }
        attemptQuery = attemptQuery.in('student_id', assignedStudentIds);
      }

      const { data: attemptRows, error: attemptError } = await attemptQuery;
      if (attemptError) {
        setError(attemptError.message);
        setLoading(false);
        return;
      }

      const scopedAttempts = scope === 'teacher'
        ? (attemptRows || []).filter(row => row.exams?.created_by === user.id)
        : (attemptRows || []);
      const attemptIds = scopedAttempts.map(row => row.id);

      let detailRows = [];
      if (attemptIds.length) {
        const [{ data: questionRows, error: questionError }, { data: answerRows, error: answerError }] = await Promise.all([
          supabase
            .from('exam_questions')
            .select('attempt_id,question_id,question_order,questions(id,question_text,correct_option,difficulty,marks,option_a,option_b,option_c,option_d,chapters(id,chapter_name,subject))')
            .in('attempt_id', attemptIds),
          supabase.from('student_answers').select('attempt_id,question_id,selected_option,is_correct,marks_awarded').in('attempt_id', attemptIds)
        ]);

        if (questionError || answerError) {
          setError(questionError?.message || answerError?.message);
        }

        const answerMap = (answerRows || []).reduce((map, answer) => {
          map[`${answer.attempt_id}:${answer.question_id}`] = answer;
          return map;
        }, {});

        detailRows = (questionRows || []).map(row => {
          const answer = answerMap[`${row.attempt_id}:${row.question_id}`];
          return {
            ...row,
            selected_option: answer?.selected_option || '',
            is_correct: Boolean(answer?.is_correct),
            marks_awarded: Number(answer?.marks_awarded || 0)
          };
        });
      }

      setAttempts(scopedAttempts);
      setDetails(detailRows);
      setStudents(scope === 'teacher' ? allStudents.filter(student => assignedStudentIds.includes(student.id)) : allStudents);
      setTeachers(allTeachers);
      setTeacherLinks(assignments || []);
      setClasses(classRows || []);
      setLoading(false);
    }
    load();
  }, [scope, user?.id]);

  const teacherByStudent = useMemo(() => {
    const teacherMap = teachers.reduce((map, teacher) => {
      map[teacher.id] = teacher.full_name;
      return map;
    }, {});
    return teacherLinks.reduce((map, link) => {
      if (link.status === 'active' && !map[link.student_id]) map[link.student_id] = teacherMap[link.teacher_id] || 'Assigned teacher';
      return map;
    }, {});
  }, [teacherLinks, teachers]);

  const filteredAttempts = useMemo(() => {
    return attempts.filter(attempt => {
      const started = attempt.submitted_at || attempt.started_at;
      if (filters.examId !== 'all' && attempt.exam_id !== filters.examId) return false;
      if (filters.studentId !== 'all' && attempt.student_id !== filters.studentId) return false;
      if (filters.classId !== 'all' && attempt.profiles?.class_id !== filters.classId) return false;
      if (filters.teacherId !== 'all' && attempt.exams?.created_by !== filters.teacherId) return false;
      if (filters.attemptNumber !== 'all' && Number(attempt.attempt_number || 1) !== Number(filters.attemptNumber)) return false;
      if (filters.from && new Date(started) < new Date(filters.from)) return false;
      if (filters.to && new Date(started) > new Date(`${filters.to}T23:59:59`)) return false;
      return true;
    });
  }, [attempts, filters]);

  const filteredAttemptIds = useMemo(() => new Set(filteredAttempts.map(attempt => attempt.id)), [filteredAttempts]);
  const filteredDetails = useMemo(() => {
    return details.filter(row => {
      if (!filteredAttemptIds.has(row.attempt_id)) return false;
      if (filters.chapterId !== 'all' && row.questions?.chapters?.id !== filters.chapterId) return false;
      if (filters.difficulty !== 'all' && row.questions?.difficulty !== filters.difficulty) return false;
      return true;
    });
  }, [details, filteredAttemptIds, filters]);

  const exams = useMemo(() => {
    const map = new Map();
    attempts.forEach(attempt => {
      if (attempt.exams?.id) map.set(attempt.exams.id, attempt.exams);
    });
    return [...map.values()];
  }, [attempts]);

  const chapters = useMemo(() => {
    const map = new Map();
    details.forEach(row => {
      const chapter = row.questions?.chapters;
      if (chapter?.id) map.set(chapter.id, chapter);
    });
    return [...map.values()].sort((a, b) => String(a.chapter_name).localeCompare(String(b.chapter_name)));
  }, [details]);

  const overall = useMemo(() => {
    const scores = filteredAttempts.map(row => Number(row.total_score || 0));
    const accuracies = filteredAttempts.map(row => Number(row.accuracy || row.percentage || 0));
    return {
      attempts: filteredAttempts.length,
      studentsAttempted: new Set(filteredAttempts.map(row => row.student_id)).size,
      averageScore: avg(scores),
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
      passPercentage: avg(filteredAttempts.map(row => Number(row.total_score || 0) >= Number(row.exams?.passing_marks || 0) ? 100 : 0)),
      averageTime: avg(filteredAttempts.map(row => Number(row.time_taken_seconds || 0))),
      averageAccuracy: avg(accuracies),
      reattempts: filteredAttempts.filter(row => Number(row.attempt_number || 1) > 1).length
    };
  }, [filteredAttempts]);

  const studentReports = useMemo(() => {
    const groups = filteredAttempts.reduce((map, attempt) => {
      if (!map[attempt.student_id]) map[attempt.student_id] = [];
      map[attempt.student_id].push(attempt);
      return map;
    }, {});

    return Object.entries(groups).map(([studentId, rows]) => {
      const ordered = [...rows].sort((a, b) => Number(a.attempt_number || 1) - Number(b.attempt_number || 1));
      const latest = ordered[ordered.length - 1];
      const first = ordered[0];
      const scores = ordered.map(row => Number(row.total_score || 0));
      const accuracyRows = filteredDetails.filter(detail => rows.some(attempt => attempt.id === detail.attempt_id));
      const chapterMap = accuracyRows.reduce((map, detail) => {
        const chapter = detail.questions?.chapters?.chapter_name || 'Unknown';
        if (!map[chapter]) map[chapter] = { total: 0, correct: 0 };
        map[chapter].total += 1;
        if (detail.is_correct) map[chapter].correct += 1;
        return map;
      }, {});
      const chapterScores = Object.entries(chapterMap).map(([chapter, item]) => ({ chapter, accuracy: item.total ? (item.correct / item.total) * 100 : 0 }));
      const strong = chapterScores.filter(item => item.accuracy >= 75).map(item => item.chapter).slice(0, 3);
      const weak = chapterScores.filter(item => item.accuracy < 50).map(item => item.chapter).slice(0, 3);
      const trend = trendLabel(Number(first.accuracy || first.percentage || 0), Number(latest.accuracy || latest.percentage || 0));
      return {
        studentId,
        student: latest.profiles,
        teacherName: teacherByStudent[studentId] || '-',
        exam: latest.exams,
        attempts: ordered,
        count: ordered.length,
        best: scores.length ? Math.max(...scores) : 0,
        latestScore: Number(latest.total_score || 0),
        average: avg(scores),
        trend,
        strong,
        weak,
        accuracy: avg(ordered.map(row => Number(row.accuracy || row.percentage || 0))),
        time: avg(ordered.map(row => Number(row.time_taken_seconds || 0))),
        status: Number(latest.total_score || 0) >= Number(latest.exams?.passing_marks || 0) ? 'Pass' : 'Needs Work'
      };
    });
  }, [filteredAttempts, filteredDetails, teacherByStudent]);

  const examReports = useMemo(() => {
    const groups = filteredAttempts.reduce((map, attempt) => {
      if (!map[attempt.exam_id]) map[attempt.exam_id] = [];
      map[attempt.exam_id].push(attempt);
      return map;
    }, {});
    return Object.entries(groups).map(([examId, rows]) => {
      const scores = rows.map(row => Number(row.total_score || 0));
      const best = rows.reduce((top, row) => Number(row.total_score || 0) > Number(top?.total_score || -1) ? row : top, null);
      const weakest = rows.reduce((low, row) => Number(row.total_score || 0) < Number(low?.total_score ?? Infinity) ? row : low, null);
      return {
        examId,
        exam: rows[0].exams,
        totalAssigned: rows[0].exams?.created_by ? students.filter(student => {
          if (scope === 'teacher') return true;
          const teacherStudentIds = teacherLinks.filter(link => link.teacher_id === rows[0].exams.created_by && link.status === 'active').map(link => link.student_id);
          return teacherStudentIds.length ? teacherStudentIds.includes(student.id) : true;
        }).length : students.length,
        attempted: new Set(rows.map(row => row.student_id)).size,
        totalAttempts: rows.length,
        reattempts: rows.filter(row => Number(row.attempt_number || 1) > 1).length,
        averageScore: avg(scores),
        highestScore: scores.length ? Math.max(...scores) : 0,
        lowestScore: scores.length ? Math.min(...scores) : 0,
        passPercentage: avg(rows.map(row => Number(row.total_score || 0) >= Number(row.exams?.passing_marks || 0) ? 100 : 0)),
        averageTime: avg(rows.map(row => Number(row.time_taken_seconds || 0))),
        bestStudent: best?.profiles?.full_name || '-',
        weakStudent: weakest?.profiles?.full_name || '-'
      };
    });
  }, [filteredAttempts, scope, students, teacherLinks]);

  const questionReports = useMemo(() => {
    const groups = filteredDetails.reduce((map, row) => {
      const id = row.question_id;
      if (!map[id]) map[id] = [];
      map[id].push(row);
      return map;
    }, {});
    return Object.entries(groups).map(([questionId, rows]) => {
      const correct = rows.filter(row => row.is_correct).length;
      const wrongRows = rows.filter(row => row.selected_option && !row.is_correct);
      const wrong = wrongRows.length;
      const skipped = rows.filter(row => !row.selected_option).length;
      const wrongCounts = wrongRows.reduce((map, row) => {
        map[row.selected_option] = (map[row.selected_option] || 0) + 1;
        return map;
      }, {});
      const commonWrong = Object.entries(wrongCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      const accuracy = rows.length ? (correct / rows.length) * 100 : 0;
      return { questionId, question: rows[0].questions, attempted: correct + wrong, correct, wrong, skipped, accuracy, commonWrong, actualLevel: levelFor(accuracy) };
    }).sort((a, b) => a.accuracy - b.accuracy);
  }, [filteredDetails]);

  const chapterReports = useMemo(() => {
    const groups = filteredDetails.reduce((map, row) => {
      const chapter = row.questions?.chapters?.chapter_name || 'Unknown';
      if (!map[chapter]) map[chapter] = [];
      map[chapter].push(row);
      return map;
    }, {});
    return Object.entries(groups).map(([chapter, rows]) => {
      const correct = rows.filter(row => row.is_correct).length;
      const wrong = rows.filter(row => row.selected_option && !row.is_correct).length;
      const skipped = rows.filter(row => !row.selected_option).length;
      const accuracy = rows.length ? (correct / rows.length) * 100 : 0;
      const weakness = levelFor(accuracy);
      return {
        chapter,
        total: rows.length,
        correct,
        wrong,
        skipped,
        accuracy,
        weakness,
        recommendation: weakness === 'Weak' ? `Revise basic concepts of ${chapter}.` : weakness === 'Average' ? `Practice more questions from ${chapter}.` : `Keep revising ${chapter} to maintain strength.`
      };
    }).sort((a, b) => a.accuracy - b.accuracy);
  }, [filteredDetails]);

  const difficultyReports = useMemo(() => {
    return ['easy', 'medium', 'hard'].map(difficulty => {
      const rows = filteredDetails.filter(row => row.questions?.difficulty === difficulty);
      const correct = rows.filter(row => row.is_correct).length;
      const wrong = rows.filter(row => row.selected_option && !row.is_correct).length;
      return { difficulty, total: rows.length, correct, wrong, accuracy: rows.length ? (correct / rows.length) * 100 : 0 };
    });
  }, [filteredDetails]);

  const topStudent = studentReports.reduce((top, row) => row.best > Number(top?.best || -1) ? row : top, null);
  const weakStudent = studentReports.reduce((low, row) => row.best < Number(low?.best ?? Infinity) ? row : low, null);

  if (loading) return <p>Loading reports...</p>;

  return (
    <>
      <section className="dashboard-hero report-hero">
        <div>
          <span className="eyebrow">{scope === 'teacher' ? 'Teacher Reports' : 'Reports'}</span>
          <h1>Performance insights for exams, students, chapters, and questions.</h1>
          <p>Use these reports to identify weak chapters, confusing questions, attempt trends, and students who need help.</p>
        </div>
        <div className="hero-stat"><BarChart3 size={28} /><strong>{overall.attempts}</strong><span>Submitted attempts</span></div>
      </section>

      {error && <div className="notice">Could not load full report data: {error}</div>}

      <section className="panel report-filters">
        <select value={filters.examId} onChange={e => setFilters({ ...filters, examId: e.target.value })}><option value="all">All exams</option>{exams.map(exam => <option value={exam.id} key={exam.id}>{exam.title}</option>)}</select>
        <select value={filters.studentId} onChange={e => setFilters({ ...filters, studentId: e.target.value })}><option value="all">All students</option>{students.map(student => <option value={student.id} key={student.id}>{student.full_name}</option>)}</select>
        <select value={filters.classId} onChange={e => setFilters({ ...filters, classId: e.target.value })}><option value="all">All classes</option>{classes.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}</select>
        {scope === 'admin' && <select value={filters.teacherId} onChange={e => setFilters({ ...filters, teacherId: e.target.value })}><option value="all">All teachers</option>{teachers.map(teacher => <option value={teacher.id} key={teacher.id}>{teacher.full_name}</option>)}</select>}
        <select value={filters.attemptNumber} onChange={e => setFilters({ ...filters, attemptNumber: e.target.value })}><option value="all">All attempts</option><option value="1">Attempt 1</option><option value="2">Attempt 2</option><option value="3">Attempt 3</option></select>
        <select value={filters.chapterId} onChange={e => setFilters({ ...filters, chapterId: e.target.value })}><option value="all">All chapters</option>{chapters.map(chapter => <option value={chapter.id} key={chapter.id}>{chapter.chapter_name}</option>)}</select>
        <select value={filters.difficulty} onChange={e => setFilters({ ...filters, difficulty: e.target.value })}><option value="all">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
        <input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
        <button className="btn secondary" type="button" onClick={() => setFilters(defaultFilters)}>Reset</button>
      </section>

      <div className="cards stat-strip">
        <div className="card soft-card"><h3>{overall.studentsAttempted}</h3><p>Students attempted</p></div>
        <div className="card soft-card"><h3>{overall.averageScore.toFixed(1)}</h3><p>Average score</p></div>
        <div className="card soft-card"><h3>{pct(overall.averageAccuracy)}</h3><p>Average accuracy</p></div>
        <div className="card soft-card"><h3>{pct(overall.passPercentage)}</h3><p>Pass percentage</p></div>
      </div>

      <section className="panel">
        <div className="section-title"><div><h2>Overall Exam Report</h2><p className="muted">Best: {topStudent?.student?.full_name || '-'} • Needs help: {weakStudent?.student?.full_name || '-'}</p></div><button className="btn secondary" type="button" onClick={() => downloadCsv('exam-report.csv', [['Exam', 'Assigned Students', 'Attempted Students', 'Not Attempted', 'Total Attempts', 'Average Score', 'Highest', 'Lowest', 'Pass %', 'Average Time', 'Best Student', 'Weakest Student'], ...examReports.map(row => [row.exam.title, row.totalAssigned, row.attempted, Math.max(0, row.totalAssigned - row.attempted), row.totalAttempts, row.averageScore.toFixed(1), row.highestScore, row.lowestScore, pct(row.passPercentage), minutes(row.averageTime), row.bestStudent, row.weakStudent])])}><Download size={18} /> Export</button></div>
        <div className="report-table">
          <div className="report-row header"><b>Exam</b><b>Assigned</b><b>Attempted</b><b>Avg Score</b><b>High/Low</b><b>Pass</b><b>Best / Weakest</b></div>
          {examReports.map(row => <div className="report-row" key={row.examId}><span>{row.exam.title}</span><span>{row.totalAssigned}<small>{Math.max(0, row.totalAssigned - row.attempted)} not attempted</small></span><span>{row.attempted} students<br /><small>{row.totalAttempts} attempts, {row.reattempts} reattempts</small></span><span>{row.averageScore.toFixed(1)}</span><span>{row.highestScore} / {row.lowestScore}</span><span>{pct(row.passPercentage)}</span><span>{row.bestStudent}<br /><small>{row.weakStudent}</small></span></div>)}
        </div>
      </section>

      <section className="panel">
        <div className="section-title"><div><h2>Student-wise Report</h2><p className="muted">Shows best score, latest score, improvement, weak chapters, and status.</p></div><button className="btn secondary" type="button" onClick={() => downloadCsv('student-report.csv', [['Student', 'Class', 'Assigned Teacher', 'Attempts', 'Best Score', 'Latest Score', 'Average', 'Improvement', 'Weak Chapters', 'Status'], ...studentReports.map(row => [row.student?.full_name, row.student?.class_name, row.teacherName, row.count, row.best, row.latestScore, row.average.toFixed(1), row.trend.text, row.weak.join('; '), row.status])])}><Download size={18} /> Export</button></div>
        <div className="report-table">
          <div className="report-row header"><b>Student</b><b>Class</b><b>Teacher</b><b>Attempts</b><b>Best</b><b>Latest</b><b>Improvement</b><b>Weak Chapters</b><b>Status</b></div>
          {studentReports.map(row => <div className="report-row student-detail" key={row.studentId}><span>{row.student?.full_name}<small>{row.student?.email}</small></span><span>{row.student?.class_name || '-'}</span><span>{row.teacherName}</span><span>{row.count}</span><span>{row.best}</span><span>{row.latestScore}</span><span className={`level ${row.trend.type}`}>{row.trend.type === 'good' ? <TrendingUp size={15} /> : row.trend.type === 'weak' ? <TrendingDown size={15} /> : null}{row.trend.text}</span><span>{row.weak.join(', ') || 'None'}</span><span className={`status-pill ${row.status === 'Pass' ? 'done' : ''}`}>{row.status}</span><div className="student-summary"><b>Improvement Summary</b><p>{row.student?.full_name || 'Student'} has {pct(row.accuracy)} overall accuracy. Strong chapters: {row.strong.join(', ') || 'not enough data yet'}. Weak chapters: {row.weak.join(', ') || 'none detected'}. {row.trend.text}. Average time: {minutes(row.time)}. Suggested next step: revise weak chapters and reattempt chapter-wise practice.</p></div></div>)}
        </div>
      </section>

      <section className="panel">
        <div className="section-title"><div><h2>Attempt-wise Analysis</h2><p className="muted">Every attempt is kept separately for comparison.</p></div><button className="btn secondary" type="button" onClick={() => downloadCsv('attempt-wise-report.csv', [['Student', 'Exam', 'Attempt', 'Score', 'Percentage', 'Correct', 'Wrong', 'Time Taken', 'Submitted At'], ...filteredAttempts.map(row => [row.profiles?.full_name, row.exams?.title, row.attempt_number || 1, row.total_score, row.accuracy || row.percentage, row.correct_count, row.incorrect_count, minutes(row.time_taken_seconds), row.submitted_at])])}><Download size={18} /> Export</button></div>
        <div className="report-table">
          <div className="report-row header"><b>Student</b><b>Exam</b><b>Attempt</b><b>Score</b><b>Accuracy</b><b>Correct / Wrong</b><b>Time</b><b>Submitted</b></div>
          {filteredAttempts.map(row => <div className="report-row" key={row.id}><span>{row.profiles?.full_name}</span><span>{row.exams?.title}</span><span>Attempt {row.attempt_number || 1}</span><span>{row.total_score}</span><span>{pct(row.accuracy || row.percentage)}</span><span>{row.correct_count || 0} / {row.incorrect_count || 0}</span><span>{minutes(row.time_taken_seconds)}</span><span>{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '-'}</span></div>)}
        </div>
      </section>

      <section className="panel">
        <div className="section-title"><div><h2>Question-wise Analysis</h2><p className="muted">Lowest accuracy questions appear first.</p></div><button className="btn secondary" type="button" onClick={() => downloadCsv('question-wise-report.csv', [['Question', 'Chapter', 'Difficulty', 'Attempted', 'Correct', 'Wrong', 'Skipped', 'Accuracy', 'Common Wrong'], ...questionReports.map(row => [row.question?.question_text, row.question?.chapters?.chapter_name, row.question?.difficulty, row.attempted, row.correct, row.wrong, row.skipped, pct(row.accuracy), row.commonWrong])])}><Download size={18} /> Export</button></div>
        <div className="report-table question-analysis-table">
          <div className="report-row header"><b>Question</b><b>Chapter</b><b>Difficulty</b><b>Attempted</b><b>Correct</b><b>Wrong</b><b>Accuracy</b><b>Common Wrong</b></div>
          {questionReports.map(row => <div className="report-row" key={row.questionId}><span>{row.question?.question_text}</span><span>{row.question?.chapters?.chapter_name || '-'}</span><span>{row.question?.difficulty}</span><span>{row.attempted}</span><span>{row.correct}</span><span>{row.wrong}</span><span className={`level ${row.actualLevel.toLowerCase()}`}>{pct(row.accuracy)}</span><span>{row.commonWrong}</span></div>)}
        </div>
      </section>

      <div className="report-grid-2">
        <section className="panel">
          <h2>Chapter-wise Weakness Analysis</h2>
          <div className="report-table compact-report">
            <div className="report-row header"><b>Chapter</b><b>Accuracy</b><b>Correct/Wrong</b><b>Level</b><b>Recommendation</b></div>
            {chapterReports.map(row => <div className="report-row" key={row.chapter}><span>{row.chapter}</span><span>{pct(row.accuracy)}</span><span>{row.correct}/{row.wrong}</span><span className={`level ${row.weakness.toLowerCase()}`}>{row.weakness}</span><span>{row.recommendation}</span></div>)}
          </div>
        </section>

        <section className="panel">
          <h2>Difficulty-wise Analysis</h2>
          <div className="report-table compact-report">
            <div className="report-row header"><b>Difficulty</b><b>Questions</b><b>Correct</b><b>Wrong</b><b>Accuracy</b></div>
            {difficultyReports.map(row => <div className="report-row" key={row.difficulty}><span className="capitalize">{row.difficulty}</span><span>{row.total}</span><span>{row.correct}</span><span>{row.wrong}</span><span className={`level ${levelFor(row.accuracy).toLowerCase()}`}>{pct(row.accuracy)}</span></div>)}
          </div>
        </section>
      </div>

      {!filteredAttempts.length && <div className="panel empty-state"><FileQuestion size={24} /><b>No submitted attempts match these filters.</b><p className="muted">Reports only include submitted attempts.</p></div>}
    </>
  );
}
