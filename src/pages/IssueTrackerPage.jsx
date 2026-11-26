import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const LS_KEY = 'issueTracker_items';

const PRIORITY_CFG = {
  low: { label: 'Low', color: '#10B981', bg: '#ECFDF5' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high: { label: 'High', color: '#EF4444', bg: '#FEF2F2' },
  critical: { label: 'Critical', color: '#991B1B', bg: '#FEE2E2' }
};

const STATUS_CFG = {
  open: { label: 'Open', color: '#EF4444', bg: '#FEF2F2', next: 'in_progress', prev: 'resolved' },
  in_progress: { label: 'In Progress', color: '#3B82F6', bg: '#EFF6FF', next: 'resolved', prev: 'open' },
  resolved: { label: 'Resolved', color: '#10B981', bg: '#ECFDF5', next: 'open', prev: 'in_progress' }
};

export default function IssueTrackerPage({ currentUser, onBack }) {
  const uid = currentUser?.uid || 'guest';
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`${LS_KEY}_${uid}`)) || [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(() => Boolean(currentUser?.uid && navigator.onLine));
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', module: 'UI', customModule: '', priority: 'medium', note: '' });

  // Custom Modals State
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);

  // Sync from Firestore on mount
  useEffect(() => {
    if (!currentUser?.uid || !navigator.onLine) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'issueTracker', currentUser.uid));
        if (!cancelled && snap.exists() && Array.isArray(snap.data()?.items)) {
          const cloud = snap.data().items;
          setItems(cloud);
          localStorage.setItem(`${LS_KEY}_${uid}`, JSON.stringify(cloud));
        }
      } catch {}
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentUser?.uid, uid]);

  const saveItems = async (next) => {
    setItems(next);
    try {
      localStorage.setItem(`${LS_KEY}_${uid}`, JSON.stringify(next));
    } catch {}
    if (currentUser?.uid && navigator.onLine) {
      try {
        await setDoc(doc(db, 'issueTracker', currentUser.uid), { items: next, updatedAt: Date.now() }, { merge: true });
      } catch {}
    }
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (form.module === 'Other' && !form.customModule.trim()) return;
    const finalModule = form.module === 'Other' ? form.customModule.trim() : form.module;
    const newItem = {
      id: Date.now(),
      title: form.title.trim(),
      module: finalModule,
      priority: form.priority,
      note: form.note.trim(),
      status: 'open',
      createdAt: new Date().toISOString()
    };
    saveItems([newItem, ...items]);
    setForm({ title: '', module: 'UI', customModule: '', priority: 'medium', note: '' });
    setShowForm(false);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editItem || !editItem.title.trim()) return;
    if (editItem.module === 'Other' && !(editItem.customModule || '').trim()) return;
    const finalModule = editItem.module === 'Other' ? editItem.customModule.trim() : editItem.module;
    const next = items.map(it => it.id === editItem.id ? {
      ...it,
      title: editItem.title.trim(),
      module: finalModule,
      priority: editItem.priority,
      note: (editItem.note || '').trim()
    } : it);
    saveItems(next);
    setEditItem(null);
  };

  const confirmDelete = () => {
    if (!deleteItem) return;
    saveItems(items.filter(it => it.id !== deleteItem.id));
    setDeleteItem(null);
  };

  const cycleStatus = (id, dir = 'next') => {
    const next = items.map(it => it.id === id ? { ...it, status: STATUS_CFG[it.status]?.[dir] || 'open' } : it);
    saveItems(next);
  };

  const filtered = items.filter(it => {
    if (filterStatus !== 'all' && it.status !== filterStatus) return false;
    if (search.trim() && !it.title.toLowerCase().includes(search.toLowerCase()) && !it.module.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCount = items.filter(i => i.status === 'open').length;
  const progCount = items.filter(i => i.status === 'in_progress').length;
  const resCount = items.filter(i => i.status === 'resolved').length;

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', color: '#0F172A', paddingBottom: 40, overflowX: 'hidden' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E2E8F0', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button onClick={onBack} type="button" style={{ border: '1px solid #E2E8F0', background: '#F1F5F9', borderRadius: '50%', width: 36, height: 36, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-chevron-left" />
          </button>
          <div style={{ minWidth: 0 }}>
            <h5 style={{ margin: 0, fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🐞 Issue &amp; Bug Tracker</h5>
            <small style={{ color: '#64748B', fontSize: 11, display: 'block' }}>Swipe cards to change status</small>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} type="button" style={{ flexShrink: 0, background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          {showForm ? '✕ Close' : '+ New Issue'}
        </button>
      </header>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '14px' }}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#DC2626' }}>{openCount}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B' }}>Open</div>
          </div>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#2563EB' }}>{progCount}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF' }}>In Progress</div>
          </div>
          <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#059669' }}>{resCount}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#065F46' }}>Resolved</div>
          </div>
        </div>

        {/* Add Issue Form */}
        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onSubmit={handleAdd}
              style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 14, marginBottom: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}
            >
              <input
                type="text"
                placeholder="Issue / Bug title..."
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={form.module} onChange={e => setForm({ ...form, module: e.target.value })} style={{ flex: 1, minWidth: 120, padding: 10, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}>
                  <option value="UI">UI / Design</option>
                  <option value="Shift Tracker">Shift Tracker</option>
                  <option value="Wallet">Wallet</option>
                  <option value="Local AI">Local AI</option>
                  <option value="Other">Other</option>
                </select>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={{ flex: 1, minWidth: 120, padding: 10, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              {form.module === 'Other' && (
                <input
                  type="text"
                  placeholder="Specify section / category (required)..."
                  value={form.customModule}
                  onChange={e => setForm({ ...form, customModule: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #818CF8', marginBottom: 10, fontSize: 13, boxSizing: 'border-box', background: '#EEF2FF' }}
                />
              )}
              <textarea
                rows={2}
                placeholder="Optional note / steps to reproduce..."
                value={form.note}
                onChange={e => setForm({ ...form, note: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', marginBottom: 10, fontSize: 13, boxSizing: 'border-box' }}
              />
              <button type="submit" style={{ width: '100%', padding: 10, background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                Save Issue
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Filter & Search */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <input
            type="text"
            placeholder="Search issues or modules..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 13, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
            {['all', 'open', 'in_progress', 'resolved'].map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                style={{
                  flexShrink: 0,
                  padding: '6px 12px',
                  borderRadius: 10,
                  border: '1px solid #E2E8F0',
                  background: filterStatus === st ? '#0F172A' : '#fff',
                  color: filterStatus === st ? '#fff' : '#475569',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {st === 'all' ? 'All' : STATUS_CFG[st].label}
              </button>
            ))}
          </div>
        </div>

        {/* Refresh / Sync Loading Animation */}
        {isLoading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: '48px 20px', textAlign: 'center', background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0' }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ width: 38, height: 38, borderRadius: '50%', border: '3px solid #E2E8F0', borderTopColor: '#4F46E5', margin: '0 auto 12px' }}
            />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>Syncing Issues...</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Loading latest bug reports</div>
          </motion.div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94A3B8', fontSize: 14 }}>
            No issues found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AnimatePresence>
              {filtered.map(it => {
                const p = PRIORITY_CFG[it.priority] || PRIORITY_CFG.medium;
                const s = STATUS_CFG[it.status] || STATUS_CFG.open;
                return (
                  <motion.div
                    key={it.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.25}
                    onDragEnd={(_, info) => {
                      if (info.offset.x > 65) cycleStatus(it.id, 'next');
                      else if (info.offset.x < -65) cycleStatus(it.id, 'prev');
                    }}
                    style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, touchAction: 'pan-y', cursor: 'grab' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 12, background: p.bg, color: p.color }}>{p.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#F1F5F9', color: '#475569' }}>{it.module}</span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: it.status === 'resolved' ? '#94A3B8' : '#0F172A', textDecoration: it.status === 'resolved' ? 'line-through' : 'none', wordBreak: 'break-word' }}>
                        {it.title}
                      </div>
                      {it.note && <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, wordBreak: 'break-word' }}>{it.note}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => cycleStatus(it.id, 'next')}
                        style={{ padding: '5px 9px', borderRadius: 8, border: 'none', background: s.bg, color: s.color, fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {s.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const stdModules = ['UI', 'Shift Tracker', 'Wallet', 'Local AI'];
                          const isCustom = !stdModules.includes(it.module);
                          setEditItem({
                            ...it,
                            module: isCustom ? 'Other' : it.module,
                            customModule: isCustom ? it.module : ''
                          });
                        }}
                        style={{ padding: '5px 8px', borderRadius: 8, border: 'none', background: '#F1F5F9', color: '#334155', fontSize: 12, cursor: 'pointer' }}
                      >
                        <i className="bi bi-pencil" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteItem(it)}
                        style={{ padding: '5px 8px', borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#DC2626', fontSize: 12, cursor: 'pointer' }}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Custom Edit Modal */}
      <AnimatePresence>
        {editItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setEditItem(null)}
          >
            <motion.form
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              onSubmit={handleSaveEdit}
              style={{ width: '100%', maxWidth: 440, maxHeight: '90dvh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
            >
              <h6 style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 16 }}>✏️ Edit Issue</h6>
              <input
                type="text"
                value={editItem.title}
                onChange={e => setEditItem({ ...editItem, title: e.target.value })}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #CBD5E1', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select value={editItem.module} onChange={e => setEditItem({ ...editItem, module: e.target.value })} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}>
                  <option value="UI">UI / Design</option>
                  <option value="Shift Tracker">Shift Tracker</option>
                  <option value="Wallet">Wallet</option>
                  <option value="Local AI">Local AI</option>
                  <option value="Other">Other</option>
                </select>
                <select value={editItem.priority} onChange={e => setEditItem({ ...editItem, priority: e.target.value })} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              {editItem.module === 'Other' && (
                <input
                  type="text"
                  placeholder="Specify section / category (required)..."
                  value={editItem.customModule || ''}
                  onChange={e => setEditItem({ ...editItem, customModule: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #818CF8', marginBottom: 10, fontSize: 13, boxSizing: 'border-box', background: '#EEF2FF' }}
                />
              )}
              <textarea
                rows={3}
                value={editItem.note || ''}
                onChange={e => setEditItem({ ...editItem, note: e.target.value })}
                placeholder="Note / steps..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', marginBottom: 14, fontSize: 13, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditItem(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4F46E5', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Save Changes
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setDeleteItem(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}
            >
              <h6 style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 16, color: '#DC2626' }}>🗑️ Delete Issue?</h6>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong>"{deleteItem.title}"</strong>? This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setDeleteItem(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="button" onClick={confirmDelete} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
