import React, { useState, useEffect } from 'react';
import { useStreaks, getStreakDays } from '../hooks/useStreaks';
import HabitScannerModal from '../components/HabitScannerModal';

const QUOTES = [
  "Every fall is a chance to rise. You got this! 💪",
  "Success is the sum of small efforts, repeated day in and day out.",
  "Don't trade what you want most for what you want right now.",
  "Your future is created by what you do today, not tomorrow.",
  "Discipline is choosing between what you want now and what you want most.",
  "The secret of your future is hidden in your daily routine.",
  "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
  "It does not matter how slowly you go as long as you do not stop.",
  "Fall seven times, stand up eight.",
  "Motivation is what gets you started. Habit is what keeps you going.",
  "A year from now you may wish you had started today.",
  "You don't have to be extreme, just consistent.",
  "Small daily improvements over time lead to stunning results.",
  "What comes easy won't last. What lasts won't come easy.",
  "Don't count the days, make the days count."
];

const TEMPLATES = [
  { name: 'NoFap', emoji: '🚫', category: 'Breaking' },
  { name: 'No Smoking', emoji: '🚭', category: 'Breaking' },
  { name: 'No Social Media', emoji: '📵', category: 'Breaking' },
  { name: 'No Junk Food', emoji: '🥗', category: 'Breaking' },
  { name: 'Gym Streak', emoji: '💪', category: 'Building' },
  { name: 'Reading Daily', emoji: '📚', category: 'Building' },
  { name: 'Waking Up Early', emoji: '🌅', category: 'Building' },
  { name: 'Daily Prayer', emoji: '🧘', category: 'Building' },
];

const TRIGGERS = [
  'Boredom', 'Stress', 'Loneliness', 'Late Night', 
  'Peer Pressure', 'Lack of Sleep', 'Anger', 'Other'
];

const MILESTONES = [
  { days: 7, label: '7d', emoji: '🥉', color: '#cd7f32' },
  { days: 21, label: '21d', emoji: '🥈', color: '#c0c0c0' },
  { days: 30, label: '30d', emoji: '🥇', color: '#ffd700' },
  { days: 90, label: '90d', emoji: '💎', color: '#00d4ff' },
  { days: 365, label: '365d', emoji: '👑', color: '#ff6b6b' }
];

const EMOJIS = ['🚭','💪','🏃','📚','🧘','🥗','💧','🌅','🎯','📵','💤','🏋️','🎨','🧠','🙏','🚫'];

