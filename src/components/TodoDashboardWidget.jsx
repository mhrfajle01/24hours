import React from 'react';
import { useTodos } from '../hooks/useTodos';

export default function TodoDashboardWidget({ currentUser, onOpenTodo }) {
  const { todos, loading, updateTodo } = useTodos(currentUser?.uid);
  
  if (!currentUser) return null;

  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const activeTodos = todos.filter(t => !t.completed);
  
  const todayTodos = activeTodos.filter(t => t.day === todayName).slice(0, 5);
  const unscheduledTodos = activeTodos.filter(t => !t.day).slice(0, 3);
  
  const completedCount = todos.filter(t => t.completed).length;
  const progressPercent = todos.length === 0 ? 0 : Math.round((completedCount / todos.length) * 100);

  const scheduleForToday = (id) => {
    updateTodo(id, { day: todayName });
  };

  const renderTodo = (todo, showScheduleBtn = false) => (
    <div 
      key={todo.id} 
      className="d-flex align-items-center gap-2 p-2 rounded-3 border transition-all hover-scale-sm mb-2"
      style={{ backgroundColor: '#f8f9fa' }}
    >
      <div 
        onClick={() => updateTodo(todo.id, { completed: !todo.completed })}
        className="d-flex align-items-center justify-content-center rounded-circle border bg-white shadow-sm flex-shrink-0"
        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
      >
        {todo.completed && <i className="bi bi-check text-success" style={{ fontSize: '1rem', marginTop: '2px' }} />}
      </div>
      
      <div className="flex-grow-1 min-w-0 d-flex flex-column">
        <span className="small fw-bold text-dark text-truncate" style={{ fontSize: '0.85rem' }}>
          {todo.text}
        </span>
        {(todo.timeSlot || todo.priority !== 'normal' || todo.tag || todo.day) && (
          <div className="d-flex gap-1 mt-1 flex-wrap">
            {todo.day && (
              <span className="badge bg-light text-secondary border rounded-pill" style={{ fontSize: '0.6rem' }}>
                <i className="bi bi-calendar-event me-1" />{todo.day}
              </span>
            )}
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

      {showScheduleBtn && (
        <button 
          className="btn btn-sm btn-outline-primary border-0 rounded-pill p-1 shadow-none flex-shrink-0"
          onClick={() => scheduleForToday(todo.id)}
          title={`Schedule for ${todayName}`}
        >
          <i className="bi bi-calendar-plus" />
        </button>
      )}
    </div>
  );

  return (
    <div className="container-fluid max-width-container px-3 mt-3 animate-slide-up">
      <div className="bg-white rounded-4 shadow-sm border p-3">
        
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-check2-square fs-5 text-success" />
            <h6 className="fw-bold m-0 text-dark">Todo Dashboard</h6>
          </div>
          <button 
            className="btn btn-sm btn-light border rounded-pill shadow-none fw-bold"
            onClick={onOpenTodo}
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

        {/* Section A: Today's Focus */}
        <div className="mb-3">
          <h6 className="small fw-bold text-secondary mb-2 border-bottom pb-1">Today's Focus ({todayName})</h6>
          {loading ? (
            <div className="text-center py-2"><div className="spinner-border spinner-border-sm text-success" /></div>
          ) : todayTodos.length === 0 ? (
            <div className="text-center text-muted py-2 small opacity-75">
              Nothing scheduled for today.
            </div>
          ) : (
            <div className="d-flex flex-column">
              {todayTodos.map(todo => renderTodo(todo, false))}
            </div>
          )}
        </div>

        {/* Section B: Unscheduled */}
        {unscheduledTodos.length > 0 && (
          <div>
            <h6 className="small fw-bold text-secondary mb-2 border-bottom pb-1">Unscheduled Tasks</h6>
            <div className="d-flex flex-column">
              {unscheduledTodos.map(todo => renderTodo(todo, true))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
