import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) console.error(error.message);
    setProfile(data || null);
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getUser();
      setUser(data.user || null);
      if (data.user) await loadProfile(data.user.id);
      setLoading(false);
    }
    init();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user || null);
      if (session?.user) await loadProfile(session.user.id); else setProfile(null);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function register(fullName, email, password, classId = '', className = '') {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: 'student', class_id: classId, class_name: className } }
    });
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }

  const value = useMemo(() => ({ user, profile, loading, login, register, logout, refreshProfile: () => user && loadProfile(user.id) }), [user, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
