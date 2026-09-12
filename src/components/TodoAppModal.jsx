import React, { useState } from 'react';
import { useTodos } from '../hooks/useTodos';

export default function TodoAppModal({ isOpen, onClose, currentUser }) {
  const { todos, loading, addTodo, updateTodo, deleteTodo, reorderTodos } = useTodos(currentUser?.uid);
  const [inputValue, setInputValue] = useState('');
  const [filter, setFilter] = useState('All'); // All, Active, Completed
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  if (!isOpen) return null;

  const parseTodo = (text) => {
    let priority = 'normal';
    let tag = '';
    let timeSlot = '';
    let cleanText = text;

    // Extract Priority
    if (cleanText.includes('!high')) { priority = 'high'; cleanText = cleanText.replace('!high', ''); }
    else if (cleanText.includes('!med')) { priority = 'medium'; cleanText = cleanText.replace('!med', ''); }
    else if (cleanText.includes('!low')) { priority = 'low'; cleanText = cleanText.replace('!low', ''); }

    // Extract Tag
    const tagMatch = cleanText.match(/#(\w+)/);
    if (tagMatch) { tag = tagMatch[1]; cleanText = cleanText.replace(tagMatch[0], ''); }

    // Extract Timing slot (e.g. @10:00AM)
    const timeMatch = cleanText.match(/@([\w:]+)/);
    if (timeMatch) { timeSlot = timeMatch[1]; cleanText = cleanText.replace(timeMatch[0], ''); }

    return {
      text: cleanText.trim(),
      priority,
      tag: tag.toLowerCase(),
      timeSlot,
    };
  };

  const handleAddTodo = async (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      const { text, priority, tag, timeSlot } = parseTodo(inputValue);
      
      const newTodo = {
        text: text || inputValue.trim(),
        completed: false,
        priority,
        tag,
        timeSlot,
      };
      
      await addTodo(newTodo);
      setInputValue('');
    }
  };

  const toggleTodo = (todo) => {
    updateTodo(todo.id, { completed: !todo.completed });
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

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('todoIndex', index.toString());
  };

  const handleDrop = (e, index) => {
    const dragIndexStr = e.dataTransfer.getData('todoIndex');
    if (!dragIndexStr) return;
    const dragIndex = parseInt(dragIndexStr, 10);
    if (dragIndex === index) return;

    const newTodos = [...filteredTodos];
    const draggedItem = newTodos[dragIndex];
    newTodos.splice(dragIndex, 1);
    newTodos.splice(index, 0, draggedItem);
    
    // Convert filtered order back to global order
    const allTodosNew = [...todos];
    const itemInAll = allTodosNew.find(t => t.id === draggedItem.id);
    const targetItemInAll = allTodosNew.find(t => t.id === filteredTodos[index].id);
    
    if (itemInAll && targetItemInAll) {
       const fromIdx = allTodosNew.indexOf(itemInAll);
       const toIdx = allTodosNew.indexOf(targetItemInAll);
       allTodosNew.splice(fromIdx, 1);
       allTodosNew.splice(toIdx, 0, itemInAll);
       reorderTodos(allTodosNew);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const filteredTodos = todos.filter(t => {
    if (filter === 'Active') return !t.completed;
    if (filter === 'Completed') return t.completed;
    return true;
  });

  const completedCount = todos.filter(t => t.completed).length;
  const progressPercent = todos.length === 0 ? 0 : Math.round((completedCount / todos.length) * 100);

  const getPriorityColor = (priority) => {
    if (priority === 'high') return '#dc3545';
    if (priority === 'medium') return '#ffc107';
    if (priority === 'low') return '#17a2b8';
    return 'transparent';
  };

  return (
    <>
      <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1070 }} onClick={onClose} />
      <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1080 }} tabIndex="-1">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden" style={{ background: '#f8f9fa' }}>
            
            <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}>
              <div>
                <h5 className="modal-title fw-bold d-flex align-items-center gap-2 m-0">
                  <i className="bi bi-check2-square" />
                  Dynamic Todo List
                </h5>
                <p className="mb-0 text-white-50 small mt-1">Smart tags (#), priority (!high) & time slot (@10:00AM)</p>
              </div>
              <button type="button" className="btn-close btn-close-white shadow-none" onClick={onClose} />
            </div>

            <div className="modal-body p-0">
              {/* Progress */}
              <div className="px-4 py-3 bg-white border-bottom">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="small fw-bold text-secondary">Task Progress</span>
                  <span className="small fw-bold" style={{ color: '#075E54' }}>{progressPercent}%</span>
                </div>
                <div className="progress rounded-pill" style={{ height: '8px' }}>
                  <div 
                    className="progress-bar rounded-pill" 
                    role="progressbar" 
                    style={{ 
                      width: `${progressPercent}%`, backgroundColor: '#075E54', transition: 'width 0.5s ease'
                    }} 
                  />
                </div>
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white">
                <div className="input-group shadow-sm rounded-pill overflow-hidden border">
                  <span className="input-group-text bg-white border-0 text-muted ps-3">
                    <i className="bi bi-plus-circle" />
                  </span>
                  <input
                    type="text"
                    className="form-control border-0 shadow-none py-2"
                    placeholder="E.g., Doctor appointment @10:30AM #health !high"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleAddTodo}
                    style={{ fontSize: '0.95rem' }}
                  />
                </div>
              </div>

              {/* Filters */}
              <div className="d-flex gap-2 px-4 pb-3 bg-white">
                {['All', 'Active', 'Completed'].map(f => (
                  <button
                    key={f}
                    className={`btn btn-sm rounded-pill px-3 fw-bold transition-all ${filter === f ? 'btn-success' : 'btn-light border'}`}
                    onClick={() => setFilter(f)}
                    style={{ backgroundColor: filter === f ? '#075E54' : '', borderColor: filter === f ? '#075E54' : '' }}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Todo List */}
              <div className="p-4 bg-light overflow-auto" style={{ maxHeight: '50vh' }}>
                {loading ? (
                  <div className="text-center text-muted py-5"><div className="spinner-border text-success" /></div>
                ) : filteredTodos.length === 0 ? (
                  <div className="text-center text-muted py-5 animate-fade-in">
                    <i className="bi bi-inbox fs-1 mb-2 d-block opacity-50" />
                    <p>No tasks found. Add one above!</p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {filteredTodos.map((todo, index) => (
                      <div
                        key={todo.id}
                        className={`card border-0 shadow-sm rounded-4 animate-fade-in transition-all hover-scale-sm ${todo.completed ? 'opacity-75' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragOver={handleDragOver}
                        style={{ cursor: 'grab' }}
                        onDoubleClick={() => startEditing(todo)}
                      >
                        <div className="card-body p-3 d-flex align-items-center gap-3">
                          
                          {/* Checkbox */}
                          <div 
                            onClick={() => toggleTodo(todo)}
                            className="d-flex align-items-center justify-content-center rounded-circle border"
                            style={{ 
                              width: '24px', height: '24px', cursor: 'pointer',
                              backgroundColor: todo.completed ? '#075E54' : 'white',
                              borderColor: todo.completed ? '#075E54' : '#dee2e6'
                            }}
                          >
                            {todo.completed && <i className="bi bi-check text-white" style={{ fontSize: '1.2rem', marginTop: '2px' }} />}
                          </div>

                          {/* Content */}
                          <div className="flex-grow-1 min-w-0">
                            {editingId === todo.id ? (
                              <input
                                type="text"
                                className="form-control form-control-sm shadow-none border-success"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                onBlur={saveEdit}
                                autoFocus
                              />
                            ) : (
                              <div className="d-flex flex-column">
                                <span className={`fw-bold text-truncate ${todo.completed ? 'text-decoration-line-through text-muted' : 'text-dark'}`} style={{ transition: 'all 0.3s ease' }}>
                                  {todo.text}
                                </span>
                                {(todo.tag || todo.priority !== 'normal' || todo.timeSlot) && (
                                  <div className="d-flex gap-1 mt-1 flex-wrap">
                                    {todo.timeSlot && (
                                      <span className="badge bg-light text-dark border rounded-pill" style={{ fontSize: '0.65rem' }}>
                                        <i className="bi bi-clock me-1" />{todo.timeSlot}
                                      </span>
                                    )}
                                    {todo.priority !== 'normal' && (
                                      <span className="badge rounded-pill" style={{ backgroundColor: getPriorityColor(todo.priority), fontSize: '0.65rem' }}>
                                        {todo.priority.toUpperCase()}
                                      </span>
                                    )}
                                    {todo.tag && (
                                      <span className="badge bg-light text-secondary border rounded-pill" style={{ fontSize: '0.65rem' }}>
                                        #{todo.tag}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Delete Action */}
                          <button
                            className="btn btn-sm btn-link text-danger p-0 shadow-none opacity-50 hover-opacity-100"
                            onClick={() => deleteTodo(todo.id)}
                          >
                            <i className="bi bi-trash3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .transition-all { transition: all 0.2s ease-in-out; }
        .hover-scale-sm:hover { transform: scale(1.01); }
        .hover-opacity-100 { opacity: 1 !important; }
      `}</style>
    </>
  );
}
