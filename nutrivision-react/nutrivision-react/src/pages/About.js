import React from 'react';
import { useNavigate } from 'react-router-dom';
import Reveal from '../components/Reveal';
import Footer from '../components/Footer';

export default function About() {
  const navigate = useNavigate();
  return (
    <>
      {/* PAGE HERO */}
      <div className="page-hero">
        <div className="orb orb--a" style={{ opacity: .4 }} />
        <div className="orb orb--c" style={{ opacity: .3 }} />
        <div className="container" style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
          <h1 className="page-title">About NutriVision</h1>
          <p className="page-sub">AI-powered food intelligence — making nutrition simple, instant, and accessible for everyone.</p>
        </div>
      </div>

      {/* MISSION */}
      <section className="section bg-card">
        <div className="container" style={{ maxWidth: 780 }}>
          <div className="section-head" style={{ marginBottom: '1.5rem' }}>
            <Reveal><span className="tag">Our Purpose</span></Reveal>
            <Reveal delay="d1"><h2>The Mission 🎯</h2></Reveal>
          </div>
          <Reveal delay="d1">
            <p className="mission-text">
              We believe that understanding what you eat should be simple, instant, and free. NutriVision combines
              state-of-the-art computer vision with the world's best open-source LLMs to make nutrition analysis as easy
              as taking a photo. Our focus on Indian food — a severely underrepresented domain in food AI — is
              what sets us apart.
            </p>
          </Reveal>
        </div>
      </section>

      {/* TECH STACK */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <Reveal><span className="tag">Under the Hood</span></Reveal>
            <Reveal delay="d1"><h2>Technology Stack 🛠️</h2></Reveal>
          </div>
          <div className="tech-grid">
            {[
              { icon: '👁️', title: 'nateraw / food', desc: 'Food-101 dataset — 101 international food categories, primary classifier.', delay: 'd1' },
              { icon: '🍛', title: 'Indian-Western-34', desc: '34 specialised Indian & Western food classes — second classifier layer.', delay: 'd2' },
              { icon: '🎓', title: 'Custom 80-Class Model', desc: 'Fine-tuned in-house on rare Indian regional dishes. Covers Adhirasam, Ghevar, Ariselu & 77 more.', delay: 'd3', gold: true },
              { icon: '🤖', title: 'Llama 3.1 8B', desc: 'Via OpenRouter — fast, accurate nutrition data and personalised health insights.', delay: 'd4' },
              { icon: '⚡', title: 'Flask + GPU', desc: 'Python Flask backend running on CUDA T4 GPU for fast vision inference.', delay: 'd5' },
              { icon: '🎨', title: 'Modern Frontend', desc: 'Responsive, animated UI with CSS animations, Syne font, and light wellness theme.', delay: 'd6' },
            ].map((c, i) => (
              <Reveal key={i} delay={c.delay}>
                <div className={`tech-card${c.gold ? ' tech-card--gold' : ''}`}>
                  <div className="tech-icon">{c.icon}</div>
                  <h4>{c.title}</h4>
                  <p>{c.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT MAKES US DIFF */}
      <section className="section bg-card">
        <div className="container">
          <div className="section-head">
            <Reveal><span className="tag">Differentiators</span></Reveal>
            <Reveal delay="d1"><h2>What Makes Us Different ✨</h2></Reveal>
          </div>
          <div className="diff-grid">
            {[
              { num: '01', title: 'Indian Food Focus', desc: 'Covers 80+ regional Indian specialties that most food AI completely misses — from Rasmalai to Pootharekulu.', delay: 'd1' },
              { num: '02', title: '3-Model Ensemble', desc: 'Three classifiers run in parallel. Labels are chosen using class lists: strong custom-exclusive predictions win first, then Food-101-only classes, then agreement between the first two models, then fallbacks.', delay: 'd2' },
              { num: '03', title: 'Personalised Reports', desc: 'Every report is tailored to your age, gender, BMI, dietary preference, and health condition.', delay: 'd3' },
              { num: '04', title: 'No GPU Overload', desc: 'Vision models run on GPU; LLM is handled by OpenRouter cloud — balanced resource usage on T4.', delay: 'd4' },
            ].map((d, i) => (
              <Reveal key={i} delay={d.delay}>
                <div className="diff-item">
                  <span className="diff-num">{d.num}</span>
                  <div>
                    <h3>{d.title}</h3>
                    <p>{d.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <Reveal>
            <div className="cta-block">
              <div className="cta-glow" />
              <h2>Ready to Try NutriVision? 🚀</h2>
              <p>Experience the future of AI food analysis — free, fast, personalised.</p>
              <button className="btn btn--primary btn--lg" onClick={() => navigate('/analyzer')}>Start Analyzing Now →</button>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  );
}
