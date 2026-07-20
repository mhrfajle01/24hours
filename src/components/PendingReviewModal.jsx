import React, { useState, useEffect } from 'react';
import { getIntervalTimes, formatTime12h } from '../utils/helpers';

/**
 * PendingReviewModal displays a list of past pending time blocks.
 * Allows quick batch updating of status (Completed, Missed, Pending).
 */
export default function PendingReviewModal({ isOpen, onClose, pendingReports, onSave, awayDuration }) {
  // Local state to keep track of changed statuses before saving
  const [updatedStatuses, setUpdatedStatuses] = useState({});

  useEffect(() => {
    if (isOpen && pendingReports.length > 0) {
      const initial = {};
      pendingReports.forEach((r) => {
        initial[r.id] = r.status || 'Pending';
      });
      setUpdatedStatuses(initial);
    }
  }, [isOpen, pendingReports]);

  if (!isOpen || pendingReports.length === 0) return null;

  const handleStatusChange = (id, newStatus) => {
    setUpdatedStatuses((prev) => ({
      ...prev,
      [id]: newStatus,
    }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    // Gather all changed reports
    const updates = pendingReports.map((r) => ({
      id: r.id,
      status: updatedStatuses[r.id] || r.status,
    }));
    await onSave(updates);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1050 }} onClick={onClose}></div>

      {/* Modal Dialog */}
      <div
        className="modal fade show d-block animate-slide-up"
        style={{ zIndex: 1060 }}
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden" style={{ background: '#F0F2F5' }}>
            
            {/* Header */}
            <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
              <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                <i className="bi bi-clock-history"></i>
                Review Past Time Blocks
              </h5>
              <button
                type="button"
                className="btn-close btn-close-white shadow-none"
                onClick={onClose}
                aria-label="Close"
              ></button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="modal-body p-4 overflow-auto" style={{ maxHeight: '60vh' }}>

                {/* Session Info Banner */}
                {awayDuration && awayDuration.label ? (
                  <div
                    className="d-flex align-items-center gap-3 p-3 rounded-3 mb-4 border"
                    style={{ backgroundColor: '#FFFBEA', borderColor: '#FFC107' }}
                  >
                    <div
                      className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: '40px', height: '40px', backgroundColor: '#FFC107' }}
                    >
                      <i className="bi bi-clock-history text-white fs-5"></i>
                    </div>
                    <div>
                      <div className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>
                        You were away for <span style={{ color: '#075E54' }}>{awayDuration.label}</span>
                        {awayDuration.lastSeenTime && (
                          <span className="text-muted fw-normal"> (since {awayDuration.lastSeenTime})</span>
                        )}
                      </div>
                      <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                        {pendingReports.length} block{pendingReports.length !== 1 ? 's' : ''} from earlier today need your review.
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-secondary small mb-4">
                    You have <strong>{pendingReports.length}</strong> time block{pendingReports.length !== 1 ? 's' : ''} from earlier today that are still marked as <em>Pending</em>. Please update their statuses below.
                  </p>
                )}

                <div className="d-flex flex-column gap-3">
                  {pendingReports.map((report) => {
                    const times = getIntervalTimes(report);
                    const timeStr = `${formatTime12h(times.startTime)} - ${formatTime12h(times.endTime)}`;
                    const currentStatus = updatedStatuses[report.id] || 'Pending';

                    return (
                      <div
                        key={report.id}
                        className="card border-0 shadow-sm p-3 rounded-3 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 bg-white"
                      >
                        <div className="flex-grow-1">
                          <span className="badge bg-light text-dark mb-1 fw-bold fs-xs border">
                            {timeStr}
                          </span>
                          <h6 className="fw-semibold text-dark mb-1">
                            {report.plan || <span className="text-muted italic">No planning details</span>}
                          </h6>
                          {report.report && (
                            <p className="text-secondary mb-0 small text-truncate" style={{ maxWidth: '300px' }}>
                              <i className="bi bi-chat-left-text me-1"></i>
                              {report.report}
                            </p>
                          )}
                        </div>

                        {/* Status select buttons */}
                        <div className="d-flex gap-1.5 align-self-start align-self-md-center">
                          {[
                            { name: 'Completed', color: '#25D366', icon: 'bi-check-circle-fill', textColor: 'white' },
                            { name: 'Pending', color: '#FFC107', icon: 'bi-hourglass-split', textColor: 'dark' },
                            { name: 'Missed', color: '#DC3545', icon: 'bi-x-circle-fill', textColor: 'white' }
                          ].map((item) => {
                            const isSelected = currentStatus === item.name;
                            return (
                              <button
                                key={item.name}
                                type="button"
                                className={`btn btn-sm d-flex align-items-center gap-1 px-3 py-2 rounded-pill border-0 transition-all ${
                                  isSelected ? 'fw-bold shadow-sm' : 'opacity-50 hover-opacity-100 bg-light text-secondary'
                                }`}
                                style={{
                                  backgroundColor: isSelected ? item.color : '',
                                  color: isSelected ? (item.textColor === 'white' ? '#FFFFFF' : '#212529') : '#6C757D',
                                  transition: 'transform 0.15s ease'
                                }}
                                onClick={() => handleStatusChange(report.id, item.name)}
                              >
                                <i className={`bi ${item.icon}`}></i>
                                <span className="d-none d-sm-inline" style={{ fontSize: '0.75rem' }}>{item.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Footer */}
              <div className="modal-footer border-0 bg-white py-3 px-4 d-flex justify-content-end gap-2 shadow-sm">
                <button
                  type="button"
                  className="btn btn-white border rounded-pill px-4 py-2 text-secondary shadow-sm hover-scale fw-bold"
                  onClick={onClose}
                >
                  Skip for Now
                </button>
                <button
                  type="submit"
                  className="btn text-white border-0 rounded-pill px-4 py-2 shadow-sm hover-scale fw-bold"
                  style={{ backgroundColor: '#075E54' }}
                >
                  <i className="bi bi-check2-all me-1"></i>Save All Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
