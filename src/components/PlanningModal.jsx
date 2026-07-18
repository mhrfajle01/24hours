import React, { useState, useEffect, useRef } from 'react';
import SuggestionHelper from './SuggestionHelper';
import { getIntervalTimes, timeToMinutes, normalizeTimeTo24h } from '../utils/helpers';

/**
 * PlanningModal handles creating a new plan hour slot or editing an existing plan.
 * Fields: Start Time, End Time, Planning text.
 */
export default function PlanningModal({ isOpen, onClose, onSave, report, dictionaryData }) {
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:00');
  const [plan, setPlan] = useState('');
  const [validationError, setValidationError] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    setValidationError('');
    if (report) {
      const times = getIntervalTimes(report);
      setStartTime(normalizeTimeTo24h(times.startTime));
      setEndTime(normalizeTimeTo24h(times.endTime));
      setPlan(report.plan || '');
    } else {
      // Default to current time hour rounded or standard 8 AM
      const now = new Date();
      let h = now.getHours();
      const startStr = `${String(h).padStart(2, '0')}:00`;
      const endStr = `${String((h + 1) % 24).padStart(2, '0')}:00`;
      setStartTime(normalizeTimeTo24h(startStr));
      setEndTime(normalizeTimeTo24h(endStr));
      setPlan('');
    }
  }, [report, isOpen]);

  const handleInsertTemplate = (template) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value || '';

    let textToInsert = template;
    if (start > 0 && currentVal[start - 1] !== '\n') {
      textToInsert = '\n' + template;
    }

    const newVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
    setPlan(newVal);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + textToInsert.length;
      textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    }, 50);
  };

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (startTime === endTime) {
      setValidationError("Start time and End time cannot be the same / শুরুর সময় এবং শেষ সময় একই হতে পারবে না।");
      return;
    }
    const startMin = timeToMinutes(startTime);
    let endMin = timeToMinutes(endTime);
    if (endMin <= startMin) {
      endMin += 24 * 60; // Handle overnight wrap-around
    }
    const duration = endMin - startMin;
    if (duration > 18 * 60) {
      setValidationError("A single slot cannot exceed 18 hours / একটি স্লট ১৮ ঘণ্টার বেশি হতে পারবে না।");
      return;
    }
    setValidationError('');
    onSave({
      startTime,
      endTime,
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
                
                {validationError && (
                  <div className="alert alert-danger border-0 py-2 px-3 rounded-3 small mb-3 d-flex align-items-center gap-2 animate-fade-in" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
                    <i className="bi bi-exclamation-triangle-fill"></i>
                    <span>{validationError}</span>
                  </div>
                )}
                
                {/* Start Time and End Time Pickers */}
                <div className="row g-3 mb-3">
                  <div className="col-6">
                    <label className="form-label fw-bold text-secondary small">Start Time</label>
                    <input 
                      type="time"
                      className="form-control border-0 py-2.5 shadow-sm rounded-3"
                      value={startTime}
                      onChange={(e) => { setStartTime(e.target.value); setValidationError(''); }}
                      style={{ fontSize: '0.95rem' }}
                      required
                    />
                  </div>
                  
                  <div className="col-6">
                    <label className="form-label fw-bold text-secondary small">End Time</label>
                    <input 
                      type="time"
                      className="form-control border-0 py-2.5 shadow-sm rounded-3"
                      value={endTime}
                      onChange={(e) => { setEndTime(e.target.value); setValidationError(''); }}
                      style={{ fontSize: '0.95rem' }}
                      required
                    />
                  </div>
                </div>

                {/* Plan Textarea */}
                <div className="mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-2">
                    <label className="form-label fw-bold text-secondary small m-0">Planning (Bengali Expected)</label>
                    
                    {/* Quick Checklist Insert Buttons */}
                    <div className="d-flex gap-1.5">
                      <button
                        type="button"
                        className="btn btn-xs rounded-pill px-2 py-0.5 border border-success-subtle bg-success text-white d-flex align-items-center gap-1 shadow-xs hover-scale"
                        style={{ fontSize: '0.72rem', backgroundColor: '#075E54', border: 'none' }}
                        onClick={() => handleInsertTemplate('[ ] ')}
                      >
                        <i className="bi bi-check2-square"></i> + Task
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs rounded-pill px-2 py-0.5 border border-secondary-subtle bg-light text-dark d-flex align-items-center gap-1 shadow-xs hover-scale"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => handleInsertTemplate('• ')}
                      >
                        <i className="bi bi-list-ul"></i> + Bullet
                      </button>
                    </div>
                  </div>

                  <textarea 
                    ref={textareaRef}
                    className="form-control border-0 py-2.5 shadow-sm rounded-3"
                    rows="4"
                    placeholder="আজকে কী করবেন? (যেমন: আজকে Firebase CRUD শেষ করবো)"
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    required
                    autoFocus
                    style={{ resize: 'none', fontSize: '0.95rem' }}
                  ></textarea>
                  <div className="form-text text-muted mb-2" style={{ fontSize: '0.75rem' }}>
                    Describe your tasks or objectives for this hour slot.
                  </div>

                  {/* Suggestion Helper */}
                  <SuggestionHelper 
                    type="plan" 
                    currentInputText={plan}
                    dictionaryData={dictionaryData}
                    onApply={(s) => setPlan(prev => {
                      const trimmed = prev.trim();
                      const words = trimmed.split(/\s+/).filter(Boolean);
                      if (words.length <= 1) return s;
                      const rest = trimmed.substring(words[0].length).trim();
                      return s + ' ' + rest;
                    })}
                  />
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
