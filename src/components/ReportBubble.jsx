import React from 'react';

/**
 * Report bubble (left-aligned, white bubble)
 * Displays the user's hourly progress report.
 */
export default function ReportBubble({ content, createdAt }) {
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

  return (
    <div className="d-flex justify-content-start mb-2 position-relative animate-fade-in">
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
