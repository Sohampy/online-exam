import { useState } from 'react';
import { CheckCircle2, KeyRound, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export default function ChangePassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Both passwords must match.');

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return setError(error.message);
    setPassword('');
    setConfirm('');
    setMessage('Password changed successfully.');
  }

  return (
    <div className="password-shell">
      <section className="panel password-panel">
        <div className="password-icon"><KeyRound size={28} /></div>
        <span className="eyebrow">Account Security</span>
        <h1>Change Password</h1>
        <p className="muted">Use this after logging in with a temporary password from the admin.</p>
        <form onSubmit={submit}>
          <label className="field">New password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter new password" /></label>
          <label className="field">Confirm password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" /></label>
          <button className="btn" disabled={saving}><Lock size={18} /> {saving ? 'Updating...' : 'Update Password'}</button>
        </form>
        {message && <div className="notice success"><CheckCircle2 size={18} /> {message}</div>}
        {error && <div className="notice">{error}</div>}
      </section>
    </div>
  );
}
