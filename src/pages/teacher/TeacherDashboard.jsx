import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ClipboardList, FileQuestion, Plus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ students: 0, exams: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        const [{ count: students }, { count: exams }] = await Promise.all([
          supabase.from('teacher_students').select('*', { count: 'exact', head: true }).eq('teacher_id', user.id).eq('status', 'active'),
          supabase.from('exams').select('*', { count: 'exact', head: true }).eq('created_by', user.id)
        ]);
        setStats({ students: students || 0, exams: exams || 0 });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user?.id]);

  if (loading) return <LoadingScreen label="Loading teacher workspace..." />;

  return (
    <>
      <HeroHeader
        badge="Teacher Workspace"
        title="Teacher Dashboard"
        singleLine
        actions={(
          <>
          <Link className="btn" to="/teacher/exams"><Plus size={18} /> Create Exam</Link>
          <Link className="btn secondary" to="/teacher/questions"><FileQuestion size={18} /> Manage Questions</Link>
          <Link className="btn secondary" to="/teacher/students"><Users size={18} /> My Students</Link>
          </>
        )}
      />
      <div className="cards stat-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <Link
          className="card soft-card clickable-card"
          to="/teacher/students"
          aria-label="Open assigned students"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', width: '100%', textDecoration: 'none' }}
        >
          <span style={{ display: 'inline-flex', padding: '6px', background: '#e0f2fe', color: '#0284c7', borderRadius: '6px', flexShrink: 0 }}>
            <Users size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>{stats.students}</h3>
            <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.75rem', lineHeight: '1.3' }}>Assigned Students</p>
          </div>
        </Link>

        <Link
          className="card soft-card clickable-card"
          to="/teacher/exams"
          aria-label="Open assigned exams"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', width: '100%', textDecoration: 'none' }}
        >
          <span style={{ display: 'inline-flex', padding: '6px', background: '#f0fdf4', color: '#16a34a', borderRadius: '6px', flexShrink: 0 }}>
            <ClipboardList size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>{stats.exams}</h3>
            <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.75rem', lineHeight: '1.3' }}>Assigned Exams</p>
          </div>
        </Link>

        <Link
          className="card soft-card clickable-card"
          to="/teacher/reports"
          aria-label="Open teacher reports"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', width: '100%', textDecoration: 'none' }}
        >
          <span style={{ display: 'inline-flex', padding: '6px', background: '#fff7ed', color: '#ea580c', borderRadius: '6px', flexShrink: 0 }}>
            <BarChart3 size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>View</h3>
            <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.75rem', lineHeight: '1.3' }}>Reports & Analytics</p>
          </div>
        </Link>

        <Link
          className="card soft-card clickable-card"
          to="/teacher/questions"
          aria-label="Open question bank management"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', padding: '12px 16px', borderRadius: '10px', border: '1px solid #dbe3ef', width: '100%', textDecoration: 'none' }}
        >
          <span style={{ display: 'inline-flex', padding: '6px', background: '#f5f3ff', color: '#6d28d9', borderRadius: '6px', flexShrink: 0 }}>
            <FileQuestion size={18} />
          </span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>Manage</h3>
            <p className="muted" style={{ margin: '2px 0 0 0', fontSize: '0.75rem', lineHeight: '1.3' }}>Question Bank</p>
          </div>
        </Link>
      </div>
    </>
  );
}
