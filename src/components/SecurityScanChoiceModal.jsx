import React from 'react';

export default function SecurityScanChoiceModal({ onHourly, onStreaks, onBoth, onClose }) {
  return (
    <div className="security-choice-backdrop position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3">
      <div className="bg-white rounded-4 shadow-lg p-4 w-100" style={{ maxWidth: 420 }}>
        <h5 className="fw-bold text-dark mb-2"><i className="bi bi-shield-check text-success me-2" />Security Scan</h5>
        <p className="text-secondary small mb-3">Choose what you want to check.</p>
        <div className="d-grid gap-2">
          <button className="btn btn-outline-success rounded-3 text-start fw-semibold" onClick={onHourly}>
            <i className="bi bi-clock-history me-2" />Hourly Time Blocks
          </button>
          <button className="btn btn-outline-warning rounded-3 text-start fw-semibold" onClick={onStreaks}>
            <i className="bi bi-fire me-2" />Streak Progress
          </button>
          <button className="btn btn-success rounded-3 text-start fw-semibold" onClick={onBoth}>
            <i className="bi bi-shield-check me-2" />Scan Both
          </button>
          <button className="btn btn-link text-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
