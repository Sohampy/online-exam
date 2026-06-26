import { useEffect, useState } from 'react';
import { BadgeInfo, CheckCircle2, User } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({ full_name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      full_name: profile?.full_name || '',
      email: profile?.email || user?.email || ''
    });
  }, [profile?.email, profile?.full_name, user?.email]);

  async function submit(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    setSaving(true);
    try {
      const updates = [];
      if (form.email && form.email !== user?.email) {
        const { error } = await supabase.auth.updateUser({ email: form.email });
        if (error) throw error;
      }
      const { error: profileError } = await supabase.from('profiles').update({ full_name: form.full_name.trim(), email: form.email.trim() }).eq('id', user.id);
      if (profileError) throw profileError;
      updates.push('Profile updated successfully.');
      await refreshProfile?.();
      setMessage(updates[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="password-shell">
      <section className="panel password-panel">
        <div className="password-icon"><User size={28} /></div>
        <span className="eyebrow">Profile</span>
        <h1>Profile</h1>
        <form onSubmit={submit}>
          <label className="field">Name<input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Your name" /></label>
          <label className="field">Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
          <label className="field">Role<input value={profile?.role || ''} disabled /></label>
          <button className="btn" disabled={saving}><CheckCircle2 size={18} /> {saving ? 'Saving...' : 'Save Profile'}</button>
        </form>
        {message && <div className="notice success"><CheckCircle2 size={18} /> {message}</div>}
        {error && <div className="notice"><BadgeInfo size={18} /> {error}</div>}
      </section>
    </div>
  );
}
