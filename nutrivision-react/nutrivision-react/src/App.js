// src/App.js
import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar    from './components/Navbar';
import AuthModal from './components/AuthModal';
import NutriBot  from './components/NutriBot';
import Home      from './pages/Home';
import Analyzer  from './pages/Analyzer';
import About     from './pages/About';

function AppInner() {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <>
      <Navbar onAuthClick={() => setShowAuth(true)} />

      <Routes>
        <Route path="/"         element={<Home />} />
        <Route path="/analyzer" element={<Analyzer />} />
        <Route path="/about"    element={<About />} />
      </Routes>

      {/* Auth Modal — global, shown from anywhere */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* NutriBot — global, fixed bottom-left on all pages */}
      <NutriBot onNeedLogin={() => setShowAuth(true)} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}