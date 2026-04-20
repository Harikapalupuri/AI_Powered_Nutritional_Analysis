// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // { username, user_id, email }
  const [token, setToken]     = useState(() => localStorage.getItem('nv_token') || null);
  const [authReady, setAuthReady] = useState(false);

  // Verify token on mount
  useEffect(() => {
    if (!token) { setAuthReady(true); return; }
    fetch('/api/auth/me', { headers: { 'X-Auth-Token': token } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.username) setUser(data);
        else { localStorage.removeItem('nv_token'); setToken(null); }
      })
      .catch(() => { localStorage.removeItem('nv_token'); setToken(null); })
      .finally(() => setAuthReady(true));
  }, []); // eslint-disable-line

  const login = useCallback(async (email, password) => {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('nv_token', data.token);
    setToken(data.token);
    setUser({ username: data.username, user_id: data.user_id });
    return data;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    localStorage.setItem('nv_token', data.token);
    setToken(data.token);
    setUser({ username: data.username, user_id: data.user_id });
    return data;
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-Auth-Token': token },
      }).catch(() => {});
    }
    localStorage.removeItem('nv_token');
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, authReady, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}