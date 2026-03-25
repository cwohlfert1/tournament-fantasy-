import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Read user + token synchronously so components never see a null-then-populated flash.
  // Also sets the Authorization header before any child effects can fire API calls.
  const [user, setUser] = useState(() => {
    try {
      const token = localStorage.getItem('token');
      const saved = localStorage.getItem('user');
      if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    if (!savedToken) return;
    // Refresh user data (including role) from server in the background
    api.get('/auth/me').then(res => {
      const fresh = res.data.user;
      setUser(fresh);
      localStorage.setItem('user', JSON.stringify(fresh));
    }).catch(() => {});
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: t, user: u } = res.data;
    setToken(t);
    setUser(u);
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    api.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    return u;
  };

  const register = async (email, username, password, compliance = {}) => {
    const res = await api.post('/auth/register', { email, username, password, ...compliance });
    const { token: t, user: u } = res.data;
    setToken(t);
    setUser(u);
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    api.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    return u;
  };

  const updateUser = (updates) => {
    setUser(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
