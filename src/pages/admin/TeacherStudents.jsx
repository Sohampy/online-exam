import { useEffect, useMemo, useState } from 'react';
import { Link2, Plus, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';
import { notify } from '../../components/Notifications.jsx';

export default function TeacherStudents() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [classes, setClasses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [teacherId, setTeacherId] = useState('');
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [openAssign, setOpenAssign] = useState(false);

  async function load() {
    const [{ data: users }, { data: links }, { data: classRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('teacher_students').select('*').eq('status', 'active'),
      supabase.from('classes').select('*').order('class_name')
    ]);
    setProfiles(users || []);
    setAssignments(links || []);
    setClasses(classRows || []);
    if (!teacherId) setTeacherId((users || []).find(profile => profile.role === 'teacher')?.id || '');
  }

  useEffect(() => {
    load();
  }, []);

  const teachers = profiles.filter(profile => profile.role === 'teacher' && profile.is_active !== false);
  const students = profiles.filter(profile => profile.role === 'student' && profile.is_active !== false);
  const activeClasses = [...new Map(classes.filter(item => item.is_active !== false).map(item => [item.id, item])).values()];
  const selectedAssignments = assignments.filter(row => row.teacher_id === teacherId);
  const assignedStudentIds = new Set(selectedAssignments.map(row => row.student_id));
  const filteredStudents = useMemo(() => students.filter(student => {
    if (classFilter !== 'all' && student.class_id !== classFilter) return false;
    return `${student.full_name} ${student.email} ${student.class_name || ''}`.toLowerCase().includes(query.toLowerCase());
  }), [classFilter, query, students]);

  async function assign(studentId) {
    const { error } = await supabase.from('teacher_students').upsert({
      teacher_id: teacherId,
      student_id: studentId,
      assigned_by: user.id,
      status: 'active',
      assigned_at: new Date().toISOString()
    }, { onConflict: 'teacher_id,student_id' });
    if (error) return notify({ type: 'error', title: 'Could not assign student', message: error.message });
    notify({ type: 'success', title: 'Student assigned' });
    load();
  }

  async function remove(studentId) {
    const { error } = await supabase.from('teacher_students').update({ status: 'inactive' }).eq('teacher_id', teacherId).eq('student_id', studentId);
    if (error) return notify({ type: 'error', title: 'Could not remove student', message: error.message });
    notify({ type: 'success', title: 'Student removed' });
    load();
  }

  async function changeClass(student, classId) {
    const item = classes.find(row => row.id === classId);
    const className = item ? `${item.class_name} ${item.section_name || ''}`.trim() : null;
    const { error } = await supabase.from('profiles').update({ class_id: classId || null, class_name: className }).eq('id', student.id);
    if (error) return notify({ type: 'error', title: 'Could not update class', message: error.message });
    notify({ type: 'success', title: 'Student class updated' });
    load();
  }

  return (
    <>
      <HeroHeader badge="Teacher Student Management" title="Assign Students" singleLine />

      <section className="action-tiles">
        <button type="button" className="action-tile" onClick={() => setOpenAssign(true)}>
          <span><Plus size={22} /></span>
          <b>Assign Students</b>
          <small>Open the assignment workspace</small>
        </button>
      </section>

      <CollapsibleSection title="Assign Students" open={openAssign} onToggle={() => setOpenAssign(value => !value)} action={<Plus size={18} />}>
        <section className="panel assignment-panel">
          <div className="grid-2">
            <label className="field">Teacher<select value={teacherId} onChange={e => setTeacherId(e.target.value)}>{teachers.map(teacher => <option value={teacher.id} key={teacher.id}>{teacher.full_name} - {teacher.email}</option>)}</select></label>
            <label className="field">Class filter<select value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="all">All classes</option>{activeClasses.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}</select></label>
            <label className="field">Search students<div className="search-field"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Student name or email" /></div></label>
          </div>
        </section>
      </CollapsibleSection>

      <div className="assignment-list">
        {filteredStudents.map(student => {
          const assigned = assignedStudentIds.has(student.id);
          return (
            <article className="assignment-card" key={student.id}>
              <div>
                <h2>{student.full_name}</h2>
                <p className="muted">{student.email} • {student.class_name || 'No class'}</p>
                <select value={student.class_id || ''} onChange={e => changeClass(student, e.target.value)}>
                  <option value="">No class</option>{activeClasses.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}
                </select>
              </div>
              {assigned ? (
                <button className="btn secondary danger-text" type="button" onClick={() => remove(student.id)}><X size={18} /> Remove</button>
              ) : (
                <button className="btn" type="button" onClick={() => assign(student.id)}><Link2 size={18} /> Assign</button>
              )}
            </article>
          );
        })}
      </div>

      {openAssign && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpenAssign(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Assign students</span>
                <h2>Assign Students</h2>
              </div>
              <button className="icon-btn" type="button" onClick={() => setOpenAssign(false)} aria-label="Close modal"><X size={18} /></button>
            </div>
            <div className="modal-form">
              <div className="grid-2">
                <label className="field">Teacher<select value={teacherId} onChange={e => setTeacherId(e.target.value)}>{teachers.map(teacher => <option value={teacher.id} key={teacher.id}>{teacher.full_name} - {teacher.email}</option>)}</select></label>
                <label className="field">Class filter<select value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="all">All classes</option>{activeClasses.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}</select></label>
                <label className="field">Search students<div className="search-field"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Student name or email" /></div></label>
              </div>
              <div className="modal-actions">
                <button className="btn secondary" type="button" onClick={() => setOpenAssign(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
