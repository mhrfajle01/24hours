import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase/firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useSound } from '../contexts/SoundContext';

// --- OFFLINE SUPPORT HELPERS ---
const LS_KEY = 'shiftTracker_data';
const LS_QUEUE_KEY = 'shiftTracker_syncQueue';

const lsGet = (uid) => {
  try { const d = JSON.parse(localStorage.getItem(`${LS_KEY}_${uid}`)); return d || {}; } catch { return {}; }
};
const lsSave = (uid, data) => {
  try { localStorage.setItem(`${LS_KEY}_${uid}`, JSON.stringify(data)); } catch {}
};
const lsGetByDate = (uid, date) => {
  try { const d = JSON.parse(localStorage.getItem(`${LS_KEY}_${uid}_${date}`)); return d || null; } catch { return null; }
};
const lsSaveByDate = (uid, date, data) => {
  try { localStorage.setItem(`${LS_KEY}_${uid}_${date}`, JSON.stringify(data)); } catch {}
};
const queueSync = (uid, todayDoc, historyDoc, date, settingsDoc = null) => {
  try {
    const queue = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]');
    // If settingsDoc, replace existing settings queue item or merge
    let filtered;
    if (settingsDoc && !todayDoc && !historyDoc) {
      filtered = queue.filter(q => !(q.uid === uid && q.settingsDoc));
    } else {
      filtered = queue.filter(q => !(q.uid === uid && q.date === date));
    }
    filtered.push({ uid, date, todayDoc, historyDoc, settingsDoc, ts: Date.now() });
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(filtered));
  } catch {}
};
const flushSyncQueue = async () => {
  try {
    const queue = JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;
    const failed = [];
    for (const item of queue) {
      try {
        if (item.todayDoc) {
          await setDoc(doc(db, 'shiftTracker', item.uid), item.todayDoc, { merge: true });
        }
        if (item.historyDoc) {
          await setDoc(doc(db, 'shiftTracker', item.uid, 'history', item.date), item.historyDoc, { merge: true });
        }
        if (item.settingsDoc) {
          await setDoc(doc(db, 'shiftTracker', item.uid, 'settings', 'config'), item.settingsDoc, { merge: true });
        }
      } catch { failed.push(item); }
    }
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(failed));
  } catch {}
};

const SPRING = { type: 'spring', damping: 20, stiffness: 400 };

const BREAK_TYPES = [
  { id: 'tea', icon: '☕', label: 'Tea/Coffee', defaultMins: 10, color: '#D97706' },
  { id: 'lunch', icon: '🍽️', label: 'Lunch', defaultMins: 30, color: '#059669' },
  { id: 'walk', icon: '🚶', label: 'Walk', defaultMins: 15, color: '#2563EB' },
  { id: 'rest', icon: '🧘', label: 'Rest', defaultMins: 5, color: '#7C3AED' },
  { id: 'prayer', icon: '🕌', label: 'Prayer', defaultMins: 15, color: '#0891B2' },
  { id: 'personal', icon: '📱', label: 'Personal', defaultMins: 10, color: '#DC2626' },
];

const ZEN_QUOTES = [
  "Rest is not idleness. ✨",
  "Recharge to conquer more. 🔋",
  "A break today, better work tomorrow. 🌟",
  "Your mind needs rest to do its best. 🧠",
  "Breathe in calm, breathe out stress. 🌊",
  "Taking breaks is a sign of strength. 💪",
  "Pause. Reflect. Continue stronger. 🚀",
];

const fmtTime = (d) => {
  const bd = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka', hour12: false }).format(d);
  return bd; // returns HH:MM
};

