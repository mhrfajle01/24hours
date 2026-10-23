import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  getIntervalTimes, 
  formatTime12h, 
  formatFriendlyDate, 
  getTodayDateString 
} from '../utils/helpers';

/**
 * GenerateTodayModal provides:
 * 1. 100% rock-solid, static rendering (NO backdropFilter, NO CSS animations that trigger jitter or repainting).
 * 2. Cached single-fetch of previous dates with blocks (NO reloading loop on every second).
 * 3. Only previous dates with existing blocks are presented.
 * 4. Master AI Prompt for instant JSON generation.
 */
export default function GenerateTodayModal({
  isOpen,
  onClose,
  selectedDate,
  todayReports = [],
  idbGetReports,
  idbGetDatesWithReports,
  currentUser,
  onApplyBlocks,
  showToast,
  playSound
}) {
  const [activeTab, setActiveTab] = useState('previous'); // 'previous' | 'json'
  
  // Available dates that actually have blocks
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedPastDate, setSelectedPastDate] = useState('');
  const [datesLoading, setDatesLoading] = useState(false);

  // Previous Day Picker State
  const [pastReports, setPastReports] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const [selectedBlockKeys, setSelectedBlockKeys] = useState({});
  const [copyPlan, setCopyPlan] = useState(true);
  const [copyReport, setCopyReport] = useState(false);
  const [conflictMode, setConflictMode] = useState('overwrite'); // 'overwrite' | 'empty_only'
  const [filterTag, setFilterTag] = useState('ALL');

  // JSON Import State
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [parsedBlocks, setParsedBlocks] = useState([]);
  const [activeLessonStep, setActiveLessonStep] = useState(0);
  const [showLessonGuide, setShowLessonGuide] = useState(true);
  const [copiedSample, setCopiedSample] = useState(false);
  const [copiedMasterPrompt, setCopiedMasterPrompt] = useState(false);

  // Track if initial load was done for this open session
  const hasLoadedDatesRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasLoadedDatesRef.current = false;
      return;
    }

    if (!currentUser?.uid || hasLoadedDatesRef.current) return;
    hasLoadedDatesRef.current = true;

    let isCancelled = false;
    const fetchDatesWithBlocks = async () => {
      setDatesLoading(true);
      try {
        if (idbGetDatesWithReports) {
          const list = await idbGetDatesWithReports(currentUser.uid);
          if (!isCancelled) {
            // Exclude current selected date (we want previous days only)
            const filtered = (list || []).filter(item => item.date !== selectedDate && item.count > 0);
            setAvailableDates(filtered);
            if (filtered.length > 0) {
              setSelectedPastDate(filtered[0].date);
            } else {
              setSelectedPastDate('');
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch dates with reports:', err);
      } finally {
        if (!isCancelled) setDatesLoading(false);
      }
    };

    fetchDatesWithBlocks();
    return () => { isCancelled = true; };
  }, [isOpen, currentUser?.uid, selectedDate]);

  // Load previous day blocks only when selectedPastDate changes
  useEffect(() => {
    if (!isOpen || !currentUser?.uid || !selectedPastDate) {
      setPastReports([]);
      setSelectedBlockKeys({});
      return;
    }

    let isCancelled = false;
    const loadPastDay = async () => {
      setLoadingPast(true);
      try {
        if (idbGetReports) {
          const docs = await idbGetReports(currentUser.uid, selectedPastDate);
          if (!isCancelled) {
            const validDocs = (docs || []).filter(r => r && (r.plan || r.report || r.startTime || r.hour));
            setPastReports(validDocs);

            const initialMap = {};
            validDocs.forEach((r) => {
              const times = getIntervalTimes(r);
              const key = `${times.startTime}-${times.endTime}`;
              initialMap[key] = true;
            });
            setSelectedBlockKeys(initialMap);
          }
        }
      } catch (err) {
        console.warn('Failed to load past reports:', err);
      } finally {
        if (!isCancelled) setLoadingPast(false);
      }
    };

    loadPastDay();
    return () => { isCancelled = true; };
  }, [isOpen, selectedPastDate, currentUser?.uid]);

  // Transform ONLY existing past reports into clean selectable items
  const existingPastSlots = useMemo(() => {
    return pastReports.map((r) => {
      const times = getIntervalTimes(r);
      const key = `${times.startTime}-${times.endTime}`;
      return {
        id: r.id,
        hour: r.hour,
        ampm: r.ampm,
        startTime: times.startTime,
        endTime: times.endTime,
        key,
        plan: r.plan || '',
        report: r.report || '',
        tag: r.tag || '',
        status: r.status || 'Pending'
      };
    }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [pastReports]);

  // Filtered existing slots
  const filteredPastSlots = useMemo(() => {
    if (filterTag === 'ALL') return existingPastSlots;
    if (filterTag === 'HAS_CONTENT') {
      return existingPastSlots.filter(s => (s.plan && s.plan.trim()) || (s.report && s.report.trim()));
    }
    return existingPastSlots.filter(s => s.tag === filterTag);
  }, [existingPastSlots, filterTag]);

  const toggleBlockKey = (key) => {
    setSelectedBlockKeys(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSelectAll = (select) => {
    const updated = {};
    if (select) {
      filteredPastSlots.forEach(s => {
        updated[s.key] = true;
      });
    }
    setSelectedBlockKeys(updated);
  };

  // -------------------------------------------------------------
  // APPLY FROM PREVIOUS DAYS
  // -------------------------------------------------------------
  const handleApplyPastBlocks = async () => {
    const selectedSlots = existingPastSlots.filter(s => selectedBlockKeys[s.key]);
    if (selectedSlots.length === 0) {
      showToast?.('Please select at least one hour block to generate.', 'warning');
      return;
    }

    const todayIntervalMap = {};
    todayReports.forEach(r => {
      const times = getIntervalTimes(r);
      todayIntervalMap[`${times.startTime}-${times.endTime}`] = r;
    });

    const blocksToUpsert = [];

    for (const slot of selectedSlots) {
      const isExisting = todayIntervalMap[slot.key];

      if (isExisting && conflictMode === 'empty_only') {
        continue;
      }

      const planText = copyPlan ? (slot.plan || '') : '';
      const reportText = copyReport ? (slot.report || '') : '';

      blocksToUpsert.push({
        id: isExisting?.id,
        hour: slot.hour,
        ampm: slot.ampm,
        startTime: slot.startTime,
        endTime: slot.endTime,
        plan: planText,
        report: reportText,
        tag: slot.tag || '',
        status: isExisting?.status || 'Pending',
      });
    }

    if (blocksToUpsert.length === 0) {
      showToast?.('No changes needed. All chosen hours already exist today.', 'info');
      onClose();
      return;
    }

    try {
      await onApplyBlocks(selectedDate, blocksToUpsert, { overwrite: conflictMode === 'overwrite' });
      playSound?.('save');
      showToast?.(`Successfully generated ${blocksToUpsert.length} hour blocks!`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      showToast?.('Failed to apply hour blocks.', 'danger');
    }
  };

  // -------------------------------------------------------------
  // MASTER PROMPT FOR ANY AI TO GENERATE JSON
  // -------------------------------------------------------------
  const masterAiPrompt = `Act as an expert daily schedule planner for the "24Hours HourLog" productivity application.
Generate a valid, production-ready daily schedule in JSON format for my day according to the following strict schema:

### JSON SCHEMA:
{
  "date": "YYYY-MM-DD",
  "blocks": [
    {
      "hour": "09:00 - 10:00",
      "startTime": "09:00",
      "endTime": "10:00",
      "tag": "Work",
      "plan": [
        "First specific actionable task",
        "Second task item",
        "Third task item"
      ],
      "status": "Pending"
    }
  ]
}

### FIELD RULES & CONSTRAINTS:
1. "startTime" & "endTime": Must be in 24-hour "HH:MM" format (e.g. "06:00" to "07:00", "14:00" to "15:00").
2. "hour": A friendly string like "09:00 - 10:00" or an integer hour (0-23).
3. "tag": Category badge shown on the timeline. Choose from:
   - "Work" (Professional duties, standup, sprint tasks)
   - "Deep Work" (High-concentration coding, design, architecture)
   - "Routine" (Morning routine, breakfast, emails, house chores)
   - "Study" (Reading books, tutorials, skill practice)
   - "Health" (Gym, workout, walk, meals, hydration)
   - "Islam" / "Prayer" (Fajr, Dhuhr, Asr, Maghrib, Isha, Quran recitation)
   - "Break" / "Family" (Rest, relaxation, quality family time)
4. "plan": Array of strings. Every string automatically turns into an interactive checklist item (- [ ] task) in the app!
5. "status": Usually "Pending" (or "Completed").

### INSTRUCTION:
Generate a full, realistic, well-paced day schedule using ONLY raw valid JSON (no markdown wrappers or conversational filler outside the JSON code block).`;

  const sampleJsonStructure = {
    date: selectedDate,
    blocks: [
      {
        hour: "09:00 - 10:00",
        startTime: "09:00",
        endTime: "10:00",
        tag: "Work",
        plan: [
          "Team daily standup sync",
          "Review pull requests",
          "Update documentation"
        ],
        status: "Pending"
      },
      {
        hour: "10:00 - 11:00",
        startTime: "10:00",
        endTime: "11:00",
        tag: "Deep Work",
        plan: [
          "Deep work coding sprint",
          "Fix notification queue"
        ],
        status: "Pending"
      },
      {
        hour: "13:00 - 14:00",
        startTime: "13:00",
        endTime: "14:00",
        tag: "Health",
        plan: [
          "Healthy lunch & 15m outdoor walk"
        ],
        status: "Pending"
      }
    ]
  };

  const handleJsonChange = (e) => {
    const val = e.target.value;
    setJsonInput(val);
    if (!val.trim()) {
      setJsonError(null);
      setParsedBlocks([]);
      return;
    }

    try {
      let cleaned = val.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
      cleaned = cleaned.trim();

      const data = JSON.parse(cleaned);
      let blocksArray = [];

      if (Array.isArray(data)) {
        blocksArray = data;
      } else if (data && Array.isArray(data.blocks)) {
        blocksArray = data.blocks;
      } else if (data && Array.isArray(data.hours)) {
        blocksArray = data.hours;
      } else if (data && typeof data === 'object') {
        blocksArray = [data];
      }

      if (blocksArray.length === 0) {
        setJsonError('No block list found. Please provide an array of blocks.');
        setParsedBlocks([]);
        return;
      }

      const normalized = blocksArray.map((item, index) => {
        let startTime = '08:00';
        let endTime = '09:00';

        if (item.startTime && item.endTime) {
          startTime = item.startTime;
          endTime = item.endTime;
        } else if (item.hour && typeof item.hour === 'string' && item.hour.includes('-')) {
          const [s, e] = item.hour.split('-').map(t => t.trim());
          startTime = s;
          endTime = e;
        } else if (item.hour !== undefined && !isNaN(parseInt(item.hour, 10))) {
          const h = parseInt(item.hour, 10);
          startTime = `${String(h).padStart(2, '0')}:00`;
          endTime = `${String((h + 1) % 24).padStart(2, '0')}:00`;
        }

        let planStr = '';
        if (Array.isArray(item.bullets)) {
          planStr = item.bullets.map(b => `- [ ] ${b}`).join('\n');
        } else if (Array.isArray(item.tasks)) {
          planStr = item.tasks.map(b => `- [ ] ${b}`).join('\n');
        } else if (Array.isArray(item.plan)) {
          planStr = item.plan.map(b => (b.startsWith('-') ? b : `- [ ] ${b}`)).join('\n');
        } else if (typeof item.plan === 'string') {
          planStr = item.plan;
        }

        return {
          idx: index + 1,
          startTime,
          endTime,
          plan: planStr,
          report: typeof item.report === 'string' ? item.report : (Array.isArray(item.report) ? item.report.join('\n') : ''),
          tag: item.tag || item.category || '',
          status: item.status || 'Pending'
        };
      });

      setParsedBlocks(normalized);
      setJsonError(null);
    } catch (err) {
      setJsonError(err.message);
      setParsedBlocks([]);
    }
  };

  const handleCopySample = () => {
    navigator.clipboard.writeText(JSON.stringify(sampleJsonStructure, null, 2));
    setCopiedSample(true);
    setTimeout(() => setCopiedSample(false), 2000);
  };

  const handleCopyMasterPrompt = () => {
    navigator.clipboard.writeText(masterAiPrompt);
    setCopiedMasterPrompt(true);
    showToast?.('AI Master Prompt copied to clipboard!', 'success');
    setTimeout(() => setCopiedMasterPrompt(false), 2500);
  };

  const handleLoadSampleIntoEditor = () => {
    const sampleStr = JSON.stringify(sampleJsonStructure, null, 2);
    setJsonInput(sampleStr);
    handleJsonChange({ target: { value: sampleStr } });
    showToast?.('Sample template loaded!', 'info');
  };

  const handleApplyJsonImport = async () => {
    if (parsedBlocks.length === 0) {
      showToast?.('No valid blocks parsed from JSON.', 'warning');
      return;
    }

    try {
      const blocksToSave = parsedBlocks.map(b => ({
        startTime: b.startTime,
        endTime: b.endTime,
        plan: b.plan,
        report: b.report,
        tag: b.tag,
        status: b.status
      }));

      await onApplyBlocks(selectedDate, blocksToSave, { overwrite: conflictMode === 'overwrite' });
      playSound?.('save');
      showToast?.(`Successfully imported ${blocksToSave.length} hour blocks from JSON!`, 'success');
      onClose();
    } catch (err) {
      console.error(err);
      showToast?.('Failed to import JSON blocks.', 'danger');
    }
  };

  const tutorialSteps = [
    {
      title: "1. Structure & Top Level",
      desc: "Use an object with a `blocks` key containing an array of schedule items.",
      badge: "Structure",
      code: `{\n  "date": "2026-10-24",\n  "blocks": [\n    /* items here */\n  ]\n}`
    },
    {
      title: "2. Setting Time & Range",
      desc: "Provide 24-hr format like `09:00 - 10:00` or separate `startTime` and `endTime`.",
      badge: "Time Slots",
      code: `{\n  "startTime": "09:00",\n  "endTime": "10:00",\n  // or "hour": "09:00 - 10:00"\n}`
    },
    {
      title: "3. Tasks, Checklists & Bullets",
      desc: "Provide an array of strings in `plan`. They automatically transform into interactive checkboxes!",
      badge: "Checklists",
      code: `"plan": [\n  "Daily team standup sync",\n  "Code review pull requests",\n  "Review sprint backlog"\n]`
    },
    {
      title: "4. Tags & Categories",
      desc: "Set category badges such as Work, Deep Work, Study, Health, Routine, or Islam.",
      badge: "Tags & Badges",
      code: `"tag": "Work",\n"status": "Pending"`
    }
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Semi-transparent standard Backdrop overlay matching app standard */}
      <div 
        className="modal-backdrop fade show animate-fade-in" 
        style={{ zIndex: 1050 }} 
        onClick={onClose}
      />

      <div 
        className="modal fade show d-block" 
        style={{ zIndex: 1060 }} 
        tabIndex="-1" 
        role="dialog"
      >
        <div className="modal-dialog modal-dialog-centered modal-xl" style={{ maxWidth: '960px' }}>
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden" style={{ background: '#F8FAF9' }}>
            
            {/* Modal Header */}
            <div 
              className="modal-header border-0 text-white px-4 py-3"
              style={{ backgroundColor: '#075E54' }}
            >
              <div className="d-flex align-items-center gap-3">
                <div 
                  className="rounded-3 d-flex align-items-center justify-content-center shadow-sm"
                  style={{ width: '42px', height: '42px', backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                >
                  <i className="bi bi-magic fs-4 text-white" />
                </div>
                <div>
                  <h5 className="modal-title fw-bold mb-0">Dynamic Day Generator</h5>
                  <div className="small opacity-75">
                    Generate or import schedule blocks for <strong>{formatFriendlyDate(selectedDate)}</strong>
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                className="btn-close btn-close-white shadow-none" 
                onClick={onClose}
              />
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white border-bottom px-4 pt-2">
              <ul className="nav nav-pills gap-2 pb-2">
                <li className="nav-item">
                  <button 
                    className={`nav-link rounded-pill px-3.5 py-2 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'previous' ? 'active shadow-sm text-white' : 'text-dark bg-light'}`}
                    style={activeTab === 'previous' ? { backgroundColor: '#128C7E' } : {}}
                    onClick={() => setActiveTab('previous')}
                  >
                    <i className="bi bi-clock-history" />
                    Copy from Previous Days
                  </button>
                </li>
                <li className="nav-item">
                  <button 
                    className={`nav-link rounded-pill px-3.5 py-2 fw-semibold d-flex align-items-center gap-2 ${activeTab === 'json' ? 'active shadow-sm text-white' : 'text-dark bg-light'}`}
                    style={activeTab === 'json' ? { backgroundColor: '#128C7E' } : {}}
                    onClick={() => setActiveTab('json')}
                  >
                    <i className="bi bi-filetype-json" />
                    Import JSON & AI Guide
                  </button>
                </li>
              </ul>
            </div>

            {/* Modal Body */}
            <div className="modal-body p-3 p-md-4" style={{ maxHeight: 'calc(82vh - 110px)', overflowY: 'auto' }}>
              
              {/* Conflict Options Row */}
              <div className="bg-white p-3 rounded-3 border mb-3 shadow-xs d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="small fw-bold text-muted text-uppercase tracking-wider">Target Date:</span>
                  <span className="badge bg-dark-subtle text-dark border px-2.5 py-1.5 rounded-pill fw-semibold">
                    📅 {selectedDate}
                  </span>
                  <span className="badge bg-light text-secondary border px-2 py-1 rounded-pill small">
                    {todayReports.length} existing blocks
                  </span>
                </div>

                <div className="d-flex align-items-center gap-2 small">
                  <span className="text-secondary fw-medium">Merge Rule:</span>
                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className={`btn fw-semibold ${conflictMode === 'overwrite' ? 'btn-success text-white' : 'btn-outline-secondary'}`}
                      style={conflictMode === 'overwrite' ? { backgroundColor: '#128C7E', borderColor: '#128C7E' } : {}}
                      onClick={() => setConflictMode('overwrite')}
                    >
                      Overwrite Selected
                    </button>
                    <button
                      type="button"
                      className={`btn fw-semibold ${conflictMode === 'empty_only' ? 'btn-success text-white' : 'btn-outline-secondary'}`}
                      style={conflictMode === 'empty_only' ? { backgroundColor: '#128C7E', borderColor: '#128C7E' } : {}}
                      onClick={() => setConflictMode('empty_only')}
                    >
                      Fill Empty Hours Only
                    </button>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* TAB 1: PREVIOUS DAY EXISTING BLOCK PICKER                     */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'previous' && (
                <div>
                  {/* Past Date Selector Bar */}
                  <div className="bg-white p-3 rounded-3 border shadow-xs mb-3">
                    <div className="row g-2 align-items-center">
                      <div className="col-12 col-md-5">
                        <label className="form-label small fw-bold text-muted mb-1">
                          Select Previous Day (Only Days with Saved Blocks)
                        </label>
                        {availableDates.length > 0 ? (
                          <select 
                            className="form-select form-select-sm"
                            value={selectedPastDate}
                            onChange={(e) => setSelectedPastDate(e.target.value)}
                          >
                            {availableDates.map(d => (
                              <option key={d.date} value={d.date}>
                                {d.date} ({d.count} blocks)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="input-group input-group-sm">
                            <span className="input-group-text bg-light border-end-0">
                              <i className="bi bi-calendar-event text-secondary" />
                            </span>
                            <input 
                              type="date"
                              className="form-control form-control-sm border-start-0"
                              value={selectedPastDate}
                              onChange={(e) => setSelectedPastDate(e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      <div className="col-12 col-md-7">
                        <label className="form-label small fw-bold text-muted mb-1">
                          Available Previous Days
                        </label>
                        <div className="d-flex flex-wrap gap-1.5">
                          {datesLoading ? (
                            <span className="small text-muted">Checking available dates...</span>
                          ) : availableDates.length > 0 ? (
                            availableDates.slice(0, 5).map(opt => (
                              <button
                                key={opt.date}
                                type="button"
                                className={`btn btn-xs rounded-pill px-2.5 py-1 small fw-semibold border ${selectedPastDate === opt.date ? 'bg-success text-white border-success' : 'btn-light text-secondary'}`}
                                style={selectedPastDate === opt.date ? { backgroundColor: '#075E54' } : {}}
                                onClick={() => setSelectedPastDate(opt.date)}
                              >
                                📅 {opt.date} ({opt.count})
                              </button>
                            ))
                          ) : (
                            <span className="small text-muted fst-italic">No prior days with saved blocks yet.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Filter & Selection Toolbar */}
                    {availableDates.length > 0 && (
                      <div className="d-flex flex-wrap align-items-center justify-content-between pt-3 mt-3 border-top gap-2">
                        <div className="d-flex align-items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-dark rounded-pill px-2.5 fw-semibold"
                            onClick={() => handleSelectAll(true)}
                            disabled={filteredPastSlots.length === 0}
                          >
                            <i className="bi bi-check-all me-1" />Select All
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-secondary rounded-pill px-2.5"
                            onClick={() => handleSelectAll(false)}
                            disabled={filteredPastSlots.length === 0}
                          >
                            Deselect All
                          </button>

                          <div className="vr mx-1" />

                          <div className="form-check form-check-inline form-switch mb-0 small">
                            <input 
                              className="form-check-input"
                              type="checkbox"
                              id="copyPlanSwitch"
                              checked={copyPlan}
                              onChange={(e) => setCopyPlan(e.target.checked)}
                            />
                            <label className="form-check-label small fw-semibold text-secondary" htmlFor="copyPlanSwitch">
                              Copy Plans & Tasks
                            </label>
                          </div>
                          <div className="form-check form-check-inline form-switch mb-0 small">
                            <input 
                              className="form-check-input"
                              type="checkbox"
                              id="copyReportSwitch"
                              checked={copyReport}
                              onChange={(e) => setCopyReport(e.target.checked)}
                            />
                            <label className="form-check-label small fw-semibold text-secondary" htmlFor="copyReportSwitch">
                              Copy Reports
                            </label>
                          </div>
                        </div>

                        <div className="d-flex align-items-center gap-1">
                          <span className="small text-muted me-1">Filter:</span>
                          <select 
                            className="form-select form-select-sm py-0 px-2 rounded-pill small" 
                            style={{ width: 'auto', fontSize: '0.8rem' }}
                            value={filterTag}
                            onChange={(e) => setFilterTag(e.target.value)}
                          >
                            <option value="ALL">All Existing Blocks</option>
                            <option value="HAS_CONTENT">Only with tasks/notes</option>
                            <option value="Work">Work</option>
                            <option value="Deep Work">Deep Work</option>
                            <option value="Routine">Routine</option>
                            <option value="Study">Study</option>
                            <option value="Health">Health</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clean Existing Block Cards */}
                  {loadingPast ? (
                    <div className="text-center py-5">
                      <div className="spinner-border spinner-border-sm text-success me-2" role="status" />
                      <span className="text-secondary small fw-medium">Loading blocks from {selectedPastDate}...</span>
                    </div>
                  ) : filteredPastSlots.length === 0 ? (
                    <div className="text-center py-5 bg-white border rounded-3 p-4">
                      <div 
                        className="rounded-circle d-inline-flex align-items-center justify-content-center p-3 mb-2"
                        style={{ backgroundColor: '#F0F5F2', width: '56px', height: '56px' }}
                      >
                        <i className="bi bi-calendar2-x fs-3" style={{ color: '#075E54' }} />
                      </div>
                      <h6 className="fw-bold text-dark mb-1">
                        {availableDates.length === 0 ? 'No Previous Days with Time Blocks Found' : `No Blocks on ${selectedPastDate}`}
                      </h6>
                      <p className="small text-secondary mb-3">
                        {availableDates.length === 0 
                          ? 'You haven\'t logged any prior days yet. You can use the "Import JSON & AI Guide" tab to auto-generate your day!' 
                          : 'Please pick another date from the available days above.'}
                      </p>
                      {availableDates.length === 0 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-success rounded-pill px-3 fw-bold"
                          style={{ backgroundColor: '#128C7E', borderColor: '#128C7E' }}
                          onClick={() => setActiveTab('json')}
                        >
                          <i className="bi bi-filetype-json me-1" />
                          Import JSON Schedule Instead
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="row g-2">
                      {filteredPastSlots.map((slot) => {
                        const isChecked = !!selectedBlockKeys[slot.key];
                        const hasContent = Boolean(slot.plan?.trim() || slot.report?.trim());

                        return (
                          <div 
                            key={slot.key} 
                            className="col-12 col-sm-6 col-lg-4"
                          >
                            <div 
                              onClick={() => toggleBlockKey(slot.key)}
                              className={`card h-100 border cursor-pointer rounded-3 p-2.5 ${isChecked ? 'shadow-sm border-success bg-white' : 'bg-light-subtle border-light-subtle opacity-75'}`}
                              style={{
                                borderColor: isChecked ? '#128C7E' : '#E0E0E0',
                                outline: isChecked ? '2px solid rgba(18, 140, 126, 0.25)' : 'none',
                                userSelect: 'none'
                              }}
                            >
                              <div className="d-flex align-items-center justify-content-between mb-1.5">
                                <div className="d-flex align-items-center gap-2">
                                  <div 
                                    className="rounded-circle d-flex align-items-center justify-content-center text-white"
                                    style={{
                                      width: '20px',
                                      height: '20px',
                                      backgroundColor: isChecked ? '#128C7E' : '#BDBDBD',
                                      fontSize: '11px'
                                    }}
                                  >
                                    {isChecked ? <i className="bi bi-check-lg" /> : null}
                                  </div>
                                  <span className="fw-bold small text-dark">
                                    {formatTime12h(slot.startTime)} - {formatTime12h(slot.endTime)}
                                  </span>
                                </div>
                                {slot.tag && (
                                  <span className="badge bg-secondary-subtle text-secondary-emphasis border rounded-pill small px-2">
                                    #{slot.tag}
                                  </span>
                                )}
                              </div>

                              {/* Task / Plan preview */}
                              <div className="small text-secondary mt-1 pe-1" style={{ fontSize: '0.8rem', minHeight: '36px' }}>
                                {hasContent ? (
                                  <div className="text-truncate-2" style={{ maxHeight: '36px', overflow: 'hidden' }}>
                                    {slot.plan ? (
                                      <span className="text-dark">
                                        <i className="bi bi-list-task me-1 text-success" />
                                        {slot.plan.replace(/[-*]?\s*\[[ xX]\]\s*/g, '• ')}
                                      </span>
                                    ) : (
                                      <span className="text-muted fst-italic">
                                        <i className="bi bi-chat-left-text me-1" />
                                        {slot.report}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted fst-italic small">Empty slot content</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Summary Bar & Action */}
                  {filteredPastSlots.length > 0 && (
                    <div className="mt-3 p-3 bg-white border rounded-3 d-flex flex-wrap align-items-center justify-content-between gap-2 shadow-xs">
                      <div className="small">
                        <strong className="text-dark">
                          {Object.values(selectedBlockKeys).filter(Boolean).length}
                        </strong> of {filteredPastSlots.length} available blocks selected to generate into <strong>{selectedDate}</strong>.
                      </div>
                      <div className="d-flex gap-2">
                        <button 
                          type="button" 
                          className="btn btn-outline-secondary btn-sm px-3 rounded-pill"
                          onClick={onClose}
                        >
                          Cancel
                        </button>
                        <button 
                          type="button" 
                          className="btn text-white btn-sm px-4 rounded-pill fw-bold shadow-sm"
                          style={{ backgroundColor: '#128C7E' }}
                          onClick={handleApplyPastBlocks}
                        >
                          <i className="bi bi-check2-circle me-1.5" />
                          Generate Selected Blocks
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 2: JSON IMPORT & AI MASTER PROMPT GUIDE                   */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'json' && (
                <div>
                  
                  {/* Master AI Prompt Banner Card */}
                  <div className="card border-0 rounded-3 shadow-xs mb-3 overflow-hidden" style={{ background: '#E8F5E9' }}>
                    <div className="p-3 border-bottom border-success-subtle d-flex flex-wrap align-items-center justify-content-between gap-2">
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-success rounded-pill px-2.5 py-1.5 shadow-xs">
                          <i className="bi bi-robot me-1" />AI Master Prompt
                        </span>
                        <div>
                          <strong className="small text-dark d-block">Generate Perfect Day JSON with Any AI</strong>
                          <span className="text-secondary small" style={{ fontSize: '0.78rem' }}>
                            Copy this prompt, paste it into ChatGPT / Claude / Gemini to generate complete schedule JSON.
                          </span>
                        </div>
                      </div>

                      <div className="d-flex gap-1.5">
                        <button
                          type="button"
                          className="btn btn-sm btn-success rounded-pill px-3 fw-bold shadow-xs text-white d-flex align-items-center gap-1.5"
                          style={{ backgroundColor: '#075E54', borderColor: '#075E54' }}
                          onClick={handleCopyMasterPrompt}
                        >
                          <i className={`bi bi-${copiedMasterPrompt ? 'check-circle-fill' : 'clipboard-check'}`} />
                          {copiedMasterPrompt ? 'Prompt Copied!' : 'Copy Master AI Prompt'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success rounded-pill px-2.5 bg-white"
                          onClick={() => setShowLessonGuide(!showLessonGuide)}
                          title="Toggle Schema Lesson"
                        >
                          <i className={`bi bi-chevron-${showLessonGuide ? 'up' : 'down'}`} />
                        </button>
                      </div>
                    </div>

                    {showLessonGuide && (
                      <div className="p-3 bg-white">
                        {/* Interactive lesson tabs */}
                        <div className="d-flex flex-wrap gap-1.5 mb-2.5">
                          {tutorialSteps.map((step, idx) => (
                            <button
                              key={step.title}
                              type="button"
                              className={`btn btn-xs rounded-pill px-2.5 py-1 fw-semibold transition-all ${activeLessonStep === idx ? 'btn-success text-white shadow-xs' : 'btn-light text-secondary border'}`}
                              style={activeLessonStep === idx ? { backgroundColor: '#128C7E', borderColor: '#128C7E' } : {}}
                              onClick={() => setActiveLessonStep(idx)}
                            >
                              <span className="badge bg-white text-dark me-1" style={{ fontSize: '9px' }}>{idx + 1}</span>
                              {step.badge}
                            </button>
                          ))}
                        </div>

                        {/* Active Lesson Display */}
                        <div className="p-3 rounded-3 border bg-light-subtle">
                          <div className="d-flex align-items-center justify-content-between mb-1">
                            <h6 className="fw-bold mb-0" style={{ color: '#075E54' }}>
                              {tutorialSteps[activeLessonStep].title}
                            </h6>
                            <button
                              type="button"
                              className="btn btn-xs btn-outline-success rounded-pill px-2 py-0.5"
                              onClick={handleCopySample}
                            >
                              <i className={`bi bi-${copiedSample ? 'check' : 'clipboard'} me-1`} />
                              {copiedSample ? 'Copied Full Sample!' : 'Copy Sample Template'}
                            </button>
                          </div>
                          <p className="small text-secondary mb-2">
                            {tutorialSteps[activeLessonStep].desc}
                          </p>
                          <pre 
                            className="bg-dark text-light p-2.5 rounded-3 mb-0 small"
                            style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}
                          >
                            <code>{tutorialSteps[activeLessonStep].code}</code>
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* JSON Editor & Preview Row */}
                  <div className="row g-3">
                    <div className="col-12 col-lg-7">
                      <div className="bg-white p-3 rounded-3 border shadow-xs h-100 d-flex flex-column">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <label className="form-label small fw-bold text-muted mb-0">
                            Paste or Edit JSON Below
                          </label>
                          <div className="d-flex gap-2">
                            <button
                              type="button"
                              className="btn btn-xs btn-light text-secondary border rounded-pill px-2"
                              onClick={handleLoadSampleIntoEditor}
                            >
                              <i className="bi bi-box-arrow-in-down me-1" />
                              Load Sample Template
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs btn-light text-secondary border rounded-pill px-2"
                              onClick={() => {
                                try {
                                  if (jsonInput.trim()) {
                                    let cleaned = jsonInput.trim();
                                    if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json/, '');
                                    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```/, '');
                                    if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '');
                                    const parsed = JSON.parse(cleaned.trim());
                                    setJsonInput(JSON.stringify(parsed, null, 2));
                                    showToast?.('JSON formatted cleanly!', 'info');
                                  }
                                } catch (e) {
                                  showToast?.('Invalid JSON format.', 'warning');
                                }
                              }}
                            >
                              <i className="bi bi-code-slash me-1" />
                              Format
                            </button>
                          </div>
                        </div>

                        <textarea
                          rows={11}
                          className={`form-control font-monospace small ${jsonError ? 'is-invalid border-danger' : 'border'}`}
                          style={{ fontSize: '0.82rem', resize: 'vertical', minHeight: '230px' }}
                          placeholder={`{\n  "blocks": [\n    {\n      "hour": "09:00 - 10:00",\n      "tag": "Work",\n      "plan": ["Team Standup sync", "Fix notification bug"],\n      "status": "Pending"\n    }\n  ]\n}`}
                          value={jsonInput}
                          onChange={handleJsonChange}
                        />

                        {jsonError && (
                          <div className="alert alert-danger py-1.5 px-2 mt-2 mb-0 small d-flex align-items-center gap-1.5 border-0">
                            <i className="bi bi-exclamation-triangle-fill text-danger" />
                            <span><strong>Syntax Error:</strong> {jsonError}</span>
                          </div>
                        )}

                        <div className="d-flex align-items-center justify-content-between mt-2 pt-2 border-top text-muted small">
                          <span>
                            {parsedBlocks.length > 0 ? (
                              <span className="text-success fw-semibold">
                                <i className="bi bi-check-circle-fill me-1" />
                                Valid schema: {parsedBlocks.length} block(s) detected
                              </span>
                            ) : (
                              'Tip: Supports hour numbers (0-23) or "09:00 - 10:00" ranges.'
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Preview Cards Column */}
                    <div className="col-12 col-lg-5">
                      <div className="bg-white p-3 rounded-3 border shadow-xs h-100 d-flex flex-column">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <label className="form-label small fw-bold text-muted mb-0">
                            Live Preview ({parsedBlocks.length} Blocks)
                          </label>
                          <span className="badge bg-light text-secondary border small">Auto Parses Tasks</span>
                        </div>

                        <div 
                          className="flex-grow-1 overflow-auto pe-1" 
                          style={{ maxHeight: '280px', minHeight: '180px' }}
                        >
                          {parsedBlocks.length === 0 ? (
                            <div className="text-center py-5 text-muted small">
                              <i className="bi bi-eye fs-2 d-block opacity-50 mb-1" />
                              Paste valid JSON on the left to see live block preview here.
                            </div>
                          ) : (
                            <div className="d-flex flex-column gap-2">
                              {parsedBlocks.map((blk, idx) => (
                                <div 
                                  key={idx} 
                                  className="p-2 border rounded-3 bg-light-subtle small shadow-2xs"
                                >
                                  <div className="d-flex align-items-center justify-content-between mb-1">
                                    <span className="fw-bold text-dark">
                                      ⏰ {formatTime12h(blk.startTime)} - {formatTime12h(blk.endTime)}
                                    </span>
                                    {blk.tag && (
                                      <span className="badge bg-success-subtle text-success-emphasis border border-success-subtle rounded-pill">
                                        #{blk.tag}
                                      </span>
                                    )}
                                  </div>
                                  {blk.plan ? (
                                    <div className="text-secondary small ps-1" style={{ whiteSpace: 'pre-line' }}>
                                      {blk.plan.length > 90 ? blk.plan.substring(0, 90) + '...' : blk.plan}
                                    </div>
                                  ) : (
                                    <span className="text-muted fst-italic small">No plan tasks</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 pt-2 border-top d-flex justify-content-end gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm px-3 rounded-pill"
                            onClick={onClose}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn text-white btn-sm px-4 rounded-pill fw-bold shadow-sm"
                            style={{ backgroundColor: '#128C7E' }}
                            disabled={parsedBlocks.length === 0}
                            onClick={handleApplyJsonImport}
                          >
                            <i className="bi bi-cloud-arrow-down-fill me-1.5" />
                            Import {parsedBlocks.length} Blocks
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      <style>{`
        .text-truncate-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .cursor-pointer {
          cursor: pointer;
        }
        .btn-xs {
          font-size: 0.75rem;
          padding: 0.2rem 0.5rem;
        }
      `}</style>
    </>
  );
}
