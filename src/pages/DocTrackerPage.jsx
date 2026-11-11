import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase/firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { getCustomShortcuts, matchShortcut } from '../utils/shortcutManager';

const LS_KEY = 'docRecords_data';
const LS_QUEUE_KEY = 'docRecords_syncQueue';

const getTodayStr = () => {
  const d = new Date(Date.now() + 6 * 3600000);
  return d.toISOString().split('T')[0];
};

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

const queueDocSync = (uid, action, docId, data) => {
  try {
    const queue = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]');
    queue.push({ uid, action, docId, data, ts: Date.now() });
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
};

const flushDocQueue = async (uid) => {
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
        const docRef = doc(db, 'shiftTracker', item.uid, 'docRecords', item.docId);
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

export default function DocTrackerPage({ currentUser, onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('date'); // 'date' | 'all'
  const [selectedDate, setSelectedDate] = useState(getTodayStr());

  // Form modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formDate, setFormDate] = useState(getTodayStr());
  const [rawInput, setRawInput] = useState('');
  const [remarks, setRemarks] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Alert/Confirm modal
  const [confirmConfig, setConfirmConfig] = useState(null);
  const searchInputRef = useRef(null);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      const shortcuts = getCustomShortcuts();
      if (matchShortcut(e, shortcuts.addNewItem)) {
        e.preventDefault();
        handleOpenAdd();
      } else if (matchShortcut(e, shortcuts.focusSearch)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (matchShortcut(e, shortcuts.toggleFilter)) {
        e.preventDefault();
        setFilterMode(prev => prev === 'date' ? 'all' : 'date');
      } else if (e.key === 'Escape') {
        if (showModal) {
          setShowModal(false);
        } else if (confirmConfig) {
          setConfirmConfig(null);
        } else if (onBack) {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, confirmConfig, onBack, selectedDate, filterMode]);

  // Initial load
  useEffect(() => {
    if (!currentUser?.uid) {
      setLoading(false);
      return;
    }
    const cached = lsGet(currentUser.uid);
    if (cached.length > 0) setEntries(cached);

    const fetchData = async () => {
      try {
        await flushDocQueue(currentUser.uid);
        const colRef = collection(db, 'shiftTracker', currentUser.uid, 'docRecords');
        const q = query(colRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setEntries(remote);
        lsSave(currentUser.uid, remote);
      } catch (e) {
        console.error('Fetch docRecords failed:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  // Open add modal
  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormDate(filterMode === 'date' ? selectedDate : getTodayStr());
    setRawInput('');
    setRemarks('');
    setShowModal(true);
  };

  // Open edit modal
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormDate(item.date || getTodayStr());
    setRawInput(item.docNo || '');
    setRemarks(item.remarks || '');
    setShowModal(true);
  };

  // Save handler (supports single or multi/slash paste like "1949.1276 / 273.177")
  const handleSave = async (e) => {
    e.preventDefault();
    if (!rawInput.trim() || !currentUser?.uid) return;

    if (editingItem) {
      // Edit single item
      const updatedItem = {
        ...editingItem,
        date: formDate,
        docNo: rawInput.trim(),
        remarks: remarks.trim(),
        updatedAt: Date.now()
      };
      const updatedList = entries.map(item => item.id === editingItem.id ? updatedItem : item);
      setEntries(updatedList);
      lsSave(currentUser.uid, updatedList);
      setShowModal(false);

      try {
        const docRef = doc(db, 'shiftTracker', currentUser.uid, 'docRecords', editingItem.id);
        await setDoc(docRef, updatedItem, { merge: true });
      } catch {
        queueDocSync(currentUser.uid, 'save', editingItem.id, updatedItem);
      }
      return;
    }

    // Split pasted doc numbers by slash, comma, newline or semicolon
    const tokens = rawInput
      .split(/[\/\n,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (tokens.length === 0) return;

    const newItems = tokens.map((docNo, idx) => ({
      id: `${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
      date: formDate,
      docNo,
      remarks: remarks.trim(),
      createdAt: Date.now() + idx
    }));

    const updatedList = [...newItems, ...entries];
    setEntries(updatedList);
    lsSave(currentUser.uid, updatedList);
    setShowModal(false);

    for (const item of newItems) {
      try {
        const docRef = doc(db, 'shiftTracker', currentUser.uid, 'docRecords', item.id);
        await setDoc(docRef, item);
      } catch {
        queueDocSync(currentUser.uid, 'save', item.id, item);
      }
    }
  };

  // Delete
  const handleDelete = (item) => {
    setConfirmConfig({
      title: 'Delete Doc Record',
      message: `Delete Doc "${item.docNo}"?`,
      onConfirm: async () => {
        setConfirmConfig(null);
        const updatedList = entries.filter(e => e.id !== item.id);
        setEntries(updatedList);
        lsSave(currentUser.uid, updatedList);
        try {
          const docRef = doc(db, 'shiftTracker', currentUser.uid, 'docRecords', item.id);
          await deleteDoc(docRef);
        } catch {
          queueDocSync(currentUser.uid, 'delete', item.id);
        }
      }
    });
  };

  // Copy helper
  const handleCopy = (text, id) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Filtered & grouped items
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (filterMode === 'date' && e.date !== selectedDate) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (e.docNo && e.docNo.toLowerCase().includes(q)) ||
             (e.remarks && e.remarks.toLowerCase().includes(q));
    });
  }, [entries, filterMode, selectedDate, searchQuery]);

  return (
    <div style={{ minHeight: '100vh', background: '#0F172A', color: '#F8FAFC', paddingBottom: 60 }}>
      {/* Top Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
              borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14, fontWeight: 600
            }}
          >
            ← Back
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📑</span> Doc No Tracker
            </h1>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>Track & search pasted document numbers</span>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          title="Add Doc (Alt+N)"
          style={{
            background: '#3B82F6', border: 'none', color: '#fff',
            borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 2px 10px rgba(59,130,246,0.3)'
          }}
        >
          <span>➕</span> Add Doc
        </button>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px' }}>
        {/* Search Bar */}
        <div style={{
          position: 'relative', marginBottom: 12, background: 'rgba(255,255,255,0.05)',
          borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden'
        }}>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search doc no or remarks (Alt+F)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', background: 'transparent',
              border: 'none', color: '#fff', fontSize: 14, outline: 'none'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 14
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
          background: 'rgba(255,255,255,0.03)', padding: 6, borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          <button
            onClick={() => setFilterMode('date')}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none',
              background: filterMode === 'date' ? '#2563EB' : 'transparent',
              color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            📅 Date Wise
          </button>
          <button
            onClick={() => setFilterMode('all')}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none',
              background: filterMode === 'all' ? '#2563EB' : 'transparent',
              color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            🌐 All Docs ({entries.length})
          </button>
        </div>

        {filterMode === 'date' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, outline: 'none'
              }}
            />
            <button
              onClick={() => setSelectedDate(getTodayStr())}
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94A3B8',
                borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer'
              }}
            >
              Today
            </button>
          </div>
        )}

        {/* List of Entries */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>Loading docs...</div>
        ) : filteredEntries.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)',
            borderRadius: 14, border: '1px dashed rgba(255,255,255,0.1)'
          }}>
            <p style={{ fontSize: 26, margin: '0 0 8px 0' }}>📄</p>
            <p style={{ margin: 0, fontWeight: 600, color: '#E2E8F0' }}>No document records found</p>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748B' }}>
              Tap "➕ Add Doc" to paste numbers like 1949.1276 / 273.177
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredEntries.map(item => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 16, fontWeight: 800, color: '#38BDF8', letterSpacing: '0.5px',
                      wordBreak: 'break-all'
                    }}>
                      {item.docNo}
                    </span>
                    <button
                      onClick={() => handleCopy(item.docNo, item.id)}
                      title="Copy doc no"
                      style={{
                        background: 'rgba(255,255,255,0.1)', border: 'none', color: '#CBD5E1',
                        borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer'
                      }}
                    >
                      {copiedId === item.id ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>

                  {item.remarks && (
                    <div style={{ marginTop: 6, fontSize: 13, color: '#CBD5E1', lineHeight: '1.4' }}>
                      💬 {item.remarks}
                    </div>
                  )}

                  <div style={{ marginTop: 6, fontSize: 11, color: '#64748B' }}>
                    📅 {item.date || 'Unknown date'}
                  </div>
                </div>

                {/* Edit / Delete Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => handleOpenEdit(item)}
                    title="Edit"
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94A3B8',
                      borderRadius: 6, padding: '6px 8px', fontSize: 12, cursor: 'pointer'
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    title="Delete"
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)', border: 'none', color: '#F87171',
                      borderRadius: 6, padding: '6px 8px', fontSize: 12, cursor: 'pointer'
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: '#1E293B', width: '100%', maxWidth: 440, borderRadius: 16,
                padding: 20, border: '1px solid rgba(255,255,255,0.1)', color: '#fff'
              }}
            >
              <h3 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 700 }}>
                {editingItem ? '✏️ Edit Doc Record' : '➕ Add Doc Record'}
              </h3>

              <form onSubmit={handleSave}>
                <label style={{ fontSize: 12, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8,
                    padding: '8px 10px', fontSize: 13, marginBottom: 12
                  }}
                  required
                />

                <label style={{ fontSize: 12, color: '#94A3B8', display: 'block', marginBottom: 4 }}>
                  Doc No. {!editingItem && <span style={{ color: '#64748B' }}>(Supports paste like "1949.1276 / 273.177")</span>}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1949.1276 / 273.177"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8,
                    padding: '8px 10px', fontSize: 14, marginBottom: 12
                  }}
                  required
                  autoFocus
                />

                <label style={{ fontSize: 12, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Remarks (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Add any remarks or context..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)',
                    border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8,
                    padding: '8px 10px', fontSize: 13, marginBottom: 18, resize: 'none'
                  }}
                />

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    style={{
                      background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
                      borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      background: '#3B82F6', border: 'none', color: '#fff',
                      borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {editingItem ? 'Save Changes' : 'Add Record'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {confirmConfig && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
          }}>
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              style={{
                background: '#1E293B', width: '100%', maxWidth: 360, borderRadius: 14,
                padding: 18, border: '1px solid rgba(255,255,255,0.1)', color: '#fff', textAlign: 'center'
              }}
            >
              <h4 style={{ margin: '0 0 8px 0', fontSize: 15 }}>{confirmConfig.title}</h4>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#94A3B8' }}>{confirmConfig.message}</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={() => setConfirmConfig(null)}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
                    borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmConfig.onConfirm}
                  style={{
                    background: '#EF4444', border: 'none', color: '#fff',
                    borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
