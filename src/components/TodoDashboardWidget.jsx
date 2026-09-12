import React, { useState } from 'react';
import { useTodos } from '../hooks/useTodos';

export default function TodoDashboardWidget({ currentUser, onOpenSettings }) {
  const { todos, loading, updateTodo } = useTodos(currentUser?.uid);
  
  if (!currentUser) return null;

  const activeTodos = todos.filter(t => !t.completed).slice(0, 5); // Show top 5 active
  const completedCount = todos.filter(t => t.completed).length;
  const progressPercent = todos.length === 0 ? 0 : Math.round((completedCount / todos.length) * 100);

  return (
    <div className="container-fluid max-width-container px-3 mt-3 animate-slide-up">
      <div className="bg-white rounded-4 shadow-sm border p-3">
        
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-check2-square fs-5 text-success" />
            <h6 className="fw-bold m-0 text-dark">Today's Tasks</h6>
          </div>
          <button 
            className="btn btn-sm btn-light border rounded-pill shadow-none fw-bold"
            onClick={() => onOpenSettings('general')}
            title="Open Full Todo App"
          >
            Manage <i className="bi bi-arrow-right ms-1" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="small text-secondary" style={{ fontSize: '0.7rem' }}>Overall Progress</span>
            <span className="small fw-bold text-success" style={{ fontSize: '0.75rem' }}>{progressPercent}%</span>
          </div>
          <div className="progress rounded-pill bg-light" style={{ height: '6px' }}>
            <div 
              className="progress-bar bg-success rounded-pill" 
              role="progressbar" 
              style={{ width: `${progressPercent}%`, transition: 'width 0.5s ease' }} 
            />
          </div>
        </div>

        {/* Task List Preview */}
        {loading ? (
          <div className="text-center py-2"><div className="spinner-border spinner-border-sm text-success" /></div>
        ) : activeTodos.length === 0 ? (
          <div className="text-center text-muted py-3 small">
            {todos.length === 0 
              ? "You haven't added any tasks yet. Click 'Manage' to start!" 
              : "All tasks completed! Great job! 🎉"
            }
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {activeTodos.map((todo) => (
              <div 
                key={todo.id} 
                className="d-flex align-items-center gap-3 p-2 rounded-3 border transition-all hover-scale-sm"
                style={{ backgroundColor: '#f8f9fa' }}
              >
                <div 
                  onClick={() => updateTodo(todo.id, { completed: !todo.completed })}
                  className="d-flex align-items-center justify-content-center rounded-circle border bg-white shadow-sm"
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                >
                  {todo.completed && <i className="bi bi-check text-success" style={{ fontSize: '1rem', marginTop: '2px' }} />}
                </div>
                
                <div className="flex-grow-1 min-w-0 d-flex flex-column">
                  <span className="small fw-bold text-dark text-truncate" style={{ fontSize: '0.85rem' }}>
                    {todo.text}
                  </span>
                  {(todo.timeSlot || todo.priority !== 'normal' || todo.tag) && (
                    <div className="d-flex gap-1 mt-1 flex-wrap">
                      {todo.timeSlot && (
                        <span className="badge bg-white text-secondary border rounded-pill" style={{ fontSize: '0.6rem' }}>
                          <i className="bi bi-clock me-1" />{todo.timeSlot}
                        </span>
                      )}
                      {todo.priority === 'high' && (
                        <span className="badge bg-danger rounded-pill" style={{ fontSize: '0.6rem' }}>HIGH</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
