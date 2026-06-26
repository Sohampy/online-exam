import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';

export default function TeacherStudentsList() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      const { data: links } = await supabase.from('teacher_students').select('student_id').eq('teacher_id', user.id).eq('status', 'active');
      const ids = (links || []).map(row => row.student_id);
      if (!ids.length) {
        setStudents([]);
        return;
      }
      const [{ data: profiles }, { data: attempts }] = await Promise.all([
        supabase.from('profiles').select('id,full_name,email,class_name,is_active').in('id', ids),
        supabase.from('student_attempts').select('student_id,total_score,submitted_at,status').in('student_id', ids).order('started_at', { ascending: false })
      ]);
      const attemptMap = (attempts || []).reduce((map, attempt) => {
        if (!map[attempt.student_id]) map[attempt.student_id] = [];
        map[attempt.student_id].push(attempt);
        return map;
      }, {});
      setStudents((profiles || []).filter(profile => profile.is_active !== false).map(profile => {
        const studentAttempts = attemptMap[profile.id] || [];
        const latest = studentAttempts[0];
        return { ...profile, attempts: studentAttempts.length, latestScore: latest?.total_score ?? '-' };
      }));
    }
    load();
  }, [user?.id]);

  return (
    <>
      <HeroHeader
        badge="My Students"
        title="My Students"
        singleLine
        stats={<div className="hero-stat"><Users size={28} /><strong>{students.length}</strong><span>Students</span></div>}
      />

      <div className="user-table">
        <div className="user-row header"><b>Name</b><b>Email</b><b>Class</b><b>Attempts</b><b>Latest Score</b><b>Action</b></div>
        {students.map(student => (
          <div className="user-row" key={student.id}>
            <span>{student.full_name}</span>
            <span>{student.email}</span>
            <span>{student.class_name || '-'}</span>
            <span>{student.attempts}</span>
            <span>{student.latestScore}</span>
            <Link className="btn secondary" to="/teacher/reports"><Eye size={18} /> Reports</Link>
          </div>
        ))}
      </div>
    </>
  );
}
