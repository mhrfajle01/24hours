import React, { useState, useEffect } from 'react';
import { formatFriendlyDate, getCurrentTimeString, getCurrentHourAndAMPM, getIntervalTimes, formatTime12h, timeToMinutes, getTodayDateString } from '../utils/helpers';

/**
 * Sticky Header — profile avatar opens ProfileModal, gear opens SettingsModal.
 */
export default function Header({ selectedDate, reports = [], onOpenSettings, onOpenProfile, onOpenTrash, trashCount, currentUser }) {
  const [timeStr, setTimeStr] = useState(getCurrentTimeString());
  const [currentHourData, setCurrentHourData] = useState(getCurrentHourAndAMPM());
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(getCurrentTimeString());
      setCurrentHourData(getCurrentHourAndAMPM());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const avatarInitial = (currentUser?.displayName || currentUser?.email || '?')
    .charAt(0)
    .toUpperCase();

  const formatCurrentHourRange = () => {
    const { hour, ampm } = currentHourData;
    const padded = String(hour).padStart(2, '0');
    let nextHour = hour + 1;
    let nextAmpm = ampm;
    if (hour === 11) {
      nextAmpm = ampm === 'AM' ? 'PM' : 'AM';
    } else if (hour === 12) {
      nextHour = 1;
    }
    const nextPadded = String(nextHour).padStart(2, '0');
    return `${padded}:00 ${ampm} - ${nextPadded}:00 ${nextAmpm}`;
  };

  const getActiveSlotTimeStr = () => {
    const isTodaySelected = selectedDate === getTodayDateString();
    if (!isTodaySelected || !reports || reports.length === 0) {
      return null;
    }
    
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    
    const matchingReports = reports.filter((report) => {
      const times = getIntervalTimes(report);
      const startMin = timeToMinutes(times.startTime);
      let endMin = timeToMinutes(times.endTime);
      if (endMin < startMin) {
        endMin += 24 * 60;
      }
      return (endMin >= 24 * 60)
        ? (currentMin >= startMin || currentMin < (endMin % (24 * 60)))
        : (currentMin >= startMin && currentMin < endMin);
    });
    
    if (matchingReports.length > 0) {
      let bestMatch = matchingReports[0];
      let minDiff = Infinity;
      matchingReports.forEach(r => {
        const times = getIntervalTimes(r);
        const startMin = timeToMinutes(times.startTime);
        const diff = currentMin - startMin;
        if (diff >= 0 && diff < minDiff) {
          minDiff = diff;
          bestMatch = r;
        }
      });
      const times = getIntervalTimes(bestMatch);
      return `${formatTime12h(times.startTime)} - ${formatTime12h(times.endTime)}`;
    }
    return null;
  };

  const activeSlotTime = getActiveSlotTimeStr();
  const displayTimeRange = activeSlotTime ? activeSlotTime : formatCurrentHourRange();

  return (
    <header className="sticky-top shadow-sm px-3 py-2 text-white" style={{ backgroundColor: '#075E54', zIndex: 1020 }}>
      <div className="container-fluid max-width-container d-flex align-items-center justify-content-between">
        
        {/* Left: Branding + Date */}
        <div>
          <h1 className="h4 m-0 fw-bold d-flex align-items-center gap-2">
            <i className="bi bi-chat-left-text-fill" style={{ color: '#25D366' }} />
            <span>HourLog</span>
            {!isOnline && (
              <span 
                className="badge bg-warning text-dark rounded-pill fs-xs px-2 py-0.5 ms-1 fw-bold d-inline-flex align-items-center gap-1 animate-pulse"
                title="Working offline. Changes will sync when connection is restored."
              >
                <i className="bi bi-cloud-slash-fill"></i> Offline
              </span>
            )}
            {isOnline && (
              <span 
                className="badge bg-success-subtle text-success border border-success-subtle rounded-pill fs-xs px-2 py-0.5 ms-1 fw-semibold d-none d-md-inline-flex align-items-center gap-1"
                style={{ opacity: 0.85 }}
                title="Connected to server. All data synced."
              >
                <i className="bi bi-cloud-check-fill"></i> Synced
              </span>
            )}
          </h1>
          <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>
            {formatFriendlyDate(selectedDate)}
          </span>
        </div>
 
        {/* Right: Clock + Profile + Settings */}
        <div className="d-flex align-items-center gap-2">
 
          {/* Clock — desktop */}
          <div className="text-end d-none d-sm-block me-1">
            <div className="fw-semibold" style={{ color: '#25D366', fontSize: '0.95rem' }}>
              {timeStr}
            </div>
            <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>
              NOW: {displayTimeRange}
            </div>
          </div>
 
          {/* Clock — mobile */}
          <div className="text-end d-block d-sm-none me-1" style={{ fontSize: '0.8rem' }}>
            <div className="fw-semibold" style={{ color: '#25D366' }}>{timeStr}</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>
              NOW: {displayTimeRange}
            </div>
          </div>

          {/* Profile Avatar → opens ProfileModal */}
          {currentUser && (
            <button
              type="button"
              className="btn p-0 border-0 bg-transparent hover-scale"
              onClick={onOpenProfile}
              title={`${currentUser.displayName || 'Profile'} — Edit Profile`}
              aria-label="Open Profile"
              style={{ outline: 'none', boxShadow: 'none' }}
            >
              <div
                className="rounded-circle overflow-hidden d-flex align-items-center justify-content-center border border-2 border-white"
                style={{ width: '34px', height: '34px', minWidth: '34px', backgroundColor: '#128C7E' }}
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="Profile"
                    className="w-100 h-100 object-fit-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-white fw-bold" style={{ fontSize: '0.85rem' }}>
                    {avatarInitial}
                  </span>
                )}
              </div>
            </button>
          )}

          {/* Trash Button → opens TrashModal */}
          <button
            type="button"
            className="btn p-0 border-0 bg-transparent hover-scale position-relative"
            onClick={onOpenTrash}
            title="Trash"
            aria-label="Open Trash"
            style={{ outline: 'none', boxShadow: 'none' }}
          >
            <i className="bi bi-trash3 text-white" style={{ fontSize: '1.25rem' }} />
            {trashCount > 0 && (
              <span
                className="position-absolute top-0 start-100 translate-middle badge rounded-pill"
                style={{
                  backgroundColor: '#ef5350',
                  fontSize: '0.6rem',
                  padding: '2px 5px',
                  minWidth: '16px',
                  lineHeight: '1.4',
                }}
              >
                {trashCount > 99 ? '99+' : trashCount}
              </span>
            )}
          </button>

          {/* Settings Gear → opens SettingsModal */}
          <button
            className="btn btn-link text-white p-1 border-0 shadow-none hover-scale"
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Settings"
          >
            <i className="bi bi-gear-fill fs-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
