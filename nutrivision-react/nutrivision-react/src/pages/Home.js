import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Reveal from '../components/Reveal';
import Footer from '../components/Footer';

/* ── Counter animation ── */
function Counter({ to }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        io.unobserve(el);
        const duration = 1200;
        const start = performance.now();
        const update = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.floor(ease * to);
          if (progress < 1) requestAnimationFrame(update);
          else el.textContent = to;
        };
        requestAnimationFrame(update);
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <b ref={ref} className="counter">0</b>;
}

export default function Home() {
  const navigate = useNavigate();

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="hero__bg">
          <div className="orb orb--a" />
          <div className="orb orb--b" />
          <div className="orb orb--c" />
          <div className="grid-bg" />
        </div>
        <div className="hero__body container">
          <div className="hero__left">
            <Reveal>
              <div className="hero__badge">
                <span className="pulse-dot" /> 3 Vision Models &nbsp;·&nbsp; OpenRouter LLM
              </div>
            </Reveal>
            <Reveal delay="d1">
              <h1 className="hero__title">
                Snap a Photo.<br /><em>Know Your Food.</em>
              </h1>
            </Reveal>
            <Reveal delay="d2">
              <p className="hero__desc">
                Upload any food image. Get instant AI-powered nutrition insights, personalized health tips &amp; smart alternatives — all in under 30 seconds. 🚀
              </p>
            </Reveal>
            <Reveal delay="d3">
              <div className="hero__btns">
                <button className="btn btn--primary" onClick={() => navigate('/analyzer')}>🍽️ Try Free Now &nbsp;→</button>
                <button className="btn btn--outline" onClick={() => navigate('/about')}>👥 Meet the Team</button>
              </div>
            </Reveal>
            <Reveal delay="d4">
              <div className="hero__stats">
                <div className="hstat"><Counter to={185} /><sup>+</sup><span>Food Classes</span></div>
                <div className="hstat-sep" />
                <div className="hstat"><Counter to={3} /><span>AI Models</span></div>
                <div className="hstat-sep" />
                <div className="hstat"><Counter to={99} /><sup>%</sup><span>Accuracy</span></div>
              </div>
            </Reveal>
          </div>
          <div className="hero__right">
            <Reveal delay="d2">
              <div className="orbit-wrap">
                <div className="orbit-core">🧠</div>
                <div className="orbit orbit--1">
                  <span className="orb-food" style={{ '--a': '0deg' }}>🍛</span>
                  <span className="orb-food" style={{ '--a': '120deg' }}>🍕</span>
                  <span className="orb-food" style={{ '--a': '240deg' }}>🥗</span>
                </div>
                <div className="orbit orbit--2">
                  <span className="orb-food" style={{ '--a': '45deg' }}>🥟</span>
                  <span className="orb-food" style={{ '--a': '135deg' }}>🍜</span>
                  <span className="orb-food" style={{ '--a': '225deg' }}>🍱</span>
                  <span className="orb-food" style={{ '--a': '315deg' }}>🍩</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee-outer">
        <div className="marquee-inner">
          <div className="marquee-track">
            {['🍛 Biryani','🍕 Pizza','🥗 Salad','🥟 Momos','🧇 Dosa','🍜 Noodles','🧆 Samosa','🍱 Sushi','🥙 Wrap','🍮 Gulab Jamun','🍔 Burger','🥘 Dal Makhani',
              '🍛 Biryani','🍕 Pizza','🥗 Salad','🥟 Momos','🧇 Dosa','🍜 Noodles','🧆 Samosa','🍱 Sushi','🥙 Wrap','🍮 Gulab Jamun','🍔 Burger','🥘 Dal Makhani'].map((item, i) => (
              <span key={i}>{item}</span>
            ))}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <Reveal><span className="tag">Simple Process</span></Reveal>
            <Reveal delay="d1"><h2>How It Works</h2></Reveal>
          </div>
          <div className="how-grid">
            <Reveal delay="d1">
              <div className="how-card">
                <div className="how-num">01</div>
                <div className="how-icon">📸</div>
                <h3>Upload Image</h3>
                <p>Drag-and-drop or click to upload any food photo. PNG, JPG, WebP supported.</p>
              </div>
            </Reveal>
            <Reveal delay="d2"><div className="how-arrow">→</div></Reveal>
            <Reveal delay="d2">
              <div className="how-card">
                <div className="how-num">02</div>
                <div className="how-icon">🤖</div>
                <h3>AI Detection</h3>
                <p>Three models run in parallel. If the custom head names a dish only it knows (not in Food-101 or Indian-34), that wins when confident; otherwise Food-101-only classes, then two-head agreement, then fallbacks.</p>
              </div>
            </Reveal>
            <Reveal delay="d3"><div className="how-arrow">→</div></Reveal>
            <Reveal delay="d3">
              <div className="how-card">
                <div className="how-num">03</div>
                <div className="how-icon">📊</div>
                <h3>Get Your Report</h3>
                <p>Full nutrition, health benefits, portion advice &amp; smart alternatives — personalized to you.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section bg-card">
        <div className="container">
          <div className="section-head">
            <Reveal><span className="tag">Why NutriVision</span></Reveal>
            <Reveal delay="d1"><h2>Built Different 🔥</h2></Reveal>
          </div>
          <div className="feat-grid">
            <Reveal delay="d1">
              <div className="feat-card feat-card--big">
                <div className="feat-icon">🎯</div>
                <h3>Triple-Model Ensemble</h3>
                <p>Food-101 (101) + Indian-Western-34 (34) + custom 166-class model. Fusion uses each model’s label lists in food_constants — custom-exclusive and Food-101-only routes before raw confidence.</p>
                <div className="feat-tags"><span>Food-101</span><span>Indian-34</span><span>Custom-166</span></div>
              </div>
            </Reveal>
            <Reveal delay="d2"><div className="feat-card"><div className="feat-icon">🧠</div><h3>LLM Nutrition Reports</h3><p>Llama 3.1 8B via OpenRouter generates clinically-informed, personalised nutrition data.</p></div></Reveal>
            <Reveal delay="d3"><div className="feat-card"><div className="feat-icon">💊</div><h3>Health-Aware Advice</h3><p>Customised for Diabetes, Obesity, PCOD, Hypertension, Heart Disease and more.</p></div></Reveal>
            <Reveal delay="d4"><div className="feat-card"><div className="feat-icon">🛒</div><h3>Buy Healthier Now</h3><p>Direct links on BigBasket, Amazon, Flipkart &amp; Blinkit for healthier alternatives.</p></div></Reveal>
            <Reveal delay="d5"><div className="feat-card"><div className="feat-icon">⚡</div><h3>GPU Accelerated</h3><p>Vision models run on CUDA T4 GPU. OpenRouter handles the LLM — zero GPU overload.</p></div></Reveal>
          </div>
        </div>
      </section>

      {/* MODEL CARDS */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <Reveal><span className="tag">Technical Stack</span></Reveal>
            <Reveal delay="d1"><h2>The AI Behind It 🤖</h2></Reveal>
          </div>
          <div className="model-grid">
            <Reveal delay="d1">
              <div className="model-card">
                <span className="model-badge">Model 1</span>
                <div className="model-icon">👁️</div>
                <h4>nateraw / food</h4>
                <p>Food-101 dataset — 101 international food categories.</p>
                <div className="model-pill">101 classes</div>
              </div>
            </Reveal>
            <Reveal delay="d2">
              <div className="model-card">
                <span className="model-badge">Model 2</span>
                <div className="model-icon">🍛</div>
                <h4>Indian-Western-34</h4>
                <p>Samosas, Dosas, Burgers, Pizzas and 30 more popular dishes.</p>
                <div className="model-pill">34 classes</div>
              </div>
            </Reveal>
            <Reveal delay="d3">
              <div className="model-card model-card--gold">
                <span className="model-badge model-badge--gold">✨ Our Model</span>
                <div className="model-icon">🎓</div>
                <h4>Custom Fine-Tuned</h4>
                <p>Trained in-house on rare Indian regional specialties — Ghevar, Adhirasam, Ariselu, Rasgulla and 76 more.</p>
                <div className="model-pill">80 classes</div>
              </div>
            </Reveal>
            <Reveal delay="d4">
              <div className="model-card">
                <span className="model-badge">LLM</span>
                <div className="model-icon">💬</div>
                <h4>Llama 3.1 8B</h4>
                <p>Via OpenRouter — accurate nutritional facts and personalised health insights.</p>
                <div className="model-pill">OpenRouter</div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <Reveal>
            <div className="cta-block">
              <div className="cta-glow" />
              <h2>Ready to eat smarter? 🎯</h2>
              <p>Upload your food photo and get a full personalised report instantly.</p>
              <button className="btn btn--primary btn--lg" onClick={() => navigate('/analyzer')}>Start Analyzing — It's Free →</button>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  );
}
