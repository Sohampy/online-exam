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
        const counts = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('chapters').select('*', { count: 'exact', head: true }),
          supabase.from('questions').select('*', { count: 'exact', head: true }),
          supabase.from('exams').select('*', { count: 'exact', head: true }),
          supabase.from('student_attempts').select('*', { count: 'exact', head: true }).eq('attempt_type', 'exam')
        ]);
        const { data } = await supabase
          .from('student_attempts')
          .select('id,status,total_score,accuracy,started_at,attempt_type,profiles(full_name),exams(title)')
          .eq('attempt_type', 'exam')
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

      <div className="cards stat-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {Object.entries(statLabels).map(([key, [label, Icon, to]]) => {
          const bgColors = {
            users: '#e0f2fe',
            chapters: '#f0fdf4',
            questions: '#f5f3ff',
            exams: '#fff7ed',
            attempts: '#e0e7ff'
          };
          const textColors = {
            users: '#0284c7',
            chapters: '#16a34a',
            questions: '#6d28d9',
            exams: '#ea580c',
            attempts: '#4f46e5'
          };
          return (
            <Link
              className="card soft-card clickable-card"
              to={to}
              key={key}
              aria-label={`Open ${label}`}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', width: '100%', textDecoration: 'none' }}
            >
              <span style={{ display: 'inline-flex', padding: '6px', background: bgColors[key] || '#f1f5f9', color: textColors[key] || '#475569', borderRadius: '6px', flexShrink: 0 }}>
                <Icon size={18} />
              </span>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>{stats[key] || 0}</h3>
                <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.75rem', lineHeight: '1.3' }}>{label}</p>
              </div>
            </Link>
          );
        })}
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
