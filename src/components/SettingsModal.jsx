import React, { useState, useRef } from 'react';
import { generatePDF } from '../utils/pdfGenerator';
import TagDropdown from './TagDropdown';

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
  currentUser,
  onGenerateToday,
  onClearData,
  onImportData,
  onExportData,
  dictionaryData = [],
  onUpdateDictionary,
  onTriggerPendingReview,
  theme,
  onThemeChange,
}) {
  const fileInputRef = useRef(null);

  // Suggestions dictionary CRUD states
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);

  // Add form inputs
  const [newTag, setNewTag] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newPlanEn, setNewPlanEn] = useState('');
  const [newPlanBn, setNewPlanBn] = useState('');
  const [newReportEn, setNewReportEn] = useState('');
  const [newReportBn, setNewReportBn] = useState('');

  // Edit form inputs
  const [editTag, setEditTag] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editPlanEn, setEditPlanEn] = useState('');
  const [editPlanBn, setEditPlanBn] = useState('');
  const [editReportEn, setEditReportEn] = useState('');
  const [editReportBn, setEditReportBn] = useState('');

  // PDF Export settings state
  const [pdfTemplateType, setPdfTemplateType] = useState('report');
  const [englishFont, setEnglishFont] = useState('Outfit');
  const [banglaFont, setBanglaFont] = useState('Noto Sans Bengali');
  const [pdfTheme, setPdfTheme] = useState('teal');
  const [isExportingPDF, setIsExportingPDF] = useState(false);

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

  const handleExportPDFClick = async () => {
    setIsExportingPDF(true);
    try {
      await generatePDF(reports, selectedDate, currentUser, {
        templateType: pdfTemplateType,
        englishFont,
        banglaFont,
        theme: pdfTheme
      });
      showAlert('PDF report exported successfully!', 'success');
    } catch (err) {
      console.error(err);
      showAlert('PDF generation failed: ' + err.message, 'danger');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Suggestions Dictionary Operations
  const handleAddEntry = async () => {
    if (!newTag || !newKeywords || !newPlanEn || !newPlanBn) {
      showAlert('Please fill in required fields.', 'danger');
      return;
    }
    const kwArray = newKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (kwArray.length === 0) {
      showAlert('Please enter at least one keyword.', 'danger');
      return;
    }
    
    const newItem = {
      tag: newTag.trim().toLowerCase(),
      keywords: kwArray,
      plan_en: newPlanEn.trim(),
      plan_bn: newPlanBn.trim(),
      report_en: newReportEn.trim() || newPlanEn.trim(),
      report_bn: newReportBn.trim() || newPlanBn.trim(),
    };

    const updatedList = [newItem, ...dictionaryData];
    try {
      await onUpdateDictionary(updatedList);
      showAlert('New suggestion added!', 'success');
      setNewTag('');
      setNewKeywords('');
      setNewPlanEn('');
      setNewPlanBn('');
      setNewReportEn('');
      setNewReportBn('');
      setShowAddForm(false);
    } catch (err) {
      showAlert('Failed to add suggestion: ' + err.message, 'danger');
    }
  };

  const handleStartEdit = (index, entry) => {
    setEditingIndex(index);
    setEditTag(entry.tag || '');
    setEditKeywords((entry.keywords || []).join(', '));
    setEditPlanEn(entry.plan_en || '');
    setEditPlanBn(entry.plan_bn || '');
    setEditReportEn(entry.report_en || '');
    setEditReportBn(entry.report_bn || '');
  };

  const handleSaveEdit = async (index) => {
    const kwArray = editKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (kwArray.length === 0) {
      showAlert('Please enter at least one keyword.', 'danger');
      return;
    }
    
    const updatedItem = {
      tag: editTag.trim().toLowerCase(),
      keywords: kwArray,
      plan_en: editPlanEn.trim(),
      plan_bn: editPlanBn.trim(),
      report_en: editReportEn.trim() || editPlanEn.trim(),
      report_bn: editReportBn.trim() || editPlanBn.trim(),
    };

    const updatedList = [...dictionaryData];
    updatedList[index] = updatedItem;
    
    try {
      await onUpdateDictionary(updatedList);
      showAlert('Suggestion updated!', 'success');
      setEditingIndex(null);
    } catch (err) {
      showAlert('Failed to update: ' + err.message, 'danger');
    }
  };

  const handleDeleteEntry = async (index) => {
    const updatedList = dictionaryData.filter((_, idx) => idx !== index);
    try {
      await onUpdateDictionary(updatedList);
      showAlert('Suggestion deleted!', 'success');
      setEditingIndex(null);
    } catch (err) {
      showAlert('Failed to delete: ' + err.message, 'danger');
    }
  };

  const handleResetDictionary = async () => {
    try {
      await onUpdateDictionary([]);
      showAlert('Dictionary reset to default!', 'success');
    } catch (err) {
      showAlert('Reset failed: ' + err.message, 'danger');
    }
  };

  const filteredEntries = dictionaryData.filter(entry => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (entry.tag || '').toLowerCase().includes(q) ||
      (entry.keywords || []).some(kw => kw.toLowerCase().includes(q)) ||
      (entry.plan_en || '').toLowerCase().includes(q) ||
      (entry.plan_bn || '').includes(q)
    );
  });

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
                <p className="text-secondary small mb-2">Select display theme for the app.</p>
                <div className="d-grid gap-2">
                  {/* Light Theme */}
                  <button
                    type="button"
                    id="theme-light"
                    onClick={() => onThemeChange && onThemeChange('light')}
                    className={`btn d-flex align-items-center gap-2 rounded-3 py-2 px-3 text-start border ${theme === 'light' ? 'btn-success' : 'btn-outline-secondary'}`}
                    style={theme === 'light' ? { backgroundColor: '#075E54', borderColor: '#075E54' } : {}}
                  >
                    <i className="bi bi-sun-fill" />
                    <div>
                      <div className="fw-semibold small">Light</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Default clean & minimal</div>
                    </div>
                    {theme === 'light' && <i className="bi bi-check-circle-fill ms-auto" />}
                  </button>

                  {/* Dark Theme - Soon */}
                  <button
                    type="button"
                    id="theme-dark"
                    className="btn btn-outline-secondary d-flex align-items-center gap-2 rounded-3 py-2 px-3 text-start"
                    disabled
                  >
                    <i className="bi bi-moon-stars-fill" />
                    <div>
                      <div className="fw-semibold small">Dark <span style={{ fontSize: '0.65rem' }} className="badge bg-secondary ms-1">Soon</span></div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>Dark mode coming soon</div>
                    </div>
                  </button>

                  {/* Islamic Vibe Theme */}
                  <button
                    type="button"
                    id="theme-islamic"
                    onClick={() => onThemeChange && onThemeChange('islamic')}
                    className={`btn d-flex align-items-center gap-2 rounded-3 py-2 px-3 text-start border ${theme === 'islamic' ? 'text-white border-warning' : 'btn-outline-secondary'}`}
                    style={theme === 'islamic'
                      ? { background: 'linear-gradient(135deg, #022c22, #064e3b)', borderColor: '#d97706' }
                      : {}}
                  >
                    <i className="bi bi-moon-stars-fill" style={{ color: theme === 'islamic' ? '#d97706' : undefined }} />
                    <div>
                      <div className={`fw-semibold small ${theme === 'islamic' ? 'text-warning' : ''}`}>
                        🌙 Islamic Vibe (Noor)
                      </div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.8 }} className={theme === 'islamic' ? 'text-white-50' : ''}>
                        Emerald &amp; Gold • Prayer Checklist included
                      </div>
                    </div>
                    {theme === 'islamic' && <i className="bi bi-check-circle-fill ms-auto text-warning" />}
                  </button>
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
                    className="btn text-start py-2 rounded-3 d-flex align-items-center justify-content-between shadow-none border"
                    style={{ borderColor: '#FFC107', color: '#856404', backgroundColor: '#FFFBEA' }}
                    onClick={() => {
                      onTriggerPendingReview?.();
                      onClose();
                    }}
                  >
                    <span className="small fw-semibold">
                      <i className="bi bi-clock-history me-2" style={{ color: '#FFC107' }} />
                      Review Pending Blocks
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

              {/* Security Scan Section */}
              <div className="mb-3 bg-white p-3 rounded-4 shadow-sm border">
                <h6 className="fw-bold text-dark mb-2.5 d-flex align-items-center gap-2">
                  <i className="bi bi-shield-lock-fill text-danger fs-5" />
                  Security Timing-Block Scan
                </h6>
                <p className="text-secondary small mb-3" style={{ fontSize: '0.7rem', lineHeight: '1.4' }}>
                  Scan the UI structure for any previous timing blocks (Pending / Completed) missing tag closures.
                </p>
                <button
                  type="button"
                  className="btn btn-danger w-100 py-2 rounded-3 fw-bold small shadow-none d-flex align-items-center justify-content-center gap-2 text-white border-0"
                  style={{ backgroundColor: '#DC3545', transition: 'all 0.2s' }}
                  onClick={() => {
                    if (window.triggerManualSecurityScan) {
                      window.triggerManualSecurityScan();
                    } else {
                      showAlert('Scan service starting...', 'success');
                    }
                  }}
                >
                  <i className="bi bi-shield-fill-exclamation" />
                  Scan Now (ম্যানুয়াল স্ক্যান)
                </button>
              </div>

              {/* PDF Export Section */}
              <div className="mb-3 bg-white p-3 rounded-4 shadow-sm border">
                <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-file-pdf-fill text-danger fs-5" />
                  PDF Export (রিপোর্ট ডাউনলোড)
                </h6>
                
                {/* PDF Template Type */}
                <div className="mb-3">
                  <label className="text-secondary small fw-bold mb-1 d-block">Template Type / রিপোর্টের ধরন</label>
                  <select
                    className="form-select form-select-sm rounded-3 shadow-none text-dark bg-white border"
                    value={pdfTemplateType}
                    onChange={(e) => setPdfTemplateType(e.target.value)}
                  >
                    <option value="report">Hourly Report (দৈনিক প্রতিবেদন - Plan & Report)</option>
                    <option value="plan">Hourly Plan Only (কর্মপরিকল্পনা - Plan Only)</option>
                  </select>
                </div>

                {/* PDF Theme */}
                <div className="mb-3">
                  <label className="text-secondary small fw-bold mb-1 d-block">Styling Theme / থিম কালার</label>
                  <select
                    className="form-select form-select-sm rounded-3 shadow-none text-dark bg-white border"
                    value={pdfTheme}
                    onChange={(e) => setPdfTheme(e.target.value)}
                  >
                    <option value="teal">WhatsApp Teal (টিয়াল)</option>
                    <option value="charcoal">Modern Slate/Charcoal (ধূসর)</option>
                    <option value="royal">Royal Purple/Lavender (বেগুনী)</option>
                    <option value="sakura">Sakura Rose/Pink (গোলাপী)</option>
                    <option value="minimalist">Classic Minimalist (সাদা-কালো)</option>
                  </select>
                </div>

                <div className="row g-2 mb-3">
                  {/* English Font */}
                  <div className="col-6">
                    <label className="text-secondary small fw-bold mb-1 d-block" style={{ fontSize: '0.72rem' }}>English Font / ইংরেজি ফন্ট</label>
                    <select
                      className="form-select form-select-sm rounded-3 shadow-none text-dark bg-white border"
                      value={englishFont}
                      onChange={(e) => setEnglishFont(e.target.value)}
                      style={{ fontSize: '0.8rem' }}
                    >
                      <option value="Outfit">Outfit (Default)</option>
                      <option value="Inter">Inter (Sans)</option>
                      <option value="Poppins">Poppins (Geom)</option>
                      <option value="Roboto">Roboto (Clean)</option>
                      <option value="Playfair Display">Playfair (Serif)</option>
                      <option value="Lora">Lora (Serif)</option>
                      <option value="Courier New">Courier (Mono)</option>
                    </select>
                  </div>

                  {/* Bangla Font */}
                  <div className="col-6">
                    <label className="text-secondary small fw-bold mb-1 d-block" style={{ fontSize: '0.72rem' }}>Bangla Font / বাংলা ফন্ট</label>
                    <select
                      className="form-select form-select-sm rounded-3 shadow-none text-dark bg-white border"
                      value={banglaFont}
                      onChange={(e) => setBanglaFont(e.target.value)}
                      style={{ fontSize: '0.8rem' }}
                    >
                      <option value="Noto Sans Bengali">Noto Sans</option>
                      <option value="Hind Siliguri">Hind Siliguri</option>
                      <option value="Noto Serif Bengali">Noto Serif</option>
                      <option value="Tiro Bangla">Tiro Bangla</option>
                      <option value="Mina">Mina</option>
                      <option value="Atma">Atma</option>
                    </select>
                  </div>
                </div>

                {/* Download PDF Button */}
                <button
                  type="button"
                  className="btn btn-danger w-100 py-2 rounded-3 fw-bold small shadow-none d-flex align-items-center justify-content-center gap-2 hover-scale text-white border-0"
                  style={{ backgroundColor: '#DC3545', transition: 'all 0.2s' }}
                  onClick={handleExportPDFClick}
                  disabled={reports.length === 0 || isExportingPDF}
                >
                  {isExportingPDF ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                      Generating PDF...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-file-earmark-pdf-fill" />
                      Download PDF (ডাউনলোড করুন)
                    </>
                  )}
                </button>
                {reports.length === 0 && (
                  <div className="text-muted text-center small mt-2" style={{ fontSize: '0.7rem' }}>
                    * Add hourly logs first to enable PDF export.
                  </div>
                )}
              </div>

              {/* Suggestion Dictionary Editor */}
              <div className="mb-3 bg-white p-3 rounded-4 shadow-sm border">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold text-dark m-0 d-flex align-items-center gap-2">
                    <i className="bi bi-tags-fill" style={{ color: '#075E54' }} />
                    Tag Library
                    <span
                      className="badge rounded-pill fw-bold"
                      style={{ backgroundColor: '#DCF8C6', color: '#065F46', fontSize: '0.65rem' }}
                    >
                      {dictionaryData.length || 0}
                    </span>
                  </h6>
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-danger text-decoration-none p-0 fw-bold small shadow-none border-0"
                    onClick={handleResetDictionary}
                    style={{ fontSize: '0.72rem' }}
                    title="Revert all changes to default entries"
                  >
                    <i className="bi bi-arrow-counterclockwise"></i> Reset
                  </button>
                </div>

                <p className="text-secondary small mb-3" style={{ fontSize: '0.7rem', lineHeight: '1.4' }}>
                  Manage tags and templates used by the suggestions helper. Search, add, edit, or delete entries. Supports both English and Bengali keywords.
                </p>

                {/* Add Entry Button */}
                {!showAddForm && (
                  <button
                    type="button"
                    className="btn btn-sm btn-success w-100 mb-3 rounded-3 fw-bold border-0 text-white d-flex align-items-center justify-content-center gap-1 py-1.5 shadow-none"
                    style={{ backgroundColor: '#128C7E' }}
                    onClick={() => {
                      setShowAddForm(true);
                      setEditingIndex(null);
                    }}
                  >
                    <i className="bi bi-plus-lg"></i> Add New Suggestion / নতুন যোগ করুন
                  </button>
                )}

                {/* Add Entry Form */}
                {showAddForm && (
                  <div className="border border-success rounded-3 p-3 mb-3 animate-fade-in text-start" style={{ backgroundColor: '#F0FDF4' }}>
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <div
                        className="rounded-circle d-flex align-items-center justify-content-center"
                        style={{ width: '28px', height: '28px', backgroundColor: '#075E54', flexShrink: 0 }}
                      >
                        <i className="bi bi-plus-lg text-white" style={{ fontSize: '0.75rem' }} />
                      </div>
                      <h6 className="fw-bold m-0" style={{ color: '#065F46', fontSize: '0.82rem' }}>New Tag Entry</h6>
                    </div>

                    {/* Tag name row */}
                    <div className="mb-2">
                      <label className="text-secondary fw-bold mb-1 d-block" style={{ fontSize: '0.68rem' }}>
                        Tag Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3 border shadow-none"
                        placeholder="e.g. work, পড়াশোনা"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        style={{ fontFamily: "'Noto Sans Bengali', 'Outfit', sans-serif" }}
                      />
                      <div className="text-muted mt-1" style={{ fontSize: '0.63rem' }}>
                        Use an existing tag name to add more keywords, or create a brand new tag.
                      </div>
                    </div>

                    {/* Keywords */}
                    <div className="mb-2">
                      <label className="text-secondary fw-bold mb-1 d-block" style={{ fontSize: '0.68rem' }}>
                        Keywords <span className="text-danger">*</span> <span className="fw-normal">(comma separated, English &amp; Bengali)</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3 border shadow-none"
                        placeholder="e.g. gym, walk, ব্যায়াম, হাঁটা"
                        value={newKeywords}
                        onChange={(e) => setNewKeywords(e.target.value)}
                        style={{ fontFamily: "'Noto Sans Bengali', 'Outfit', sans-serif" }}
                      />
                    </div>

                    {/* Plan templates */}
                    <div className="mb-2">
                      <label className="text-secondary fw-bold mb-1 d-block" style={{ fontSize: '0.68rem' }}>
                        Plan Template <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3 border shadow-none mb-1"
                        placeholder="🇧🇩 বাংলা প্ল্যান টেমপ্লেট"
                        value={newPlanBn}
                        onChange={(e) => setNewPlanBn(e.target.value)}
                        style={{ fontFamily: "'Noto Sans Bengali', 'Outfit', sans-serif" }}
                      />
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3 border shadow-none"
                        placeholder="🇬🇧 English Plan Template"
                        value={newPlanEn}
                        onChange={(e) => setNewPlanEn(e.target.value)}
                      />
                    </div>

                    {/* Report templates */}
                    <div className="mb-3">
                      <label className="text-secondary fw-bold mb-1 d-block" style={{ fontSize: '0.68rem' }}>
                        Report Template <span className="fw-normal text-muted">(optional)</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3 border shadow-none mb-1"
                        placeholder="🇧🇩 বাংলা রিপোর্ট (না দিলে প্ল্যান ব্যবহার হবে)"
                        value={newReportBn}
                        onChange={(e) => setNewReportBn(e.target.value)}
                        style={{ fontFamily: "'Noto Sans Bengali', 'Outfit', sans-serif" }}
                      />
                      <input
                        type="text"
                        className="form-control form-control-sm rounded-3 border shadow-none"
                        placeholder="🇬🇧 English Report (optional)"
                        value={newReportEn}
                        onChange={(e) => setNewReportEn(e.target.value)}
                      />
                    </div>

                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm text-white border-0 fw-bold rounded-pill px-3 py-1 d-flex align-items-center gap-1"
                        style={{ backgroundColor: '#075E54', fontSize: '0.75rem' }}
                        onClick={handleAddEntry}
                      >
                        <i className="bi bi-check-lg" /> Save Tag
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary rounded-pill px-3 py-1 fw-bold"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setShowAddForm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Search Bar with TagDropdown */}
                <div className="mb-2">
                  <TagDropdown
                    dictionaryData={dictionaryData}
                    selectedTags={searchQuery ? [searchQuery] : []}
                    onChange={(tags) => setSearchQuery(tags[0] || '')}
                    placeholder="Search tags, keywords, or Bengali text..."
                    multiSelect={false}
                  />
                  {searchQuery && (
                    <div className="d-flex align-items-center gap-1 mt-1" style={{ fontSize: '0.68rem' }}>
                      <span className="text-secondary">Filtering by:</span>
                      <span
                        className="badge rounded-pill fw-bold"
                        style={{ backgroundColor: '#DCF8C6', color: '#065F46', fontSize: '0.65rem' }}
                      >
                        #{searchQuery}
                      </span>
                      <button
                        type="button"
                        className="btn btn-link p-0 text-danger text-decoration-none fw-bold border-0 shadow-none"
                        style={{ fontSize: '0.65rem' }}
                        onClick={() => setSearchQuery('')}
                      >
                        ✕ Clear
                      </button>
                    </div>
                  )}
                </div>

                {/* Dictionary Scrollable List */}
                <div className="overflow-y-auto px-1 border rounded-3 bg-light" style={{ maxHeight: '220px' }}>
                  {filteredEntries.length === 0 ? (
                    <div className="text-muted text-center py-4 small">No matching items found.</div>
                  ) : (
                    filteredEntries.map((entry, idx) => {
                      const actualIndex = dictionaryData.findIndex(item => item === entry);
                      const isEditing = editingIndex === actualIndex;
                      
                      if (isEditing) {
                        return (
                          <div key={idx} className="border-bottom p-2.5 bg-warning bg-opacity-10 rounded-3 my-1.5 animate-slide-up text-start">
                            <div className="row g-2 mb-2">
                              <div className="col-6">
                                <label className="text-secondary small fw-bold mb-0.5" style={{ fontSize: '0.68rem' }}>Tag</label>
                                <input
                                  type="text"
                                  className="form-control form-control-sm border py-1 shadow-none bg-white"
                                  value={editTag}
                                  onChange={(e) => setEditTag(e.target.value)}
                                />
                              </div>
                              <div className="col-6">
                                <label className="text-secondary small fw-bold mb-0.5" style={{ fontSize: '0.68rem' }}>Keywords</label>
                                <input
                                  type="text"
                                  className="form-control form-control-sm border py-1 shadow-none bg-white"
                                  value={editKeywords}
                                  onChange={(e) => setEditKeywords(e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="mb-2">
                              <label className="text-secondary small fw-bold mb-0.5" style={{ fontSize: '0.68rem' }}>Plan (EN &amp; BN)</label>
                              <input
                                type="text"
                                className="form-control form-control-sm border py-1 shadow-none mb-1 bg-white"
                                value={editPlanEn}
                                onChange={(e) => setEditPlanEn(e.target.value)}
                              />
                              <input
                                type="text"
                                className="form-control form-control-sm border py-1 shadow-none bg-white"
                                value={editPlanBn}
                                onChange={(e) => setEditPlanBn(e.target.value)}
                              />
                            </div>
                            <div className="mb-3">
                              <label className="text-secondary small fw-bold mb-0.5" style={{ fontSize: '0.68rem' }}>Report (EN &amp; BN)</label>
                              <input
                                type="text"
                                className="form-control form-control-sm border py-1 shadow-none mb-1 bg-white"
                                value={editReportEn}
                                onChange={(e) => setEditReportEn(e.target.value)}
                              />
                              <input
                                type="text"
                                className="form-control form-control-sm border py-1 shadow-none bg-white"
                                value={editReportBn}
                                onChange={(e) => setEditReportBn(e.target.value)}
                              />
                            </div>
                            <div className="d-flex justify-content-between align-items-center">
                              <div className="d-flex gap-1.5">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success rounded-pill px-3 py-0.5 text-white border-0 fw-bold me-1"
                                  style={{ backgroundColor: '#075E54', fontSize: '0.72rem' }}
                                  onClick={() => handleSaveEdit(actualIndex)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary rounded-pill px-3 py-0.5 fw-bold"
                                  style={{ fontSize: '0.72rem' }}
                                  onClick={() => setEditingIndex(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-link text-danger p-0 text-decoration-none small fw-bold border-0 shadow-none"
                                style={{ fontSize: '0.72rem' }}
                                onClick={() => handleDeleteEntry(actualIndex)}
                              >
                                <i className="bi bi-trash-fill" /> Delete
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // Compute a consistent color for this tag
                      const TAG_COLORS = [
                        { bg: '#DCF8C6', text: '#065F46' },
                        { bg: '#DBEAFE', text: '#1E40AF' },
                        { bg: '#FEF3C7', text: '#92400E' },
                        { bg: '#FCE7F3', text: '#9D174D' },
                        { bg: '#EDE9FE', text: '#5B21B6' },
                        { bg: '#FEE2E2', text: '#991B1B' },
                        { bg: '#D1FAE5', text: '#065F46' },
                        { bg: '#E0F2FE', text: '#075985' },
                      ];
                      let tagHash = 0;
                      for (let i = 0; i < (entry.tag || '').length; i++)
                        tagHash = entry.tag.charCodeAt(i) + ((tagHash << 5) - tagHash);
                      const tagColor = TAG_COLORS[Math.abs(tagHash) % TAG_COLORS.length];

                      return (
                        <div
                          key={idx}
                          className="border-bottom p-2 bg-white rounded-2 my-1 transition-all text-start"
                          onClick={() => handleStartEdit(actualIndex, entry)}
                          style={{
                            cursor: 'pointer',
                            borderLeft: '3px solid transparent',
                            transition: 'border-color 0.15s ease, background 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#F0FDF4';
                            e.currentTarget.style.borderLeftColor = '#075E54';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#fff';
                            e.currentTarget.style.borderLeftColor = 'transparent';
                          }}
                          title="Click to edit"
                        >
                          <div className="d-flex align-items-center gap-2 mb-1">
                            <span
                              className="badge rounded-pill fw-bold"
                              style={{
                                backgroundColor: tagColor.bg,
                                color: tagColor.text,
                                fontSize: '0.62rem',
                                letterSpacing: '0.02em',
                              }}
                            >
                              #{entry.tag}
                            </span>
                            <div
                              className="d-flex flex-wrap gap-1 flex-grow-1"
                              style={{ overflow: 'hidden' }}
                            >
                              {(entry.keywords || []).slice(0, 5).map((kw) => (
                                <span
                                  key={kw}
                                  className="rounded-pill"
                                  style={{
                                    backgroundColor: '#F3F4F6',
                                    color: '#4B5563',
                                    fontSize: '0.58rem',
                                    padding: '1px 6px',
                                    fontWeight: 600,
                                  }}
                                >
                                  {kw}
                                </span>
                              ))}
                              {(entry.keywords || []).length > 5 && (
                                <span style={{ fontSize: '0.58rem', color: '#9CA3AF' }}>
                                  +{entry.keywords.length - 5}
                                </span>
                              )}
                            </div>
                            <span className="text-muted ms-auto" style={{ fontSize: '0.6rem', flexShrink: 0 }}>
                              <i className="bi bi-pencil-fill" />
                            </span>
                          </div>
                          <div
                            className="text-muted text-truncate"
                            style={{
                              fontSize: '0.7rem',
                              fontFamily: "'Noto Sans Bengali', 'Outfit', sans-serif",
                            }}
                          >
                            🇧🇩 {entry.plan_bn}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Tag Analysis Dashboard */}
              <div className="mb-3 bg-white p-3 rounded-4 shadow-sm border text-start">
                <h6 className="fw-bold text-dark mb-2.5 d-flex align-items-center gap-2">
                  <i className="bi bi-bar-chart-line-fill" style={{ color: '#075E54' }} />
                  Tag Analysis Dashboard (ট্যাগ বিশ্লেষণ)
                </h6>
                <p className="text-secondary small mb-3" style={{ fontSize: '0.7rem', lineHeight: '1.4' }}>
                  A dynamic analysis of your active task categories for today. Helps track where you spend your time.
                </p>

                {(() => {
                  // Compile tag statistics from active reports
                  const tagStats = {};
                  let totalCount = 0;

                  reports.forEach((r) => {
                    // Detect tag (check explicit tag field first, fallback to matching report content)
                    let activeTag = r.tag;
                    if (!activeTag && r.report) {
                      const matched = (dictionaryData || []).find(d => 
                        (d.report_bn && d.report_bn === r.report) ||
                        (d.plan_bn && d.plan_bn === r.report) ||
                        (d.report_en && d.report_en === r.report) ||
                        (d.plan_en && d.plan_en === r.report)
                      );
                      if (matched) activeTag = matched.tag;
                    }

                    if (!activeTag) return; // skip untagged/pending empty blocks

                    totalCount++;
                    if (!tagStats[activeTag]) {
                      tagStats[activeTag] = { count: 0, completed: 0, missed: 0 };
                    }
                    tagStats[activeTag].count++;
                    if (r.status === 'Completed') {
                      tagStats[activeTag].completed++;
                    } else if (r.status === 'Missed') {
                      tagStats[activeTag].missed++;
                    }
                  });

                  if (totalCount === 0) {
                    return (
                      <div className="text-muted text-center py-4 small" style={{ backgroundColor: '#F9FAFB', borderRadius: '8px' }}>
                        <i className="bi bi-pie-chart text-secondary mb-2 d-block" style={{ fontSize: '1.5rem' }}></i>
                        No tags logged today yet / আজকে কোনো ট্যাগ পাওয়া যায়নি।
                      </div>
                    );
                  }

                  // Sort tags by frequency
                  const sortedStats = Object.entries(tagStats).sort((a, b) => b[1].count - a[1].count);

                  return (
                    <div className="d-flex flex-column gap-3 mt-2">
                      <div className="d-flex align-items-center justify-content-between p-2.5 rounded-3" style={{ backgroundColor: '#E8F5E9', border: '1px solid #C8E6C9' }}>
                        <div>
                          <div className="fw-bold text-success" style={{ fontSize: '0.8rem' }}>Total Tagged Blocks</div>
                          <div className="text-secondary" style={{ fontSize: '0.65rem' }}>Number of active categories today</div>
                        </div>
                        <span className="fs-4 fw-bold text-success">{totalCount}</span>
                      </div>

                      <div className="d-flex flex-column gap-2">
                        {sortedStats.map(([tagName, stats]) => {
                          const percentage = Math.round((stats.count / totalCount) * 100);
                          const completionRate = stats.count > 0 ? Math.round((stats.completed / stats.count) * 100) : 0;
                          
                          // Consistent tag color
                          const TAG_COLORS = [
                            { bg: '#DCF8C6', text: '#065F46', bar: '#25D366' },
                            { bg: '#DBEAFE', text: '#1E40AF', bar: '#3B82F6' },
                            { bg: '#FEF3C7', text: '#92400E', bar: '#F59E0B' },
                            { bg: '#FCE7F3', text: '#9D174D', bar: '#EC4899' },
                            { bg: '#EDE9FE', text: '#5B21B6', bar: '#8B5CF6' },
                            { bg: '#FEE2E2', text: '#991B1B', bar: '#EF4444' },
                            { bg: '#D1FAE5', text: '#065F46', bar: '#10B981' },
                            { bg: '#E0F2FE', text: '#075985', bar: '#0EA5E9' },
                          ];
                          let hash = 0;
                          for (let i = 0; i < tagName.length; i++) hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
                          const color = TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];

                          return (
                            <div key={tagName} className="p-2 border rounded-3 bg-white shadow-xs">
                              <div className="d-flex align-items-center justify-content-between mb-1.5">
                                <span className="badge rounded-pill fw-bold text-uppercase" style={{ backgroundColor: color.bg, color: color.text, fontSize: '0.63rem' }}>
                                  #{tagName}
                                </span>
                                <div className="text-secondary fw-semibold" style={{ fontSize: '0.68rem' }}>
                                  {stats.count} block{stats.count !== 1 ? 's' : ''} ({percentage}%)
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="progress mb-1" style={{ height: '6px', borderRadius: '999px', backgroundColor: '#F3F4F6' }}>
                                <div 
                                  className="progress-bar" 
                                  role="progressbar" 
                                  style={{ width: `${percentage}%`, backgroundColor: color.bar, borderRadius: '999px' }}
                                  aria-valuenow={percentage} 
                                  aria-valuemin="0" 
                                  aria-valuemax="100"
                                ></div>
                              </div>

                              <div className="d-flex justify-content-between align-items-center" style={{ fontSize: '0.62rem' }}>
                                <span className="text-muted">
                                  Done: <span className="text-success fw-bold">{stats.completed}</span> | Missed: <span className="text-danger fw-bold">{stats.missed}</span>
                                </span>
                                <span className="fw-bold" style={{ color: completionRate > 50 ? '#075E54' : '#6B7280' }}>
                                  Success Rate: {completionRate}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
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
