import React from 'react';

export default function StreakSecurityScanModal({ issues, onClose }) {
  return (
    <div className="security-choice-backdrop position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3">
      <div className="bg-white rounded-4 shadow-lg p-4 w-100" style={{ maxWidth: 480 }}>
        <h5 className="fw-bold text-dark mb-2"><i className="bi bi-fire text-warning me-2" />Streak Progress Scan</h5>
        {issues.length === 0 ? (
          <p className="text-success mb-3"><i className="bi bi-check-circle-fill me-2" />No streak inconsistencies found.</p>
        ) : (
          <>
            <p className="text-secondary small">These requirements may need attention. No history was changed.</p>
            <div className="d-grid gap-2 mb-3">
              {issues.map((issue) => (
                <div key={issue} className="alert alert-warning py-2 mb-0 small">
                  <i className="bi bi-exclamation-triangle me-2" />{issue}
                </div>
              ))}
            </div>
          </>
        )}
        <button className="btn btn-success rounded-pill w-100 fw-bold" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
