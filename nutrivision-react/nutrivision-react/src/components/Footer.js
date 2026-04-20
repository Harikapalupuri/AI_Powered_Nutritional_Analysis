import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Footer({ minimal = false }) {
  const navigate = useNavigate();
  if (minimal) {
    return (
      <footer className="footer" style={{ marginTop: 'auto' }}>
        <div className="container">
          <div className="footer-bottom" style={{ border: 'none', padding: '1.5rem 0' }}>
            <p>© 2026 NutriVision — Built with ❤️ by Harika &amp; Deepika &amp; Nageswari</p>
          </div>
        </div>
      </footer>
    );
  }
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="nav__logo" style={{ marginBottom: '.75rem', cursor: 'pointer' }} onClick={() => navigate('/')}>
              <span className="logo-icon">🥗</span>
              <span className="logo-text">NutriVision</span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>AI food intelligence at your fingertips.<br />Made with ❤️ in India.</p>
          </div>
          <div className="footer-links">
            <h5>Navigate</h5>
            <a href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>Home</a>
            <a href="/analyzer" onClick={e => { e.preventDefault(); navigate('/analyzer'); }}>Analyzer</a>
            <a href="/about" onClick={e => { e.preventDefault(); navigate('/about'); }}>About</a>
          </div>
          <div className="footer-links">
            <h5>Contact</h5>
            <span>📧 info@nutrivision.ai</span>
            <span>🌐 Made in India 🇮🇳</span>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 NutriVision — AI Nutritional Analysis &amp; Diet Recommendation</p>
          <p>⚠️ For informational purposes only. Not a substitute for medical advice.</p>
        </div>
      </div>
    </footer>
  );
}
