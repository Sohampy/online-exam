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
  Users,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import LoadingScreen from './LoadingScreen.jsx';
import HeroHeader from './HeroHeader.jsx';
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

function getAttemptStatus(attempt) {
  if (!attempt) return 'N/A';
  if (attempt.exams) {
    const pm = Number(attempt.exams.passing_marks);
    const tm = Number(attempt.exams.total_marks || 0);
    const threshold = pm > 0 ? pm : (tm > 0 ? Math.ceil(tm * 0.4) : null);
    if (threshold !== null) {
      return Number(attempt.total_score || 0) >= threshold ? 'Pass' : 'Needs Work';
    }
  }
  const accuracy = Number(attempt.accuracy || attempt.percentage || 0);
  return accuracy >= 40 ? 'Pass' : 'Needs Work';
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
  const [activeCategory, setActiveCategory] = useState('exam');
  const [reviewReport, setReviewReport] = useState(null);
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Redesign state hooks
  const [allChapters, setAllChapters] = useState([]);
  const [loadedView, setLoadedView] = useState('none');
  const [selectedStudentId, setSelectedStudentId] = useState('all');
  const [selectedChapterId, setSelectedChapterId] = useState('all');
  
  // Modal states
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  
  // Modal local selection states
  const [modalClassId, setModalClassId] = useState('all');
  const [modalStudentId, setModalStudentId] = useState('all');
  const [modalSubject, setModalSubject] = useState('all');
  const [modalChapterId, setModalChapterId] = useState('all');
  const [modalReportType, setModalReportType] = useState('exam-class');

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      setError('');

      const [{ data: classRows }, { data: profileRows }, { data: assignments }, { data: chapterRows }] = await Promise.all([
        supabase.from('classes').select('*').order('class_name'),
        supabase.from('profiles').select('id,full_name,email,role,class_id,class_name,is_active'),
        supabase.from('teacher_students').select('*').eq('status', 'active'),
        supabase.from('chapters').select('*').order('chapter_name')
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
          setAllChapters(chapterRows || []);
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
        ? (attemptRows || []).filter(row => row.attempt_type === 'practice' || row.exams?.created_by === user.id)
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
      setAllChapters(chapterRows || []);
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

  const teacherIdByStudent = useMemo(() => {
    return teacherLinks.reduce((map, link) => {
      if (link.status === 'active' && !map[link.student_id]) map[link.student_id] = link.teacher_id;
      return map;
    }, {});
  }, [teacherLinks]);

  const officialAttempts = useMemo(() => attempts.filter(attempt => (attempt.attempt_type || 'exam') !== 'practice'), [attempts]);
  const practiceAttempts = useMemo(() => attempts.filter(attempt => attempt.attempt_type === 'practice'), [attempts]);

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

  const officialAttemptWindow = useMemo(() => {
    return officialAttempts.filter(attempt => {
      const started = attempt.submitted_at || attempt.started_at;
      if (filters.classId !== 'all' && attempt.profiles?.class_id !== filters.classId) return false;
      if (filters.studentId !== 'all' && attempt.student_id !== filters.studentId) return false;
      if (scope === 'admin' && filters.teacherId !== 'all' && attempt.exams?.created_by !== filters.teacherId) return false;
      if (filters.from && new Date(started) < new Date(filters.from)) return false;
      if (filters.to && new Date(started) > new Date(`${filters.to}T23:59:59`)) return false;
      return true;
    });
  }, [filters.classId, filters.from, filters.studentId, filters.teacherId, filters.to, officialAttempts, scope]);

  const practiceAttemptWindow = useMemo(() => {
    return practiceAttempts.filter(attempt => {
      const started = attempt.submitted_at || attempt.started_at;
      if (filters.classId !== 'all' && attempt.profiles?.class_id !== filters.classId) return false;
      if (filters.studentId !== 'all' && attempt.student_id !== filters.studentId) return false;
      if (filters.teacherId !== 'all' && teacherIdByStudent[attempt.student_id] !== filters.teacherId) return false;
      if (filters.from && new Date(started) < new Date(filters.from)) return false;
      if (filters.to && new Date(started) > new Date(`${filters.to}T23:59:59`)) return false;
      return true;
    });
  }, [filters.classId, filters.from, filters.studentId, filters.teacherId, filters.to, practiceAttempts, teacherIdByStudent]);

  const examOptions = useMemo(() => {
    const map = new Map();
    officialAttemptWindow.forEach(attempt => {
      if (attempt.exams?.id) map.set(attempt.exams.id, attempt.exams);
    });
    return [...map.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }, [officialAttemptWindow]);

  const visibleAttempts = useMemo(() => {
    return officialAttemptWindow.filter(attempt => {
      if (filters.examId !== 'all' && attempt.exam_id !== filters.examId) return false;
      if (filters.attemptNumber !== 'all' && Number(attempt.attempt_number || 1) !== Number(filters.attemptNumber)) return false;
      return true;
    });
  }, [filters.attemptNumber, filters.examId, officialAttemptWindow]);

  const visibleAttemptIds = useMemo(() => new Set(visibleAttempts.map(attempt => attempt.id)), [visibleAttempts]);

  const detailPool = useMemo(() => {
    return details.filter(row => visibleAttemptIds.has(row.attempt_id));
  }, [details, visibleAttemptIds]);

  const practiceVisibleAttempts = useMemo(() => {
    return practiceAttemptWindow;
  }, [practiceAttemptWindow]);

  const practiceVisibleAttemptIds = useMemo(() => new Set(practiceVisibleAttempts.map(attempt => attempt.id)), [practiceVisibleAttempts]);

  const practiceDetailPool = useMemo(() => {
    return details.filter(row => practiceVisibleAttemptIds.has(row.attempt_id));
  }, [details, practiceVisibleAttemptIds]);

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
        status: getAttemptStatus(latest),
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

  const practiceOverall = useMemo(() => {
    const scores = practiceVisibleAttempts.map(row => Number(row.total_score || 0));
    const accuracies = practiceVisibleAttempts.map(row => Number(row.accuracy || row.percentage || 0));
    return {
      attempts: practiceVisibleAttempts.length,
      studentsAttempted: new Set(practiceVisibleAttempts.map(row => row.student_id)).size,
      averageScore: avg(scores),
      averageAccuracy: avg(accuracies),
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
      averageTime: avg(practiceVisibleAttempts.map(row => Number(row.time_taken_seconds || 0)))
    };
  }, [practiceVisibleAttempts]);

  const practiceStudentReports = useMemo(() => {
    const groups = practiceVisibleAttempts.reduce((map, attempt) => {
      if (!map[attempt.student_id]) map[attempt.student_id] = [];
      map[attempt.student_id].push(attempt);
      return map;
    }, {});

    return Object.entries(groups).map(([studentId, rows]) => {
      const ordered = [...rows].sort((a, b) => Number(a.attempt_number || 1) - Number(b.attempt_number || 1));
      const latest = ordered[ordered.length - 1];
      const scores = ordered.map(row => Number(row.total_score || 0));
      const accuracies = ordered.map(row => Number(row.accuracy || row.percentage || 0));
      return {
        studentId,
        student: latest.profiles,
        count: ordered.length,
        averageScore: avg(scores),
        averageAccuracy: avg(accuracies),
        bestScore: scores.length ? Math.max(...scores) : 0,
        latestScore: Number(latest.total_score || 0)
      };
    }).sort((a, b) => b.averageScore - a.averageScore);
  }, [practiceVisibleAttempts]);

  const practiceChapterReports = useMemo(() => {
    const groups = practiceDetailPool.reduce((map, row) => {
      const chapter = row.questions?.chapters?.chapter_name || 'Unknown';
      if (!map[chapter]) map[chapter] = [];
      map[chapter].push(row);
      return map;
    }, {});

    return Object.entries(groups).map(([chapter, rows]) => {
      const correct = rows.filter(row => row.is_correct).length;
      const wrong = rows.filter(row => row.selected_option && !row.is_correct).length;
      const accuracy = rows.length ? (correct / rows.length) * 100 : 0;
      return {
        chapter,
        total: rows.length,
        correct,
        wrong,
        accuracy,
        strength: levelFor(accuracy)
      };
    }).sort((a, b) => b.total - a.total);
  }, [practiceDetailPool]);

  const practiceQuestionReports = useMemo(() => {
    const groups = practiceDetailPool.reduce((map, row) => {
      const id = row.question_id;
      if (!map[id]) map[id] = [];
      map[id].push(row);
      return map;
    }, {});

    return Object.entries(groups).map(([questionId, rows]) => {
      const correct = rows.filter(row => row.is_correct).length;
      const wrong = rows.filter(row => row.selected_option && !row.is_correct).length;
      const accuracy = rows.length ? (correct / rows.length) * 100 : 0;
      return {
        questionId,
        question: rows[0].questions,
        attempted: rows.length,
        correct,
        wrong,
        accuracy,
        level: levelFor(accuracy)
      };
    }).sort((a, b) => b.attempted - a.attempted);
  }, [practiceDetailPool]);

  const practiceTopStudents = useMemo(() => practiceStudentReports.slice(0, 3), [practiceStudentReports]);
  const practiceWeakChapters = useMemo(() => practiceChapterReports.filter(row => row.strength === 'Weak').slice(0, 3), [practiceChapterReports]);
  const practiceMostPracticed = useMemo(() => practiceChapterReports.slice(0, 3), [practiceChapterReports]);

  const selectedStudentReport = useMemo(() => {
    return selectedStudentId !== 'all'
      ? studentReports.find(report => report.studentId === selectedStudentId) || null
      : null;
  }, [studentReports, selectedStudentId]);

  const topStudent = studentReports.reduce((top, row) => row.best > Number(top?.best || -1) ? row : top, null);
  const weakStudent = studentReports.reduce((low, row) => row.best < Number(low?.best ?? Infinity) ? row : low, null);

  const selectedChapter = useMemo(() => {
    return allChapters.find(c => c.id === selectedChapterId) || null;
  }, [allChapters, selectedChapterId]);

  const subjects = useMemo(() => {
    return [...new Set(allChapters.map(c => c.subject).filter(Boolean))].sort();
  }, [allChapters]);

  const chapterDetails = useMemo(() => {
    return detailPool.filter(row => row.questions?.chapters?.id === selectedChapterId);
  }, [detailPool, selectedChapterId]);

  const uniqueAttemptsCount = useMemo(() => {
    return new Set(chapterDetails.map(d => d.attempt_id)).size;
  }, [chapterDetails]);

  const chapterAccuracy = useMemo(() => {
    const correct = chapterDetails.filter(d => d.is_correct).length;
    return chapterDetails.length ? (correct / chapterDetails.length) * 100 : 0;
  }, [chapterDetails]);

  const averageScore = useMemo(() => {
    return avg(chapterDetails.map(d => d.marks_awarded));
  }, [chapterDetails]);

  const passPercentage = useMemo(() => {
    const attemptIds = [...new Set(chapterDetails.map(d => d.attempt_id))];
    let passAttempts = 0;
    attemptIds.forEach(attId => {
      const attDetails = chapterDetails.filter(d => d.attempt_id === attId);
      const correct = attDetails.filter(d => d.is_correct).length;
      const acc = (correct / attDetails.length) * 100;
      if (acc >= 50) passAttempts++;
    });
    return attemptIds.length ? (passAttempts / attemptIds.length) * 100 : 0;
  }, [chapterDetails]);

  const chapterStudentPerformance = useMemo(() => {
    // Group accuracy per student (using attempt_id → attempt → profiles)
    const attemptMap = {};
    visibleAttempts.forEach(att => { attemptMap[att.id] = att; });
    const studentMap = {};
    chapterDetails.forEach(d => {
      const att = attemptMap[d.attempt_id];
      if (!att) return;
      const sid = att.student_id;
      const name = att.profiles?.full_name || 'Unknown';
      if (!studentMap[sid]) studentMap[sid] = { name, correct: 0, total: 0 };
      studentMap[sid].total++;
      if (d.is_correct) studentMap[sid].correct++;
    });
    return Object.values(studentMap).map(s => ({
      name: s.name,
      accuracy: s.total ? (s.correct / s.total) * 100 : 0
    }));
  }, [chapterDetails, visibleAttempts]);

  const chapterTopStudent = useMemo(() => {
    if (!chapterStudentPerformance.length) return '-';
    return chapterStudentPerformance.reduce((best, s) => s.accuracy > best.accuracy ? s : best).name;
  }, [chapterStudentPerformance]);

  const chapterWeakestStudent = useMemo(() => {
    if (!chapterStudentPerformance.length) return '-';
    return chapterStudentPerformance.reduce((worst, s) => s.accuracy < worst.accuracy ? s : worst).name;
  }, [chapterStudentPerformance]);

  const chapterQuestionStats = useMemo(() => {
    const questionGroups = chapterDetails.reduce((map, d) => {
      const qId = d.questions?.id;
      if (!qId) return map;
      if (!map[qId]) map[qId] = { question: d.questions, total: 0, correct: 0 };
      map[qId].total++;
      if (d.is_correct) map[qId].correct++;
      return map;
    }, {});
    
    return Object.values(questionGroups).map(stat => ({
      ...stat,
      accuracy: (stat.correct / stat.total) * 100
    }));
  }, [chapterDetails]);

  const difficultQuestions = useMemo(() => {
    return chapterQuestionStats
      .filter(q => q.accuracy < 50)
      .sort((a, b) => a.accuracy - b.accuracy);
  }, [chapterQuestionStats]);

  const frequentlyIncorrect = useMemo(() => {
    return chapterQuestionStats
      .filter(q => q.total - q.correct > 0)
      .sort((a, b) => (b.total - b.correct) - (a.total - a.correct));
  }, [chapterQuestionStats]);

  const commonMistakes = useMemo(() => {
    const wrongAnswers = chapterDetails.filter(d => d.selected_option && !d.is_correct);
    const mistakeCounts = wrongAnswers.reduce((map, d) => {
      const key = `Question: "${d.questions?.question_text.slice(0, 50)}..." - Option ${d.selected_option}`;
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    return Object.entries(mistakeCounts)
      .map(([mistake, count]) => ({ mistake, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [chapterDetails]);

  const exportFocusedStudent = () => {
    if (!selectedStudentReport) return;
    downloadCsv(`${selectedStudentReport.student?.full_name}-focused-analytics.csv`, [
      ['Student Name', selectedStudentReport.student?.full_name],
      ['Email', selectedStudentReport.student?.email],
      ['Class', selectedStudentReport.student?.class_name || '-'],
      [],
      ['Metric', 'Value'],
      ['Total Attempts', selectedStudentReport.count],
      ['Best Score', selectedStudentReport.best],
      ['Latest Score', selectedStudentReport.latestScore],
      ['Average Score', selectedStudentReport.average.toFixed(1)],
      ['Average Accuracy', pct(selectedStudentReport.accuracy)],
      ['Average Time (seconds)', selectedStudentReport.time.toFixed(0)],
      ['Strong Chapters', selectedStudentReport.strong.join('; ')],
      ['Weak Chapters', selectedStudentReport.weak.join('; ')],
      ['Summary', selectedStudentReport.summary]
    ]);
  };

  const exportFocusedChapter = () => {
    if (!selectedChapter) return;
    downloadCsv(`${selectedChapter.chapter_name}-focused-analytics.csv`, [
      ['Chapter Name', selectedChapter.chapter_name],
      ['Subject', selectedChapter.subject],
      [],
      ['Metric', 'Value'],
      ['Total Question Attempts', chapterDetails.length],
      ['Exam Attempts', uniqueAttemptsCount],
      ['Average Marks Awarded', averageScore.toFixed(2)],
      ['Average Accuracy', pct(chapterAccuracy)],
      ['Pass Percentage', pct(passPercentage)],
      [],
      ['Difficult Question', 'Accuracy', 'Total Attempts'],
      ...difficultQuestions.map(q => [q.question.question_text, pct(q.accuracy), q.total]),
      [],
      ['Common Mistake', 'Count'],
      ...commonMistakes.map(m => [m.mistake, m.count])
    ]);
  };

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

  const exportPracticeView = () => {
    downloadCsv('practice-analytics.csv', [
      ['Practice summary', 'Value'],
      ['Total Practice Attempts', practiceOverall.attempts],
      ['Average Score', practiceOverall.averageScore.toFixed(1)],
      ['Average Accuracy', pct(practiceOverall.averageAccuracy)],
      ['Top Student', practiceTopStudents[0]?.student?.full_name || '-'],
      ['Weak Chapters', practiceWeakChapters.map(row => row.chapter).join('; ') || '-'],
      ['Most Practiced Chapters', practiceMostPracticed.map(row => row.chapter).join('; ') || '-']
    ]);
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
        actions={<button className="btn secondary" type="button" onClick={() => setFiltersModalOpen(true)}><Filter size={18} /> Advanced Filters</button>}
        className="compact"
      />

      {error && <div className="notice">Could not load full report data: {error}</div>}

      <div className="report-dashboard">
        {/* KPI Cards section (Part 2.1) */}
        <section className="report-summary-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          {summaryTiles.map(tile => {
            const Icon = tile.icon;
            return (
              <div
                key={`${tile.key}-${tile.label}`}
                className="report-summary-tile compact-kpi"
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', background: '#fff', minHeight: 'auto' }}
              >
                <span className="report-summary-tile__icon" style={{ display: 'inline-flex', padding: '6px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', width: '30px', height: '30px', placeItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={16} /></span>
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '1.15rem', color: '#1e293b', lineHeight: '1.2' }}>{tile.value}</strong>
                  <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px', fontWeight: 500 }}>{tile.label}</small>
                </div>
              </div>
            );
          })}
        </section>

        {/* Analytics Navigation Cards section (Part 2.2) */}
        <section className="report-category-grid three-cols" style={{ marginTop: '20px', marginBottom: '20px' }}>
          {/* Card 1: Exam Analytics */}
          <button
            type="button"
            className={`report-category-card clickable-card ${loadedView.startsWith('exam') ? 'active' : ''}`}
            onClick={() => setExamModalOpen(true)}
          >
            <div className="report-category-card__top">
              <span className="report-category-card__icon"><ClipboardList size={22} /></span>
            </div>
            <div>
              <b>Exam Analytics</b>
              <small>Configure and view class or practice test reports</small>
            </div>
          </button>

          {/* Card 2: Student Analytics */}
          <button
            type="button"
            className={`report-category-card clickable-card ${loadedView === 'student-focused' ? 'active' : ''}`}
            onClick={() => {
              setModalClassId('all');
              setModalStudentId('');
              setStudentModalOpen(true);
            }}
          >
            <div className="report-category-card__top">
              <span className="report-category-card__icon"><Users size={22} /></span>
            </div>
            <div>
              <b>Student Analytics</b>
              <small>View progress, chapter strengths, and recommendations</small>
            </div>
          </button>

          {/* Card 3: Chapter Analytics */}
          <button
            type="button"
            className={`report-category-card clickable-card ${loadedView === 'chapter-focused' ? 'active' : ''}`}
            onClick={() => {
              setModalSubject('all');
              setModalChapterId('');
              setChapterModalOpen(true);
            }}
          >
            <div className="report-category-card__top">
              <span className="report-category-card__icon"><BookOpen size={22} /></span>
            </div>
            <div>
              <b>Chapter Analytics</b>
              <small>Analyze subject performance, difficulty, and mistakes</small>
            </div>
          </button>
        </section>

        {/* Selected Analytics View (Part 6) */}
        {loadedView === 'none' && (
          <div className="report-empty-soft" style={{ margin: '40px 0', padding: '60px 20px', background: '#fff', border: '1px solid #dbe3ef', borderRadius: '18px', textAlign: 'center' }}>
            <BarChart3 size={36} className="muted" style={{ marginBottom: '12px' }} />
            <b>Select a navigation card above to configure and load report analytics.</b>
            <p className="muted">Choose Exam, Student, or Chapter analytics workflow.</p>
          </div>
        )}

        {loadedView === 'exam-class' && (
          <section className="report-section">
            <div className="section-title report-section-title">
              <div>
                <h2>Exam Analytics - Class Tests</h2>
              </div>
              <div className="hero-header__actions">
                <button className="btn secondary" type="button" onClick={() => downloadCsv('class-test-analytics.csv', [
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
                ])}>
                  <Download size={18} /> Export Class Tests
                </button>
              </div>
            </div>

            <div className="report-section-meta">
              <span className="status-pill live">{examReports.length} items</span>
              <span className="muted">Filtered from official submitted exam attempts.</span>
            </div>

            {examReports.length ? (
              <div className="report-stack">
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
                    <div><h3>Recent Class Test Attempts</h3></div>
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
                          {(() => {
                            const status = getAttemptStatus(attempt);
                            const statusClass = status === 'Pass' ? 'good' : status === 'Needs Work' ? 'weak' : 'average';
                            return (
                              <span className={`level ${statusClass}`}>
                                {status}
                              </span>
                            );
                          })()}
                          <span className="muted">{attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '-'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="report-empty-soft">
                <FileQuestion size={26} />
                <b>No exam analytics match these filters.</b>
                <p className="muted">Try widening the class, student, or date filters.</p>
              </div>
            )}
          </section>
        )}

        {loadedView === 'exam-practice' && (
          <section className="report-section">
            <div className="section-title report-section-title">
              <div>
                <h2>Exam Analytics - Practice Tests</h2>
                <p className="muted">Student self-practice tests and subjects performance.</p>
              </div>
              <div className="hero-header__actions">
                <button className="btn secondary" type="button" onClick={exportPracticeView}>
                  <Download size={18} /> Export Practice Tests
                </button>
              </div>
            </div>

            <div className="report-section-meta">
              <span className="status-pill live">{practiceOverall.attempts} items</span>
              <span className="muted">Filtered from practice exam attempts.</span>
            </div>

            {practiceOverall.attempts ? (
              <div className="report-stack">
                <div className="report-summary-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <article className="report-summary-tile compact-kpi" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', background: '#fff', minHeight: 'auto' }}>
                    <span className="report-summary-tile__icon" style={{ display: 'inline-flex', padding: '6px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', width: '30px', height: '30px', placeItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ClipboardList size={16} /></span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '1.15rem', color: '#1e293b', lineHeight: '1.2' }}>{practiceOverall.attempts}</strong>
                      <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px', fontWeight: 500 }}>Total practice attempts</small>
                    </div>
                  </article>
                  <article className="report-summary-tile compact-kpi" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', background: '#fff', minHeight: 'auto' }}>
                    <span className="report-summary-tile__icon" style={{ display: 'inline-flex', padding: '6px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', width: '30px', height: '30px', placeItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BarChart3 size={16} /></span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '1.15rem', color: '#1e293b', lineHeight: '1.2' }}>{practiceOverall.averageScore.toFixed(1)}</strong>
                      <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px', fontWeight: 500 }}>Average score</small>
                    </div>
                  </article>
                  <article className="report-summary-tile compact-kpi" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', background: '#fff', minHeight: 'auto' }}>
                    <span className="report-summary-tile__icon" style={{ display: 'inline-flex', padding: '6px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', width: '30px', height: '30px', placeItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Target size={16} /></span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '1.15rem', color: '#1e293b', lineHeight: '1.2' }}>{pct(practiceOverall.averageAccuracy)}</strong>
                      <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px', fontWeight: 500 }}>Average accuracy</small>
                    </div>
                  </article>
                  <article className="report-summary-tile compact-kpi" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', background: '#fff', minHeight: 'auto' }}>
                    <span className="report-summary-tile__icon" style={{ display: 'inline-flex', padding: '6px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', width: '30px', height: '30px', placeItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Users size={16} /></span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '1.15rem', color: '#1e293b', lineHeight: '1.2' }}>{practiceOverall.studentsAttempted}</strong>
                      <small style={{ display: 'block', color: '#64748b', fontSize: '0.75rem', marginTop: '2px', fontWeight: 500 }}>Students practicing</small>
                    </div>
                  </article>
                </div>

                <div className="report-subsection">
                  <div className="section-title compact">
                    <div><h3>Top Performing Students</h3></div>
                  </div>
                  <div className="report-analytics-grid">
                    {practiceTopStudents.map(row => (
                      <article className="report-analytics-card" key={row.studentId}>
                        <div className="report-analytics-card__top">
                          <div>
                            <span className="eyebrow">{row.student?.class_name || 'Student'}</span>
                            <h3>{row.student?.full_name}</h3>
                          </div>
                          <span className="report-analytics-card__icon"><Users size={20} /></span>
                        </div>
                        <div className="report-chip-list">
                          <span className="chip"><b>{row.count}</b><small>Attempts</small></span>
                          <span className="chip"><b>{row.bestScore}</b><small>Best</small></span>
                          <span className="chip"><b>{row.latestScore}</b><small>Latest</small></span>
                          <span className="chip"><b>{pct(row.averageAccuracy)}</b><small>Accuracy</small></span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="report-subsection">
                  <div className="section-title compact">
                    <div><h3>Chapter Insights</h3></div>
                  </div>
                  <div className="report-analytics-grid">
                    {practiceWeakChapters.map(row => (
                      <article className="report-analytics-card" key={`weak-${row.chapter}`}>
                        <div className="report-analytics-card__top">
                          <div>
                            <span className="eyebrow">Weak chapter</span>
                            <h3>{row.chapter}</h3>
                          </div>
                          <span className="report-analytics-card__icon"><BookOpen size={20} /></span>
                        </div>
                        <div className="report-chip-list">
                          <span className="chip"><b>{row.total}</b><small>Questions</small></span>
                          <span className="chip"><b>{row.correct}</b><small>Correct</small></span>
                          <span className="chip"><b>{pct(row.accuracy)}</b><small>Accuracy</small></span>
                          <span className="chip"><b>{row.strength}</b><small>Strength</small></span>
                        </div>
                      </article>
                    ))}
                    {practiceMostPracticed.map(row => (
                      <article className="report-analytics-card" key={`most-${row.chapter}`}>
                        <div className="report-analytics-card__top">
                          <div>
                            <span className="eyebrow">Most practiced</span>
                            <h3>{row.chapter}</h3>
                          </div>
                          <span className="report-analytics-card__icon"><TrendingUp size={20} /></span>
                        </div>
                        <div className="report-chip-list">
                          <span className="chip"><b>{row.total}</b><small>Questions</small></span>
                          <span className="chip"><b>{row.correct}</b><small>Correct</small></span>
                          <span className="chip"><b>{pct(row.accuracy)}</b><small>Accuracy</small></span>
                          <span className="chip"><b>{row.strength}</b><small>Strength</small></span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="report-subsection">
                  <div className="section-title compact">
                    <div><h3>Recent Practice Attempts</h3></div>
                  </div>
                  <div className="report-attempt-grid">
                    {practiceVisibleAttempts.slice(0, 8).map(attempt => (
                      <article className="report-attempt-card" key={attempt.id}>
                        <div className="report-analytics-card__top">
                          <div>
                            <span className="eyebrow">{attempt.profiles?.full_name || 'Student'}</span>
                            <h3>{attempt.practice_subject || 'Practice Test'}</h3>
                          </div>
                          <span className="report-analytics-card__icon"><TrendingUp size={20} /></span>
                        </div>
                        <div className="report-chip-list">
                          <span className="chip"><b>#{attempt.attempt_number || 1}</b><small>Attempt</small></span>
                          <span className="chip"><b>{attempt.total_score || 0}</b><small>Score</small></span>
                          <span className="chip"><b>{pct(attempt.accuracy || attempt.percentage)}</b><small>Accuracy</small></span>
                          <span className="chip"><b>{minutes(attempt.time_taken_seconds)}</b><small>Time</small></span>
                        </div>
                        <div className="report-analytics-card__footer">
                          {(() => {
                            const status = getAttemptStatus(attempt);
                            const statusClass = status === 'Pass' ? 'good' : status === 'Needs Work' ? 'weak' : 'average';
                            return (
                              <span className={`level ${statusClass}`}>
                                {status}
                              </span>
                            );
                          })()}
                          <span className="muted">{attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '-'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="report-empty-soft">
                <BookOpen size={26} />
                <b>No practice analytics yet.</b>
                <p className="muted">Practice attempts will appear here separately from official exams.</p>
              </div>
            )}
          </section>
        )}

        {loadedView === 'student-focused' && (
          <section className="report-section">
            {selectedStudentReport ? (
              <div className="report-focused-panel">
                <div className="report-focused-panel__head">
                  <div>
                    <span className="eyebrow">Student Focused Analytics</span>
                    <h2>{selectedStudentReport.student?.full_name}</h2>
                    <p className="muted">{selectedStudentReport.student?.class_name || 'No Class'} • {selectedStudentReport.student?.email}</p>
                  </div>
                  <div className="hero-header__actions">
                    <button className="btn secondary" type="button" onClick={() => setReviewReport(selectedStudentReport)}>
                      <Eye size={18} /> View Student Review
                    </button>
                    <button className="btn" type="button" onClick={exportFocusedStudent}>
                      <Download size={18} /> Export Student Data
                    </button>
                  </div>
                </div>

                <div className="report-focused-panel__summary">
                  <span><b>{selectedStudentReport.count}</b><small>Total Attempts</small></span>
                  <span><b>{selectedStudentReport.best}</b><small>Best Score</small></span>
                  <span><b>{selectedStudentReport.latestScore}</b><small>Latest Score</small></span>
                  <span><b>{selectedStudentReport.average.toFixed(1)}</b><small>Average Score</small></span>
                  <span><b>{pct(selectedStudentReport.accuracy)}</b><small>Average Accuracy</small></span>
                  <span><b>{minutes(selectedStudentReport.time)}</b><small>Average Time</small></span>
                </div>

                <div className="student-focused-insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '20px' }}>
                  <div className="panel soft-card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><TrendingUp size={18} style={{ color: '#0f766e' }} /> Strong Chapters</h3>
                    {selectedStudentReport.strong.length ? (
                      <div className="chip-list">
                        {selectedStudentReport.strong.map(ch => <span key={ch} className="chip selected">{ch}</span>)}
                      </div>
                    ) : <p className="muted">No strong chapters identified yet.</p>}
                  </div>
                  
                  <div className="panel soft-card">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><TrendingDown size={18} style={{ color: '#b91c1c' }} /> Weak Chapters</h3>
                    {selectedStudentReport.weak.length ? (
                      <div className="chip-list">
                        {selectedStudentReport.weak.map(ch => <span key={ch} className="chip selected danger">{ch}</span>)}
                      </div>
                    ) : <p className="muted">No weak chapters identified yet.</p>}
                  </div>
                </div>

                <div className="panel soft-card" style={{ marginTop: '16px' }}>
                  <h3>Improvement Summary & Recommendations</h3>
                  <p style={{ marginTop: '8px', lineHeight: '1.5' }}>{selectedStudentReport.summary}</p>
                  <p style={{ marginTop: '8px', fontWeight: 'bold' }}>Recommendation: <span className="muted" style={{ fontWeight: 'normal' }}>{selectedStudentReport.recommendation}</span></p>
                </div>
              </div>
            ) : (
              <div className="report-empty-soft">
                <Users size={26} />
                <b>No student analytics found.</b>
                <p className="muted">The student selected has not submitted any exam attempts.</p>
              </div>
            )}
          </section>
        )}

        {loadedView === 'chapter-focused' && (
          <section className="report-section">
            {chapterDetails.length ? (
              <div className="report-focused-panel">
                <div className="report-focused-panel__head">
                  <div>
                    <span className="eyebrow">Chapter Focused Analytics</span>
                    <h2>{selectedChapter?.chapter_name || 'Chapter Analytics'}</h2>
                    <p className="muted">Subject: {selectedChapter?.subject || 'N/A'}</p>
                  </div>
                  <div className="hero-header__actions">
                    <button className="btn" type="button" onClick={exportFocusedChapter}>
                      <Download size={18} /> Export Chapter Data
                    </button>
                  </div>
                </div>

                <div className="report-focused-panel__summary">
                  <span><b>{chapterDetails.length}</b><small>Total Qs Attempted</small></span>
                  <span><b>{uniqueAttemptsCount}</b><small>Exam Attempts</small></span>
                  <span><b>{averageScore.toFixed(2)}</b><small>Avg Marks Awarded</small></span>
                  <span><b>{pct(chapterAccuracy)}</b><small>Average Accuracy</small></span>
                  <span><b>{pct(passPercentage)}</b><small>Pass Percentage</small></span>
                  <span><b>{chapterTopStudent}</b><small>🏆 Top Student</small></span>
                  <span><b>{chapterWeakestStudent}</b><small>⚠️ Needs Attention</small></span>
                </div>

                <div className="chapter-detailed-insights" style={{ marginTop: '20px', display: 'grid', gap: '20px' }}>
                  <div className="panel soft-card">
                    <h3 style={{ marginBottom: '12px' }}>Difficult Questions (Accuracy &lt; 50%)</h3>
                    <div className="table compact-table">
                      {difficultQuestions.slice(0, 5).map(({ question, accuracy, total }) => (
                        <div className="tr" key={question.id}>
                          <span>
                            <b>{question.question_text}</b>
                            <small>Accuracy {pct(accuracy)} • Attempted {total} times • Difficulty: {question.difficulty}</small>
                          </span>
                        </div>
                      ))}
                      {!difficultQuestions.length && <p className="muted">No difficult questions found in this chapter.</p>}
                    </div>
                  </div>

                  <div className="panel soft-card">
                    <h3 style={{ marginBottom: '12px' }}>Frequently Incorrect Questions</h3>
                    <div className="table compact-table">
                      {frequentlyIncorrect.slice(0, 5).map(({ question, correct, total }) => (
                        <div className="tr" key={question.id}>
                          <span>
                            <b>{question.question_text}</b>
                            <small>Failed {total - correct} times out of {total} attempts ({pct((correct/total)*100)} accuracy)</small>
                          </span>
                        </div>
                      ))}
                      {!frequentlyIncorrect.length && <p className="muted">No incorrect questions found in this chapter.</p>}
                    </div>
                  </div>

                  <div className="panel soft-card">
                    <h3 style={{ marginBottom: '12px' }}>Common Student Mistakes</h3>
                    <div className="table compact-table">
                      {commonMistakes.map(({ mistake, count }) => (
                        <div className="tr" key={mistake}>
                          <span>
                            <b>{mistake}</b>
                            <small>Selected by students {count} times</small>
                          </span>
                        </div>
                      ))}
                      {!commonMistakes.length && <p className="muted">No common mistakes registered for this chapter.</p>}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="report-empty-soft">
                <BookOpen size={26} />
                <b>No analytics data available for this chapter.</b>
                <p className="muted">There are no submitted attempts answering questions from this chapter yet.</p>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Advanced Filters Modal (original) */}
      {filtersModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setFiltersModalOpen(false)}>
          <div className="modal-card report-filters-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Advanced filters</span>
                <h2>Advanced Filters</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setFiltersModalOpen(false)} aria-label="Close filters">
                <X size={18} />
              </button>
            </div>
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
              <button className="btn" type="button" onClick={() => setFiltersModalOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Exam Analytics Selection Modal (Part 3) */}
      {examModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setExamModalOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Workflow selection</span>
                <h2>Exam Report Type</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setExamModalOpen(false)} aria-label="Close modal"><X size={18} /></button>
            </div>
            <div className="modal-form">
              <label className="modal-step-info">Select Report Type</label>
              <div className="toggle-row" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #dbe3ef', borderRadius: '12px', cursor: 'pointer', background: modalReportType === 'exam-class' ? '#f8fbff' : 'white', borderColor: modalReportType === 'exam-class' ? '#2563eb' : '#dbe3ef' }}>
                  <input type="radio" name="reportType" checked={modalReportType === 'exam-class'} onChange={() => setModalReportType('exam-class')} style={{ width: 'auto' }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '15px' }}>Class Test</strong>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Analyze official assigned exams performance</span>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', border: '1px solid #dbe3ef', borderRadius: '12px', cursor: 'pointer', background: modalReportType === 'exam-practice' ? '#f8fbff' : 'white', borderColor: modalReportType === 'exam-practice' ? '#2563eb' : '#dbe3ef' }}>
                  <input type="radio" name="reportType" checked={modalReportType === 'exam-practice'} onChange={() => setModalReportType('exam-practice')} style={{ width: 'auto' }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '15px' }}>Practice Test</strong>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>Track student self-conducted practice results</span>
                  </div>
                </label>
              </div>
              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button className="btn secondary" type="button" onClick={() => setExamModalOpen(false)}>Cancel</button>
                <button className="btn" type="button" onClick={() => {
                  setLoadedView(modalReportType);
                  setExamModalOpen(false);
                }}>Continue</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student Analytics Selection Modal (Part 4) */}
      {studentModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setStudentModalOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Workflow selection</span>
                <h2>Select Student</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setStudentModalOpen(false)} aria-label="Close modal"><X size={18} /></button>
            </div>
            <div className="modal-form">
              <label className="field">
                <span className="modal-step-info">Step 1</span> Class
                <select value={modalClassId} onChange={e => {
                  setModalClassId(e.target.value);
                  setModalStudentId('');
                }}>
                  <option value="all">All Classes</option>
                  {classes.map(item => (
                    <option value={item.id} key={item.id}>
                      {item.class_name} {item.section_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ marginTop: '14px' }}>
                <span className="modal-step-info">Step 2</span> Student
                <select
                  value={modalStudentId}
                  onChange={e => setModalStudentId(e.target.value)}
                  disabled={modalClassId !== 'all' && !students.filter(s => s.class_id === modalClassId).length}
                >
                  <option value="">Select a student...</option>
                  {students
                    .filter(student => modalClassId === 'all' || student.class_id === modalClassId)
                    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)))
                    .map(student => (
                      <option value={student.id} key={student.id}>
                        {student.full_name}
                      </option>
                    ))}
                </select>
              </label>

              {modalClassId !== 'all' && !students.filter(s => s.class_id === modalClassId).length && (
                <p className="danger-text" style={{ marginTop: '10px', fontSize: '13px', fontWeight: 'bold' }}>No students available.</p>
              )}

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button className="btn secondary" type="button" onClick={() => setStudentModalOpen(false)}>Cancel</button>
                <button
                  className="btn"
                  type="button"
                  disabled={!modalStudentId || (modalClassId !== 'all' && !students.filter(s => s.class_id === modalClassId).length)}
                  onClick={() => {
                    setSelectedStudentId(modalStudentId);
                    setLoadedView('student-focused');
                    setStudentModalOpen(false);
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chapter Analytics Selection Modal (Part 5) */}
      {chapterModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setChapterModalOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Workflow selection</span>
                <h2>Select Chapter</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setChapterModalOpen(false)} aria-label="Close modal"><X size={18} /></button>
            </div>
            <div className="modal-form">
              <label className="field">
                <span className="modal-step-info">Step 1</span> Subject
                <select value={modalSubject} onChange={e => {
                  setModalSubject(e.target.value);
                  setModalChapterId('');
                }}>
                  <option value="all">Select a subject...</option>
                  {subjects.map(subject => (
                    <option value={subject} key={subject}>{subject}</option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ marginTop: '14px' }}>
                <span className="modal-step-info">Step 2</span> Chapter
                <select
                  value={modalChapterId}
                  onChange={e => setModalChapterId(e.target.value)}
                  disabled={modalSubject === 'all'}
                >
                  <option value="">Select a chapter...</option>
                  {allChapters
                    .filter(c => c.subject === modalSubject)
                    .map(chapter => (
                      <option value={chapter.id} key={chapter.id}>
                        {chapter.chapter_name}
                      </option>
                    ))}
                </select>
              </label>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button className="btn secondary" type="button" onClick={() => setChapterModalOpen(false)}>Cancel</button>
                <button
                  className="btn"
                  type="button"
                  disabled={!modalChapterId}
                  onClick={() => {
                    setSelectedChapterId(modalChapterId);
                    setLoadedView('chapter-focused');
                    setChapterModalOpen(false);
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reviewReport && <StudentReviewModal report={reviewReport} onClose={() => setReviewReport(null)} />}
    </>
  );
}
