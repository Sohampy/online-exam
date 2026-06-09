import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, BookOpen, ClipboardList, FileQuestion, Plus, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const statLabels = {
  users: ['Users', Users],
  chapters: ['Chapters', BookOpen],
  questions: ['Questions', FileQuestion],
  exams: ['Exams', ClipboardList],
  attempts: ['Attempts', BarChart3]
};

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    async function load() {
      const counts = await Promise.all(['profiles', 'chapters', 'questions', 'exams', 'student_attempts'].map(table => supabase.from(table).select('*', { count: 'exact', head: true })));
      const { data } = await supabase
        .from('student_attempts')
        .select('id,status,total_score,accuracy,started_at,profiles(full_name),exams(title)')
        .order('started_at', { ascending: false })
        .limit(5);

      setStats({ users: counts[0].count, chapters: counts[1].count, questions: counts[2].count, exams: counts[3].count, attempts: counts[4].count });
      setRecent(data || []);
    }
    load();
  }, []);

  return (
    <>
      <section className="dashboard-hero admin-hero">
        <div>
          <span className="eyebrow">Admin Control Room</span>
          <h1>Keep exams ready, fair, and easy to monitor.</h1>
          <p>Manage question coverage, publish exams, and watch student activity from one dashboard.</p>
        </div>
        <Link className="btn" to="/admin/exams"><Plus size={18} /> Create Exam</Link>
      </section>

      <div className="cards stat-strip">
        {Object.entries(statLabels).map(([key, [label, Icon]]) => (
          <div className="card soft-card" key={key}>
            <Icon size={22} />
            <h3>{stats[key] || 0}</h3>
            <p>{label}</p>
          </div>
        ))}
      </div>

      <div className="admin-grid">
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

        <section className="panel quick-panel">
          <h2>Quick Actions</h2>
          <Link to="/admin/questions"><FileQuestion size={18} /> Add Questions</Link>
          <Link to="/admin/chapters"><BookOpen size={18} /> Manage Chapters</Link>
          <Link to="/admin/exams"><ClipboardList size={18} /> Exam Management</Link>
          <Link to="/admin/permissions"><Users size={18} /> Teacher Permissions</Link>
        </section>
      </div>
    </>
  );
}