export default function StreaksPage({ currentUser, onBack, onDailyCheckIn, streakRequirements = {}, openHabitScanner = false }) {
  // We assume useStreaks returns an object with these properties. 
  // If hooks are slightly different, this might need adjustment, but matches standard patterns.
  const { 
    streaks = [], 
    loading = false, 
    addStreak = async () => {}, 
    updateStreak = async () => {}, 
    deleteStreak = async () => {}, 
    recordRelapse = async () => {} 
  } = useStreaks(currentUser?.uid);

  const [activeView, setActiveView] = useState('list'); // 'list', 'detail', 'add'
  const [selectedStreak, setSelectedStreak] = useState(null);
  const [showRelapseModal, setShowRelapseModal] = useState(false);
  const [relapseStreak, setRelapseStreak] = useState(null);
  
  // Timer State
  const [showSOSTimer, setShowSOSTimer] = useState(false);
  const [sosTimeLeft, setSosTimeLeft] = useState(600); // 10 minutes
  const [timerActive, setTimerActive] = useState(false);

  // Form State
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🎯');
  const [newCategory, setNewCategory] = useState('Building');

  // Relapse Form State
  const [relapseTrigger, setRelapseTrigger] = useState('');
  const [relapseNote, setRelapseNote] = useState('');
  const [relapseMessage, setRelapseMessage] = useState('');
  const [timeUntilReset, setTimeUntilReset] = useState('');
  const [showHabitScanner, setShowHabitScanner] = useState(openHabitScanner);

  // Random Quote
  const [quote] = useState(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  useEffect(() => {
    let interval;
    if (timerActive && sosTimeLeft > 0) {
      interval = setInterval(() => {
        setSosTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (sosTimeLeft === 0) {
      setTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [timerActive, sosTimeLeft]);

  useEffect(() => {
    const updateTimeUntilReset = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const seconds = Math.max(0, Math.floor((midnight - now) / 1000));
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      setTimeUntilReset(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
      );
    };

    updateTimeUntilReset();
    const interval = setInterval(updateTimeUntilReset, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (openHabitScanner) setShowHabitScanner(true);
  }, [openHabitScanner]);

  // Utility to format time
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startSOS = () => {
    setShowSOSTimer(true);
    setSosTimeLeft(600);
    setTimerActive(true);
  };

  const closeSOS = () => {
    setShowSOSTimer(false);
    setTimerActive(false);
  };

  const getDays = (streak) => {
    if (typeof getStreakDays === 'function') {
      return getStreakDays(streak);
    }
    // Fallback calculation if getStreakDays is not available
    if (!streak || !streak.startDate) return 0;
    const start = new Date(streak.startDate).getTime();
    const now = new Date().getTime();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  };

  const getCurrentMilestone = (days) => {
    let current = null;
    for (const m of MILESTONES) {
      if (days >= m.days) {
        current = m;
      }
    }
    return current;
  };

  const getNextMilestone = (days) => {
    for (const m of MILESTONES) {
      if (days < m.days) {
        return m;
      }
    }
    return null; // Past 365 days
  };

  const getHabitCopy = (streak) => {
    const isBreaking = streak.category === 'Breaking';
    return {
      unit: isBreaking ? 'Days Free' : 'Days Strong',
      progressLabel: isBreaking ? 'days free' : 'days completed',
      encouragement: isBreaking ? 'Keep protecting your progress' : 'Keep building your habit',
      checkIn: isBreaking ? 'Stayed clean today' : 'Kept the promise today',
    };
  };

  const handleAddStreak = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    await addStreak({
      name: newName.trim(),
      emoji: newEmoji,
      category: newCategory,
      startDate: new Date().toISOString(),
      bestStreak: 0,
      totalRelapses: 0,
      history: []
    });
    setActiveView('list');
    setNewName('');
    setNewEmoji('🎯');
    setNewCategory('Building');
  };

  const triggerRelapse = (streak) => {
    setRelapseStreak(streak);
    setShowRelapseModal(true);
    setRelapseTrigger('');
    setRelapseNote('');
    setRelapseMessage('');
  };

  const confirmRelapse = async () => {
    if (!relapseStreak) return;
    
    await recordRelapse(relapseStreak.id, relapseTrigger, relapseNote);
    
    setRelapseMessage("Every fall is a chance to rise. You got this! 💪");
    setTimeout(() => {
      setShowRelapseModal(false);
      setRelapseStreak(null);
    }, 2500);
  };

  const relapsePenalty = relapseStreak
    ? 100 + (getDays(relapseStreak) * 20)
    : 100;

  const handleDelete = async () => {
    if (selectedStreak && window.confirm('Are you sure you want to delete this streak?')) {
      await deleteStreak(selectedStreak.id);
      setActiveView('list');
      setSelectedStreak(null);
    }
  };

  const checkinRequirementsMet = !!(streakRequirements.appUsageMet && streakRequirements.journalMet && streakRequirements.planningMet);

  const handleCheckIn = async () => {
    if (!checkinRequirementsMet) {
      // Show requirements not met toast
      const toast = document.createElement('div');
      toast.className = 'position-fixed top-0 start-50 translate-middle-x mt-4 p-3 rounded-4 shadow-lg text-white fw-bold animate-slide-down-toast-container';
      toast.style.background = 'linear-gradient(135deg, #ff6b6b, #ee5a24)';
      toast.style.zIndex = 9999;
      const missing = [];
      if (!streakRequirements.planningMet) missing.push(`${streakRequirements.planningCount || 0}/3 plans`);
      if (!streakRequirements.journalMet) missing.push('no journal');
      if (!streakRequirements.appUsageMet) missing.push('< 3 min usage');
      toast.innerHTML = `⚠️ Requirements not met: ${missing.join(', ')}`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => toast.remove(), 500);
      }, 3000);
      return;
    }
    try {
      const result = onDailyCheckIn ? await onDailyCheckIn() : false;
      if (result === false) {
        // Server-side validation also failed
        const toast = document.createElement('div');
        toast.className = 'position-fixed top-0 start-50 translate-middle-x mt-4 p-3 rounded-4 shadow-lg text-white fw-bold animate-slide-down-toast-container';
        toast.style.background = 'linear-gradient(135deg, #ff9800, #f57c00)';
        toast.style.zIndex = 9999;
        toast.innerHTML = '⚠️ Check-in requirements not yet fulfilled';
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transition = 'opacity 0.5s';
          setTimeout(() => toast.remove(), 500);
        }, 2500);
        return;
      }
    } catch (error) {
      console.error('Daily check-in failed:', error);
      return;
    }
    const toast = document.createElement('div');
    toast.className = 'position-fixed top-0 start-50 translate-middle-x mt-4 p-3 rounded-4 shadow-lg text-white fw-bold animate-slide-down-toast-container';
    toast.style.background = 'linear-gradient(135deg, #25D366, #128C7E)';
    toast.style.zIndex = 9999;
    toast.innerHTML = '✨ Daily check-in recorded! +20 points';
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s';
      setTimeout(() => toast.remove(), 500);
    }, 2000);
  };

  // Main Render
  return (
    <div 
      className="streaks-page-container d-flex flex-column animate-page"
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 40%, #0d1b2a 100%)',
        color: '#fff',
        fontFamily: "'Outfit', sans-serif"
      }}
    >
      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .glowing-text {
          text-shadow: 0 0 10px rgba(255, 255, 255, 0.3), 0 0 20px rgba(0, 212, 255, 0.2);
        }
        .fire-glow {
          text-shadow: 0 0 10px rgba(255, 107, 107, 0.5), 0 0 20px rgba(255, 107, 107, 0.3);
        }
        @keyframes pulseRing {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(0, 212, 255, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 212, 255, 0); }
        }
        .breathe-circle {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.05) 100%);
          border: 2px solid rgba(0,212,255,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: breatheAnim 8s infinite ease-in-out;
        }
        @keyframes breatheAnim {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }
        .sos-btn {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff6b6b, #c0392b);
          box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          cursor: pointer;
          z-index: 1000;
          transition: transform 0.2s;
        }
        .sos-btn:hover { transform: scale(1.1); }
        
        .progress-ring__circle {
          transition: stroke-dashoffset 0.35s;
          transform: rotate(-90deg);
          transform-origin: 50% 50%;
        }
        .template-card:hover {
          background: rgba(255, 255, 255, 0.15) !important;
          transform: translateY(-2px);
        }
        .trigger-btn.active {
          background: #ff6b6b !important;
          color: white !important;
          border-color: #ff6b6b !important;
        }
        .heatmap-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(20px, 1fr));
          gap: 4px;
        }
        .heatmap-cell {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 4px;
          background: rgba(255,255,255,0.1);
        }
        .heatmap-cell.success { background: #25D366; }
        .heatmap-cell.fail { background: #ff6b6b; }
      `}</style>

      {/* HEADER */}
      <header className="sticky-top glass-card px-3 py-3 d-flex align-items-center justify-content-between z-3">
        <div className="d-flex align-items-center gap-3">
          <button 
            className="btn btn-link text-white p-0 text-decoration-none hover-scale"
            onClick={() => {
              if (activeView !== 'list') setActiveView('list');
              else onBack();
            }}
          >
            <i className="bi bi-arrow-left fs-4" />
          </button>
          <h4 className="m-0 fw-extrabold glowing-text d-flex align-items-center gap-2">
            <i className="bi bi-fire text-warning" /> Streaks
          </h4>
        </div>
        {activeView === 'list' && (
          <button 
            className="btn btn-sm text-black fw-bold rounded-pill px-3"
            style={{ background: '#00d4ff', boxShadow: '0 0 10px rgba(0,212,255,0.4)' }}
            onClick={() => setActiveView('add')}
          >
            <i className="bi bi-plus-lg" /> Add
          </button>
        )}
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-grow-1 overflow-auto p-3 pb-5">
        <div className="max-width-container mx-auto">

          {activeView === 'list' && (
            <div className="animate-fade-in">
              {/* Motivational Quote */}
              <div className="text-center mb-4 px-3 py-3 glass-card rounded-4">
                <p className="m-0 fst-italic text-white-50 fs-6">"{quote}"</p>
              </div>

              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-info" role="status"></div>
                </div>
              ) : streaks.length === 0 ? (
                <div className="text-center py-5 d-flex flex-column align-items-center animate-slide-up">
                  <div style={{ fontSize: '5rem', animation: 'pulseOpacity 2s infinite' }}>🔥</div>
                  <h3 className="fw-extrabold mt-3">Start Your Journey</h3>
                  <p className="text-white-50 px-4">Build habits that last. Break the ones that hold you back.</p>
                  <button 
                    className="btn btn-lg fw-bold rounded-pill px-4 mt-3 text-black"
                    style={{ background: 'linear-gradient(135deg, #00d4ff, #007bff)' }}
                    onClick={() => setActiveView('add')}
                  >
                    Create Your First Streak
                  </button>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {streaks.map(streak => {
                    const days = getDays(streak);
                    const currentMile = getCurrentMilestone(days);
                    const nextMile = getNextMilestone(days);
                    const progress = nextMile
                      ? Math.max(0, Math.min(100, (days / nextMile.days) * 100))
                      : 100;
                    const habitCopy = getHabitCopy(streak);

                    return (
                      <div 
                        key={streak.id} 
                        className="glass-card rounded-4 p-4 position-relative hover-scale transition-all cursor-pointer"
                        onClick={() => { setSelectedStreak(streak); setActiveView('detail'); }}
                      >
                        {/* Category Badge */}
                        <div className="position-absolute top-0 end-0 mt-3 me-3 badge bg-black bg-opacity-25 border border-secondary rounded-pill text-white-50">
                          {streak.category}
                        </div>

                        <div className="text-center">
                          <div className="fs-1 mb-2">{streak.emoji}</div>
                          <h5 className="fw-bold mb-3">{streak.name}</h5>
                          
                          <div className="position-relative d-inline-block mb-3">
                            <div className="fw-extrabold fire-glow" style={{ fontSize: '4.5rem', lineHeight: '1' }}>
                              {days}
                            </div>
                            <div className="text-uppercase fw-bold text-white-50" style={{ letterSpacing: '2px', fontSize: '0.8rem' }}>
                              {habitCopy.unit}
                            </div>
                          </div>

                          {/* Progress Bar to next milestone */}
                          {nextMile && (
                            <div className="mb-3 px-4">
                              <div className="d-flex justify-content-between text-white-50 mb-1" style={{ fontSize: '0.75rem' }}>
                                <span>{days}d {habitCopy.progressLabel}</span>
                                <span>{nextMile.emoji} {nextMile.days}d</span>
                              </div>
                              <div className="progress" style={{ height: '6px', background: 'rgba(255,255,255,0.1)' }}>
                                <div 
                                  className="progress-bar" 
                                  role="progressbar" 
                                  style={{ width: `${progress}%`, background: nextMile.color, boxShadow: `0 0 10px ${nextMile.color}` }}
                                ></div>
                              </div>
                              <div className="text-white-50 mt-1" style={{ fontSize: '0.7rem' }}>
                                {nextMile.days - days} {nextMile.days - days === 1 ? 'day' : 'days'} until {nextMile.days}d
                              </div>
                            </div>
                          )}

                          <div className="d-flex justify-content-center gap-2 mt-4" onClick={e => e.stopPropagation()}>
                            <button 
                              className="btn btn-sm rounded-pill fw-bold px-4"
                              style={{ 
                                background: checkinRequirementsMet ? 'rgba(37, 211, 102, 0.2)' : 'rgba(255,255,255,0.05)', 
                                color: checkinRequirementsMet ? '#25D366' : 'rgba(255,255,255,0.3)', 
                                border: `1px solid ${checkinRequirementsMet ? '#25D366' : 'rgba(255,255,255,0.15)'}`,
                                cursor: checkinRequirementsMet ? 'pointer' : 'not-allowed',
                                opacity: checkinRequirementsMet ? 1 : 0.6,
                              }}
                              onClick={handleCheckIn}
                              title={checkinRequirementsMet ? 'Claim daily check-in bonus' : `Requirements: 3+ plans (${streakRequirements.planningCount || 0}/3), journal entry, 3 min app usage`}
                            >
                              ✓ {habitCopy.checkIn}
                            </button>
                            <button 
                              className="btn btn-sm rounded-pill fw-bold px-4"
                              style={{ background: 'rgba(255, 107, 107, 0.2)', color: '#ff6b6b', border: '1px solid #ff6b6b' }}
                              onClick={() => triggerRelapse(streak)}
                            >
                              ↺ Relapsed
                            </button>
                          </div>
                          
                          {currentMile && (
                            <div className="mt-3 text-center">
                              <span className="badge rounded-pill px-3 py-2" style={{ background: 'rgba(255,255,255,0.1)', border: `1px solid ${currentMile.color}` }}>
                                {currentMile.emoji} Milestone Achieved
                              </span>
                            </div>
                          )}
                          <div className="text-white-50 small mt-3">Personal Best: {Math.max(streak.bestStreak || 0, days)} days</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeView === 'detail' && selectedStreak && (() => {
            const days = getDays(selectedStreak);
            const history = selectedStreak.relapseHistory || [];
            
            return (
              <div className="animate-slide-up pb-5">
                <div className="text-center mb-4">
                  <div className="fs-1">{selectedStreak.emoji}</div>
                  <h3 className="fw-extrabold glowing-text">{selectedStreak.name}</h3>
                  <div className="fs-5 text-white-50">{days} {getHabitCopy(selectedStreak).unit}</div>
                </div>

                <div className="glass-card rounded-4 p-3 mb-4 text-center">
                  <div className="text-white-50 small text-uppercase mb-1">Today’s streak window</div>
                  <div className="fs-2 fw-extrabold text-info">{timeUntilReset}</div>
                  <div className="text-white-50 small">
                    {getHabitCopy(selectedStreak).encouragement} before midnight
                  </div>
                </div>

                <div className="row g-3 mb-4">
                  <div className="col-6">
                    <div className="glass-card rounded-4 p-3 text-center h-100">
                      <div className="text-white-50 small text-uppercase">Best Streak</div>
                      <div className="fs-2 fw-bold text-info">{Math.max(selectedStreak.bestStreak || 0, days)}</div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="glass-card rounded-4 p-3 text-center h-100">
                      <div className="text-white-50 small text-uppercase">Total Relapses</div>
                      <div className="fs-2 fw-bold text-danger">{selectedStreak.totalRelapses || 0}</div>
                    </div>
                  </div>
                </div>

                {/* Milestones */}
                <div className="glass-card rounded-4 p-4 mb-4">
                  <h6 className="fw-bold mb-3 text-uppercase text-white-50" style={{ letterSpacing: '1px' }}>Milestones</h6>
                  <div className="d-flex flex-column gap-2">
                    {MILESTONES.map(m => {
                      const achieved = days >= m.days;
                      const milestoneProgress = Math.min(100, (days / m.days) * 100);
                      const nextMilestone = !achieved && !MILESTONES.some(other => other.days < m.days && other.days > days);
                      return (
                        <div key={m.days} className="p-2 rounded-3" style={{ background: achieved || nextMilestone ? 'rgba(255,255,255,0.05)' : 'transparent', opacity: achieved || nextMilestone ? 1 : 0.55 }}>
                          <div className="d-flex align-items-center gap-3">
                          <div className="fs-3">{m.emoji}</div>
                          <div className="flex-grow-1">
                            <div className="fw-bold">{m.days} Days</div>
                            <div className="small text-white-50">
                              {achieved ? 'Milestone achieved' : `${days}/${m.days} ${getHabitCopy(selectedStreak).progressLabel}`}
                            </div>
                          </div>
                          {achieved && <i className="bi bi-check-circle-fill fs-5 text-success"></i>}
                          </div>
                          {!achieved && (
                            <div className="progress mt-2" style={{ height: '5px', background: 'rgba(255,255,255,0.1)' }}>
                              <div className="progress-bar" style={{ width: `${milestoneProgress}%`, background: m.color, boxShadow: nextMilestone ? `0 0 8px ${m.color}` : 'none' }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Relapse History */}
                <div className="glass-card rounded-4 p-4 mb-4">
                  <h6 className="fw-bold mb-3 text-uppercase text-white-50" style={{ letterSpacing: '1px' }}>Relapse History</h6>
                  {history.length === 0 ? (
                    <div className="text-center text-white-50 py-3">No relapses! Keep going strong. 🔥</div>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {history.slice().reverse().map((h, i) => (
                        <div key={i} className="p-3 rounded-3" style={{ background: 'rgba(255,107,107,0.1)', borderLeft: '4px solid #ff6b6b' }}>
                          <div className="d-flex justify-content-between mb-1">
                            <span className="fw-bold text-white">{new Date(h.date).toLocaleDateString()}</span>
                            <span className="badge bg-danger">{h.streakLength || h.length} days</span>
                          </div>
                          <div className="small text-white-50 mb-1"><i className="bi bi-lightning-charge"></i> Trigger: {h.trigger}</div>
                          {h.note && <div className="small fst-italic">"{h.note}"</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button 
                  className="btn btn-outline-danger w-100 rounded-pill fw-bold"
                  onClick={handleDelete}
                >
                  <i className="bi bi-trash3"></i> Delete Streak
                </button>
              </div>
            );
          })()}

          {activeView === 'add' && (
            <div className="animate-slide-up">
              <h4 className="fw-bold mb-4 text-center">Create New Streak</h4>
              
              <div className="glass-card rounded-4 p-4 mb-4">
                <form onSubmit={handleAddStreak}>
                  <div className="mb-4 text-center">
                    <div className="fs-1 mb-2">{newEmoji}</div>
                    <div className="d-flex flex-wrap justify-content-center gap-2 mb-3">
                      {EMOJIS.map(e => (
                        <div 
                          key={e} 
                          className="cursor-pointer hover-scale" 
                          style={{ fontSize: '1.5rem', opacity: newEmoji === e ? 1 : 0.5, transform: newEmoji === e ? 'scale(1.2)' : 'none' }}
                          onClick={() => setNewEmoji(e)}
                        >
                          {e}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label text-white-50 small fw-bold">STREAK NAME</label>
                    <input 
                      type="text" 
                      className="form-control bg-black bg-opacity-25 border-0 text-white shadow-none px-3 py-2 rounded-3"
                      placeholder="e.g. No Sugar"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="mb-4">
                    <label className="form-label text-white-50 small fw-bold">CATEGORY</label>
                    <div className="d-flex gap-2">
                      <button 
                        type="button"
                        className={`btn flex-grow-1 rounded-pill fw-bold ${newCategory === 'Breaking' ? 'btn-danger' : 'btn-outline-secondary'}`}
                        onClick={() => setNewCategory('Breaking')}
                      >
                        Breaking Bad Habit
                      </button>
                      <button 
                        type="button"
                        className={`btn flex-grow-1 rounded-pill fw-bold ${newCategory === 'Building' ? 'btn-success' : 'btn-outline-secondary'}`}
                        onClick={() => setNewCategory('Building')}
                      >
                        Building Good Habit
                      </button>
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    className="btn w-100 rounded-pill fw-bold text-black py-2"
                    style={{ background: '#00d4ff' }}
                    disabled={!newName.trim()}
                  >
                    Start Streak 🔥
                  </button>
                </form>
              </div>

              <h6 className="fw-bold mb-3 text-white-50 text-center">OR CHOOSE A TEMPLATE</h6>
              <div className="row g-2">
                {TEMPLATES.map(t => (
                  <div key={t.name} className="col-6">
                    <div 
                      className="glass-card template-card p-3 rounded-4 text-center cursor-pointer transition-all h-100"
                      onClick={() => {
                        setNewName(t.name);
                        setNewEmoji(t.emoji);
                        setNewCategory(t.category);
                      }}
                    >
                      <div className="fs-2 mb-1">{t.emoji}</div>
                      <div className="fw-bold small">{t.name}</div>
                      <div className="text-white-50" style={{ fontSize: '0.65rem' }}>{t.category}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>

      {showHabitScanner && (
        <HabitScannerModal
          streaks={streaks}
          updateStreak={updateStreak}
          recordRelapse={recordRelapse}
          onClose={() => setShowHabitScanner(false)}
        />
      )}

      {/* SOS Button */}
      <div className="sos-btn text-white" onClick={startSOS} title="Urge Surfing">
        <i className="bi bi-heart-pulse"></i>
      </div>

      {/* Relapse Modal Overlay */}
      {showRelapseModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 z-3 d-flex align-items-center justify-content-center p-3" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)' }}>
          <div className="glass-card rounded-4 p-4 w-100 max-width-container animate-slide-up position-relative">
            <button className="btn-close btn-close-white position-absolute top-0 end-0 m-3" onClick={() => setShowRelapseModal(false)}></button>
            
            {relapseMessage ? (
              <div className="text-center py-5">
                <div className="fs-1 mb-3">🌱</div>
                <h4 className="fw-bold text-white">{relapseMessage}</h4>
              </div>
            ) : (
              <>
                <h4 className="fw-bold text-danger text-center mb-1">Relapse</h4>
                <p className="text-center text-white-50 small mb-2">Are you sure? Your streak will reset to 0?</p>
                <div className="alert alert-danger bg-danger bg-opacity-10 border-danger text-danger-emphasis small text-center mb-4">
                  This will deduct <strong>{relapsePenalty} points</strong> from your balance.
                  <div className="text-danger-emphasis opacity-75">100 base + 20 per streak day</div>
                </div>
                
                <label className="form-label text-white-50 small fw-bold">WHAT TRIGGERED THIS?</label>
                <div className="d-flex flex-wrap gap-2 mb-4">
                  {TRIGGERS.map(t => (
                    <button 
                      key={t}
                      className={`btn btn-sm rounded-pill trigger-btn ${relapseTrigger === t ? 'active' : 'btn-outline-secondary text-white'}`}
                      onClick={() => setRelapseTrigger(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <label className="form-label text-white-50 small fw-bold">NOTES (OPTIONAL)</label>
                <textarea 
                  className="form-control bg-black bg-opacity-25 border-0 text-white shadow-none rounded-3 mb-4" 
                  rows="3"
                  placeholder="How are you feeling right now?"
                  value={relapseNote}
                  onChange={e => setRelapseNote(e.target.value)}
                ></textarea>

                <div className="d-flex gap-2">
                  <button className="btn btn-outline-light rounded-pill flex-grow-1 fw-bold" onClick={() => setShowRelapseModal(false)}>Cancel</button>
                  <button 
                    className="btn btn-danger rounded-pill flex-grow-1 fw-bold" 
                    onClick={confirmRelapse}
                    disabled={!relapseTrigger}
                  >
                    Reset Streak
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* SOS Timer Modal */}
      {showSOSTimer && (
        <div className="position-fixed top-0 start-0 w-100 h-100 z-3 d-flex flex-column align-items-center justify-content-center" style={{ background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)', backdropFilter: 'blur(10px)' }}>
          <button className="btn-close btn-close-white position-absolute top-0 end-0 m-4 fs-4" onClick={closeSOS}></button>
          
          <h3 className="fw-extrabold text-white mb-2">Urge Surfing</h3>
          <p className="text-white-50 mb-5">Ride the wave. It will pass.</p>

          <div className="breathe-circle mb-5 position-relative">
            <div className="position-absolute fs-1 fw-extrabold text-white" style={{ textShadow: '0 0 20px rgba(0,212,255,0.8)' }}>
              {formatTime(sosTimeLeft)}
            </div>
            {/* SVG Progress Ring */}
            <svg className="position-absolute" width="220" height="220">
              <circle stroke="rgba(255,255,255,0.1)" strokeWidth="6" fill="transparent" r="104" cx="110" cy="110" />
              <circle 
                className="progress-ring__circle"
                stroke="#00d4ff" 
                strokeWidth="6" 
                strokeLinecap="round"
                fill="transparent" 
                r="104" 
                cx="110" 
                cy="110"
                style={{
                  strokeDasharray: `${2 * Math.PI * 104}`,
                  strokeDashoffset: `${(2 * Math.PI * 104) * (1 - (sosTimeLeft / 600))}`
                }}
              />
            </svg>
          </div>

          <div className="text-center px-4" style={{ animation: 'pulseOpacity 4s infinite' }}>
            <h5 className="text-info fw-bold">{sosTimeLeft % 8 < 4 ? 'Breathe In...' : 'Breathe Out...'}</h5>
          </div>
        </div>
      )}

    </div>
  );
}
