import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getLocalAIKnowledge, saveLocalAIKnowledge, getDefaultKnowledge } from '../utils/localAIEngine';

const EMPTY = { topic: '', keywords: '', answer: '' };

export default function AdminAILearningTab() {
  const [items, setItems] = useState([]);
  const [view, setView] = useState('list'); // list | form | bulk
  const [editIdx, setEditIdx] = useState(-1); // -1 = new
  const [form, setForm] = useState({ ...EMPTY });
  const [search, setSearch] = useState('');
  const [bulkJson, setBulkJson] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'aiKnowledgeBase', 'dataset'));
        if (snap.exists() && Array.isArray(snap.data()?.items)) {
          const ci = snap.data().items;
          setItems(ci);
          saveLocalAIKnowledge(ci);
          return;
        }
      } catch {}
      setItems(getLocalAIKnowledge());
    })();
  }, []);

  const flash = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 3000);
  };

  const syncToCloud = async (newItems) => {
    saveLocalAIKnowledge(newItems);
    setItems(newItems);
    setSaving(true);
    try {
      await setDoc(doc(db, 'aiKnowledgeBase', 'dataset'), { items: newItems, updatedAt: new Date().toISOString() });
      flash(`✅ ${newItems.length} টপিক Cloud-এ সিঙ্ক হয়েছে!`);
    } catch (e) {
      flash('লোকালে সেভ হয়েছে, Cloud সিঙ্ক ব্যর্থ', 'warning');
    }
    setSaving(false);
  };

  const handleSaveForm = () => {
    const t = form.topic.trim(), a = form.answer.trim(), k = form.keywords.trim();
    if (!t || !a || !k) return flash('সব ফিল্ড পূরণ করুন!', 'danger');
    const entry = { topic: t, keywords: k.split(',').map(s => s.trim()).filter(Boolean), answer: a };
    let updated;
    if (editIdx >= 0) {
      updated = [...items];
      updated[editIdx] = entry;
    } else {
      updated = [...items, entry];
    }
    syncToCloud(updated);
    setForm({ ...EMPTY });
    setEditIdx(-1);
    setView('list');
  };

  const handleDelete = (idx) => {
    if (!window.confirm(`"${items[idx].topic}" ডিলিট করবেন?`)) return;
    syncToCloud(items.filter((_, i) => i !== idx));
  };

  const handleEdit = (idx) => {
    const it = items[idx];
    setForm({ topic: it.topic, keywords: Array.isArray(it.keywords) ? it.keywords.join(', ') : '', answer: it.answer });
    setEditIdx(idx);
    setView('form');
  };

  const handleBulkSave = () => {
    try {
      const parsed = JSON.parse(bulkJson);
      if (!Array.isArray(parsed)) return flash('JSON অবশ্যই Array হতে হবে!', 'danger');
      syncToCloud(parsed);
      setBulkJson('');
      setView('list');
    } catch { flash('ভুল JSON ফরম্যাট!', 'danger'); }
  };

  const handleFileUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { try { JSON.parse(ev.target.result); setBulkJson(ev.target.result); flash('ফাইল লোড হয়েছে, Save চাপুন', 'info'); } catch { flash('ভুল JSON!', 'danger'); } };
    r.readAsText(f);
  };

  const filtered = items.filter(it => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return it.topic?.toLowerCase().includes(s) || it.answer?.toLowerCase().includes(s) || it.keywords?.some(k => k.toLowerCase().includes(s));
  });

  const S = { card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }, btn: (bg) => ({ background: bg, border: 'none', color: '#fff', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }), input: { background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', borderRadius: 10, padding: '10px 14px', fontSize: 13, width: '100%' } };

  return (
    <section className="admin-section-card">
      <div className="admin-section-heading">
        <div><small>INTELLIGENCE</small><h2>AI Learning & Brain</h2></div>
        <span className="admin-count">{items.length} Topics</span>
      </div>

      {msg.text && <div className={`alert alert-${msg.type} py-2 px-3 small rounded-3 mb-3`}>{msg.text}</div>}

      {/* Tab Buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={S.btn(view === 'list' ? '#6366F1' : 'rgba(255,255,255,0.08)')} onClick={() => { setView('list'); setEditIdx(-1); setForm({ ...EMPTY }); }}>
          <i className="bi bi-list-ul me-1" />All Topics
        </button>
        <button style={S.btn(view === 'form' && editIdx < 0 ? '#10B981' : 'rgba(255,255,255,0.08)')} onClick={() => { setView('form'); setEditIdx(-1); setForm({ ...EMPTY }); }}>
          <i className="bi bi-plus-circle me-1" />New Topic
        </button>
        <button style={S.btn(view === 'bulk' ? '#F59E0B' : 'rgba(255,255,255,0.08)')} onClick={() => { setView('bulk'); setBulkJson(JSON.stringify(items, null, 2)); }}>
          <i className="bi bi-code-slash me-1" />Bulk JSON
        </button>
        <button style={S.btn('rgba(255,255,255,0.05)')} onClick={() => { if (window.confirm('Reset to defaults?')) { const d = getDefaultKnowledge(); syncToCloud(d); } }}>
          <i className="bi bi-arrow-counterclockwise me-1" />Reset
        </button>
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <div>
          <input type="text" placeholder="🔍 Search topics..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, marginBottom: 14 }} />
          {filtered.length === 0 && <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 20 }}>কোনো টপিক পাওয়া যায়নি</p>}
          {filtered.map((it, i) => {
            const realIdx = items.indexOf(it);
            return (
              <div key={realIdx} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#E0E7FF', marginBottom: 4 }}>{it.topic}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {(it.keywords || []).slice(0, 5).map((kw, ki) => (
                        <span key={ki} style={{ background: 'rgba(99,102,241,0.15)', color: '#A5B4FC', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{kw}</span>
                      ))}
                      {(it.keywords || []).length > 5 && <span style={{ fontSize: 10, color: '#64748B' }}>+{it.keywords.length - 5}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.4, whiteSpace: 'pre-line', maxHeight: 60, overflow: 'hidden' }}>{it.answer}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleEdit(realIdx)} style={{ ...S.btn('rgba(99,102,241,0.2)'), color: '#818CF8' }} title="Edit"><i className="bi bi-pencil" /></button>
                    <button onClick={() => handleDelete(realIdx)} style={{ ...S.btn('rgba(239,68,68,0.15)'), color: '#F87171' }} title="Delete"><i className="bi bi-trash3" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FORM VIEW (Create / Edit) */}
      {view === 'form' && (
        <div>
          <h6 style={{ color: '#C4B5FD', fontWeight: 700, marginBottom: 14 }}>
            <i className={`bi ${editIdx >= 0 ? 'bi-pencil-square' : 'bi-plus-circle'} me-2`} />
            {editIdx >= 0 ? 'Edit Topic' : 'Create New Topic'}
          </h6>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, display: 'block' }}>Topic Title</label>
            <input type="text" value={form.topic} onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} placeholder="e.g. Shift Tracker" style={S.input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, display: 'block' }}>Keywords (comma separated)</label>
            <input type="text" value={form.keywords} onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))} placeholder="shift, tracker, সময়, report" style={S.input} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, display: 'block' }}>Answer</label>
            <textarea value={form.answer} onChange={e => setForm(p => ({ ...p, answer: e.target.value }))} rows={5} placeholder="AI এই উত্তর দেবে..." style={{ ...S.input, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSaveForm} disabled={saving} style={S.btn('#6366F1')}>
              <i className="bi bi-check-lg me-1" />{saving ? 'Saving...' : editIdx >= 0 ? 'Update Topic' : 'Add Topic'}
            </button>
            <button onClick={() => { setView('list'); setEditIdx(-1); setForm({ ...EMPTY }); }} style={S.btn('rgba(255,255,255,0.08)')}>Cancel</button>
          </div>
        </div>
      )}

      {/* BULK JSON VIEW */}
      {view === 'bulk' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <label style={S.btn('rgba(99,102,241,0.2)')}>
              <i className="bi bi-file-earmark-code me-1" />Upload JSON
              <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>
          <textarea value={bulkJson} onChange={e => setBulkJson(e.target.value)} rows={12} style={{ ...S.input, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', marginBottom: 12 }} placeholder='[{"topic":"...","keywords":["..."],"answer":"..."}]' />
          <button onClick={handleBulkSave} disabled={saving} style={{ ...S.btn('#6366F1'), width: '100%', padding: '10px 0' }}>
            <i className="bi bi-cpu me-2" />{saving ? 'Saving...' : 'Save to AI Brain'}
          </button>
        </div>
      )}
    </section>
  );
}
