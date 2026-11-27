import React, { useState, useEffect } from 'react';

const MISSED_REASONS = [
  '😴 ঘুম থেকে উঠতে পারিনি',
  '🏢 কাজে/অফিসে ব্যস্ত ছিলাম',
  '🚗 ভ্রমণে/রাস্তায় ছিলাম',
  '🤒 অসুস্থ ছিলাম',
  '😔 অলসতা/গাফলতি',
  '✍️ অন্যান্য...'
];

export default function SalatPendingReviewModal({
  isOpen,
  pendingWaqts, // [{ id: 'fajr', name: 'Fajr', bn: 'ফজর', waqtTime: '05:05', jamatTime: '05:30' }]
  onSave
}) {
  const [reviews, setReviews] = useState({});
  const [customReasons, setCustomReasons] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && pendingWaqts?.length > 0) {
      const initial = {};
      pendingWaqts.forEach(w => {
        initial[w.id] = { status: null, reason: '' };
      });
      setReviews(initial);
      setCustomReasons({});
      setIsSaving(false);
    }
  }, [isOpen, pendingWaqts]);

  if (!isOpen || !pendingWaqts || pendingWaqts.length === 0) return null;

  const handleStatusSelect = (waqtId, status) => {
    setReviews(prev => ({
      ...prev,
      [waqtId]: {
        ...prev[waqtId],
        status,
        reason: status === 'missed' ? (prev[waqtId]?.reason || MISSED_REASONS[0]) : ''
      }
    }));
  };

  const handleReasonSelect = (waqtId, reason) => {
    setReviews(prev => ({
      ...prev,
      [waqtId]: { ...prev[waqtId], reason }
    }));
  };

  const handleCustomReasonChange = (waqtId, text) => {
    setCustomReasons(prev => ({ ...prev, [waqtId]: text }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    for (const w of pendingWaqts) {
      const r = reviews[w.id];
      if (!r || !r.status) {
        alert(`অনুগ্রহ করে "${w.bn}" ওয়াক্তের স্ট্যাটাস নির্বাচন করুন!`);
        return;
      }
      if (r.status === 'missed') {
        const finalReason = r.reason === '✍️ অন্যান্য...' ? customReasons[w.id]?.trim() : r.reason;
        if (!finalReason) {
          alert(`"${w.bn}" ওয়াক্ত মিস করার কারণ উল্লেখ করা বাধ্যতামূলক!`);
          return;
        }
      }
    }

    const payload = pendingWaqts.map(w => {
      const r = reviews[w.id];
      const finalReason = r.status === 'missed' 
        ? (r.reason === '✍️ অন্যান্য...' ? (customReasons[w.id]?.trim() || 'অন্যান্য') : r.reason)
        : '';
      return {
        id: w.id,
        status: r.status,
        reason: finalReason
      };
    });

    try {
      setIsSaving(true);
      await onSave(payload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Strict non-closable forceful blocking overlay */}
      <div className="modal-backdrop fade show" style={{ zIndex: 9998, backgroundColor: 'rgba(15, 23, 42, 0.88)', backdropFilter: 'blur(8px)' }} />
      <div 
        className="modal fade show d-block" 
        style={{ zIndex: 9999 }} 
        tabIndex="-1" 
        role="dialog" 
        aria-modal="true"
        onKeyDown={(e) => { if (e.key === 'Escape') e.preventDefault(); }}
      >
        <div className="modal-dialog modal-dialog-centered modal-lg" role="document">
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden" style={{ background: '#F8FAFC' }}>
            
            <div className="modal-header border-0 text-white p-3" style={{ background: 'linear-gradient(135deg, #064E3B 0%, #047857 100%)' }}>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-clock-history fs-5" />
                <div>
                  <h6 className="modal-title fw-bold mb-0">🕌 সালাত ও ওয়াক্ত রিভিউ (Mandatory)</h6>
                  <span style={{ fontSize: 11, opacity: 0.9 }}>বিগত ওয়াক্তের হিসাব সম্পন্ন করুন</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body p-3 p-md-4" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div className="alert alert-warning border-0 rounded-3 py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: 12, background: '#FEF3C7', color: '#92400E' }}>
                  <i className="bi bi-exclamation-triangle-fill fs-6" />
                  <span>ওয়াক্ত অতিবাহিত হয়েছে। সালাত সম্পন্ন বা মিস হওয়ার সঠিক তথ্য সংরক্ষণ করা বাধ্যতামূলক।</span>
                </div>

                <div className="d-flex flex-column gap-3">
                  {pendingWaqts.map(w => {
                    const rev = reviews[w.id] || {};
                    const isMissed = rev.status === 'missed';

                    return (
                      <div key={w.id} className="p-3 rounded-3 border" style={{ background: '#fff', borderColor: rev.status ? '#10B981' : '#E2E8F0' }}>
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                          <div>
                            <span className="fw-bold fs-6 text-dark">{w.bn} ({w.name})</span>
                            <div style={{ fontSize: 11, color: '#64748B' }}>
                              ওয়াক্ত: {w.waqtTime || '--:--'} {w.jamatTime ? `| জামাত: ${w.jamatTime}` : ''}
                            </div>
                          </div>
                          
                          <div className="d-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStatusSelect(w.id, 'jamat')}
                              className="btn btn-sm rounded-pill px-2.5 py-1 fw-bold"
                              style={{
                                fontSize: 11,
                                background: rev.status === 'jamat' ? '#059669' : '#ECFDF5',
                                color: rev.status === 'jamat' ? '#fff' : '#065F46',
                                border: '1px solid #A7F3D0'
                              }}
                            >
                              {w.isJumuah ? '🕌 জুমু\'আ জামাত' : '🕌 জামাত'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusSelect(w.id, 'alone')}
                              className="btn btn-sm rounded-pill px-2.5 py-1 fw-bold"
                              style={{
                                fontSize: 11,
                                background: rev.status === 'alone' ? '#2563EB' : '#EFF6FF',
                                color: rev.status === 'alone' ? '#fff' : '#1E40AF',
                                border: '1px solid #BFDBFE'
                              }}
                            >
                              {w.isJumuah ? '🧍 একাকী যোহর' : '🧍 একাকী'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusSelect(w.id, 'missed')}
                              className="btn btn-sm rounded-pill px-2.5 py-1 fw-bold"
                              style={{
                                fontSize: 11,
                                background: rev.status === 'missed' ? '#DC2626' : '#FEF2F2',
                                color: rev.status === 'missed' ? '#fff' : '#991B1B',
                                border: '1px solid #FECACA'
                              }}
                            >
                              {w.isJumuah ? '❌ জুমু\'আ মিস (কাযা)' : '❌ মিস (কাযা)'}
                            </button>
                          </div>
                        </div>

                        {isMissed && (
                          <div className="mt-2 pt-2 border-top border-light-subtle">
                            <label className="fw-bold text-danger mb-1" style={{ fontSize: 11.5 }}>
                              মিস হওয়ার কারণ নির্বাচন করুন * (স্বয়ংক্রিয় কাযায় যুক্ত হবে)
                            </label>
                            <select
                              className="form-select form-select-sm mb-2"
                              style={{ fontSize: 12, borderRadius: 8 }}
                              value={rev.reason || MISSED_REASONS[0]}
                              onChange={e => handleReasonSelect(w.id, e.target.value)}
                            >
                              {MISSED_REASONS.map(r => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>

                            {rev.reason === '✍️ অন্যান্য...' && (
                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="মিস হওয়ার সুনির্দিষ্ট কারণ লিখুন..."
                                style={{ fontSize: 12, borderRadius: 8 }}
                                value={customReasons[w.id] || ''}
                                onChange={e => handleCustomReasonChange(w.id, e.target.value)}
                                required
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer border-0 p-3 bg-white d-flex justify-content-between">
                <span className="text-muted" style={{ fontSize: 11 }}>
                  * কোনো ওয়াক্ত বাদ রেখে সেভ করা যাবে না
                </span>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-success fw-bold px-4 py-2 rounded-3"
                  style={{ background: '#059669', borderColor: '#059669', fontSize: 13 }}
                >
                  {isSaving ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>

          </div>
        </div>
      </div>
    </>
  );
}
