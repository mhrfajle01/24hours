import React, { useState, useRef } from 'react';

/**
 * SettingsModal — handles app-level configuration only.
 * Profile & logout are moved to ProfileModal.
 * Uses custom in-modal popup alerts instead of native window.alert/confirm.
 */
export default function SettingsModal({
  isOpen,
  onClose,
  reports,
  selectedDate,
  onGenerateToday,
  onClearData,
  onImportData,
  onExportData,
}) {
  const fileInputRef = useRef(null);

  // Custom alert state
  const [alertBox, setAlertBox] = useState({ show: false, type: 'success', message: '' });

  // Custom confirm state for clear data
  const [confirmClear, setConfirmClear] = useState(false);

  // Custom confirm state for import
  const [pendingImport, setPendingImport] = useState(null); // null | { data, count }

  if (!isOpen) return null;

  const showAlert = (message, type = 'success') => {
    setAlertBox({ show: true, type, message });
    setTimeout(() => setAlertBox((a) => ({ ...a, show: false })), 4000);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);

        if (!Array.isArray(importedData)) {
          showAlert('Invalid file format. Expected a JSON array.', 'danger');
          return;
        }

        const isValid = importedData.every(
          (item) =>
            typeof item.hour === 'number' &&
            ['AM', 'PM'].includes(item.ampm) &&
            typeof item.plan === 'string' &&
            typeof item.report === 'string' &&
            ['Completed', 'Pending', 'Missed'].includes(item.status)
        );

        if (!isValid) {
          showAlert('Invalid data structure inside JSON. Make sure it contains valid HourLog entries.', 'danger');
          e.target.value = null;
          return;
        }

        // Show custom confirm instead of window.confirm
        setPendingImport({ data: importedData, count: importedData.length });
      } catch (err) {
        console.error(err);
        showAlert('Failed to parse JSON file: ' + err.message, 'danger');
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    try {
      await onImportData(pendingImport.data);
      showAlert(`${pendingImport.count} records imported successfully!`, 'success');
    } catch (err) {
      showAlert('Import failed: ' + err.message, 'danger');
    } finally {
      setPendingImport(null);
    }
  };

  const handleClearClick = () => {
    setConfirmClear(true);
  };

  const handleConfirmClear = async () => {
    setConfirmClear(false);
    try {
      await onClearData();
    } catch (err) {
      showAlert('Failed to clear data: ' + err.message, 'danger');
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop fade show animate-fade-in"
        style={{ zIndex: 1050 }}
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className="modal fade show d-block animate-slide-up"
        style={{ zIndex: 1060 }}
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">

            {/* Header */}
            <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
              <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                <i className="bi bi-gear-fill" />
                Settings
              </h5>
              <button
                type="button"
                className="btn-close btn-close-white shadow-none"
                onClick={onClose}
                aria-label="Close"
              />
            </div>

            {/* Body */}
            <div className="modal-body p-4 bg-light overflow-y-auto" style={{ maxHeight: '78vh' }}>

              {/* Custom Alert Banner */}
              {alertBox.show && (
                <div
                  className={`alert alert-${alertBox.type} border-0 rounded-3 py-2 px-3 small d-flex align-items-center gap-2 mb-3 animate-fade-in`}
                >
                  <i className={`bi ${alertBox.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'}`} />
                  <span>{alertBox.message}</span>
                </div>
              )}

              {/* Custom Import Confirm Popup */}
              {pendingImport && (
                <div className="border border-warning rounded-3 p-3 bg-warning bg-opacity-10 mb-3 animate-fade-in">
                  <p className="text-dark fw-bold small mb-1">
                    <i className="bi bi-upload me-1 text-warning" />
                    Import {pendingImport.count} records for <strong>{selectedDate}</strong>?
                  </p>
                  <p className="text-secondary small mb-2">This will replace all existing logs for this date.</p>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-warning rounded-pill px-3 py-1 fw-bold small shadow-none text-dark"
                      onClick={handleConfirmImport}
                    >
                      <i className="bi bi-check-lg me-1" />Yes, Import
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary rounded-pill px-3 py-1 fw-bold small shadow-none"
                      onClick={() => setPendingImport(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Clear Confirm Popup */}
              {confirmClear && (
                <div className="border border-danger rounded-3 p-3 bg-danger bg-opacity-10 mb-3 animate-fade-in">
                  <p className="text-danger fw-bold small mb-1">
                    <i className="bi bi-exclamation-triangle-fill me-1" />
                    Clear all logs for <strong>{selectedDate}</strong>?
                  </p>
                  <p className="text-secondary small mb-2">This action cannot be undone.</p>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-danger rounded-pill px-3 py-1 fw-bold small shadow-none"
                      onClick={handleConfirmClear}
                    >
                      <i className="bi bi-trash3-fill me-1" />Yes, Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary rounded-pill px-3 py-1 fw-bold small shadow-none"
                      onClick={() => setConfirmClear(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Theme Selector */}
              <div className="mb-3 bg-white p-3 rounded-4 shadow-sm border">
                <h6 className="fw-bold text-dark mb-2 d-flex align-items-center gap-2">
                  <i className="bi bi-palette-fill" style={{ color: '#075E54' }} />
                  Theme Mode
                </h6>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-secondary small">Select display theme</span>
                  <div className="btn-group btn-group-sm" role="group">
                    <button
                      type="button"
                      className="btn btn-success px-3 active"
                      style={{ backgroundColor: '#075E54', borderColor: '#075E54' }}
                    >
                      <i className="bi bi-sun-fill me-1" />Light
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary px-3"
                      disabled
                    >
                      <i className="bi bi-moon-fill me-1" />Dark
                      <span className="ms-1" style={{ fontSize: '0.65rem' }}>(Soon)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions on Current Date */}
              <div className="mb-3 bg-white p-3 rounded-4 shadow-sm border">
                <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-calendar-event-fill" style={{ color: '#075E54' }} />
                  Actions for {selectedDate}
                </h6>
                <div className="d-grid gap-2">
                  <button
                    className="btn btn-outline-success text-start py-2 rounded-3 d-flex align-items-center justify-content-between shadow-none"
                    onClick={onGenerateToday}
                  >
                    <span className="small fw-semibold">
                      <i className="bi bi-magic me-2" />Auto-Generate Hour Blocks
                    </span>
                    <i className="bi bi-chevron-right text-muted small" />
                  </button>
                  <button
                    className="btn btn-outline-danger text-start py-2 rounded-3 d-flex align-items-center justify-content-between shadow-none"
                    onClick={handleClearClick}
                    disabled={confirmClear}
                  >
                    <span className="small fw-semibold">
                      <i className="bi bi-trash3-fill me-2" />Clear Today's Logs
                    </span>
                    <i className="bi bi-chevron-right text-muted small" />
                  </button>
                </div>
              </div>

              {/* Backup / Export / Import */}
              <div className="mb-3 bg-white p-3 rounded-4 shadow-sm border">
                <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-cloud-arrow-up-fill" style={{ color: '#075E54' }} />
                  Backup &amp; Restore
                </h6>
                <div className="row g-2">
                  <div className="col-6">
                    <button
                      className="btn btn-outline-secondary w-100 py-2 rounded-3 fw-bold small shadow-none"
                      onClick={onExportData}
                      disabled={reports.length === 0}
                      title="Download reports as JSON"
                    >
                      <i className="bi bi-download me-1" />Export JSON
                    </button>
                  </div>
                  <div className="col-6">
                    <button
                      className="btn btn-outline-secondary w-100 py-2 rounded-3 fw-bold small shadow-none"
                      onClick={handleImportClick}
                      title="Upload JSON to restore reports"
                    >
                      <i className="bi bi-upload me-1" />Import JSON
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".json"
                      className="d-none"
                    />
                  </div>
                </div>
              </div>

              {/* About App */}
              <div className="bg-white p-3 rounded-4 shadow-sm text-center border">
                <div
                  className="rounded-circle d-inline-flex align-items-center justify-content-center mb-2"
                  style={{ width: '44px', height: '44px', backgroundColor: '#075E54' }}
                >
                  <i className="bi bi-chat-left-text-fill text-white fs-5" />
                </div>
                <h6 className="fw-bold text-dark mb-1">HourLog Tracker</h6>
                <p className="text-secondary mb-1" style={{ fontSize: '0.8rem' }}>Version 1.3.0</p>
                <p className="text-muted m-0" style={{ fontSize: '0.75rem' }}>
                  Built with React, Vite &amp; Firebase
                </p>
              </div>

            </div>

            {/* Footer */}
            <div className="modal-footer border-0 bg-light pt-0 pb-3 px-4 d-flex justify-content-center">
              <button
                type="button"
                className="btn text-white rounded-pill px-5 py-2 fw-bold shadow-sm hover-scale"
                style={{ backgroundColor: '#075E54' }}
                onClick={onClose}
              >
                Close Settings
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
