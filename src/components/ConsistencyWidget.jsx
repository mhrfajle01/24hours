import React, { useState, useEffect } from 'react';
import { calculateStats } from '../utils/helpers';

/**
 * ConsistencyWidget - Exposes streaks, daily goal completion ring, inline goal adjuster,
 * and a collapsible drawer containing weekly analytics and a 30-day GitHub-style contribution heatmap.
 */
export default function ConsistencyWidget({
  reports = [],
  streakData = { currentStreak: 0, longestStreak: 0, lastActiveDate: null, streakFreezes: 1, excusedDays: [] },
  weeklyStats = null,
  dailyGoal = 6,
  onUpdateDailyGoal,
  heatmapData = {},
  selectedDate,
  onExcuseDay,
  onAddStreakFreeze,
}) {
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
              <div className="text-muted small" style={{ fontSize: '0.8rem' }}>
                Longest Streak: <strong className="text-secondary">{streakData.longestStreak || 0}d</strong>
                {streakData.currentStreak > 0 && (
                  <span className="text-success ms-2 fw-semibold">
                    <i className="bi bi-shield-check me-0.5"></i>Active
                  </span>
                )}
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

        {/* Action Toggle - Drawer Trigger */}
        <div className="border-top mt-3 pt-2 d-flex justify-content-center">
          <button 
            className="btn btn-link text-decoration-none text-secondary p-0 fs-7 d-flex align-items-center gap-1 hover-scale shadow-none"
            onClick={() => setShowInsights(!showInsights)}
            style={{ fontSize: '0.85rem', color: '#128C7E' }}
          >
            <span>{showInsights ? 'Collapse Insights' : 'Show Consistency Insights & Heatmap'}</span>
            <i className={`bi ${showInsights ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
          </button>
        </div>

        {/* Collapsible Consistency Panel */}
        {showInsights && (
          <div className="mt-3 border-top pt-3 animate-slide-up">
            
            {/* Row 1: Weekly Stats Summarized */}
            {weeklyStats && (
              <div className="row g-3 mb-4">
                <div className="col-12 col-md-6">
                  <h6 className="text-secondary fw-bold small mb-2 text-uppercase">Weekly Metrics</h6>
                  <div className="p-3 bg-light rounded-3 d-flex flex-column gap-2" style={{ borderLeft: '3px solid #128C7E' }}>
                    <div className="d-flex justify-content-between text-secondary small">
                      <span>vs Weekly Goal <span className="text-muted">({dailyGoal * 7} hrs target)</span>:</span>
                      <strong className="text-dark">{weeklyStats.completionRate}%</strong>
                    </div>
                    <div className="progress" style={{ height: '7px' }}>
                      <div 
                        className="progress-bar" 
                        role="progressbar" 
                        style={{ width: `${weeklyStats.completionRate}%`, backgroundColor: weeklyStats.completionRate >= 80 ? '#25D366' : weeklyStats.completionRate >= 50 ? '#128C7E' : '#FFB703' }}
                        aria-valuenow={weeklyStats.completionRate} 
                        aria-valuemin="0" 
                        aria-valuemax="100"
                      />
                    </div>
                    <div className="d-flex justify-content-between text-secondary mt-1" style={{ fontSize: '0.75rem' }}>
                      <span>✅ Logged: <strong className="text-success">{weeklyStats.completed} hrs</strong></span>
                      <span>❌ Missed: <strong className="text-danger">{weeklyStats.missed} hrs</strong></span>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-md-6">
                  <h6 className="text-secondary fw-bold small mb-2 text-uppercase">Consistency Peak</h6>
                  <div className="p-3 bg-light rounded-3 d-flex align-items-center justify-content-between" style={{ borderLeft: '3px solid #25D366' }}>
                    <div>
                      <div className="small text-secondary">Your peak focus day is:</div>
                      <div className="fw-bold text-dark fs-6 mt-1">
                        {weeklyStats.bestDay ? (
                          <>
                            <i className="bi bi-trophy-fill text-warning me-1.5"></i>
                            {weeklyStats.bestDay}
                          </>
                        ) : (
                          'No activity this week'
                        )}
                      </div>
                    </div>
                    <div className="text-center bg-white px-2 py-1.5 rounded-pill shadow-xs border">
                      <span className="fw-extrabold text-success" style={{ fontSize: '0.8rem' }}>
                        {weeklyStats.completionRate >= 80 ? '🔥 Habit King' : weeklyStats.completionRate >= 50 ? '🌱 Builder' : '💤 Start Log'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Row 2: Heatmap Contribution Grid */}
            <div>
              <h6 className="text-secondary fw-bold small mb-2 text-uppercase d-flex justify-content-between align-items-center">
                <span>30-Day Consistency Grid</span>
                <span className="text-muted text-lowercase fw-normal" style={{ fontSize: '0.72rem' }}>
                  (hours logged vs {dailyGoal}h goal)
                </span>
              </h6>
              
              <div className="bg-light p-3 rounded-4 border">
                <div className="d-flex flex-wrap gap-1.5 justify-content-start align-items-center">
                  {past30Days.map((day, idx) => {
                    const completedHrs = heatmapData[day.dateStr] || 0;
                    const displayHrs = completedHrs % 1 === 0 ? completedHrs : completedHrs.toFixed(1);
                    const metGoal = completedHrs >= dailyGoal;
                    const tooltipText = `${day.monthLabel} ${day.dayLabel}: ${displayHrs}h logged${metGoal ? ' — Goal met! 🎉' : ` (goal: ${dailyGoal}h)`}`;

                    return (
                      <div
                        key={idx}
                        className="rounded-1 d-flex align-items-center justify-content-center hover-scale"
                        style={{
                          width: '18px',
                          height: '18px',
                          backgroundColor: getHeatmapColor(day.dateStr),
                          cursor: 'default',
                          position: 'relative',
                          outline: metGoal ? '1.5px solid #1C9F4E' : 'none',
                          outlineOffset: '1px',
                        }}
                        title={tooltipText}
                      >
                        {/* White dot = goal achieved */}
                        {metGoal && (
                          <div className="bg-white rounded-circle" style={{ width: '4px', height: '4px' }} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Heatmap Legend */}
                <div className="d-flex justify-content-between align-items-center mt-3 pt-2 border-top text-muted" style={{ fontSize: '0.72rem' }}>
                  <div>Hover a cell for details</div>
                  <div className="d-flex align-items-center gap-1">
                    <span>0h</span>
                    <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#F0F2F5' }} />
                    <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#D3F4C2' }} />
                    <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#8CE0A2' }} />
                    <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#43C878' }} />
                    <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#25D366' }} />
                    <span>{dailyGoal}h+</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Streak Protection & Excuses */}
            <div className="mt-4 pt-3 border-top">
              <h6 className="text-secondary fw-bold small mb-2 text-uppercase">
                ❄️ Streak Protection & Grace Days
              </h6>
              <div className="bg-light p-3 rounded-4 border d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3">
                <div className="d-flex align-items-center gap-2">
                  <div 
                    className="d-flex align-items-center justify-content-center rounded-circle bg-white border"
                    style={{ width: '40px', height: '40px', fontSize: '1.25rem', minWidth: '40px', color: '#0dcaf0' }}
                  >
                    ❄️
                  </div>
                  <div>
                    <div className="fw-bold text-dark" style={{ fontSize: '0.9rem' }}>
                      {streakData.streakFreezes ?? 0} Freeze Token{(streakData.streakFreezes ?? 0) !== 1 ? 's' : ''}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      1 token protects 1 missed day. Auto-consumed when you return.
                    </div>
                  </div>
                </div>

                <div className="d-flex flex-wrap gap-2">
                  <button
                    className="btn btn-sm btn-outline-info fw-bold rounded-pill px-3 py-1.5 hover-scale transition-all"
                    onClick={onAddStreakFreeze}
                    title="Get a streak freeze token to protect your progress."
                    style={{ fontSize: '0.8rem' }}
                  >
                    <i className="bi bi-plus-circle-fill me-1"></i>Earn Freeze
                  </button>

                  {streakData.excusedDays?.includes(selectedDate) ? (
                    <span 
                      className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3 py-2 fw-bold d-inline-flex align-items-center gap-1"
                      style={{ fontSize: '0.8rem' }}
                    >
                      <i className="bi bi-shield-fill-check"></i> Excused (Streak Protected)
                    </span>
                  ) : (
                    todayCompletedHours === 0 && (
                      <button
                        className="btn btn-sm btn-outline-success fw-bold rounded-pill px-3 py-1.5 hover-scale transition-all"
                        onClick={() => onExcuseDay(selectedDate)}
                        title="Excuse this day's lack of logging to prevent streak reset."
                        style={{ fontSize: '0.8rem' }}
                      >
                        <i className="bi bi-calendar-check me-1"></i>Excuse Day
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
