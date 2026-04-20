import React from 'react';

const NUTRI_MAP = [
  { key: 'calories',      label: 'Calories', emoji: '🔥' },
  { key: 'protein',       label: 'Protein',  emoji: '💪' },
  { key: 'carbohydrates', label: 'Carbs',    emoji: '🌾' },
  { key: 'fat',           label: 'Fat',      emoji: '🥑' },
  { key: 'fiber',         label: 'Fiber',    emoji: '🌿' },
  { key: 'sugar',         label: 'Sugar',    emoji: '🍬' },
  { key: 'sodium',        label: 'Sodium',   emoji: '🧂' },
  { key: 'serving_size',  label: 'Serving',  emoji: '🥣' },
];

function bmiColor(cat = '') {
  const c = cat.toLowerCase();
  if (c.includes('obese'))       return '#f47171';
  if (c.includes('overweight'))  return '#f5c842';
  if (c.includes('under'))       return '#60a5fa';
  return 'var(--blue)';
}

export default function ResultsPanel({ data, onReset }) {
  if (!data) return null;
  const nutr = data.nutrition || {};

  return (
    <div className="results-panel" id="resultsPanel">
      {/* Banner */}
      <div className="result-banner">
        <div className="result-banner__icon">🍽️</div>
        <div className="result-banner__info">
          <span className="result-banner__label">Detected Food</span>
          <h2>{data.food || 'Unknown Food'}</h2>
          <div className="result-banner__meta">
            <span className="confidence-chip">🎯 {data.confidence || '—'}</span>
            <span className="source-chip">🤖 {data.detection_source || '—'}</span>
          </div>
        </div>
      </div>

      {/* BMI */}
      {data.bmi && (
        <div className="bmi-strip">
          <div className="bmi-item">
            <span className="bmi-label">📏 Your BMI</span>
            <span className="bmi-val" style={{ color: bmiColor(data.bmi_category) }}>{data.bmi}</span>
          </div>
          <div className="bmi-sep" />
          <div className="bmi-item">
            <span className="bmi-label">Category</span>
            <span className="bmi-cat">{data.bmi_category || '—'}</span>
          </div>
        </div>
      )}

      {/* Nutrition */}
      <div className="result-card">
        <h3 className="result-card__title">📊 Nutritional Breakdown</h3>
        <div className="nutrition-grid">
          {NUTRI_MAP.map(item => {
            const val = nutr[item.key];
            if (!val) return null;
            return (
              <div key={item.key} className="nutri-item">
                <div className="nutri-val">{item.emoji} {val}</div>
                <div className="nutri-label">{item.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Health Benefits */}
      {(data.health_benefits || []).length > 0 && (
        <div className="result-card">
          <h3 className="result-card__title">🌿 Health Benefits</h3>
          <ul className="benefits-list">
            {data.health_benefits.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}

      {/* Portion */}
      <div className="result-card result-card--amber">
        <h3 className="result-card__title">🥄 Recommended Portion Size</h3>
        <p className="portion-text">{data.portion_advice || '1 standard serving'}</p>
      </div>

      {/* Health Context */}
      {data.health_context && (
        <div className="result-card result-card--pink">
          <h3 className="result-card__title">💡 Why This Matters For You</h3>
          <p>{data.health_context}</p>
        </div>
      )}

      {/* Alternatives */}
      {(data.alternatives || []).length > 0 && (
        <div className="result-card result-card--teal">
          <h3 className="result-card__title">🔄 Healthier Alternatives</h3>
          <p className="alt-intro">Based on your health profile, consider these alternatives:</p>
          <div className="alt-list">
            {data.alternatives.map((alt, i) => (
              <div key={i} className="alt-item">
                <div className="alt-name">✓ {alt.name}</div>
                <div className="alt-reason">{alt.reason}</div>
                {alt.urls && alt.urls.length > 0 && (
                  <div className="alt-buy">
                    <span className="buy-label">🛒 Buy from:</span>
                    {alt.urls.map((u, j) => (
                      <a key={j} href={u.url} target="_blank" rel="noopener noreferrer" className="buy-link">
                        {u.emoji} {u.platform}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="result-actions">
        <button className="btn btn--outline" onClick={onReset}>🔄 Analyze Another Food</button>
        <button className="btn btn--ghost-sm" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ Back to Top</button>
      </div>
    </div>
  );
}
