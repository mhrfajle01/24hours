import React, { useState } from 'react';

export default function MessageCenterModal({
  isOpen,
  onClose,
  currentUser,
  isAdmin,
  messages,
  sendMessage,
  markAsRead,
}) {
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox', 'compose'
  const [composeType, setComposeType] = useState('feedback'); // 'feedback' for users, 'global_notice' for admin
  const [composeContent, setComposeContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const unreadMessages = messages.filter(m => !m.readBy?.includes(currentUser?.uid));
  const readMessages = messages.filter(m => m.readBy?.includes(currentUser?.uid));

  const handleSend = async (e) => {
    e.preventDefault();
    if (!composeContent.trim()) return;
    setIsSending(true);
    try {
      await sendMessage({
        type: composeType,
        content: composeContent,
        receiverId: isAdmin ? 'all' : 'admin',
      });
      setComposeContent('');
      setActiveTab('inbox');
    } catch (err) {
      console.error(err);
      alert('Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div 
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable" 
        style={{ width: '90%', maxWidth: '500px', margin: '1.5rem auto' }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0" style={{ borderRadius: '1.25rem', background: 'rgba(30, 30, 47, 0.98)', backdropFilter: 'blur(16px)', color: '#fff', boxShadow: '0 1rem 3rem rgba(0,0,0,0.5)' }}>
          
          <div className="modal-header border-0 pb-0 pt-4 px-4 d-flex justify-content-between align-items-center">
            <h5 className="modal-title fw-bold" style={{ color: '#00d2ff' }}>
              <i className="bi bi-envelope-paper me-2" />
              {isAdmin ? 'Admin Message Center' : 'Message Center'}
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} aria-label="Close"></button>
          </div>

          <div className="modal-body px-4 py-3">
            <div className="d-flex gap-2 mb-4">
              <button 
                className={`btn btn-sm ${activeTab === 'inbox' ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ flex: 1, borderRadius: '2rem' }}
                onClick={() => setActiveTab('inbox')}
              >
                <i className="bi bi-inbox me-2" />Inbox {unreadMessages.length > 0 && <span className="badge bg-danger ms-1">{unreadMessages.length}</span>}
              </button>
              <button 
                className={`btn btn-sm ${activeTab === 'compose' ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ flex: 1, borderRadius: '2rem' }}
                onClick={() => setActiveTab('compose')}
              >
                <i className="bi bi-pencil-square me-2" />{isAdmin ? 'Send Global Notice' : 'Send Feedback'}
              </button>
            </div>

            {activeTab === 'inbox' && (
              <div className="d-flex flex-column gap-3">
                {messages.length === 0 ? (
                  <div className="text-center text-secondary py-5">
                    <i className="bi bi-envelope-x fs-1 d-block mb-2" />
                    <p>Your inbox is empty.</p>
                  </div>
                ) : (
                  <>
                    {unreadMessages.map(m => (
                      <div key={m.id} className="p-3 rounded border border-info" style={{ background: 'rgba(0, 210, 255, 0.05)' }}>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <span className="badge bg-info text-dark">
                            {m.type === 'global_notice' ? 'Global Notice' : m.type === 'direct_notice' ? 'Direct Notice' : 'User Feedback'}
                          </span>
                          <small className="text-secondary">
                            {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : 'Just now'}
                          </small>
                        </div>
                        <p className="mb-2" style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{m.content}</p>
                        <button className="btn btn-sm btn-outline-info" onClick={() => markAsRead(m.id)}>
                          <i className="bi bi-check2-circle me-1" /> Mark as Read
                        </button>
                      </div>
                    ))}
                    {readMessages.map(m => (
                      <div key={m.id} className="p-3 rounded border border-secondary" style={{ background: 'rgba(255, 255, 255, 0.02)', opacity: 0.8 }}>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <span className="badge bg-secondary">
                            {m.type === 'global_notice' ? 'Global Notice' : m.type === 'direct_notice' ? 'Direct Notice' : 'User Feedback'}
                          </span>
                          <small className="text-secondary">
                            {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : 'Just now'}
                          </small>
                        </div>
                        <p className="mb-0 text-light" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{m.content}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {activeTab === 'compose' && (
              <form onSubmit={handleSend} className="d-flex flex-column gap-3">
                {!isAdmin && (
                  <div>
                    <label className="form-label text-secondary small">What would you like to send?</label>
                    <select 
                      className="form-select bg-dark text-white border-secondary"
                      value={composeType}
                      onChange={(e) => setComposeType(e.target.value)}
                    >
                      <option value="feedback">General Feedback / Idea</option>
                      <option value="bug_report">Bug Report</option>
                    </select>
                  </div>
                )}
                {isAdmin && (
                  <div className="alert alert-warning py-2 mb-0" style={{ fontSize: '0.8rem' }}>
                    <i className="bi bi-exclamation-triangle-fill me-2" />
                    This will send a notification to <strong>all users</strong>.
                  </div>
                )}
                <div>
                  <label className="form-label text-secondary small">Message Content</label>
                  <textarea 
                    className="form-control bg-dark text-white border-secondary" 
                    rows={5}
                    placeholder={isAdmin ? "Type your global announcement here..." : "Describe your feedback, thought, or the bug you encountered..."}
                    value={composeContent}
                    onChange={(e) => setComposeContent(e.target.value)}
                    required
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary mt-2 fw-bold"
                  disabled={isSending || !composeContent.trim()}
                >
                  {isSending ? <><span className="spinner-border spinner-border-sm me-2"/> Sending...</> : <><i className="bi bi-send-fill me-2"/> Send Message</>}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
