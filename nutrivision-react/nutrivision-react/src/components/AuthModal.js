// src/components/AuthModal.js
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({ onClose }) {
  const { login, register } = useAuth();
  const [mode, setMode]     = useState('login'); // 'login' | 'register'
  const [form, setForm]     = useState({ username: '', email: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        if (!form.username.trim()) { setError('Username is required'); setLoading(false); return; }
        await register(form.username, form.email, form.password);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="auth-box">
        <button className="auth-close" onClick={onClose}>✕</button>
        <div className="auth-logo">
          <span className="logo-icon">🥗</span>
          <span className="logo-text">NutriVision</span>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab${mode === 'login' ? ' active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>Sign In</button>
          <button className={`auth-tab${mode === 'register' ? ' active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>Create Account</button>
        </div>

        <div className="auth-form">
          {mode === 'register' && (
            <div className="auth-field">
              <label>Username</label>
              <input type="text" placeholder="e.g. tarun_k" value={form.username} onChange={set('username')} autoComplete="username" />
            </div>
          )}
          <div className="auth-field">
            <label>Email</label>
            <input type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} autoComplete="email" />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input
              type="password"
              placeholder={mode === 'register' ? 'At least 6 characters' : 'Your password'}
              value={form.password}
              onChange={set('password')}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {error && <div className="auth-error">⚠️ {error}</div>}

          <button className="btn btn--primary btn--full" style={{ marginTop: '1.25rem' }} onClick={handleSubmit} disabled={loading}>
            {loading
              ? <span className="btn-spinner" />
              : mode === 'login' ? '🔐 Sign In' : '🚀 Create Account'
            }
          </button>
        </div>

        <p className="auth-note">
          {mode === 'login'
            ? <>No account? <button className="auth-switch" onClick={() => { setMode('register'); setError(''); }}>Sign up free</button></>
            : <>Already have an account? <button className="auth-switch" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></>
          }
        </p>
      </div>
    </div>
  );
}