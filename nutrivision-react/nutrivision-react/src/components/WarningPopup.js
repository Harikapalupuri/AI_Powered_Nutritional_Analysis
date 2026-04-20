import React from 'react';

export default function WarningPopup({ message, onProceed, onCancel }) {
  if (!message) return null;
  return (
    <div className="warning-overlay">
      <div className="warning-box">
        <div className="warning-icon">⚠️</div>
        <h2 className="warning-title">Health Alert</h2>
        <p className="warning-msg">{message}</p>
        <div className="warning-actions">
          <button className="btn btn--warn btn--full" style={{ marginTop: 0 }} onClick={onProceed}>
            I Understand — Show Results
          </button>
          <button className="btn btn--outline" onClick={onCancel}>Go Back</button>
        </div>
      </div>
    </div>
  );
}
