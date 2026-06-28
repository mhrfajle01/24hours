import React, { useState, useEffect } from 'react';
import { formatHourString } from '../utils/helpers';
import SuggestionHelper from './SuggestionHelper';

/**
 * ReportModal handles updating the progress report and progress status for a slot.
 * Fields: Report text, Status (Completed, Pending, Missed).
 */
export default function ReportModal({ isOpen, onClose, onSave, report, dictionaryData }) {
  const [reportText, setReportText] = useState('');
  const [status, setStatus] = useState('Pending');

  useEffect(() => {
    if (report) {
      setReportText(report.report || '');
      setStatus(report.status || 'Pending');
    }
  }, [report, isOpen]);

  if (!isOpen || !report) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      report: reportText,
      status
    });
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
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
            
            {/* Header */}
            <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
              <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                <i className="bi bi-journal-check"></i>
                Report Hour: {formatHourString(report.hour, report.ampm)}
              </h5>
              <button 
                type="button" 
                className="btn-close btn-close-white shadow-none" 
                onClick={onClose}
                aria-label="Close"
              ></button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body p-4 bg-light">
                
                {/* Custom Status Radio Grid */}
                <div className="mb-4">
                  <label className="form-label fw-bold text-secondary small mb-2">Select Hourly Status</label>
                  <div className="d-flex gap-2">
                    {[
                      { name: 'Completed', color: '#25D366', icon: 'bi-check-circle-fill', textColor: 'white' },
                      { name: 'Pending', color: '#FFC107', icon: 'bi-hourglass-split', textColor: 'dark' },
                      { name: 'Missed', color: '#DC3545', icon: 'bi-x-circle-fill', textColor: 'white' }
                    ].map((item) => {
                      const isSelected = status === item.name;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          className={`btn flex-fill d-flex flex-column align-items-center justify-content-center py-2.5 rounded-3 border-0 transition-all shadow-sm ${
                            isSelected ? 'hover-scale fw-bold border-0' : 'opacity-60 bg-white border text-secondary'
                          }`}
                          style={{
                            backgroundColor: isSelected ? item.color : '#FFFFFF',
                            color: isSelected ? (item.textColor === 'white' ? '#FFFFFF' : '#212529') : '#6C757D',
                            boxShadow: isSelected ? '0 4px 10px rgba(0,0,0,0.1)' : 'none',
                          }}
                          onClick={() => setStatus(item.name)}
                        >
                          <i className={`bi ${item.icon} mb-1 fs-5`}></i>
                          <span style={{ fontSize: '0.8rem' }}>{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Report Text */}
                <div className="mb-2">
                  <label className="form-label fw-bold text-secondary small">Report details (Bengali Expected)</label>
                  <textarea 
                    className="form-control border-0 py-2.5 shadow-sm rounded-3"
                    rows="4"
                    placeholder="কী সম্পন্ন হয়েছে? (যেমন: CRUD সম্পন্ন হয়েছে কিন্তু Delete Function বাকি)"
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    autoFocus
                    style={{ resize: 'none', fontSize: '0.95rem' }}
                  ></textarea>
                  <div className="form-text text-muted mb-2" style={{ fontSize: '0.75rem' }}>
                    Provide an update on what tasks were accomplished during this hour.
                  </div>

                  {/* Suggestion Helper */}
                  <SuggestionHelper 
                    type="report" 
                    status={status}
                    currentInputText={reportText}
                    dictionaryData={dictionaryData}
                    onApply={(s) => setReportText(prev => {
                      const trimmed = prev.trim();
                      const words = trimmed.split(/\s+/).filter(Boolean);
                      if (words.length <= 1) return s;
                      const rest = trimmed.substring(words[0].length).trim();
                      return s + ' ' + rest;
                    })}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4 d-flex justify-content-end gap-2">
                <button 
                  type="button" 
                  className="btn btn-white border rounded-pill px-4 py-2 text-secondary shadow-sm hover-scale fw-bold" 
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn text-white border-0 rounded-pill px-4 py-2 shadow-sm hover-scale fw-bold"
                  style={{ backgroundColor: '#075E54' }}
                >
                  <i className="bi bi-save2-fill me-1"></i>Save Report
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
