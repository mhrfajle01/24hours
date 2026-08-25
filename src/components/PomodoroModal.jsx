import React, { useState, useEffect, useRef } from 'react';
import { getIntervalTimes, timeToMinutes, isFeatureActive } from '../utils/helpers';
import { useSound } from '../contexts/SoundContext';

/**
 * Sound synthesizer using Web Audio API (completely self-contained, offline-ready).
 */
const playAudioSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    if (type === 'tick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.015, now);
      gain.gain.exponentialRampToValueAtTime(0.00001, now + 0.04);
      osc.start();
      osc.stop(now + 0.04);
    } else if (type === 'alarm') {
      // Beautiful chime chord (C major arpeggio)
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const noteStart = now + idx * 0.08;
        osc.frequency.setValueAtTime(freq, noteStart);
        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.2, noteStart + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.00001, noteStart + 0.6);
        
        osc.start(noteStart);
        osc.stop(noteStart + 0.6);
      });
    }
  } catch (err) {
    console.error('AudioContext synthesis failed:', err);
  }
};

export default function PomodoroModal({
  isOpen,
  onClose,
  activeReport,
  onAwardPoints,
  onUpdateReportText,
  pointsData,
  onUnlockFeature
}) {
  if (!isOpen) return null;

  const { playSound } = useSound();

  // Block point purchase logic
  const getBlockDurationMin = () => {
    if (!activeReport) return 60;
    try {
      const times = getIntervalTimes(activeReport);
      const startMin = timeToMinutes(times.startTime);
      let endMin = timeToMinutes(times.endTime);
      if (endMin < startMin) {
        endMin += 24 * 60;
      }
      return endMin - startMin;
    } catch (e) {
      return 60;
    }
  };

  const durationMin = getBlockDurationMin();
  const unlockCost = Math.max(5, Math.round((durationMin / 60) * 10));
  const featureKey = activeReport ? `pomodoro_block_${activeReport.id}` : '';
  const isUnlocked = isFeatureActive(pointsData, featureKey);

  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  // Configuration (minutes)
  const [focusDur, setFocusDur] = useState(25);
  const [shortBreakDur, setShortBreakDur] = useState(5);
  const [longBreakDur, setLongBreakDur] = useState(15);

  // States
  const [phase, setPhase] = useState('focus'); // 'focus' | 'short' | 'long'
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [sessionsCount, setSessionsCount] = useState(0);

  // Auto-Match block time left state
  const [autoMatchTime, setAutoMatchTime] = useState(true);

  // User preference states
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [tickEnabled, setTickEnabled] = useState(false);

  // Save base document title
  const originalTitleRef = useRef(document.title);

  // Helper to compute seconds left in active block
  const getSecondsLeftInActiveBlock = () => {
    if (!activeReport) return 0;
    try {
      const times = getIntervalTimes(activeReport);
      const startMin = timeToMinutes(times.startTime);
      let endMin = timeToMinutes(times.endTime);
      if (endMin < startMin) {
        endMin += 24 * 60;
      }
      const now = new Date();
      const currentSecVal = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      let adjustedCurrentSecVal = currentSecVal;
      if (endMin >= 24 * 60 && currentSecVal < ((endMin % (24 * 60)) * 60)) {
        adjustedCurrentSecVal += 24 * 3600;
      }
      const endSec = endMin * 60;
      return Math.max(0, endSec - adjustedCurrentSecVal);
    } catch (e) {
      return 0;
    }
  };

  const handleUnlock = async () => {
    if (!onUnlockFeature || !featureKey) return;
    setIsUnlocking(true);
    setUnlockError('');
    try {
      await onUnlockFeature(featureKey, unlockCost, `Pomodoro Access (${durationMin}m block)`);
    } catch (e) {
      setUnlockError(e.message || 'Unlock failed. Please try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Initialize time when phase, durations or autoMatchTime changes
  useEffect(() => {
    if (!isActive && isUnlocked) {
      resetTimer(phase);
    }
  }, [focusDur, shortBreakDur, longBreakDur, phase, autoMatchTime, isUnlocked]);

  // Main countdown timer interval
  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0 && isUnlocked) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          const next = prev - 1;
          if (tickEnabled) {
            playAudioSound('tick');
          }
          return next;
        });
      }, 1000);
    } else if (timeLeft === 0 && isActive && isUnlocked) {
      handlePhaseCompletion();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, tickEnabled, isUnlocked]);

  // Update document title with remaining time
  useEffect(() => {
    if (isActive && isUnlocked) {
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;
      const displayTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      const prefix = phase === 'focus' ? '🍅' : '🧘';
      document.title = `(${displayTime}) ${prefix} Pomodoro`;
    } else {
      document.title = originalTitleRef.current;
    }
    return () => {
      document.title = originalTitleRef.current;
    };
  }, [timeLeft, isActive, phase, isUnlocked]);

  const resetTimer = (targetPhase = phase) => {
    setIsActive(false);
    if (targetPhase === 'focus') {
      if (autoMatchTime) {
        const leftSecs = getSecondsLeftInActiveBlock();
        setTimeLeft(leftSecs > 10 ? leftSecs : focusDur * 60);
      } else {
        setTimeLeft(focusDur * 60);
      }
    } else if (targetPhase === 'short') {
      setTimeLeft(shortBreakDur * 60);
    } else if (targetPhase === 'long') {
      setTimeLeft(longBreakDur * 60);
    }
  };

  const handlePhaseCompletion = async () => {
    setIsActive(false);
    if (soundEnabled) {
      playAudioSound('alarm');
      playSound('timer');
    }

    if (phase === 'focus') {
      setSessionsCount((prev) => prev + 1);
      
      // Award points
      if (onAwardPoints) {
        onAwardPoints(5, 'Completed Pomodoro focus session (+5 pts)');
      }

      // Propose updating active hour's report
      if (activeReport && onUpdateReportText) {
        const focusMinutes = autoMatchTime 
          ? Math.max(1, Math.round(getSecondsLeftInActiveBlock() / 60))
          : focusDur;
        const textToAdd = `[Completed 🍅 session: ${focusMinutes} min focus]`;
        const currentReportText = activeReport.report || '';
        const divider = currentReportText ? ' \n' : '';
        const newReportText = `${currentReportText}${divider}${textToAdd}`;
        await onUpdateReportText(activeReport, newReportText, 'Completed');
      }

      // Transition automatically to short break or long break
      const isLongBreak = (sessionsCount + 1) % 4 === 0;
      setPhase(isLongBreak ? 'long' : 'short');
    } else {
      // Break completion: switch to focus phase
      setPhase('focus');
    }
  };

  // Helper variables for styling & progress circle
  const getDuration = () => {
    if (phase === 'focus') {
      if (autoMatchTime) {
        const leftSecs = getSecondsLeftInActiveBlock();
        return leftSecs > 10 ? leftSecs : focusDur * 60;
      }
      return focusDur * 60;
    }
    if (phase === 'short') return shortBreakDur * 60;
    return longBreakDur * 60;
  };

  const totalDuration = getDuration();
  const percentCompleted = totalDuration > 0 ? ((totalDuration - timeLeft) / totalDuration) * 100 : 0;
  const strokeDashoffset = 282.7 - (282.7 * percentCompleted) / 100;

  const displayMinutes = Math.floor(timeLeft / 60);
  const displaySeconds = timeLeft % 60;

  return (
    <div 
      className="modal fade show d-block" 
      tabIndex="-1" 
      style={{ 
        background: 'rgba(15, 23, 42, 0.75)', 
        backdropFilter: 'blur(12px)',
        zIndex: 1055 
      }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div 
          className="modal-content border-0 rounded-4 overflow-hidden shadow-lg animate-slide-up"
          style={{
            background: 'var(--bs-body-bg, #ffffff)',
          }}
        >
          {/* Header */}
          <div className="modal-header border-0 bg-danger bg-opacity-10 d-flex justify-content-between align-items-center py-3 px-4">
            <h5 className="modal-title fw-bold text-danger d-flex align-items-center gap-2">
              <span>🍅</span> Pomodoro Focus Space
            </h5>
            <button 
              type="button" 
              className="btn-close shadow-none" 
              onClick={() => {
                setIsActive(false);
                document.title = originalTitleRef.current;
                onClose();
              }}
            />
          </div>

          {/* Body */}
          <div className="modal-body p-4 text-center">
            {activeReport?.plan && (
              <div className="mb-4 p-3 bg-light rounded-3 shadow-sm border border-light">
                <span className="text-muted fs-xs text-uppercase fw-semibold d-block mb-1">CURRENT PLAN</span>
                <strong className="text-dark fs-6">"{activeReport.plan}"</strong>
              </div>
            )}

            {!isUnlocked ? (
              /* --- Locked Purchase View --- */
              <div className="py-4 px-2">
                <div className="fs-1 mb-3 animate-pulse">🔒</div>
                <h5 className="fw-bold text-dark mb-2">Pomodoro Space is Locked</h5>
                <p className="text-secondary small mb-4">
                  Unlock premium Pomodoro focus tools for this active block using your earned tracking points!
                </p>

                <div className="card border-0 bg-light p-3 rounded-4 mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-secondary small">Block Duration:</span>
                    <strong className="text-dark">{durationMin} Minutes</strong>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-secondary small">Unlock Cost:</span>
                    <strong className="text-danger-emphasis">{unlockCost} Points</strong>
                  </div>
                  <hr className="my-2 border-secondary-subtle" />
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-secondary small">Your Balance:</span>
                    <strong className="text-success">{pointsData?.points || 0} Points</strong>
                  </div>
                </div>

                {unlockError && (
                  <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3">
                    {unlockError}
                  </div>
                )}

                <div className="d-flex flex-column gap-2">
                  <button 
                    className="btn btn-danger text-white rounded-pill py-2.5 fw-bold shadow-sm hover-scale w-100"
                    disabled={isUnlocking || (pointsData?.points || 0) < unlockCost}
                    onClick={handleUnlock}
                  >
                    {isUnlocking ? 'Unlocking...' : `Unlock with ${unlockCost} Points`}
                  </button>
                  <button 
                    className="btn btn-link text-secondary text-decoration-none small"
                    onClick={onClose}
                  >
                    Back to Feed
                  </button>
                </div>
              </div>
            ) : (
              /* --- Unlocked Active Timer View --- */
              <>
                {/* Timer visual container */}
                <div className="position-relative d-inline-block my-3">
                  {/* Circular SVG Progress */}
                  <svg width="200" height="200" className="transform -rotate-90">
                    {/* Background Ring */}
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="45" 
                      fill="transparent" 
                      stroke="rgba(0, 0, 0, 0.05)" 
                      strokeWidth="8"
                    />
                    {/* Foreground Progress Ring */}
                    <circle 
                      cx="100" 
                      cy="100" 
                      r="45" 
                      fill="transparent" 
                      stroke={phase === 'focus' ? '#DC3545' : '#198754'} 
                      strokeWidth="8"
                      strokeDasharray="282.7"
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                  </svg>

                  {/* Centered text */}
                  <div 
                    className="position-absolute top-50 start-50 translate-middle d-flex flex-column align-items-center"
                    style={{ zIndex: 5 }}
                  >
                    <span className="fs-1 fw-bold text-dark font-monospace" style={{ letterSpacing: '-1px' }}>
                      {String(displayMinutes).padStart(2, '0')}:{String(displaySeconds).padStart(2, '0')}
                    </span>
                    <span className={`badge rounded-pill text-uppercase fs-xxs px-2.5 py-1 ${
                      phase === 'focus' ? 'bg-danger text-white' : 'bg-success text-white'
                    }`}>
                      {phase === 'focus' ? 'Focus Session' : phase === 'short' ? 'Short Break' : 'Long Break'}
                    </span>
                  </div>
                </div>

                {/* Sessions count badge */}
                <div className="my-2">
                  <span className="badge bg-secondary-subtle text-secondary px-3 py-1.5 rounded-pill fs-xs">
                    Completed Sessions: <strong className="text-dark">{sessionsCount}</strong>
                  </span>
                </div>

                {/* Controls */}
                <div className="d-flex justify-content-center gap-3 my-4">
                  <button 
                    className={`btn rounded-pill px-4 fw-bold shadow-sm transition-all hover-scale ${
                      isActive ? 'btn-outline-secondary' : phase === 'focus' ? 'btn-danger text-white' : 'btn-success text-white'
                    }`}
                    onClick={() => setIsActive(!isActive)}
                  >
                    {isActive ? (
                      <>
                        <i className="bi bi-pause-fill me-1"></i>Pause
                      </>
                    ) : (
                      <>
                        <i className="bi bi-play-fill me-1"></i>Start
                      </>
                    )}
                  </button>
                  <button 
                    className="btn btn-outline-secondary rounded-pill px-4 fw-bold shadow-sm transition-all hover-scale"
                    onClick={() => resetTimer()}
                  >
                    <i className="bi bi-arrow-counterclockwise me-1"></i>Reset
                  </button>
                </div>

                {/* Tabs for phase switching */}
                <div className="d-flex justify-content-center gap-2 mb-4 bg-light p-1.5 rounded-pill max-width-container" style={{ maxWidth: '340px' }}>
                  <button 
                    className={`btn btn-xs rounded-pill flex-fill fw-semibold py-1.5 transition-all ${
                      phase === 'focus' ? 'bg-danger text-white' : 'btn-light text-secondary border-0'
                    }`}
                    onClick={() => setPhase('focus')}
                  >
                    Focus
                  </button>
                  <button 
                    className={`btn btn-xs rounded-pill flex-fill fw-semibold py-1.5 transition-all ${
                      phase === 'short' ? 'bg-success text-white' : 'btn-light text-secondary border-0'
                    }`}
                    onClick={() => setPhase('short')}
                  >
                    Short Break
                  </button>
                  <button 
                    className={`btn btn-xs rounded-pill flex-fill fw-semibold py-1.5 transition-all ${
                      phase === 'long' ? 'bg-success text-white' : 'btn-light text-secondary border-0'
                    }`}
                    onClick={() => setPhase('long')}
                  >
                    Long Break
                  </button>
                </div>

                {/* Duration Settings */}
                <div className="border-top pt-4 px-2 text-start">
                  
                  {/* Auto-Match Checkbox */}
                  <div className="form-check form-switch mb-3 p-3 bg-light rounded-3 d-flex justify-content-between align-items-center">
                    <div>
                      <label className="form-check-label fw-bold text-dark d-block" htmlFor="pomodoroAutoMatch">
                        ⏳ Auto-Match Remaining Time
                      </label>
                      <small className="text-secondary" style={{ fontSize: '0.72rem' }}>
                        Locks focus timer to active block remaining minutes.
                      </small>
                    </div>
                    <input 
                      className="form-check-input shadow-none cursor-pointer" 
                      type="checkbox" 
                      id="pomodoroAutoMatch"
                      checked={autoMatchTime}
                      disabled={phase !== 'focus' || isActive}
                      onChange={(e) => setAutoMatchTime(e.target.checked)}
                    />
                  </div>

                  <h6 className="fw-bold mb-3 text-secondary d-flex align-items-center gap-2" style={{ fontSize: '0.85rem' }}>
                    <i className="bi bi-sliders"></i> Timer Durations (Minutes)
                  </h6>
                  <div className="row g-2">
                    <div className="col-4">
                      <label className="form-label fs-xs text-muted mb-1">Focus</label>
                      <input 
                        type="number" 
                        className="form-control form-control-sm text-center font-monospace rounded-3"
                        value={autoMatchTime && phase === 'focus' ? Math.max(1, Math.round(getSecondsLeftInActiveBlock() / 60)) : focusDur}
                        disabled={autoMatchTime && phase === 'focus'}
                        min="1"
                        max="60"
                        onChange={(e) => setFocusDur(Math.max(1, parseInt(e.target.value) || 25))}
                      />
                    </div>
                    <div className="col-4">
                      <label className="form-label fs-xs text-muted mb-1">Short Break</label>
                      <input 
                        type="number" 
                        className="form-control form-control-sm text-center font-monospace rounded-3"
                        value={shortBreakDur}
                        min="1"
                        max="30"
                        onChange={(e) => setShortBreakDur(Math.max(1, parseInt(e.target.value) || 5))}
                      />
                    </div>
                    <div className="col-4">
                      <label className="form-label fs-xs text-muted mb-1">Long Break</label>
                      <input 
                        type="number" 
                        className="form-control form-control-sm text-center font-monospace rounded-3"
                        value={longBreakDur}
                        min="1"
                        max="60"
                        onChange={(e) => setLongBreakDur(Math.max(1, parseInt(e.target.value) || 15))}
                      />
                    </div>
                  </div>
                </div>

                {/* Sound Toggles */}
                <div className="mt-3 pt-3 border-top px-2 text-start d-flex justify-content-between align-items-center flex-wrap gap-3">
                  <div className="form-check form-switch mb-0">
                    <input 
                      className="form-check-input shadow-none cursor-pointer" 
                      type="checkbox" 
                      id="pomodoroChimeSwitch"
                      checked={soundEnabled}
                      onChange={(e) => setSoundEnabled(e.target.checked)}
                    />
                    <label className="form-check-label fs-xs text-muted cursor-pointer" htmlFor="pomodoroChimeSwitch">
                      🔔 Alarm Sound
                    </label>
                  </div>

                  <div className="form-check form-switch mb-0">
                    <input 
                      className="form-check-input shadow-none cursor-pointer" 
                      type="checkbox" 
                      id="pomodoroTickSwitch"
                      checked={tickEnabled}
                      onChange={(e) => setTickEnabled(e.target.checked)}
                    />
                    <label className="form-check-label fs-xs text-muted cursor-pointer" htmlFor="pomodoroTickSwitch">
                      ⏰ Tick Sound
                    </label>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
