import React, { useState } from 'react';
import { calculateStats } from '../utils/helpers';

/**
 * InsightsModal — Beautiful fullscreen modal for Consistency Insights,
 * Weekly Analytics, 30-Day Calendar Heatmap, and Streak Protection.
 * Opened via a dedicated header button.
 */
export default function InsightsModal({
  isOpen,
  onClose,
  reports = [],
  streakData = { currentStreak: 0, longestStreak: 0, lastActiveDate: null, streakFreezes: 1, excusedDays: [] },
  weeklyStats = null,
  dailyGoal = 6,
  heatmapData = {},
  selectedDate,
  onExcuseDay,
  onOpenPoints,
  pointsData,
  onUnlockFeature,
}) {
  if (!isOpen) return null;

  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [hoveredDay, setHoveredDay] = useState(null);

  const isConsistencyUnlocked = !!(pointsData?.unlockedFeatures?.consistency_insights);

  const handleUnlockConsistency = async () => {
    if (!onUnlockFeature) return;
    setIsUnlocking(true);
    setUnlockError('');
    try {
      await onUnlockFeature('consistency_insights', 40, 'Consistency Insights');
    } catch (e) {
      setUnlockError(e.message || 'Failed to unlock.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const stats = calculateStats(reports);
  const todayCompletedHours = Number((stats.completedRaw / 60).toFixed(1));

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
        isToday: i === 0,
      });
    }
    return list;
  };

  const past30Days = getPast30Days();

  // Color-code heatmap cells based on logged hours vs daily goal
  const getHeatmapColor = (dateStr) => {
    const hrs = heatmapData[dateStr] || 0;
    if (hrs === 0) return '#F0F2F5';
    if (hrs < dailyGoal * 0.33) return '#D3F4C2';
    if (hrs < dailyGoal * 0.66) return '#8CE0A2';
    if (hrs < dailyGoal) return '#43C878';
    return '#25D366';
  };

  // Calculate 30-day metrics
  const totalActiveDays = past30Days.filter(d => (heatmapData[d.dateStr] || 0) > 0).length;
  const totalGoalMetDays = past30Days.filter(d => (heatmapData[d.dateStr] || 0) >= dailyGoal).length;
  const totalHoursLogged = past30Days.reduce((sum, d) => sum + (heatmapData[d.dateStr] || 0), 0);
  const avgHoursPerDay = totalActiveDays > 0 ? (totalHoursLogged / 30).toFixed(1) : '0';

  return (
    <div 
      className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column"
      style={{ 
        background: 'linear-gradient(165deg, #064E3B 0%, #075E54 30%, #0F766E 70%, #115E59 100%)',
        zIndex: 1060,
        animation: 'insightsModalFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      <style>{`
        @keyframes insightsModalFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes insightsStatPop {
          0% { opacity: 0; transform: scale(0.85) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes insightsGlow {
          0%, 100% { box-shadow: 0 0 12px rgba(37, 211, 102, 0.15); }
          50% { box-shadow: 0 0 24px rgba(37, 211, 102, 0.3); }
        }
        .insights-stat-card {
          animation: insightsStatPop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
        .insights-stat-card:nth-child(1) { animation-delay: 0.05s; }
        .insights-stat-card:nth-child(2) { animation-delay: 0.1s; }
        .insights-stat-card:nth-child(3) { animation-delay: 0.15s; }
        .insights-stat-card:nth-child(4) { animation-delay: 0.2s; }
        .insights-heatmap-cell {
          transition: all 0.18s ease;
          cursor: default;
        }
        .insights-heatmap-cell:hover {
          transform: scale(1.18);
          z-index: 2;
          box-shadow: 0 2px 10px rgba(0,0,0,0.15);
        }
        .insights-body::-webkit-scrollbar { width: 4px; }
        .insights-body::-webkit-scrollbar-track { background: transparent; }
        .insights-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
      `}</style>

      {/* ─── Top Bar ─────────────────────────────────────────────────── */}
      <div 
        className="d-flex align-items-center justify-content-between px-3 py-2 flex-shrink-0"
        style={{ 
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
          background: 'rgba(0,0,0,0.15)',
        }}
      >
        <div className="d-flex align-items-center gap-2">
          <div 
            className="d-flex align-items-center justify-content-center rounded-circle"
            style={{ 
              width: '34px', height: '34px', 
              background: 'linear-gradient(135deg, #25D366, #128C7E)',
              boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)',
            }}
          >
            <i className="bi bi-bar-chart-line-fill text-white" style={{ fontSize: '0.95rem' }} />
          </div>
          <div>
            <h6 className="m-0 fw-bold text-white" style={{ fontSize: '1rem', letterSpacing: '0.3px' }}>
              Consistency Insights
            </h6>
            <div className="text-white-50" style={{ fontSize: '0.68rem' }}>
              30-Day Analytics & Calendar
            </div>
          </div>
        </div>
        <button 
          type="button" 
          className="btn btn-link text-white p-1 border-0 shadow-none hover-scale d-flex align-items-center justify-content-center rounded-circle"
          onClick={onClose}
          aria-label="Close Insights"
          style={{ 
            width: '34px', height: '34px',
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <i className="bi bi-x-lg" style={{ fontSize: '0.95rem' }} />
        </button>
      </div>

      {/* ─── Scrollable Content ──────────────────────────────────────── */}
      <div 
        className="flex-grow-1 overflow-auto px-3 py-3 insights-body"
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="mx-auto" style={{ maxWidth: '640px' }}>

          {!isConsistencyUnlocked ? (
            /* ─── Locked Purchase View ──────────────────────── */
            <div className="text-center py-5 px-3">
              <div 
                className="d-inline-flex align-items-center justify-content-center rounded-circle mb-4"
                style={{ 
                  width: '80px', height: '80px', 
                  background: 'rgba(255,255,255,0.08)',
                  border: '2px solid rgba(255,255,255,0.15)',
                }}
              >
                <span style={{ fontSize: '2.2rem' }}>🔒</span>
              </div>
              
              <h4 className="fw-bold text-white mb-2">Unlock Consistency Insights</h4>
              <p className="text-white-50 mb-4" style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                Get access to premium 30-day calendar analytics,<br />weekly productivity metrics, and streak protection tools.
              </p>

              <div 
                className="p-3 rounded-4 mb-4 mx-auto"
                style={{ 
                  maxWidth: '300px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-white-50 small">Unlock Cost:</span>
                  <strong className="text-warning">40 Points</strong>
                </div>
                <hr className="my-2 border-secondary" style={{ opacity: 0.3 }} />
                <div className="d-flex justify-content-between align-items-center">
                  <span className="text-white-50 small">Your Balance:</span>
                  <strong style={{ color: '#25D366' }}>{pointsData?.points || 0} Points</strong>
                </div>
              </div>

              {unlockError && (
                <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3 mx-auto" style={{ maxWidth: '300px' }}>
                  {unlockError}
                </div>
              )}

              <div className="d-flex flex-column gap-2 align-items-center">
                <button 
                  className="btn text-white rounded-pill py-2 px-5 fw-bold shadow hover-scale"
                  disabled={isUnlocking || (pointsData?.points || 0) < 40}
                  onClick={handleUnlockConsistency}
                  style={{ 
                    background: 'linear-gradient(135deg, #25D366, #128C7E)',
                    border: 'none',
                    boxShadow: '0 4px 15px rgba(37, 211, 102, 0.3)',
                  }}
                >
                  {isUnlocking ? (
                    <><span className="spinner-border spinner-border-sm me-2" />Unlocking...</>
                  ) : (
                    <>🔓 Unlock for 40 Points</>
                  )}
                </button>
                <button 
                  className="btn btn-link text-white-50 text-decoration-none small" 
                  onClick={onClose}
                >
                  Back to Feed
                </button>
              </div>
            </div>
          ) : (
            /* ─── Unlocked Full View ───────────────────────── */
            <>
              {/* ── Quick Stats Row ─────────────────────────── */}
              <div className="row g-2 mb-3">
                <div className="col-6 col-sm-3">
                  <div 
                    className="insights-stat-card p-2 rounded-4 text-center h-100"
                    style={{ 
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <div className="fw-extrabold text-white" style={{ fontSize: '1.5rem', lineHeight: 1.2 }}>
                      {streakData.currentStreak}
                    </div>
                    <div className="text-white-50 fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                      🔥 STREAK
                    </div>
                  </div>
                </div>
                <div className="col-6 col-sm-3">
                  <div 
                    className="insights-stat-card p-2 rounded-4 text-center h-100"
                    style={{ 
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <div className="fw-extrabold text-white" style={{ fontSize: '1.5rem', lineHeight: 1.2 }}>
                      {totalGoalMetDays}
                    </div>
                    <div className="text-white-50 fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                      ✅ GOALS MET
                    </div>
                  </div>
                </div>
                <div className="col-6 col-sm-3">
                  <div 
                    className="insights-stat-card p-2 rounded-4 text-center h-100"
                    style={{ 
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <div className="fw-extrabold text-white" style={{ fontSize: '1.5rem', lineHeight: 1.2 }}>
                      {totalActiveDays}
                    </div>
                    <div className="text-white-50 fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                      📅 ACTIVE DAYS
                    </div>
                  </div>
                </div>
                <div className="col-6 col-sm-3">
                  <div 
                    className="insights-stat-card p-2 rounded-4 text-center h-100"
                    style={{ 
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    <div className="fw-extrabold text-white" style={{ fontSize: '1.5rem', lineHeight: 1.2 }}>
                      {avgHoursPerDay}
                    </div>
                    <div className="text-white-50 fw-bold" style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                      ⏱ AVG/DAY
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Streak & Longest Bar ────────────────────── */}
              <div 
                className="d-flex flex-wrap gap-3 mb-3 p-3 rounded-4 align-items-center justify-content-between"
                style={{ 
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  animation: 'insightsGlow 3s infinite ease-in-out',
                }}
              >
                <div className="d-flex align-items-center gap-2">
                  <div 
                    className="d-flex align-items-center justify-content-center rounded-circle text-white shadow-sm"
                    style={{
                      width: '44px',
                      height: '44px',
                      background: streakData.currentStreak > 0 
                        ? 'linear-gradient(135deg, #FF9900 0%, #FF5E00 100%)' 
                        : 'rgba(255,255,255,0.15)',
                      fontSize: '1.3rem',
                    }}
                  >
                    <i className={`bi ${streakData.currentStreak > 0 ? 'bi-fire' : 'bi-app-indicator'}`} />
                  </div>
                  <div>
                    <span className="fw-extrabold fs-5 text-white">{streakData.currentStreak}</span>
                    <span className="text-white-50 small fw-bold ms-1">Day Streak</span>
                    <div className="text-white-50" style={{ fontSize: '0.72rem' }}>
                      Longest: <strong className="text-white">{streakData.longestStreak || 0}d</strong>
                    </div>
                  </div>
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  <span 
                    className="badge rounded-pill px-2 py-1 fw-bold" 
                    style={{ 
                      fontSize: '0.75rem', 
                      background: 'rgba(13, 202, 240, 0.15)', 
                      color: '#67e8f9',
                      border: '1px solid rgba(13, 202, 240, 0.25)',
                    }}
                  >
                    ❄️ {streakData.streakFreezes ?? 0} Freeze{(streakData.streakFreezes ?? 0) !== 1 ? 's' : ''}
                  </span>
                  {streakData.excusedDays?.includes(selectedDate) && (
                    <span 
                      className="badge rounded-pill px-2 py-1 fw-bold"
                      style={{ 
                        fontSize: '0.75rem', 
                        background: 'rgba(37, 211, 102, 0.15)', 
                        color: '#25D366',
                        border: '1px solid rgba(37, 211, 102, 0.25)',
                      }}
                    >
                      <i className="bi bi-shield-fill-check me-1" />Excused
                    </span>
                  )}
                </div>
              </div>

              {/* ── Weekly Stats ────────────────────────────── */}
              {weeklyStats && (
                <div className="row g-2 mb-3">
                  <div className="col-12 col-md-6">
                    <div 
                      className="p-3 rounded-4 h-100"
                      style={{ 
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderLeft: '3px solid #128C7E',
                      }}
                    >
                      <h6 className="text-white-50 fw-bold small mb-2 text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.8px' }}>
                        Weekly Metrics
                      </h6>
                      <div className="d-flex justify-content-between text-white-50 small mb-1">
                        <span>vs Weekly Goal <span className="text-white-50" style={{ opacity: 0.6 }}>({dailyGoal * 7}h)</span></span>
                        <strong className="text-white">{weeklyStats.completionRate}%</strong>
                      </div>
                      <div className="rounded-pill overflow-hidden" style={{ height: '6px', background: 'rgba(255,255,255,0.1)' }}>
                        <div 
                          className="h-100 rounded-pill"
                          style={{ 
                            width: `${Math.min(weeklyStats.completionRate, 100)}%`, 
                            backgroundColor: weeklyStats.completionRate >= 80 ? '#25D366' : weeklyStats.completionRate >= 50 ? '#128C7E' : '#FFB703',
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                      <div className="d-flex justify-content-between mt-2" style={{ fontSize: '0.72rem' }}>
                        <span className="text-white-50">✅ <strong style={{ color: '#25D366' }}>{weeklyStats.completed}h</strong></span>
                        <span className="text-white-50">❌ <strong style={{ color: '#ef5350' }}>{weeklyStats.missed}h</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="col-12 col-md-6">
                    <div 
                      className="p-3 rounded-4 h-100 d-flex align-items-center justify-content-between"
                      style={{ 
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderLeft: '3px solid #25D366',
                      }}
                    >
                      <div>
                        <h6 className="text-white-50 fw-bold small mb-1 text-uppercase" style={{ fontSize: '0.7rem', letterSpacing: '0.8px' }}>
                          Consistency Peak
                        </h6>
                        <div className="fw-bold text-white mt-1" style={{ fontSize: '0.95rem' }}>
                          {weeklyStats.bestDay ? (
                            <>
                              <i className="bi bi-trophy-fill text-warning me-1" />
                              {weeklyStats.bestDay}
                            </>
                          ) : (
                            'No activity this week'
                          )}
                        </div>
                      </div>
                      <div 
                        className="px-2 py-1 rounded-pill text-center"
                        style={{ 
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.12)',
                        }}
                      >
                        <span className="fw-extrabold" style={{ fontSize: '0.75rem', color: '#25D366' }}>
                          {weeklyStats.completionRate >= 80 ? '🔥 Habit King' : weeklyStats.completionRate >= 50 ? '🌱 Builder' : '💤 Start Log'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 30-Day Calendar Heatmap ─────────────────── */}
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="text-white fw-bold small m-0 text-uppercase d-flex align-items-center gap-1" style={{ fontSize: '0.75rem', letterSpacing: '0.8px' }}>
                    <i className="bi bi-calendar3" style={{ color: '#25D366' }} /> 30-Day Consistency
                  </h6>
                  <span className="text-white-50" style={{ fontSize: '0.68rem' }}>
                    vs {dailyGoal}h goal
                  </span>
                </div>
                
                <div 
                  className="p-3 rounded-4"
                  style={{ 
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  {/* Weekday headers */}
                  <div 
                    className="d-grid text-center fw-bold mb-2"
                    style={{ gridTemplateColumns: 'repeat(7, 1fr)', fontSize: '0.68rem', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.4)' }}
                  >
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd, i) => (
                      <div key={i}>{wd}</div>
                    ))}
                  </div>

                  {/* Grid cells */}
                  <div 
                    className="d-grid gap-1 justify-content-center mt-1"
                    style={{ gridTemplateColumns: 'repeat(7, 1fr)', justifyItems: 'center' }}
                  >
                    {/* Empty padding cells for first week alignment */}
                    {(() => {
                      if (past30Days.length === 0) return null;
                      const firstDayOfWeek = new Date(past30Days[0].dateStr).getDay();
                      return Array.from({ length: firstDayOfWeek }).map((_, i) => (
                        <div key={`empty-${i}`} style={{ width: '36px', height: '36px' }} />
                      ));
                    })()}

                    {/* Day cells */}
                    {past30Days.map((day, idx) => {
                      const completedHrs = heatmapData[day.dateStr] || 0;
                      const displayHrs = completedHrs % 1 === 0 ? completedHrs : completedHrs.toFixed(1);
                      const metGoal = completedHrs >= dailyGoal;
                      const isHovered = hoveredDay === day.dateStr;

                      return (
                        <div
                          key={idx}
                          className="insights-heatmap-cell rounded-3 d-flex flex-column align-items-center justify-content-center position-relative"
                          style={{
                            width: '36px',
                            height: '36px',
                            backgroundColor: getHeatmapColor(day.dateStr),
                            border: day.isToday 
                              ? '2px solid #FFB703' 
                              : metGoal 
                                ? '2px solid #25D366' 
                                : '1px solid rgba(0,0,0,0.06)',
                            outline: 'none',
                          }}
                          onMouseEnter={() => setHoveredDay(day.dateStr)}
                          onMouseLeave={() => setHoveredDay(null)}
                          onTouchStart={() => setHoveredDay(day.dateStr)}
                          onTouchEnd={() => setTimeout(() => setHoveredDay(null), 1500)}
                        >
                          <span className="fw-bold" style={{ fontSize: '0.72rem', color: completedHrs > 0 ? '#128C7E' : '#7f8c8d' }}>
                            {day.dayLabel}
                          </span>
                          {metGoal && (
                            <div 
                              className="bg-success position-absolute rounded-circle" 
                              style={{ width: '4px', height: '4px', bottom: '3px' }} 
                            />
                          )}

                          {/* Floating tooltip */}
                          {isHovered && (
                            <div
                              className="position-absolute rounded-3 px-2 py-1 text-nowrap shadow-lg"
                              style={{
                                bottom: 'calc(100% + 6px)',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'rgba(0,0,0,0.85)',
                                color: '#fff',
                                fontSize: '0.7rem',
                                zIndex: 10,
                                backdropFilter: 'blur(6px)',
                                pointerEvents: 'none',
                              }}
                            >
                              <strong>{day.monthLabel} {day.dayLabel}</strong>: {displayHrs}h
                              {metGoal && ' 🎉'}
                              <div 
                                className="position-absolute"
                                style={{
                                  top: '100%',
                                  left: '50%',
                                  transform: 'translateX(-50%)',
                                  width: 0, height: 0,
                                  borderLeft: '5px solid transparent',
                                  borderRight: '5px solid transparent',
                                  borderTop: '5px solid rgba(0,0,0,0.85)',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Heatmap Legend */}
                  <div className="d-flex justify-content-between align-items-center mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem' }}>
                    <div className="text-white-50">Tap a cell for details</div>
                    <div className="d-flex align-items-center gap-1">
                      <span className="text-white-50">0h</span>
                      <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#F0F2F5' }} />
                      <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#D3F4C2' }} />
                      <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#8CE0A2' }} />
                      <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#43C878' }} />
                      <div className="rounded-1" style={{ width: '12px', height: '12px', backgroundColor: '#25D366' }} />
                      <span className="text-white-50">{dailyGoal}h+</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Streak Protection & Grace Days ──────────── */}
              <div className="mb-3">
                <h6 className="text-white fw-bold small mb-2 text-uppercase d-flex align-items-center gap-1" style={{ fontSize: '0.75rem', letterSpacing: '0.8px' }}>
                  <span>❄️</span> Streak Protection & Grace Days
                </h6>
                <div 
                  className="p-3 rounded-4 d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3"
                  style={{ 
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div className="d-flex align-items-center gap-2">
                    <div 
                      className="d-flex align-items-center justify-content-center rounded-circle"
                      style={{ 
                        width: '42px', height: '42px', fontSize: '1.25rem', minWidth: '42px', 
                        background: 'rgba(13, 202, 240, 0.12)',
                        border: '1px solid rgba(13, 202, 240, 0.25)',
                      }}
                    >
                      ❄️
                    </div>
                    <div>
                      <div className="fw-bold text-white" style={{ fontSize: '0.9rem' }}>
                        {streakData.streakFreezes ?? 0} Freeze Token{(streakData.streakFreezes ?? 0) !== 1 ? 's' : ''}
                      </div>
                      <div className="text-white-50" style={{ fontSize: '0.72rem' }}>
                        1 token protects 1 missed day. Auto-consumed when you return.
                      </div>
                    </div>
                  </div>

                  <div className="d-flex flex-wrap gap-2">
                    <button
                      className="btn btn-sm fw-bold rounded-pill px-3 py-1 hover-scale transition-all"
                      onClick={onOpenPoints}
                      title="Buy Streak Freeze token with points in Shop"
                      style={{ 
                        fontSize: '0.8rem',
                        background: 'rgba(13, 202, 240, 0.12)',
                        border: '1px solid rgba(13, 202, 240, 0.3)',
                        color: '#67e8f9',
                      }}
                    >
                      <i className="bi bi-cart-plus me-1" />Buy Freeze in Shop
                    </button>

                    {streakData.excusedDays?.includes(selectedDate) ? (
                      <span 
                        className="badge rounded-pill px-3 py-2 fw-bold d-inline-flex align-items-center gap-1"
                        style={{ 
                          fontSize: '0.8rem', 
                          background: 'rgba(37, 211, 102, 0.15)',
                          color: '#25D366',
                          border: '1px solid rgba(37, 211, 102, 0.25)',
                        }}
                      >
                        <i className="bi bi-shield-fill-check" /> Excused (Streak Protected)
                      </span>
                    ) : (
                      todayCompletedHours === 0 && (
                        <button
                          className="btn btn-sm fw-bold rounded-pill px-3 py-1 hover-scale transition-all"
                          onClick={() => onExcuseDay(selectedDate)}
                          title="Excuse this day's lack of logging to prevent streak reset."
                          style={{ 
                            fontSize: '0.8rem',
                            background: 'rgba(37, 211, 102, 0.12)',
                            border: '1px solid rgba(37, 211, 102, 0.3)',
                            color: '#25D366',
                          }}
                        >
                          <i className="bi bi-calendar-check me-1" />Excuse Day
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
