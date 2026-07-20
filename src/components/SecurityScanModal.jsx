import React, { useState } from 'react';

/**
 * Custom Modal that prompts the user to resolve timing blocks that are
 * pending or completed without a closing tag.
 * Forces the user to fill the data to close them.
 */
export default function SecurityScanModal({ invalidBlocks, onResolve, dictionaryData = [] }) {
  // formData stores closing details: { [blockId]: { report: '', tag: '', status: 'Completed' } }
  const [formData, setFormData] = useState({});

  if (!invalidBlocks || invalidBlocks.length === 0) return null;

  const handleReportChange = (id, val) => {
    setFormData(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), report: val }
    }));
  };

  const handleTagChange = (id, tagVal) => {
    setFormData(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), tag: tagVal }
    }));
  };

  const handleStatusChange = (id, statusVal) => {
    setFormData(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), status: statusVal }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const resolvedBlocks = {};
    let allValid = true;
    
    invalidBlocks.forEach(b => {
      const entry = formData[b.id];
      const tag = entry?.tag;
      const report = entry?.report || '';
      const status = entry?.status || 'Completed'; // Default status to Completed

      if (!tag) {
        allValid = false;
      } else if (tag === 'other' && !report.trim()) {
        allValid = false;
      } else {
        // If tag is not 'other' and report text is empty, fill with default closing tag name description
        resolvedBlocks[b.id] = {
          report: report.trim() || `Resolved under category #${tag}`,
          tag: tag,
          status: status
        };
      }
    });

    if (!allValid) {
      alert("Please ensure tag category is selected and detailed resolution text is provided for 'Other' tags.");
      return;
    }

    onResolve(resolvedBlocks);
  };

  // Get list of tags from tag library dictionaryData
  const availableTags = Array.from(new Set(dictionaryData.map(d => d.tag).filter(Boolean)));

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      backdropFilter: 'blur(5px)',
      color: '#fff',
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        backgroundColor: '#1e1e2e',
        border: '2px solid #f38ba8',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '550px',
        width: '90%',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{ color: '#f38ba8', marginTop: 0, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🚨 Security Action Required</span>
        </h2>
        <p style={{ color: '#cdd6f4', fontSize: '13px', lineHeight: '1.5', marginBottom: '15px' }}>
          Timing blocks are in <strong>Pending / Completed</strong> state without closing tags. 
          Please select a status and category tag.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '20px', paddingRight: '4px' }}>
            {invalidBlocks.map(b => {
              const currentEntry = formData[b.id] || { report: '', tag: '', status: 'Completed' };
              const isOtherSelected = currentEntry.tag === 'other';

              return (
                <div key={b.id} style={{
                  backgroundColor: '#313244',
                  padding: '14px',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  borderLeft: '4px solid #f38ba8'
                }}>
                  {/* Context Summary Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a6adc8', marginBottom: '6px' }}>
                    <span>⏰ {b.time || 'N/A'}</span>
                    <span style={{ textTransform: 'capitalize', color: '#f38ba8', fontWeight: 'bold' }}>{b.state}</span>
                  </div>
                  
                  {/* Actual Plan/Context being previewed */}
                  <div style={{ 
                    backgroundColor: '#181825', 
                    padding: '8px 10px', 
                    borderRadius: '6px', 
                    fontSize: '13px', 
                    color: '#cdd6f4',
                    border: '1px solid #45475a',
                    marginBottom: '10px'
                  }}>
                    <strong>Plan Context:</strong> {b.plan || '(Empty plan details)'}
                  </div>

                  {/* Dropdown status selection */}
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#bac2de', marginBottom: '4px', fontWeight: 'bold' }}>
                      Select Status *
                    </label>
                    <select
                      value={currentEntry.status || 'Completed'}
                      required
                      onChange={(e) => handleStatusChange(b.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #45475a',
                        backgroundColor: '#181825',
                        color: '#cdd6f4',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    >
                      <option value="Completed">Completed (সম্পন্ন)</option>
                      <option value="Missed">Missed (বাদ পড়েছে)</option>
                    </select>
                  </div>

                  {/* Dropdown tag selection */}
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#bac2de', marginBottom: '4px', fontWeight: 'bold' }}>
                      Select Category Tag *
                    </label>
                    <select
                      value={currentEntry.tag}
                      required
                      onChange={(e) => handleTagChange(b.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #45475a',
                        backgroundColor: '#181825',
                        color: '#cdd6f4',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    >
                      <option value="" disabled>-- Choose Tag --</option>
                      {availableTags.map(tag => (
                        <option key={tag} value={tag}>#{tag}</option>
                      ))}
                      <option value="other">Other / General</option>
                    </select>
                  </div>

                  {/* Closing description text field */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#bac2de', marginBottom: '4px', fontWeight: 'bold' }}>
                      Resolution / Report text {isOtherSelected ? '*' : '(Optional)'}
                    </label>
                    <input
                      type="text"
                      required={isOtherSelected}
                      placeholder={isOtherSelected ? "Required description for 'Other' category" : "What was completed during this block? (Optional)"}
                      value={currentEntry.report}
                      onChange={(e) => handleReportChange(b.id, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #45475a',
                        backgroundColor: '#181825',
                        color: '#cdd6f4',
                        boxSizing: 'border-box',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#f38ba8',
              color: '#11111b',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'background-color 0.2s'
            }}
          >
            Submit Resolution Data
          </button>
        </form>
        
        <p style={{ fontSize: '11px', color: '#f38ba8', textAlign: 'center', marginTop: '12px', marginBottom: 0 }}>
          *Note: You cannot close this window until resolution data is supplied.
        </p>
      </div>
    </div>
  );
}
