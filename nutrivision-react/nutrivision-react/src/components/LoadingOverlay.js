import React from 'react';

export default function LoadingOverlay({ active, step }) {
  return (
    <div className={`loading-overlay${active ? ' active' : ''}`}>
      <div className="loading-box">
        <div className="loading-spinner" />
        <h3>🧠 AI is Analyzing…</h3>
        <p>Running 3 vision models…</p>
        <div className="loading-steps">
          {[
            { id: 1, text: '🔍 Detecting food with 3 models' },
            { id: 2, text: '📊 Generating nutrition report' },
            { id: 3, text: '💡 Personalizing insights' },
            { id: 4, text: '✅ Finalizing results' },
          ].map(s => (
            <div key={s.id} className={`lstep${step >= s.id ? ' active' : ''}`}>{s.text}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
