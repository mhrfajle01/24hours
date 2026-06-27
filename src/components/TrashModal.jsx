import React, { useState } from 'react';

// ─── Time-ago helper ──────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_COLORS = {
  Completed: { bg: '#d4f5e2', text: '#075E54', border: '#25D366' },
  Missed:    { bg: '#fdecea', text: '#b71c1c', border: '#ef5350' },
  Pending:   { bg: '#f5f5f5', text: '#555',    border: '#bbb' },
};

/**
 * TrashModal — shows all soft-deleted reports with restore, permanent delete,
 * restore-all and empty-trash capabilities. All confirmations are in-modal.
 */
export default function TrashModal({
  isOpen,
  onClose,
  trashItems,
  trashLoading,
  onRestore,
  onPermanentDelete,
  onEmptyTrash,
  onRestoreAll,
}) {
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [alert, setAlert] = useState({ show: false, type: 'success', msg: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  if (!isOpen) return null;

  const showAlert = (msg, type = 'success') => {
    setAlert({ show: true, type, msg });
    setTimeout(() => setAlert((a) => ({ ...a, show: false })), 3500);
  };

  const handleRestore = async (item) => {
    setProcessingId(item.id);
    try {
      await onRestore(item.id);
      showAlert(`Restored ${item.hour}:00 ${item.ampm} — ${item.date}`, 'success');
    } catch (err) {
      showAlert('Failed to restore item.', 'danger');
    } finally {
      setProcessingId(null);
    }
  };

  const handlePermanentDelete = async (id) => {
    setConfirmDeleteId(null);
    setProcessingId(id + '_del');
    try {
      await onPermanentDelete(id);
      showAlert('Permanently deleted.', 'info');
    } catch (err) {
      showAlert('Failed to delete.', 'danger');
    } finally {
      setProcessingId(null);
    }
  };

  const handleEmptyTrash = async () => {
    setConfirmEmpty(false);
    try {
      const count = await onEmptyTrash();
      showAlert(`Trash emptied — ${count} item(s) permanently removed.`, 'info');
    } catch (err) {
      showAlert('Failed to empty trash.', 'danger');
    }
  };

  const handleRestoreAll = async () => {
    try {
      const ids = trashItems.map((i) => i.id);
      await onRestoreAll(ids);
      showAlert(`Restored ${ids.length} item(s) successfully.`, 'success');
    } catch (err) {
      showAlert('Restore failed.', 'danger');
    }
  };

  const count = trashItems.length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop fade show animate-fade-in"
        style={{ zIndex: 1050 }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="modal fade show d-block animate-slide-up"
        style={{ zIndex: 1060 }}
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
      >
        <div
          className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
          style={{ maxWidth: '480px' }}
          role="document"
        >
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">

            {/* ── Header ── */}
            <div
              className="modal-header border-0 text-white"
              style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}
            >
              <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                <i className="bi bi-trash3-fill" />
                Trash
                {count > 0 && (
                  <span
                    className="badge rounded-pill ms-1 fw-bold"
                    style={{ backgroundColor: 'rgba(255,255,255,0.2)', fontSize: '0.78rem' }}
                  >
                    {count} item{count !== 1 ? 's' : ''}
                  </span>
                )}
              </h5>
              <button
                type="button"
                className="btn-close btn-close-white shadow-none"
                onClick={onClose}
                aria-label="Close"
              />
            </div>

            {/* ── Alert Banner ── */}
            {alert.show && (
              <div
                className={`alert alert-${alert.type} border-0 rounded-0 py-2 px-3 small d-flex align-items-center gap-2 mb-0 animate-fade-in`}
              >
                <i
                  className={`bi flex-shrink-0 ${
                    alert.type === 'success'
                      ? 'bi-check-circle-fill'
                      : alert.type === 'danger'
                      ? 'bi-exclamation-circle-fill'
                      : 'bi-info-circle-fill'
                  }`}
                />
                <span>{alert.msg}</span>
              </div>
            )}

            {/* ── Body ── */}
            <div
              className="modal-body bg-light p-3"
              style={{ maxHeight: '60vh', overflowY: 'auto' }}
            >

              {/* Confirm: Empty Trash */}
              {confirmEmpty && (
                <div className="border border-danger rounded-3 p-3 bg-danger bg-opacity-10 mb-3 animate-fade-in">
                  <p className="text-danger fw-bold small mb-1">
                    <i className="bi bi-exclamation-triangle-fill me-1" />
                    Permanently delete all {count} items? This cannot be undone.
                  </p>
                  <div className="d-flex gap-2 mt-2">
                    <button
                      className="btn btn-danger btn-sm rounded-pill px-3 fw-bold shadow-none"
                      onClick={handleEmptyTrash}
                    >
                      <i className="bi bi-trash3-fill me-1" />Empty All
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm rounded-pill px-3 fw-bold shadow-none"
                      onClick={() => setConfirmEmpty(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Bulk action row */}
              {count > 0 && !confirmEmpty && (
                <div className="d-flex gap-2 mb-3">
                  <button
                    className="btn btn-sm btn-outline-success rounded-pill fw-bold shadow-none flex-fill"
                    onClick={handleRestoreAll}
                    style={{ fontSize: '0.82rem' }}
                  >
                    <i className="bi bi-arrow-counterclockwise me-1" />Restore All
                  </button>
                  <button
                    className="btn btn-sm btn-outline-danger rounded-pill fw-bold shadow-none flex-fill"
                    onClick={() => setConfirmEmpty(true)}
                    style={{ fontSize: '0.82rem' }}
                  >
                    <i className="bi bi-trash3-fill me-1" />Empty Trash
                  </button>
                </div>
              )}

              {/* Loading */}
              {trashLoading && (
                <div className="text-center py-5">
                  <div className="spinner-border text-danger mb-2" role="status" />
                  <div className="text-secondary small">Loading trash...</div>
                </div>
              )}

              {/* Empty state */}
              {!trashLoading && count === 0 && (
                <div className="text-center py-5 px-3">
                  <div
                    className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
                    style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg,#f5f5f5,#ece5dd)' }}
                  >
                    <i className="bi bi-trash3 text-secondary" style={{ fontSize: '2.2rem' }} />
                  </div>
                  <h6 className="fw-bold text-dark mb-1">Trash is empty</h6>
                  <p className="text-muted small mb-0">
                    Deleted hour blocks appear here.<br />
                    You can restore or permanently remove them.
                  </p>
                </div>
              )}

              {/* Trash items */}
              {!trashLoading &&
                trashItems.map((item) => {
                  const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS.Pending;
                  const isRestoring = processingId === item.id;
                  const isDeleting = processingId === item.id + '_del';
                  const confirmingThisDelete = confirmDeleteId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-3 border mb-2 overflow-hidden animate-fade-in"
                      style={{ borderLeft: `4px solid ${sc.border} !important` }}
                    >
                      {/* Left accent bar */}
                      <div className="d-flex">
                        <div
                          style={{ width: '4px', flexShrink: 0, backgroundColor: sc.border }}
                        />
                        <div className="flex-grow-1 p-3">
                          {/* Row 1: badges + time */}
                          <div className="d-flex align-items-center justify-content-between gap-2 mb-1 flex-wrap">
                            <div className="d-flex align-items-center gap-2 flex-wrap">
                              <span
                                className="badge rounded-pill fw-bold"
                                style={{ backgroundColor: '#075E54', color: '#fff', fontSize: '0.78rem' }}
                              >
                                {item.hour}:00 {item.ampm}
                              </span>
                              <span className="text-secondary small">
                                <i className="bi bi-calendar3 me-1" />
                                {item.date}
                              </span>
                              <span
                                className="badge rounded-pill small"
                                style={{
                                  backgroundColor: sc.bg,
                                  color: sc.text,
                                  border: `1px solid ${sc.border}44`,
                                  fontSize: '0.7rem',
                                }}
                              >
                                {item.status}
                              </span>
                            </div>
                            <span className="text-muted" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                              <i className="bi bi-clock me-1" />
                              {timeAgo(item.deletedAt)}
                            </span>
                          </div>

                          {/* Plan preview */}
                          {item.plan ? (
                            <p
                              className="small text-dark mb-1"
                              style={{
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                lineHeight: '1.4',
                              }}
                            >
                              <i
                                className="bi bi-pencil-fill me-1"
                                style={{ color: '#25D366', fontSize: '0.7rem' }}
                              />
                              {item.plan}
                            </p>
                          ) : (
                            <p className="small text-muted fst-italic mb-1">No plan written</p>
                          )}

                          {/* Confirm permanent delete inline */}
                          {confirmingThisDelete ? (
                            <div className="bg-danger bg-opacity-10 rounded-2 p-2 mt-2 animate-fade-in">
                              <p className="text-danger small fw-bold mb-1" style={{ fontSize: '0.78rem' }}>
                                <i className="bi bi-exclamation-triangle-fill me-1" />
                                Permanently delete this item?
                              </p>
                              <div className="d-flex gap-1">
                                <button
                                  className="btn btn-danger btn-sm rounded-pill px-2 py-0 fw-bold shadow-none"
                                  style={{ fontSize: '0.72rem' }}
                                  onClick={() => handlePermanentDelete(item.id)}
                                >
                                  Yes, Delete
                                </button>
                                <button
                                  className="btn btn-outline-secondary btn-sm rounded-pill px-2 py-0 fw-bold shadow-none"
                                  style={{ fontSize: '0.72rem' }}
                                  onClick={() => setConfirmDeleteId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Action buttons */
                            <div className="d-flex gap-2 mt-2">
                              <button
                                className="btn btn-sm btn-outline-success rounded-pill px-3 fw-bold shadow-none"
                                style={{ fontSize: '0.76rem' }}
                                onClick={() => handleRestore(item)}
                                disabled={isRestoring || isDeleting}
                              >
                                {isRestoring ? (
                                  <span className="spinner-border spinner-border-sm" />
                                ) : (
                                  <><i className="bi bi-arrow-counterclockwise me-1" />Restore</>
                                )}
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger rounded-pill px-3 fw-bold shadow-none"
                                style={{ fontSize: '0.76rem' }}
                                onClick={() => setConfirmDeleteId(item.id)}
                                disabled={isRestoring || isDeleting}
                              >
                                {isDeleting ? (
                                  <span className="spinner-border spinner-border-sm" />
                                ) : (
                                  <><i className="bi bi-trash3-fill me-1" />Delete</>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* ── Footer ── */}
            <div className="modal-footer border-0 bg-light pt-0 pb-3 px-3 d-flex justify-content-center">
              <button
                type="button"
                className="btn text-white rounded-pill px-5 py-2 fw-bold shadow-sm hover-scale"
                style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
