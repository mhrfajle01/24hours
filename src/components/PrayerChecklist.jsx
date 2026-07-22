import React, { useState, useEffect } from 'react';
import { getPrayerTimes } from '../utils/prayerTimesCalc';

export default function PrayerChecklist({ selectedDate }) {
  // --- Checklist state loaded from localStorage ---
  const [checklist, setChecklist] = useState({
    Fajr: { completed: false, sunnah: false, jamaah: false },
    Dhuhr: { completed: false, sunnah: false, jamaah: false },
    Asr: { completed: false, sunnah: false, jamaah: false },
    Maghrib: { completed: false, sunnah: false, jamaah: false },
    Isha: { completed: false, sunnah: false, jamaah: false }
  });

  // --- Location & Calculation Method ---
  const [coords, setCoords] = useState({ latitude: 23.8103, longitude: 90.4125 }); // Default: Dhaka
  const [cityName, setCityName] = useState('Dhaka (Default)');
  const [prayerTimesList, setPrayerTimesList] = useState({});
  const [activePrayer, setActivePrayer] = useState(null);

  // Load checklist and geolocation on mount or when selectedDate changes
  useEffect(() => {
    const saved = localStorage.getItem(`prayer_checklist_${selectedDate}`);
    if (saved) {
      try {
        setChecklist(JSON.parse(saved));
      } catch (e) {
        console.error('Error parsing prayer checklist', e);
      }
    } else {
      setChecklist({
        Fajr: { completed: false, sunnah: false, jamaah: false },
        Dhuhr: { completed: false, sunnah: false, jamaah: false },
        Asr: { completed: false, sunnah: false, jamaah: false },
        Maghrib: { completed: false, sunnah: false, jamaah: false },
        Isha: { completed: false, sunnah: false, jamaah: false }
      });
    }
  }, [selectedDate]);

  // Request browser location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setCityName('My Location');
        },
        (error) => {
          console.warn('Geolocation access denied/failed. Using Dhaka defaults.');
        }
      );
    }
  }, []);

  // Calculate prayer times
  useEffect(() => {
    try {
      const dateParts = selectedDate.split('-');
      // format is YYYY-MM-DD
      const dateVal = dateParts.length === 3 
        ? new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10))
        : new Date();

      const tzOffset = -dateVal.getTimezoneOffset() / 60;
      const times = getPrayerTimes(dateVal, coords.latitude, coords.longitude, tzOffset);

      const formatTime = (dateObj) => {
        if (!dateObj || isNaN(dateObj.getTime())) return '--:--';
        return dateObj.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
      };

      setPrayerTimesList({
        Fajr: formatTime(times.Fajr),
        Dhuhr: formatTime(times.Dhuhr),
        Asr: formatTime(times.Asr),
        Maghrib: formatTime(times.Maghrib),
        Isha: formatTime(times.Isha)
      });

      // Determine active/current prayer window based on real-time
      const now = new Date();
      const nowMs = now.getTime();
      
      if (nowMs < times.Fajr.getTime() || nowMs >= times.Isha.getTime()) {
        setActivePrayer('Isha');
      } else if (nowMs >= times.Fajr.getTime() && nowMs < times.Dhuhr.getTime()) {
        setActivePrayer('Fajr');
      } else if (nowMs >= times.Dhuhr.getTime() && nowMs < times.Asr.getTime()) {
        setActivePrayer('Dhuhr');
      } else if (nowMs >= times.Asr.getTime() && nowMs < times.Maghrib.getTime()) {
        setActivePrayer('Asr');
      } else if (nowMs >= times.Maghrib.getTime() && nowMs < times.Isha.getTime()) {
        setActivePrayer('Maghrib');
      }
    } catch (e) {
      console.error('Error calculating prayer times', e);
    }
  }, [selectedDate, coords]);

  // Save checklist to localStorage
  const updateChecklist = (newChecklist) => {
    setChecklist(newChecklist);
    localStorage.setItem(`prayer_checklist_${selectedDate}`, JSON.stringify(newChecklist));
  };

  const handleToggleCompleted = (prayer) => {
    const updated = {
      ...checklist,
      [prayer]: {
        ...checklist[prayer],
        completed: !checklist[prayer].completed
      }
    };
    updateChecklist(updated);
  };

  const handleToggleSubState = (prayer, field) => {
    const updated = {
      ...checklist,
      [prayer]: {
        ...checklist[prayer],
        [field]: !checklist[prayer][field]
      }
    };
    updateChecklist(updated);
  };

  // Calculate progress
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const completedCount = prayers.reduce((count, p) => count + (checklist[p]?.completed ? 1 : 0), 0);
  const percentage = (completedCount / 5) * 100;

  // Format Hijri Date
  const getHijriDate = () => {
    try {
      const dateParts = selectedDate.split('-');
      const d = dateParts.length === 3 
        ? new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10))
        : new Date();
      return new Intl.DateTimeFormat('en-TN-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(d) + ' AH';
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="card border-0 rounded-4 shadow-sm mb-4 animate-slide-up" style={{ background: 'linear-gradient(135deg, #022c22 0%, #064e3b 100%)', color: '#f3f4f6', fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif" }}>
      <div className="card-body p-4">
        {/* Header Section */}
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="fw-bold m-0 d-flex align-items-center gap-2 text-warning" style={{ fontSize: '1.15rem' }}>
              <i className="bi bi-moon-stars-fill" />
              নামাজ চেকপ্রোগ্রেস
            </h5>
            <div className="text-white-50 fs-xs mt-1">
              {cityName} • {getHijriDate()}
            </div>
          </div>
          
          {/* Radial Progress Ring */}
          <div className="position-relative d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px' }}>
            <svg width="56" height="56" viewBox="0 0 36 36" className="transform -rotate-90">
              <path
                className="text-white-10"
                strokeWidth="3.5"
                stroke="rgba(255,255,255,0.15)"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-warning transition-all"
                strokeWidth="3.5"
                strokeDasharray={`${percentage}, 100`}
                strokeLinecap="round"
                stroke="#d97706"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="position-absolute text-center fw-bold text-warning" style={{ fontSize: '0.85rem' }}>
              {completedCount}/৫
            </div>
          </div>
        </div>

        {/* Location coordinates label */}
        <div className="d-flex justify-content-between mb-3 bg-black bg-opacity-20 p-2 rounded-3 align-items-center">
          <span className="fs-xs text-white-50">অবস্থান: অক্ষাংশ {coords.latitude.toFixed(2)}, দ্রাঘিমাংশ {coords.longitude.toFixed(2)}</span>
          <span className="fs-xs text-warning fw-bold">আজকের অগ্রগতি</span>
        </div>

        {/* Prayers Rows */}
        <div className="d-flex flex-column gap-2">
          {prayers.map((prayer) => {
            const isCompleted = checklist[prayer]?.completed;
            const isActive = activePrayer === prayer;
            const timeVal = prayerTimesList[prayer] || '--:--';

            const prayerNamesBn = {
              Fajr: 'ফজর',
              Dhuhr: 'জোহর',
              Asr: 'আসর',
              Maghrib: 'মাগরিব',
              Isha: 'এশা'
            };

            return (
              <div
                key={prayer}
                className={`d-flex flex-column p-3 rounded-3 transition-all ${
                  isCompleted
                    ? 'bg-black bg-opacity-30 border border-success border-opacity-20'
                    : isActive
                    ? 'prayer-active-glow bg-warning bg-opacity-10 border border-warning border-opacity-50 shadow-sm'
                    : 'bg-white bg-opacity-5 border border-transparent'
                }`}
                style={{
                  boxShadow: isActive ? '0 0 15px rgba(217, 119, 6, 0.15)' : 'none'
                }}
              >
                <div className="d-flex justify-content-between align-items-center">
                  {/* Left Side: Prayer Name & Time */}
                  <div className="d-flex align-items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleCompleted(prayer)}
                      className={`btn rounded-circle d-flex align-items-center justify-content-center border ${
                        isCompleted
                          ? 'btn-warning text-dark border-warning'
                          : 'btn-outline-light border-white-50'
                      }`}
                      style={{ width: '28px', height: '28px', minWidth: '28px', padding: 0 }}
                    >
                      {isCompleted && <i className="bi bi-check-lg fw-bold" />}
                    </button>
                    <div>
                      <span className={`fw-bold d-block ${isCompleted ? 'text-white-50 text-decoration-line-through' : 'text-white'}`} style={{ fontSize: '1rem' }}>
                        {prayerNamesBn[prayer] || prayer}
                        {isActive && <span className="badge bg-warning text-dark ms-2 fs-xs py-0.5 px-1.5 rounded-pill">সক্রিয়</span>}
                      </span>
                      <span className="text-white-50 fs-xs">{timeVal}</span>
                    </div>
                  </div>

                  {/* Right Side: Quality sub-pills */}
                  <div className="d-flex gap-1.5 align-items-center">
                    <button
                      type="button"
                      onClick={() => handleToggleSubState(prayer, 'sunnah')}
                      className={`btn btn-xs rounded-pill py-0.5 px-2 fs-xs border transition-all ${
                        checklist[prayer]?.sunnah
                          ? 'btn-outline-warning text-warning border-warning'
                          : 'btn-outline-secondary text-white-50 border-white-10'
                      }`}
                      style={{ fontSize: '0.75rem' }}
                    >
                      সুন্নত
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSubState(prayer, 'jamaah')}
                      className={`btn btn-xs rounded-pill py-0.5 px-2 fs-xs border transition-all ${
                        checklist[prayer]?.jamaah
                          ? 'btn-outline-info text-info border-info'
                          : 'btn-outline-secondary text-white-50 border-white-10'
                      }`}
                      style={{ fontSize: '0.75rem' }}
                    >
                      জামাআত
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
