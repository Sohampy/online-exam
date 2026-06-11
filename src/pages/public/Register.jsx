import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabaseClient';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState([]);
  const [msg, setMsg] = useState('');
  const [classError, setClassError] = useState('');
  const { register } = useAuth();
  const nav = useNavigate();
  const activeClasses = [...new Map(classes.filter(item => item.is_active !== false).map(item => [item.id, item])).values()];

  useEffect(() => {
    supabase.from('classes').select('*').eq('is_active', true).order('class_name').then(({ data, error }) => {
      if (error) setClassError('Classes could not be loaded. Ask admin to run the latest Supabase SQL update.');
      setClasses(data || []);
    });
  }, []);

  async function submit(e) {
    e.preventDefault();
    const selectedClass = classes.find(item => item.id === classId);
    const classLabel = selectedClass ? `${selectedClass.class_name} ${selectedClass.section_name || ''}`.trim() : '';
    const { error } = await register(fullName, email, password, classId, classLabel);
    if (error) setMsg(error.message);
    else {
      setMsg('Registered successfully. Check email confirmation if enabled, then login.');
      setTimeout(() => nav('/login'), 1200);
    }
  }

  return <div className="auth-card"><h2>Student Registration</h2><form onSubmit={submit}><input placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} /><input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} /><select value={classId} onChange={e => setClassId(e.target.value)}><option value="">Select class</option>{activeClasses.map(item => <option value={item.id} key={item.id}>{item.class_name} {item.section_name}</option>)}</select>{classError && <small className="error">{classError}</small>}<input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} /><button className="btn">Create Account</button></form>{msg && <p>{msg}</p>}<p>Already registered? <Link to="/login">Login</Link></p></div>;
}
