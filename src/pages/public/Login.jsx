import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpenCheck, ClipboardList, GraduationCap, Loader2, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import LoadingScreen from '../../components/LoadingScreen.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    setSubmitting(true);
    const { error } = await login(email, password);
    if (error) {
      setSubmitting(false);
      setMsg(error.message);
    } else {
      nav('/dashboard');
    }
  }

  if (submitting) return <LoadingScreen label="Signing you in..." />;

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <div className="auth-mark"><BookOpenCheck size={32} /></div>
        <span className="eyebrow">BrainzHive</span>
        <h1>One login for every workspace.</h1>
        <p>Admins, teachers, and students enter from here, then land directly inside their own dashboard.</p>
        <div className="auth-role-cards">
          <span><UserCog size={18} /><b>Admin</b><small>Users, classes, reports</small></span>
          <span><UsersRound size={18} /><b>Teacher</b><small>Students, exams, analytics</small></span>
          <span><GraduationCap size={18} /><b>Student</b><small>Exams, attempts, results</small></span>
        </div>
        <div className="auth-mini-grid">
          <span><ClipboardList size={18} /> Exam ready dashboard</span>
          <span><ShieldCheck size={18} /> Secure reports</span>
        </div>
      </section>

      <section className="auth-card auth-card-modern">
        <span className="auth-kicker">Continue to portal</span>
        <h2>Login</h2>
        <form onSubmit={submit}>
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} disabled={submitting} />
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={submitting} />
          <button className="btn" disabled={submitting}>
            {submitting && <Loader2 className="loading-spinner" size={18} />}
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
        {msg && <p className="error">{msg}</p>}
        <p>No account? <Link to="/register">Register</Link></p>
      </section>
    </main>
  );
}