const fmt12h = (t24) => {
  if (!t24) return '';
  const [h, m] = t24.split(':');
  let hh = parseInt(h, 10);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${m} ${ampm}`;
};

const timeToMinutes = (t24) => {
  if (!t24) return 0;
  const [h, m] = t24.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};

const minsToTime = (totalMinutes) => {
  const norm = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(norm / 60)).padStart(2, '0');
  const mm = String(norm % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

const formatStopwatch = (totalSeconds) => {
  const isNeg = totalSeconds < 0;
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${isNeg ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const calcBlockBreakMins = (block, history) => {
  const bStart = timeToMinutes(block.start);
  const bEnd = timeToMinutes(block.end);
  let mins = 0;
  (history || []).forEach(brk => {
    if (!brk.startMs) return;
    const s = new Date(brk.startMs);
    const e = brk.endMs ? new Date(brk.endMs) : new Date();
    const sMin = s.getHours() * 60 + s.getMinutes();
    const eMin = e.getHours() * 60 + e.getMinutes();
    const os = Math.max(bStart, sMin);
    const oe = Math.min(bEnd, eMin);
    if (oe > os) mins += oe - os;
  });
  return mins;
};

const DEFAULT_MISSED_REASONS = [
  'Machine breakdown / Stoppage',
  'Material / Supply delay',
  'Power / Network interruption',
  'Rework / Quality inspection',
  'Meeting / Shift handover',
  'Shortage of manpower'
];

function exportCSV(data, date) {
  const rows = [['Block', 'Time', 'Type', 'Target', 'Actual', 'Cumulative', 'Status', 'Missed Reason']];
  data.blocks.forEach((b, i) => {
    rows.push([
      i + 1,
      `${fmt12h(b.start)} - ${fmt12h(b.end)}`,
      b.isBreak ? 'Break' : 'Work',
      b.isBreak ? 0 : b.target.toFixed(1),
      b.actual || 0,
      b.cumulative || 0,
      b.isBreak ? '-' : (b.logged ? (b.actual >= b.target ? 'On Target' : 'Behind') : 'Not Logged'),
      b.missReason ? `"${b.missReason.replace(/"/g, '""')}"` : ''
    ]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shift_report_${date}.csv`;
  a.click();
}

// --- Realistic StarMaker-Style Emote Animation (Narrow Snake Tour + 2s Transparent Character + Auto-Fade) ---
const StarMakerEmote = ({ type, onComplete }) => {
  const isSuccess = type === 'achieved';
  const [stage, setStage] = useState('snake'); // 'snake' (0 - 400ms) -> 'character' (400ms - 2000ms) -> 'hidden'

  useEffect(() => {
    // Stage 1: Quick energetic perimeter snake loop (400ms)
    const t1 = setTimeout(() => {
      setStage('character');
    }, 400);

    // Stage 2: Character stays visible for 1.6s (total exactly 2.0s from start)
    const t2 = setTimeout(() => {
      setStage('hidden');
      onComplete();
    }, 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (stage === 'hidden') return null;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 40, overflow: 'visible', borderRadius: 16 }}>
      {/* STAGE 1: Narrow Neon Glowing Snake Orbit (0.4s fast tour) */}
      {stage === 'snake' && (
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id={isSuccess ? "snakeBeamGlowOk" : "snakeBeamGlowMiss"} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={isSuccess ? "#22C55E" : "#EF4444"} stopOpacity="0" />
              <stop offset="70%" stopColor={isSuccess ? "#4ADE80" : "#F87171"} stopOpacity="0.9" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
            </linearGradient>
            <filter id="laserGlowBlur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            x="1.5" y="1.5" width="calc(100% - 3px)" height="calc(100% - 3px)" rx="15" ry="15"
            fill="none"
            stroke={`url(#${isSuccess ? "snakeBeamGlowOk" : "snakeBeamGlowMiss"})`}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="90 700"
            filter="url(#laserGlowBlur)"
            style={{ animation: 'snakeTourOnce 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}
          />
        </svg>
      )}

      {/* STAGE 2: 3D Transparent Floating Badge (Positioned at TOP RIGHT above card so target numbers stay 100% visible) */}
      <AnimatePresence>
        {stage === 'character' && (
          <motion.div
            initial={{ scale: 0.1, y: 10, opacity: 0 }}
            animate={{ scale: [0.1, 1.15, 1], y: -26, opacity: 1 }}
            exit={{ scale: 0.4, y: -40, opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', damping: 12, stiffness: 300 }}
            style={{
              position: 'absolute',
              right: 12,
              top: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              padding: '4px 10px 4px 6px',
              borderRadius: 24,
              boxShadow: isSuccess
                ? '0 8px 24px rgba(34, 197, 94, 0.35), 0 2px 6px rgba(0,0,0,0.08)'
                : '0 8px 24px rgba(239, 68, 68, 0.35), 0 2px 6px rgba(0,0,0,0.08)',
              border: `1.5px solid ${isSuccess ? '#22C55E' : '#EF4444'}`,
            }}
          >
            <BlockFeedbackCharacter isSuccess={isSuccess} size={36} />
            <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
              <div style={{
                fontSize: 11, fontWeight: 900, letterSpacing: 0.4,
                color: isSuccess ? '#15803D' : '#991B1B'
              }}>
                {isSuccess ? 'TARGET HIT! 🌟' : 'MISSED 💔'}
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: '#64748B' }}>
                {isSuccess ? 'Bravo! 👏' : 'Keep going! 💪'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes snakeTourOnce {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -790; }
        }
      `}</style>
    </div>
  );
};

// --- 3D Cartoon Feedback Character (High-Fidelity Realistic StarMaker Clap & Cry) ---
const BlockFeedbackCharacter = ({ isSuccess, size = 44 }) => {
  return (
    <motion.div
      initial={{ scale: 0, rotate: isSuccess ? -15 : 15 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', damping: 10, stiffness: 280 }}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: isSuccess
          ? 'drop-shadow(0 4px 10px rgba(34,197,94,0.5))'
          : 'drop-shadow(0 4px 10px rgba(239,68,68,0.5))'
      }}
      title={isSuccess ? "Target Achieved! 🎉" : "Target Missed 😢"}
    >
      {isSuccess ? (
        // 3D Cartoon Clapping Character with realistic hand-meeting claps, sound waves & particle bursts
        <motion.svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 0.45, repeat: Infinity, ease: 'easeInOut' }}
        >
          <defs>
            <radialGradient id="gradHappyHead" cx="30%" cy="25%" r="75%">
              <stop offset="0%" stopColor="#BBF7D0" />
              <stop offset="45%" stopColor="#22C55E" />
              <stop offset="100%" stopColor="#14532D" />
            </radialGradient>
            <radialGradient id="gradHand" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#DCFCE7" />
              <stop offset="100%" stopColor="#16A34A" />
            </radialGradient>
            <linearGradient id="gradCrown" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="50%" stopColor="#EAB308" />
              <stop offset="100%" stopColor="#CA8A04" />
            </linearGradient>
          </defs>

          {/* Golden Star Headband */}
          <polygon points="32,5 35,12 42,13 37,18 39,24 32,20 25,24 27,18 22,13 29,12" fill="url(#gradCrown)" />

          {/* 3D Head Sphere */}
          <circle cx="32" cy="34" r="21" fill="url(#gradHappyHead)" />
          {/* Specular Highlight */}
          <ellipse cx="25" cy="22" rx="6" ry="3" fill="#FFFFFF" opacity="0.65" transform="rotate(-30 25 22)" />

          {/* Expressive Arch Eyes (Joyful) */}
          <path d="M 21 30 Q 25 22 29 30" fill="none" stroke="#052E16" strokeWidth="3" strokeLinecap="round" />
          <path d="M 35 30 Q 39 22 43 30" fill="none" stroke="#052E16" strokeWidth="3" strokeLinecap="round" />

          {/* Rosy Cheeks */}
          <ellipse cx="19" cy="35" rx="3.5" ry="2" fill="#F472B6" opacity="0.85" />
          <ellipse cx="45" cy="35" rx="3.5" ry="2" fill="#F472B6" opacity="0.85" />

          {/* Open Joyful Smile */}
          <path d="M 26 36 Q 32 46 38 36 Z" fill="#7F1D1D" />
          <path d="M 29 41 Q 32 46 35 41 Z" fill="#FB7185" />

          {/* Clap Impact Sparkle (flashes when hands meet) */}
          <motion.polygon
            points="32,44 34,48 38,49 35,52 36,56 32,53 28,56 29,52 26,49 30,48"
            fill="#FACC15"
            animate={{ scale: [0, 1.3, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 0.35, repeat: Infinity, ease: 'easeOut' }}
          />

          {/* Realistic Clapping Hands (Left & Right meeting in center) */}
          <motion.g
            animate={{ x: [0, 8, 0], rotate: [-18, 8, -18] }}
            transition={{ duration: 0.35, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ellipse cx="18" cy="49" rx="6.5" ry="5" fill="url(#gradHand)" stroke="#15803D" strokeWidth="1.2" />
            <circle cx="16" cy="46" r="2.2" fill="url(#gradHand)" />
          </motion.g>
          <motion.g
            animate={{ x: [0, -8, 0], rotate: [18, -8, 18] }}
            transition={{ duration: 0.35, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ellipse cx="46" cy="49" rx="6.5" ry="5" fill="url(#gradHand)" stroke="#15803D" strokeWidth="1.2" />
            <circle cx="48" cy="46" r="2.2" fill="url(#gradHand)" />
          </motion.g>
        </motion.svg>
      ) : (
        // 3D Cartoon Crying Character with high-speed shivering, streaming tears & animated water splash
        <motion.svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          animate={{ x: [-2, 2, -1, 1, 0] }}
          transition={{ duration: 0.18, repeat: Infinity }}
        >
          <defs>
            <radialGradient id="gradSadHead" cx="30%" cy="25%" r="75%">
              <stop offset="0%" stopColor="#FECACA" />
              <stop offset="45%" stopColor="#EF4444" />
              <stop offset="100%" stopColor="#7F1D1D" />
            </radialGradient>
            <linearGradient id="gradTearStream" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#A5F3FC" />
              <stop offset="50%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#0284C7" />
            </linearGradient>
          </defs>

          {/* 3D Sad Head Sphere */}
          <circle cx="32" cy="34" r="21" fill="url(#gradSadHead)" />
          {/* Specular Highlight */}
          <ellipse cx="25" cy="22" rx="5.5" ry="2.8" fill="#FFFFFF" opacity="0.6" transform="rotate(-30 25 22)" />

          {/* Slanted Sad Eyebrows */}
          <path d="M 20 23 Q 24 28 28 26" fill="none" stroke="#450A0A" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 44 23 Q 40 28 36 26" fill="none" stroke="#450A0A" strokeWidth="2.5" strokeLinecap="round" />

          {/* Big Teary Eyes */}
          <circle cx="24" cy="31" r="5" fill="#0F172A" />
          <circle cx="40" cy="31" r="5" fill="#0F172A" />
          <circle cx="22.5" cy="29.5" r="2" fill="#FFFFFF" />
          <circle cx="38.5" cy="29.5" r="2" fill="#FFFFFF" />

          {/* Trembling Wavy Downward Frown */}
          <path d="M 25 43 Q 32 38 39 43" fill="none" stroke="#450A0A" strokeWidth="2.8" strokeLinecap="round" />

          {/* Gushing Falling Animated Teardrops (Continuous streaming fountain) */}
          <motion.path
            d="M 21 34 Q 19 44 18 50 Q 23 50 23 42 Z"
            fill="url(#gradTearStream)"
            animate={{ y: [0, 8, 16], opacity: [1, 1, 0], scaleY: [0.7, 1.3, 0.4] }}
            transition={{ duration: 0.45, repeat: Infinity, ease: 'easeIn' }}
          />
          <motion.path
            d="M 43 34 Q 45 44 46 50 Q 41 50 41 42 Z"
            fill="url(#gradTearStream)"
            animate={{ y: [0, 8, 16], opacity: [1, 1, 0], scaleY: [0.7, 1.3, 0.4] }}
            transition={{ duration: 0.45, repeat: Infinity, ease: 'easeIn', delay: 0.15 }}
          />

          {/* Water Splash Droplets on Bottom */}
          <motion.circle
            cx="17" cy="54" r="2" fill="#38BDF8"
            animate={{ scale: [0.5, 1.5, 0], y: [0, -3, 2] }}
            transition={{ duration: 0.45, repeat: Infinity }}
          />
          <motion.circle
            cx="47" cy="54" r="2" fill="#38BDF8"
            animate={{ scale: [0.5, 1.5, 0], y: [0, -3, 2] }}
            transition={{ duration: 0.45, repeat: Infinity, delay: 0.15 }}
          />
        </motion.svg>
      )}
    </motion.div>
  );
};

// --- Confetti Celebration Component ---
const BreakCelebration = ({ breakTypeId, durationMins, onComplete }) => {
  const type = BREAK_TYPES.find(t => t.id === breakTypeId) || BREAK_TYPES[0];
  const confettiColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>

      {/* Confetti particles */}
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div key={i}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{
            x: (Math.random() - 0.5) * 400,
            y: (Math.random() - 0.5) * 600 + 200,
            scale: [0, 1, 0.5],
            opacity: [1, 1, 0],
            rotate: Math.random() * 720
          }}
          transition={{ duration: 2 + Math.random(), ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: 8 + Math.random() * 8,
            height: 8 + Math.random() * 8,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            background: confettiColors[i % confettiColors.length],
          }}
        />
      ))}

      {/* Center celebration */}
      <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 10, stiffness: 200 }}
        style={{ textAlign: 'center', zIndex: 1 }}>
        <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, repeat: 2 }}
          style={{ fontSize: 72, marginBottom: 16 }}>{type.icon}</motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
          style={{ fontSize: 28, fontWeight: 800, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>Great Break! 🎉</motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: -30, opacity: [0, 1, 1, 0] }} transition={{ delay: 0.5, duration: 2 }}
          style={{ fontSize: 18, fontWeight: 700, color: '#58CC02', marginTop: 8 }}>+{durationMins}m recharged!</motion.div>
      </motion.div>
    </motion.div>
  );
};

// --- Break Timeline Component ---
const BreakTimeline = ({ shiftStartTime, shiftEndTime, breakHistory, currentTime }) => {
  const shiftStartMin = timeToMinutes(shiftStartTime);
  const shiftEndMin = timeToMinutes(shiftEndTime);
  const totalMin = shiftEndMin - shiftStartMin;
  if (totalMin <= 0) return null;
  const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes();
  const nowPct = Math.min(100, Math.max(0, ((nowMin - shiftStartMin) / totalMin) * 100));

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 8, letterSpacing: 1 }}>SHIFT TIMELINE</div>
      <div style={{ position: 'relative', height: 32, background: '#E8F4FD', borderRadius: 16, overflow: 'hidden' }}>
        {/* Work background */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(90deg, #DBEAFE, #E8F4FD)', borderRadius: 16 }} />

        {/* Break segments */}
        {breakHistory.filter(b => b.endMs).map((brk, i) => {
          const brkStartMin = new Date(brk.startMs).getHours() * 60 + new Date(brk.startMs).getMinutes();
          const brkEndMin = new Date(brk.endMs).getHours() * 60 + new Date(brk.endMs).getMinutes();
          const left = Math.max(0, ((brkStartMin - shiftStartMin) / totalMin) * 100);
          const width = Math.max(0, ((brkEndMin - brkStartMin) / totalMin) * 100);
          const bType = BREAK_TYPES.find(t => t.id === brk.type);
          return (
            <motion.div key={i} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: i * 0.1, type: 'spring' }}
              style={{ position: 'absolute', top: 2, bottom: 2, left: `${left}%`, width: `${width}%`, background: bType?.color || '#FFB020', borderRadius: 12, opacity: 0.85, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, transformOrigin: 'left' }}>
              {width > 3 && (bType?.icon || '☕')}
            </motion.div>
          );
        })}

        {/* Current position marker */}
        <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
          style={{ position: 'absolute', top: -4, bottom: -4, left: `${nowPct}%`, width: 3, background: '#1CB0F6', borderRadius: 4, boxShadow: '0 0 8px rgba(28,176,246,0.5)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginTop: 4 }}>
        <span>{fmt12h(shiftStartTime)}</span>
        <span>{fmt12h(shiftEndTime)}</span>
      </div>
    </div>
  );
};


// --- Limited edit panel for running shift (preserves logged blocks) ---
const ShiftQuickEdit = ({ target, unit, shiftStart, shiftEnd, onApply }) => {
  const [open, setOpen] = React.useState(false);
  const [t, setT] = React.useState(target);
  const [u, setU] = React.useState(unit);
  const [s, setS] = React.useState(shiftStart);
  const [e, setE] = React.useState(shiftEnd);
  const [errorMsg, setErrorMsg] = React.useState('');

  React.useEffect(() => {
    setT(target);
    setU(unit);
    setS(shiftStart);
    setE(shiftEnd);
    setErrorMsg('');
  }, [target, unit, shiftStart, shiftEnd, open]);

  const handleApply = () => {
    if (!s || !e) {
      setErrorMsg('Please specify both shift start and end time.');
      return;
    }
    const startMin = timeToMinutes(s);
    const endMin = timeToMinutes(e);
    if (endMin <= startMin) {
      setErrorMsg('Shift end time must be later than start time.');
      return;
    }
    const numTarget = Number(t);
    if (isNaN(numTarget) || numTarget < 0) {
      setErrorMsg('Target must be a non-negative number.');
      return;
    }
    setErrorMsg('');
    onApply(numTarget, u || 'pieces', s, e);
    setOpen(false);
  };

  const inp = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, width: '100%', boxSizing: 'border-box' };

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(p => !p)}
        style={{ width: '100%', padding: 12, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span>✏️</span> <span>Quick Edit (Target / Unit / Times)</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: 14, background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>
            ⚠️ All logged block numbers are preserved. Adjusting shift times logically expands, trims, or redistributes targets across blocks.
          </div>
          {errorMsg && (
            <div style={{ fontSize: 12, color: '#EF4444', fontWeight: 700, background: '#FEE2E2', padding: '6px 10px', borderRadius: 8 }}>
              {errorMsg}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Target
              <input type="number" min="0" value={t} onChange={ev => { setT(ev.target.value); setErrorMsg(''); }} style={{ ...inp, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Unit
              <input type="text" value={u} onChange={ev => { setU(ev.target.value); setErrorMsg(''); }} style={{ ...inp, marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Shift Start
              <input type="time" value={s} onChange={ev => { setS(ev.target.value); setErrorMsg(''); }} style={{ ...inp, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Shift End
              <input type="time" value={e} onChange={ev => { setE(ev.target.value); setErrorMsg(''); }} style={{ ...inp, marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOpen(false)} style={{ flex: 1, padding: 10, background: '#f0f0f0', border: 'none', borderRadius: 10, fontWeight: 700, color: '#666', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleApply}
              style={{ flex: 2, padding: 10, background: '#1CB0F6', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Apply Changes</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function ShiftTrackerPage({ currentUser, onBack, onOpenReports, onOpenBypassTracker }) {
  const { playSound } = useSound();

  // Settings
  const [target, setTarget] = useState(() => {
    return Number(localStorage.getItem('shiftTracker_defaultTarget')) || 100;
  });
  const [unit, setUnit] = useState('pieces');
  const [shiftStart, setShiftStart] = useState(() => {
    return localStorage.getItem('shiftTracker_defaultStart') || '09:00';
  });
  const [shiftEnd, setShiftEnd] = useState(() => {
    return localStorage.getItem('shiftTracker_defaultEnd') || '17:00';
  });
  const [shiftSlots, setShiftSlots] = useState([]);
  const [blockLen, setBlockLen] = useState(60);
  const [scheduledBreaks, setScheduledBreaks] = useState([]);

  const [setupMode, setSetupMode] = useState(true);

  // Live Block State
  const [blocks, setBlocks] = useState([]);
  const [now, setNow] = useState(new Date());

  const currTimeStr = fmtTime(now);
  const currentBlockIdx = blocks.findIndex(b => currTimeStr >= b.start && currTimeStr < b.end);
  const currentBlock = currentBlockIdx >= 0 ? blocks[currentBlockIdx] : null;

  const [earnedBreak, setEarnedBreak] = useState(0);
  const [earnedBreakReason, setEarnedBreakReason] = useState('');

  // --- DIGITAL CLOCK & BREAK SYSTEM STATE ---
  const [clockStatus, setClockStatus] = useState('idle'); // idle, active, break
  const [shiftStartMs, setShiftStartMs] = useState(null);
  const [totalAccumulatedMs, setTotalAccumulatedMs] = useState(0);

  const [breakStartMs, setBreakStartMs] = useState(null);
  const [breakDurationMs, setBreakDurationMs] = useState(0);

  const [elapsedShiftSec, setElapsedShiftSec] = useState(0);
  const [breakRemainingSec, setBreakRemainingSec] = useState(0);
  const [breakProgress, setBreakProgress] = useState(0);

  const [showBreakOptions, setShowBreakOptions] = useState(false);
  const [customBreakMins, setCustomBreakMins] = useState(30);
  const [scheduledBreakPrompt, setScheduledBreakPrompt] = useState(null); // prompt when scheduled break ends: { blockId, label, end }

  // --- ENHANCED BREAK STATE ---
  const [breakType, setBreakType] = useState(null); // current break type id
  const [selectedBreakType, setSelectedBreakType] = useState(null); // type being selected in picker
  const [selectedBreakMins, setSelectedBreakMins] = useState(15); // duration being adjusted in picker
  const [totalBreakAccumulatedMs, setTotalBreakAccumulatedMs] = useState(0);
  const [breakHistory, setBreakHistory] = useState([]); // array of { type, startMs, endMs, durationMs, plannedMs }
  const [breakNudgeLevel, setBreakNudgeLevel] = useState(0);
  const [showBreakCelebration, setShowBreakCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ type: 'tea', mins: 10 });
  const [showBreakInsights, setShowBreakInsights] = useState(false);
  const [zenQuoteIdx, setZenQuoteIdx] = useState(0);

  // --- OFF-DAY / LEAVE / HOLIDAY SYSTEM ---
  const [dayType, setDayType] = useState('work'); // 'work' | 'off' | 'leave' | 'holiday'
  const [dayTypeNote, setDayTypeNote] = useState(''); // optional note (e.g. holiday name, leave reason)
  const [weeklyOffDays, setWeeklyOffDays] = useState(() => {
    try { return JSON.parse(localStorage.getItem('shiftTracker_weeklyOffDays')) || [0]; } catch { return [0]; }
  });
  const [markedDays, setMarkedDays] = useState(() => {
    try { return JSON.parse(localStorage.getItem('shiftTracker_markedDays')) || {}; } catch { return {}; }
  });

  // Active StarMaker emote trigger state: { blockId, type: 'achieved' | 'missed' }
  const [activeEmote, setActiveEmote] = useState(null);

  // --- PHASE 2: PRODUCTION TARGET ENGINE (Monthly -> Weekly -> Daily Auto-Suggest) ---
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [monthlyTarget, setMonthlyTarget] = useState(() => {
    return Number(localStorage.getItem('shiftTracker_monthlyTarget')) || 2600;
  });
  const [monthlyWorkDays, setMonthlyWorkDays] = useState(() => {
    return Number(localStorage.getItem('shiftTracker_monthlyWorkDays')) || 26;
  });
  const [productionUnit, setProductionUnit] = useState(() => {
    return localStorage.getItem('shiftTracker_productionUnit') || 'pieces';
  });
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [monthlyHistoryLoading, setMonthlyHistoryLoading] = useState(false);

  // Custom Modal State
  const [customAlert, setCustomAlert] = useState({ isOpen: false, type: 'confirm', title: '', message: '', onConfirm: null });
  const shiftEndPromptedRef = useRef(false);
  // ----------------------------------------------

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState('shortcuts'); // 'shortcuts' | 'defaults' | 'nudge'
  const [autoAdvance, setAutoAdvance] = useState(() => {
    return localStorage.getItem('shiftTracker_autoAdvance') !== 'false';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('shiftTracker_sound') !== 'false';
  });

  // Default shift templates
  const [defaultShiftTarget, setDefaultShiftTarget] = useState(() => {
    return Number(localStorage.getItem('shiftTracker_defaultTarget')) || 100;
  });
  const [defaultShiftStart, setDefaultShiftStart] = useState(() => {
    return localStorage.getItem('shiftTracker_defaultStart') || '09:00';
  });
  const [defaultShiftEnd, setDefaultShiftEnd] = useState(() => {
    return localStorage.getItem('shiftTracker_defaultEnd') || '17:00';
  });

  // Preset chips for missed block reasons
  const [customMissedReasons, setCustomMissedReasons] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('shiftTracker_missedReasons'));
      return Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_MISSED_REASONS;
    } catch {
      return DEFAULT_MISSED_REASONS;
    }
  });
  const [newReasonInput, setNewReasonInput] = useState('');

  // Keyboard shortcut configuration state (locally configurable)
  const DEFAULT_KEYBINDINGS = {
    takeBreak: 'b',
    endBreak: 'e',
    focusBlock: 'f',
    toggleClock: 'c',
    openSettings: 's'
  };
  const [keybindings, setKeybindings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('shiftTracker_keybindings'));
      return saved || DEFAULT_KEYBINDINGS;
    } catch {
      return DEFAULT_KEYBINDINGS;
    }
  });

  const blockInputRefs = useRef({});

  // Sync Shift Tracker global settings (offdays, markedDays, defaults) to Firestore
  const saveShiftSettings = useCallback((updatedSettings = {}) => {
    if (!currentUser?.uid) return;
    const settingsPayload = {
      weeklyOffDays: updatedSettings.weeklyOffDays ?? weeklyOffDays,
      markedDays: updatedSettings.markedDays ?? markedDays,
      defaultTarget: updatedSettings.defaultShiftTarget ?? defaultShiftTarget,
      defaultStart: updatedSettings.defaultShiftStart ?? defaultShiftStart,
      defaultEnd: updatedSettings.defaultShiftEnd ?? defaultShiftEnd,
      monthlyTarget: updatedSettings.monthlyTarget ?? monthlyTarget,
      monthlyWorkDays: updatedSettings.monthlyWorkDays ?? monthlyWorkDays,
      productionUnit: updatedSettings.productionUnit ?? productionUnit,
      autoAdvance: updatedSettings.autoAdvance ?? autoAdvance,
      sound: updatedSettings.soundEnabled ?? soundEnabled,
      missedReasons: updatedSettings.customMissedReasons ?? customMissedReasons,
      keybindings: updatedSettings.keybindings ?? keybindings,
      updatedAt: Date.now()
    };

    queueSync(currentUser.uid, null, null, null, settingsPayload);
    if (navigator.onLine && !syncingRef.current) {
      syncingRef.current = true;
      flushSyncQueue().finally(() => { syncingRef.current = false; });
    }
  }, [
    currentUser?.uid, weeklyOffDays, markedDays,
    defaultShiftTarget, defaultShiftStart, defaultShiftEnd,
    monthlyTarget, monthlyWorkDays, productionUnit,
    autoAdvance, soundEnabled, customMissedReasons, keybindings
  ]);

  // Global Keyboard Listener (mouse-free production workflow)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      // 1. Enter key navigation inside block input
      if (e.key === 'Enter' && isInputFocused) {
        const activeName = document.activeElement?.getAttribute('data-block-idx');
        if (activeName !== null && activeName !== undefined) {
          const idx = parseInt(activeName, 10);
          const val = document.activeElement.value;
          if (val) {
            const result = logCumulative(idx, val);
            // If target was missed and requires inline reason, do not auto-advance focus
            if (result && result.needsReason) {
              return;
            }
          }
          // Automatically advance focus to the next available unlogged work block
          if (autoAdvance) {
            const nextBlock = blocks.find((blk, i) => i > idx && !blk.isBreak && !blk.logged);
            if (nextBlock && blockInputRefs.current[nextBlock.id]) {
              blockInputRefs.current[nextBlock.id].focus();
            } else {
              document.activeElement.blur();
            }
          }
        }
        return;
      }

      // Do not trigger general single-letter shortcuts when user is typing into any form field
      if (isInputFocused) return;

      const key = e.key.toLowerCase();

      // Focus active / first unlogged block input
      if (key === keybindings.focusBlock?.toLowerCase()) {
        e.preventDefault();
        const targetBlock = blocks.find((blk, i) => (i === currentBlockIdx || (!blk.isBreak && !blk.logged)));
        if (targetBlock && blockInputRefs.current[targetBlock.id]) {
          blockInputRefs.current[targetBlock.id].focus();
        }
        return;
      }

      // Take Break shortcut
      if (key === keybindings.takeBreak?.toLowerCase()) {
        if (clockStatus === 'active') {
          e.preventDefault();
          setShowBreakOptions(prev => !prev);
        }
        return;
      }

      // End Break shortcut
      if (key === keybindings.endBreak?.toLowerCase()) {
        if (clockStatus === 'break') {
          e.preventDefault();
          handleEndBreak();
        }
        return;
      }

      // Clock In / Clock Out
      if (key === keybindings.toggleClock?.toLowerCase()) {
        e.preventDefault();
        if (clockStatus === 'idle') handleClockIn();
        else if (clockStatus === 'active') handleClockOut();
        return;
      }

      // Open Shift Settings
      if (key === keybindings.openSettings?.toLowerCase()) {
        e.preventDefault();
        setShowSettingsModal(prev => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keybindings, clockStatus, blocks, currentBlockIdx]);

  // Date selection — fixed to BD/Dhaka timezone (UTC+6)
  const getBDDateStr = (offsetDays = 0) => {
    const d = new Date(Date.now() + 6 * 3600000 + offsetDays * 86400000);
    return d.toISOString().split('T')[0];
  };
  const todayStr = getBDDateStr(0);
  const yesterdayStr = getBDDateStr(-1);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isToday = selectedDate === todayStr;

  const docRef = currentUser?.uid ? doc(db, 'shiftTracker', currentUser.uid) : null;

  // --- Break budget calculations ---
  const activeSlots = shiftSlots && shiftSlots.length > 0 
    ? shiftSlots.filter(s => s.start && s.end && timeToMinutes(s.start) < timeToMinutes(s.end))
    : [{ start: shiftStart, end: shiftEnd }];

  const effectiveShiftStart = activeSlots.length > 0 ? activeSlots[0].start : shiftStart;
  const effectiveShiftEnd = activeSlots.length > 0 ? activeSlots[activeSlots.length - 1].end : shiftEnd;

  const getShiftDurationHrs = () => {
    if (activeSlots.length > 1) {
      const totalMins = activeSlots.reduce((acc, slot) => {
        return acc + Math.max(0, timeToMinutes(slot.end) - timeToMinutes(slot.start));
      }, 0);
      return totalMins / 60;
    }
    const diffMins = Math.max(0, timeToMinutes(shiftEnd) - timeToMinutes(shiftStart));
    return diffMins / 60;
  };
  const breakBudgetMins = getShiftDurationHrs() <= 6 ? 30 : getShiftDurationHrs() <= 8 ? 60 : 90;
  const breakUsedMins = Math.floor(totalBreakAccumulatedMs / 60000);
  const breakBudgetPct = breakBudgetMins > 0 ? Math.min((breakUsedMins / breakBudgetMins) * 100, 150) : 0;
  const budgetColor = breakBudgetPct <= 50 ? '#10B981' : breakBudgetPct <= 75 ? '#F59E0B' : breakBudgetPct <= 100 ? '#F97316' : '#EF4444';

  // Current break type object
  const currentBreakType = BREAK_TYPES.find(t => t.id === breakType) || BREAK_TYPES[0];

  // --- Zen quote rotation ---
  useEffect(() => {
    if (clockStatus !== 'break') return;
    const interval = setInterval(() => {
      setZenQuoteIdx(prev => (prev + 1) % ZEN_QUOTES.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [clockStatus]);

  // --- ONLINE STATUS ---
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const syncingRef = useRef(false);

  useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true);
      if (!syncingRef.current) {
        syncingRef.current = true;
        await flushSyncQueue();
        syncingRef.current = false;
      }
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Flush on mount if online
    if (navigator.onLine) { flushSyncQueue(); }
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  const applyData = (d) => {
    setTarget(d.target || 100);
    setUnit(d.unit || 'pieces');
    setShiftStart(d.shiftStart || '09:00');
    setShiftEnd(d.shiftEnd || '17:00');
    if (d.shiftSlots) setShiftSlots(d.shiftSlots);
    setBlockLen(d.blockLen || 60);
    if (d.scheduledBreaks) setScheduledBreaks(d.scheduledBreaks);
    if (Array.isArray(d.missedReasons) && d.missedReasons.length > 0) {
      setCustomMissedReasons(d.missedReasons);
      try { localStorage.setItem('shiftTracker_missedReasons', JSON.stringify(d.missedReasons)); } catch {}
    }
    setBlocks(d.blocks || []);
    if (d.blocks && d.blocks.length > 0) setSetupMode(false);
    if (d.clockStatus) setClockStatus(d.clockStatus);
    if (d.shiftStartMs) setShiftStartMs(d.shiftStartMs);
    if (d.totalAccumulatedMs) setTotalAccumulatedMs(d.totalAccumulatedMs);
    if (d.breakStartMs) setBreakStartMs(d.breakStartMs);
    if (d.breakDurationMs) setBreakDurationMs(d.breakDurationMs);
    if (d.earnedBreak) setEarnedBreak(d.earnedBreak);
    if (d.earnedBreakReason) setEarnedBreakReason(d.earnedBreakReason);
    if (d.totalBreakAccumulatedMs) setTotalBreakAccumulatedMs(d.totalBreakAccumulatedMs);
    if (d.breakHistory) setBreakHistory(d.breakHistory);
    if (d.breakType) setBreakType(d.breakType);

    // Prioritize markedDays for date or fallback to saved dayType
    const marked = markedDays[selectedDate];
    if (marked) {
      const dt = typeof marked === 'string' ? { type: marked, note: '' } : marked;
      setDayType(dt.type);
      setDayTypeNote(dt.note || '');
    } else if (d.dayType) {
      setDayType(d.dayType);
      setDayTypeNote(d.dayTypeNote || '');
    } else {
      const dt = getDayTypeForDateRef.current ? getDayTypeForDateRef.current(selectedDate) : { type: 'work', note: '' };
      setDayType(dt.type);
      setDayTypeNote(dt.note || '');
    }
  };

  useEffect(() => {
    if (!currentUser?.uid) return;

    const loadData = async () => {
      // 0. Fetch global shift tracker settings (offdays, markedDays, defaults) if online
      if (navigator.onLine) {
        try {
          const cfgSnap = await getDoc(doc(db, 'shiftTracker', currentUser.uid, 'settings', 'config'));
          if (cfgSnap.exists()) {
            const cfg = cfgSnap.data();
            if (Array.isArray(cfg.weeklyOffDays)) {
              setWeeklyOffDays(cfg.weeklyOffDays);
              try { localStorage.setItem('shiftTracker_weeklyOffDays', JSON.stringify(cfg.weeklyOffDays)); } catch {}
            }
            if (cfg.markedDays && typeof cfg.markedDays === 'object') {
              setMarkedDays(cfg.markedDays);
              try { localStorage.setItem('shiftTracker_markedDays', JSON.stringify(cfg.markedDays)); } catch {}
            }
            if (cfg.defaultTarget) {
              setDefaultShiftTarget(cfg.defaultTarget);
              try { localStorage.setItem('shiftTracker_defaultTarget', String(cfg.defaultTarget)); } catch {}
            }
            if (cfg.defaultStart) {
              setDefaultShiftStart(cfg.defaultStart);
              try { localStorage.setItem('shiftTracker_defaultStart', cfg.defaultStart); } catch {}
            }
            if (cfg.defaultEnd) {
              setDefaultShiftEnd(cfg.defaultEnd);
              try { localStorage.setItem('shiftTracker_defaultEnd', cfg.defaultEnd); } catch {}
            }
            if (cfg.monthlyTarget) {
              setMonthlyTarget(cfg.monthlyTarget);
              try { localStorage.setItem('shiftTracker_monthlyTarget', String(cfg.monthlyTarget)); } catch {}
            }
            if (cfg.monthlyWorkDays) {
              setMonthlyWorkDays(cfg.monthlyWorkDays);
              try { localStorage.setItem('shiftTracker_monthlyWorkDays', String(cfg.monthlyWorkDays)); } catch {}
            }
            if (cfg.productionUnit) {
              setProductionUnit(cfg.productionUnit);
              try { localStorage.setItem('shiftTracker_productionUnit', cfg.productionUnit); } catch {}
            }
            if (cfg.autoAdvance !== undefined) {
              setAutoAdvance(cfg.autoAdvance);
              try { localStorage.setItem('shiftTracker_autoAdvance', String(cfg.autoAdvance)); } catch {}
            }
            if (cfg.sound !== undefined) {
              setSoundEnabled(cfg.sound);
              try { localStorage.setItem('shiftTracker_sound', String(cfg.sound)); } catch {}
            }
            if (Array.isArray(cfg.missedReasons) && cfg.missedReasons.length > 0) {
              setCustomMissedReasons(cfg.missedReasons);
              try { localStorage.setItem('shiftTracker_missedReasons', JSON.stringify(cfg.missedReasons)); } catch {}
            }
            if (cfg.keybindings) {
              setKeybindings(cfg.keybindings);
              try { localStorage.setItem('shiftTracker_keybindings', JSON.stringify(cfg.keybindings)); } catch {}
            }
          }
        } catch (cfgErr) {
          console.error('Error fetching shift tracker settings:', cfgErr);
        }
      }

      if (isToday) {
        // 1. Load from localStorage FIRST (instant, offline-safe)
        const local = lsGet(currentUser.uid);
        if (local && local.date === todayStr) {
          applyData(local);
        }
        // 2. Try Firestore in background if online
        if (navigator.onLine) {
          try {
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              const d = snap.data();
              if (d.date === todayStr) {
                // Only use Firestore if newer than local
                if (!local || !local.updatedAt || (d.updatedAt && d.updatedAt > local.updatedAt)) {
                  applyData(d);
                  lsSave(currentUser.uid, d);
                }
              } else if (!local || local.date !== todayStr) {
                resetState();
              }
            } else if (!local || local.date !== todayStr) {
              resetState();
            }
          } catch {
            // Offline or error - local data already loaded above
            if (!local || local.date !== todayStr) resetState();
          }
        } else if (!local || local.date !== todayStr) {
          resetState();
        }
      } else {
        // Past date: try local first, then Firestore
        const local = lsGetByDate(currentUser.uid, selectedDate);
        if (local) {
          setTarget(local.target || 100);
          setUnit(local.unit || 'pieces');
          setShiftStart(local.shiftStart || '09:00');
          setShiftEnd(local.shiftEnd || '17:00');
          if (local.shiftSlots) setShiftSlots(local.shiftSlots);
          setBlockLen(local.blockLen || 60);
          if (local.scheduledBreaks) setScheduledBreaks(local.scheduledBreaks);
          setBlocks(local.blocks || []);
          if (local.blocks && local.blocks.length > 0) setSetupMode(false);
          else setSetupMode(true);
          if (local.breakHistory) setBreakHistory(local.breakHistory);
          if (local.totalBreakAccumulatedMs) setTotalBreakAccumulatedMs(local.totalBreakAccumulatedMs);
          const marked = markedDays[selectedDate];
          if (marked) {
            const dt = typeof marked === 'string' ? { type: marked, note: '' } : marked;
            setDayType(dt.type); setDayTypeNote(dt.note || '');
          } else if (local.dayType) {
            setDayType(local.dayType); setDayTypeNote(local.dayTypeNote || '');
          } else {
            const dt = getDayTypeForDateRef.current ? getDayTypeForDateRef.current(selectedDate) : { type: 'work', note: '' };
            setDayType(dt.type); setDayTypeNote(dt.note || '');
          }
        } else {
          const dt = getDayTypeForDateRef.current ? getDayTypeForDateRef.current(selectedDate) : { type: 'work', note: '' };
          setDayType(dt.type); setDayTypeNote(dt.note || '');
        }
        if (navigator.onLine) {
          try {
            const histRef = doc(db, 'shiftTracker', currentUser.uid, 'history', selectedDate);
            const snap = await getDoc(histRef);
            if (snap.exists()) {
              const d = snap.data();
              if (!local || !local.updatedAt || (d.updatedAt && d.updatedAt > local.updatedAt)) {
                setTarget(d.target || 100);
                setUnit(d.unit || 'pieces');
                setShiftStart(d.shiftStart || '09:00');
                setShiftEnd(d.shiftEnd || '17:00');
                if (d.shiftSlots) setShiftSlots(d.shiftSlots);
                setBlockLen(d.blockLen || 60);
                if (d.scheduledBreaks) setScheduledBreaks(d.scheduledBreaks);
                setBlocks(d.blocks || []);
                if (d.blocks && d.blocks.length > 0) setSetupMode(false);
                else setSetupMode(true);
                if (d.breakHistory) setBreakHistory(d.breakHistory);
                if (d.totalBreakAccumulatedMs) setTotalBreakAccumulatedMs(d.totalBreakAccumulatedMs);
                const marked = markedDays[selectedDate];
                if (marked) {
                  const dt = typeof marked === 'string' ? { type: marked, note: '' } : marked;
                  setDayType(dt.type); setDayTypeNote(dt.note || '');
                } else if (d.dayType) {
                  setDayType(d.dayType); setDayTypeNote(d.dayTypeNote || '');
                } else {
                  const dt = getDayTypeForDateRef.current ? getDayTypeForDateRef.current(selectedDate) : { type: 'work', note: '' };
                  setDayType(dt.type); setDayTypeNote(dt.note || '');
                }
                lsSaveByDate(currentUser.uid, selectedDate, d);
              }
            } else if (!local) {
              resetState();
              const dt = getDayTypeForDateRef.current ? getDayTypeForDateRef.current(selectedDate) : { type: 'work', note: '' };
              setDayType(dt.type); setDayTypeNote(dt.note || '');
            }
          } catch {
            if (!local) {
              resetState();
              const dt = getDayTypeForDateRef.current ? getDayTypeForDateRef.current(selectedDate) : { type: 'work', note: '' };
              setDayType(dt.type); setDayTypeNote(dt.note || '');
            }
          }
        } else if (!local) {
          resetState();
          const dt = getDayTypeForDateRef.current ? getDayTypeForDateRef.current(selectedDate) : { type: 'work', note: '' };
          setDayType(dt.type); setDayTypeNote(dt.note || '');
        }
        setClockStatus('idle');
        setShiftStartMs(null);
        setTotalAccumulatedMs(0);
        setElapsedShiftSec(0);
      }
    };

    loadData();
  }, [currentUser?.uid, selectedDate]);

  // Load monthly production history to power dynamic targets
  const loadMonthlyProductionHistory = useCallback(async () => {
    if (!currentUser?.uid) return;
    setMonthlyHistoryLoading(true);
    try {
      const currentMonthPrefix = selectedDate.substring(0, 7); // e.g. "2026-10"
      let entries = [];

      // Try local storage first
      try {
        const localDaily = JSON.parse(localStorage.getItem(`shiftReport_daily_${currentUser.uid}`)) || [];
        entries = localDaily.filter(e => e.date && e.date.startsWith(currentMonthPrefix));
      } catch {}

      if (navigator.onLine) {
        try {
          const histCol = collection(db, 'shiftTracker', currentUser.uid, 'history');
          const snap = await getDocs(histCol);
          const histData = snap.docs.map(d => ({ date: d.id, ...d.data() }))
            .filter(e => e.date && e.date.startsWith(currentMonthPrefix));
          
          if (histData.length > 0) {
            entries = histData;
          }
        } catch {}
      }
      setMonthlyHistory(entries);
    } catch (err) {
      console.error('Error fetching monthly history:', err);
    } finally {
      setMonthlyHistoryLoading(false);
    }
  }, [currentUser?.uid, selectedDate]);

  useEffect(() => {
    loadMonthlyProductionHistory();
  }, [loadMonthlyProductionHistory]);

  const resetState = () => {
    setTarget(Number(localStorage.getItem('shiftTracker_defaultTarget')) || 100);
    setUnit(localStorage.getItem('shiftTracker_productionUnit') || 'pieces');
    setShiftStart(localStorage.getItem('shiftTracker_defaultStart') || '09:00');
    setShiftEnd(localStorage.getItem('shiftTracker_defaultEnd') || '17:00');
    setShiftSlots([]);
    setBlockLen(60);
    setBlocks([]);
    setScheduledBreaks([]);
    setSetupMode(true);
    setClockStatus('idle');
    setShiftStartMs(null);
    setTotalAccumulatedMs(0);
    setElapsedShiftSec(0);
    setEarnedBreak(0);
    setEarnedBreakReason('');
    setTotalBreakAccumulatedMs(0);
    setBreakHistory([]);
    setBreakType(null);
    setBreakNudgeLevel(0);
    const dt = getDayTypeForDateRef.current ? getDayTypeForDateRef.current(selectedDate) : { type: 'work', note: '' };
    setDayType(dt.type);
    setDayTypeNote(dt.note || '');
  };

  // Determine default day type for a date based on weeklyOffDays and markedDays
  const getDayTypeForDate = useCallback((dateStr) => {
    // Check manually marked days first
    if (markedDays[dateStr]) {
      const m = markedDays[dateStr];
      return typeof m === 'string' ? { type: m, note: '' } : m;
    }
    // Check weekly off-day pattern
    const d = new Date(dateStr + 'T00:00:00');
    if (weeklyOffDays.includes(d.getDay())) return { type: 'off', note: 'Weekly off' };
    return { type: 'work', note: '' };
  }, [weeklyOffDays, markedDays]);

  // Hoist getDayTypeForDate ref to allow usage in loadData before definition if needed
  const getDayTypeForDateRef = useRef(getDayTypeForDate);
  getDayTypeForDateRef.current = getDayTypeForDate;

  const save = (b, extraData = {}) => {
    if (!currentUser?.uid) return;
    const currentBlocks = b || blocks;
    const totalProducedNow = currentBlocks.reduce((s, blk) => s + (blk.logged ? blk.actual : 0), 0);

    const currentTotalBreakMs = extraData.totalBreakAccumulatedMs ?? totalBreakAccumulatedMs;
    const currentBreakHistory = extraData.breakHistory ?? breakHistory;
    const nowTs = Date.now();

    const todayDoc = isToday ? {
      date: todayStr, target, unit, shiftStart, shiftEnd, shiftSlots, blockLen, scheduledBreaks, blocks: currentBlocks,
      clockStatus, shiftStartMs, totalAccumulatedMs, breakStartMs, breakDurationMs, earnedBreak, earnedBreakReason,
      totalBreakAccumulatedMs: currentTotalBreakMs,
      breakHistory: currentBreakHistory,
      breakType,
      dayType,
      dayTypeNote,
      missedReasons: customMissedReasons,
      updatedAt: nowTs,
      ...extraData
    } : null;

    const historyDoc = {
      date: selectedDate,
      target: Number(target),
      actual: totalProducedNow,
      blocks: currentBlocks,
      shiftStart: extraData.shiftStart || shiftStart,
      shiftEnd: extraData.shiftEnd || shiftEnd,
      shiftSlots,
      blockLen,
      scheduledBreaks,
      unit,
      totalShiftSec: extraData.totalAccumulatedMs != null ? Math.floor(extraData.totalAccumulatedMs / 1000) : Math.floor(totalAccumulatedMs / 1000),
      totalBreakSec: Math.floor(currentTotalBreakMs / 1000),
      breakHistory: currentBreakHistory,
      missedReasons: customMissedReasons,
      dayType,
      dayTypeNote,
      updatedAt: nowTs
    };

    // 1. Always save to localStorage (instant, offline-safe)
    if (isToday && todayDoc) {
      lsSave(currentUser.uid, todayDoc);
    }
    lsSaveByDate(currentUser.uid, selectedDate, historyDoc);

    // Sync to Shift Report history cache immediately so Shift Report 30-day filter updates dynamically
    try {
      const sKey = `shiftReport_history_${currentUser.uid}`;
      const existingSrHist = JSON.parse(localStorage.getItem(sKey)) || [];
      const updatedSrHist = [historyDoc, ...existingSrHist.filter(h => h.date !== selectedDate)]
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      localStorage.setItem(sKey, JSON.stringify(updatedSrHist));
    } catch {}

    // Update monthly history in-memory if in current month
    setMonthlyHistory(prev => {
      const exists = prev.some(h => h.date === selectedDate);
      if (exists) {
        return prev.map(h => h.date === selectedDate ? { ...h, ...historyDoc } : h);
      }
      return [...prev, historyDoc];
    });

    // 2. Queue for Firestore sync
    queueSync(currentUser.uid, todayDoc, historyDoc, selectedDate);

    // 3. If online, flush immediately
    if (navigator.onLine && !syncingRef.current) {
      syncingRef.current = true;
      flushSyncQueue().finally(() => { syncingRef.current = false; });
    }
  };

  // Clock Ticker
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Digital Stopwatch Ticker + Break Nudge + Break Progress
  useEffect(() => {
    let interval = null;
    if (clockStatus === 'active' || clockStatus === 'break') {
      interval = setInterval(() => {
        const currentMs = Date.now();
        if (clockStatus === 'active') {
          setElapsedShiftSec(Math.floor((totalAccumulatedMs + (currentMs - shiftStartMs)) / 1000));
          // Break nudge calculation
          const continuousWorkMs = currentMs - shiftStartMs;
          if (continuousWorkMs > 10800000) setBreakNudgeLevel(3);
          else if (continuousWorkMs > 7200000) setBreakNudgeLevel(2);
          else if (continuousWorkMs > 5400000) setBreakNudgeLevel(1);
          else setBreakNudgeLevel(0);
        } else if (clockStatus === 'break') {
          const passed = currentMs - breakStartMs;
          setBreakRemainingSec(Math.floor((breakDurationMs - passed) / 1000));
          setBreakProgress(breakDurationMs > 0 ? Math.min(1, passed / breakDurationMs) : 0);
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [clockStatus, shiftStartMs, breakStartMs, breakDurationMs, totalAccumulatedMs]);

  // Check when scheduled break block ends to prompt user for action
  const dismissedScheduledBreakRef = useRef(null);
  useEffect(() => {
    if (clockStatus !== 'active' || !blocks || blocks.length === 0) return;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const currStr = fmtTime(now);

    // Auto-alert when all shift slots have ended
    const endMinutes = timeToMinutes(effectiveShiftEnd);
    if (endMinutes > 0 && nowMin >= endMinutes && !shiftEndPromptedRef.current && !customAlert.isOpen) {
      shiftEndPromptedRef.current = true;
      playSound('missed');
      setCustomAlert({
        isOpen: true,
        type: 'confirm',
        title: '🏁 Shift Time Ended',
        message: `Your shift scheduled end time (${fmt12h(effectiveShiftEnd)}) has passed. Would you like to clock out and complete your shift now?`,
        onConfirm: () => {
          handleClockOutConfirm();
        }
      });
      return;
    }

    // Find any scheduled break block that just finished within the last 15 minutes
    const finishedScheduledBlock = blocks.find(b => {
      if (!b.isBreak) return false;
      const endMin = timeToMinutes(b.end);
      return endMin <= nowMin && nowMin < endMin + 15;
    });

    if (finishedScheduledBlock) {
      if (dismissedScheduledBreakRef.current !== finishedScheduledBlock.id && !scheduledBreakPrompt) {
        setScheduledBreakPrompt({
          blockId: finishedScheduledBlock.id,
          label: finishedScheduledBlock.breakLabel || 'Scheduled Break',
          end: finishedScheduledBlock.end
        });
      }
    } else {
      if (scheduledBreakPrompt) setScheduledBreakPrompt(null);
    }
  }, [now, clockStatus, blocks, scheduledBreakPrompt, effectiveShiftEnd, customAlert.isOpen]);

  // Quick adjust / extend scheduled break block
  const adjustScheduledBreak = (blockId, deltaMinutes) => {
    const updated = blocks.map(b => {
      if (b.id !== blockId) return b;
      const currentEndMin = timeToMinutes(b.end);
      const newEndMin = Math.max(timeToMinutes(b.start) + 5, currentEndMin + deltaMinutes);
      const h = String(Math.floor(newEndMin / 60)).padStart(2, '0');
      const m = String(newEndMin % 60).padStart(2, '0');
      return { ...b, end: `${h}:${m}` };
    });
    recalcTargets(updated, target, breakHistory);
    setBlocks(updated);
    save(updated);
    playSound('points');
  };


  // --- SHIFT TRACKER FUNCTIONS ---
  const performClockIn = (opts = {}) => {
    let targetBlocks = blocks;
    let targetStart = shiftStart;
    let targetSlots = shiftSlots;

    // If options specify adjusting the scheduled start time to right now (early clock in)
    if (opts.adjustScheduledStart && opts.newStartTime) {
      const newStart = opts.newStartTime;
      const newStartMin = timeToMinutes(newStart);
      const oldStartMin = timeToMinutes(shiftStart);
      targetStart = newStart;
      setShiftStart(newStart);

      if (targetSlots && targetSlots.length > 0) {
        const updatedSlots = [...targetSlots];
        updatedSlots[0] = { ...updatedSlots[0], start: newStart };
        targetSlots = updatedSlots;
        setShiftSlots(updatedSlots);
      }

      let nb = blocks.map(b => ({ ...b }));
      if (nb.length > 0 && newStartMin < oldStartMin) {
        const firstBlockStart = timeToMinutes(nb[0].start);
        if (newStartMin < firstBlockStart) {
          let curMin = newStartMin;
          const firstShiftLabel = nb[0].shiftLabel || '';
          const newBlocks = [];
          while (curMin < firstBlockStart) {
            const bEndMin = Math.min(curMin + blockLen, firstBlockStart);
            newBlocks.push({
              id: 0,
              start: minsToTime(curMin),
              end: minsToTime(bEndMin),
              shiftLabel: firstShiftLabel,
              actual: 0, cumulative: 0, logged: false, target: 0, isBreak: false
            });
            curMin = bEndMin;
          }
          nb = [...newBlocks, ...nb];
        } else if (!nb[0].logged && !nb[0].isBreak) {
          nb[0] = { ...nb[0], start: newStart };
        }
      }
      nb = nb.map((b, idx) => ({ ...b, id: idx }));
      recalcTargets(nb, target, breakHistory);
      targetBlocks = nb;
      setBlocks(nb);
    }

    setClockStatus('active');
    setShiftStartMs(Date.now());
    shiftEndPromptedRef.current = false;
    playSound('success');
    save(targetBlocks, {
      clockStatus: 'active',
      shiftStartMs: Date.now(),
      shiftStart: targetStart,
      shiftSlots: targetSlots
    });
  };

  const handleClockIn = () => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToMinutes(effectiveShiftStart);
    const endMinutes = timeToMinutes(effectiveShiftEnd);

    // If shift hasn't started yet (e.g. shift is 9:00 AM but it's 8:30 AM)
    if (nowMin < startMinutes) {
      const waitMins = startMinutes - nowMin;
      const waitHrs = Math.floor(waitMins / 60);
      const waitRemMins = waitMins % 60;
      const waitStr = waitHrs > 0 ? `${waitHrs}h ${waitRemMins}m` : `${waitRemMins} mins`;
      const currentNowStr = fmtTime(now);

      setCustomAlert({
        isOpen: true,
        type: 'confirm',
        title: '⏳ Shift Not Started Yet',
        message: `Your shift is scheduled to start at ${fmt12h(effectiveShiftStart)} (in ${waitStr}). Do you want to clock in now starting at ${fmt12h(currentNowStr)} and adapt shift blocks?`,
        onConfirm: () => {
          performClockIn({ adjustScheduledStart: true, newStartTime: currentNowStr });
          setCustomAlert({ isOpen: false });
        }
      });
      return;
    }

    // If scheduled shift has already passed
    if (endMinutes > 0 && nowMin > endMinutes) {
      setCustomAlert({
        isOpen: true,
        type: 'confirm',
        title: '⚠️ Shift Schedule Ended',
        message: `Your scheduled shift ended at ${fmt12h(effectiveShiftEnd)}. Do you still want to clock in now?`,
        onConfirm: () => {
          performClockIn();
          setCustomAlert({ isOpen: false });
        }
      });
      return;
    }

    performClockIn();
  };

  const startBreak = (mins, typeId) => {
    const currentMs = Date.now();
    const newTotal = totalAccumulatedMs + (currentMs - (shiftStartMs || currentMs));
    setTotalAccumulatedMs(newTotal);
    setBreakDurationMs(mins * 60000);
    setBreakStartMs(currentMs);
    setBreakType(typeId || 'tea');
    setClockStatus('break');
    setShowBreakOptions(false);
    setSelectedBreakType(null);
    setBreakNudgeLevel(0);

    const newBreakEntry = { type: typeId || 'tea', startMs: currentMs, endMs: null, durationMs: 0, plannedMs: mins * 60000 };
    const newHistory = [...breakHistory, newBreakEntry];
    setBreakHistory(newHistory);

    // Deduct only the used amount from earned break (so excess is saved)
    let remainingEarned = earnedBreak;
    let nextReason = earnedBreakReason;
    if (earnedBreak > 0) {
      remainingEarned = Math.max(0, earnedBreak - mins);
      if (remainingEarned === 0) nextReason = '';
      setEarnedBreak(remainingEarned);
      setEarnedBreakReason(nextReason);
    }

    playSound('points');
    save(blocks, {
      clockStatus: 'break', totalAccumulatedMs: newTotal, breakDurationMs: mins * 60000,
      breakStartMs: currentMs, earnedBreak: remainingEarned, earnedBreakReason: nextReason, breakType: typeId || 'tea',
      breakHistory: newHistory
    });
  };

  const handleEndBreak = () => {
    const currentMs = Date.now();
    const thisBreakDuration = currentMs - breakStartMs;
    const newTotalBreak = totalBreakAccumulatedMs + thisBreakDuration;
    setTotalBreakAccumulatedMs(newTotalBreak);

    // Update break history - close the last entry
    const updatedHistory = [...breakHistory];
    if (updatedHistory.length > 0) {
      const lastIdx = updatedHistory.length - 1;
      updatedHistory[lastIdx] = {
        ...updatedHistory[lastIdx],
        endMs: currentMs,
        durationMs: thisBreakDuration
      };
    }
    setBreakHistory(updatedHistory);

    // Recalculate block targets with break overlap
    const nb = blocks.map(bl => ({ ...bl }));
    recalcTargets(nb, target, updatedHistory);
    setBlocks(nb);

    // Show celebration
    setCelebrationData({ type: breakType || 'tea', mins: Math.round(thisBreakDuration / 60000) });
    setShowBreakCelebration(true);

    setClockStatus('active');
    const stMs = currentMs;
    setShiftStartMs(stMs);
    playSound('success');
    save(nb, {
      clockStatus: 'active', shiftStartMs: stMs,
      totalBreakAccumulatedMs: newTotalBreak,
      breakHistory: updatedHistory
    });
  };

  const handleClockOutConfirm = () => {
    const clockOutTime = new Date();
    const actualShiftEnd = fmtTime(clockOutTime);
    const finalAccumulatedMs = shiftStartMs
      ? totalAccumulatedMs + (Date.now() - shiftStartMs)
      : totalAccumulatedMs;

    setClockStatus('idle');
    setShiftStartMs(null);
    setTotalAccumulatedMs(0);
    setElapsedShiftSec(0);
    shiftEndPromptedRef.current = false;
    playSound('trash');
    save(blocks, {
      clockStatus: 'idle',
      shiftStartMs: null,
      totalAccumulatedMs: finalAccumulatedMs,
      shiftEnd: actualShiftEnd
    });
    setCustomAlert({ isOpen: false });
  };

  const handleClockOut = () => {
    // Check if any logged block missed target without a reason
    const missedWithoutReason = blocks.findIndex(b => !b.isBreak && b.logged && b.actual < b.target && !b.missReason?.trim());
    if (missedWithoutReason >= 0) {
      playSound('missed');
      setCustomAlert({
        isOpen: true,
        type: 'alert',
        title: '⚠️ Reason Required',
        message: `Block ${missedWithoutReason + 1} (${fmt12h(blocks[missedWithoutReason].start)} - ${fmt12h(blocks[missedWithoutReason].end)}) missed target. Please write or select a reason for this block before clocking out.`,
        onConfirm: null
      });
      return;
    }

    setCustomAlert({
      isOpen: true,
      type: 'confirm',
      title: 'Clock Out',
      message: 'Are you sure you want to clock out and stop your shift timer?',
      onConfirm: () => {
        handleClockOutConfirm();
      }
    });
  };

  const generateBlocks = () => {
    const slotsToUse = shiftSlots && shiftSlots.length > 0
      ? [...shiftSlots].filter(s => s.start && s.end && timeToMinutes(s.start) < timeToMinutes(s.end))
      : [{ label: 'Shift', start: shiftStart, end: shiftEnd }];

    if (slotsToUse.length === 0) return;

    // Sort shift slots chronologically
    slotsToUse.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    // Sort scheduled breaks by start time
    const sortedBreaks = [...scheduledBreaks]
      .filter(sb => sb.start && sb.end && timeToMinutes(sb.start) < timeToMinutes(sb.end))
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    const b = [];
    let blockId = 0;

    slotsToUse.forEach(slot => {
      let curMin = timeToMinutes(slot.start);
      const slotEndMin = timeToMinutes(slot.end);

      while (curMin < slotEndMin) {
        // Check if a scheduled break starts at or before current position within this slot
        const nextBreak = sortedBreaks.find(sb => {
          const sbStart = timeToMinutes(sb.start);
          const sbEnd = timeToMinutes(sb.end);
          return sbStart >= curMin && sbStart < slotEndMin && sbEnd > curMin;
        });

        if (nextBreak) {
          const brkStartMin = timeToMinutes(nextBreak.start);
          const brkEndMin = timeToMinutes(nextBreak.end);

          // If there's work time before this break, add work block(s)
          if (curMin < brkStartMin) {
            let workCur = curMin;
            while (workCur < brkStartMin) {
              const chunkEnd = Math.min(workCur + blockLen, brkStartMin);
              b.push({
                id: blockId++,
                start: minsToTime(workCur),
                end: minsToTime(chunkEnd),
                shiftLabel: slot.label,
                actual: 0, cumulative: 0, logged: false, target: 0, isBreak: false
              });
              workCur = chunkEnd;
            }
          }

          // Add the break block
          b.push({
            id: blockId++,
            start: nextBreak.start,
            end: nextBreak.end,
            shiftLabel: slot.label,
            actual: 0, cumulative: 0, logged: false, target: 0,
            isBreak: true,
            breakLabel: nextBreak.label || 'Break'
          });

          curMin = brkEndMin;
        } else {
          // No more breaks ahead in this slot, fill with work blocks
          const bEndMin = Math.min(curMin + blockLen, slotEndMin);
          b.push({
            id: blockId++,
            start: minsToTime(curMin),
            end: minsToTime(bEndMin),
            shiftLabel: slot.label,
            actual: 0, cumulative: 0, logged: false, target: 0, isBreak: false
          });
          curMin = bEndMin;
        }
      }
    });

    // Update global shiftStart & shiftEnd to the extremes
    if (slotsToUse.length > 0) {
      setShiftStart(slotsToUse[0].start);
      setShiftEnd(slotsToUse[slotsToUse.length - 1].end);
    }

    recalcTargets(b, target, breakHistory);
    setBlocks(b);
    setSetupMode(false);
    save(b);
    playSound('points');
  };

  const recalcTargets = (blks, total, history) => {
    let produced = 0;
    let totalEffWeight = 0;

    blks.forEach(b => {
      if (b.isBreak) return;
      if (b.logged) { produced += b.actual; return; }
      const blockMins = timeToMinutes(b.end) - timeToMinutes(b.start);
      const brkMins = calcBlockBreakMins(b, history);
      const eff = Math.max(0, blockMins - brkMins);
      if (eff <= 0) { b.isBreak = true; b.target = 0; return; }
      totalEffWeight += eff;
    });

    const rem = Math.max(0, total - produced);

    blks.forEach(b => {
      if (!b.isBreak && !b.logged) {
        const blockMins = timeToMinutes(b.end) - timeToMinutes(b.start);
        const brkMins = calcBlockBreakMins(b, history);
        const eff = Math.max(0, blockMins - brkMins);
        b.target = totalEffWeight > 0 ? (rem * eff / totalEffWeight) : 0;
      }
    });
  };

  const logCumulative = (id, val) => {
    const cumVal = Number(val) || 0;
    const nb = [...blocks];
    const b = nb[id];

    let prevCum = 0;
    for (let i = id - 1; i >= 0; i--) {
      if (nb[i].logged && !nb[i].isBreak) {
        prevCum = nb[i].cumulative;
        break;
      }
    }

    if (cumVal < prevCum) {
      setCustomAlert({
        isOpen: true,
        type: 'alert',
        title: 'Invalid Entry',
        message: `Cumulative production can't be less than the previous block (${prevCum}). Please enter a value of ${prevCum} or higher.`,
        onConfirm: null
      });
      return;
    }

    const actualProd = Math.max(0, cumVal - prevCum);

    b.cumulative = cumVal;
    b.actual = actualProd;
    b.logged = true;

    // Check if target was missed
    const isTargetAchieved = actualProd >= b.target;
    if (isTargetAchieved) {
      // Clear any prior missed reason if it now meets/exceeds target
      delete b.missReason;
    }

    // Trigger StarMaker Emote animation + Sound for 3 seconds
    setActiveEmote({ blockId: b.id, type: isTargetAchieved ? 'achieved' : 'missed' });
    if (isTargetAchieved) {
      playSound('success');
    } else {
      playSound('missed');
    }

    let newEarnedBreak = earnedBreak;
    let newReason = earnedBreakReason;
    if (b.target > 0 && actualProd > b.target) {
      // 1 minute of earned break bonus for every 10% exceeding the target
      const percentOver = ((actualProd - b.target) / b.target) * 100;
      const bonusMinutes = Math.max(1, Math.floor(percentOver / 10));
      newEarnedBreak += bonusMinutes;
      const surplus = (actualProd - b.target).toFixed(0);
      newReason = `Exceeded target by +${surplus} ${unit} (+${percentOver.toFixed(0)}%) in ${fmt12h(b.start)} - ${fmt12h(b.end)}`;
      setEarnedBreak(newEarnedBreak);
      setEarnedBreakReason(newReason);
    } else if (actualProd <= b.target) {
      // If user lowered or didn't exceed target, do not grant earned break
      if (!blocks.some((otherB, oIdx) => oIdx !== id && otherB.logged && otherB.actual > otherB.target)) {
        newEarnedBreak = 0;
        newReason = '';
        setEarnedBreak(0);
        setEarnedBreakReason('');
      }
    }

    recalcTargets(nb, target, breakHistory);
    setBlocks(nb);
    save(nb, { earnedBreak: newEarnedBreak, earnedBreakReason: newReason });
    return { needsReason: !isTargetAchieved && !b.missReason };
  };

  const updateBlockMissReason = (id, reason) => {
    const trimmed = (reason || '').trim();
    const nb = blocks.map((blk, idx) => {
      if (idx !== id) return blk;
      if (!trimmed) {
        const copy = { ...blk };
        delete copy.missReason;
        return copy;
      }
      return { ...blk, missReason: trimmed };
    });
    setBlocks(nb);
    save(nb);
    if (trimmed) playSound('success');
  };

  const resetBlock = (id) => {
    const nb = [...blocks];
    nb[id].logged = false;
    nb[id].actual = 0;
    nb[id].cumulative = 0;
    delete nb[id].missReason;
    // Check if any other blocks earned break
    const hasOtherOverTarget = nb.some((blk, idx) => idx !== id && blk.logged && !blk.isBreak && blk.actual > blk.target);
    if (!hasOtherOverTarget) {
      setEarnedBreak(0);
      setEarnedBreakReason('');
    }
    recalcTargets(nb, target, breakHistory);
    setBlocks(nb);
    save(nb, hasOtherOverTarget ? {} : { earnedBreak: 0, earnedBreakReason: '' });
  };

  const isInScheduledBreak = currentBlock?.isBreak && clockStatus === 'active';
  const scheduledBreakEndMins = isInScheduledBreak ? timeToMinutes(currentBlock.end) : 0;
  const scheduledBreakRemainingMins = isInScheduledBreak ? Math.max(0, scheduledBreakEndMins - (now.getHours() * 60 + now.getMinutes())) : 0;
  const totalProduced = blocks.reduce((s, b) => s + (b.logged ? b.actual : 0), 0);
  const isOverBreak = breakRemainingSec < 0;

  // --- COMPREHENSIVE SHIFT & NEXT SHIFT TIMING CALCULATOR ---
  const timingInfo = (() => {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowSecInDay = nowMin * 60 + now.getSeconds();

    // Normalized slots for today
    const validSlots = activeSlots && activeSlots.length > 0 
      ? activeSlots.map((s, idx) => ({
          idx,
          label: s.label || `Shift ${idx + 1}`,
          startMin: timeToMinutes(s.start),
          endMin: timeToMinutes(s.end),
          startStr: s.start,
          endStr: s.end
        })).filter(s => s.startMin < s.endMin)
      : [{
          idx: 0,
          label: 'Main Shift',
          startMin: timeToMinutes(shiftStart),
          endMin: timeToMinutes(shiftEnd),
          startStr: shiftStart,
          endStr: shiftEnd
        }];

    // Current active slot (by clock time)
    const currentSlot = validSlots.find(s => nowMin >= s.startMin && nowMin < s.endMin) || null;
    
    // Remaining time in current scheduled shift slot (down to seconds)
    let currentSlotRemainingSec = 0;
    let currentSlotElapsedSec = 0;
    let currentSlotTotalSec = 0;
    let currentSlotProgress = 0;

    if (currentSlot) {
      const slotStartSec = currentSlot.startMin * 60;
      const slotEndSec = currentSlot.endMin * 60;
      currentSlotTotalSec = slotEndSec - slotStartSec;
      currentSlotElapsedSec = Math.max(0, nowSecInDay - slotStartSec);
      currentSlotRemainingSec = Math.max(0, slotEndSec - nowSecInDay);
      currentSlotProgress = currentSlotTotalSec > 0 ? Math.min(100, (currentSlotElapsedSec / currentSlotTotalSec) * 100) : 0;
    }

    // Overall shift bounds
    const firstShiftStartMin = validSlots.length > 0 ? validSlots[0].startMin : timeToMinutes(shiftStart);
    const overallEndMin = validSlots.length > 0 ? validSlots[validSlots.length - 1].endMin : timeToMinutes(shiftEnd);
    const overallEndSec = overallEndMin * 60;
    const finalShiftRemainingSec = Math.max(0, overallEndSec - nowSecInDay);
    const isPastFinalShift = nowMin >= overallEndMin;
    const isShiftStarted = clockStatus === 'active' || clockStatus === 'break' || (nowMin >= firstShiftStartMin && !isPastFinalShift);

    // Next shift start calculation
    // Look for next upcoming slot today
    const upcomingTodaySlot = validSlots.find(s => s.startMin > nowMin);
    let nextShiftLabel = '';
    let nextShiftStartStr = '';
    let nextShiftRemainingSec = 0;
    let isNextShiftTomorrow = false;

    if (upcomingTodaySlot) {
      nextShiftLabel = upcomingTodaySlot.label;
      nextShiftStartStr = upcomingTodaySlot.startStr;
      nextShiftRemainingSec = (upcomingTodaySlot.startMin * 60) - nowSecInDay;
    } else if (validSlots.length > 0) {
      // First shift of tomorrow
      const firstTomorrow = validSlots[0];
      nextShiftLabel = `${firstTomorrow.label} (Tomorrow)`;
      nextShiftStartStr = firstTomorrow.startStr;
      const secondsUntilMidnight = (24 * 3600) - nowSecInDay;
      nextShiftRemainingSec = secondsUntilMidnight + (firstTomorrow.startMin * 60);
      isNextShiftTomorrow = true;
    }

    // Current block remaining (if currently in a block)
    let currentBlockRemainingSec = 0;
    let currentBlockProgress = 0;
    if (currentBlock) {
      const bStartSec = timeToMinutes(currentBlock.start) * 60;
      const bEndSec = timeToMinutes(currentBlock.end) * 60;
      const bTotal = bEndSec - bStartSec;
      currentBlockRemainingSec = Math.max(0, bEndSec - nowSecInDay);
      currentBlockProgress = bTotal > 0 ? Math.min(100, Math.max(0, (nowSecInDay - bStartSec) / bTotal) * 100) : 0;
    }

    return {
      currentSlot,
      currentSlotRemainingSec,
      currentSlotProgress,
      finalShiftRemainingSec,
      isPastFinalShift,
      isShiftStarted,
      firstShiftStartMin,
      nextShiftLabel,
      nextShiftStartStr,
      nextShiftRemainingSec,
      isNextShiftTomorrow,
      currentBlockRemainingSec,
      currentBlockProgress,
      overallEndStr: validSlots.length > 0 ? validSlots[validSlots.length - 1].endStr : shiftEnd
    };
  })();

  // --- PHASE 2: PRODUCTION ENGINE METRICS (Dynamic Targets & Run-Rate) ---
  const productionMetrics = (() => {
    // Total produced so far this month (exclude selectedDate/today from history to avoid double-counting)
    const historyWithoutSelected = monthlyHistory.filter(item => item.date !== selectedDate);
    const totalMonthProduced = historyWithoutSelected.reduce((sum, item) => sum + (Number(item.actual) || Number(item.docsCount) || 0), 0) + totalProduced;
    const mTarget = Math.max(1, monthlyTarget);

    // Calculate days passed and remaining working days in current month with Offday/Leave/Holiday awareness
    const d = new Date(selectedDate);
    const currentDayOfMonth = d.getDate();
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const yearMonth = selectedDate.substring(0, 7);

    // Count actual workdays in month, excluding weekly offs and leaves/holidays
    let totalScheduledWorkDays = 0;
    let actualWorkDaysPassed = 0;
    let actualWorkDaysRemaining = 0;
    let offDaysCount = 0;
    let leaveDaysCount = 0;
    let holidaysCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
      let dType = 'work';
      if (markedDays[dateStr]) {
        const m = markedDays[dateStr];
        dType = typeof m === 'string' ? m : (m.type || 'work');
      } else {
        const histItem = monthlyHistory.find(h => h.date === dateStr);
        if (histItem?.dayType) {
          dType = histItem.dayType;
        } else {
          const testDate = new Date(`${dateStr}T00:00:00`);
          if (weeklyOffDays.includes(testDate.getDay())) {
            dType = 'off';
          }
        }
      }

      // Check current day if viewing today
      if (dateStr === selectedDate) {
        dType = dayType;
      }

      if (dType === 'off') offDaysCount++;
      else if (dType === 'leave') leaveDaysCount++;
      else if (dType === 'holiday') holidaysCount++;
      else totalScheduledWorkDays++;

      if (dType === 'work') {
        if (day <= currentDayOfMonth) {
          actualWorkDaysPassed++;
        } else {
          actualWorkDaysRemaining++;
        }
      }
    }

    const effectiveTotalWorkDays = Math.max(1, totalScheduledWorkDays || monthlyWorkDays);
    const workDaysPassed = Math.max(1, actualWorkDaysPassed);
    // If today is a workday and production has already started / blocks exist, today is being worked.
    // Remaining future workdays after today is actualWorkDaysRemaining. If today is work and has remaining target, include today if shift not finished.
    const isTodayWork = dayType === 'work';
    const hasTodayWorkRemaining = isTodayWork && totalProduced < (Number(target) || 0);
    const workDaysRemaining = Math.max(1, actualWorkDaysRemaining + (hasTodayWorkRemaining ? 1 : (actualWorkDaysRemaining === 0 ? 1 : 0)));

    const monthProgressPct = Math.min(100, Math.round((totalMonthProduced / mTarget) * 100));

    // Standard baseline daily target
    const baseDailyTarget = Math.round(mTarget / effectiveTotalWorkDays);
    // Baseline weekly target (assuming 6 working days / week)
    const baseWeeklyTarget = Math.round(baseDailyTarget * Math.min(6, effectiveTotalWorkDays));

    // Dynamic suggested target for today to catch up / stay on track
    const remainingMonthTarget = Math.max(0, mTarget - totalMonthProduced);
    const dynamicSuggestedDailyTarget = Math.max(1, Math.round(remainingMonthTarget / Math.max(1, workDaysRemaining)));
    const dynamicSuggestedWeeklyTarget = Math.round(dynamicSuggestedDailyTarget * Math.min(6, workDaysRemaining));

    // Run-rate projection based on actual working days passed
    const expectedProducedSoFar = baseDailyTarget * workDaysPassed;
    const paceStatus = totalMonthProduced >= expectedProducedSoFar
      ? 'ahead'
      : totalMonthProduced >= expectedProducedSoFar * 0.85
        ? 'on-track'
        : 'behind';

    const projectedTotal = workDaysPassed > 0 
      ? Math.round((totalMonthProduced / workDaysPassed) * effectiveTotalWorkDays)
      : mTarget;
    const projectedPct = Math.round((projectedTotal / mTarget) * 100);

    return {
      totalMonthProduced,
      mTarget,
      monthProgressPct,
      workDaysRemaining,
      effectiveTotalWorkDays,
      offDaysCount,
      leaveDaysCount,
      holidaysCount,
      baseDailyTarget,
      baseWeeklyTarget,
      dynamicSuggestedDailyTarget,
      dynamicSuggestedWeeklyTarget,
      paceStatus,
      projectedTotal,
      projectedPct
    };
  })();

  // Break insight calculations
  const completedBreaks = breakHistory.filter(b => b.endMs);
  const avgBreakMins = completedBreaks.length > 0 ? Math.round(completedBreaks.reduce((s, b) => s + b.durationMs, 0) / completedBreaks.length / 60000) : 0;
  const longestBreakMins = completedBreaks.length > 0 ? Math.round(Math.max(...completedBreaks.map(b => b.durationMs)) / 60000) : 0;
  const onTimeBreaks = completedBreaks.filter(b => b.durationMs <= b.plannedMs + 120000).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100dvh', background: '#F7F7F7', paddingBottom: 100, fontFamily: "'Outfit', sans-serif" }}>

      {/* Celebration Overlay */}
      <AnimatePresence>
        {showBreakCelebration && (
          <BreakCelebration
            breakTypeId={celebrationData.type}
            durationMins={celebrationData.mins}
            onComplete={() => setShowBreakCelebration(false)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'linear-gradient(135deg, rgba(28,176,246,0.95), rgba(20,128,179,0.95))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          padding: '8px 12px',
          color: '#fff',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, maxWidth: 1200, margin: '0 auto', flexWrap: 'nowrap' }}>
          
          {/* Left: Back button + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 0 }}>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={onBack}
              style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
                width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0
              }}
            >
              ←
            </motion.button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 15 }}>⏱️</span>
              <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
                Shift
              </span>
            </div>
          </div>

          {/* Right: Actions Container with horizontal scroll on small mobile */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            overflowX: 'auto',
            paddingBottom: 2,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}>
            {!isOnline && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ padding: '2px 6px', background: '#FF4B4B', borderRadius: 8, fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
                Offline
              </motion.div>
            )}

            {/* Target Modal Pill */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setShowProductionModal(true)}
              title="Monthly Target & Production Tracker"
              style={{
                background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
                height: 29, padding: '0 8px', borderRadius: 14, fontWeight: 800, fontSize: 11,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
              }}
            >
              <span>🎯</span>
              <span>{productionMetrics.dynamicSuggestedDailyTarget}/d</span>
            </motion.button>

            {/* Settings button */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
              style={{
                background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none',
                height: 29, padding: '0 8px', borderRadius: 14, fontWeight: 700, fontSize: 11,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0
              }}
            >
              <span>⚙️</span>
            </motion.button>

            {/* Reports button */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={onOpenReports}
              title="Reports"
              style={{
                background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none',
                height: 29, padding: '0 8px', borderRadius: 14, fontWeight: 700, fontSize: 11,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0
              }}
            >
              <span>📊</span>
              <span>Reports</span>
            </motion.button>

            {/* Bypass Tracker button */}
            {onOpenBypassTracker && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onOpenBypassTracker}
                title="Bypass Tracker"
                style={{
                  background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none',
                  height: 29, padding: '0 8px', borderRadius: 14, fontWeight: 700, fontSize: 11,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0
                }}
              >
                <span>⚡</span>
                <span>Bypass</span>
              </motion.button>
            )}

            {/* Export CSV button */}
            {!setupMode && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => exportCSV({blocks}, selectedDate)}
                title="Export CSV"
                style={{
                  background: '#fff', color: '#1CB0F6', border: 'none',
                  height: 29, padding: '0 8px', borderRadius: 14, fontWeight: 800, fontSize: 11,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                }}
              >
                <span>📥</span>
                <span>Export</span>
              </motion.button>
            )}
          </div>

        </div>
      </motion.div>

      {/* Date & Day Type Status Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderBottom: '1px solid #edf2f7' }}>
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'auto', alignItems: 'center' }}>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSelectedDate(yesterdayStr)} style={{ flexShrink: 0, padding: '6px 12px', background: selectedDate === yesterdayStr ? '#FF9500' : '#f1f5f9', color: selectedDate === yesterdayStr ? '#fff' : '#475569', border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>📅 Yesterday</motion.button>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSelectedDate(todayStr)} style={{ flexShrink: 0, padding: '6px 12px', background: selectedDate === todayStr ? '#1CB0F6' : '#f1f5f9', color: selectedDate === todayStr ? '#fff' : '#475569', border: 'none', borderRadius: 16, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>📍 Today</motion.button>
          <input type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)} style={{ flexShrink: 0, padding: '5px 10px', border: '1px solid #cbd5e1', borderRadius: 16, fontSize: 12, fontWeight: 600, color: '#334155', outline: 'none' }} />
          {!isToday && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 4px', color: '#FF9500', fontSize: 11, fontWeight: 700 }}>⚠️ Past Date</div>}

          {/* Day Type Selector Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 }}>
            {[
              { id: 'work', label: 'Work', icon: '💼', activeBg: '#10B981', activeText: '#fff' },
              { id: 'off', label: 'Off', icon: '🏖️', activeBg: '#EF4444', activeText: '#fff' },
              { id: 'leave', label: 'Leave', icon: '🌴', activeBg: '#F59E0B', activeText: '#fff' },
              { id: 'holiday', label: 'Holiday', icon: '🎉', activeBg: '#6366F1', activeText: '#fff' }
            ].map(item => {
              const active = dayType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const newType = item.id;
                    setDayType(newType);
                    const newMarked = { ...markedDays, [selectedDate]: { type: newType, note: dayTypeNote } };
                    setMarkedDays(newMarked);
                    try { localStorage.setItem('shiftTracker_markedDays', JSON.stringify(newMarked)); } catch {}
                    save(blocks, { dayType: newType, dayTypeNote });
                    saveShiftSettings({ markedDays: newMarked });
                    playSound('points');
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 12,
                    border: active ? 'none' : '1px solid #E2E8F0',
                    background: active ? item.activeBg : '#F8FAFC',
                    color: active ? item.activeText : '#64748B',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    transition: 'all 0.15s'
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Note / Reason bar for Off/Leave/Holiday */}
        {dayType !== 'work' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            background: dayType === 'off' ? '#FEF2F2' : dayType === 'leave' ? '#FFFBEB' : '#EEF2FF',
            borderTop: '1px dashed #E2E8F0',
            fontSize: 12
          }}>
            <span style={{ fontWeight: 700, color: dayType === 'off' ? '#991B1B' : dayType === 'leave' ? '#92400E' : '#3730A3' }}>
              {dayType === 'off' ? '🏖️ Off-Day Note:' : dayType === 'leave' ? '🌴 Leave Reason:' : '🎉 Holiday Name:'}
            </span>
            <input
              type="text"
              placeholder={dayType === 'off' ? 'e.g. Weekly Rest' : dayType === 'leave' ? 'e.g. Sick Leave / Personal' : 'e.g. National Day'}
              value={dayTypeNote}
              onChange={(e) => {
                const note = e.target.value;
                setDayTypeNote(note);
                const newMarked = { ...markedDays, [selectedDate]: { type: dayType, note } };
                setMarkedDays(newMarked);
                try { localStorage.setItem('shiftTracker_markedDays', JSON.stringify(newMarked)); } catch {}
                save(blocks, { dayType, dayTypeNote: note });
                saveShiftSettings({ markedDays: newMarked });
              }}
              style={{
                flex: 1,
                border: '1px solid rgba(0,0,0,0.1)',
                background: '#fff',
                borderRadius: 8,
                padding: '4px 8px',
                fontSize: 11.5,
                outline: 'none'
              }}
            />
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '16px' }}>
        {dayType !== 'work' ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              maxWidth: 640,
              margin: '20px auto',
              background: '#fff',
              borderRadius: 24,
              padding: '36px 24px',
              textAlign: 'center',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.06)',
              border: dayType === 'off' ? '2px solid #FCA5A5' : dayType === 'leave' ? '2px solid #FCD34D' : '2px solid #A5B4FC'
            }}
          >
            <div style={{ fontSize: 54, marginBottom: 12 }}>
              {dayType === 'off' ? '🏖️' : dayType === 'leave' ? '🌴' : '🎉'}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0' }}>
              {dayType === 'off' ? 'Weekly Off-Day' : dayType === 'leave' ? 'On Leave' : 'Public Holiday'}
            </h2>
            <p style={{ fontSize: 14, color: '#64748B', maxWidth: 400, margin: '0 auto 20px auto', lineHeight: 1.5 }}>
              {dayTypeNote ? `"${dayTypeNote}"` : (
                dayType === 'off'
                  ? 'Enjoy your rest day! Production targets are paused and dynamically spread to other working days.'
                  : dayType === 'leave'
                    ? 'Approved leave recorded. Monthly target remains balanced across remaining workdays.'
                    : 'Holiday celebrated! Monthly quota dynamically recalculates.'
              )}
            </p>

            <div style={{
              display: 'inline-flex',
              flexDirection: 'column',
              gap: 8,
              padding: '14px 20px',
              background: '#F8FAFC',
              borderRadius: 16,
              border: '1px solid #E2E8F0',
              marginBottom: 24,
              textAlign: 'left'
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
                📊 Monthly Dynamic Impact
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                <span>Scheduled Workdays:</span>
                <b>{productionMetrics.effectiveTotalWorkDays} days</b>
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                <span>Remaining Workdays:</span>
                <b>{productionMetrics.workDaysRemaining} days</b>
              </div>
              <div style={{ fontSize: 12.5, color: '#16A34A', display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                <span>Adjusted Daily Target:</span>
                <b>{productionMetrics.dynamicSuggestedDailyTarget} {unit}/day</b>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  setDayType('work');
                  setDayTypeNote('');
                  const newMarked = { ...markedDays, [selectedDate]: { type: 'work', note: '' } };
                  setMarkedDays(newMarked);
                  try { localStorage.setItem('shiftTracker_markedDays', JSON.stringify(newMarked)); } catch {}
                  save(blocks, { dayType: 'work', dayTypeNote: '' });
                  saveShiftSettings({ markedDays: newMarked });
                }}
                style={{
                  padding: '10px 20px',
                  background: '#10B981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 14,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                💼 Switch to Work Day & Start Shift
              </button>
            </div>
          </motion.div>
        ) : setupMode ? (
          <motion.div initial={{ y: 20 }} animate={{ y: 0 }} style={{ maxWidth: 640, margin: '0 auto', background: '#fff', padding: 24, borderRadius: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0 }}>⚙️ Setup Shift</h3>

            <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Daily Target
              <input type="number" value={target} onChange={e => setTarget(e.target.value === '' ? '' : Number(e.target.value))} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </label>

            <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Unit
              <input type="text" value={unit} onChange={e => setUnit(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </label>

            {/* --- Shift Timings / Multi-Shift Slots --- */}
            <div style={{ marginBottom: 14, padding: 16, background: '#F0F9FF', borderRadius: 16, border: '1px solid #BAE6FD' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#0369A1' }}>⏱️ Shift Schedule</span>
                  <div style={{ fontSize: 11, color: '#0284C7', fontWeight: 600 }}>Configure one or multiple shift slots per day</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (shiftSlots.length === 0) {
                      setShiftSlots([
                        { label: '1st Shift', start: shiftStart || '09:00', end: '13:00' },
                        { label: '2nd Shift', start: '15:00', end: shiftEnd || '19:00' }
                      ]);
                    } else {
                      const nextNum = shiftSlots.length + 1;
                      setShiftSlots(prev => [...prev, { label: `${nextNum}${nextNum === 2 ? 'nd' : nextNum === 3 ? 'rd' : 'th'} Shift`, start: '14:00', end: '18:00' }]);
                    }
                  }}
                  style={{ padding: '6px 12px', background: '#0284C7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  + Add Shift
                </button>
              </div>

              {shiftSlots.length === 0 ? (
                <div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0369A1' }}>Shift Start
                      <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #B9E6FE', background: '#fff', boxSizing: 'border-box' }} />
                    </label>
                    <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#0369A1' }}>Shift End
                      <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #B9E6FE', background: '#fff', boxSizing: 'border-box' }} />
                    </label>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>Single shift mode. Tap "+ Add Shift" above for split/multiple shifts (e.g. 9AM-11AM & 3PM-9PM).</div>
                </div>
              ) : (
                <div>
                  {shiftSlots.map((slot, idx) => (
                    <motion.div key={idx} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      style={{ marginBottom: 10, padding: 12, background: '#fff', borderRadius: 12, border: '1px solid #E0F2FE', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <input
                          type="text"
                          value={slot.label}
                          placeholder="Shift Name (e.g. 1st Shift)"
                          onChange={e => {
                            const n = [...shiftSlots];
                            n[idx] = { ...n[idx], label: e.target.value };
                            setShiftSlots(n);
                          }}
                          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, fontWeight: 700, color: '#0369A1', minWidth: 0 }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCustomAlert({
                              isOpen: true,
                              type: 'confirm',
                              title: 'Delete Shift Slot',
                              message: `Remove "${slot.label || 'Shift'}" (${slot.start} - ${slot.end})?`,
                              onConfirm: () => {
                                const remaining = shiftSlots.filter((_, i) => i !== idx);
                                setShiftSlots(remaining);
                                if (remaining.length === 1) {
                                  // Revert back to standard start & end if user clears down to 1
                                  setShiftStart(remaining[0].start);
                                  setShiftEnd(remaining[0].end);
                                }
                                playSound('trash');
                                setCustomAlert({ isOpen: false });
                              }
                            });
                          }}
                          style={{ padding: '6px 10px', background: '#FEE2E2', color: '#EF4444', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: 'pointer', lineHeight: 1 }}
                        >
                          ✕
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="time"
                          value={slot.start}
                          onChange={e => {
                            const n = [...shiftSlots];
                            n[idx] = { ...n[idx], start: e.target.value };
                            setShiftSlots(n);
                          }}
                          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                        />
                        <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>to</span>
                        <input
                          type="time"
                          value={slot.end}
                          onChange={e => {
                            const n = [...shiftSlots];
                            n[idx] = { ...n[idx], end: e.target.value };
                            setShiftSlots(n);
                          }}
                          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
                        />
                      </div>
                    </motion.div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: '#0369A1', fontWeight: 600 }}>
                      Total {shiftSlots.length} shifts scheduled
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (shiftSlots.length > 0) {
                          setShiftStart(shiftSlots[0].start);
                          setShiftEnd(shiftSlots[shiftSlots.length - 1].end);
                        }
                        setShiftSlots([]);
                      }}
                      style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                    >
                      Reset to single shift
                    </button>
                  </div>
                </div>
              )}
            </div>

            <label style={{ display: 'block', marginTop: 10, fontSize: 14, fontWeight: 600 }}>Block Length
              <select value={blockLen} onChange={e => setBlockLen(Number(e.target.value))} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc' }}>
                <option value={30}>30 mins</option>
                <option value={60}>60 mins</option>
              </select>
            </label>

            {/* --- Scheduled Breaks Section --- */}
            <div style={{ marginTop: 20, padding: 16, background: '#FFF8F0', borderRadius: 16, border: '1px solid #FFE0B2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#E65100' }}>☕ Scheduled Breaks</span>
                <button onClick={() => setScheduledBreaks(prev => [...prev, { start: '12:00', end: '12:30', label: 'Lunch' }])}
                  style={{ padding: '6px 14px', background: '#FF9800', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Add Break</button>
              </div>

              {scheduledBreaks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '12px 0', color: '#aaa', fontSize: 13 }}>No breaks scheduled. Add one to auto-insert break blocks.</div>
              )}

              {scheduledBreaks.map((sb, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  style={{ marginBottom: 8, padding: 10, background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input type="text" value={sb.label} placeholder="Break Name"
                      onChange={e => { const n = [...scheduledBreaks]; n[idx] = { ...n[idx], label: e.target.value }; setScheduledBreaks(n); }}
                      style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14, fontWeight: 600, minWidth: 0 }} />

                    <button
                      type="button"
                      onClick={() => {
                        setCustomAlert({
                          isOpen: true,
                          type: 'confirm',
                          title: 'Delete Scheduled Break',
                          message: `Remove scheduled break "${sb.label || 'Break'}" (${sb.start} - ${sb.end})?`,
                          onConfirm: () => {
                            setScheduledBreaks(prev => prev.filter((_, i) => i !== idx));
                            playSound('trash');
                            setCustomAlert({ isOpen: false });
                          }
                        });
                      }}
                      style={{ padding: '6px 10px', background: '#FFEBEE', color: '#EF4444', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="time" value={sb.start}
                      onChange={e => { const n = [...scheduledBreaks]; n[idx] = { ...n[idx], start: e.target.value }; setScheduledBreaks(n); }}
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }} />

                    <span style={{ color: '#999', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>to</span>

                    <input type="time" value={sb.end}
                      onChange={e => { const n = [...scheduledBreaks]; n[idx] = { ...n[idx], end: e.target.value }; setScheduledBreaks(n); }}
                      style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }} />
                  </div>

                </motion.div>
              ))}

              {scheduledBreaks.length > 0 && (
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Break blocks will be auto-inserted into the timeline when you generate blocks.</div>
              )}
            </div>

            <button onClick={generateBlocks} style={{ width: '100%', padding: 14, background: '#1CB0F6', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, marginTop: 20 }}>Generate Blocks</button>
          </motion.div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}>
            
            {/* LEFT COLUMN: Clocks, Break Controls, Budget & Break Insights */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* DIGITAL CLOCK & BREAK CONTROLS - Only show for today */}
            {isToday && (
              <>
                {/* --- LIVE SHIFT COUNTDOWN & STATUS CARD (PHASE 1) --- */}
                {!setupMode && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      background: '#fff',
                      borderRadius: 18,
                      padding: '14px 16px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      marginBottom: 14
                    }}
                  >
                    {/* Top status indicator row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: clockStatus === 'active' ? '#22C55E' : clockStatus === 'break' ? '#F59E0B' : '#94A3B8',
                          boxShadow: clockStatus === 'active' ? '0 0 8px #22C55E' : 'none'
                        }} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {clockStatus === 'active'
                            ? (timingInfo.currentSlot ? `${timingInfo.currentSlot.label} In Progress` : 'Shift In Progress')
                            : clockStatus === 'break'
                              ? 'On Break'
                              : timingInfo.isPastFinalShift
                                ? 'Shift Completed'
                                : 'Shift Off-Duty'}
                        </span>
                      </div>

                      {/* Small badge for target shift schedule */}
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '3px 8px', borderRadius: 12 }}>
                        {effectiveShiftStart} – {effectiveShiftEnd}
                      </span>
                    </div>

                    {/* Section 1: End Shift Remaining Time / Active Shift Remaining */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: 10
                    }}>
                      {/* Active Shift / Slot countdown */}
                      <div style={{
                        background: timingInfo.currentSlot && timingInfo.isShiftStarted ? '#F0FDF4' : '#F8FAFC',
                        borderRadius: 14,
                        padding: '10px 12px',
                        border: timingInfo.currentSlot && timingInfo.isShiftStarted ? '1px solid #BBF7D0' : '1px solid #E2E8F0'
                      }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: timingInfo.currentSlot && timingInfo.isShiftStarted ? '#15803D' : '#64748B', textTransform: 'uppercase' }}>
                          ⏱️ Current Shift Remaining
                        </div>
                        <div style={{
                          fontSize: 'clamp(17px, 3.8vw, 22px)',
                          fontWeight: 900,
                          color: timingInfo.currentSlot && timingInfo.isShiftStarted ? '#166534' : '#94A3B8',
                          fontVariantNumeric: 'tabular-nums',
                          marginTop: 2
                        }}>
                          {!timingInfo.isShiftStarted
                            ? '--:--:--'
                            : timingInfo.currentSlot
                              ? formatStopwatch(timingInfo.currentSlotRemainingSec)
                              : timingInfo.isPastFinalShift ? '00:00:00' : 'Between Shifts'}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748B', marginTop: 2, fontWeight: 600 }}>
                          {!timingInfo.isShiftStarted
                            ? 'Shift not started'
                            : timingInfo.currentSlot
                              ? `${Math.round(timingInfo.currentSlotProgress)}% completed`
                              : timingInfo.isPastFinalShift ? 'Shift ended' : 'No active slot'}
                        </div>
                        {/* Progress Bar */}
                        {timingInfo.currentSlot && timingInfo.isShiftStarted && (
                          <div style={{ width: '100%', height: 4, background: '#DCFCE7', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
                            <div style={{ width: `${timingInfo.currentSlotProgress}%`, height: '100%', background: '#22C55E', transition: 'width 0.5s linear' }} />
                          </div>
                        )}
                      </div>

                      {/* Day Shift End Remaining (Only shows active countdown when shift is actually started) */}
                      <div style={{
                        background: timingInfo.isShiftStarted && !timingInfo.isPastFinalShift ? '#EFF6FF' : '#F8FAFC',
                        borderRadius: 14,
                        padding: '10px 12px',
                        border: timingInfo.isShiftStarted && !timingInfo.isPastFinalShift ? '1px solid #BFDBFE' : '1px solid #E2E8F0'
                      }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: timingInfo.isShiftStarted && !timingInfo.isPastFinalShift ? '#1D4ED8' : '#64748B', textTransform: 'uppercase' }}>
                          🏁 Shift End Remaining
                        </div>
                        <div style={{
                          fontSize: 'clamp(17px, 3.8vw, 22px)',
                          fontWeight: 900,
                          color: timingInfo.isShiftStarted && !timingInfo.isPastFinalShift ? '#1E40AF' : '#64748B',
                          fontVariantNumeric: 'tabular-nums',
                          marginTop: 2
                        }}>
                          {!timingInfo.isShiftStarted
                            ? 'Not Started'
                            : timingInfo.isPastFinalShift
                              ? 'Shift Over'
                              : formatStopwatch(timingInfo.finalShiftRemainingSec)}
                        </div>
                        <div style={{ fontSize: 10, color: '#64748B', marginTop: 2, fontWeight: 600 }}>
                          {!timingInfo.isShiftStarted ? `Scheduled End: ${fmt12h(timingInfo.overallEndStr)}` : `Target end: ${fmt12h(timingInfo.overallEndStr)}`}
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Next Shift Start Countdown (Dynamic countdown between shifts / for tomorrow) */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
                      borderRadius: 12,
                      padding: '8px 12px',
                      border: '1px solid #FDE68A'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 16 }}>🚀</span>
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#B45309', textTransform: 'uppercase' }}>
                            Next Shift Countdown
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#78350F' }}>
                            {timingInfo.nextShiftLabel} ({fmt12h(timingInfo.nextShiftStartStr)})
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontSize: 14,
                          fontWeight: 900,
                          color: '#92400E',
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {timingInfo.nextShiftRemainingSec > 0
                            ? `${Math.floor(timingInfo.nextShiftRemainingSec / 3600)}h ${Math.floor((timingInfo.nextShiftRemainingSec % 3600) / 60)}m ${timingInfo.nextShiftRemainingSec % 60}s`
                            : '0m'}
                        </div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: '#B45309' }}>
                          {timingInfo.isNextShiftTomorrow ? 'Tomorrow' : 'Later Today'}
                        </div>
                      </div>
                    </div>

                    {/* Current Block Remaining (if actively in a 30m / 60m work block) */}
                    {currentBlock && !currentBlock.isBreak && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#FAF5FF',
                        borderRadius: 12,
                        padding: '6px 12px',
                        border: '1px solid #E9D5FF'
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#7E22CE' }}>
                          🎯 Current Block ({fmt12h(currentBlock.start)} – {fmt12h(currentBlock.end)})
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#6B21A8', fontVariantNumeric: 'tabular-nums' }}>
                          {formatStopwatch(timingInfo.currentBlockRemainingSec)} left
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                <div style={{
                  background: clockStatus === 'break'
                    ? 'linear-gradient(135deg, rgba(255,244,229,0.95), rgba(255,237,213,0.95))'
                    : isInScheduledBreak
                      ? 'linear-gradient(135deg, rgba(255,248,238,0.95), rgba(255,243,224,0.95))'
                      : '#fff',
                  padding: 20, borderRadius: 20,
                  boxShadow: clockStatus === 'break'
                    ? `0 4px 20px rgba(${currentBreakType.color}, 0.15), 0 0 0 1px rgba(255,176,32,0.1)`
                    : isInScheduledBreak
                      ? '0 4px 20px rgba(255,152,0,0.12), 0 0 0 1px rgba(255,176,32,0.15)'
                      : '0 4px 12px rgba(0,0,0,0.05)',
                  marginBottom: 16, textAlign: 'center',
                  position: 'relative', overflow: 'hidden',
                  border: isOverBreak ? '2px solid #FF4B4B' : isInScheduledBreak ? '2px solid #FF9800' : 'none',
                }}>

              {/* Zen floating particles during break */}
              {clockStatus === 'break' && (
                <>
                  {[...Array(6)].map((_, i) => (
                    <motion.div key={`particle-${i}`}
                      animate={{
                        y: [-20, -60 - Math.random() * 40, -20],
                        x: [0, (Math.random() - 0.5) * 30, 0],
                        opacity: [0.2, 0.5, 0.2],
                      }}
                      transition={{ duration: 4 + Math.random() * 3, repeat: Infinity, delay: i * 0.8 }}
                      style={{
                        position: 'absolute',
                        bottom: 10 + Math.random() * 50,
                        left: `${15 + i * 14}%`,
                        width: 6 + Math.random() * 4,
                        height: 6 + Math.random() * 4,
                        borderRadius: '50%',
                        background: currentBreakType.color,
                        opacity: 0.2,
                        pointerEvents: 'none',
                      }}
                    />
                  ))}
                </>
              )}

              {clockStatus === 'idle' ? (
                <>
                  <div style={{ fontSize: 14, color: '#888', fontWeight: 600, marginBottom: 8 }}>SHIFT NOT STARTED</div>
                  <div style={{ fontSize: 40, fontWeight: 800, color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>00:00:00</div>
                  <button onClick={handleClockIn} style={{ marginTop: 16, width: '100%', padding: 14, background: '#1CB0F6', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16 }}>Clock In</button>
                </>
              ) : clockStatus === 'active' ? (
                <>
                  {/* Scheduled Break Post-Ending Action Banner */}
                  {scheduledBreakPrompt && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                      style={{ marginBottom: 14, padding: 14, background: '#FFF3E0', border: '2px solid #FF9800', borderRadius: 14, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#E65100' }}>⏰ {scheduledBreakPrompt.label} Ended ({fmt12h(scheduledBreakPrompt.end)})</span>
                        <button onClick={() => { dismissedScheduledBreakRef.current = scheduledBreakPrompt.blockId; setScheduledBreakPrompt(null); }}
                          style={{ border: 'none', background: 'none', color: '#999', fontSize: 16, cursor: 'pointer', padding: 2 }}>✕</button>
                      </div>
                      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
                        Scheduled time completed! Would you like to resume shift work, extend schedule, or adjust into main break?
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <button onClick={() => { dismissedScheduledBreakRef.current = scheduledBreakPrompt.blockId; setScheduledBreakPrompt(null); playSound('success'); }}
                          style={{ flex: '1 1 auto', padding: '8px 12px', background: '#58CC02', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          ✅ Resume Work
                        </button>
                        <button onClick={() => { adjustScheduledBreak(scheduledBreakPrompt.blockId, 5); }}
                          style={{ padding: '8px 10px', background: '#FF9800', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          +5m Extend
                        </button>
                        <button onClick={() => { adjustScheduledBreak(scheduledBreakPrompt.blockId, 10); }}
                          style={{ padding: '8px 10px', background: '#FF9800', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          +10m Extend
                        </button>
                        <button onClick={() => {
                          dismissedScheduledBreakRef.current = scheduledBreakPrompt.blockId;
                          setScheduledBreakPrompt(null);
                          setSelectedBreakType('lunch');
                          setSelectedBreakMins(15);
                          setShowBreakOptions(true);
                        }}
                          style={{ flex: '1 1 100%', padding: '8px 12px', background: '#fff', color: '#E65100', border: '1px solid #FF9800', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          ☕ Start Main Break
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {isInScheduledBreak ? (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                      style={{ marginBottom: 12, padding: '12px 16px', background: 'linear-gradient(135deg, #FF9800, #F57C00)', borderRadius: 14, color: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ fontSize: 24 }}>☕</motion.div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>SCHEDULED BREAK TIME</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>
                        {currentBlock.breakLabel || 'Break'} • {fmt12h(currentBlock.start)} – {fmt12h(currentBlock.end)} • {scheduledBreakRemainingMins}m left
                      </div>
                      {/* Live Quick Adjust Stepper for Scheduled Break */}
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
                        <button onClick={() => adjustScheduledBreak(currentBlock.id, -5)}
                          style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          −5m
                        </button>
                        <button onClick={() => adjustScheduledBreak(currentBlock.id, 5)}
                          style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          +5m
                        </button>
                        <button onClick={() => adjustScheduledBreak(currentBlock.id, 10)}
                          style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          +10m
                        </button>
                        <button onClick={() => { setSelectedBreakType(null); setShowBreakOptions(true); }}
                          style={{ padding: '4px 12px', background: '#fff', color: '#F57C00', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                          Switch to Main Break
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div style={{ fontSize: 14, color: '#1CB0F6', fontWeight: 700, marginBottom: 4 }}>ACTIVE SHIFT</div>
                  )}

                  {/* Nudge ring */}
                  <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                    {breakNudgeLevel > 0 && (
                      <motion.div
                        animate={{ scale: [1, 1.05, 1], opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        style={{
                          position: 'absolute', top: -6, left: -6, right: -6, bottom: -6,
                          borderRadius: 16,
                          border: `2px solid ${breakNudgeLevel >= 3 ? '#EF4444' : breakNudgeLevel >= 2 ? '#F97316' : '#F59E0B'}`,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    <div style={{ fontSize: 'clamp(32px, 8vw, 44px)', fontWeight: 800, color: '#333', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>{formatStopwatch(elapsedShiftSec)}</div>
                  </div>

                  {/* Nudge messages */}
                  <AnimatePresence>
                    {breakNudgeLevel >= 1 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{
                          marginTop: 8, padding: '8px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                          background: breakNudgeLevel >= 3 ? 'rgba(239,68,68,0.1)' : breakNudgeLevel >= 2 ? 'rgba(249,115,22,0.1)' : 'rgba(245,158,11,0.1)',
                          color: breakNudgeLevel >= 3 ? '#EF4444' : breakNudgeLevel >= 2 ? '#F97316' : '#F59E0B',
                        }}>
                        {breakNudgeLevel >= 3 ? '⚠️ 3+ hours! Please take a break for your health!' :
                         breakNudgeLevel >= 2 ? '🕐 2 hours without a break! Consider a short rest.' :
                         '💡 90+ min of work. A short break might help!'}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!showBreakOptions ? (
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <motion.button
                        onClick={() => setShowBreakOptions(true)}
                        animate={{ scale: [1, 1.02, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ flex: 1, padding: 12, background: '#FFF4E5', color: '#FFB020', border: '2px solid #FFB020', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}
                      >☕ Take Break</motion.button>
                      <button onClick={handleClockOut} style={{ flex: 1, padding: 12, background: '#f5f5f5', color: '#888', border: 'none', borderRadius: 12, fontWeight: 700 }}>Clock Out</button>
                    </div>
                  ) : (
                    /* --- BREAK TYPE SELECTOR --- */
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
                      style={{ marginTop: 16, padding: 16, background: '#FAFAFA', borderRadius: 16, border: '1px solid #eee' }}>

                      {!selectedBreakType ? (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#333', marginBottom: 12 }}>Choose Break Type</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                            {BREAK_TYPES.map((bt, idx) => (
                              <motion.button key={bt.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: idx * 0.05, type: 'spring', damping: 15 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                  setSelectedBreakType(bt.id);
                                  setSelectedBreakMins(bt.defaultMins);
                                }}
                                style={{
                                  padding: '14px 8px', background: '#fff', border: `2px solid ${bt.color}20`,
                                  borderRadius: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', gap: 6, transition: '0.2s',
                                }}>
                                <div style={{ fontSize: 28 }}>{bt.icon}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: bt.color }}>{bt.label}</div>
                                <div style={{ fontSize: 11, color: '#999' }}>{bt.defaultMins}m</div>
                              </motion.button>
                            ))}
                          </div>
                          <button onClick={() => setShowBreakOptions(false)} style={{ width: '100%', marginTop: 12, padding: 10, background: 'none', color: '#888', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                        </>
                      ) : (
                        /* Duration Adjuster */
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          {(() => {
                            const bt = BREAK_TYPES.find(t => t.id === selectedBreakType);
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                  <div style={{ fontSize: 36 }}>{bt.icon}</div>
                                  <div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: bt.color }}>{bt.label}</div>
                                    <div style={{ fontSize: 12, color: '#888' }}>Adjust duration</div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 20 }}>
                                  <motion.button whileTap={{ scale: 0.9 }}
                                    onClick={() => setSelectedBreakMins(Math.max(5, selectedBreakMins - 5))}
                                    style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid #e0e0e0', background: '#fff', fontSize: 20, fontWeight: 700, color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    −
                                  </motion.button>
                                  <motion.div key={selectedBreakMins}
                                    initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={SPRING}
                                    style={{ fontSize: 42, fontWeight: 800, color: bt.color, minWidth: 80, textAlign: 'center' }}>
                                    {selectedBreakMins}<span style={{ fontSize: 16, fontWeight: 600, color: '#999' }}>m</span>
                                  </motion.div>
                                  <motion.button whileTap={{ scale: 0.9 }}
                                    onClick={() => setSelectedBreakMins(Math.min(120, selectedBreakMins + 5))}
                                    style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid #e0e0e0', background: '#fff', fontSize: 20, fontWeight: 700, color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    +
                                  </motion.button>
                                </div>

                                {/* Quick presets */}
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 }}>
                                  {[5, 10, 15, 20, 25, 30, 45, 60].map(m => (
                                    <button key={m} onClick={() => setSelectedBreakMins(m)}
                                      style={{
                                        padding: '6px 10px', borderRadius: 16, border: 'none',
                                        background: selectedBreakMins === m ? bt.color : '#f0f0f0',
                                        color: selectedBreakMins === m ? '#fff' : '#666',
                                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                                      }}>{m}m</button>
                                  ))}
                                </div>

                                {/* Custom Exact Time Input & 5-min Range Sub-options */}
                                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, marginBottom: 16 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Custom Select Time:</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <input
                                        type="number"
                                        min={1}
                                        max={180}
                                        value={selectedBreakMins}
                                        onChange={(e) => {
                                          const v = parseInt(e.target.value, 10);
                                          if (!isNaN(v)) setSelectedBreakMins(Math.max(1, Math.min(180, v)));
                                        }}
                                        style={{
                                          width: 60, padding: '6px 8px', borderRadius: 8,
                                          border: `2px solid ${bt.color}`, fontSize: 14, fontWeight: 700,
                                          textAlign: 'center', color: bt.color, outline: 'none'
                                        }}
                                      />
                                      <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>mins</span>
                                    </div>
                                  </div>

                                  {/* Every 1-min options within the current 5-min interval bracket (e.g. 35 to 40 -> 35, 36, 37, 38, 39, 40) */}
                                  <div style={{ marginTop: 10 }}>
                                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 6 }}>
                                      Interval Range ({Math.floor(selectedBreakMins / 5) * 5} – {Math.floor(selectedBreakMins / 5) * 5 + 5}m):
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                      {(() => {
                                        const base = Math.floor(selectedBreakMins / 5) * 5;
                                        return [0, 1, 2, 3, 4, 5].map(offset => {
                                          const val = Math.max(1, base + offset);
                                          const isActive = selectedBreakMins === val;
                                          return (
                                            <button
                                              key={val}
                                              type="button"
                                              onClick={() => setSelectedBreakMins(val)}
                                              style={{
                                                flex: 1, padding: '5px 0', borderRadius: 6,
                                                border: isActive ? `2px solid ${bt.color}` : '1px solid #E2E8F0',
                                                background: isActive ? bt.color : '#F8FAFC',
                                                color: isActive ? '#fff' : '#475569',
                                                fontSize: 12, fontWeight: 700, cursor: 'pointer'
                                              }}
                                            >
                                              {val}
                                            </button>
                                          );
                                        });
                                      })()}
                                    </div>
                                  </div>
                                </div>

                                <motion.button whileTap={{ scale: 0.97 }}
                                  onClick={() => startBreak(selectedBreakMins, selectedBreakType)}
                                  style={{
                                    width: '100%', padding: 14, background: bt.color, color: '#fff',
                                    border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer',
                                    boxShadow: `0 4px 16px ${bt.color}40`,
                                  }}>
                                  {bt.icon} Start {bt.label} Break
                                </motion.button>
                                <button onClick={() => setSelectedBreakType(null)}
                                  style={{ width: '100%', marginTop: 8, padding: 8, background: 'none', color: '#888', border: 'none', fontWeight: 600, cursor: 'pointer' }}>← Back to types</button>
                              </>
                            );
                          })()}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </>
              ) : (
                /* --- ON BREAK: Breathing Circle Timer + Zen Mode --- */
                <>
                  <div style={{ fontSize: 12, color: currentBreakType.color, fontWeight: 700, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {currentBreakType.icon} {currentBreakType.label} Break
                  </div>
                  <div style={{ fontSize: 14, color: isOverBreak ? '#FF4B4B' : '#888', fontWeight: 700, marginBottom: 12, textTransform: 'uppercase' }}>
                    {isOverBreak ? '⏰ Over Break Time!' : 'Relax & Recharge'}
                  </div>

                  {/* Breathing Circle Timer */}
                  <div style={{ position: 'relative', width: 'min(180px, 60vw)', height: 'min(180px, 60vw)', margin: '0 auto 16px' }}>
                    {/* Background circle */}
                    <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                      <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="8" />
                      <motion.circle cx="100" cy="100" r="88" fill="none"
                        stroke={isOverBreak ? '#FF4B4B' : currentBreakType.color}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={553}
                        animate={{
                          strokeDashoffset: isOverBreak ? 0 : 553 * (1 - breakProgress),
                        }}
                        transition={{ duration: 0.5 }}
                      />
                    </svg>
                    {/* Center content */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <motion.div
                        animate={{ scale: isOverBreak ? [1, 1.15, 1] : [1, 1.1, 1] }}
                        transition={{ duration: isOverBreak ? 0.5 : 4, repeat: Infinity }}
                        style={{ fontSize: 32, marginBottom: 2 }}>{currentBreakType.icon}</motion.div>
                      <div style={{ fontSize: 'clamp(20px, 6vw, 26px)', fontWeight: 800, color: isOverBreak ? '#FF4B4B' : '#333', fontVariantNumeric: 'tabular-nums' }}>
                        {formatStopwatch(breakRemainingSec)}
                      </div>
                    </div>
                  </div>

                  {/* Zen Quote */}
                  <AnimatePresence mode="wait">
                    <motion.div key={zenQuoteIdx}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.5 }}
                      style={{ fontSize: 14, color: '#888', fontStyle: 'italic', marginBottom: 12, minHeight: 20 }}>
                      {ZEN_QUOTES[zenQuoteIdx]}
                    </motion.div>
                  </AnimatePresence>

                  <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>Shift Time: {formatStopwatch(elapsedShiftSec)}</div>

                  {/* Over-break warning */}
                  {isOverBreak && (
                    <motion.div
                      animate={{ x: [-2, 2, -2, 2, 0] }}
                      transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 2 }}
                      style={{ padding: '10px 16px', background: 'rgba(255,75,75,0.1)', borderRadius: 12, marginBottom: 12, fontSize: 14, fontWeight: 700, color: '#FF4B4B' }}>
                      ⏰ Time to get back! Your break has ended.
                    </motion.div>
                  )}

                  <motion.button
                    onClick={handleEndBreak}
                    whileTap={{ scale: 0.97 }}
                    animate={isOverBreak ? { x: [-1, 1, -1, 0] } : {}}
                    transition={isOverBreak ? { duration: 0.3, repeat: Infinity, repeatDelay: 3 } : {}}
                    style={{ width: '100%', padding: 14, background: '#58CC02', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 16px rgba(88,204,2,0.3)' }}>
                    End Break & Resume Shift
                  </motion.button>
                </>
              )}
            </div>
            </>
            )}

            {/* --- BREAK BUDGET BAR --- */}
            {isToday && clockStatus !== 'idle' && !setupMode && completedBreaks.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: '#fff', padding: 16, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>☕ Break Budget</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: budgetColor }}>{breakUsedMins}m / {breakBudgetMins}m</div>
                </div>
                <div style={{ height: 10, background: '#f0f0f0', borderRadius: 10, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(breakBudgetPct, 100)}%` }}
                    transition={{ type: 'spring', damping: 20 }}
                    style={{
                      height: '100%', borderRadius: 10,
                      background: `linear-gradient(90deg, ${budgetColor}CC, ${budgetColor})`,
                    }}
                  />
                </div>
                {breakBudgetPct > 100 && (
                  <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 600, marginTop: 4 }}>⚠️ Over budget by {breakUsedMins - breakBudgetMins}m</div>
                )}
              </motion.div>
            )}

            {/* --- BREAK TIMELINE --- */}
            {isToday && clockStatus !== 'idle' && completedBreaks.length > 0 && !setupMode && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: '#fff', padding: 16, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16 }}>
                <BreakTimeline shiftStartTime={effectiveShiftStart} shiftEndTime={effectiveShiftEnd} breakHistory={breakHistory} currentTime={now} />
              </motion.div>
            )}

            {/* --- BREAK INSIGHTS --- */}
            {isToday && completedBreaks.length > 0 && !setupMode && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16, overflow: 'hidden' }}>
                <button onClick={() => setShowBreakInsights(!showBreakInsights)}
                  style={{ width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#555' }}>📊 Break Insights</span>
                  <motion.span animate={{ rotate: showBreakInsights ? 180 : 0 }} style={{ fontSize: 16, color: '#aaa' }}>▼</motion.span>
                </button>
                <AnimatePresence>
                  {showBreakInsights && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 16px 16px' }}>
                        {/* Insight cards row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                          <div style={{ background: '#F0F9FF', padding: 12, borderRadius: 12, textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#1CB0F6' }}>{completedBreaks.length}</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#888' }}>Total Breaks</div>
                          </div>
                          <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 12, textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981' }}>{avgBreakMins}m</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#888' }}>Avg Duration</div>
                          </div>
                          <div style={{ background: '#FFF7ED', padding: 12, borderRadius: 12, textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#F97316' }}>{longestBreakMins}m</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#888' }}>Longest Break</div>
                          </div>
                          <div style={{ background: '#F5F3FF', padding: 12, borderRadius: 12, textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED' }}>{onTimeBreaks}/{completedBreaks.length}</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#888' }}>On Time</div>
                          </div>
                        </div>

                        {/* Break history list */}
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 8, letterSpacing: 1 }}>BREAK LOG</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {completedBreaks.map((brk, i) => {
                            const bt = BREAK_TYPES.find(t => t.id === brk.type) || BREAK_TYPES[0];
                            const durMins = Math.round(brk.durationMs / 60000);
                            const plannedMins = Math.round(brk.plannedMs / 60000);
                            const onTime = brk.durationMs <= brk.plannedMs + 120000;
                            return (
                              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f9f9f9', borderRadius: 10 }}>
                                <div style={{ fontSize: 20 }}>{bt.icon}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{bt.label}</div>
                                  <div style={{ fontSize: 11, color: '#999' }}>
                                    {new Date(brk.startMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' })} – {new Date(brk.endMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' })}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: onTime ? '#10B981' : '#F97316' }}>{durMins}m</div>
                                  <div style={{ fontSize: 10, color: '#bbb' }}>/ {plannedMins}m</div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Earned Break Banner */}
            <AnimatePresence>
              {earnedBreak > 0 && clockStatus === 'active' && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                  style={{ marginBottom: 16, padding: 16, background: 'linear-gradient(135deg, #A855F7, #7E22CE)', borderRadius: 16, color: '#fff', boxShadow: '0 4px 14px rgba(168,85,247,0.3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>🎉 Earned Break: +{earnedBreak} mins</div>
                      {earnedBreakReason && (
                        <div style={{ fontSize: 12, opacity: 0.92, marginTop: 3, fontWeight: 500, color: '#F3E8FF' }}>
                          💡 <b>Why:</b> {earnedBreakReason}
                        </div>
                      )}
                    </div>
                    <button onClick={() => startBreak(earnedBreak, 'rest')} style={{ background: '#fff', color: '#7E22CE', border: 'none', padding: '8px 16px', borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>Start Break</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            </div>{/* END OF LEFT COLUMN */}

            {/* RIGHT COLUMN: Production Stats, Timeline Blocks, Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Smart Production Pacing Card (Phase 2 Auto-Suggestion Engine) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'linear-gradient(135deg, #0F172A, #1E293B)',
                borderRadius: 18,
                padding: '16px 18px',
                color: '#fff',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🎯</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: -0.2 }}>
                      Monthly Production Pace
                    </div>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>
                      Target: {productionMetrics.mTarget.toLocaleString()} {unit} • {productionMetrics.workDaysRemaining} work shifts left
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowProductionModal(true)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Configure ⚙️
                </button>
              </div>

              {/* Progress bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ color: '#38BDF8' }}>
                    {productionMetrics.totalMonthProduced.toLocaleString()} Produced ({productionMetrics.monthProgressPct}%)
                  </span>
                  <span style={{
                    color: productionMetrics.paceStatus === 'ahead' ? '#4ADE80' : productionMetrics.paceStatus === 'on-track' ? '#FACC15' : '#F87171'
                  }}>
                    {productionMetrics.paceStatus === 'ahead' ? '🚀 Ahead of Schedule' : productionMetrics.paceStatus === 'on-track' ? '⚡ On Track' : '⚠️ Behind Schedule'}
                  </span>
                </div>
                <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${productionMetrics.monthProgressPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                      height: '100%',
                      background: productionMetrics.paceStatus === 'ahead'
                        ? 'linear-gradient(90deg, #10B981, #34D399)'
                        : productionMetrics.paceStatus === 'on-track'
                          ? 'linear-gradient(90deg, #38BDF8, #818CF8)'
                          : 'linear-gradient(90deg, #F87171, #EF4444)'
                    }}
                  />
                </div>
              </div>

              {/* Auto-suggested targets pill badges */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 8,
                marginTop: 2
              }}>
                {/* Auto Suggested Daily Target */}
                <div style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  padding: '8px 10px',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                    💡 Auto Daily Target
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#38BDF8', marginTop: 2 }}>
                    {productionMetrics.dynamicSuggestedDailyTarget} <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>{unit}/day</span>
                  </div>
                  {target !== productionMetrics.dynamicSuggestedDailyTarget && (
                    <button
                      type="button"
                      onClick={() => {
                        setTarget(productionMetrics.dynamicSuggestedDailyTarget);
                        localStorage.setItem('shiftTracker_defaultTarget', productionMetrics.dynamicSuggestedDailyTarget);
                        playSound('success');
                      }}
                      style={{
                        marginTop: 4,
                        padding: '2px 8px',
                        background: '#0284C7',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 9.5,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Apply ({productionMetrics.dynamicSuggestedDailyTarget})
                    </button>
                  )}
                </div>

                {/* Auto Suggested Weekly Target */}
                <div style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  padding: '8px 10px',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                    📅 Weekly Quota
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#A78BFA', marginTop: 2 }}>
                    {productionMetrics.dynamicSuggestedWeeklyTarget.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>{unit}</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: '#94A3B8', marginTop: 4 }}>
                    Base: {productionMetrics.baseWeeklyTarget.toLocaleString()}
                  </div>
                </div>

                {/* Projected Month Total */}
                <div style={{
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  padding: '8px 10px',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                    📈 Run-rate Projection
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#FACC15', marginTop: 2 }}>
                    {productionMetrics.projectedTotal.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>({productionMetrics.projectedPct}%)</span>
                  </div>
                  <div style={{ fontSize: 9.5, color: '#94A3B8', marginTop: 4 }}>
                    Pacing forecast
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, background: '#fff', padding: 16, borderRadius: 16, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>TOTAL PRODUCED</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#1CB0F6' }}>{totalProduced}</div>
              </div>
              <div style={{ flex: 1, background: '#fff', padding: 16, borderRadius: 16, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>REMAINING</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#FFB020' }}>{Math.max(0, target - totalProduced)}</div>
              </div>
            </div>

            {/* Blocks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {blocks.map((b, i) => {
                const isActiveTime = i === currentBlockIdx;
                const blockBreakMins = calcBlockBreakMins(b, breakHistory);
                const blockTotalMins = timeToMinutes(b.end) - timeToMinutes(b.start);
                const statusColor = b.isBreak ? '#FFB020' : b.logged ? (b.actual >= b.target ? '#58CC02' : '#FF4B4B') : '#E0E0E0';

                if (b.isBreak) {
                  const matchedBreak = breakHistory.find(brk => {
                    if (!brk.startMs) return false;
                    const bs = new Date(brk.startMs).getHours() * 60 + new Date(brk.startMs).getMinutes();
                    const be = brk.endMs ? new Date(brk.endMs).getHours() * 60 + new Date(brk.endMs).getMinutes() : 1440;
                    return bs < timeToMinutes(b.end) && be > timeToMinutes(b.start);
                  });
                  const bType = matchedBreak ? BREAK_TYPES.find(t => t.id === matchedBreak.type) : null;
                  return (
                    <motion.div key={i} layout style={{ background: '#FFF8EE', padding: 16, borderRadius: 16, borderLeft: `6px solid ${bType?.color || '#FFB020'}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.85 }}>
                      <div style={{ fontSize: 28 }}>{bType?.icon || '☕'}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>{fmt12h(b.start)} - {fmt12h(b.end)}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: bType?.color || '#FFB020' }}>{b.breakLabel || bType?.label || 'Break'} Block</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#999', background: '#f0f0f0', padding: '4px 10px', borderRadius: 8 }}>{blockTotalMins}m</div>
                    </motion.div>
                  );
                }

                const isMissed = !b.isBreak && b.logged && b.actual < b.target;
                const hasReason = Boolean(b.missReason?.trim());

                return (
                  <motion.div key={i} layout style={{
                    position: 'relative',
                    background: clockStatus === 'break' && isActiveTime ? '#FFF4E5' : '#fff',
                    padding: 16,
                    borderRadius: 16,
                    borderLeft: `6px solid ${clockStatus === 'break' && isActiveTime ? currentBreakType.color : statusColor}`,
                    boxShadow: isMissed && !hasReason ? '0 4px 14px rgba(239, 68, 68, 0.18)' : isActiveTime ? '0 4px 12px rgba(28,176,246,0.1)' : '0 1px 4px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    opacity: (clockStatus === 'break' && isActiveTime) ? 0.8 : 1,
                    border: isMissed && !hasReason ? '1.5px solid #FCA5A5' : '1px solid transparent'
                  }}>
                    {/* StarMaker Snake Beam & 3s Emote Overlay */}
                    <AnimatePresence>
                      {activeEmote?.blockId === b.id && (
                        <StarMakerEmote
                          type={activeEmote.type}
                          onComplete={() => setActiveEmote(null)}
                        />
                      )}
                    </AnimatePresence>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>
                          {b.shiftLabel && <span style={{ color: '#0284C7', background: '#E0F2FE', padding: '1px 6px', borderRadius: 4, marginRight: 6, fontSize: 11 }}>{b.shiftLabel}</span>}
                          {fmt12h(b.start)} - {fmt12h(b.end)}
                          {isActiveTime && clockStatus === 'active' && <span style={{ color: '#1CB0F6' }}> • Active</span>}
                          {isActiveTime && clockStatus === 'break' && <span style={{ color: currentBreakType.color }}> • {currentBreakType.icon} {currentBreakType.label}</span>}
                          {isMissed && (
                            <span style={{ marginLeft: 6, color: hasReason ? '#D97706' : '#EF4444', background: hasReason ? '#FEF3C7' : '#FEE2E2', padding: '1px 7px', borderRadius: 6, fontSize: 10.5, fontWeight: 800 }}>
                              {hasReason ? '⚠️ Deficit Explained' : '🚨 Reason Required'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>Block Target: {b.target.toFixed(1)}</div>
                        {blockBreakMins > 0 && <div style={{ fontSize: 11, color: '#F97316', fontWeight: 600 }}>☕ {blockBreakMins}m break · target adjusted</div>}
                        {b.logged && <div style={{ fontSize: 12, color: '#888' }}>Block Prod: {b.actual}</div>}
                      </div>
                      {b.logged ? (
                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
                           <button onClick={() => resetBlock(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4, color: '#888' }} title="Edit Block">✏️</button>
                           <div>
                             <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Total Run</div>
                             <div style={{ fontSize: 18, fontWeight: 800, color: statusColor }}>{b.cumulative}</div>
                           </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>ENTER TOTAL (↵ NEXT)</div>
                          <input
                            ref={el => { if (el) blockInputRefs.current[b.id] = el; }}
                            data-block-idx={i}
                            type="number"
                            placeholder="Total"
                            onBlur={(e) => { if(e.target.value) logCumulative(i, e.target.value) }}
                            style={{ width: 80, padding: 8, borderRadius: 8, border: '2px solid #e0e0e0', textAlign: 'center', fontSize: 16, fontWeight: 700, outline: 'none' }}
                            onFocus={(e) => e.target.style.borderColor = '#1CB0F6'}
                            onMouseLeave={(e) => { if(document.activeElement !== e.target) e.target.style.borderColor = '#e0e0e0' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* INLINE REASON EXPANSION WHEN TARGET MISSED */}
                    {isMissed && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        style={{
                          marginTop: 6,
                          padding: '10px 12px',
                          background: hasReason ? '#F8FAFC' : '#FFF1F2',
                          borderRadius: 12,
                          border: `1.5px solid ${hasReason ? '#E2E8F0' : '#FDA4AF'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          width: '100%',
                          boxSizing: 'border-box'
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: hasReason ? '#334155' : '#BE123C', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>⚠️</span> <span>Deficit Reason ({b.actual} / {b.target.toFixed(1)}):</span>
                            {!hasReason && <span style={{ color: '#E11D48', fontWeight: 900 }}>*Mandatory</span>}
                          </span>
                          {hasReason && (
                            <button
                              type="button"
                              onClick={() => updateBlockMissReason(i, '')}
                              style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 11, cursor: 'pointer', fontWeight: 700, padding: '2px 4px' }}>
                              Change / Clear
                            </button>
                          )}
                        </div>

                        {/* If reason is already selected, only show the selected reason cleanly */}
                        {hasReason ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: '#fff',
                            borderRadius: 8,
                            border: '1px solid #CBD5E1',
                            gap: 8
                          }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', wordBreak: 'break-word' }}>
                              📌 {b.missReason}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateBlockMissReason(i, '')}
                              title="Edit reason"
                              style={{ background: '#F1F5F9', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#475569', cursor: 'pointer', flexShrink: 0 }}
                            >
                              Edit ✏️
                            </button>
                          </div>
                        ) : (
                          /* If reason is not selected yet, show clean Dropdown + Custom Reason Text Input */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                            {/* Preset Dropdown */}
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val) updateBlockMissReason(i, val);
                              }}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1.5px solid #F43F5E',
                                fontSize: 12,
                                fontWeight: 600,
                                background: '#fff',
                                color: '#334155',
                                outline: 'none',
                                boxSizing: 'border-box',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="" disabled>-- Select Reason from Presets --</option>
                              {customMissedReasons.map((reasonOpt, rOptIdx) => (
                                <option key={rOptIdx} value={reasonOpt}>{reasonOpt}</option>
                              ))}
                            </select>

                            {/* Or type specific custom reason */}
                            <input
                              type="text"
                              placeholder="Or type custom reason here (spaces allowed)..."
                              defaultValue=""
                              onKeyDown={(e) => e.stopPropagation()}
                              onKeyUp={(e) => e.stopPropagation()}
                              onKeyPress={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                if (e.target.value.trim()) updateBlockMissReason(i, e.target.value);
                              }}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: '1px solid #CBD5E1',
                                fontSize: 12,
                                background: '#fff',
                                color: '#1E293B',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Save to Report Button */}
            <button onClick={() => {
              const missedWithoutReason = blocks.findIndex(b => !b.isBreak && b.logged && b.actual < b.target && !b.missReason?.trim());
              if (missedWithoutReason >= 0) {
                playSound('missed');
                setCustomAlert({
                  isOpen: true,
                  type: 'alert',
                  title: '⚠️ Reason Required',
                  message: `Block ${missedWithoutReason + 1} (${fmt12h(blocks[missedWithoutReason].start)} - ${fmt12h(blocks[missedWithoutReason].end)}) missed target. Please provide a reason for all missed blocks before saving to report.`,
                  onConfirm: null
                });
                return;
              }
              const totalProd = blocks.reduce((s, blk) => s + (blk.logged ? blk.actual : 0), 0);
              save(blocks);
              playSound('success');
              setCustomAlert({
                isOpen: true,
                type: 'alert',
                title: '✅ Report Updated',
                message: `Shift data for ${selectedDate} has been saved to reports! Total production: ${totalProd} ${unit}.`,
                onConfirm: null
              });
            }} style={{ width: '100%', padding: 14, background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, marginTop: 16, boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>💾 Save to Report</button>

            <button onClick={() => {
              setCustomAlert({
                isOpen: true,
                type: 'confirm',
                title: 'Clear Data',
                message: 'Are you sure you want to clear all entered data for this shift?',
                onConfirm: () => {
                  const nb = blocks.map(b => ({ ...b, logged: false, actual: 0, cumulative: 0 }));
                  recalcTargets(nb, target, breakHistory);
                  setBlocks(nb);
                  setEarnedBreak(0);
                  setEarnedBreakReason('');
                  save(nb, {
                    clockStatus: 'idle',
                    shiftStartMs: null,
                    totalAccumulatedMs: 0,
                    elapsedShiftSec: 0,
                    earnedBreak: 0,
                    earnedBreakReason: '',
                    totalBreakAccumulatedMs: 0,
                    breakHistory: [],
                    breakStartMs: null,
                    breakDurationMs: 0
                  });
                  setClockStatus('idle');
                  setShiftStartMs(null);
                  setTotalAccumulatedMs(0);
                  setElapsedShiftSec(0);
                  setTotalBreakAccumulatedMs(0);
                  setBreakHistory([]);
                  playSound('trash');
                  setCustomAlert({ isOpen: false });
                }
              });
            }} style={{ width: '100%', padding: 14, background: '#FFF4E5', color: '#FFB020', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, marginTop: 10 }}>Clear Entered Data</button>

            {/* Quick Edit or Reset Setup */}
            {isToday ? (
              <ShiftQuickEdit
                target={target} unit={unit} shiftStart={shiftStart} shiftEnd={shiftEnd}
                onApply={(newTarget, newUnit, newStart, newEnd) => {
                  setTarget(newTarget);
                  setUnit(newUnit);

                  const oldStartMin = timeToMinutes(shiftStart);
                  const oldEndMin = timeToMinutes(shiftEnd);
                  const newStartMin = timeToMinutes(newStart);
                  const newEndMin = timeToMinutes(newEnd);
                  setShiftStart(newStart);
                  setShiftEnd(newEnd);

                  // Also update shiftSlots if multi-shift is used
                  if (shiftSlots && shiftSlots.length > 0) {
                    const updatedSlots = [...shiftSlots];
                    // Update first slot's start
                    updatedSlots[0] = {
                      ...updatedSlots[0],
                      start: newStart
                    };
                    // Update last slot's end
                    updatedSlots[updatedSlots.length - 1] = {
                      ...updatedSlots[updatedSlots.length - 1],
                      end: newEnd
                    };
                    setShiftSlots(updatedSlots);
                  }

                  let nb = blocks.map(b => ({ ...b }));

                  // Handle start time change — add blocks before existing start if extending earlier
                  if (newStartMin < oldStartMin && nb.length > 0) {
                    const firstBlockStart = timeToMinutes(nb[0].start);
                    if (newStartMin < firstBlockStart) {
                      let curMin = newStartMin;
                      const firstShiftLabel = nb[0].shiftLabel || '';
                      const newBlocks = [];
                      while (curMin < firstBlockStart) {
                        const bEndMin = Math.min(curMin + blockLen, firstBlockStart);
                        newBlocks.push({
                          id: 0,
                          start: minsToTime(curMin),
                          end: minsToTime(bEndMin),
                          shiftLabel: firstShiftLabel,
                          actual: 0, cumulative: 0, logged: false, target: 0, isBreak: false
                        });
                        curMin = bEndMin;
                      }
                      nb = [...newBlocks, ...nb];
                    } else if (newStartMin < oldStartMin && !nb[0].logged && !nb[0].isBreak) {
                      nb[0] = { ...nb[0], start: newStart };
                    }
                  } else if (newStartMin > oldStartMin && nb.length > 0) {
                    // Shrink from the start — remove unlogged blocks that end at or before the new start time
                    nb = nb.filter(b => {
                      const bEnd = timeToMinutes(b.end);
                      return bEnd > newStartMin || b.logged;
                    });
                    // Trim the first remaining block's start if it starts before newStart
                    if (nb.length > 0) {
                      const firstB = nb[0];
                      if (!firstB.logged && !firstB.isBreak && timeToMinutes(firstB.start) < newStartMin) {
                        nb[0] = { ...firstB, start: newStart };
                      }
                    }
                  }

                  // Handle end time change
                  if (newEndMin > oldEndMin && nb.length > 0) {
                    // Extend: add new work blocks from old end to new end
                    const lastBlock = nb[nb.length - 1];
                    const lastBlockEnd = timeToMinutes(lastBlock.end);
                    if (newEndMin > lastBlockEnd) {
                      let curMin = lastBlockEnd;
                      const lastShiftLabel = lastBlock.shiftLabel || '';
                      while (curMin < newEndMin) {
                        const bEndMin = Math.min(curMin + blockLen, newEndMin);
                        nb.push({
                          id: 0,
                          start: minsToTime(curMin),
                          end: minsToTime(bEndMin),
                          shiftLabel: lastShiftLabel,
                          actual: 0, cumulative: 0, logged: false, target: 0, isBreak: false
                        });
                        curMin = bEndMin;
                      }
                    } else if (!lastBlock.logged && !lastBlock.isBreak) {
                      nb[nb.length - 1] = { ...lastBlock, end: newEnd };
                    }
                  } else if (newEndMin < oldEndMin && nb.length > 0) {
                    // Shrink: remove unlogged blocks that start at or after the new end time
                    nb = nb.filter(b => {
                      const bStart = timeToMinutes(b.start);
                      return bStart < newEndMin || b.logged;
                    });
                    // Trim the last remaining block's end time if it extends past newEnd
                    if (nb.length > 0) {
                      const lastIdx = nb.length - 1;
                      const lastB = nb[lastIdx];
                      if (!lastB.logged && !lastB.isBreak && timeToMinutes(lastB.end) > newEndMin) {
                        nb[lastIdx] = { ...lastB, end: newEnd };
                      }
                    }
                  }

                  // Re-index all blocks cleanly so block IDs match array indices exactly
                  nb = nb.map((b, idx) => ({ ...b, id: idx }));

                  recalcTargets(nb, newTarget, breakHistory);
                  setBlocks(nb);
                  save(nb, { target: newTarget, unit: newUnit, shiftStart: newStart, shiftEnd: newEnd });
                  playSound('success');
                }}
              />
            ) : null}

            {/* Reset / Edit Shift Setup */}
            <button onClick={() => {
              setCustomAlert({
                isOpen: true,
                type: 'confirm',
                title: 'Reset Setup',
                message: 'This will clear your current shift blocks and logged data. Continue?',
                onConfirm: () => {
                  setSetupMode(true);
                  setBlocks([]);
                  setClockStatus('idle');
                  setShiftStartMs(null);
                  setTotalAccumulatedMs(0);
                  setElapsedShiftSec(0);
                  setEarnedBreak(0);
                  setEarnedBreakReason('');
                  setTotalBreakAccumulatedMs(0);
                  setBreakHistory([]);
                  // Persist empty blocks to storage & Firestore so refresh won't restore deleted blocks
                  save([], {
                    blocks: [],
                    setupMode: true,
                    clockStatus: 'idle',
                    shiftStartMs: null,
                    totalAccumulatedMs: 0,
                    earnedBreak: 0,
                    earnedBreakReason: '',
                    totalBreakAccumulatedMs: 0,
                    breakHistory: []
                  });
                  playSound('trash');
                  setCustomAlert({ isOpen: false });
                }
              });
            }} style={{ width: '100%', padding: 14, background: '#f0f0f0', color: '#555', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, marginTop: 10 }}>Edit Shift Setup</button>
            </div>{/* END OF RIGHT COLUMN */}
          </div>
        )}
      </div>

      {/* SHIFT SETTINGS & KEYBINDINGS MODAL */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              style={{ background: '#fff', padding: 24, borderRadius: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 }}>
                  ⚙️ Shift Tracker Settings
                </h3>
                <button onClick={() => setShowSettingsModal(false)}
                  style={{ background: '#F1F5F9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontWeight: 700, color: '#64748B' }}>✕</button>
              </div>

              {/* Navigation Tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F1F5F9', padding: 4, borderRadius: 12, overflowX: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setSettingsTab('shortcuts')}
                  style={{
                    flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none',
                    fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: settingsTab === 'shortcuts' ? '#fff' : 'none',
                    color: settingsTab === 'shortcuts' ? '#0284C7' : '#64748B',
                    boxShadow: settingsTab === 'shortcuts' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  ⌨️ Hotkeys
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab('defaults')}
                  style={{
                    flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none',
                    fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: settingsTab === 'defaults' ? '#fff' : 'none',
                    color: settingsTab === 'defaults' ? '#0284C7' : '#64748B',
                    boxShadow: settingsTab === 'defaults' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  📋 Defaults
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab('offdays')}
                  style={{
                    flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none',
                    fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: settingsTab === 'offdays' ? '#fff' : 'none',
                    color: settingsTab === 'offdays' ? '#0284C7' : '#64748B',
                    boxShadow: settingsTab === 'offdays' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  🏖️ Offdays
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab('reasons')}
                  style={{
                    flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none',
                    fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: settingsTab === 'reasons' ? '#fff' : 'none',
                    color: settingsTab === 'reasons' ? '#0284C7' : '#64748B',
                    boxShadow: settingsTab === 'reasons' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  ⚠️ Chips
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab('preferences')}
                  style={{
                    flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none',
                    fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: settingsTab === 'preferences' ? '#fff' : 'none',
                    color: settingsTab === 'preferences' ? '#0284C7' : '#64748B',
                    boxShadow: settingsTab === 'preferences' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  ⚡ Prefs
                </button>
              </div>

              {settingsTab === 'shortcuts' && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Keyboard Shortcuts
                  </div>
                  <p style={{ fontSize: 12, color: '#64748B', marginTop: 0, marginBottom: 14 }}>
                    Type total & hit <b>Enter (↵)</b> to save and advance automatically. Customize triggers:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    {[
                      { id: 'focusBlock', label: 'Focus Active Block Input', desc: 'Jumps directly into block input' },
                      { id: 'takeBreak', label: 'Take / Toggle Break Sheet', desc: 'Opens break type menu during active shift' },
                      { id: 'endBreak', label: 'End Break & Resume', desc: 'Resumes work when on break' },
                      { id: 'toggleClock', label: 'Clock In / Clock Out', desc: 'Toggles your shift status' },
                      { id: 'openSettings', label: 'Open Shift Settings', desc: 'Opens this settings panel' },
                    ].map(kb => (
                      <div key={kb.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{kb.label}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{kb.desc}</div>
                        </div>
                        <input
                          type="text"
                          maxLength={1}
                          value={keybindings[kb.id] || ''}
                          onChange={(e) => {
                            const newKey = e.target.value.toLowerCase();
                            const updated = { ...keybindings, [kb.id]: newKey };
                            setKeybindings(updated);
                            localStorage.setItem('shiftTracker_keybindings', JSON.stringify(updated));
                          }}
                          style={{
                            width: 40, height: 36, textAlign: 'center', borderRadius: 8,
                            border: '2px solid #CBD5E1', background: '#fff', fontSize: 14,
                            fontWeight: 800, textTransform: 'uppercase', color: '#0284C7', outline: 'none'
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {settingsTab === 'defaults' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Preset Shift Values
                  </div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                    Default Daily Target:
                    <input
                      type="number"
                      value={defaultShiftTarget}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setDefaultShiftTarget(val);
                        localStorage.setItem('shiftTracker_defaultTarget', String(val));
                        saveShiftSettings({ defaultShiftTarget: val });
                      }}
                      style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14 }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#334155' }}>
                      Default Start:
                      <input
                        type="time"
                        value={defaultShiftStart}
                        onChange={(e) => {
                          setDefaultShiftStart(e.target.value);
                          localStorage.setItem('shiftTracker_defaultStart', e.target.value);
                          saveShiftSettings({ defaultShiftStart: e.target.value });
                        }}
                        style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14 }}
                      />
                    </label>
                    <label style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#334155' }}>
                      Default End:
                      <input
                        type="time"
                        value={defaultShiftEnd}
                        onChange={(e) => {
                          setDefaultShiftEnd(e.target.value);
                          localStorage.setItem('shiftTracker_defaultEnd', e.target.value);
                          saveShiftSettings({ defaultShiftEnd: e.target.value });
                        }}
                        style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14 }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {settingsTab === 'offdays' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Weekly Regular Off-Days
                  </div>
                  <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                    Select regular rest days each week. These days are automatically marked as Off-Days and excluded from production quotas.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { day: 0, label: 'Sun' },
                      { day: 1, label: 'Mon' },
                      { day: 2, label: 'Tue' },
                      { day: 3, label: 'Wed' },
                      { day: 4, label: 'Thu' },
                      { day: 5, label: 'Fri' },
                      { day: 6, label: 'Sat' }
                    ].map(item => {
                      const isOff = weeklyOffDays.includes(item.day);
                      return (
                        <button
                          key={item.day}
                          type="button"
                          onClick={() => {
                            const newDays = isOff
                              ? weeklyOffDays.filter(d => d !== item.day)
                              : [...weeklyOffDays, item.day];
                            setWeeklyOffDays(newDays);
                            try { localStorage.setItem('shiftTracker_weeklyOffDays', JSON.stringify(newDays)); } catch {}
                            saveShiftSettings({ weeklyOffDays: newDays });
                          }}
                          style={{
                            padding: '10px 4px',
                            borderRadius: 10,
                            border: isOff ? '2px solid #EF4444' : '1px solid #CBD5E1',
                            background: isOff ? '#FEE2E2' : '#F8FAFC',
                            color: isOff ? '#DC2626' : '#475569',
                            fontWeight: 800,
                            fontSize: 12.5,
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <span>{item.label}</span>
                          <span style={{ fontSize: 10 }}>{isOff ? '🏖️ OFF' : '💼 WORK'}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#0284C7', background: '#F0F9FF', padding: 10, borderRadius: 10, border: '1px solid #BAE6FD' }}>
                    💡 <b>Tip:</b> Changes to weekly offdays take effect immediately and dynamically redistribute remaining monthly targets.
                  </div>
                </div>
              )}

              {settingsTab === 'reasons' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Missed Target Quick Reasons Preset
                    </div>
                    <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 10px 0' }}>
                      These appear in the quick dropdown inside any shift block that misses its target. Changes save locally and sync to Firestore.
                    </p>
                  </div>

                  {/* Add Reason Input */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Add custom reason preset..."
                      value={newReasonInput}
                      onChange={(e) => setNewReasonInput(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = newReasonInput.trim();
                          if (val && !customMissedReasons.includes(val)) {
                            const updated = [...customMissedReasons, val];
                            setCustomMissedReasons(updated);
                            try { localStorage.setItem('shiftTracker_missedReasons', JSON.stringify(updated)); } catch {}
                            save(blocks, { missedReasons: updated });
                            setNewReasonInput('');
                          }
                        }
                      }}
                      style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, outline: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newReasonInput.trim();
                        if (val && !customMissedReasons.includes(val)) {
                          const updated = [...customMissedReasons, val];
                          setCustomMissedReasons(updated);
                          try { localStorage.setItem('shiftTracker_missedReasons', JSON.stringify(updated)); } catch {}
                          save(blocks, { missedReasons: updated });
                          setNewReasonInput('');
                        }
                      }}
                      style={{ padding: '0 16px', background: '#0284C7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                    >
                      + Add
                    </button>
                  </div>

                  {/* Existing Chips List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {customMissedReasons.map((reason, rIdx) => (
                      <div key={rIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                        <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{reason}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = customMissedReasons.filter((_, idx) => idx !== rIdx);
                            setCustomMissedReasons(updated);
                            try { localStorage.setItem('shiftTracker_missedReasons', JSON.stringify(updated)); } catch {}
                            save(blocks, { missedReasons: updated });
                          }}
                          style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 4 }}
                          title="Delete chip"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {customMissedReasons.length === 0 && (
                      <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '10px 0' }}>
                        No quick reason chips created yet. Add one above!
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomMissedReasons(DEFAULT_MISSED_REASONS);
                      try { localStorage.setItem('shiftTracker_missedReasons', JSON.stringify(DEFAULT_MISSED_REASONS)); } catch {}
                      save(blocks, { missedReasons: DEFAULT_MISSED_REASONS });
                    }}
                    style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#0284C7', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    ↺ Reset to Default Chips
                  </button>
                </div>
              )}

              {settingsTab === 'preferences' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0284C7', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Workflow Behaviors
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Auto-Advance Cursor (↵)</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>Jump to next block on enter key</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoAdvance}
                      onChange={(e) => {
                        setAutoAdvance(e.target.checked);
                        localStorage.setItem('shiftTracker_autoAdvance', String(e.target.checked));
                      }}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>Sound Audio Cues</div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>Play chime on clock in, breaks & saves</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={soundEnabled}
                      onChange={(e) => {
                        setSoundEnabled(e.target.checked);
                        localStorage.setItem('shiftTracker_sound', String(e.target.checked));
                      }}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    setKeybindings(DEFAULT_KEYBINDINGS);
                    localStorage.setItem('shiftTracker_keybindings', JSON.stringify(DEFAULT_KEYBINDINGS));
                    playSound('points');
                  }}
                  style={{ flex: 1, padding: 12, background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Reset Defaults
                </button>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  style={{ flex: 1, padding: 12, background: '#1CB0F6', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Done
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CUSTOM MODAL OVERLAY */}
      <AnimatePresence>
        {customAlert.isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} style={{ background: '#fff', padding: 24, borderRadius: 24, width: '100%', maxWidth: 360, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
               <h3 style={{ margin: '0 0 10px 0', fontSize: 20, color: '#333' }}>{customAlert.title}</h3>
               <p style={{ margin: '0 0 24px 0', color: '#666', fontSize: 16, lineHeight: '1.5' }}>{customAlert.message}</p>
               <div style={{ display: 'flex', gap: 12 }}>
                 {customAlert.type === 'confirm' ? (
                   <>
                     <button onClick={() => setCustomAlert({ isOpen: false })} style={{ flex: 1, padding: 14, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Cancel</button>
                     <button onClick={customAlert.onConfirm} style={{ flex: 1, padding: 14, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Yes, proceed</button>
                   </>
                 ) : (
                   <button onClick={() => setCustomAlert({ isOpen: false })} style={{ flex: 1, padding: 14, background: '#1CB0F6', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Okay</button>
                 )}
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PHASE 2: PRODUCTION TARGET MODAL */}
      <AnimatePresence>
        {showProductionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)',
              zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              style={{
                background: '#fff',
                borderRadius: 24,
                padding: '24px 20px',
                width: '100%',
                maxWidth: 440,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                maxHeight: '90vh',
                overflowY: 'auto'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22 }}>🎯</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0F172A' }}>
                      Production Target Setup
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#64748B' }}>
                      Auto-computes dynamic daily & weekly quotas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProductionModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: 18, color: '#94A3B8', cursor: 'pointer', padding: 4 }}
                >
                  ✕
                </button>
              </div>

              {/* Form inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Monthly Target ({unit})
                  </label>
                  <input
                    type="number"
                    value={monthlyTarget}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMonthlyTarget(v);
                      localStorage.setItem('shiftTracker_monthlyTarget', String(v));
                      saveShiftSettings({ monthlyTarget: v });
                    }}
                    placeholder="e.g. 2600"
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 10,
                      border: '1px solid #CBD5E1', fontSize: 15, fontWeight: 800,
                      color: '#0F172A', boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Work Days / Month
                    </label>
                    <input
                      type="number"
                      value={monthlyWorkDays}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMonthlyWorkDays(v);
                        localStorage.setItem('shiftTracker_monthlyWorkDays', String(v));
                        saveShiftSettings({ monthlyWorkDays: v });
                      }}
                      placeholder="e.g. 26"
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        border: '1px solid #CBD5E1', fontSize: 14, fontWeight: 800,
                        color: '#0F172A', boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Unit Name
                    </label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => {
                        setUnit(e.target.value);
                        localStorage.setItem('shiftTracker_productionUnit', e.target.value);
                        saveShiftSettings({ productionUnit: e.target.value });
                      }}
                      placeholder="e.g. pieces"
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        border: '1px solid #CBD5E1', fontSize: 14, fontWeight: 800,
                        color: '#0F172A', boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Target Preview & Recommendations */}
              <div style={{
                background: '#F8FAFC',
                borderRadius: 14,
                padding: '12px 14px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
                  ⚡ Auto-Calculated Targets
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Effective Workdays in Month:</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                    {productionMetrics.effectiveTotalWorkDays} days ({productionMetrics.offDaysCount} off, {productionMetrics.leaveDaysCount} leave, {productionMetrics.holidaysCount} hol)
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Standard Base Daily:</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                    {productionMetrics.baseDailyTarget} {unit}/day
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Standard Base Weekly:</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>
                    {productionMetrics.baseWeeklyTarget} {unit}/week
                  </span>
                </div>

                <div style={{ height: 1, background: '#E2E8F0', margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#16A34A' }}>
                      🔥 Recommended Daily for Today:
                    </div>
                    <div style={{ fontSize: 10.5, color: '#64748B' }}>
                      Recalculated over {productionMetrics.workDaysRemaining} remaining workdays
                    </div>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#15803D' }}>
                    {productionMetrics.dynamicSuggestedDailyTarget} {unit}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setTarget(productionMetrics.dynamicSuggestedDailyTarget);
                    localStorage.setItem('shiftTracker_defaultTarget', String(productionMetrics.dynamicSuggestedDailyTarget));
                    playSound('success');
                    setShowProductionModal(false);
                  }}
                  style={{
                    flex: 1, padding: 12, background: '#0284C7', color: '#fff',
                    border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Apply {productionMetrics.dynamicSuggestedDailyTarget} as Today's Target
                </button>
                <button
                  type="button"
                  onClick={() => setShowProductionModal(false)}
                  style={{
                    padding: '12px 16px', background: '#F1F5F9', color: '#475569',
                    border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
