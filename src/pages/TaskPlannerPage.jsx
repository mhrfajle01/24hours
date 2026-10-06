import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function TaskPlannerPage({ currentUser, onBack }) {
  const [data, setData] = useState({});
  const [saving, setSaving] = useState(false);

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const initialRows = ['High Priority', 'Medium Priority', 'Low Priority', 'Meetings', 'Follow-ups'];

  useEffect(() => {
    if (currentUser?.uid) {
      getDoc(doc(db, 'taskPlanner', currentUser.uid)).then(snap => {
        if (snap.exists()) {
          setData(snap.data().grid || {});
        }
      });
    }
  }, [currentUser]);

  const handleChange = (row, day, value) => {
    setData(prev => ({
      ...prev,
      [`${row}-${day}`]: value
    }));
  };

  const handleSave = async () => {
    if (!currentUser?.uid) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'taskPlanner', currentUser.uid), { grid: data });
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <div className="container-fluid min-vh-100 d-flex flex-column bg-light pb-5 animate-fade-in" style={{ paddingTop: '80px' }}>
      <div className="position-fixed top-0 start-0 w-100 p-3 bg-white shadow-sm d-flex align-items-center justify-content-between z-3">
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-light rounded-circle" onClick={onBack} style={{ width: 40, height: 40 }}>
            <i className="bi bi-arrow-left"></i>
          </button>
          <h5 className="mb-0 fw-bold"><i className="bi bi-file-earmark-spreadsheet text-success me-2"></i>Weekly Task Planner</h5>
        </div>
        <button className="btn btn-success rounded-pill fw-bold" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Planner'}
        </button>
      </div>

      <div className="container mt-4 flex-grow-1">
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
          <div className="table-responsive">
            <table className="table table-bordered mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th className="bg-light text-secondary text-uppercase" style={{ minWidth: 150, fontSize: '0.85rem' }}>Category</th>
                  {days.map(day => (
                    <th key={day} className="bg-light text-secondary text-center text-uppercase" style={{ minWidth: 120, fontSize: '0.85rem' }}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {initialRows.map(row => (
                  <tr key={row}>
                    <td className="fw-bold bg-light text-dark" style={{ fontSize: '0.9rem' }}>{row}</td>
                    {days.map(day => {
                      const key = `${row}-${day}`;
                      return (
                        <td key={key} className="p-0">
                          <textarea
                            className="form-control border-0 rounded-0 shadow-none w-100 h-100"
                            style={{ resize: 'none', minHeight: '80px', fontSize: '0.9rem' }}
                            placeholder="Enter tasks..."
                            value={data[key] || ''}
                            onChange={(e) => handleChange(row, day, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-secondary small mt-3 text-center">Your data is saved to the cloud when you click Save.</p>
      </div>
    </div>
  );
}
