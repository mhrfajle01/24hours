import React, { useState, useEffect, useRef } from 'react';
import { formatFriendlyDate, getCurrentTimeString, getCurrentHourAndAMPM, getIntervalTimes, formatTime12h, timeToMinutes, getTodayDateString } from '../utils/helpers';
import { AnimatedCounter } from './PointsAnimator';

/**
 * Sticky Header — profile avatar opens ProfileModal, gear opens SettingsModal.
 */
export default function Header({
  selectedDate,
  reports = [],
  onOpenSettings,
  onOpenProfile,
  onOpenTrash,
  trashCount,
  currentUser,
  userPoints = 0,
  isPointsInitial = false,
  onOpenPoints,
  onOpenInsights
}) {
  const [timeStr, setTimeStr] = useState(getCurrentTimeString());
  const [currentHourData, setCurrentHourData] = useState(getCurrentHourAndAMPM());
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const prevPointsRef = useRef(userPoints);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (isPointsInitial) {
      prevPointsRef.current = userPoints;
      return;
    }

    if (isFirstLoadRef.current) {
      prevPointsRef.current = userPoints;
      isFirstLoadRef.current = false;
      return;
    }

    const prev = prevPointsRef.current;
    const delta = userPoints - prev;
    if (delta !== 0) {
      prevPointsRef.current = userPoints;
    }
    prevPointsRef.current = userPoints;
  }, [userPoints, isPointsInitial]);

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
    <header className="sticky-top shadow-sm text-white" style={{ backgroundColor: '#075E54', zIndex: 1020 }}>
      <div className="container-fluid max-width-container px-3 py-2">
        <div className="d-flex align-items-center justify-content-between flex-nowrap gap-2" style={{ minHeight: '44px' }}>
          
          {/* Left: Branding + Date */}
          <div className="d-flex align-items-center gap-1 py-1">
            <h1 className="h5 m-0 fw-bold d-flex align-items-center gap-1 text-nowrap pts-logo-container hover-scale pulse-group-1">
              <i className="bi bi-chat-left-text-fill pts-logo-icon" style={{ color: '#25D366' }} />
              <span className="d-none d-sm-inline">HourLog</span>
            </h1>
            <div className="d-flex align-items-center gap-1">
              {!isOnline ? (
                <span 
                  className="badge bg-warning text-dark rounded-pill fs-xs px-2 py-0.5 fw-bold d-inline-flex align-items-center gap-1"
                  title="Working offline."
                >
                  <i className="bi bi-cloud-slash-fill"></i> <span className="d-none d-md-inline">Offline</span>
                </span>
              ) : (
                <span 
                  className="badge bg-success-subtle text-success border border-success-subtle rounded-pill fs-xs px-2 py-0.5 d-none d-lg-inline-flex align-items-center gap-1 pts-status-container"
                  style={{ opacity: 0.85 }}
                  title="Synced"
                >
                  <i className="bi bi-cloud-check-fill pts-status-icon"></i> Synced
                </span>
              )}
              <span className="text-white-50 d-none d-md-inline" style={{ fontSize: '0.78rem' }}>
                • {formatFriendlyDate(selectedDate)}
              </span>
            </div>
          </div>
   
          {/* Right: Points + Clock + Actions */}
          <div className="d-flex align-items-center gap-1 flex-shrink-0 ms-auto">
   
            {/* Clock */}
            <div className="text-end me-1 text-nowrap" style={{ lineHeight: '1.2' }}>
              <div className="fw-semibold hover-scale d-flex align-items-center justify-content-end gap-1" style={{ color: '#25D366', fontSize: '0.85rem' }}>
                <div 
                  className="header-live-dot" 
                  style={{ width: '6px', height: '6px', backgroundColor: '#25D366' }}
                />
                <div className="char-wave-container d-inline-flex" style={{ minWidth: '70px', justifyContent: 'flex-end' }}>
                  {timeStr.split('').map((char, index) => (
                    <span 
                      key={index}
                      style={{ 
                        animationDelay: `${index * 0.05}s`,
                        width: char === ' ' ? '4px' : char === ':' ? '4px' : '8px', 
                        textAlign: 'center' 
                      }}
                    >
                      {char}
                    </span>
                  ))}
                </div>
              </div>
              <div className="d-none d-sm-block text-white-50" style={{ fontSize: '0.68rem' }}>
                NOW: {displayTimeRange}
              </div>
            </div>
            {/* Points Pill Button */}
            <button
              type="button"
              className="btn btn-sm rounded-pill px-2 py-0.5 d-flex align-items-center gap-1 border border-warning-subtle shadow-sm position-relative pts-points-btn hover-scale"
              onClick={onOpenPoints}
              title="Points & Rewards"
              style={{ backgroundColor: 'rgba(0,0,0,0.3)', fontSize: '0.8rem', lineHeight: '1.2' }}
            >
              <span 
                style={{ fontSize: '0.85rem', display: 'inline-block' }} 
                className="pts-points-coin pulse-group-2"
              >
                🪙
              </span>
              <span className="pts-points-counter pulse-group-2" style={{ display: 'inline-block' }}>
                <AnimatedCounter
                  value={userPoints || 0}
                  duration={900}
                  className="fw-bold text-warning"
                  isInitial={isPointsInitial}
                />
              </span>
            </button>
  
            {/* Profile Avatar */}
            {currentUser && (
              <button
                type="button"
                className="btn p-0 border-0 bg-transparent pts-avatar-btn hover-scale pulse-group-3"
                onClick={onOpenProfile}
                title={`${currentUser.displayName || 'Profile'} — Edit Profile`}
                aria-label="Open Profile"
                style={{ outline: 'none', boxShadow: 'none' }}
              >
                <div
                  className="rounded-circle overflow-hidden d-flex align-items-center justify-content-center border border-2 border-white pts-avatar-img-container"
                  style={{ width: '30px', height: '30px', minWidth: '30px', backgroundColor: '#128C7E' }}
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
                    <span className="text-white fw-bold" style={{ fontSize: '0.75rem' }}>
                      {avatarInitial}
                    </span>
                  )}
                </div>
              </button>
            )}
  
            {/* Trash Button */}
            <button
              type="button"
              className="btn p-0 border-0 bg-transparent position-relative text-white ms-1 pts-trash-btn hover-scale pulse-group-3"
              onClick={onOpenTrash}
              title="Trash"
              aria-label="Open Trash"
              style={{ outline: 'none', boxShadow: 'none' }}
            >
              <i className="bi bi-trash3 pts-trash-icon" style={{ fontSize: '1.1rem' }} />
              {trashCount > 0 && (
                <span
                  className="position-absolute top-0 start-100 translate-middle badge rounded-pill pts-trash-badge"
                  style={{
                    backgroundColor: '#ef5350',
                    fontSize: '0.55rem',
                    padding: '2px 4px',
                    minWidth: '14px',
                    lineHeight: '1',
                  }}
                >
                  {trashCount > 99 ? '99+' : trashCount}
                </span>
              )}
            </button>
  
            {/* Consistency Insights Button */}
            <button
              type="button"
              className="btn btn-link text-white p-1 border-0 shadow-none pts-insights-btn hover-scale pulse-group-4"
              onClick={onOpenInsights}
              title="Consistency Insights & Calendar"
              aria-label="Open Consistency Insights"
            >
              <i className="bi bi-bar-chart-line-fill fs-5 pts-insights-icon" />
            </button>
            {/* Refresh Button */}
            <button
              type="button"
              className="btn btn-link text-white p-1 border-0 shadow-none pts-refresh-btn hover-scale pulse-group-4"
              onClick={() => window.location.reload()}
              title="Refresh Page"
              aria-label="Refresh Page"
            >
              <i className="bi bi-arrow-clockwise fs-5 pts-refresh-icon" />
            </button>
 
            {/* Settings Gear */}
            <button
              className="btn btn-link text-white p-1 border-0 shadow-none pts-settings-btn hover-scale pulse-group-4"
              onClick={onOpenSettings}
              title="Settings"
              aria-label="Settings"
            >
              <i className="bi bi-gear-fill fs-5 pts-settings-icon" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
