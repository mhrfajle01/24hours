import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { db } from '../firebase/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useSound } from '../contexts/SoundContext';

// ─── Constants ───────────────────────────────────────────────────────────────
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const PRIORITIES = [
  { key: 'high', label: 'High Priority', emoji: '🔴', color: '#FF4B4B', bg: '#FFF0F0' },
  { key: 'medium', label: 'Medium Priority', emoji: '🟡', color: '#FFB020', bg: '#FFF8E8' },
  { key: 'low', label: 'Low Priority', emoji: '🟢', color: '#58CC02', bg: '#F0FFF0' },
];
const XP_MAP = { high: 10, medium: 5, low: 2 };
const SECTION_BONUS = 10;
const DAY_BONUS = 25;
const WEEK_BONUS = 100;
const SPRING = { type: 'spring', damping: 20, stiffness: 400 };
const SPRING_BOUNCY = { type: 'spring', damping: 12, stiffness: 400 };
const TAGS = [
  { name: 'work', bg: '#e8f5e9', color: '#2e7d32' },
  { name: 'personal', bg: '#e3f2fd', color: '#1565c0' },
  { name: 'study', bg: '#fff3e0', color: '#e65100' },
  { name: 'health', bg: '#fce4ec', color: '#c62828' },
  { name: 'fitness', bg: '#e8eaf6', color: '#283593' },
];
const QUICK_EMOJIS = ['📋','💻','📚','🏃','🛒','📞','✍️','🧹','💡','🎯'];
const TEMPLATES = [
  { name: 'Morning Routine', tasks: [
    { text: 'Wake up early', priority: 'high', emoji: '🌅' },
    { text: 'Exercise 30min', priority: 'medium', emoji: '🏃' },
    { text: 'Healthy breakfast', priority: 'low', emoji: '🥗' },
  ]},
  { name: 'Study Block', tasks: [
    { text: 'Review notes', priority: 'high', emoji: '📖' },
    { text: 'Practice problems', priority: 'high', emoji: '✍️' },
    { text: 'Summarize learnings', priority: 'medium', emoji: '📝' },
  ]},
  { name: 'Work Day', tasks: [
    { text: 'Check emails', priority: 'medium', emoji: '📧' },
    { text: 'Team standup', priority: 'high', emoji: '📞' },
    { text: 'Deep work block', priority: 'high', emoji: '💻' },
    { text: 'Review PRs', priority: 'medium', emoji: '🔍' },
  ]},
];

const getWeekId = (date) => {
  const d = new Date(date);
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const getWeekDates = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return DAYS.map((_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return dt;
  });
};

const getTodayIndex = () => {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
};

