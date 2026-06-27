import React, { useState, useEffect } from 'react';

/**
 * PlanningModal handles creating a new plan hour slot or editing an existing plan.
 * Fields: Hour, AM/PM, Planning text.
 */
export default function PlanningModal({ isOpen, onClose, onSave, report }) {
  const [hour, setHour] = useState(8);
  const [ampm, setAmpm] = useState('AM');
  const [plan, setPlan] = useState('');

  useEffect(() => {
    if (report) {
      setHour(report.hour);
      setAmpm(report.ampm);
      setPlan(report.plan || '');
    } else {
      // Default to current time hour rounded or standard 8 AM
      const now = new Date();
      let h = now.getHours();
      const a = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      setHour(h);
      setAmpm(a);
      setPlan('');
    }
  }, [report, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      hour: parseInt(hour, 10),
      ampm,
      plan
    });
  };

  return (
    <>
      {/* Semi-transparent Backdrop overlay */}
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
            
            {/* Header colored with WhatsApp teal */}
            <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
              <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                <i className="bi bi-compass-fill"></i>
                {report ? 'Edit Hourly Plan' : 'New Hourly Plan'}
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
                
                {/* Hour and AM/PM Pickers */}
                <div className="row g-3 mb-3">
                  <div className="col-6">
                    <label className="form-label fw-bold text-secondary small">Hour</label>
                    <select 
                      className="form-select border-0 py-2.5 shadow-sm rounded-3"
                      value={hour}
                      onChange={(e) => setHour(e.target.value)}
                      disabled={!!report} // Cannot change time for existing slot to prevent overlapping
                      style={{ fontSize: '0.95rem' }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="col-6">
                    <label className="form-label fw-bold text-secondary small">AM/PM</label>
                    <select 
                      className="form-select border-0 py-2.5 shadow-sm rounded-3"
                      value={ampm}
                      onChange={(e) => setAmpm(e.target.value)}
                      disabled={!!report} // Cannot change time for existing slot
                      style={{ fontSize: '0.95rem' }}
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>

                {/* Plan Textarea */}
                <div className="mb-2">
                  <label className="form-label fw-bold text-secondary small">Planning (Bengali Expected)</label>
                  <textarea 
                    className="form-control border-0 py-2.5 shadow-sm rounded-3"
                    rows="4"
                    placeholder="আজকে কী করবেন? (যেমন: আজকে Firebase CRUD শেষ করবো)"
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    required
                    autoFocus
                    style={{ resize: 'none', fontSize: '0.95rem' }}
                  ></textarea>
                  <div className="form-text text-muted" style={{ fontSize: '0.75rem' }}>
                    Describe your tasks or objectives for this hour slot.
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
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
                  style={{ backgroundColor: '#25D366' }}
                >
                  <i className="bi bi-save-fill me-1"></i>Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
