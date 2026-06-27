import React from 'react';

/**
 * Plan bubble (right-aligned, WhatsApp green bubble)
 * Displays the user's hourly planning content.
 */
export default function PlanBubble({ content, createdAt }) {
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
    <div className="d-flex justify-content-end mb-2 position-relative animate-fade-in">
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
