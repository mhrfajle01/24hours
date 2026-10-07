import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase/firebase';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { useSound } from '../contexts/SoundContext';

const SPRING = { type: 'spring', damping: 20, stiffness: 400 };

const fmtTime = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const fmt12h = (t24) => {
  if (!t24) return '';
  const [h, m] = t24.split(':');
  let hh = parseInt(h, 10);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${hh}:${m} ${ampm}`;
};

const formatStopwatch = (totalSeconds) => {
  const isNeg = totalSeconds < 0;
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${isNeg ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

  // --- NEW DIGITAL CLOCK & BREAK SYSTEM STATE ---
  const [clockStatus, setClockStatus] = useState('idle'); // idle, active, break
  const [shiftStartMs, setShiftStartMs] = useState(null);
  const [totalAccumulatedMs, setTotalAccumulatedMs] = useState(0);
  
  const [breakStartMs, setBreakStartMs] = useState(null);
  const [breakDurationMs, setBreakDurationMs] = useState(0);
  
  const [elapsedShiftSec, setElapsedShiftSec] = useState(0);
  const [breakRemainingSec, setBreakRemainingSec] = useState(0);
  
  const [showBreakOptions, setShowBreakOptions] = useState(false);
  const [customBreakMins, setCustomBreakMins] = useState(30);
  
  // Custom Modal State
  const [customAlert, setCustomAlert] = useState({ isOpen: false, type: 'confirm', title: '', message: '', onConfirm: null });
  // ----------------------------------------------

  // Date selection - allow today or previous day
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isToday = selectedDate === todayStr;
  
  const docRef = currentUser?.uid ? doc(db, 'shiftTracker', currentUser.uid) : null;

  useEffect(() => {
    if (!currentUser?.uid) return;
    
    const loadData = async () => {
      if (isToday) {
        // Load from main doc for today
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
            if(d.blocks && d.blocks.length > 0) setSetupMode(false);
            
            if(d.clockStatus) setClockStatus(d.clockStatus);
            if(d.shiftStartMs) setShiftStartMs(d.shiftStartMs);
            if(d.totalAccumulatedMs) setTotalAccumulatedMs(d.totalAccumulatedMs);
            if(d.breakStartMs) setBreakStartMs(d.breakStartMs);
            if(d.breakDurationMs) setBreakDurationMs(d.breakDurationMs);
            if(d.earnedBreak) setEarnedBreak(d.earnedBreak);
          } else {
            resetState();
          }
        } else {
          resetState();
        }
      } else {
        // Load from history subcollection for previous day
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
          if(d.blocks && d.blocks.length > 0) setSetupMode(false);
          else setSetupMode(true);
        } else {
          resetState();
        }
        // Disable clock for past dates
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
  };

  const save = (b, extraData = {}) => {
    if (!currentUser?.uid) return;
    const currentBlocks = b || blocks;
    const totalProducedNow = currentBlocks.reduce((s, blk) => s + (blk.logged ? blk.actual : 0), 0);
    
    if (isToday) {
      // Save to main doc (live tracker)
      setDoc(docRef, { 
        date: todayStr, target, unit, shiftStart, shiftEnd, blockLen, blocks: currentBlocks,
        clockStatus, shiftStartMs, totalAccumulatedMs, breakStartMs, breakDurationMs, earnedBreak,
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
      totalBreakSec: 0,
      updatedAt: Date.now()
    }, { merge: true });
  };

  // Clock Ticker
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Digital Stopwatch Ticker
  useEffect(() => {
    let interval = null;
    if (clockStatus === 'active' || clockStatus === 'break') {
      interval = setInterval(() => {
        const currentMs = Date.now();
        if (clockStatus === 'active') {
          setElapsedShiftSec(Math.floor((totalAccumulatedMs + (currentMs - shiftStartMs)) / 1000));
        } else if (clockStatus === 'break') {
          const passed = currentMs - breakStartMs;
          setBreakRemainingSec(Math.floor((breakDurationMs - passed) / 1000));
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
    setElapsedShiftSec(0);
    playSound('success');
    save(blocks, { clockStatus: 'active', shiftStartMs: Date.now(), totalAccumulatedMs: 0 });
  };

  const startBreak = (mins) => {
    const currentMs = Date.now();
    const newTotal = totalAccumulatedMs + (currentMs - shiftStartMs);
    setTotalAccumulatedMs(newTotal);
    setBreakDurationMs(mins * 60000);
    setBreakStartMs(currentMs);
    setClockStatus('break');
    setShowBreakOptions(false);
    
    // Deduct earned break if used
    if (earnedBreak > 0) {
       setEarnedBreak(0);
    }
    
    playSound('points');
    save(blocks, { clockStatus: 'break', totalAccumulatedMs: newTotal, breakDurationMs: mins * 60000, breakStartMs: currentMs, earnedBreak: 0 });
  };

  const handleEndBreak = () => {
    setClockStatus('active');
    const stMs = Date.now();
    setShiftStartMs(stMs);
    playSound('success');
    save(blocks, { clockStatus: 'active', shiftStartMs: stMs });
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
    recalcTargets(b, target);
    setBlocks(b);
    setSetupMode(false);
    save(b);
    playSound('points');
  };

  const recalcTargets = (blks, total) => {
    let produced = 0;
    let unloggedWorkBlocks = 0;
    
    blks.forEach(b => {
      if (b.isBreak) return;
      if (b.logged) produced += b.actual;
      else unloggedWorkBlocks++;
    });
    
    const rem = Math.max(0, total - produced);
    const perUnlogged = unloggedWorkBlocks > 0 ? rem / unloggedWorkBlocks : 0;
    
    blks.forEach(b => {
      if (!b.isBreak && !b.logged) b.target = perUnlogged;
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
    
    recalcTargets(nb, target);
    setBlocks(nb);
    save(nb, { earnedBreak: newEarnedBreak });
  };

  const resetBlock = (id) => {
    const nb = [...blocks];
    nb[id].logged = false;
    nb[id].actual = 0;
    nb[id].cumulative = 0;
    recalcTargets(nb, target);
    setBlocks(nb);
    save(nb);
  };

  const currTimeStr = fmtTime(now);
  const currentBlockIdx = blocks.findIndex(b => currTimeStr >= b.start && currTimeStr < b.end);
  const totalProduced = blocks.reduce((s, b) => s + (b.logged ? b.actual : 0), 0);
  const isOverBreak = breakRemainingSec < 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100dvh', background: '#F7F7F7', paddingBottom: 100, fontFamily: "'Outfit', sans-serif" }}>
      
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
              <input type="number" value={target} onChange={e => setTarget(e.target.value === '' ? '' : Number(e.target.value))} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc' }} />
            </label>
            
            <label style={{ display: 'block', marginBottom: 10, fontSize: 14, fontWeight: 600 }}>Unit
              <input type="text" value={unit} onChange={e => setUnit(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc' }} />
            </label>
            
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <label style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Shift Start
                <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc' }} />
              </label>
              <label style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Shift End
                <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 4, borderRadius: 8, border: '1px solid #ccc' }} />
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
            {isToday && <div style={{ background: '#fff', padding: 20, borderRadius: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', marginBottom: 16, textAlign: 'center' }}>
               
               {clockStatus === 'idle' ? (
                 <>
                   <div style={{ fontSize: 14, color: '#888', fontWeight: 600, marginBottom: 8 }}>SHIFT NOT STARTED</div>
                   <div style={{ fontSize: 40, fontWeight: 800, color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>00:00:00</div>
                   <button onClick={handleClockIn} style={{ marginTop: 16, width: '100%', padding: 14, background: '#1CB0F6', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16 }}>Clock In</button>
                 </>
               ) : clockStatus === 'active' ? (
                 <>
                   <div style={{ fontSize: 14, color: '#1CB0F6', fontWeight: 700, marginBottom: 4 }}>ACTIVE SHIFT</div>
                   <div style={{ fontSize: 48, fontWeight: 800, color: '#333', fontVariantNumeric: 'tabular-nums' }}>{formatStopwatch(elapsedShiftSec)}</div>
                   
                   {!showBreakOptions ? (
                     <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                       <button onClick={() => setShowBreakOptions(true)} style={{ flex: 1, padding: 12, background: '#FFF4E5', color: '#FFB020', border: '2px solid #FFB020', borderRadius: 12, fontWeight: 700 }}>Take Break</button>
                       <button onClick={handleClockOut} style={{ flex: 1, padding: 12, background: '#f5f5f5', color: '#888', border: 'none', borderRadius: 12, fontWeight: 700 }}>Clock Out</button>
                     </div>
                   ) : (
                     <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16, padding: 12, background: '#f9f9f9', borderRadius: 12, border: '1px solid #eee' }}>
                       <div style={{ fontSize: 14, fontWeight: 600, color: '#555', marginBottom: 10 }}>Select Break Duration</div>
                       <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                         {[15, 30, 45, 60].map(m => (
                           <button key={m} onClick={() => startBreak(m)} style={{ flexShrink: 0, padding: '8px 16px', background: '#FFB020', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700 }}>{m}m</button>
                         ))}
                       </div>
                       <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                         <input type="number" value={customBreakMins} onChange={e => setCustomBreakMins(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ccc' }} />
                         <button onClick={() => startBreak(Number(customBreakMins))} style={{ padding: '8px 16px', background: '#555', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700 }}>Start Custom</button>
                       </div>
                       <button onClick={() => setShowBreakOptions(false)} style={{ width: '100%', marginTop: 8, padding: 8, background: 'none', color: '#888', border: 'none', fontWeight: 600 }}>Cancel</button>
                     </motion.div>
                   )}
                 </>
               ) : (
                 <>
                   <div style={{ fontSize: 14, color: isOverBreak ? '#FF4B4B' : '#FFB020', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>{isOverBreak ? 'Over Break Time!' : 'On Break'}</div>
                   <div style={{ fontSize: 48, fontWeight: 800, color: isOverBreak ? '#FF4B4B' : '#FFB020', fontVariantNumeric: 'tabular-nums' }}>{formatStopwatch(breakRemainingSec)}</div>
                   <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Shift Time: {formatStopwatch(elapsedShiftSec)}</div>
                   <button onClick={handleEndBreak} style={{ marginTop: 16, width: '100%', padding: 14, background: '#58CC02', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16 }}>End Break & Resume Shift</button>
                 </>
               )}
            </div>}

            {/* Earned Break Banner */}
            <AnimatePresence>
              {earnedBreak > 0 && clockStatus === 'active' && (
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} style={{ marginBottom: 16, padding: 16, background: '#CE82FF', borderRadius: 16, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>🎉 <b>Earned Break:</b> {earnedBreak} mins</div>
                  <button onClick={() => startBreak(earnedBreak)} style={{ background: '#fff', color: '#CE82FF', border: 'none', padding: '6px 12px', borderRadius: 12, fontWeight: 700 }}>Start</button>
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
                const statusColor = b.logged ? (b.actual >= b.target ? '#58CC02' : '#FF4B4B') : '#E0E0E0';
                
                return (
                  <motion.div key={i} layout style={{ background: clockStatus === 'break' && isActiveTime ? '#FFF4E5' : '#fff', padding: 16, borderRadius: 16, borderLeft: `6px solid ${clockStatus === 'break' && isActiveTime ? '#FFB020' : statusColor}`, boxShadow: isActiveTime ? '0 4px 12px rgba(28,176,246,0.1)' : '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 10, opacity: (clockStatus === 'break' && isActiveTime) ? 0.8 : 1 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#888', fontWeight: 700 }}>
                        {fmt12h(b.start)} - {fmt12h(b.end)} 
                        {isActiveTime && clockStatus === 'active' && <span style={{ color: '#1CB0F6' }}> • Active</span>}
                        {isActiveTime && clockStatus === 'break' && <span style={{ color: '#FFB020' }}> • On Break</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Block Target: {b.target.toFixed(1)}</div>
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
            
            {/* Save to Report Button - allows saving without clock */}
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
                  recalcTargets(nb, target);
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
