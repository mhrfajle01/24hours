import React, { useState, useEffect } from 'react';
import { calculateStats, isFeatureActive, formatDurationMinutes } from '../utils/helpers';

/**
 * Renders a live countdown timer showing remaining time until 12:00 AM midnight reset.
 */
function StreakCountdown() {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0); // Sets to next midnight 12:00 AM

      const diffMs = midnight - now;
      if (diffMs <= 0) {
        setTimeLeft('00:00:00');
        return;
      }

      const hrs = String(Math.floor(diffMs / 3600000)).padStart(2, '0');
      const mins = String(Math.floor((diffMs % 3600000) / 60000)).padStart(2, '0');
      const secs = String(Math.floor((diffMs % 60000) / 1000)).padStart(2, '0');

      setTimeLeft(`${hrs}:${mins}:${secs}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span 
      className="badge rounded-pill bg-dark bg-opacity-10 text-dark border border-dark border-opacity-10 d-inline-flex align-items-center gap-1"
      style={{ fontSize: '0.7rem', fontWeight: 600 }}
      title="Time remaining until daily streak reset at midnight"
    >
      <i className="bi bi-stopwatch-fill animate-pulse text-danger"></i>
      Reset: {timeLeft || '--:--:--'}
    </span>
  );
}

/**
 * ConsistencyWidget - Exposes streaks, daily goal completion ring, inline goal adjuster,
 * and a collapsible drawer containing weekly analytics and a 30-day GitHub-style contribution heatmap.
 */
export default function ConsistencyWidget({
  reports = [],
  streakData = { currentStreak: 0, longestStreak: 0, lastActiveDate: null, streakFreezes: 1, excusedDays: [] },
  appUsage = { activeSeconds: 0, isActive: false },
  streakRequirements = { appUsageSeconds: 0, appUsageMet: false, journalMet: false, planningCount: 0, planningMet: false, qualified: false },
  weeklyStats = null,
  dailyGoal = 6,
  onUpdateDailyGoal,
  heatmapData = {},
  selectedDate,
  onExcuseDay,
  onAddStreakFreeze,
  onOpenPoints,
  pointsData,
  onUnlockFeature,
}) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  const isConsistencyUnlocked = isFeatureActive(pointsData, 'consistency_insights');

  const handleUnlockConsistency = async () => {
    if (!onUnlockFeature) return;
    setIsUnlocking(true);
    setUnlockError('');
    try {
      await onUnlockFeature('consistency_insights', 500, 'Consistency Insights');
    } catch (e) {
      setUnlockError(e.message || 'Failed to unlock.');
    } finally {
      setIsUnlocking(false);
    }
  };
  const [showInsights, setShowInsights] = useState(true);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoal, setTempGoal] = useState(dailyGoal);

  // Sync tempGoal when dailyGoal prop changes externally (e.g. from Settings)
  useEffect(() => {
    setTempGoal(dailyGoal);
  }, [dailyGoal]);

  // Calculate today's completed hours using stats helper to support customizable time block sizes
  const stats = calculateStats(reports);
  const todayCompletedHours = Number((stats.completedRaw / 60).toFixed(1));
  const todayCompletedHoursDisplay = todayCompletedHours % 1 === 0 ? todayCompletedHours : todayCompletedHours.toFixed(1);
  const goalPercent = Math.min(Math.round((todayCompletedHours / dailyGoal) * 100), 100);

  // SVG Progress Ring metrics
  const radius = 24;
  const strokeWidth = 4.5;
  const circum = 2 * Math.PI * radius;
  const strokeDashoffset = circum - (goalPercent / 100) * circum;

  const minuteProgress = (appUsage.activeSeconds % 60) / 60;
  const usageRingRadius = 18;
  const usageRingCircumference = 2 * Math.PI * usageRingRadius;
  const usageRingOffset = usageRingCircumference * (1 - minuteProgress);
  const formatUsageTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours === 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  };

  // Generate last 30 days for heatmap
  const getPast30Days = () => {
    const list = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      list.push({
        dateStr,
        dayLabel: d.getDate(),
        monthLabel: d.toLocaleDateString('en-US', { month: 'short' }),
        weekdayLabel: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
      });
    }
    return list;
  };

  const past30Days = getPast30Days();

  // Color-code heatmap cells based on logged hours vs daily goal
  const getHeatmapColor = (dateStr) => {
    const hrs = heatmapData[dateStr] || 0;
    if (hrs === 0) return '#F0F2F5';          // No activity
    if (hrs < dailyGoal * 0.33) return '#D3F4C2'; // < 33% of goal
    if (hrs < dailyGoal * 0.66) return '#8CE0A2'; // 33–66%
    if (hrs < dailyGoal)        return '#43C878'; // 66–99%
    return '#25D366';                          // 100%+ of goal
  };

  const handleGoalSubmit = (e) => {
    e.preventDefault();
    const val = parseInt(tempGoal, 10);
    if (!isNaN(val) && val > 0 && val <= 24) {
      onUpdateDailyGoal(val);
      setIsEditingGoal(false);
    }
  };

  const adjustGoal = (amount) => {
    const next = dailyGoal + amount;
    if (next > 0 && next <= 24) {
      onUpdateDailyGoal(next);
      setTempGoal(next);
    }
  };

  return (
    <div className="container-fluid max-width-container my-3 px-3 animate-fade-in">
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
        
        {/* Main Widget Grid */}
        <div className="row align-items-center g-3">
          
          {/* Left: Streak Indicator */}
          <div className="col-12 col-sm-6 d-flex align-items-center gap-3">
            <div 
              className="d-flex align-items-center justify-content-center rounded-circle text-white shadow-sm"
              style={{
                width: '56px',
                height: '56px',
                background: streakData.currentStreak > 0 
                  ? 'linear-gradient(135deg, #FF9900 0%, #FF5E00 100%)' 
                  : '#BDC3C7',
                fontSize: '1.6rem',
                animation: streakData.currentStreak > 0 ? 'activeBorderPulse 2s infinite ease-in-out' : 'none'
              }}
              title={`Current streak: ${streakData.currentStreak} days`}
            >
              <i className={`bi ${streakData.currentStreak > 0 ? 'bi-fire' : 'bi-app-indicator'}`}></i>
            </div>
            
            <div>
              <div className="d-flex align-items-center gap-2">
                <span className="fw-extrabold fs-4 text-dark">{streakData.currentStreak}</span>
                <span className="text-secondary small fw-bold text-uppercase" style={{ letterSpacing: '0.5px' }}>
                  Day Streak
                </span>
              </div>
              <div className="text-muted small d-flex flex-wrap align-items-center gap-2" style={{ fontSize: '0.78rem' }}>
                <span>Longest Streak: <strong className="text-secondary">{streakData.longestStreak || 0}d</strong></span>
                {streakData.currentStreak > 0 && (
                  <span className="text-success fw-semibold d-inline-flex align-items-center gap-0.5">
                    <i className="bi bi-shield-check"></i>Active
                  </span>
                )}
                <StreakCountdown />
              </div>
            </div>
          </div>

          {/* Right: Daily Goal Circle */}
          <div className="col-12 col-sm-6 d-flex align-items-center justify-content-sm-end gap-3 mt-3 mt-sm-0">
            {/* SVG Progress Circle */}
            <div className="position-relative" style={{ width: '58px', height: '58px' }}>
              <svg width="58" height="58" className="transform-rotate-n90" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background Ring */}
                <circle
                  cx="29"
                  cy="29"
                  r={radius}
                  fill="transparent"
                  stroke="#F0F2F5"
                  strokeWidth={strokeWidth}
                />
                {/* Foreground Progress */}
                <circle
                  cx="29"
                  cy="29"
                  r={radius}
                  fill="transparent"
                  stroke={todayCompletedHours >= dailyGoal ? '#25D366' : '#FFB703'}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circum}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              </svg>
              {/* Centered Check or Value */}
              <div 
                className="position-absolute top-50 start-50 translate-middle d-flex align-items-center justify-content-center fw-extrabold text-dark"
                style={{ fontSize: '0.85rem' }}
              >
                {todayCompletedHours >= dailyGoal ? (
                  <i className="bi bi-check-lg text-success fs-5"></i>
                ) : (
                  `${todayCompletedHoursDisplay}/${dailyGoal}`
                )}
              </div>
            </div>

            {/* Daily Goal Control Panel */}
            <div className="flex-grow-1 flex-sm-grow-0">
              <div className="d-flex align-items-center justify-content-between justify-content-sm-start gap-2">
                <span className="text-secondary small fw-bold">Daily Goal Target:</span>
                
                {isEditingGoal ? (
                  <form onSubmit={handleGoalSubmit} className="d-flex align-items-center gap-1">
                    <input
                      type="number"
                      className="form-control form-control-sm text-center fw-bold shadow-none p-1"
                      style={{ width: '45px', height: '26px', fontSize: '0.85rem' }}
                      value={tempGoal}
                      onChange={(e) => setTempGoal(e.target.value)}
                      min="1"
                      max="24"
                      autoFocus
                      onBlur={() => setIsEditingGoal(false)}
                    />
                  </form>
                ) : (
                  <span 
                    className="badge bg-light text-dark border pointer fw-extrabold px-2 py-1"
                    onClick={() => { setTempGoal(dailyGoal); setIsEditingGoal(true); }}
                    title="Click to edit"
                    style={{ cursor: 'pointer' }}
                  >
                    {dailyGoal} hrs
                  </span>
                )}
              </div>

              {/* Quick Goal adjusters (+ / -) */}
              <div className="d-flex gap-2 mt-1">
                <button 
                  className="btn btn-sm btn-light border-0 py-0 px-2 rounded-circle hover-scale text-secondary fw-extrabold"
                  onClick={() => adjustGoal(-1)}
                  title="Decrease Goal"
                  style={{ height: '22px', width: '22px', fontSize: '0.75rem', lineHeight: 1 }}
                >
                  -
                </button>
                <button 
                  className="btn btn-sm btn-light border-0 py-0 px-2 rounded-circle hover-scale text-secondary fw-extrabold"
                  onClick={() => adjustGoal(1)}
                  title="Increase Goal"
                  style={{ height: '22px', width: '22px', fontSize: '0.75rem', lineHeight: 1 }}
                >
                  +
                </button>
                {todayCompletedHours >= dailyGoal && (
                  <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill fw-bold animate-pulse ms-1" style={{ fontSize: '0.65rem' }}>
                    🎉 Goal Achieved!
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Separate active app usage metric */}
        <div className="mt-3 pt-3 border-top">
          <div className="d-flex align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-2">
              <div className={appUsage.isActive ? 'app-usage-icon app-usage-icon-active' : 'app-usage-icon'}>
                <svg width="42" height="42" viewBox="0 0 42 42" aria-label={`${Math.floor(minuteProgress * 60)} seconds into the current minute`}>
                  <circle cx="21" cy="21" r={usageRingRadius} fill="#EEF2FF" />
                  <circle
                    cx="21"
                    cy="21"
                    r={usageRingRadius}
                    fill="transparent"
                    stroke="#6366F1"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={usageRingCircumference}
                    strokeDashoffset={usageRingOffset}
                    style={{
                      transform: 'rotate(-90deg)',
                      transformOrigin: 'center',
                      transition: 'stroke-dashoffset 0.8s linear',
                    }}
                  />
                  <text x="21" y="23" textAnchor="middle" fontSize="9" fontWeight="700" fill="#4338CA">
                    {String(appUsage.activeSeconds % 60).padStart(2, '0')}
                  </text>
                </svg>
              </div>
              <div>
                <div className="fw-bold text-dark">Time in App Today</div>
                <div className="text-muted small">Active usage · minute progress</div>
              </div>
            </div>
            <div className="text-end">
              <div className="fw-extrabold fs-5 text-primary">{formatUsageTime(appUsage.activeSeconds)}</div>
              <span className={`badge rounded-pill ${appUsage.isActive ? 'bg-success-subtle text-success' : 'bg-light text-secondary'}`} style={{ fontSize: '0.65rem' }}>
                <i className={`bi ${appUsage.isActive ? 'bi-circle-fill' : 'bi-pause-fill'} me-1`}></i>
                {appUsage.isActive ? 'Active now' : 'Paused'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 p-3 rounded-3" style={{ background: streakRequirements.qualified ? '#ECFDF3' : '#FFF8E1' }}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span className="fw-bold text-dark"><i className="bi bi-list-check me-1 text-primary"></i>Daily Streak Requirements</span>
            <span className={`badge rounded-pill ${streakRequirements.qualified ? 'bg-success' : 'bg-warning text-dark'}`}>
              {streakRequirements.qualified ? 'Ready' : 'In progress'}
            </span>
          </div>
          <div className="row g-2 small">
            <div className="col-12 col-sm-4">
              <div className="d-flex align-items-center gap-1">
                <i className={`bi ${streakRequirements.appUsageMet ? 'bi-check-circle-fill text-success' : 'bi-circle text-secondary'}`}></i>
                App use: {formatDurationMinutes(streakRequirements.appUsageSeconds)} / 3m
              </div>
            </div>
            <div className="col-12 col-sm-4">
              <div className="d-flex align-items-center gap-1">
                <i className={`bi ${streakRequirements.journalMet ? 'bi-check-circle-fill text-success' : 'bi-circle text-secondary'}`}></i>
                Today’s journal
              </div>
            </div>
            <div className="col-12 col-sm-4">
              <div className="d-flex align-items-center gap-1">
                <i className={`bi ${streakRequirements.planningMet ? 'bi-check-circle-fill text-success' : 'bi-circle text-secondary'}`}></i>
                Plans: {streakRequirements.planningCount}/3
              </div>
            </div>
          </div>
          {streakData.currentStreak > 0 && !streakRequirements.qualified && (
            <div className="text-danger small fw-semibold mt-2">
              <i className="bi bi-exclamation-triangle-fill me-1"></i>
              Complete the missing requirements today or you may lose this streak.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
