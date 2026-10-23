import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase/firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

// Offline cache helpers
const LS_KEY = 'bypassReport_data';
const LS_QUEUE_KEY = 'bypassReport_syncQueue';

const lsGet = (uid) => {
  try {
    const d = JSON.parse(localStorage.getItem(`${LS_KEY}_${uid}`));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
};

const lsSave = (uid, list) => {
  try {
    localStorage.setItem(`${LS_KEY}_${uid}`, JSON.stringify(list));
  } catch {}
};

const queueBypassSync = (uid, action, docId, data) => {
  try {
    const queue = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]');
    queue.push({ uid, action, docId, data, ts: Date.now() });
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
};

const flushBypassQueue = async (uid) => {
  try {
    const queue = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;
    const remaining = [];
    for (const item of queue) {
      if (item.uid !== uid) {
        remaining.push(item);
        continue;
      }
      try {
        const docRef = doc(db, 'shiftTracker', item.uid, 'bypassRecords', item.docId);
        if (item.action === 'save') {
          await setDoc(docRef, item.data, { merge: true });
        } else if (item.action === 'delete') {
          await deleteDoc(docRef);
        }
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(remaining));
  } catch {}
};

export default function BypassTrackerPage({ currentUser, onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const syncingRef = useRef(false);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date(Date.now() + 6 * 3600000);
    return d.toISOString().split('T')[0];
  });
  const [filterMode, setFilterMode] = useState('date'); // 'date' | 'all'

  // Modal / Form state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    date: new Date(Date.now() + 6 * 3600000).toISOString().split('T')[0],
    bypassNum: '',
    plat: '',
    remarks: ''
  });

  // Custom Alert
  const [alertConfig, setAlertConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'alert',
    onConfirm: null
  });

  // Network sync
  useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true);
      if (!syncingRef.current && currentUser?.uid) {
        syncingRef.current = true;
        await flushBypassQueue(currentUser.uid);
        syncingRef.current = false;
      }
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine && currentUser?.uid) {
      flushBypassQueue(currentUser.uid);
    }
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [currentUser?.uid]);

  // Pre-loaded data from Google Sheet
  const GOOGLE_SHEET_SEED = [
    {
      id: 'gs-1',
      date: '2026-10-23',
      bypassNum: '1951.9419',
      plat: 'D28-362b',
      remarks: 'pt replatted 2013',
      createdAt: 1729684800000
    },
    {
      id: 'gs-2',
      date: '2026-10-23',
      bypassNum: '1951.10146',
      plat: 'd306 - 155',
      remarks: 'pt replatted 2024',
      createdAt: 1729684860000
    },
    {
      id: 'gs-3',
      date: '2026-10-23',
      bypassNum: '1951.10312',
      plat: 'D84 - 507',
      remarks: 'pt replatted 2023',
      createdAt: 1729684920000
    }
  ];

  // Load records
  useEffect(() => {
    if (!currentUser?.uid) return;

    const loadRecords = async () => {
      setLoading(true);
      const local = lsGet(currentUser.uid);

      // Merge Google Sheet seed if missing in local
      let baseList = local;
      if (!baseList || baseList.length === 0) {
        baseList = GOOGLE_SHEET_SEED;
        lsSave(currentUser.uid, baseList);
      } else {
        const existingNums = new Set(baseList.map(item => item.bypassNum));
        const missingSeed = GOOGLE_SHEET_SEED.filter(s => !existingNums.has(s.bypassNum));
        if (missingSeed.length > 0) {
          baseList = [...baseList, ...missingSeed];
          lsSave(currentUser.uid, baseList);
        }
      }
      setEntries(baseList);

      if (navigator.onLine) {
        try {
          const colRef = collection(db, 'shiftTracker', currentUser.uid, 'bypassRecords');
          const q = query(colRef, orderBy('createdAt', 'desc'));
          const snap = await getDocs(q);
          const cloudList = [];
          snap.forEach(d => {
            cloudList.push({ id: d.id, ...d.data() });
          });

          // If Firestore is empty or missing sheet records, populate it
          const existingCloudNums = new Set(cloudList.map(item => item.bypassNum));
          const missingForCloud = GOOGLE_SHEET_SEED.filter(s => !existingCloudNums.has(s.bypassNum));
          for (const item of missingForCloud) {
            await setDoc(doc(db, 'shiftTracker', currentUser.uid, 'bypassRecords', item.id), item, { merge: true }).catch(() => {});
            cloudList.push(item);
          }

          if (cloudList.length > 0) {
            setEntries(cloudList);
            lsSave(currentUser.uid, cloudList);
          }
        } catch {
          // fallback to local
        }
      }
      setLoading(false);
    };

    loadRecords();
  }, [currentUser?.uid]);

  // Open Form
  const openNewForm = () => {
    setEditingId(null);
    setFormData({
      date: selectedDate || new Date(Date.now() + 6 * 3600000).toISOString().split('T')[0],
      bypassNum: '',
      plat: '',
      remarks: ''
    });
    setShowFormModal(true);
  };

  const openEditForm = (item) => {
    setEditingId(item.id);
    setFormData({
      date: item.date || '',
      bypassNum: item.bypassNum || '',
      plat: item.plat || '',
      remarks: item.remarks || ''
    });
    setShowFormModal(true);
  };

  // Save handler
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.bypassNum.trim()) {
      setAlertConfig({
        isOpen: true,
        type: 'alert',
        title: 'Validation',
        message: 'Please provide a Doc Bypass Number.'
      });
      return;
    }

    const docId = editingId || `bypass_${Date.now()}`;
    const entryObj = {
      id: docId,
      date: formData.date,
      bypassNum: formData.bypassNum.trim(),
      plat: formData.plat.trim(),
      remarks: formData.remarks.trim(),
      updatedAt: Date.now(),
      createdAt: editingId
        ? (entries.find(e => e.id === editingId)?.createdAt || Date.now())
        : Date.now()
    };

    let updatedList;
    if (editingId) {
      updatedList = entries.map(item => (item.id === editingId ? entryObj : item));
    } else {
      updatedList = [entryObj, ...entries];
    }

    setEntries(updatedList);
    lsSave(currentUser?.uid, updatedList);
    setShowFormModal(false);

    if (currentUser?.uid) {
      queueBypassSync(currentUser.uid, 'save', docId, entryObj);
      if (navigator.onLine && !syncingRef.current) {
        syncingRef.current = true;
        flushBypassQueue(currentUser.uid).finally(() => {
          syncingRef.current = false;
        });
      }
    }
  };

  // Delete handler
  const handleDelete = (item) => {
    setAlertConfig({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Bypass Entry',
      message: `Delete bypass "${item.bypassNum}" for Plat "${item.plat || 'N/A'}"?`,
      onConfirm: async () => {
        const filtered = entries.filter(e => e.id !== item.id);
        setEntries(filtered);
        lsSave(currentUser?.uid, filtered);
        setAlertConfig({ isOpen: false });

        if (currentUser?.uid) {
          queueBypassSync(currentUser.uid, 'delete', item.id, null);
          if (navigator.onLine && !syncingRef.current) {
            syncingRef.current = true;
            flushBypassQueue(currentUser.uid).finally(() => {
              syncingRef.current = false;
            });
          }
        }
      }
    });
  };

  // Export CSV
  const handleExportCSV = () => {
    const listToExport = displayedEntries;
    if (listToExport.length === 0) {
      setAlertConfig({
        isOpen: true,
        type: 'alert',
        title: 'No Data',
        message: 'No bypass records to export for this view.'
      });
      return;
    }

    const rows = [['Date', 'Sl', 'doc bypass num', 'Plat', 'remarks']];
    listToExport.forEach((item, idx) => {
      rows.push([
        item.date || '',
        idx + 1,
        `"${(item.bypassNum || '').replace(/"/g, '""')}"`,
        `"${(item.plat || '').replace(/"/g, '""')}"`,
        `"${(item.remarks || '').replace(/"/g, '""')}"`
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bypass_Report_${filterMode === 'date' ? selectedDate : 'All'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered entries
  const displayedEntries = entries.filter(item => {
    if (filterMode === 'date' && item.date !== selectedDate) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = item.bypassNum?.toLowerCase().includes(q);
      const matchPlat = item.plat?.toLowerCase().includes(q);
      const matchRemarks = item.remarks?.toLowerCase().includes(q);
      if (!matchNum && !matchPlat && !matchRemarks) return false;
    }
    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        minHeight: '100dvh',
        background: '#0B1120',
        color: '#F8FAFC',
        fontFamily: "'Outfit', sans-serif",
        paddingBottom: 60
      }}
    >
      {/* Top Sticky Header */}
      <motion.div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(11, 17, 32, 0.92)',
          backdropFilter: 'blur(12px)',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          {/* Back + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={onBack}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#fff',
                width: 36,
                height: 36,
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ←
            </button>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚡ Bypass Tracker</span>
                {!isOnline && (
                  <span
                    style={{
                      fontSize: 10,
                      background: '#EF4444',
                      padding: '2px 6px',
                      borderRadius: 8
                    }}
                  >
                    Offline
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Doc Bypass & Plat Logs</div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleExportCSV}
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: '#38BDF8',
                border: '1px solid rgba(56,189,248,0.3)',
                padding: '6px 12px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              📥 CSV
            </button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={openNewForm}
              style={{
                background: 'linear-gradient(135deg, #0284C7, #0369A1)',
                color: '#fff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: 12,
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: '0 2px 10px rgba(2,132,199,0.3)'
              }}
            >
              <span>+ Add Bypass</span>
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Main Container */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px' }}>
        
        {/* Date Filter & Search Row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16
          }}
        >
          {/* Mode Switcher */}
          <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 12 }}>
            <button
              onClick={() => setFilterMode('date')}
              style={{
                background: filterMode === 'date' ? '#0284C7' : 'none',
                color: filterMode === 'date' ? '#fff' : '#94A3B8',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              📅 Daily
            </button>
            <button
              onClick={() => setFilterMode('all')}
              style={{
                background: filterMode === 'all' ? '#0284C7' : 'none',
                color: filterMode === 'all' ? '#fff' : '#94A3B8',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🌐 All Logs ({entries.length})
            </button>
          </div>

          {filterMode === 'date' && (
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                background: '#1E293B',
                color: '#fff',
                border: '1px solid #334155',
                padding: '6px 10px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                outline: 'none'
              }}
            />
          )}

          {/* Search box */}
          <input
            type="text"
            placeholder="Search bypass, plat, remark..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: '1 1 200px',
              background: '#1E293B',
              border: '1px solid #334155',
              padding: '7px 12px',
              borderRadius: 10,
              color: '#fff',
              fontSize: 13,
              outline: 'none'
            }}
          />
        </div>

        {/* Daily Summary Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#1E293B', padding: 14, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>Total Bypasses</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#38BDF8', marginTop: 4 }}>{displayedEntries.length}</div>
          </div>
          <div style={{ background: '#1E293B', padding: 14, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>Distinct Plats</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#FBBF24', marginTop: 4 }}>
              {new Set(displayedEntries.map(e => e.plat?.toLowerCase().trim()).filter(Boolean)).size}
            </div>
          </div>
        </div>

        {/* Entries Table / List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8' }}>Loading records...</div>
        ) : displayedEntries.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: '#1E293B',
              borderRadius: 16,
              border: '1px dashed #334155'
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#E2E8F0' }}>No Bypass Records Found</div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
              {filterMode === 'date'
                ? `No bypasses recorded for ${selectedDate}.`
                : 'No entries match your search.'}
            </div>
            <button
              onClick={openNewForm}
              style={{
                marginTop: 14,
                padding: '8px 16px',
                background: '#0284C7',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              + Add First Bypass
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayedEntries.map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                style={{
                  background: '#1E293B',
                  borderRadius: 14,
                  padding: '12px 16px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                {/* Index / Sl */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'rgba(56,189,248,0.15)',
                    color: '#38BDF8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 12,
                    flexShrink: 0
                  }}
                >
                  {idx + 1}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#F8FAFC' }}>
                      {item.bypassNum}
                    </span>
                    {item.plat && (
                      <span
                        style={{
                          background: 'rgba(251,191,36,0.15)',
                          color: '#FBBF24',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700
                        }}
                      >
                        Plat: {item.plat}
                      </span>
                    )}
                    {filterMode === 'all' && (
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>{item.date}</span>
                    )}
                  </div>
                  {item.remarks && (
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>
                      📝 {item.remarks}
                    </div>
                  )}
                </div>

                {/* Edit & Delete Buttons */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => openEditForm(item)}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: 'none',
                      color: '#E2E8F0',
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    style={{
                      background: 'rgba(239,68,68,0.15)',
                      border: 'none',
                      color: '#EF4444',
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ADD / EDIT MODAL */}
      <AnimatePresence>
        {showFormModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(6px)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16
            }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              style={{
                background: '#1E293B',
                borderRadius: 20,
                padding: 24,
                width: '100%',
                maxWidth: 420,
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                  {editingId ? '✏️ Edit Bypass' : '⚡ Add New Bypass'}
                </h3>
                <button
                  onClick={() => setShowFormModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    fontSize: 18,
                    cursor: 'pointer'
                  }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8' }}>
                  Date
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: 10,
                      marginTop: 4,
                      background: '#0F172A',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      color: '#fff',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>

                <label style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8' }}>
                  Doc Bypass Number
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1951.9419"
                    value={formData.bypassNum}
                    onChange={e => setFormData({ ...formData, bypassNum: e.target.value })}
                    style={{
                      width: '100%',
                      padding: 10,
                      marginTop: 4,
                      background: '#0F172A',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      color: '#fff',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>

                <label style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8' }}>
                  Plat
                  <input
                    type="text"
                    placeholder="e.g. D28-362b"
                    value={formData.plat}
                    onChange={e => setFormData({ ...formData, plat: e.target.value })}
                    style={{
                      width: '100%',
                      padding: 10,
                      marginTop: 4,
                      background: '#0F172A',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      color: '#fff',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>

                <label style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8' }}>
                  Remarks
                  <input
                    type="text"
                    placeholder="e.g. pt replatted 2013"
                    value={formData.remarks}
                    onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                    style={{
                      width: '100%',
                      padding: 10,
                      marginTop: 4,
                      background: '#0F172A',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      color: '#fff',
                      boxSizing: 'border-box'
                    }}
                  />
                </label>

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: 'rgba(255,255,255,0.08)',
                      color: '#94A3B8',
                      border: 'none',
                      borderRadius: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: 12,
                      background: '#0284C7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 12,
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {editingId ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRM / ALERT MODAL */}
      <AnimatePresence>
        {alertConfig.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(5px)',
              zIndex: 10001,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              style={{
                background: '#1E293B',
                padding: 24,
                borderRadius: 20,
                width: '100%',
                maxWidth: 360,
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              <h3 style={{ margin: '0 0 10px 0', fontSize: 18, color: '#F8FAFC' }}>{alertConfig.title}</h3>
              <p style={{ margin: '0 0 20px 0', color: '#94A3B8', fontSize: 14, lineHeight: '1.5' }}>
                {alertConfig.message}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                {alertConfig.type === 'confirm' ? (
                  <>
                    <button
                      onClick={() => setAlertConfig({ isOpen: false })}
                      style={{
                        flex: 1,
                        padding: 12,
                        background: 'rgba(255,255,255,0.08)',
                        color: '#94A3B8',
                        border: 'none',
                        borderRadius: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={alertConfig.onConfirm}
                      style={{
                        flex: 1,
                        padding: 12,
                        background: '#EF4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setAlertConfig({ isOpen: false })}
                    style={{
                      width: '100%',
                      padding: 12,
                      background: '#0284C7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    OK
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