const uid = () => `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Animated Checkbox ───────────────────────────────────────────────────────
function AnimatedCheckbox({ checked, color, onToggle }) {
  return (
    <motion.button
      onClick={onToggle}
      whileTap={{ scale: 0.8 }}
      style={{ width: 28, height: 28, borderRadius: '50%', border: `2.5px solid ${checked ? color : '#ccc'}`,
        background: checked ? color : 'transparent', display: 'flex', alignItems: 'center',
        justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }}
      aria-label={checked ? 'Mark incomplete' : 'Mark complete'} aria-checked={checked}
    >
      <AnimatePresence>
        {checked && (
          <motion.svg width="14" height="14" viewBox="0 0 14 14" initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
            transition={SPRING_BOUNCY}>
            <motion.path d="M2 7L5.5 10.5L12 3.5" fill="none" stroke="#fff" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }} />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ─── Confetti Particle ───────────────────────────────────────────────────────
function ConfettiBurst({ x, y, count = 12 }) {
  const colors = ['#FF4B4B','#FFB020','#58CC02','#1CB0F6','#CE82FF','#FF6B6B','#FCD34D'];
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i, color: colors[i % colors.length],
    angle: (360 / count) * i + (Math.random() * 30 - 15),
    dist: 40 + Math.random() * 60, size: 4 + Math.random() * 5,
    rot: Math.random() * 360,
  })), [count]);

  return (
    <div style={{ position: 'fixed', left: x, top: y, pointerEvents: 'none', zIndex: 9999 }}>
      {particles.map(p => (
        <motion.div key={p.id}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            x: Math.cos(p.angle * Math.PI / 180) * p.dist,
            y: Math.sin(p.angle * Math.PI / 180) * p.dist + 40,
            opacity: 0, scale: 0, rotate: p.rot,
          }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ position: 'absolute', width: p.size, height: p.size,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            background: p.color }}
        />
      ))}
    </div>
  );
}

// ─── XP Toast ────────────────────────────────────────────────────────────────
function XPToast({ xp, message }) {
  return (
    <motion.div
      initial={{ y: -60, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -40, opacity: 0 }} transition={SPRING}
      style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, #58CC02, #46A302)', color: '#fff',
        padding: '10px 20px', borderRadius: 50, fontWeight: 700, fontSize: 15,
        zIndex: 9999, boxShadow: '0 4px 20px rgba(88,204,2,0.4)', display: 'flex',
        alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
    >
      <span style={{ fontSize: 18 }}>⚡</span> +{xp} XP — {message}
    </motion.div>
  );
}

// ─── Full-screen Celebration (Day/Week Complete) ─────────────────────────────
function CelebrationOverlay({ title, subtitle, emoji, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const colors = ['#FF4B4B','#FFB020','#58CC02','#1CB0F6','#CE82FF','#FCD34D','#FF6B6B'];
  const particles = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    id: i, color: colors[i % colors.length], x: Math.random() * 100,
    delay: Math.random() * 0.5, size: 5 + Math.random() * 8,
  })), []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onDone}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)' }}>
      {particles.map(p => (
        <motion.div key={p.id}
          initial={{ y: -20, opacity: 1 }}
          animate={{ y: window.innerHeight + 20, opacity: 0 }}
          transition={{ duration: 2 + Math.random(), delay: p.delay, ease: 'easeIn' }}
          style={{ position: 'absolute', top: 0, left: `${p.x}%`, width: p.size, height: p.size,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px', background: p.color }}
        />
      ))}
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING_BOUNCY}
        style={{ fontSize: 72 }}>{emoji}</motion.div>
      <motion.h2 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.15 }}
        style={{ color: '#fff', fontWeight: 800, fontSize: 28, marginTop: 16, textAlign: 'center' }}>
        {title}
      </motion.h2>
      <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.25 }}
        style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, marginTop: 8 }}>
        {subtitle}
      </motion.p>
    </motion.div>
  );
}

// ─── Task Item ───────────────────────────────────────────────────────────────
function TaskItem({ task, priorityColor, onToggle, onDelete, onEdit, index }) {
  const dragX = useMotionValue(0);
  const deleteBg = useTransform(dragX, [-120, 0], [1, 0]);
  const [swiped, setSwiped] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -200, transition: { duration: 0.3 } }}
      transition={{ ...SPRING, delay: index * 0.04 }}
      style={{ position: 'relative', marginBottom: 8, overflow: 'hidden', borderRadius: 14 }}
    >
      {/* Delete bg */}
      <motion.div style={{ position: 'absolute', inset: 0, background: '#FF4B4B', borderRadius: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 20px',
        opacity: deleteBg }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>🗑️ Delete</span>
      </motion.div>

      <motion.div
        drag="x" dragConstraints={{ left: -120, right: 0 }} dragElastic={0.1}
        style={{ x: dragX, background: task.completed ? '#F0FFF4' : '#fff',
          borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'grab', position: 'relative', zIndex: 1,
          border: `1px solid ${task.completed ? '#C6F6D5' : '#f0f0f0'}` }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80) { onDelete(task.id); }
        }}
        onDoubleClick={() => onEdit(task)}
      >
        <AnimatedCheckbox checked={task.completed} color={priorityColor} onToggle={() => onToggle(task.id)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <motion.span animate={{ opacity: task.completed ? 0.5 : 1 }}
            style={{ fontSize: 15, fontWeight: 500, display: 'block',
              textDecoration: task.completed ? 'line-through' : 'none',
              color: task.completed ? '#999' : '#1a1a1a' }}>
            {task.emoji && <span style={{ marginRight: 6 }}>{task.emoji}</span>}
            {task.text}
          </motion.span>
          {task.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {task.tags.map(t => {
                const tc = TAGS.find(tg => tg.name === t) || { bg: '#f5f5f5', color: '#666' };
                return <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20,
                  background: tc.bg, color: tc.color, fontWeight: 600 }}>{t}</span>;
              })}
            </div>
          )}
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor, flexShrink: 0 }} />
      </motion.div>
    </motion.div>
  );
}

// ─── Add Task Bottom Sheet ───────────────────────────────────────────────────
function AddTaskSheet({ isOpen, onClose, onAdd, selectedDay, playSound }) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState('medium');
  const [day, setDay] = useState(selectedDay);
  const [emoji, setEmoji] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setDay(selectedDay); }, [selectedDay]);
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  const handleAdd = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), priority, day, emoji, tags: selectedTags });
    setText(''); setPriority('medium'); setEmoji(''); setSelectedTags([]);
  };

  const handleTemplate = (tpl) => {
    tpl.tasks.forEach(t => onAdd({ text: t.text, priority: t.priority, day, emoji: t.emoji, tags: [] }));
    setShowTemplates(false);
  };

  const toggleTag = (t) => setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(2px)', zIndex: 5000 }} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={SPRING}
            style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff',
              borderRadius: '24px 24px 0 0', padding: '16px 20px 28px', zIndex: 5001,
              maxHeight: '85dvh', overflowY: 'auto', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)' }}
          >
            {/* Drag handle */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: '#ddd',
              margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>✨ Add Task</h3>
              <button onClick={() => setShowTemplates(!showTemplates)}
                style={{ background: showTemplates ? '#58CC02' : '#f0f0f0', color: showTemplates ? '#fff' : '#333',
                  border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                📦 Templates
              </button>
            </div>

            <AnimatePresence>
              {showTemplates && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: 12 }}>
                  {TEMPLATES.map(tpl => (
                    <motion.button key={tpl.name} whileTap={{ scale: 0.97 }}
                      onClick={() => handleTemplate(tpl)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                        border: '1px solid #e8e8e8', borderRadius: 12, background: '#fafafa',
                        marginBottom: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                      {tpl.name} <span style={{ color: '#999', fontWeight: 400 }}>({tpl.tasks.length} tasks)</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Task input */}
            <input ref={inputRef} value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="What needs to be done?"
              style={{ width: '100%', padding: '14px 16px', fontSize: 16, border: '2px solid #e8e8e8',
                borderRadius: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                transition: 'border-color 0.2s' }}
              onFocus={e => e.target.style.borderColor = '#58CC02'}
              onBlur={e => e.target.style.borderColor = '#e8e8e8'}
            />

            {/* Emoji strip */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {QUICK_EMOJIS.map(e => (
                <motion.button key={e} whileTap={{ scale: 0.85 }}
                  onClick={() => setEmoji(emoji === e ? '' : e)}
                  style={{ width: 36, height: 36, borderRadius: 10, border: emoji === e ? '2px solid #58CC02' : '1px solid #eee',
                    background: emoji === e ? '#F0FFF0' : '#fafafa', fontSize: 18, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {e}
                </motion.button>
              ))}
            </div>

            {/* Priority pills */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {PRIORITIES.map(p => (
                <motion.button key={p.key} whileTap={{ scale: 0.9 }}
                  onClick={() => setPriority(p.key)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', fontWeight: 700,
                    fontSize: 13, cursor: 'pointer',
                    background: priority === p.key ? p.color : p.bg,
                    color: priority === p.key ? '#fff' : p.color,
                    transition: 'all 0.15s ease' }}>
                  {p.emoji} {p.label.split(' ')[0]}
                </motion.button>
              ))}
            </div>

            {/* Day selector */}
            <div style={{ display: 'flex', gap: 4, marginTop: 12, overflowX: 'auto' }}>
              {DAYS.map((d, i) => (
                <motion.button key={d} whileTap={{ scale: 0.9 }}
                  onClick={() => setDay(i)}
                  style={{ minWidth: 44, padding: '8px 4px', borderRadius: 10, border: 'none',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    background: day === i ? '#075E54' : '#f0f0f0',
                    color: day === i ? '#fff' : '#555' }}>
                  {DAY_SHORT[i]}
                </motion.button>
              ))}
            </div>

            {/* Tags */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {TAGS.map(t => (
                <motion.button key={t.name} whileTap={{ scale: 0.9 }}
                  onClick={() => toggleTag(t.name)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12,
                    fontWeight: 600, cursor: 'pointer',
                    background: selectedTags.includes(t.name) ? t.color : t.bg,
                    color: selectedTags.includes(t.name) ? '#fff' : t.color }}>
                  {t.name}
                </motion.button>
              ))}
            </div>

            {/* Add button */}
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={handleAdd}
              disabled={!text.trim()}
              style={{ width: '100%', padding: '15px', marginTop: 18, borderRadius: 16, border: 'none',
                background: text.trim() ? 'linear-gradient(135deg, #58CC02, #46A302)' : '#e0e0e0',
                color: text.trim() ? '#fff' : '#999', fontSize: 16, fontWeight: 800, cursor: text.trim() ? 'pointer' : 'default',
                boxShadow: text.trim() ? '0 4px 16px rgba(88,204,2,0.35)' : 'none',
                transition: 'all 0.2s ease' }}>
              Add Task ✨
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function TaskPlannerPage({ currentUser, onBack }) {
  const { playSound } = useSound();
  const [tasks, setTasks] = useState({});
  const [selectedDay, setSelectedDay] = useState(getTodayIndex());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [totalXP, setTotalXP] = useState(0);
  const [confetti, setConfetti] = useState(null);
  const [xpToast, setXpToast] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editText, setEditText] = useState('');
  const saveTimer = useRef(null);

  const now = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);
  const weekId = getWeekId(now);
  const weekDates = useMemo(() => getWeekDates(now), [now]);
  const docRef = currentUser?.uid ? doc(db, 'taskPlannerV2', currentUser.uid, 'weeks', weekId) : null;

  // Load data
  useEffect(() => {
    if (!docRef) return;
    setLoading(true);
    getDoc(docRef).then(snap => {
      if (snap.exists()) {
        const d = snap.data();
        setTasks(d.tasks || {});
        setTotalXP(d.totalXP || 0);
      } else {
        setTasks({});
        setTotalXP(0);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [weekId, currentUser?.uid]);

  // Auto-save debounced
  const persistData = useCallback((newTasks, newXP) => {
    if (!docRef) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await setDoc(docRef, { tasks: newTasks, totalXP: newXP, weekId, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (e) { console.error('Save failed', e); }
      setSaving(false);
    }, 800);
  }, [docRef, weekId]);

  // Helpers
  const dayTasks = useMemo(() => {
    return Object.values(tasks).filter(t => t.day === selectedDay).sort((a, b) => {
      const po = { high: 0, medium: 1, low: 2 };
      if (po[a.priority] !== po[b.priority]) return po[a.priority] - po[b.priority];
      return (a.order || 0) - (b.order || 0);
    });
  }, [tasks, selectedDay]);

  const dayProgress = useCallback((dayIdx) => {
    const dt = Object.values(tasks).filter(t => t.day === dayIdx);
    if (dt.length === 0) return -1; // no tasks
    return dt.filter(t => t.completed).length / dt.length;
  }, [tasks]);

  const weekProgress = useMemo(() => {
    const all = Object.values(tasks);
    if (all.length === 0) return 0;
    return all.filter(t => t.completed).length / all.length;
  }, [tasks]);

  const totalCompleted = useMemo(() => Object.values(tasks).filter(t => t.completed).length, [tasks]);

  // Flash XP toast
  const flashXP = (xp, msg) => {
    setXpToast({ xp, message: msg });
    setTimeout(() => setXpToast(null), 2500);
  };

  // Flash confetti at position
  const flashConfetti = (e) => {
    const rect = e?.target?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    setConfetti({ x, y, key: Date.now() });
    setTimeout(() => setConfetti(null), 800);
  };

  // Check section / day / week completion
  const checkCelebrations = (newTasks, dayIdx) => {
    const dt = Object.values(newTasks).filter(t => t.day === dayIdx);
    if (dt.length === 0) return;

    // Section complete checks
    for (const p of PRIORITIES) {
      const sectionTasks = dt.filter(t => t.priority === p.key);
      if (sectionTasks.length > 0 && sectionTasks.every(t => t.completed)) {
        const prevSectionTasks = Object.values(tasks).filter(t => t.day === dayIdx && t.priority === p.key);
        if (!prevSectionTasks.every(t => t.completed)) {
          flashXP(SECTION_BONUS, `${p.emoji} ${p.label} cleared!`);
          playSound('points');
        }
      }
    }

    // Day complete
    if (dt.length > 0 && dt.every(t => t.completed)) {
      const prevDt = Object.values(tasks).filter(t => t.day === dayIdx);
      if (!prevDt.every(t => t.completed)) {
        setTimeout(() => {
          setCelebration({ title: `${DAYS[dayIdx]} Complete!`, subtitle: `+${DAY_BONUS} XP earned`, emoji: '🏆' });
          playSound('success');
        }, 400);
      }
    }

    // Week complete
    const all = Object.values(newTasks);
    if (all.length > 0 && all.every(t => t.completed)) {
      const prevAll = Object.values(tasks);
      if (!prevAll.every(t => t.completed)) {
        setTimeout(() => {
          setCelebration({ title: 'PERFECT WEEK! 🎉', subtitle: `+${WEEK_BONUS} XP earned`, emoji: '👑' });
        }, 800);
      }
    }
  };

  // Add task
  const addTask = ({ text, priority, day, emoji, tags }) => {
    const id = uid();
    const newTask = { id, text, priority, day, emoji: emoji || '', tags: tags || [],
      completed: false, order: Object.values(tasks).filter(t => t.day === day).length, createdAt: Date.now() };
    const newTasks = { ...tasks, [id]: newTask };
    setTasks(newTasks);
    persistData(newTasks, totalXP);
    playSound('points');
    if ('vibrate' in navigator) navigator.vibrate(10);
  };

  // Toggle task
  const toggleTask = (id, e) => {
    const t = tasks[id];
    if (!t) return;
    const wasCompleted = t.completed;
    const newCompleted = !wasCompleted;
    let xpDelta = 0;

    if (newCompleted) {
      xpDelta = XP_MAP[t.priority] || 2;
      playSound('success');
      flashConfetti(e);
      flashXP(xpDelta, 'Task done!');
      if ('vibrate' in navigator) navigator.vibrate([10, 30, 10]);
    } else {
      xpDelta = -(XP_MAP[t.priority] || 2);
      playSound('missed');
    }

    const newXP = Math.max(0, totalXP + xpDelta);
    const newTasks = { ...tasks, [id]: { ...t, completed: newCompleted, completedAt: newCompleted ? Date.now() : null } };
    setTasks(newTasks);
    setTotalXP(newXP);

    if (newCompleted) checkCelebrations(newTasks, t.day);
    persistData(newTasks, newXP);
  };

  // Delete task
  const deleteTask = (id) => {
    const { [id]: _, ...rest } = tasks;
    setTasks(rest);
    persistData(rest, totalXP);
    playSound('trash');
    if ('vibrate' in navigator) navigator.vibrate(15);
  };

  // Edit task
  const startEdit = (task) => { setEditingTask(task); setEditText(task.text); };
  const saveEdit = () => {
    if (!editingTask || !editText.trim()) return;
    const newTasks = { ...tasks, [editingTask.id]: { ...tasks[editingTask.id], text: editText.trim() } };
    setTasks(newTasks);
    persistData(newTasks, totalXP);
    setEditingTask(null);
    playSound('points');
  };

  // Week navigation
  const changeWeek = (dir) => {
    setWeekOffset(prev => prev + dir);
    playSound('points');
  };

  const formatDateRange = () => {
    const s = weekDates[0]; const e = weekDates[6];
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${mo[s.getMonth()]} ${s.getDate()} – ${mo[e.getMonth()]} ${e.getDate()}`;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ minHeight: '100dvh', background: '#F7F7F7', fontFamily: "'Outfit', sans-serif",
        paddingBottom: 100 }}>

      {/* Celebrations */}
      <AnimatePresence>
        {celebration && <CelebrationOverlay {...celebration} onDone={() => setCelebration(null)} />}
        {xpToast && <XPToast key="xp" {...xpToast} />}
      </AnimatePresence>
      {confetti && <ConfettiBurst key={confetti.key} x={confetti.x} y={confetti.y} />}

      {/* ── Header ── */}
      <motion.div initial={{ y: -60 }} animate={{ y: 0 }} transition={SPRING}
        style={{ position: 'sticky', top: 0, zIndex: 100, background: 'linear-gradient(135deg, #075E54, #128C7E)',
          padding: '14px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <motion.button whileTap={{ scale: 0.85 }} onClick={onBack}
              style={{ width: 38, height: 38, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ←
            </motion.button>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: 1 }}>Weekly Planner</div>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 700 }}>📋 Task Planner</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* XP badge */}
            <motion.div key={totalXP} initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={SPRING_BOUNCY}
              style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '6px 14px',
                color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
              ⚡ {totalXP} XP
            </motion.div>
            {/* Save indicator */}
            {saving && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>💾</motion.div>
            )}
          </div>
        </div>

        {/* Week selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 10 }}>
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => changeWeek(-1)}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</motion.button>
          <motion.div key={weekId} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
            {weekOffset === 0 ? '📍 This Week' : formatDateRange()}
          </motion.div>
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => changeWeek(1)}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</motion.button>
          {weekOffset !== 0 && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setWeekOffset(0); setSelectedDay(getTodayIndex()); }}
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              style={{ background: '#25D366', border: 'none', borderRadius: 20, padding: '4px 12px',
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Today</motion.button>
          )}
        </div>
      </motion.div>

      {/* ── Day Overview Bar ── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.1 }}
        style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '16px 12px 8px',
          overflowX: 'auto' }}>
        {DAYS.map((d, i) => {
          const prog = dayProgress(i);
          const isToday = i === getTodayIndex() && weekOffset === 0;
          const isSelected = i === selectedDay;
          const isComplete = prog === 1;
          const hasOverdue = isToday && prog >= 0 && prog < 1;

          return (
            <motion.button key={d}
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ ...SPRING_BOUNCY, delay: i * 0.06 }}
              whileTap={{ scale: 0.85 }}
              onClick={() => { setSelectedDay(i); if ('vibrate' in navigator) navigator.vibrate(5); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', minWidth: 44 }}
            >
              <div style={{ position: 'relative', width: 42, height: 42 }}>
                {/* Progress ring */}
                <svg width="42" height="42" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
                  <circle cx="21" cy="21" r="18" fill="none" stroke="#e8e8e8" strokeWidth="3" />
                  {prog > 0 && (
                    <motion.circle cx="21" cy="21" r="18" fill="none"
                      stroke={isComplete ? '#58CC02' : hasOverdue ? '#FF4B4B' : '#FFB020'}
                      strokeWidth="3" strokeLinecap="round"
                      initial={{ strokeDasharray: `0 ${2 * Math.PI * 18}` }}
                      animate={{ strokeDasharray: `${prog * 2 * Math.PI * 18} ${2 * Math.PI * 18}` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  )}
                </svg>
                {/* Inner circle */}
                <motion.div animate={{ scale: isSelected ? 1 : 0.85 }} transition={SPRING_BOUNCY}
                  style={{ position: 'absolute', top: 5, left: 5, width: 32, height: 32, borderRadius: '50%',
                    background: isSelected ? '#075E54' : isComplete ? '#F0FFF0' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isSelected ? '0 2px 8px rgba(7,94,84,0.3)' : isToday ? '0 0 0 2px #25D366' : 'none',
                    fontSize: isComplete ? 14 : 12, fontWeight: 700,
                    color: isSelected ? '#fff' : isComplete ? '#58CC02' : '#555' }}>
                  {isComplete ? '✓' : weekDates[i]?.getDate()}
                </motion.div>
              </div>
              <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500,
                color: isSelected ? '#075E54' : '#888' }}>
                {DAY_SHORT[i]}
              </span>
              {isToday && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#25D366' }} />}
            </motion.button>
          );
        })}
      </motion.div>

      {/* ── Weekly Progress Bar ── */}
      <div style={{ padding: '0 20px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 4 }}>
          <span>{totalCompleted} / {Object.values(tasks).length} tasks</span>
          <span>{Math.round(weekProgress * 100)}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: '#e8e8e8', overflow: 'hidden' }}>
          <motion.div animate={{ width: `${weekProgress * 100}%` }} transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ height: '100%', borderRadius: 3,
              background: weekProgress === 1 ? '#58CC02' : 'linear-gradient(90deg, #58CC02, #46A302)' }} />
        </div>
      </div>

      {/* ── Day Content ── */}
      <div style={{ padding: '8px 16px' }}>
        <AnimatePresence mode="wait">
          <motion.div key={`${weekId}-${selectedDay}`}
            initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          >
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>
                  {DAYS[selectedDay]}
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
                  {weekDates[selectedDay]?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              {dayTasks.length > 0 && (
                <div style={{ fontSize: 13, fontWeight: 600, color: dayProgress(selectedDay) === 1 ? '#58CC02' : '#888' }}>
                  {dayTasks.filter(t => t.completed).length}/{dayTasks.length} done
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  style={{ display: 'inline-block', fontSize: 28 }}>⏳</motion.div>
                <p style={{ marginTop: 8, fontSize: 14 }}>Loading tasks...</p>
              </div>
            ) : dayTasks.length === 0 ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={SPRING}
                style={{ textAlign: 'center', padding: '50px 20px', background: '#fff', borderRadius: 20,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#333' }}>No tasks yet</h3>
                <p style={{ margin: 0, fontSize: 14, color: '#888' }}>
                  Tap the <span style={{ color: '#58CC02', fontWeight: 700 }}>＋</span> button to add your first task!
                </p>
              </motion.div>
            ) : (
              /* Priority sections */
              PRIORITIES.map(p => {
                const sectionTasks = dayTasks.filter(t => t.priority === p.key);
                if (sectionTasks.length === 0) return null;
                const allDone = sectionTasks.every(t => t.completed);
                return (
                  <motion.div key={p.key} layout style={{ marginBottom: 16 }}>
                    <motion.div animate={{ background: allDone ? p.bg : 'transparent' }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                        padding: '6px 10px', borderRadius: 10 }}>
                      <span style={{ fontSize: 14 }}>{p.emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: allDone ? p.color : '#555',
                        textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {p.label}
                      </span>
                      <span style={{ fontSize: 12, color: '#aaa', fontWeight: 500 }}>
                        {sectionTasks.filter(t => t.completed).length}/{sectionTasks.length}
                      </span>
                      {allDone && (
                        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING_BOUNCY}
                          style={{ fontSize: 12, marginLeft: 'auto' }}>✅</motion.span>
                      )}
                    </motion.div>
                    <AnimatePresence>
                      {sectionTasks.map((task, idx) => (
                        <TaskItem key={task.id} task={task} priorityColor={p.color}
                          onToggle={(id) => toggleTask(id)} onDelete={deleteTask}
                          onEdit={startEdit} index={idx} />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Edit Modal ── */}
      <AnimatePresence>
        {editingTask && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditingTask(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 5000 }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={SPRING}
              style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff',
                borderRadius: '20px 20px 0 0', padding: '20px', zIndex: 5001 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#ddd', margin: '0 auto 16px' }} />
              <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>✏️ Edit Task</h3>
              <input value={editText} onChange={e => setEditText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
                style={{ width: '100%', padding: '12px 14px', fontSize: 16, border: '2px solid #e8e8e8',
                  borderRadius: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                autoFocus />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setEditingTask(null)}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #e0e0e0',
                    background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={saveEdit}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none',
                    background: '#58CC02', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Save</motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── FAB ── */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        animate={{ rotate: sheetOpen ? 45 : 0 }}
        transition={SPRING_BOUNCY}
        onClick={() => { setSheetOpen(!sheetOpen); playSound('points'); if ('vibrate' in navigator) navigator.vibrate(10); }}
        style={{ position: 'fixed', bottom: 28, right: 20, width: 58, height: 58, borderRadius: '50%',
          border: 'none', background: 'linear-gradient(135deg, #58CC02, #46A302)', color: '#fff',
          fontSize: 28, fontWeight: 300, cursor: 'pointer', zIndex: 4999,
          boxShadow: '0 4px 16px rgba(88,204,2,0.45)', display: 'flex', alignItems: 'center',
          justifyContent: 'center' }}
        aria-label="Add Task"
      >
        ＋
      </motion.button>

      {/* ── Bottom Sheet ── */}
      <AddTaskSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)}
        onAdd={(t) => { addTask(t); setSheetOpen(false); }} selectedDay={selectedDay} playSound={playSound} />

      {/* ── Footer Stats ── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        style={{ padding: '12px 20px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#aaa' }}>
          {Object.values(tasks).length > 0
            ? `📊 ${totalCompleted} completed · ⚡ ${totalXP} XP earned this week`
            : 'Start planning your week! Add tasks to get started ✨'
          }
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ccc' }}>
          Auto-saved to cloud · Swipe task left to delete · Double-tap to edit
        </p>
      </motion.div>
    </motion.div>
  );
}
