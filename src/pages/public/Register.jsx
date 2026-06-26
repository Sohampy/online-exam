import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpenCheck, GraduationCap, Loader2, UsersRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabaseClient';
import LoadingScreen from '../../components/LoadingScreen.jsx';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState([]);
  const [msg, setMsg] = useState('');
  const [classError, setClassError] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const nav = useNavigate();
  const activeClasses = [...new Map(classes.filter(item => item.is_active !== false).map(item => [item.id, item])).values()];

  useEffect(() => {
    supabase.from('classes').select('*').eq('is_active', true).order('class_name').then(({ data, error }) => {
      if (error) setClassError('Classes could not be loaded. Ask admin to run the latest Supabase SQL update.');
      setClasses(data || []);
      setLoadingClasses(false);
    });
  }, []);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMsg('');
    const selectedClass = classes.find(item => item.id === classId);
    const classLabel = selectedClass ? `${selectedClass.class_name} ${selectedClass.section_name || ''}`.trim() : '';
    const { error } = await register(fullName, email, password, classId, classLabel);
    setSubmitting(false);
    if (error) setMsg(error.message);
    else {
      setMsg('Registered successfully. Check email confirmation if enabled, then login.');
      setTimeout(() => nav('/login'), 1200);
    }
  }

  if (submitting) return <LoadingScreen label="Creating your student account..." />;

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <div className="auth-mark"><GraduationCap size={32} /></div>
        <span className="eyebrow">Student Access</span>
        <h1>Create your account</h1>
        <p>Join your class, take assigned exams, and track every result from your student dashboard.</p>
        <div className="auth-mini-grid">
          <span><BookOpenCheck size={18} /> Class based exams</span>
          <span><UsersRound size={18} /> Teacher assigned</span>
        </div>
      </section>

      <section className="auth-card auth-card-modern">
        <h2>Student Registration</h2>
        <form onSubmit={submit}>
          <input placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} disabled={submitting} />
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} disabled={submitting} />
          <select value={classId} onChange={e => setClassId(e.target.value)} disabled={submitting || loadingClasses}>
            <option value="">{loadingClasses ? 'Loading classes...' : 'Select class'}</option>
            {activeClasses.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}
          </select>
          {classError && <small className="error">{classError}</small>}
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={submitting} />
          <button className="btn" disabled={submitting || loadingClasses}>
            {submitting && <Loader2 className="loading-spinner" size={18} />}
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        {msg && <p>{msg}</p>}
        <p>Already registered? <Link to="/login">Login</Link></p>
      </section>
    </main>
  );
}
