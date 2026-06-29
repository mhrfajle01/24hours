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
  dictionaryData,
  onUpdatePlanText
}) {
  const textareaRef = React.useRef(null);

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

  const parsePlan = (txt) => {
    if (!txt) return [];
    const lines = txt.split('\n');
    return lines.map((line, idx) => {
      const match = line.match(/^(\s*[-*]?\s*\[([ xX])\]\s*)(.*)$/);
      if (match) {
        return {
          isTodo: true,
          checked: match[2].toLowerCase() === 'x',
          text: match[3],
          raw: line,
          prefix: match[1],
          lineIdx: idx
        };
      }
      return {
        isTodo: false,
        text: line,
        raw: line,
        lineIdx: idx
      };
    });
  };

  const toggleTodo = (parsedItems, itemToToggle) => {
    const lines = parsedItems.map((item) => {
      if (item.lineIdx === itemToToggle.lineIdx) {
        const nextChecked = !item.checked;
        const newCheckedChar = nextChecked ? 'x' : ' ';
        return item.raw.replace(/\[([ xX])\]/, `[${newCheckedChar}]`);
      }
      return item.raw;
    });
    return lines.join('\n');
  };

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
    onChange(newVal);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + textToInsert.length;
      textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    }, 50);
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
            ref={textareaRef}
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

          {/* Quick checklist buttons */}
          <div className="d-flex gap-1.5 mb-2 flex-wrap">
            <button
              type="button"
              className="btn btn-xs rounded-pill px-2.5 py-0.5 border border-success-subtle bg-success text-white d-flex align-items-center gap-1 shadow-xs hover-scale"
              style={{ fontSize: '0.72rem', backgroundColor: '#075E54', border: 'none' }}
              onClick={() => handleInsertTemplate('[ ] ')}
            >
              <i className="bi bi-check2-square"></i> + Task
            </button>
            <button
              type="button"
              className="btn btn-xs rounded-pill px-2.5 py-0.5 border border-secondary-subtle bg-light text-dark d-flex align-items-center gap-1 shadow-xs hover-scale"
              style={{ fontSize: '0.72rem' }}
              onClick={() => handleInsertTemplate('• ')}
            >
              <i className="bi bi-list-ul"></i> + Bullet
            </button>
          </div>

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

  const parsed = parsePlan(content);
  const hasTodos = parsed.some(item => item.isTodo);

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
        <div className="fw-bold text-success small mb-1.5 d-flex align-items-center gap-1">
          <i className="bi bi-compass-fill"></i> Planning
          {hasTodos && (
            <span className="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2 py-0.5 ms-2 fs-xs fw-semibold">
              Checklist
            </span>
          )}
          <i className="bi bi-pencil-fill ms-auto text-success opacity-25" style={{ fontSize: '0.75rem' }}></i>
        </div>

        {content ? (
          <div className="m-0 text-wrap text-start text-break fw-normal" style={{ fontSize: '0.95rem' }}>
            {parsed.map((item, idx) => {
              if (item.isTodo) {
                return (
                  <div 
                    key={idx} 
                    className="d-flex align-items-start gap-2 mb-1 cursor-pointer checklist-item-row"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newContent = toggleTodo(parsed, item);
                      onUpdatePlanText && onUpdatePlanText(newContent);
                    }}
                  >
                    <div className="form-check m-0 p-0 d-flex align-items-center">
                      <input 
                        type="checkbox" 
                        className="form-check-input m-0 cursor-pointer" 
                        checked={item.checked} 
                        readOnly
                        style={{ 
                          width: '1.05rem', 
                          height: '1.05rem',
                          accentColor: '#075E54'
                        }} 
                      />
                    </div>
                    <span 
                      className={`lh-sm flex-grow-1 select-none ${
                        item.checked ? 'text-decoration-line-through text-muted' : 'text-dark'
                      }`}
                      style={{ fontSize: '0.92rem' }}
                    >
                      {item.text}
                    </span>
                  </div>
                );
              } else {
                return (
                  <p 
                    key={idx} 
                    className="m-0 text-wrap text-start text-break lh-sm mb-1 text-dark" 
                    style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem' }}
                  >
                    {item.text || '\u00A0'}
                  </p>
                );
              }
            })}
          </div>
        ) : (
          <p className="m-0 text-wrap text-start text-break fw-normal" style={{ fontSize: '0.95rem' }}>
            <em className="text-muted">No plan set.</em>
          </p>
        )}

        <div className="text-end text-muted mt-2" style={{ fontSize: '0.7rem' }}>
          {formatBubbleTime(createdAt)} <i className="bi bi-check2-all text-primary ms-1"></i>
        </div>
      </div>
    </div>
  );
}
