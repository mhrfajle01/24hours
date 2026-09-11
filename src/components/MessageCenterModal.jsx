import React, { useState } from 'react';

export default function MessageCenterModal({
  isOpen,
  onClose,
  currentUser,
  isAdmin,
  messages,
  sendMessage,
  markAsRead,
  deleteMessage,
}) {
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox', 'compose'
  const [composeType, setComposeType] = useState('feedback'); // 'feedback' for users, 'global_notice' for admin
  const [composeContent, setComposeContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // For Admin replies
  const [replyToMessage, setReplyToMessage] = useState(null);

  if (!isOpen) return null;

  const unreadMessages = messages.filter(m => !m.readBy?.includes(currentUser?.uid));
  const readMessages = messages.filter(m => m.readBy?.includes(currentUser?.uid));

  const handleSend = async (e) => {
    e.preventDefault();
    if (!composeContent.trim()) return;
    setIsSending(true);
    try {
      let payload = {
        type: composeType,
        content: composeContent,
        receiverId: isAdmin ? 'all' : 'admin',
      };

      if (isAdmin && replyToMessage) {
        payload = {
          type: 'direct_notice',
          content: composeContent,
          receiverId: replyToMessage.senderId,
          replyToName: replyToMessage.senderName,
          threadId: replyToMessage.threadId || replyToMessage.id, // basic threading
        };
      }

      await sendMessage(payload);
      
      setComposeContent('');
      setReplyToMessage(null);
      setActiveTab('inbox');
    } catch (err) {
      console.error(err);
      alert('Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleReplyClick = (msg) => {
    setReplyToMessage(msg);
    setComposeType('direct_notice');
    setActiveTab('compose');
  };

  const getMessageStyling = (type) => {
    switch(type) {
      case 'global_notice': return { icon: 'bi-megaphone', color: '#00d4ff', label: 'Global Notice', bg: 'rgba(0, 212, 255, 0.1)' };
      case 'direct_notice': return { icon: 'bi-person-check', color: '#25D366', label: 'Direct Notice', bg: 'rgba(37, 211, 102, 0.1)' };
      case 'feedback': return { icon: 'bi-chat-dots', color: '#ffc107', label: 'User Feedback', bg: 'rgba(255, 193, 7, 0.1)' };
      case 'bug_report': return { icon: 'bi-bug', color: '#ff6b6b', label: 'Bug Report', bg: 'rgba(255, 107, 107, 0.1)' };
      default: return { icon: 'bi-envelope', color: '#6c757d', label: 'Message', bg: 'rgba(108, 117, 125, 0.1)' };
    }
  };

  const renderMessageCard = (m, isRead) => {
    const style = getMessageStyling(m.type);
    const dateStr = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString() : 'Just now';
    
    return (
      <div key={m.id} className={`p-3 rounded border`} style={{ borderColor: isRead ? 'rgba(255,255,255,0.1)' : style.color, background: isRead ? 'rgba(255,255,255,0.02)' : style.bg, opacity: isRead ? 0.8 : 1 }}>
        <div className="d-flex justify-content-between align-items-start mb-2">
          <span className="badge" style={{ backgroundColor: style.color, color: '#000' }}>
            <i className={`bi ${style.icon} me-1`} /> {style.label}
          </span>
          <small className="text-secondary">{dateStr}</small>
        </div>
        
        {/* Sender Identity Display */}
        {isAdmin && (m.type === 'feedback' || m.type === 'bug_report') && (
          <div className="d-flex align-items-center gap-2 mb-2 p-2 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {m.senderPhoto ? (
              <img src={m.senderPhoto} width={24} height={24} className="rounded-circle" alt="avatar" />
            ) : (
              <i className="bi bi-person-circle text-secondary fs-5" />
            )}
            <div className="d-flex flex-column" style={{ lineHeight: '1.2' }}>
              <span className="fw-bold" style={{ fontSize: '0.85rem' }}>{m.senderName || 'Anonymous'}</span>
              {m.senderEmail && <span className="text-white-50" style={{ fontSize: '0.75rem' }}>{m.senderEmail}</span>}
            </div>
          </div>
        )}

        {!isAdmin && (m.type === 'global_notice' || m.type === 'direct_notice') && (
          <div className="d-flex align-items-center gap-2 mb-2">
            <i className={`bi bi-shield-check`} style={{ color: style.color }} />
            <span className="fw-bold small" style={{ color: style.color }}>
              {m.senderName || 'Admin'}
            </span>
          </div>
        )}

        <p className="mb-2" style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: isRead ? '#ccc' : '#fff' }}>{m.content}</p>
        
        <div className="d-flex gap-2 justify-content-end mt-2">
          {!isRead && (
            <button className="btn btn-sm text-dark fw-bold px-3 rounded-pill" style={{ backgroundColor: style.color }} onClick={() => markAsRead(m.id)}>
              <i className="bi bi-check2-circle me-1" /> Mark Read
            </button>
          )}
          {isAdmin && (m.type === 'feedback' || m.type === 'bug_report') && (
            <button className="btn btn-sm btn-outline-light px-3 rounded-pill" onClick={() => handleReplyClick(m)}>
              <i className="bi bi-reply-fill me-1" /> Reply
            </button>
          )}
          {isAdmin && deleteMessage && (
            <button className="btn btn-sm btn-outline-danger px-3 rounded-pill" onClick={() => {
              if (window.confirm('Delete this message?')) deleteMessage(m.id);
            }}>
              <i className="bi bi-trash" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div 
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable" 
        style={{ width: '90%', maxWidth: '550px', margin: '1.5rem auto' }} 
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
                onClick={() => {
                  setActiveTab('inbox');
                  setReplyToMessage(null);
                }}
              >
                <i className="bi bi-inbox me-2" />Inbox {unreadMessages.length > 0 && <span className="badge bg-danger ms-1">{unreadMessages.length}</span>}
              </button>
              <button 
                className={`btn btn-sm ${activeTab === 'compose' ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ flex: 1, borderRadius: '2rem' }}
                onClick={() => {
                  setActiveTab('compose');
                  if (!replyToMessage) setComposeType(isAdmin ? 'global_notice' : 'feedback');
                }}
              >
                <i className="bi bi-pencil-square me-2" />
                {isAdmin ? (replyToMessage ? 'Reply to User' : 'Send Global Notice') : 'Send Feedback'}
              </button>
            </div>

            {activeTab === 'inbox' && (
              <div className="d-flex flex-column gap-3 pb-3">
                {messages.length === 0 ? (
                  <div className="text-center text-secondary py-5">
                    <i className="bi bi-envelope-x fs-1 d-block mb-2" />
                    <p>Your inbox is empty.</p>
                  </div>
                ) : (
                  <>
                    {unreadMessages.map(m => renderMessageCard(m, false))}
                    {readMessages.map(m => renderMessageCard(m, true))}
                  </>
                )}
              </div>
            )}

            {activeTab === 'compose' && (
              <form onSubmit={handleSend} className="d-flex flex-column gap-3 pb-3">
                {isAdmin && replyToMessage ? (
                  <div className="alert alert-info py-2 px-3 mb-0" style={{ background: 'rgba(0, 212, 255, 0.1)', border: '1px solid #00d4ff' }}>
                    <div className="d-flex justify-content-between align-items-center">
                      <span><i className="bi bi-reply-fill me-2" />Replying to <strong>{replyToMessage.senderName || 'User'}</strong></span>
                      <button type="button" className="btn-close btn-close-white" style={{ fontSize: '0.6rem' }} onClick={() => {
                        setReplyToMessage(null);
                        setComposeType('global_notice');
                      }}></button>
                    </div>
                  </div>
                ) : !isAdmin ? (
                  <div>
                    <label className="form-label text-secondary small fw-bold">MESSAGE TYPE</label>
                    <select 
                      className="form-select bg-dark text-white border-secondary rounded-3"
                      value={composeType}
                      onChange={(e) => setComposeType(e.target.value)}
                    >
                      <option value="feedback">General Feedback / Idea</option>
                      <option value="bug_report">Bug Report</option>
                    </select>
                  </div>
                ) : (
                  <div className="alert alert-warning py-2 mb-0 border-warning" style={{ background: 'rgba(255, 193, 7, 0.1)', fontSize: '0.85rem' }}>
                    <i className="bi bi-exclamation-triangle-fill me-2 text-warning" />
                    This will send a notification to <strong>all users</strong>.
                  </div>
                )}
                
                <div>
                  <label className="form-label text-secondary small fw-bold">MESSAGE CONTENT</label>
                  <textarea 
                    className="form-control bg-dark text-white border-secondary rounded-3" 
                    rows={6}
                    placeholder={isAdmin ? (replyToMessage ? `Type your reply to ${replyToMessage.senderName}...` : "Type your global announcement here...") : "Describe your feedback, thought, or the bug you encountered..."}
                    value={composeContent}
                    onChange={(e) => setComposeContent(e.target.value)}
                    required
                  />
                </div>
                
                <button 
                  type="submit" 
                  className="btn mt-2 fw-bold rounded-pill text-dark"
                  style={{ background: isAdmin && !replyToMessage ? '#ffc107' : '#00d4ff' }}
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
