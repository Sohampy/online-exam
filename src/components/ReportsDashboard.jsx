import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Download,
  Eye,
  FileQuestion,
  Filter,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingScreen from './LoadingScreen.jsx';
import HeroHeader from './HeroHeader.jsx';
import CollapsibleSection from './CollapsibleSection.jsx';
import StudentReviewModal from './StudentReviewModal.jsx';

const defaultFilters = {
  examId: 'all',
  studentId: 'all',
  classId: 'all',
  teacherId: 'all',
  attemptNumber: 'all',
  chapterId: 'all',
  difficulty: 'all',
  from: '',
  to: ''
};

const reportCategories = [
  { key: 'exam', label: 'Exam Analytics', icon: ClipboardList },
  { key: 'student', label: 'Student Analytics', icon: Users },
  { key: 'chapter', label: 'Chapter Analytics', icon: BookOpen },
  { key: 'question', label: 'Question Analytics', icon: FileQuestion }
];

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
  const detailSectionRef = useRef(null);
  const [attempts, setAttempts] = useState([]);
  const [details, setDetails] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teacherLinks, setTeacherLinks] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('exam');
  const [reviewReport, setReviewReport] = useState(null);
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
          setTeacherLinks(assignments || []);
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

  const updateFilter = (key, value) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === 'classId') {
        next.studentId = 'all';
        next.examId = 'all';
        next.chapterId = 'all';
      }
      if (key === 'studentId') {
        next.examId = 'all';
        next.chapterId = 'all';
      }
      if (key === 'examId') {
        next.chapterId = 'all';
      }
      return next;
    });
  };

  const studentOptions = useMemo(() => {
    return [...students]
      .filter(student => filters.classId === 'all' || student.class_id === filters.classId)
      .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  }, [students, filters.classId]);

  const attemptWindow = useMemo(() => {
    return attempts.filter(attempt => {
      const started = attempt.submitted_at || attempt.started_at;
      if (filters.classId !== 'all' && attempt.profiles?.class_id !== filters.classId) return false;
      if (filters.studentId !== 'all' && attempt.student_id !== filters.studentId) return false;
      if (scope === 'admin' && filters.teacherId !== 'all' && attempt.exams?.created_by !== filters.teacherId) return false;
      if (filters.from && new Date(started) < new Date(filters.from)) return false;
      if (filters.to && new Date(started) > new Date(`${filters.to}T23:59:59`)) return false;
      return true;
    });
  }, [attempts, filters.classId, filters.from, filters.studentId, filters.teacherId, filters.to, scope]);

  const examOptions = useMemo(() => {
    const map = new Map();
    attemptWindow.forEach(attempt => {
      if (attempt.exams?.id) map.set(attempt.exams.id, attempt.exams);
    });
    return [...map.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }, [attemptWindow]);

  const visibleAttempts = useMemo(() => {
    return attemptWindow.filter(attempt => {
      if (filters.examId !== 'all' && attempt.exam_id !== filters.examId) return false;
      if (filters.attemptNumber !== 'all' && Number(attempt.attempt_number || 1) !== Number(filters.attemptNumber)) return false;
      return true;
    });
  }, [attemptWindow, filters.attemptNumber, filters.examId]);

  const visibleAttemptIds = useMemo(() => new Set(visibleAttempts.map(attempt => attempt.id)), [visibleAttempts]);

  const detailPool = useMemo(() => {
    return details.filter(row => visibleAttemptIds.has(row.attempt_id));
  }, [details, visibleAttemptIds]);

  const chapterOptions = useMemo(() => {
    const map = new Map();
    detailPool.forEach(row => {
      const chapter = row.questions?.chapters;
      if (chapter?.id) map.set(chapter.id, chapter);
    });
    return [...map.values()].sort((a, b) => String(a.chapter_name).localeCompare(String(b.chapter_name)));
  }, [detailPool]);

  const visibleDetails = useMemo(() => {
    return detailPool.filter(row => {
      if (filters.chapterId !== 'all' && row.questions?.chapters?.id !== filters.chapterId) return false;
      if (filters.difficulty !== 'all' && row.questions?.difficulty !== filters.difficulty) return false;
      return true;
    });
  }, [detailPool, filters.chapterId, filters.difficulty]);

  useEffect(() => {
    if (filters.studentId !== 'all' && !studentOptions.some(student => student.id === filters.studentId)) {
      setFilters(prev => ({ ...prev, studentId: 'all', examId: 'all', chapterId: 'all' }));
    }
  }, [filters.studentId, studentOptions]);

  useEffect(() => {
    if (filters.examId !== 'all' && !examOptions.some(exam => exam.id === filters.examId)) {
      setFilters(prev => ({ ...prev, examId: 'all', chapterId: 'all' }));
    }
  }, [examOptions, filters.examId]);

  useEffect(() => {
    if (filters.chapterId !== 'all' && !chapterOptions.some(chapter => chapter.id === filters.chapterId)) {
      setFilters(prev => ({ ...prev, chapterId: 'all' }));
    }
  }, [chapterOptions, filters.chapterId]);

  const overall = useMemo(() => {
    const scores = visibleAttempts.map(row => Number(row.total_score || 0));
    const accuracies = visibleAttempts.map(row => Number(row.accuracy || row.percentage || 0));
    return {
      attempts: visibleAttempts.length,
      studentsAttempted: new Set(visibleAttempts.map(row => row.student_id)).size,
      averageScore: avg(scores),
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
      passPercentage: avg(visibleAttempts.map(row => Number(row.total_score || 0) >= Number(row.exams?.passing_marks || 0) ? 100 : 0)),
      averageTime: avg(visibleAttempts.map(row => Number(row.time_taken_seconds || 0))),
      averageAccuracy: avg(accuracies),
      reattempts: visibleAttempts.filter(row => Number(row.attempt_number || 1) > 1).length,
      examsConducted: new Set(visibleAttempts.map(row => row.exam_id)).size
    };
  }, [visibleAttempts]);

  const studentReports = useMemo(() => {
    const groups = visibleAttempts.reduce((map, attempt) => {
      if (!map[attempt.student_id]) map[attempt.student_id] = [];
      map[attempt.student_id].push(attempt);
      return map;
    }, {});

    return Object.entries(groups).map(([studentId, rows]) => {
      const ordered = [...rows].sort((a, b) => Number(a.attempt_number || 1) - Number(b.attempt_number || 1));
      const latest = ordered[ordered.length - 1];
      const first = ordered[0];
      const scores = ordered.map(row => Number(row.total_score || 0));
      const detailsForStudent = visibleDetails.filter(detail => rows.some(attempt => attempt.id === detail.attempt_id));
      const chapterMap = detailsForStudent.reduce((map, detail) => {
        const chapter = detail.questions?.chapters?.chapter_name || 'Unknown';
        if (!map[chapter]) map[chapter] = { total: 0, correct: 0 };
        map[chapter].total += 1;
        if (detail.is_correct) map[chapter].correct += 1;
        return map;
      }, {});
      const chapterScores = Object.entries(chapterMap).map(([chapter, item]) => ({
        chapter,
        accuracy: item.total ? (item.correct / item.total) * 100 : 0
      }));
      const strong = chapterScores.filter(item => item.accuracy >= 75).map(item => item.chapter).slice(0, 3);
      const weak = chapterScores.filter(item => item.accuracy < 50).map(item => item.chapter).slice(0, 3);
      const trend = trendLabel(Number(first.accuracy || first.percentage || 0), Number(latest.accuracy || latest.percentage || 0));
      const accuracy = avg(ordered.map(row => Number(row.accuracy || row.percentage || 0)));
      const summary = `${latest.profiles?.full_name || 'Student'} is at ${pct(accuracy)} overall accuracy. Strong chapters: ${strong.join(', ') || 'not enough data yet'}. Weak chapters: ${weak.join(', ') || 'none detected'}. ${trend.text}. Average time: ${minutes(avg(ordered.map(row => Number(row.time_taken_seconds || 0))))}.`;

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
        accuracy,
        time: avg(ordered.map(row => Number(row.time_taken_seconds || 0))),
        status: Number(latest.total_score || 0) >= Number(latest.exams?.passing_marks || 0) ? 'Pass' : 'Needs Work',
        recommendation: weak.length ? `Revisit ${weak.join(', ')} and try another practice round.` : 'Keep revising consistently to preserve your momentum.',
        summary
      };
    }).sort((a, b) => b.average - a.average);
  }, [teacherByStudent, visibleAttempts, visibleDetails]);

  const examReports = useMemo(() => {
    const groups = visibleAttempts.reduce((map, attempt) => {
      if (!map[attempt.exam_id]) map[attempt.exam_id] = [];
      map[attempt.exam_id].push(attempt);
      return map;
    }, {});

    return Object.entries(groups).map(([examId, rows]) => {
      const scores = rows.map(row => Number(row.total_score || 0));
      const best = rows.reduce((top, row) => Number(row.total_score || 0) > Number(top?.total_score || -1) ? row : top, null);
      const weakest = rows.reduce((low, row) => Number(row.total_score || 0) < Number(low?.total_score ?? Infinity) ? row : low, null);
      const teacherStudentIds = rows[0].exams?.created_by
        ? teacherLinks.filter(link => link.teacher_id === rows[0].exams.created_by && link.status === 'active').map(link => link.student_id)
        : [];

      return {
        examId,
        exam: rows[0].exams,
        totalAssigned: rows[0].exams?.created_by
          ? (scope === 'teacher' ? students.length : (teacherStudentIds.length ? teacherStudentIds.length : students.length))
          : students.length,
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
    }).sort((a, b) => b.averageScore - a.averageScore);
  }, [scope, students, teacherLinks, visibleAttempts]);

  const questionReports = useMemo(() => {
    const groups = visibleDetails.reduce((map, row) => {
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

      return {
        questionId,
        question: rows[0].questions,
        attempted: correct + wrong,
        correct,
        wrong,
        skipped,
        accuracy,
        commonWrong,
        actualLevel: levelFor(accuracy)
      };
    }).sort((a, b) => a.accuracy - b.accuracy);
  }, [visibleDetails]);

  const chapterReports = useMemo(() => {
    const groups = visibleDetails.reduce((map, row) => {
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
        recommendation: weakness === 'Weak'
          ? `Revise basic concepts of ${chapter}.`
          : weakness === 'Average'
            ? `Practice more questions from ${chapter}.`
            : `Keep revising ${chapter} to maintain strength.`
      };
    }).sort((a, b) => a.accuracy - b.accuracy);
  }, [visibleDetails]);

  const difficultyReports = useMemo(() => {
    return ['easy', 'medium', 'hard'].map(difficulty => {
      const rows = visibleDetails.filter(row => row.questions?.difficulty === difficulty);
      const correct = rows.filter(row => row.is_correct).length;
      const wrong = rows.filter(row => row.selected_option && !row.is_correct).length;
      return { difficulty, total: rows.length, correct, wrong, accuracy: rows.length ? (correct / rows.length) * 100 : 0 };
    });
  }, [visibleDetails]);

  const selectedStudentReport = filters.studentId !== 'all'
    ? studentReports.find(report => report.studentId === filters.studentId) || null
    : null;

  const topStudent = studentReports.reduce((top, row) => row.best > Number(top?.best || -1) ? row : top, null);
  const weakStudent = studentReports.reduce((low, row) => row.best < Number(low?.best ?? Infinity) ? row : low, null);

  const openCategory = key => {
    setActiveCategory(key);
    window.setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const exportCurrentView = () => {
    if (activeCategory === 'exam') {
      downloadCsv('exam-analytics.csv', [
        ['Exam', 'Assigned Students', 'Attempted Students', 'Not Attempted', 'Total Attempts', 'Average Score', 'Highest', 'Lowest', 'Pass %', 'Average Time', 'Best Student', 'Weakest Student'],
        ...examReports.map(row => [
          row.exam.title,
          row.totalAssigned,
          row.attempted,
          Math.max(0, row.totalAssigned - row.attempted),
          row.totalAttempts,
          row.averageScore.toFixed(1),
          row.highestScore,
          row.lowestScore,
          pct(row.passPercentage),
          minutes(row.averageTime),
          row.bestStudent,
          row.weakStudent
        ])
      ]);
    }
    if (activeCategory === 'student') {
      downloadCsv('student-analytics.csv', [
        ['Student', 'Class', 'Assigned Teacher', 'Attempts', 'Best Score', 'Latest Score', 'Average', 'Improvement', 'Weak Chapters', 'Status'],
        ...studentReports.map(row => [
          row.student?.full_name,
          row.student?.class_name || '-',
          row.teacherName,
          row.count,
          row.best,
          row.latestScore,
          row.average.toFixed(1),
          row.trend.text,
          row.weak.join('; ') || '-',
          row.status
        ])
      ]);
    }
    if (activeCategory === 'chapter') {
      downloadCsv('chapter-analytics.csv', [
        ['Chapter', 'Accuracy', 'Correct', 'Wrong', 'Skipped', 'Level', 'Recommendation'],
        ...chapterReports.map(row => [row.chapter, pct(row.accuracy), row.correct, row.wrong, row.skipped, row.weakness, row.recommendation])
      ]);
    }
    if (activeCategory === 'question') {
      downloadCsv('question-analytics.csv', [
        ['Question', 'Chapter', 'Difficulty', 'Attempted', 'Correct', 'Wrong', 'Skipped', 'Accuracy', 'Common Wrong'],
        ...questionReports.map(row => [
          row.question?.question_text,
          row.question?.chapters?.chapter_name || '-',
          row.question?.difficulty,
          row.attempted,
          row.correct,
          row.wrong,
          row.skipped,
          pct(row.accuracy),
          row.commonWrong
        ])
      ]);
    }
  };

  if (loading) return <LoadingScreen label="Loading reports and analytics..." />;

  const activeCategoryMeta = reportCategories.find(item => item.key === activeCategory) || reportCategories[0];
  const activeCategoryCount = {
    exam: examReports.length,
    student: studentReports.length,
    chapter: chapterReports.length,
    question: questionReports.length
  }[activeCategory] || 0;

  const summaryTiles = [
    { key: 'exam', label: 'Total attempts', value: overall.attempts, icon: ClipboardList },
    { key: 'student', label: 'Average score', value: overall.averageScore.toFixed(1), icon: BarChart3 },
    { key: 'question', label: 'Average accuracy', value: pct(overall.averageAccuracy), icon: Target },
    { key: 'student', label: 'Pass rate', value: pct(overall.passPercentage), icon: Sparkles },
    { key: 'student', label: 'Active students', value: students.length, icon: Users },
    { key: 'exam', label: 'Exams conducted', value: overall.examsConducted, icon: BookOpen }
  ];

  return (
    <>
      <HeroHeader
        badge={scope === 'teacher' ? 'Teacher analytics' : 'Reports & analytics'}
        singleLine
        className="compact"
        stats={<div className="hero-stat"><BarChart3 size={28} /><strong>{overall.attempts}</strong><span>Submitted attempts</span></div>}
      />

      {error && <div className="notice">Could not load full report data: {error}</div>}

      <div className="report-dashboard">
        <section className="report-summary-tiles">
          {summaryTiles.map(tile => {
            const Icon = tile.icon;
            return (
              <button
                key={`${tile.key}-${tile.label}`}
                type="button"
                className={`report-summary-tile clickable-card ${activeCategory === tile.key ? 'active' : ''}`}
                onClick={() => openCategory(tile.key)}
              >
                <span className="report-summary-tile__icon"><Icon size={20} /></span>
                <strong>{tile.value}</strong>
                <small>{tile.label}</small>
              </button>
            );
          })}
        </section>

        <section className="report-category-grid">
          {reportCategories.map(card => {
            const Icon = card.icon;
            const count = {
              exam: examReports.length,
              student: studentReports.length,
              chapter: chapterReports.length,
              question: questionReports.length
            }[card.key] || 0;

            return (
              <button
                type="button"
                key={card.key}
                className={`report-category-card clickable-card ${activeCategory === card.key ? 'active' : ''}`}
                onClick={() => openCategory(card.key)}
              >
                <div className="report-category-card__top">
                  <span className="report-category-card__icon"><Icon size={22} /></span>
                  <span className="status-pill">{count}</span>
                </div>
                <div>
                  <b>{card.label}</b>
                </div>
              </button>
            );
          })}
        </section>

        <CollapsibleSection
          title="Advanced Filters"
          open={filtersOpen}
          onToggle={() => setFiltersOpen(value => !value)}
          action={<span className="status-pill">{filtersOpen ? 'Hide' : 'Show'}</span>}
        >
          <div className="report-filter-grid">
            <label className="field">
              Class
              <select value={filters.classId} onChange={e => updateFilter('classId', e.target.value)}>
                <option value="all">All classes</option>
                {classes.map(item => (
                  <option value={item.id} key={item.id}>
                    {item.class_name} {item.section_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Student
              <select
                value={filters.studentId}
                onChange={e => updateFilter('studentId', e.target.value)}
                disabled={!studentOptions.length}
              >
                {studentOptions.length ? <option value="all">All students</option> : null}
                {studentOptions.map(student => (
                  <option value={student.id} key={student.id}>
                    {student.full_name}
                  </option>
                ))}
                {!studentOptions.length && <option value="">No students available</option>}
              </select>
            </label>

            <label className="field">
              Exam
              <select
                value={filters.examId}
                onChange={e => updateFilter('examId', e.target.value)}
                disabled={!examOptions.length}
              >
                {examOptions.length ? <option value="all">All exams</option> : null}
                {examOptions.map(exam => (
                  <option value={exam.id} key={exam.id}>
                    {exam.title}
                  </option>
                ))}
                {!examOptions.length && <option value="">No exams available</option>}
              </select>
            </label>

            {scope === 'admin' && (
              <label className="field">
                Teacher
                <select value={filters.teacherId} onChange={e => updateFilter('teacherId', e.target.value)}>
                  <option value="all">All teachers</option>
                  {teachers.map(teacher => (
                    <option value={teacher.id} key={teacher.id}>
                      {teacher.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field">
              Attempt
              <select value={filters.attemptNumber} onChange={e => updateFilter('attemptNumber', e.target.value)}>
                <option value="all">All attempts</option>
                <option value="1">Attempt 1</option>
                <option value="2">Attempt 2</option>
                <option value="3">Attempt 3</option>
              </select>
            </label>

            <label className="field">
              Chapter
              <select
                value={filters.chapterId}
                onChange={e => updateFilter('chapterId', e.target.value)}
                disabled={!chapterOptions.length}
              >
                {chapterOptions.length ? <option value="all">All chapters</option> : null}
                {chapterOptions.map(chapter => (
                  <option value={chapter.id} key={chapter.id}>
                    {chapter.chapter_name}
                  </option>
                ))}
                {!chapterOptions.length && <option value="">No chapters available</option>}
              </select>
            </label>

            <label className="field">
              Difficulty
              <select value={filters.difficulty} onChange={e => updateFilter('difficulty', e.target.value)}>
                <option value="all">All difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className="field">
              From
              <input type="date" value={filters.from} onChange={e => updateFilter('from', e.target.value)} />
            </label>

            <label className="field">
              To
              <input type="date" value={filters.to} onChange={e => updateFilter('to', e.target.value)} />
            </label>
          </div>

          <div className="report-filter-actions">
            <button className="btn secondary" type="button" onClick={() => setFilters(defaultFilters)}>
              <Filter size={18} /> Reset filters
            </button>
          </div>
        </CollapsibleSection>

        <section className="report-section" ref={detailSectionRef}>
          <div className="section-title report-section-title">
            <div>
              <h2>{activeCategoryMeta.label}</h2>
            </div>
            <div className="hero-header__actions">
              {activeCategory === 'student' && selectedStudentReport && (
                <button className="btn secondary" type="button" onClick={() => setReviewReport(selectedStudentReport)}>
                  <Eye size={18} /> View Student Review
                </button>
              )}
              <button className="btn secondary" type="button" onClick={exportCurrentView}>
                <Download size={18} /> Export
              </button>
            </div>
          </div>

          <div className="report-section-meta">
            <span className="status-pill live">{activeCategoryCount} items</span>
            <span className="muted">Updated from submitted attempts only.</span>
          </div>

          {activeCategory === 'exam' && (
            <div className="report-stack">
              {examReports.length ? (
                <>
                  <div className="report-analytics-grid">
                    {examReports.map(row => (
                      <article className="report-analytics-card" key={row.examId}>
                        <div className="report-analytics-card__top">
                          <div>
                            <span className="eyebrow">Exam</span>
                            <h3>{row.exam.title}</h3>
                          </div>
                          <span className="report-analytics-card__icon"><ClipboardList size={20} /></span>
                        </div>
                        <div className="report-chip-list">
                          <span className="chip"><b>{row.totalAssigned}</b><small>Assigned</small></span>
                          <span className="chip"><b>{row.attempted}</b><small>Attempted</small></span>
                          <span className="chip"><b>{row.totalAttempts}</b><small>Attempts</small></span>
                          <span className="chip"><b>{row.reattempts}</b><small>Reattempts</small></span>
                        </div>
                        <div className="report-analytics-card__stats">
                          <span><b>{row.averageScore.toFixed(1)}</b><small>Average score</small></span>
                          <span><b>{row.highestScore}</b><small>Highest</small></span>
                          <span><b>{row.lowestScore}</b><small>Lowest</small></span>
                          <span><b>{pct(row.passPercentage)}</b><small>Pass rate</small></span>
                        </div>
                        <div className="report-analytics-card__footer">
                          <span className={`status-pill ${row.bestStudent !== '-' ? 'done' : ''}`}>Best: {row.bestStudent}</span>
                          <span className="muted">Weakest: {row.weakStudent}</span>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="report-subsection">
                    <div className="section-title compact">
                      <div><h3>Recent Attempts</h3></div>
                    </div>
                    <div className="report-attempt-grid">
                      {visibleAttempts.slice(0, 8).map(attempt => (
                        <article className="report-attempt-card" key={attempt.id}>
                          <div className="report-analytics-card__top">
                            <div>
                              <span className="eyebrow">{attempt.profiles?.full_name || 'Student'}</span>
                              <h3>{attempt.exams?.title}</h3>
                            </div>
                            <span className="report-analytics-card__icon"><TrendingUp size={20} /></span>
                          </div>
                          <div className="report-chip-list">
                            <span className="chip"><b>#{attempt.attempt_number || 1}</b><small>Attempt</small></span>
                            <span className="chip"><b>{attempt.total_score}</b><small>Score</small></span>
                            <span className="chip"><b>{pct(attempt.accuracy || attempt.percentage)}</b><small>Accuracy</small></span>
                            <span className="chip"><b>{minutes(attempt.time_taken_seconds)}</b><small>Time</small></span>
                          </div>
                          <div className="report-analytics-card__footer">
                            <span className={`level ${(Number(attempt.accuracy || attempt.percentage || 0) >= 75 ? 'good' : Number(attempt.accuracy || attempt.percentage || 0) >= 50 ? 'average' : 'weak')}`}>
                              {Number(attempt.total_score || 0) >= Number(attempt.exams?.passing_marks || 0) ? 'Pass' : 'Needs work'}
                            </span>
                            <span className="muted">{attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="report-empty-soft">
                  <FileQuestion size={26} />
                  <b>No exam analytics match these filters.</b>
                  <p className="muted">Try widening the class, student, or date filters.</p>
                </div>
              )}
            </div>
          )}

          {activeCategory === 'student' && (
            <div className="report-stack">
              {selectedStudentReport ? (
                <div className="report-focused-panel">
                  <div className="report-focused-panel__head">
                    <div>
                      <span className="eyebrow">Student focus</span>
                      <h3>{selectedStudentReport.student?.full_name}</h3>
                    </div>
                    <button className="btn secondary" type="button" onClick={() => setReviewReport(selectedStudentReport)}>
                      <Eye size={18} /> View Student Review
                    </button>
                  </div>
                  <div className="report-focused-panel__summary">
                    <span><b>{selectedStudentReport.count}</b><small>Attempts</small></span>
                    <span><b>{selectedStudentReport.best}</b><small>Best score</small></span>
                    <span><b>{selectedStudentReport.latestScore}</b><small>Latest score</small></span>
                    <span><b>{pct(selectedStudentReport.accuracy)}</b><small>Accuracy</small></span>
                  </div>
                  <p>{selectedStudentReport.summary}</p>
                </div>
              ) : (
                <div className="report-empty-soft">
                  <Users size={26} />
                  <b>Select a student to unlock the improvement summary.</b>
                  <p className="muted">The detailed review stays hidden until one student is chosen.</p>
                </div>
              )}

              {studentReports.length ? (
                <div className="report-analytics-grid">
                  {studentReports.map(row => (
                    <article className={`report-analytics-card ${row.studentId === filters.studentId ? 'active' : ''}`} key={row.studentId}>
                      <div className="report-analytics-card__top">
                        <div>
                          <span className="eyebrow">{row.student?.class_name || 'Student'}</span>
                          <h3>{row.student?.full_name}</h3>
                        </div>
                        <span className="report-analytics-card__icon"><Users size={20} /></span>
                      </div>
                      <div className="report-chip-list">
                        <span className="chip"><b>{row.count}</b><small>Attempts</small></span>
                        <span className="chip"><b>{row.best}</b><small>Best</small></span>
                        <span className="chip"><b>{row.latestScore}</b><small>Latest</small></span>
                        <span className="chip"><b>{pct(row.accuracy)}</b><small>Accuracy</small></span>
                      </div>
                      <div className="report-analytics-card__stats">
                        <span><b className={`level ${row.trend.type}`}>{row.trend.type === 'good' ? <TrendingUp size={15} /> : row.trend.type === 'weak' ? <TrendingDown size={15} /> : null}{row.trend.text}</b><small>Trend</small></span>
                        <span><b>{row.teacherName}</b><small>Assigned teacher</small></span>
                      </div>
                      <div className="report-analytics-card__footer">
                        <span className={`status-pill ${row.status === 'Pass' ? 'done' : ''}`}>{row.status}</span>
                        <button className="btn secondary" type="button" onClick={() => setReviewReport(row)}>
                          <Eye size={16} /> View Student Review
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="report-empty-soft">
                  <Users size={26} />
                  <b>No student analytics match these filters.</b>
                  <p className="muted">Try clearing the class or student filter.</p>
                </div>
              )}
            </div>
          )}

          {activeCategory === 'chapter' && (
            <div className="report-stack">
              {chapterReports.length ? (
                <div className="report-analytics-grid">
                  {chapterReports.map(row => (
                    <article className="report-analytics-card" key={row.chapter}>
                      <div className="report-analytics-card__top">
                        <div>
                          <span className="eyebrow">Chapter</span>
                          <h3>{row.chapter}</h3>
                        </div>
                        <span className="report-analytics-card__icon"><BookOpen size={20} /></span>
                      </div>
                      <div className="report-chip-list">
                        <span className="chip"><b>{pct(row.accuracy)}</b><small>Accuracy</small></span>
                        <span className="chip"><b>{row.correct}</b><small>Correct</small></span>
                        <span className="chip"><b>{row.wrong}</b><small>Wrong</small></span>
                        <span className="chip"><b>{row.skipped}</b><small>Skipped</small></span>
                      </div>
                      <div className="report-analytics-card__footer">
                        <span className={`level ${row.weakness.toLowerCase()}`}>{row.weakness}</span>
                        <span className="muted">{row.recommendation}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="report-empty-soft">
                  <BookOpen size={26} />
                  <b>No chapter analytics match these filters.</b>
                  <p className="muted">Try another exam or student selection.</p>
                </div>
              )}
            </div>
          )}

          {activeCategory === 'question' && (
            <div className="report-stack">
              {difficultyReports.length ? (
                <div className="report-difficulty-grid">
                  {difficultyReports.map(row => (
                    <article className="report-difficulty-card" key={row.difficulty}>
                      <span className="eyebrow capitalize">{row.difficulty}</span>
                      <b>{pct(row.accuracy)}</b>
                      <small>{row.correct} correct / {row.wrong} wrong</small>
                    </article>
                  ))}
                </div>
              ) : null}

              {questionReports.length ? (
                <div className="report-analytics-grid">
                  {questionReports.map(row => (
                    <article className="report-analytics-card" key={row.questionId}>
                      <div className="report-analytics-card__top">
                        <div>
                          <span className="eyebrow">{row.question?.chapters?.chapter_name || 'Question'}</span>
                          <h3>{row.question?.question_text}</h3>
                        </div>
                        <span className="report-analytics-card__icon"><FileQuestion size={20} /></span>
                      </div>
                      <div className="report-chip-list">
                        <span className="chip"><b>{row.attempted}</b><small>Attempted</small></span>
                        <span className="chip"><b>{row.correct}</b><small>Correct</small></span>
                        <span className="chip"><b>{row.wrong}</b><small>Wrong</small></span>
                        <span className="chip"><b>{row.skipped}</b><small>Skipped</small></span>
                      </div>
                      <div className="report-analytics-card__stats">
                        <span><b className={`level ${row.actualLevel.toLowerCase()}`}>{pct(row.accuracy)}</b><small>Accuracy</small></span>
                        <span><b>{row.question?.difficulty || '-'}</b><small>Difficulty</small></span>
                        <span><b>{row.commonWrong}</b><small>Common wrong</small></span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="report-empty-soft">
                  <FileQuestion size={26} />
                  <b>No question analytics match these filters.</b>
                  <p className="muted">Try another chapter, difficulty, or exam.</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {reviewReport && <StudentReviewModal report={reviewReport} onClose={() => setReviewReport(null)} />}
    </>
  );
}
