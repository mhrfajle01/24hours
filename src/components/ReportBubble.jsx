import React from 'react';
import SuggestionHelper from './SuggestionHelper';

/**
 * Report bubble (left-aligned, white bubble)
 * Displays the user's hourly progress report.
 */
export default function ReportBubble({ 
  content, 
  createdAt, 
  isEditing, 
  tempValue, 
  tempStatus, 
  onChange, 
  onStatusChange, 
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
      <div className="d-flex justify-content-start mb-2 position-relative animate-fade-in w-100">
        <div 
          className="p-3 shadow-sm rounded-chat-left border w-100 animate-slide-up" 
          style={{ 
            backgroundColor: '#FFFFFF', 
            color: '#303030', 
            maxWidth: '85%',
            minWidth: '220px',
            borderColor: '#E6E6E6'
          }}
        >
          <div className="fw-bold text-secondary small mb-2 d-flex align-items-center gap-1">
            <i className="bi bi-journal-text"></i> Edit Report &amp; Status
          </div>

          {/* Inline Status Selection */}
          <div className="mb-2 d-flex gap-1">
            {[
              { name: 'Completed', color: '#25D366', icon: 'bi-check-circle-fill' },
              { name: 'Pending', color: '#FFC107', icon: 'bi-hourglass-split' },
              { name: 'Missed', color: '#DC3545', icon: 'bi-x-circle-fill' }
            ].map((item) => {
              const isSelected = tempStatus === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  className={`btn btn-sm py-1 px-1.5 rounded-3 border-0 flex-fill d-flex align-items-center justify-content-center gap-1 text-nowrap transition-all ${
                    isSelected ? 'fw-bold text-white' : 'bg-light text-secondary opacity-75'
                  }`}
                  style={{
                    backgroundColor: isSelected ? item.color : '#F8F9FA',
                    fontSize: '0.72rem',
                    padding: '3px 6px'
                  }}
                  onClick={() => onStatusChange(item.name)}
                >
                  <i className={`bi ${item.icon}`} style={{ fontSize: '0.85rem' }}></i>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>

          <textarea
            className="form-control form-control-sm border-0 py-1.5 shadow-none rounded-2 mb-2 bg-light"
            rows="2"
            value={tempValue}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            style={{ fontSize: '0.9rem', resize: 'none' }}
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
                className="btn btn-sm text-white rounded-pill px-3 py-0.5 border-0" 
                style={{ fontSize: '0.75rem', backgroundColor: '#075E54', padding: '1px 12px' }} 
                onClick={onSave}
              >
                Save
              </button>
            </div>
          </div>

          <SuggestionHelper 
            type="report" 
            status={tempStatus}
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
      className="d-flex justify-content-start mb-2 position-relative animate-fade-in"
      onDoubleClick={onStartEdit}
      title="Double-click to edit report inline"
      style={{ cursor: 'pointer' }}
    >
      <div 
        className="p-3 shadow-sm rounded-chat-left border" 
        style={{ 
          backgroundColor: '#FFFFFF', 
          color: '#303030', 
          maxWidth: '85%',
          minWidth: '160px',
          borderColor: '#E6E6E6'
        }}
      >
        <div className="fw-bold text-secondary small mb-1 d-flex align-items-center gap-1">
          <i className="bi bi-journal-text"></i> Report
          <i className="bi bi-pencil-fill ms-auto text-secondary opacity-25" style={{ fontSize: '0.75rem' }}></i>
        </div>
        <p className="m-0 text-wrap text-start text-break fw-normal" style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>
          {content || <em className="text-muted opacity-75">No report submitted.</em>}
        </p>
        <div className="text-start text-muted mt-1" style={{ fontSize: '0.7rem' }}>
          {formatBubbleTime(createdAt)}
        </div>
      </div>
    </div>
  );
}
