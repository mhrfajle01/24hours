import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase/firebase';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { useSound } from '../contexts/SoundContext';

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

const fmtTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

function exportCSV(data, date) {
  const rows = [['Block', 'Time', 'Type', 'Target', 'Actual', 'Cumulative', 'Status']];
  data.blocks.forEach((b, i) => {
    rows.push([
      i + 1,
      `${fmt12h(b.start)} - ${fmt12h(b.end)}`,
      b.isBreak ? 'Break' : 'Work',
      b.isBreak ? 0 : b.target.toFixed(1),
      b.actual || 0,
      b.cumulative || 0,
      b.isBreak ? '-' : (b.logged ? (b.actual >= b.target ? 'On Target' : 'Behind') : 'Not Logged')
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


export default function ShiftTrackerPage({ currentUser, onBack, onOpenReports }) {
  const { playSound } = useSound();

  // Settings
  const [target, setTarget] = useState(100);
  const [unit, setUnit] = useState('pieces');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [blockLen, setBlockLen] = useState(60);

  const [setupMode, setSetupMode] = useState(true);

  // Live Block State
  const [blocks, setBlocks] = useState([]);
  const [now, setNow] = useState(new Date());

  const [earnedBreak, setEarnedBreak] = useState(0);

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

  // Custom Modal State
  const [customAlert, setCustomAlert] = useState({ isOpen: false, type: 'confirm', title: '', message: '', onConfirm: null });
  // ----------------------------------------------

  // Date selection
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isToday = selectedDate === todayStr;

  const docRef = currentUser?.uid ? doc(db, 'shiftTracker', currentUser.uid) : null;

  // --- Break budget calculations ---
  const getShiftDurationHrs = () => {
    const s = new Date(`1970-01-01T${shiftStart}:00`);
    const e = new Date(`1970-01-01T${shiftEnd}:00`);
    return (e - s) / 3600000;
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

  useEffect(() => {
    if (!currentUser?.uid) return;

    const loadData = async () => {
      if (isToday) {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const d = snap.data();
          if (d.date === todayStr) {
            setTarget(d.target || 100);
            setUnit(d.unit || 'pieces');
            setShiftStart(d.shiftStart || '09:00');
            setShiftEnd(d.shiftEnd || '17:00');
            setBlockLen(d.blockLen || 60);
            setBlocks(d.blocks || []);
            if (d.blocks && d.blocks.length > 0) setSetupMode(false);

            if (d.clockStatus) setClockStatus(d.clockStatus);
            if (d.shiftStartMs) setShiftStartMs(d.shiftStartMs);
            if (d.totalAccumulatedMs) setTotalAccumulatedMs(d.totalAccumulatedMs);
            if (d.breakStartMs) setBreakStartMs(d.breakStartMs);
            if (d.breakDurationMs) setBreakDurationMs(d.breakDurationMs);
            if (d.earnedBreak) setEarnedBreak(d.earnedBreak);
            if (d.totalBreakAccumulatedMs) setTotalBreakAccumulatedMs(d.totalBreakAccumulatedMs);
            if (d.breakHistory) setBreakHistory(d.breakHistory);
            if (d.breakType) setBreakType(d.breakType);
          } else {
            resetState();
          }
        } else {
          resetState();
        }
      } else {
        const histRef = doc(db, 'shiftTracker', currentUser.uid, 'history', selectedDate);
        const snap = await getDoc(histRef);
        if (snap.exists()) {
          const d = snap.data();
          setTarget(d.target || 100);
          setUnit(d.unit || 'pieces');
          setShiftStart(d.shiftStart || '09:00');
          setShiftEnd(d.shiftEnd || '17:00');
          setBlockLen(d.blockLen || 60);
          setBlocks(d.blocks || []);
          if (d.blocks && d.blocks.length > 0) setSetupMode(false);
          else setSetupMode(true);
          if (d.breakHistory) setBreakHistory(d.breakHistory);
          if (d.totalBreakAccumulatedMs) setTotalBreakAccumulatedMs(d.totalBreakAccumulatedMs);
        } else {
          resetState();
        }
        setClockStatus('idle');
        setShiftStartMs(null);
        setTotalAccumulatedMs(0);
        setElapsedShiftSec(0);
      }
    };

    loadData();
  }, [currentUser?.uid, selectedDate]);

  const resetState = () => {
    setTarget(100);
    setUnit('pieces');
    setShiftStart('09:00');
    setShiftEnd('17:00');
    setBlockLen(60);
    setBlocks([]);
    setSetupMode(true);
    setClockStatus('idle');
    setShiftStartMs(null);
    setTotalAccumulatedMs(0);
    setElapsedShiftSec(0);
    setEarnedBreak(0);
    setTotalBreakAccumulatedMs(0);
    setBreakHistory([]);
    setBreakType(null);
    setBreakNudgeLevel(0);
  };

  const save = (b, extraData = {}) => {
    if (!currentUser?.uid) return;
    const currentBlocks = b || blocks;
    const totalProducedNow = currentBlocks.reduce((s, blk) => s + (blk.logged ? blk.actual : 0), 0);

    const currentTotalBreakMs = extraData.totalBreakAccumulatedMs ?? totalBreakAccumulatedMs;
    const currentBreakHistory = extraData.breakHistory ?? breakHistory;

    if (isToday) {
      setDoc(docRef, {
        date: todayStr, target, unit, shiftStart, shiftEnd, blockLen, blocks: currentBlocks,
        clockStatus, shiftStartMs, totalAccumulatedMs, breakStartMs, breakDurationMs, earnedBreak,
        totalBreakAccumulatedMs: currentTotalBreakMs,
        breakHistory: currentBreakHistory,
        breakType,
        ...extraData
      }, { merge: true });
    }

    // Always save/update history subcollection for reports
    const histRef = doc(db, 'shiftTracker', currentUser.uid, 'history', selectedDate);
    setDoc(histRef, {
      date: selectedDate,
      target: Number(target),
      actual: totalProducedNow,
      blocks: currentBlocks,
      shiftStart,
      shiftEnd,
      blockLen,
      unit,
      totalShiftSec: extraData.totalAccumulatedMs ? Math.floor((extraData.totalAccumulatedMs || totalAccumulatedMs) / 1000) : Math.floor(totalAccumulatedMs / 1000),
      totalBreakSec: Math.floor(currentTotalBreakMs / 1000),
      breakHistory: currentBreakHistory,
      updatedAt: Date.now()
    }, { merge: true });
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


  // --- SHIFT TRACKER FUNCTIONS ---
  const handleClockIn = () => {
    setClockStatus('active');
    setShiftStartMs(Date.now());
    setTotalAccumulatedMs(0);
    setTotalBreakAccumulatedMs(0);
    setBreakHistory([]);
    setElapsedShiftSec(0);
    setBreakNudgeLevel(0);
    playSound('success');
    save(blocks, { clockStatus: 'active', shiftStartMs: Date.now(), totalAccumulatedMs: 0, totalBreakAccumulatedMs: 0, breakHistory: [] });
  };

  const startBreak = (mins, typeId) => {
    const currentMs = Date.now();
    const newTotal = totalAccumulatedMs + (currentMs - shiftStartMs);
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

    // Deduct earned break if used
    if (earnedBreak > 0) {
      setEarnedBreak(0);
    }

    playSound('points');
    save(blocks, {
      clockStatus: 'break', totalAccumulatedMs: newTotal, breakDurationMs: mins * 60000,
      breakStartMs: currentMs, earnedBreak: 0, breakType: typeId || 'tea',
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

  const handleClockOut = () => {
    setCustomAlert({
      isOpen: true,
      type: 'confirm',
      title: 'Clock Out',
      message: 'Are you sure you want to clock out and stop your shift timer?',
      onConfirm: () => {
        setClockStatus('idle');
        setShiftStartMs(null);
        setTotalAccumulatedMs(0);
        setElapsedShiftSec(0);
        playSound('trash');
        save(blocks, { clockStatus: 'idle', shiftStartMs: null, totalAccumulatedMs: 0 });
        setCustomAlert({ isOpen: false });
      }
    });
  };

  const generateBlocks = () => {
    const s = new Date(`1970-01-01T${shiftStart}:00`);
    const e = new Date(`1970-01-01T${shiftEnd}:00`);
    const mins = (e - s) / 60000;
    const num = Math.ceil(mins / blockLen);
    const b = [];
    let cur = s;
    for (let i = 0; i < num; i++) {
      const bEnd = new Date(cur.getTime() + blockLen * 60000);
      b.push({
        id: i,
        start: fmtTime(cur),
        end: fmtTime(bEnd),
        actual: 0,
        cumulative: 0,
        logged: false,
        target: 0,
        isBreak: false
      });
      cur = bEnd;
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

    let newEarnedBreak = earnedBreak;
    if (actualProd > b.target) {
      const extraRate = (actualProd - b.target) / b.target;
      if (extraRate > 0) {
        newEarnedBreak += Math.floor(extraRate * 5);
        setEarnedBreak(newEarnedBreak);
        playSound('success');
      }
    } else {
      playSound('points');
    }

    recalcTargets(nb, target, breakHistory);
    setBlocks(nb);
    save(nb, { earnedBreak: newEarnedBreak });
  };

  const resetBlock = (id) => {
    const nb = [...blocks];
    nb[id].logged = false;
    nb[id].actual = 0;
    nb[id].cumulative = 0;
    recalcTargets(nb, target, breakHistory);
    setBlocks(nb);
    save(nb);
  };

  const currTimeStr = fmtTime(now);
  const currentBlockIdx = blocks.findIndex(b => currTimeStr >= b.start && currTimeStr < b.end);
  const totalProduced = blocks.reduce((s, b) => s + (b.logged ? b.actual : 0), 0);
  const isOverBreak = breakRemainingSec < 0;

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
      <motion.div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'linear-gradient(135deg, #1CB0F6, #1480B3)', padding: '14px 16px', color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer' }}>←</button>
          <div style={{ fontSize: 18, fontWeight: 700 }}>⏱️ Shift Tracker</div>
          <button onClick={onOpenReports} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 12, fontWeight: 700, fontSize: 12 }}>Reports</button>
          {!setupMode && <button onClick={() => exportCSV({blocks}, selectedDate)} style={{ background: '#fff', color: '#1CB0F6', border: 'none', padding: '6px 12px', borderRadius: 12, fontWeight: 700, fontSize: 12 }}>Export</button>}
        </div>
      </motion.div>

      {/* Date Selector */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: '#fff', borderBottom: '1px solid #eee', overflowX: 'auto' }}>
        <button onClick={() => setSelectedDate(yesterdayStr)} style={{ flexShrink: 0, padding: '8px 16px', background: selectedDate === yesterdayStr ? '#FF9500' : '#f5f5f5', color: selectedDate === yesterdayStr ? '#fff' : '#555', border: 'none', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📅 Yesterday</button>
        <button onClick={() => setSelectedDate(todayStr)} style={{ flexShrink: 0, padding: '8px 16px', background: selectedDate === todayStr ? '#1CB0F6' : '#f5f5f5', color: selectedDate === todayStr ? '#fff' : '#555', border: 'none', borderRadius: 20, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>📍 Today</button>
        <input type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)} style={{ flexShrink: 0, padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#333', outline: 'none' }} />
        {!isToday && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', color: '#FF9500', fontSize: 12, fontWeight: 700 }}>⚠️ Past Date Mode</div>}
      </div>

      <div style={{ padding: 16 }}>
        {setupMode ? (
          <motion.div initial={{ y: 20 }} animate={{ y: 0 }} style={{ background: '#fff', padding: 20, borderRadius: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0 }}>⚙️ Setup Shift</h3>

            <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Daily Target
              <input type="number" value={target} onChange={e => setTarget(e.target.value === '' ? '' : Number(e.target.value))} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </label>

            <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Unit
              <input type="text" value={unit} onChange={e => setUnit(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </label>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <label style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Shift Start
                <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </label>
              <label style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Shift End
                <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
              </label>
            </div>

            <label style={{ display: 'block', marginTop: 10, fontSize: 14, fontWeight: 600 }}>Block Length
              <select value={blockLen} onChange={e => setBlockLen(Number(e.target.value))} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc' }}>
                <option value={30}>30 mins</option>
                <option value={60}>60 mins</option>
              </select>
            </label>

            <button onClick={generateBlocks} style={{ width: '100%', padding: 14, background: '#1CB0F6', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, marginTop: 20 }}>Generate Blocks</button>
          </motion.div>
        ) : (
          <div>

            {/* DIGITAL CLOCK & BREAK CONTROLS - Only show for today */}
            {isToday && <div style={{
              background: clockStatus === 'break'
                ? 'linear-gradient(135deg, rgba(255,244,229,0.95), rgba(255,237,213,0.95))'
                : '#fff',
              padding: 20, borderRadius: 20,
              boxShadow: clockStatus === 'break'
                ? `0 4px 20px rgba(${currentBreakType.color}, 0.15), 0 0 0 1px rgba(255,176,32,0.1)`
                : '0 4px 12px rgba(0,0,0,0.05)',
              marginBottom: 16, textAlign: 'center',
              position: 'relative', overflow: 'hidden',
              border: isOverBreak ? '2px solid #FF4B4B' : 'none',
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
                  <div style={{ fontSize: 14, color: '#1CB0F6', fontWeight: 700, marginBottom: 4 }}>ACTIVE SHIFT</div>

                  {/* Nudge ring */}
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    {breakNudgeLevel > 0 && (
                      <motion.div
                        animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        style={{
                          position: 'absolute', top: -12, left: -12, right: -12, bottom: -12,
                          borderRadius: 16,
                          border: `2px solid ${breakNudgeLevel >= 3 ? '#EF4444' : breakNudgeLevel >= 2 ? '#F97316' : '#F59E0B'}`,
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                    <div style={{ fontSize: 48, fontWeight: 800, color: '#333', fontVariantNumeric: 'tabular-nums' }}>{formatStopwatch(elapsedShiftSec)}</div>
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
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                                  {[5, 10, 15, 30, 45, 60].map(m => (
                                    <button key={m} onClick={() => setSelectedBreakMins(m)}
                                      style={{
                                        padding: '6px 12px', borderRadius: 20, border: 'none',
                                        background: selectedBreakMins === m ? bt.color : '#f0f0f0',
                                        color: selectedBreakMins === m ? '#fff' : '#666',
                                        fontWeight: 600, fontSize: 12, cursor: 'pointer',
                                      }}>{m}m</button>
                                  ))}
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
                  <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto 16px' }}>
                    {/* Background circle */}
                    <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
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
                        style={{ fontSize: 36, marginBottom: 4 }}>{currentBreakType.icon}</motion.div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: isOverBreak ? '#FF4B4B' : '#333', fontVariantNumeric: 'tabular-nums' }}>
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
            </div>}

            {/* --- BREAK BUDGET BAR --- */}
            {isToday && clockStatus !== 'idle' && !setupMode && (
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
            {isToday && clockStatus !== 'idle' && breakHistory.length > 0 && !setupMode && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: '#fff', padding: 16, borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16 }}>
                <BreakTimeline shiftStartTime={shiftStart} shiftEndTime={shiftEnd} breakHistory={breakHistory} currentTime={now} />
              </motion.div>
            )}

            {/* --- BREAK INSIGHTS --- */}
            {completedBreaks.length > 0 && !setupMode && (
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
                                    {new Date(brk.startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(brk.endMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} style={{ marginBottom: 16, padding: 16, background: '#CE82FF', borderRadius: 16, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>🎉 <b>Earned Break:</b> {earnedBreak} mins</div>
                  <button onClick={() => startBreak(earnedBreak, 'rest')} style={{ background: '#fff', color: '#CE82FF', border: 'none', padding: '6px 12px', borderRadius: 12, fontWeight: 700 }}>Start</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
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
                        <div style={{ fontSize: 14, fontWeight: 700, color: bType?.color || '#FFB020' }}>{bType?.label || 'Break'} Block</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#999', background: '#f0f0f0', padding: '4px 10px', borderRadius: 8 }}>{blockTotalMins}m</div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div key={i} layout style={{ background: clockStatus === 'break' && isActiveTime ? '#FFF4E5' : '#fff', padding: 16, borderRadius: 16, borderLeft: `6px solid ${clockStatus === 'break' && isActiveTime ? currentBreakType.color : statusColor}`, boxShadow: isActiveTime ? '0 4px 12px rgba(28,176,246,0.1)' : '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 10, opacity: (clockStatus === 'break' && isActiveTime) ? 0.8 : 1 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>
                        {fmt12h(b.start)} - {fmt12h(b.end)}
                        {isActiveTime && clockStatus === 'active' && <span style={{ color: '#1CB0F6' }}> • Active</span>}
                        {isActiveTime && clockStatus === 'break' && <span style={{ color: currentBreakType.color }}> • {currentBreakType.icon} {currentBreakType.label}</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Block Target: {b.target.toFixed(1)}</div>
                      {blockBreakMins > 0 && <div style={{ fontSize: 11, color: '#F97316', fontWeight: 600 }}>☕ {blockBreakMins}m break · target adjusted</div>}
                      {b.logged && <div style={{ fontSize: 12, color: '#888' }}>Block Prod: {b.actual}</div>}
                    </div>
                    {b.logged ? (
                      <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12 }}>
                         <button onClick={() => resetBlock(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4, color: '#888' }} title="Edit Block">✏️</button>
                         <div>
                           <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: 700 }}>Total Run</div>
                           <div style={{ fontSize: 18, fontWeight: 800, color: statusColor }}>{b.cumulative}</div>
                         </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div style={{ fontSize: 10, color: '#888', fontWeight: 600 }}>ENTER TOTAL SO FAR</div>
                        <input type="number" placeholder="Total" onBlur={(e) => { if(e.target.value) logCumulative(i, e.target.value) }} style={{ width: 80, padding: 8, borderRadius: 8, border: '2px solid #e0e0e0', textAlign: 'center', fontSize: 16, fontWeight: 700, outline: 'none' }} onFocus={(e) => e.target.style.borderColor = '#1CB0F6'} onMouseLeave={(e) => { if(document.activeElement !== e.target) e.target.style.borderColor = '#e0e0e0' }}/>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Save to Report Button */}
            <button onClick={() => {
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
                  save(nb);
                  playSound('trash');
                  setCustomAlert({ isOpen: false });
                }
              });
            }} style={{ width: '100%', padding: 14, background: '#FFF4E5', color: '#FFB020', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, marginTop: 10 }}>Clear Entered Data</button>

            <button onClick={() => {
              setCustomAlert({
                isOpen: true,
                type: 'confirm',
                title: 'Reset Setup',
                message: 'Are you sure you want to edit your setup? This might clear your current shift blocks.',
                onConfirm: () => {
                  setSetupMode(true);
                  playSound('trash');
                  setCustomAlert({ isOpen: false });
                }
              });
            }} style={{ width: '100%', padding: 14, background: '#f0f0f0', color: '#555', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, marginTop: 10 }}>Edit Shift Setup</button>
          </div>
        )}
      </div>

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

    </motion.div>
  );
}
