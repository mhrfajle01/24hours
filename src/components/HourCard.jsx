import React, { useState, useEffect } from 'react';
import PlanBubble from './PlanBubble';
import ReportBubble from './ReportBubble';
import { formatHourString } from '../utils/helpers';

/**
 * HourCard component represents a single hour's tracking item.
 * Contains both planning (right) and report (left) bubbles, status badges, 
 * current hour indicators, and CRUD control actions.
 */
export default function HourCard({ 
  report, 
  isCurrentHour, 
  onEditPlan, 
  onEditReport, 
  onDelete,
  onInlineUpdatePlan,
  onInlineUpdateReport,
  dictionaryData
}) {
  const { hour, ampm, plan, report: reportText, status, createdAt } = report;

  // Local state for inline editing
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isEditingReport, setIsEditingReport] = useState(false);
  const [tempPlan, setTempPlan] = useState('');
  const [tempReport, setTempReport] = useState('');
  const [tempStatus, setTempStatus] = useState('Pending');

  // Dynamic ticking timer for remaining minutes in active hour slot
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!isCurrentHour) return;

    setCurrentTime(new Date());

    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);

    return () => clearInterval(interval);
  }, [isCurrentHour]);

  const handleUpdatePlanDirect = async (updatedPlanText) => {
    await onInlineUpdatePlan(report, updatedPlanText);
  };

  const handleStartEditPlan = () => {
    setTempPlan(plan || '');
    setIsEditingPlan(true);
    setIsEditingReport(false);
  };

  const handleStartEditReport = () => {
    setTempReport(reportText || '');
    setTempStatus(status || 'Pending');
    setIsEditingReport(true);
    setIsEditingPlan(false);
  };

  const handleSavePlan = async () => {
    await onInlineUpdatePlan(report, tempPlan);
    setIsEditingPlan(false);
  };

  const handleSaveReport = async () => {
    await onInlineUpdateReport(report, tempReport, tempStatus);
    setIsEditingReport(false);
  };

  // Compute status badge classes
  let statusBadgeClass = 'bg-warning text-dark';
  if (status === 'Completed') statusBadgeClass = 'bg-success text-white';
  if (status === 'Missed') statusBadgeClass = 'bg-danger text-white';

  return (
    <div 
      className={`card border-0 mb-4 rounded-4 shadow-sm transition-all position-relative overflow-hidden hour-card-container ${
        isCurrentHour ? 'border-now shadow-md' : ''
      }`}
      style={{
        background: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(8px)',
        borderRadius: '18px',
      }}
    >
      {/* Top progress bar for active hour slot */}
      {isCurrentHour && (
        <div 
          className="position-absolute top-0 start-0 w-100" 
          style={{ height: '4px', backgroundColor: 'rgba(37, 211, 102, 0.1)', zIndex: 10 }}
        >
          <div 
            className="h-100 bg-success" 
            style={{ 
              width: `${(currentTime.getMinutes() / 60) * 100}%`,
              backgroundColor: '#25D366',
              transition: 'width 0.5s ease-out'
            }}
          />
        </div>
      )}
      {/* Top Header info (Hour label and Status) */}
      <div className="card-header bg-transparent border-0 d-flex justify-content-between align-items-center pt-3 px-3 pb-1">
        <div className="d-flex align-items-center gap-2">
          <span className="fs-5 fw-bold text-dark" style={{ letterSpacing: '0.5px' }}>
            {formatHourString(hour, ampm)}
          </span>
          {isCurrentHour && (
            <>
              <span className="badge rounded-pill bg-success text-white px-2 py-1 fs-xs badge-now-pulse animate-pulse">
                <i className="bi bi-clock-fill me-1"></i>NOW
              </span>
              <span className="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2 py-1 fs-xs d-flex align-items-center gap-1">
                <i className="bi bi-hourglass-split animate-spin-slow"></i>
                {60 - currentTime.getMinutes()}m left
              </span>
            </>
          )}
        </div>
        <div>
          <span className={`badge rounded-pill px-3 py-1.5 fw-bold text-uppercase fs-xs ${statusBadgeClass}`}>
            {status}
          </span>
        </div>
      </div>

      {/* Bubbles Area */}
      <div className="card-body px-3 py-2">
        {/* Right side: Planning */}
        <PlanBubble 
          content={plan} 
          createdAt={createdAt} 
          isEditing={isEditingPlan}
          tempValue={tempPlan}
          onChange={setTempPlan}
          onSave={handleSavePlan}
          onCancel={() => setIsEditingPlan(false)}
          onStartEdit={handleStartEditPlan}
          dictionaryData={dictionaryData}
          onUpdatePlanText={handleUpdatePlanDirect}
        />

        {/* Left side: Report */}
        <ReportBubble 
          content={reportText} 
          createdAt={createdAt} 
          isEditing={isEditingReport}
          tempValue={tempReport}
          tempStatus={tempStatus}
          onChange={setTempReport}
          onStatusChange={setTempStatus}
          onSave={handleSaveReport}
          onCancel={() => setIsEditingReport(false)}
          onStartEdit={handleStartEditReport}
          dictionaryData={dictionaryData}
        />
      </div>

      {/* Actions footer */}
      <div className="card-footer bg-transparent border-0 d-flex justify-content-between align-items-center px-3 pb-3 pt-1">
        <button 
          className="btn btn-sm btn-link text-danger text-decoration-none p-1 border-0 shadow-none hover-scale btn-delete-slot"
          onClick={() => onDelete(report)}
          title="Delete this hour log"
        >
          <i className="bi bi-trash3-fill me-1"></i>Delete
        </button>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-sm rounded-pill px-3 fw-bold shadow-sm transition-all btn-edit-plan hover-scale"
            style={{ 
              backgroundColor: '#DCF8C6', 
              color: '#075E54', 
              border: '1px solid #C4E9A7' 
            }}
            onClick={handleStartEditPlan}
          >
            <i className="bi bi-compass-fill me-1"></i>Edit Plan
          </button>
          <button 
            className="btn btn-sm text-white rounded-pill px-3 fw-bold shadow-sm transition-all btn-edit-report hover-scale"
            style={{ backgroundColor: '#075E54' }}
            onClick={handleStartEditReport}
          >
            <i className="bi bi-check2-circle me-1"></i>Edit Report
          </button>
        </div>
      </div>
    </div>
  );
}
