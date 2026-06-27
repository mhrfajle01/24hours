import React from 'react';
import { formatHourString } from '../utils/helpers';

/**
 * DeleteModal provides a double-check confirmation dialog before deleting an hourly slot.
 */
export default function DeleteModal({ isOpen, onClose, onConfirm, report }) {
  if (!isOpen || !report) return null;

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
            
            {/* Header colored in Red Danger */}
            <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}>
              <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                <i className="bi bi-trash3-fill"></i>
                Move to Trash
              </h5>
              <button 
                type="button" 
                className="btn-close btn-close-white shadow-none" 
                onClick={onClose}
                aria-label="Close"
              ></button>
            </div>
            
            <div className="modal-body p-4 bg-light text-center">
              <div className="mb-3" style={{ color: '#b71c1c' }}>
                <i className="bi bi-trash3 fs-1 animate-pulse"></i>
              </div>
              <h5 className="fw-bold text-dark mb-2">Move to Trash?</h5>
              <p className="text-secondary mb-0" style={{ fontSize: '0.95rem' }}>
                The block for <strong>{formatHourString(report.hour, report.ampm)}</strong> will be moved to Trash.
                You can restore it anytime from the Trash section.
              </p>
            </div>

            {/* Action buttons */}
            <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4 d-flex justify-content-center gap-2">
              <button 
                type="button" 
                className="btn btn-white border rounded-pill px-4 py-2 text-secondary shadow-sm hover-scale fw-bold" 
                onClick={onClose}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn border-0 rounded-pill px-4 py-2 shadow-sm hover-scale fw-bold text-white"
                style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}
                onClick={onConfirm}
              >
                <i className="bi bi-trash3-fill me-1"></i>Move to Trash
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
