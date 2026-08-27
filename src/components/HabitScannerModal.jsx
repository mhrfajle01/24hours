import React, { useMemo, useState } from 'react';

const dateLabel = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export default function HabitScannerModal({ streaks = [], updateStreak, recordRelapse, onClose }) {
  const reviews = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = [];

    streaks.forEach((streak) => {
      const start = new Date(streak.startDate || today);
      start.setHours(0, 0, 0, 0);
      const history = Array.isArray(streak.history) ? streak.history : [];
      const resolved = new Set([
        ...history.map((entry) => entry.date).filter(Boolean),
        ...(streak.relapseHistory || []).map((entry) => entry.date).filter(Boolean),
      ]);
      const cursor = new Date(start);
      while (cursor < today && items.length < 12) {
        const date = cursor.toISOString().slice(0, 10);
        if (!resolved.has(date)) items.push({ streak, date });
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return items;
  }, [streaks]);

  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState('');
  const [trigger, setTrigger] = useState('');
  const [saving, setSaving] = useState(false);
  const current = reviews[index];

  if (!current) {
    return (
      <div className="security-choice-backdrop position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3">
        <div className="bg-white rounded-4 shadow-lg p-4 w-100" style={{ maxWidth: 460 }}>
          <h5 className="fw-bold text-dark"><i className="bi bi-shield-check text-success me-2" />Habit Scanner</h5>
          <p className="text-success mb-3"><i className="bi bi-check-circle-fill me-2" />No forgotten habit days need review.</p>
          <button className="btn btn-success rounded-pill w-100 fw-bold" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const saveReview = async (result) => {
    setSaving(true);
    try {
      if (result === 'maintained') {
        const history = Array.isArray(current.streak.history) ? current.streak.history : [];
        await updateStreak(current.streak.id, {
          history: [...history, { date: current.date, status: 'maintained', note: note.trim() }],
        });
      } else if (result === 'relapse') {
        await recordRelapse(current.streak.id, trigger, note);
      }
      setMode(null);
      setNote('');
      setTrigger('');
      setIndex((value) => value + 1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="security-choice-backdrop position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3">
      <div className="bg-white rounded-4 shadow-lg p-4 w-100" style={{ maxWidth: 460 }}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h5 className="fw-bold text-dark mb-0"><i className="bi bi-shield-exclamation text-warning me-2" />Habit Review</h5>
          <span className="badge bg-light text-success">{index + 1}/{reviews.length}</span>
        </div>
        <p className="text-secondary small">A past day for <strong>{current.streak.emoji} {current.streak.name}</strong> has no update.</p>
        <div className="rounded-3 p-3 mb-3" style={{ background: '#fff8e1' }}>
          <div className="fw-bold text-dark">{current.streak.category === 'Breaking' ? 'Did you avoid this habit?' : 'Did you complete this habit?'}</div>
          <div className="small text-secondary mt-1">{dateLabel(current.date)}</div>
        </div>

        {!mode ? (
          <div className="d-grid gap-2">
            <button className="btn btn-success rounded-3 fw-bold" onClick={() => setMode('maintained')}>✅ Yes, I maintained it</button>
            <button className="btn btn-outline-danger rounded-3 fw-bold" onClick={() => setMode('relapse')}>❌ No, I broke the habit</button>
            <button className="btn btn-link text-secondary" onClick={onClose}>Skip for now</button>
          </div>
        ) : (
          <>
            {mode === 'relapse' && (
              <select className="form-select mb-2" value={trigger} onChange={(event) => setTrigger(event.target.value)}>
                <option value="">Select a trigger (optional)</option>
                {['Boredom', 'Stress', 'Loneliness', 'Late Night', 'Peer Pressure', 'Lack of Sleep', 'Other'].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            )}
            <textarea
              className="form-control mb-3"
              rows="3"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note"
            />
            <div className="d-flex gap-2">
              <button className="btn btn-light rounded-pill flex-grow-1" onClick={() => setMode(null)} disabled={saving}>Back</button>
              <button className={`btn rounded-pill flex-grow-1 fw-bold ${mode === 'relapse' ? 'btn-danger' : 'btn-success'}`} onClick={() => saveReview(mode)} disabled={saving}>
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
