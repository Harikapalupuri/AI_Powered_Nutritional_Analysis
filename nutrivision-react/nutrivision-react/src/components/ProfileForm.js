import React from 'react';

export default function ProfileForm({ profile, onChange }) {
  const set = (key) => (e) => onChange({ ...profile, [key]: e.target.value });

  return (
    <div className="profile-block">
      <h3 className="block-title">👤 Your Health Profile</h3>
      <div className="form-grid">
        <div className="field">
          <label>Age</label>
          <input type="number" value={profile.age} onChange={set('age')} min="1" max="120" />
        </div>
        <div className="field">
          <label>Gender</label>
          <select value={profile.gender} onChange={set('gender')}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="field">
          <label>Height (cm)</label>
          <input type="number" value={profile.height} onChange={set('height')} min="100" max="250" step="0.1" />
        </div>
        <div className="field">
          <label>Weight (kg)</label>
          <input type="number" value={profile.weight} onChange={set('weight')} min="30" max="300" step="0.1" />
        </div>
        <div className="field">
          <label>Dietary Preference</label>
          <select value={profile.preference} onChange={set('preference')}>
            <option value="Vegetarian">🥬 Vegetarian</option>
            <option value="Non-Vegetarian">🍗 Non-Vegetarian</option>
            <option value="Vegan">🌱 Vegan</option>
            <option value="Eggetarian">🥚 Eggetarian</option>
          </select>
        </div>
        <div className="field">
          <label>Health Condition</label>
          <select value={profile.condition} onChange={set('condition')}>
            <option value="None">None</option>
            <optgroup label="── Metabolic ──────────────">
              <option value="Diabetes">Diabetes</option>
              <option value="Obesity">Obesity</option>
              <option value="Hyperlipidemia">Hyperlipidemia (High Cholesterol)</option>
              <option value="Gout">Gout (High Uric Acid)</option>
            </optgroup>
            <optgroup label="── Cardiovascular ─────────">
              <option value="Hypertension">Hypertension (High BP)</option>
              <option value="Heart Disease">Heart Disease</option>
            </optgroup>
            <optgroup label="── Hormonal ───────────────">
              <option value="PCOD">PCOD / PCOS</option>
              <option value="Hypothyroidism">Hypothyroidism (Underactive Thyroid)</option>
              <option value="Hyperthyroidism">Hyperthyroidism (Overactive Thyroid)</option>
            </optgroup>
            <optgroup label="── Bone & Joint ───────────">
              <option value="Arthritis">Arthritis</option>
              <option value="Osteoporosis">Osteoporosis (Weak Bones)</option>
            </optgroup>
            <optgroup label="── Organ Health ───────────">
              <option value="Chronic Kidney Disease">Chronic Kidney Disease (CKD)</option>
              <option value="Liver Disease">Liver Disease</option>
              <option value="Anemia">Anemia (Iron Deficiency)</option>
            </optgroup>
            <optgroup label="── Digestive ──────────────">
              <option value="Irritable Bowel Syndrome">Irritable Bowel Syndrome (IBS)</option>
              <option value="Gastric Ulcer">Gastric / Peptic Ulcer</option>
              <option value="Celiac Disease">Celiac Disease (Gluten Intolerance)</option>
              <option value="Lactose Intolerance">Lactose Intolerance</option>
            </optgroup>
            <optgroup label="── Other ──────────────────">
              <option value="Cancer (General)">Cancer (General)</option>
            </optgroup>
          </select>
        </div>
      </div>
    </div>
  );
}
