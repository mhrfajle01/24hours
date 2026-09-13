import React, { useState, useEffect, useRef } from 'react';
import { useTodos } from '../hooks/useTodos';
import { useFirestore } from '../hooks/useFirestore';
import { isFeatureActive } from '../utils/helpers';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Free tags every user gets
const FREE_TAGS = ['work', 'personal', 'study'];
const TAG_UNLOCK_COST = 150; // points to unlock unlimited tags

// Tag color palette for visual flair
const TAG_COLORS = {
  work: { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
  personal: { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
  study: { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
  health: { bg: '#fce4ec', text: '#c62828', border: '#ef9a9a' },
  finance: { bg: '#f3e5f5', text: '#6a1b9a', border: '#ce93d8' },
  social: { bg: '#e0f7fa', text: '#00695c', border: '#80cbc4' },
  errands: { bg: '#fff8e1', text: '#f57f17', border: '#fff176' },
  fitness: { bg: '#e8eaf6', text: '#283593', border: '#9fa8da' },
};
const DEFAULT_TAG_COLOR = { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' };

export default function TodoAppModal({ isOpen, onClose, currentUser }) {
  const { todos, loading, addTodo, updateTodo, deleteTodo, reorderTodos } = useTodos(currentUser?.uid);
  const { addReport, updatePoints, pointsData, unlockFeature } = useFirestore(null, currentUser?.uid);
  
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState('All'); // All, Active, Completed
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  
  const [sortBy, setSortBy] = useState('none');
  const [viewMode, setViewMode] = useState('list');
  const [schedulingTodo, setSchedulingTodo] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ day: '', timeSlot: '', priority: 'normal' });

  // Sync state
  const [syncPreviewTasks, setSyncPreviewTasks] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Points celebration state
  const [pointsToast, setPointsToast] = useState(null); // { message, points, type }
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiRef = useRef(null);
  const inboxZeroChecked = useRef(false);

  // Tag unlock state
  const [showTagUnlockModal, setShowTagUnlockModal] = useState(false);
  const [pendingTagText, setPendingTagText] = useState('');

  // Check for yesterday's Inbox Zero bonus on mount
  // Bonus is deferred — only awarded after midnight to ensure inbox truly stayed clear
  useEffect(() => {
    if (loading || inboxZeroChecked.current || !updatePoints || !isOpen) return;
    inboxZeroChecked.current = true;

    const checkInboxZeroBonus = async () => {
      try {
        const raw = localStorage.getItem('inbox-zero-candidate');
        if (!raw) return;
        const candidate = JSON.parse(raw);
        if (!candidate?.date) return;

        const today = new Date().toISOString().split('T')[0];
        // Only award if candidate date is before today (past midnight)
        if (candidate.date >= today) return;

        await updatePoints(50, `🏆 Inbox Zero! ${candidate.taskCount} tasks cleared on ${candidate.date} +50`, 'earn', {}, `todo-inbox-zero:${candidate.date}`);
        showPointsToast('🏆 Yesterday\'s INBOX ZERO! +50 bonus pts!', 50, 'bonus');
        triggerConfetti();
        localStorage.removeItem('inbox-zero-candidate');
      } catch (err) {
        console.error('Inbox zero check failed:', err);
      }
    };

    checkInboxZeroBonus();
  }, [loading, isOpen]);

  if (!isOpen) return null;

  const getTagColor = (tag) => TAG_COLORS[tag] || DEFAULT_TAG_COLOR;

  const getPointsForPriority = (priority) => {
    if (priority === 'high') return 10;
    if (priority === 'medium') return 5;
    return 2; // low or normal
  };

  const showPointsToast = (message, points, type = 'earn') => {
    setPointsToast({ message, points, type });
    setTimeout(() => setPointsToast(null), 3500);
  };

  const triggerConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  };

  const getUsedTags = () => {
    const tags = new Set();
    todos.forEach(t => { if (t.tag) tags.add(t.tag.toLowerCase()); });
    return tags;
  };

  const isTagAllowed = (tag) => {
    if (!tag) return true;
    if (isFeatureActive(pointsData, 'unlimited_todo_tags')) return true;
    if (FREE_TAGS.includes(tag.toLowerCase())) return true;
    // Allow if already used (grandfathered)
    const usedTags = getUsedTags();
    const freePlusUsed = new Set([...FREE_TAGS, ...usedTags]);
    return freePlusUsed.has(tag.toLowerCase());
  };

  const getCustomTagCount = () => {
    const usedTags = getUsedTags();
    let custom = 0;
    usedTags.forEach(t => { if (!FREE_TAGS.includes(t)) custom++; });
    return custom;
  };

  const parseTodo = (text) => {
    let priority = 'normal';
    let tag = '';
    let timeSlot = '';
    let day = '';
    let cleanText = text;

    if (cleanText.includes('!high')) { priority = 'high'; cleanText = cleanText.replace('!high', ''); }
    else if (cleanText.includes('!med')) { priority = 'medium'; cleanText = cleanText.replace('!med', ''); }
    else if (cleanText.includes('!low')) { priority = 'low'; cleanText = cleanText.replace('!low', ''); }

    const tagMatch = cleanText.match(/#(\w+)/);
    if (tagMatch) { tag = tagMatch[1]; cleanText = cleanText.replace(tagMatch[0], ''); }

    const timeMatch = cleanText.match(/@([\w:-]+)/);
    if (timeMatch) { timeSlot = timeMatch[1]; cleanText = cleanText.replace(timeMatch[0], ''); }

    return { text: cleanText.trim(), priority, tag: tag.toLowerCase(), timeSlot, day };
  };

  const handleAddTodo = async (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      const { text, priority, tag, timeSlot, day } = parseTodo(inputValue);
      
      // Tag gating: check if user can use this tag
      if (tag && !isTagAllowed(tag)) {
        setPendingTagText(inputValue);
        setShowTagUnlockModal(true);
        return;
      }

      await addTodo({
        text: text || inputValue.trim(),
        completed: false, priority, tag, timeSlot, day, createdAt: Date.now()
      });
      setInputValue('');
    }
  };

  const handleUnlockTags = async () => {
    try {
      await unlockFeature('unlimited_todo_tags', TAG_UNLOCK_COST, 'Unlimited Todo Tags');
      setShowTagUnlockModal(false);
      showPointsToast('Unlimited tags unlocked for 7 days!', TAG_UNLOCK_COST, 'spend');

      // Now add the pending todo
      if (pendingTagText) {
        const { text, priority, tag, timeSlot, day } = parseTodo(pendingTagText);
        await addTodo({
          text: text || pendingTagText.trim(),
          completed: false, priority, tag, timeSlot, day, createdAt: Date.now()
        });
        setPendingTagText('');
        setInputValue('');
      }
    } catch (err) {
      showPointsToast(err.message || 'Failed to unlock', 0, 'error');
    }
  };

  const toggleTodo = async (todo) => {
    const wasCompleted = todo.completed;
    const nowCompleted = !wasCompleted;
    
    await updateTodo(todo.id, { completed: nowCompleted });
    
    if (!updatePoints) return;

    const pts = getPointsForPriority(todo.priority);
    const priorityLabel = todo.priority === 'normal' ? '' : ` (${todo.priority.toUpperCase()})`;
    const today = new Date().toISOString().split('T')[0];

    if (nowCompleted) {
      // Award points for completing
      await updatePoints(pts, `✅ Todo: "${todo.text}"${priorityLabel} +${pts}`, 'earn');
      showPointsToast(`+${pts} pts for completing task!`, pts, 'earn');

      // Check for Inbox Zero — save candidate, bonus awarded next day after midnight
      const allOtherCompleted = todos.every(t => t.id === todo.id ? true : t.completed);
      if (allOtherCompleted && todos.length >= 3) {
        localStorage.setItem('inbox-zero-candidate', JSON.stringify({ date: today, taskCount: todos.length }));
        showPointsToast('📋 Inbox Zero! Bonus +50 pts awarded tomorrow 🕛', 0, 'bonus');
      }
    } else {
      // Deduct points for un-completing — prevent exploit of toggling on/off
      await updatePoints(-pts, `↩️ Unchecked: "${todo.text}"${priorityLabel} -${pts}`, 'spend');
      showPointsToast(`-${pts} pts (task unchecked)`, pts, 'spend');

      // Invalidate today's inbox zero candidate since a task was unchecked
      try {
        const raw = localStorage.getItem('inbox-zero-candidate');
        if (raw) {
          const candidate = JSON.parse(raw);
          if (candidate?.date === today) {
            localStorage.removeItem('inbox-zero-candidate');
          }
        }
      } catch {}
    }
  };

  const startEditing = (todo) => {
    setEditingId(todo.id);
    let fullText = todo.text;
    if (todo.timeSlot) fullText += ` @${todo.timeSlot}`;
    if (todo.tag) fullText += ` #${todo.tag}`;
    if (todo.priority && todo.priority !== 'normal') {
      if (todo.priority === 'high') fullText += ' !high';
      if (todo.priority === 'medium') fullText += ' !med';
      if (todo.priority === 'low') fullText += ' !low';
    }
    setEditValue(fullText);
  };

  const saveEdit = () => {
    if (editValue.trim() && editingId) {
      const { text, priority, tag, timeSlot } = parseTodo(editValue);
      updateTodo(editingId, { text: text || editValue.trim(), priority, tag, timeSlot });
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') setEditingId(null);
  };

  const handleDeleteTodo = async (todo) => {
    // If deleting a completed task, deduct the points that were earned
    if (todo.completed && updatePoints) {
      const pts = getPointsForPriority(todo.priority);
      await updatePoints(-pts, `🗑️ Deleted completed: "${todo.text}" -${pts}`, 'spend');
      showPointsToast(`-${pts} pts (completed task deleted)`, pts, 'spend');
    }
    await deleteTodo(todo.id);
  };

  const handleDragStart = (e, index) => e.dataTransfer.setData('todoIndex', index.toString());
  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e, index) => {
    const dragIndexStr = e.dataTransfer.getData('todoIndex');
    if (!dragIndexStr) return;
    const dragIndex = parseInt(dragIndexStr, 10);
    if (dragIndex === index) return;

    const newTodos = [...filteredAndSortedTodos];
    const draggedItem = newTodos[dragIndex];
    newTodos.splice(dragIndex, 1);
    newTodos.splice(index, 0, draggedItem);
    
    const allTodosNew = [...todos];
    const itemInAll = allTodosNew.find(t => t.id === draggedItem.id);
    const targetItemInAll = allTodosNew.find(t => t.id === filteredAndSortedTodos[index].id);
    
    if (itemInAll && targetItemInAll) {
       const fromIdx = allTodosNew.indexOf(itemInAll);
       const toIdx = allTodosNew.indexOf(targetItemInAll);
       allTodosNew.splice(fromIdx, 1);
       allTodosNew.splice(toIdx, 0, itemInAll);
       reorderTodos(allTodosNew);
    }
  };

  const openScheduleModal = (todo) => {
    setSchedulingTodo(todo);
    setScheduleForm({ day: todo.day || '', timeSlot: todo.timeSlot || '', priority: todo.priority || 'normal' });
  };

  const saveSchedule = () => {
    if (schedulingTodo) {
      updateTodo(schedulingTodo.id, { day: scheduleForm.day, timeSlot: scheduleForm.timeSlot, priority: scheduleForm.priority });
    }
    setSchedulingTodo(null);
  };

  // --- Real Sync Logic ---
  
  const getNextDateForDay = (dayName) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDay = days.indexOf(dayName);
    const now = new Date();
    const currentDay = now.getDay();
    let diff = targetDay - currentDay;
    if (diff < 0) diff += 7; 
    
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + diff);
    
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const convertTo24Hour = (timeStr) => {
    const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return { hrStr: "12:00", hour: 12, ampm: "PM" };
    let hr = parseInt(match[1]);
    const min = match[2];
    const ampm = match[3].toUpperCase();
    
    let hr24 = hr;
    if (ampm === 'PM' && hr < 12) hr24 += 12;
    if (ampm === 'AM' && hr === 12) hr24 = 0;
    
    return {
      hrStr: `${String(hr24).padStart(2, '0')}:${min}`,
      hour: hr,
      ampm: ampm
    };
  };

  const prepareSync = () => {
    const scheduledTasks = todos.filter(t => t.day && t.timeSlot && !t.completed);
    if (scheduledTasks.length === 0) {
      alert("No pending tasks with both a Scheduled Day and Time found!");
      return;
    }

    const prepared = scheduledTasks.map(t => {
      // timeSlot might be "2:00 PM" or "2:00 PM - 3:00 PM"
      const parts = t.timeSlot.split('-');
      const startInfo = convertTo24Hour(parts[0]);
      let endInfo = null;
      if (parts.length > 1) {
        endInfo = convertTo24Hour(parts[1]);
      } else {
        // default 1 hour block
        let endHr24 = (parseInt(startInfo.hrStr.split(':')[0]) + 1) % 24;
        endInfo = { hrStr: `${String(endHr24).padStart(2, '0')}:${startInfo.hrStr.split(':')[1]}` };
      }

      return {
        todoId: t.id,
        todoText: t.text,
        date: getNextDateForDay(t.day),
        dayName: t.day,
        hour: startInfo.hour,
        ampm: startInfo.ampm,
        startTime: startInfo.hrStr,
        endTime: endInfo.hrStr,
        priority: t.priority
      };
    });

    setSyncPreviewTasks(prepared);
  };

  const confirmSync = async () => {
    if (!syncPreviewTasks) return;
    setIsSyncing(true);
    
    try {
      for (const task of syncPreviewTasks) {
        const prefix = task.priority === 'high' ? '🔥 ' : '';
        await addReport({
          date: task.date,
          hour: task.hour,
          ampm: task.ampm,
          startTime: task.startTime,
          endTime: task.endTime,
          plan: `${prefix}${task.todoText}`,
          report: '',
          status: 'Pending'
        });
      }
      
      alert(`Successfully synced ${syncPreviewTasks.length} tasks to your Planner!`);
    } catch (e) {
      console.error(e);
      alert("Failed to sync tasks.");
    } finally {
      setIsSyncing(false);
      setSyncPreviewTasks(null);
    }
  };

  const getPriorityWeight = (priority) => {
    if (priority === 'high') return 3;
    if (priority === 'medium') return 2;
    if (priority === 'low') return 1;
    return 0;
  };

  const getDayWeight = (day) => {
    const idx = DAYS_OF_WEEK.indexOf(day);
    return idx === -1 ? 999 : idx; 
  };

  let filteredAndSortedTodos = todos.filter(t => {
    if (filter === 'Active') return !t.completed;
    if (filter === 'Completed') return t.completed;
    return true;
  });

  if (sortBy === 'priority') {
    filteredAndSortedTodos.sort((a, b) => getPriorityWeight(b.priority) - getPriorityWeight(a.priority));
  } else if (sortBy === 'day') {
    filteredAndSortedTodos.sort((a, b) => getDayWeight(a.day) - getDayWeight(b.day));
  }

  const completedCount = todos.filter(t => t.completed).length;
  const progressPercent = todos.length === 0 ? 0 : Math.round((completedCount / todos.length) * 100);

  const renderTodoItem = (todo, index) => {
    const tagColor = todo.tag ? getTagColor(todo.tag) : null;
    return (
    <div
      key={todo.id}
      className={`card border-0 shadow-sm rounded-4 animate-fade-in transition-all hover-scale-sm ${todo.completed ? 'opacity-75' : ''}`}
      draggable={sortBy === 'none'}
      onDragStart={(e) => handleDragStart(e, index)}
      onDrop={(e) => handleDrop(e, index)}
      onDragOver={handleDragOver}
      style={{ cursor: sortBy === 'none' ? 'grab' : 'default' }}
      onDoubleClick={() => startEditing(todo)}
    >
      <div className="card-body p-3 d-flex align-items-center gap-3">
        <div 
          onClick={() => toggleTodo(todo)}
          className="d-flex align-items-center justify-content-center rounded-circle border flex-shrink-0"
          style={{ width: '24px', height: '24px', cursor: 'pointer', backgroundColor: todo.completed ? '#075E54' : 'white', borderColor: todo.completed ? '#075E54' : '#dee2e6', transition: 'all 0.3s' }}
        >
          {todo.completed && <i className="bi bi-check text-white" style={{ fontSize: '1.2rem', marginTop: '2px' }} />}
        </div>
        <div className="flex-grow-1 min-w-0">
          {editingId === todo.id ? (
            <input type="text" className="form-control form-control-sm shadow-none border-success" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={handleEditKeyDown} onBlur={saveEdit} autoFocus />
          ) : (
            <div className="d-flex flex-column">
              <span className={`fw-bold text-truncate ${todo.completed ? 'text-decoration-line-through text-muted' : 'text-dark'}`} style={{ transition: 'all 0.3s ease' }}>{todo.text}</span>
              {(todo.tag || todo.priority !== 'normal' || todo.timeSlot || todo.day) && (
                <div className="d-flex gap-1 mt-1 flex-wrap">
                  {todo.day && (
                    <span className="badge border rounded-pill" style={{ fontSize: '0.65rem', backgroundColor: '#e9ecef', color: '#495057', cursor: 'pointer' }} onClick={() => { setFilter('All'); setSortBy('day'); }} title="Click to sort by day">
                      <i className="bi bi-calendar-event me-1" />{todo.day}
                    </span>
                  )}
                  {todo.timeSlot && (
                    <span className="badge bg-light text-dark border rounded-pill" style={{ fontSize: '0.65rem' }}>
                      <i className="bi bi-clock me-1" />{todo.timeSlot}
                    </span>
                  )}
                  {todo.priority !== 'normal' && (
                    <span className="badge rounded-pill" style={{ fontSize: '0.65rem', backgroundColor: todo.priority === 'high' ? '#c62828' : todo.priority === 'medium' ? '#e65100' : '#2e7d32', color: 'white' }}>
                      {todo.priority === 'high' ? '🔥' : todo.priority === 'medium' ? '⚡' : '🌿'} {todo.priority.toUpperCase()}
                      <span className="ms-1 opacity-75" style={{ fontSize: '0.6rem' }}>+{getPointsForPriority(todo.priority)}pt</span>
                    </span>
                  )}
                  {todo.tag && (
                    <span className="badge rounded-pill" style={{ fontSize: '0.65rem', backgroundColor: tagColor.bg, color: tagColor.text, border: `1px solid ${tagColor.border}` }}>#{todo.tag}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <button className="btn btn-sm btn-light border-0 shadow-none text-primary p-1 ms-auto flex-shrink-0" onClick={() => openScheduleModal(todo)} title="Schedule Task" style={{ fontSize: '1.1rem' }}><i className="bi bi-calendar-plus" /></button>
        <button className="btn btn-sm btn-link text-danger p-1 shadow-none opacity-50 hover-opacity-100 flex-shrink-0" onClick={() => handleDeleteTodo(todo)}><i className="bi bi-trash3" /></button>
      </div>
    </div>
  )};

  return (
    <>
      <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1070 }} onClick={onClose} />
      <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1080 }} tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden" style={{ background: '#f8f9fa' }}>
            
            <div className="modal-header border-0 text-white pb-3 position-relative" style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}>
              <div>
                <h5 className="modal-title fw-bold d-flex align-items-center gap-2 m-0">
                  <i className="bi bi-check2-square" />
                  Dynamic Todo List
                </h5>
                <p className="mb-0 text-white-50 small mt-1">Smart tags (#), priority (!high) & time slot (@10:00AM)</p>
              </div>
              
              <button 
                className="btn btn-sm btn-outline-light position-absolute rounded-pill fw-bold" 
                style={{ right: '50px', top: '15px', fontSize: '0.8rem' }}
                onClick={prepareSync}
              >
                <i className="bi bi-arrow-repeat me-1" /> Sync to Planner
              </button>
              
              <button type="button" className="btn-close btn-close-white shadow-none position-absolute" style={{ right: '15px', top: '15px' }} onClick={onClose} />
            </div>

            <div className="modal-body p-0">
              {/* Points & Tag Info Bar */}
              <div className="px-4 py-2 bg-white border-bottom d-flex justify-content-between align-items-center" style={{ background: 'linear-gradient(90deg, #e8f5e9, #fff8e1)' }}>
                <div className="d-flex align-items-center gap-3">
                  <span className="badge rounded-pill shadow-sm" style={{ background: '#075E54', color: 'white', fontSize: '0.75rem', padding: '6px 12px' }}>
                    🪙 {pointsData?.points ?? 0} pts
                  </span>
                  <span className="text-secondary small fw-semibold" style={{ fontSize: '0.7rem' }}>
                    <i className="bi bi-info-circle me-1" />
                    Complete tasks to earn points!
                  </span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  {hasUnlimitedTags ? (
                    <span className="badge bg-success-subtle text-success border rounded-pill" style={{ fontSize: '0.65rem' }}>
                      <i className="bi bi-infinity me-1" />Tags Unlocked
                    </span>
                  ) : (
                    <span className="badge bg-warning-subtle text-warning border rounded-pill" style={{ fontSize: '0.65rem', cursor: 'pointer' }} onClick={() => setShowTagUnlockModal(true)}>
                      🏷️ {FREE_TAGS.length} Free Tags
                    </span>
                  )}
                </div>
              </div>

              <div className="px-4 py-3 bg-white border-bottom">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="small fw-bold text-secondary">Task Progress</span>
                  <span className="small fw-bold" style={{ color: '#075E54' }}>{progressPercent}%</span>
                </div>
                <div className="progress rounded-pill" style={{ height: '8px' }}>
                  <div className="progress-bar rounded-pill" role="progressbar" style={{ width: `${progressPercent}%`, backgroundColor: progressPercent === 100 ? '#FFD700' : '#075E54', transition: 'width 0.5s ease' }} />
                </div>
                {todos.length >= 3 && progressPercent < 100 && (
                  <div className="text-end mt-1">
                    <span className="text-warning small fw-bold" style={{ fontSize: '0.65rem' }}>
                      <i className="bi bi-trophy-fill me-1" />Clear all {todos.length} tasks for +50 bonus!
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 bg-white pb-2">
                <div className="input-group shadow-sm rounded-pill overflow-hidden border">
                  <span className="input-group-text bg-white border-0 text-muted ps-3"><i className="bi bi-plus-circle" /></span>
                  <input type="text" className="form-control border-0 shadow-none py-2" placeholder="E.g., Doctor appointment @10:30AM #health !high" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleAddTodo} style={{ fontSize: '0.95rem' }} />
                </div>
              </div>

              <div className="px-4 py-2 bg-white d-flex flex-wrap justify-content-between align-items-center border-bottom gap-2">
                <div className="d-flex gap-2">
                  {['All', 'Active', 'Completed'].map(f => (
                    <button key={f} className={`btn btn-sm rounded-pill px-3 fw-bold transition-all ${filter === f ? 'btn-success' : 'btn-light border'}`} onClick={() => setFilter(f)} style={{ backgroundColor: filter === f ? '#075E54' : '', borderColor: filter === f ? '#075E54' : '', fontSize: '0.8rem' }}>{f}</button>
                  ))}
                </div>
                <div className="d-flex gap-2 align-items-center">
                  <select className="form-select form-select-sm rounded-pill shadow-none fw-bold text-secondary border-0 bg-light" style={{ width: 'auto', fontSize: '0.8rem', cursor: 'pointer' }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="none">Sort: Default</option>
                    <option value="priority">Sort: Priority</option>
                    <option value="day">Sort: Day</option>
                  </select>
                  <div className="btn-group border rounded-pill overflow-hidden" role="group">
                    <button type="button" className={`btn btn-sm shadow-none fw-bold ${viewMode === 'list' ? 'btn-secondary text-white' : 'btn-light text-secondary'}`} style={{ fontSize: '0.8rem' }} onClick={() => setViewMode('list')}><i className="bi bi-list-ul me-1" />List</button>
                    <button type="button" className={`btn btn-sm shadow-none fw-bold ${viewMode === 'weekly' ? 'btn-secondary text-white' : 'btn-light text-secondary'}`} style={{ fontSize: '0.8rem' }} onClick={() => setViewMode('weekly')}><i className="bi bi-calendar-week me-1" />Weekly</button>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-light overflow-auto" style={{ maxHeight: '50vh', minHeight: '30vh' }}>
                {loading ? (
                  <div className="text-center text-muted py-5"><div className="spinner-border text-success" /></div>
                ) : filteredAndSortedTodos.length === 0 ? (
                  <div className="text-center text-muted py-5 animate-fade-in"><i className="bi bi-inbox fs-1 mb-2 d-block opacity-50" /><p>No tasks found.</p></div>
                ) : viewMode === 'list' ? (
                  <div className="d-flex flex-column gap-2">
                    {filteredAndSortedTodos.map((todo, index) => renderTodoItem(todo, index))}
                  </div>
                ) : (
                  <div className="row g-3">
                    {DAYS_OF_WEEK.map(day => {
                      const dayTasks = filteredAndSortedTodos.filter(t => t.day === day);
                      return (
                        <div className="col-12 col-md-6 col-lg-4" key={day}>
                          <div className="card h-100 border-0 shadow-sm rounded-4">
                            <div className="card-header bg-white border-bottom-0 pt-3 pb-0"><h6 className="fw-bold text-dark m-0">{day} <span className="badge bg-light text-secondary rounded-pill ms-1">{dayTasks.length}</span></h6></div>
                            <div className="card-body p-2 d-flex flex-column gap-2">
                              {dayTasks.length === 0 ? <p className="text-muted small text-center my-3 opacity-50">No tasks</p> : dayTasks.map((todo, index) => renderTodoItem(todo, index))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="col-12 mt-4">
                      <h6 className="fw-bold text-secondary mb-3">Unscheduled / Someday</h6>
                      <div className="d-flex flex-column gap-2">
                        {filteredAndSortedTodos.filter(t => !DAYS_OF_WEEK.includes(t.day)).map((todo, index) => renderTodoItem(todo, index))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {schedulingTodo && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1090 }} onClick={() => setSchedulingTodo(null)} />
          <div className="modal fade show d-block animate-fade-in" style={{ zIndex: 1095 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered modal-sm">
              <div className="modal-content border-0 rounded-4 shadow">
                <div className="modal-header border-0 pb-0">
                  <h6 className="fw-bold m-0"><i className="bi bi-calendar-plus text-primary me-2" />Schedule Task</h6>
                  <button type="button" className="btn-close shadow-none" onClick={() => setSchedulingTodo(null)} />
                </div>
                <div className="modal-body">
                  <p className="small text-truncate text-secondary mb-3">"{schedulingTodo.text}"</p>
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-dark">Day</label>
                    <select className="form-select rounded-3 shadow-none" value={scheduleForm.day} onChange={e => setScheduleForm({...scheduleForm, day: e.target.value})}>
                      <option value="">Any day</option>
                      {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-dark">Time Slot</label>
                    <input type="text" className="form-control rounded-3 shadow-none" placeholder="e.g. 2:00 PM - 3:45 PM" value={scheduleForm.timeSlot} onChange={e => setScheduleForm({...scheduleForm, timeSlot: e.target.value})} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-dark">Priority</label>
                    <select className="form-select rounded-3 shadow-none" value={scheduleForm.priority} onChange={e => setScheduleForm({...scheduleForm, priority: e.target.value})}>
                      <option value="normal">Normal (+2 pts)</option>
                      <option value="low">Low (+2 pts)</option>
                      <option value="medium">Medium (+5 pts)</option>
                      <option value="high">High (+10 pts)</option>
                    </select>
                  </div>
                  <button className="btn btn-primary w-100 rounded-pill fw-bold" onClick={saveSchedule}>Save Schedule</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {syncPreviewTasks && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1100 }} onClick={() => setSyncPreviewTasks(null)} />
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1105 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg">
                <div className="modal-header bg-light border-0">
                  <h6 className="fw-bold m-0"><i className="bi bi-arrow-repeat text-primary me-2" />Sync to Planner</h6>
                  <button type="button" className="btn-close shadow-none" onClick={() => setSyncPreviewTasks(null)} />
                </div>
                <div className="modal-body p-4">
                  <p className="text-secondary small mb-3">The following {syncPreviewTasks.length} tasks will be created in your daily planner blocks:</p>
                  
                  <div className="list-group list-group-flush mb-4 overflow-auto" style={{ maxHeight: '45vh' }}>
                    {syncPreviewTasks.map((t, idx) => (
                      <div key={idx} className="list-group-item bg-transparent px-0 border-bottom d-flex flex-column gap-2 py-3">
                        <div className="fw-bold small text-dark">{t.todoText}</div>
                        
                        <div className="row g-2">
                          <div className="col-12 col-sm-4">
                            <label className="form-label text-secondary" style={{ fontSize: '0.65rem', marginBottom: '2px' }}>Day</label>
                            <select 
                              className="form-select form-select-sm shadow-none bg-light border-0 fw-bold" 
                              style={{ fontSize: '0.75rem' }}
                              value={t.dayName}
                              onChange={(e) => {
                                const newTasks = [...syncPreviewTasks];
                                newTasks[idx].dayName = e.target.value;
                                newTasks[idx].date = getNextDateForDay(e.target.value);
                                setSyncPreviewTasks(newTasks);
                              }}
                            >
                              {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          
                          <div className="col-6 col-sm-4">
                            <label className="form-label text-secondary" style={{ fontSize: '0.65rem', marginBottom: '2px' }}>Start Time</label>
                            <input 
                              type="time" 
                              className="form-control form-control-sm shadow-none bg-light border-0 fw-bold" 
                              style={{ fontSize: '0.75rem' }}
                              value={t.startTime}
                              onChange={(e) => {
                                const newTasks = [...syncPreviewTasks];
                                const val = e.target.value;
                                newTasks[idx].startTime = val;
                                const h24 = parseInt(val.split(':')[0]);
                                newTasks[idx].ampm = h24 >= 12 ? 'PM' : 'AM';
                                newTasks[idx].hour = h24 % 12 || 12;
                                setSyncPreviewTasks(newTasks);
                              }}
                            />
                          </div>

                          <div className="col-6 col-sm-4">
                            <label className="form-label text-secondary" style={{ fontSize: '0.65rem', marginBottom: '2px' }}>End Time</label>
                            <input 
                              type="time" 
                              className="form-control form-control-sm shadow-none bg-light border-0 fw-bold" 
                              style={{ fontSize: '0.75rem' }}
                              value={t.endTime}
                              onChange={(e) => {
                                const newTasks = [...syncPreviewTasks];
                                newTasks[idx].endTime = e.target.value;
                                setSyncPreviewTasks(newTasks);
                              }}
                            />
                          </div>
                        </div>
                        
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>
                          <i className="bi bi-info-circle me-1" />Will sync to: {t.date}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="d-flex gap-2">
                    <button className="btn btn-light rounded-pill flex-grow-1 fw-bold" onClick={() => setSyncPreviewTasks(null)} disabled={isSyncing}>Cancel</button>
                    <button className="btn btn-primary rounded-pill flex-grow-1 fw-bold" onClick={confirmSync} disabled={isSyncing}>
                      {isSyncing ? <span className="spinner-border spinner-border-sm me-2" /> : 'Confirm & Sync'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Tag Unlock Modal */}
      {showTagUnlockModal && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setShowTagUnlockModal(false)} />
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered modal-sm">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #6a1b9a, #8e24aa)' }}>
                  <h6 className="modal-title fw-bold d-flex align-items-center gap-2"><i className="bi bi-tags-fill" /> Unlock Tags</h6>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setShowTagUnlockModal(false)} />
                </div>
                <div className="modal-body p-4 text-center">
                  <div className="mb-3">
                    <i className="bi bi-lock-fill text-warning fs-1"></i>
                  </div>
                  <h6 className="fw-bold text-dark">Unlimited Custom Tags</h6>
                  <p className="text-secondary small mb-3">You currently have 3 free tags: <strong>{FREE_TAGS.join(', ')}</strong>. Unlock unlimited custom tags to organize tasks your way!</p>
                  <div className="card border-0 bg-light rounded-3 p-3 mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="fw-bold text-dark">Cost</span>
                      <span className="fw-bold text-warning">{TAG_UNLOCK_COST} 🪙</span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center mt-1">
                      <span className="text-secondary small">Your Balance</span>
                      <span className={`fw-bold small ${(pointsData?.points ?? 0) >= TAG_UNLOCK_COST ? 'text-success' : 'text-danger'}`}>{pointsData?.points ?? 0} 🪙</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-warning rounded-pill w-100 fw-bold text-dark shadow-sm"
                    disabled={(pointsData?.points ?? 0) < TAG_UNLOCK_COST}
                    onClick={handleUnlockTags}
                  >
                    <i className="bi bi-unlock-fill me-2" />
                    {(pointsData?.points ?? 0) >= TAG_UNLOCK_COST ? `Unlock for ${TAG_UNLOCK_COST} pts` : `Not enough points (need ${TAG_UNLOCK_COST - (pointsData?.points ?? 0)} more)`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Points Toast */}
      {pointsToast && (
        <div className="position-fixed top-0 start-50 translate-middle-x mt-3 animate-slide-down-toast-container" style={{ zIndex: 9999, width: 'min(92vw, 380px)' }}>
          <div className={`toast show align-items-center border-0 rounded-4 text-white px-3 py-2 shadow-lg ${pointsToast.type === 'error' ? 'bg-danger' : pointsToast.type === 'bonus' ? '' : pointsToast.type === 'spend' ? '' : 'bg-success'}`} style={pointsToast.type === 'bonus' ? { background: 'linear-gradient(135deg, #FFD700, #FFA000)' } : pointsToast.type === 'spend' ? { background: 'linear-gradient(135deg, #6a1b9a, #8e24aa)' } : {}}>
            <div className="d-flex align-items-center gap-2">
              <span style={{ fontSize: '1.5rem' }}>{pointsToast.type === 'bonus' ? '🏆' : pointsToast.type === 'spend' ? '🏷️' : pointsToast.type === 'error' ? '❌' : '🪙'}</span>
              <span className="fw-bold small flex-grow-1">{pointsToast.message}</span>
              <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setPointsToast(null)}></button>
            </div>
          </div>
        </div>
      )}

      {/* Confetti for Inbox Zero */}
      {showConfetti && (
        <div ref={confettiRef} className="position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 9998, pointerEvents: 'none', overflow: 'hidden' }}>
          {Array.from({ length: 60 }).map((_, i) => (
            <div key={i} className="confetti-piece" style={{
              position: 'absolute',
              width: `${Math.random() * 10 + 6}px`,
              height: `${Math.random() * 10 + 6}px`,
              backgroundColor: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#FF7979', '#6C5CE7'][i % 10],
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              left: `${Math.random() * 100}%`,
              top: '-20px',
              animation: `confetti-fall ${2 + Math.random() * 2}s ease-out ${Math.random() * 1}s forwards`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }} />
          ))}
        </div>
      )}

      <style>{`
        .transition-all { transition: all 0.2s ease-in-out; }
        .hover-scale-sm:hover { transform: scale(1.01); }
        .hover-opacity-100 { opacity: 1 !important; }
        .min-w-0 { min-width: 0; }
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .animate-slide-down-toast-container {
          animation: slideDownToast 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes slideDownToast {
          0% { transform: translate(-50%, -100%); opacity: 0; }
          100% { transform: translate(-50%, 0); opacity: 1; }
        }
      `}
      </style>
    </>
  );
}
