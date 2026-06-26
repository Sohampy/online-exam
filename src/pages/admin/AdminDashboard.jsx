import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, BookOpen, ClipboardList, FileQuestion, Plus, UserCog, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';

const statLabels = {
  users: ['Users', Users, '/admin/users'],
  chapters: ['Chapters', BookOpen, '/admin/chapters'],
  questions: ['Questions', FileQuestion, '/admin/questions'],
  exams: ['Exams', ClipboardList, '/admin/exams'],
  attempts: ['Attempts', BarChart3, '/admin/reports']
};

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const counts = await Promise.all(['profiles', 'chapters', 'questions', 'exams', 'student_attempts'].map(table => supabase.from(table).select('*', { count: 'exact', head: true })));
        const { data } = await supabase
          .from('student_attempts')
          .select('id,status,total_score,accuracy,started_at,profiles(full_name),exams(title)')
          .order('started_at', { ascending: false })
          .limit(5);

        setStats({ users: counts[0].count, chapters: counts[1].count, questions: counts[2].count, exams: counts[3].count, attempts: counts[4].count });
        setRecent(data || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <LoadingScreen label="Loading admin control room..." />;

  return (
    <>
      <HeroHeader
        badge="Admin Dashboard"
        title="Admin Dashboard"
        singleLine
        actions={(
          <>
          <Link className="btn" to="/admin/exams"><Plus size={18} /> Create Exam</Link>
          <Link className="btn secondary" to="/admin/questions"><FileQuestion size={18} /> Add Question</Link>
          <Link className="btn secondary" to="/admin/users"><UserCog size={18} /> Manage Users</Link>
          <Link className="btn secondary" to="/admin/chapters"><BookOpen size={18} /> Add Chapter</Link>
          </>
        )}
      />

      <div className="cards stat-strip">
        {Object.entries(statLabels).map(([key, [label, Icon, to]]) => (
          <Link className="card soft-card clickable-card" to={to} key={key} aria-label={`Open ${label}`}>
            <Icon size={22} />
            <h3>{stats[key] || 0}</h3>
            <p>{label}</p>
          </Link>
        ))}
      </div>

      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Recent Attempts</h2>
            <p className="muted">Latest student activity across exams.</p>
          </div>
          <Link className="btn secondary" to="/admin/reports">Reports</Link>
        </div>
        <div className="table compact-table">
          {recent.map(row => (
            <div className="tr" key={row.id}>
              <span>
                <b>{row.profiles?.full_name || 'Student'} - {row.exams?.title || 'Exam'}</b>
                <small>{row.status} • Score {row.total_score || 0} • Accuracy {row.accuracy || 0}%</small>
              </span>
            </div>
          ))}
          {!recent.length && <p className="muted">No attempts yet.</p>}
        </div>
      </section>
    </>
  );
}
