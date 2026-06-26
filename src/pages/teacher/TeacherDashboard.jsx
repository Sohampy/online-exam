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
          <Link className="btn secondary" to="/teacher/upload"><FileQuestion size={18} /> Upload Questions</Link>
          <Link className="btn secondary" to="/teacher/students"><Users size={18} /> My Students</Link>
          </>
        )}
      />
      <div className="cards stat-strip">
        <Link className="card soft-card clickable-card" to="/teacher/students" aria-label="Open assigned students">
          <Users size={22} /><h3>{stats.students}</h3><p>Assigned Students</p>
        </Link>
        <Link className="card soft-card clickable-card" to="/teacher/exams" aria-label="Open assigned exams">
          <ClipboardList size={22} /><h3>{stats.exams}</h3><p>Assigned Exams</p>
        </Link>
        <Link className="card soft-card clickable-card" to="/teacher/reports" aria-label="Open teacher reports">
          <BarChart3 size={22} /><h3>View</h3><p>Reports</p>
        </Link>
        <Link className="card soft-card clickable-card" to="/teacher/upload" aria-label="Open question bank upload">
          <FileQuestion size={22} /><h3>Upload</h3><p>Question Bank</p>
        </Link>
      </div>
    </>
  );
}
