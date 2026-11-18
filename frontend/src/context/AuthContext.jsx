import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  // On load, ask the server whether the session cookie is still valid. 401 just means "guest".
  useEffect(() => {
    let active = true;
    api.getCurrentUser()
      .then((data) => { if (active) setUser(data.user); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  const login = useCallback(async (credentials) => setUser((await api.login(credentials)).user), []);
  const register = useCallback(async (account) => setUser((await api.register(account)).user), []);
  const logout = useCallback(async () => {
    try { await api.logout(); } finally { setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, checking, login, register, logout }), [user, checking, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
