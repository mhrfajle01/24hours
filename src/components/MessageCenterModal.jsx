import React, { useState, useMemo } from 'react';

export default function MessageCenterModal({
  isOpen,
  onClose,
  currentUser,
  isAdmin,
  messages,
  sendMessage,
  markAsRead,
  deleteMessage,
  editMessage,
  togglePin,
  bulkMarkAsRead,
  bulkDelete,
}) {
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox', 'compose'
  const [composeType, setComposeType] = useState('feedback');
  const [composeContent, setComposeContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  // For Admin replies
  const [replyToMessage, setReplyToMessage] = useState(null);

  // --- New Additive State ---
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  if (!isOpen) return null;

  // --- Filtered & Searched Messages ---
  const filteredMessages = useMemo(() => {
    let result = messages;
    
    // Filter by type
    if (filterType !== 'all') {
      result = result.filter(m => m.type === filterType);
    }
    
    // Search by content or sender name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m => 
        (m.content || '').toLowerCase().includes(q) ||
        (m.senderName || '').toLowerCase().includes(q) ||
        (m.senderEmail || '').toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [messages, filterType, searchQuery]);

  const unreadMessages = filteredMessages.filter(m => !m.readBy?.includes(currentUser?.uid));
  const readMessages = filteredMessages.filter(m => m.readBy?.includes(currentUser?.uid));

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
          threadId: replyToMessage.threadId || replyToMessage.id,
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

  // --- Edit Handlers ---
  const startEditing = (msg) => {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const saveEdit = async () => {
    if (editingMessageId && editContent.trim()) {
      await editMessage(editingMessageId, editContent.trim());
    }
    setEditingMessageId(null);
    setEditContent('');
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  // --- Bulk Selection Handlers ---
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredMessages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMessages.map(m => m.id)));
    }
  };

  const handleBulkMarkRead = async () => {
    if (selectedIds.size === 0) return;
    await bulkMarkAsRead(Array.from(selectedIds));
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} message(s)?`)) return;
    await bulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  // --- Message Status (for admin's own sent messages) ---
  const getDeliveryStatus = (msg) => {
    // Only show for messages the admin sent
    if (msg.senderId !== currentUser?.uid) return null;
    const readBy = msg.readBy || [];
    // Filter out admin's own uid from readBy
    const othersRead = readBy.filter(uid => uid !== currentUser?.uid);
    if (msg.receiverId === 'all') {
      return othersRead.length > 0 ? { icon: 'bi-check-all', color: '#00d4ff', label: `Read by ${othersRead.length}` } : { icon: 'bi-check', color: '#6c757d', label: 'Sent' };
    }
    // Direct message
    return othersRead.length > 0 ? { icon: 'bi-check-all', color: '#00d4ff', label: 'Read' } : { icon: 'bi-check', color: '#6c757d', label: 'Sent' };
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
    const isEditing = editingMessageId === m.id;
    const isOwnMessage = m.senderId === currentUser?.uid;
    const deliveryStatus = getDeliveryStatus(m);
    
    return (
      <div key={m.id} className={`p-3 rounded border position-relative`} style={{ borderColor: isRead ? 'rgba(255,255,255,0.1)' : style.color, background: isRead ? 'rgba(255,255,255,0.02)' : style.bg, opacity: isRead ? 0.8 : 1 }}>
        
        {/* Pinned indicator */}
        {m.pinned && (
          <div className="position-absolute" style={{ top: '-8px', right: '10px' }}>
            <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}>
              <i className="bi bi-pin-fill me-1" />PINNED
            </span>
          </div>
        )}

        {/* Bulk checkbox */}
        {bulkMode && isAdmin && (
          <div className="position-absolute" style={{ top: '10px', left: '-8px' }}>
            <input 
              type="checkbox" 
              className="form-check-input border-secondary" 
              checked={selectedIds.has(m.id)} 
              onChange={() => toggleSelect(m.id)}
              style={{ cursor: 'pointer' }}
            />
          </div>
        )}

        <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="d-flex align-items-center gap-2">
            <span className="badge" style={{ backgroundColor: style.color, color: '#000' }}>
              <i className={`bi ${style.icon} me-1`} /> {style.label}
            </span>
            {m.editedAt && (
              <span className="text-white-50" style={{ fontSize: '0.65rem', fontStyle: 'italic' }}>(edited)</span>
            )}
          </div>
          <div className="d-flex align-items-center gap-2">
            {deliveryStatus && (
              <span title={deliveryStatus.label} style={{ fontSize: '0.8rem', color: deliveryStatus.color }}>
                <i className={`bi ${deliveryStatus.icon}`} />
              </span>
            )}
            <small className="text-secondary">{dateStr}</small>
          </div>
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

        {/* Content: Editable or Static */}
        {isEditing ? (
          <div className="mb-2">
            <textarea
              className="form-control bg-dark text-white border-secondary rounded-3 mb-2"
              rows={3}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              autoFocus
            />
            <div className="d-flex gap-2 justify-content-end">
              <button className="btn btn-sm btn-outline-secondary rounded-pill px-3" onClick={cancelEdit}>Cancel</button>
              <button className="btn btn-sm rounded-pill px-3 text-dark fw-bold" style={{ backgroundColor: '#00d4ff' }} onClick={saveEdit} disabled={!editContent.trim()}>
                <i className="bi bi-check-lg me-1" />Save
              </button>
            </div>
          </div>
        ) : (
          <p className="mb-2" style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: isRead ? '#ccc' : '#fff' }}>{m.content}</p>
        )}
        
        {/* Action Buttons */}
        {!isEditing && (
          <div className="d-flex gap-2 justify-content-end mt-2 flex-wrap">
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
            {/* Edit button: admin can edit their own messages */}
            {isAdmin && isOwnMessage && (
              <button className="btn btn-sm btn-outline-info px-3 rounded-pill" onClick={() => startEditing(m)}>
                <i className="bi bi-pencil me-1" /> Edit
              </button>
            )}
            {/* Pin button: admin only */}
            {isAdmin && togglePin && (
              <button className="btn btn-sm btn-outline-warning px-3 rounded-pill" onClick={() => togglePin(m.id, !!m.pinned)}>
                <i className={`bi ${m.pinned ? 'bi-pin-angle' : 'bi-pin-fill'} me-1`} />
                {m.pinned ? 'Unpin' : 'Pin'}
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
        )}
      </div>
    );
  };

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1050, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div 
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable" 
        style={{ width: '90%', maxWidth: '600px', margin: '1.5rem auto' }} 
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
            <div className="d-flex gap-2 mb-3">
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

                {/* Search & Filter Bar */}
                <div className="d-flex gap-2 flex-wrap">
                  <div className="flex-grow-1 position-relative">
                    <i className="bi bi-search position-absolute text-secondary" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem' }} />
                    <input
                      type="text"
                      className="form-control form-control-sm bg-dark text-white border-secondary rounded-pill ps-4 shadow-none"
                      placeholder="Search messages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ fontSize: '0.8rem' }}
                    />
                  </div>
                  <select
                    className="form-select form-select-sm bg-dark text-white border-secondary rounded-pill shadow-none"
                    style={{ width: 'auto', fontSize: '0.8rem' }}
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    <option value="global_notice">Global Notices</option>
                    <option value="direct_notice">Direct Notices</option>
                    <option value="feedback">Feedback</option>
                    <option value="bug_report">Bug Reports</option>
                  </select>
                </div>

                {/* Bulk Actions Bar (Admin Only) */}
                {isAdmin && (
                  <div className="d-flex gap-2 align-items-center flex-wrap">
                    <button
                      className={`btn btn-sm rounded-pill px-3 ${bulkMode ? 'btn-outline-warning' : 'btn-outline-secondary'}`}
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
                    >
                      <i className={`bi ${bulkMode ? 'bi-x-lg' : 'bi-ui-checks'} me-1`} />
                      {bulkMode ? 'Cancel' : 'Select'}
                    </button>
                    {bulkMode && (
                      <>
                        <button className="btn btn-sm btn-outline-light rounded-pill px-3" style={{ fontSize: '0.75rem' }} onClick={selectAll}>
                          <i className="bi bi-check-all me-1" />
                          {selectedIds.size === filteredMessages.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <button className="btn btn-sm btn-outline-info rounded-pill px-3" style={{ fontSize: '0.75rem' }} onClick={handleBulkMarkRead} disabled={selectedIds.size === 0}>
                          <i className="bi bi-check2-circle me-1" />Read ({selectedIds.size})
                        </button>
                        <button className="btn btn-sm btn-outline-danger rounded-pill px-3" style={{ fontSize: '0.75rem' }} onClick={handleBulkDelete} disabled={selectedIds.size === 0}>
                          <i className="bi bi-trash me-1" />Delete ({selectedIds.size})
                        </button>
                      </>
                    )}
                  </div>
                )}

                {filteredMessages.length === 0 ? (
                  <div className="text-center text-secondary py-5">
                    <i className="bi bi-envelope-x fs-1 d-block mb-2" />
                    <p>{searchQuery || filterType !== 'all' ? 'No messages match your search.' : 'Your inbox is empty.'}</p>
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
