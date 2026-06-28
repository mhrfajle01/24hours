import React from 'react';
import SuggestionHelper from './SuggestionHelper';

/**
 * Plan bubble (right-aligned, WhatsApp green bubble)
 * Displays the user's hourly planning content.
 */
export default function PlanBubble({ 
  content, 
  createdAt, 
  isEditing, 
  tempValue, 
  onChange, 
  onSave, 
  onCancel, 
  onStartEdit,
  dictionaryData
}) {
  const formatBubbleTime = (ts) => {
    if (!ts) return 'Just now';
    try {
      if (typeof ts.toDate === 'function') {
        return ts.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      if (ts.seconds !== undefined) {
        return new Date(ts.seconds * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      if (ts instanceof Date) {
        return ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    } catch (e) {
      console.error("Error formatting timestamp: ", e);
    }
    return 'Just now';
  };

  if (isEditing) {
    return (
      <div className="d-flex justify-content-end mb-2 position-relative animate-fade-in">
        <div 
          className="p-3 shadow-sm rounded-chat-right w-100" 
          style={{ 
            backgroundColor: '#DCF8C6', 
            color: '#303030', 
            maxWidth: '85%',
            minWidth: '200px'
          }}
        >
          <div className="fw-bold text-success small mb-2 d-flex align-items-center gap-1">
            <i className="bi bi-compass-fill"></i> Edit Plan
          </div>
          <textarea
            className="form-control form-control-sm border-0 py-1.5 shadow-none rounded-2 mb-2"
            rows="2"
            value={tempValue}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            style={{ fontSize: '0.9rem', resize: 'none', backgroundColor: '#F0FDF4' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSave();
              } else if (e.key === 'Escape') {
                onCancel();
              }
            }}
          />
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <span className="text-muted" style={{ fontSize: '0.62rem' }}>Enter to save, Shift+Enter for new line</span>
            <div className="d-flex gap-1.5">
              <button 
                type="button" 
                className="btn btn-sm btn-outline-secondary rounded-pill px-2 py-0.5 me-1" 
                style={{ fontSize: '0.75rem', padding: '1px 8px' }} 
                onClick={onCancel}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-sm btn-success rounded-pill px-3 py-0.5 text-white border-0" 
                style={{ fontSize: '0.75rem', backgroundColor: '#075E54', padding: '1px 12px' }} 
                onClick={onSave}
              >
                Save
              </button>
            </div>
          </div>

          <SuggestionHelper 
            type="plan" 
            currentInputText={tempValue}
            dictionaryData={dictionaryData}
            onApply={(s) => onChange(prev => {
              const trimmed = (prev || '').trim();
              const words = trimmed.split(/\s+/).filter(Boolean);
              if (words.length <= 1) return s;
              const rest = trimmed.substring(words[0].length).trim();
              return s + ' ' + rest;
            })}
          />
        </div>
      </div>
    );
  }

  return (
    <div 
      className="d-flex justify-content-end mb-2 position-relative animate-fade-in"
      onDoubleClick={onStartEdit}
      title="Double-click to edit plan inline"
      style={{ cursor: 'pointer' }}
    >
      <div 
        className="p-3 shadow-sm rounded-chat-right" 
        style={{ 
          backgroundColor: '#DCF8C6', 
          color: '#303030', 
          maxWidth: '85%',
          minWidth: '160px'
        }}
      >
        <div className="fw-bold text-success small mb-1 d-flex align-items-center gap-1">
          <i className="bi bi-compass-fill"></i> Planning
          <i className="bi bi-pencil-fill ms-auto text-success opacity-25" style={{ fontSize: '0.75rem' }}></i>
        </div>
        <p className="m-0 text-wrap text-start text-break fw-normal" style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
          {content || <em className="text-muted">No plan set.</em>}
        </p>
        <div className="text-end text-muted mt-1" style={{ fontSize: '0.7rem' }}>
          {formatBubbleTime(createdAt)} <i className="bi bi-check2-all text-primary ms-1"></i>
        </div>
      </div>
    </div>
  );
}
