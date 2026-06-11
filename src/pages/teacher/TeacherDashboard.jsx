import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, FileQuestion, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ students: 0, exams: 0 });

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      const [{ count: students }, { count: exams }] = await Promise.all([
        supabase.from('teacher_students').select('*', { count: 'exact', head: true }).eq('teacher_id', user.id).eq('status', 'active'),
        supabase.from('exams').select('*', { count: 'exact', head: true }).eq('created_by', user.id)
      ]);
      setStats({ students: students || 0, exams: exams || 0 });
    }
    load();
  }, [user?.id]);

  return (
    <>
      <section className="dashboard-hero admin-hero">
        <div>
          <span className="eyebrow">Teacher Workspace</span>
          <h1>Manage your exams and assigned students.</h1>
          <p>Reports are limited to students assigned by the main admin.</p>
        </div>
      </section>
      <div className="cards">
        <div className="card soft-card"><Users size={22} /><h3>{stats.students}</h3><p>Assigned Students</p><Link className="btn secondary" to="/teacher/students">View Students</Link></div>
        <div className="card soft-card"><ClipboardList size={22} /><h3>{stats.exams}</h3><p>Your Exams</p><Link className="btn" to="/teacher/exams">Manage Exams</Link></div>
        <div className="card soft-card"><FileQuestion size={22} /><h3>Available</h3><p>Question Upload</p><Link className="btn secondary" to="/teacher/upload">Upload Questions</Link></div>
      </div>
    </>
  );
}
