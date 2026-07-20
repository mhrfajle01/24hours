import React, { useState, useEffect } from 'react';
import { getIntervalTimes, formatTime12h } from '../utils/helpers';
import TagDropdown from './TagDropdown';

/**
 * ReportModal handles updating the progress report and progress status for a slot.
 * Fields: Report text, Status (Completed, Pending, Missed), and closing tag.
 */
export default function ReportModal({ isOpen, onClose, onSave, report, dictionaryData, isMandatory = false }) {
  const [reportText, setReportText] = useState('');
  const [status, setStatus] = useState('Pending');
  const [selectedTags, setSelectedTags] = useState([]);
  const [validationError, setValidationError] = useState('');

  const listData = dictionaryData || [];

  useEffect(() => {
    if (report) {
      const currentReportText = report.report || '';
      setReportText(currentReportText);
      setStatus(report.status || 'Pending');
      setValidationError('');

      if (report.tag) {
        setSelectedTags([report.tag]);
      } else if (currentReportText) {
        // Auto-detect tag from report text by searching dictionary templates
        const matchedEntry = listData.find(d => 
          (d.report_bn && d.report_bn === currentReportText) ||
          (d.plan_bn && d.plan_bn === currentReportText) ||
          (d.report_en && d.report_en === currentReportText) ||
          (d.plan_en && d.plan_en === currentReportText)
        );
        if (matchedEntry) {
          setSelectedTags([matchedEntry.tag]);
        } else {
          setSelectedTags([]);
        }
      } else {
        setSelectedTags([]);
      }
    }
  }, [report, isOpen, listData]);

  if (!isOpen || !report) return null;

  const handleTagDropdownChange = (tags) => {
    setSelectedTags(tags);
    
    if (tags.length > 0 && tags[0] !== 'others') {
      const matched = listData.find(d => d.tag === tags[0]);
      if (matched) {
        const template = matched.report_bn || matched.plan_bn || matched.report_en || matched.plan_en;
        // Only autofill if report text is currently empty
        if (!reportText.trim()) {
          setReportText(template);
        }
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (status === 'Completed' && (!selectedTags || selectedTags.length === 0)) {
      setValidationError('Closing tag is mandatory for Completed task blocks / সম্পন্ন করা ব্লকের জন্য ক্লোজিং ট্যাগ আবশ্যক।');
      return;
    }
    if (!reportText.trim()) {
      setValidationError('Report details are required / রিপোর্ট বিবরণ আবশ্যক।');
      return;
    }
    setValidationError('');
    onSave({
      report: reportText,
      status,
      tag: selectedTags[0] || ''
    });
  };

  const times = getIntervalTimes(report);
  const timeStr = `${formatTime12h(times.startTime)} - ${formatTime12h(times.endTime)}`;

  // Disable closing if mandatory or if Completed is chosen but no tag is selected yet
  const needsClosingTag = status === 'Completed' && (!selectedTags || selectedTags.length === 0);
  const disableClose = isMandatory || needsClosingTag;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="modal-backdrop fade show animate-fade-in" 
        style={{ zIndex: 1050 }} 
        onClick={disableClose ? undefined : onClose}
      ></div>
      
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
                Report Slot: {timeStr}
              </h5>
              {!disableClose && (
                <button 
                  type="button" 
                  className="btn-close btn-close-white shadow-none" 
                  onClick={onClose}
                  aria-label="Close"
                ></button>
              )}
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="modal-body p-4 bg-light">
                {validationError && (
                  <div className="alert alert-danger border-0 py-2 px-3 rounded-3 small mb-3">
                    <i className="bi bi-exclamation-triangle-fill me-2"></i>
                    {validationError}
                  </div>
                )}
                
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

                {/* Searchable Multilingual Dropdown — mandatory if Completed status is chosen */}
                <div className="mb-3">
                  <label className="form-label fw-bold text-secondary small mb-1.5">
                    {status === 'Completed' ? (
                      <span className="text-danger fw-bold">
                        * Select Closing Tag (Mandatory) / ক্লোজিং ট্যাগ (আবশ্যক)
                      </span>
                    ) : (
                      <span>Select Tag (Optional) / ট্যাগ নির্বাচন (ঐচ্ছিক)</span>
                    )}
                  </label>
                  <TagDropdown 
                    dictionaryData={listData}
                    selectedTags={selectedTags}
                    onChange={handleTagDropdownChange}
                    placeholder={status === 'Completed' ? "Select closing tag... / ক্লোজিং ট্যাগ নির্বাচন করুন" : "Select tag... / ট্যাগ নির্বাচন করুন"}
                    multiSelect={false}
                  />
                  {status === 'Completed' && (!selectedTags || selectedTags.length === 0) && (
                    <div className="form-text text-danger mt-1" style={{ fontSize: '0.72rem' }}>
                      <i className="bi bi-info-circle-fill me-1"></i>
                      You must select a tag before saving this completed block.
                    </div>
                  )}
                </div>

                {/* Report Text */}
                <div className="mb-2">
                  <label className="form-label fw-bold text-secondary small">Report Details (Bengali Expected)</label>
                  <textarea 
                    className="form-control border-0 py-2.5 shadow-sm rounded-3"
                    rows="4"
                    placeholder="কী সম্পন্ন হয়েছে? (যেমন: CRUD সম্পন্ন হয়েছে কিন্তু Delete Function বাকি)"
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    required
                    style={{ resize: 'none', fontSize: '0.95rem' }}
                  ></textarea>
                  <div className="form-text text-muted mb-2" style={{ fontSize: '0.75rem' }}>
                    Provide an update on what tasks were accomplished during this hour.
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4 d-flex justify-content-end gap-2">
                {!disableClose && (
                  <button 
                    type="button" 
                    className="btn btn-white border rounded-pill px-4 py-2 text-secondary shadow-sm hover-scale fw-bold" 
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                )}
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


