// src/components/Navbar.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar({ onAuthClick }) {
  const [scrolled, setScrolled]   = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const [userMenu, setUserMenu]   = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuth();
  const userMenuRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location]);

  // Close user dropdown on outside click
  useEffect(() => {
    const handle = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const go = (path) => { navigate(path); setMenuOpen(false); setUserMenu(false); };
  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await logout();
    setUserMenu(false);
    navigate('/');
  };

  return (
    <>
      <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`} id="navbar">
        <div className="nav__inner">
          <div className="nav__logo" onClick={() => go('/')}>
            <span className="logo-icon">🥗</span>
            <span className="logo-text">NutriVision</span>
          </div>

          <ul className="nav__links">
            <li><button className={`nav__link${isActive('/') ? ' nav__link--active' : ''}`} onClick={() => go('/')}>Home</button></li>
            <li><button className={`nav__link${isActive('/analyzer') ? ' nav__link--active' : ''}`} onClick={() => go('/analyzer')}>Analyzer</button></li>
            <li><button className={`nav__link${isActive('/about') ? ' nav__link--active' : ''}`} onClick={() => go('/about')}>About</button></li>
          </ul>

          {/* Auth area */}
          {user ? (
            <div className="nav-user" ref={userMenuRef}>
              <button className="nav-user-btn" onClick={() => setUserMenu(u => !u)}>
                <span className="nav-user-avatar">{user.username[0].toUpperCase()}</span>
                <span className="nav-user-name">{user.username}</span>
                <span className="nav-user-caret">▾</span>
              </button>
              {userMenu && (
                <div className="nav-user-dropdown">
                  <div className="nav-user-info">
                    <span className="nav-user-avatar nav-user-avatar--lg">{user.username[0].toUpperCase()}</span>
                    <span>{user.username}</span>
                  </div>
                  <button className="nav-user-item" onClick={() => go('/analyzer')}>🔬 Analyzer</button>
                  <button className="nav-user-item nav-user-item--danger" onClick={handleLogout}>🚪 Sign Out</button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', marginLeft: '1rem' }}>
              <button className="btn btn--ghost-sm" onClick={onAuthClick}>Sign In</button>
              <button className="btn btn--sm btn--primary nav__cta" onClick={() => go('/analyzer')}>Analyze Food →</button>
            </div>
          )}

          <button className={`hamburger${menuOpen ? ' open' : ''}`} id="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
            <span /><span /><span />
          </button>
        </div>
      </nav>

      <div className={`mobile-menu${menuOpen ? ' open' : ''}`} id="mobileMenu">
        <button className="mobile-link" onClick={() => go('/')}>Home</button>
        <button className="mobile-link" onClick={() => go('/analyzer')}>Analyzer</button>
        <button className="mobile-link" onClick={() => go('/about')}>About</button>
        {user ? (
          <>
            <div className="mobile-link" style={{ color: 'var(--muted)', fontSize: '.8rem' }}>Signed in as {user.username}</div>
            <button className="mobile-link" style={{ color: '#f47171' }} onClick={handleLogout}>🚪 Sign Out</button>
          </>
        ) : (
          <button className="mobile-link highlight" onClick={() => { setMenuOpen(false); onAuthClick?.(); }}>🔐 Sign In / Register</button>
        )}
        <button className="mobile-link highlight" onClick={() => go('/analyzer')}>🍽️ Analyze Now</button>
      </div>
    </>
  );
}