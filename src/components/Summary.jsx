import React from 'react';
import { calculateStats } from '../utils/helpers';

/**
 * Summary card component displaying daily statistics, productivity metrics, progress bar, 
 * date filter picker, and quick-generator button.
 */
export default function Summary({ reports, selectedDate, onDateChange, onGenerateToday }) {
  const { completed, pending, missed, totalPlanned, productivity } = calculateStats(reports);

  return (
    <div className="container-fluid max-width-container my-3 px-3 animate-fade-in">
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
        {/* Date Filter & Auto Generate Row */}
        <div className="row g-2 align-items-center mb-3">
          <div className="col-12 col-md-6">
            <label className="form-label text-secondary small fw-bold mb-1" htmlFor="dateFilter">
              Select Planning Date
            </label>
            <div className="input-group">
              <span className="input-group-text bg-light border-end-0 rounded-start-pill text-secondary">
                <i className="bi bi-calendar3"></i>
              </span>
              <input
                id="dateFilter"
                type="date"
                className="form-control bg-light border-start-0 rounded-end-pill py-2 shadow-none"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
              />
            </div>
          </div>
          <div className="col-12 col-md-6 text-md-end mt-2 mt-md-4">
            {reports.length === 0 && (
              <button
                className="btn text-white fw-bold px-4 py-2 rounded-pill shadow-sm transition-all hover-scale"
                style={{ backgroundColor: '#128C7E' }}
                onClick={onGenerateToday}
              >
                <i className="bi bi-lightning-charge-fill me-2"></i>Generate Today
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="row g-3 text-center mb-3">
          <div className="col-6 col-sm-3">
            <div className="p-2 bg-light rounded-3 border-start border-4 border-success">
              <div className="text-secondary small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Completed</div>
              <div className="fs-4 fw-extrabold text-success">{completed}h</div>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="p-2 bg-light rounded-3 border-start border-4 border-warning">
              <div className="text-secondary small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Pending</div>
              <div className="fs-4 fw-extrabold text-warning">{pending}h</div>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="p-2 bg-light rounded-3 border-start border-4 border-danger">
              <div className="text-secondary small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Missed</div>
              <div className="fs-4 fw-extrabold text-danger">{missed}h</div>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="p-2 bg-light rounded-3 border-start border-4 border-primary">
              <div className="text-secondary small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Total Hours</div>
              <div className="fs-4 fw-extrabold text-primary">{totalPlanned}h</div>
            </div>
          </div>
        </div>

        {/* Productivity Section */}
        <div className="p-3 rounded-3" style={{ backgroundColor: '#F8F9FA' }}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="fw-semibold text-secondary" style={{ fontSize: '0.9rem' }}>
              <i className="bi bi-speedometer2 text-success me-1"></i>Productivity Index
            </span>
            <span className="fw-bold text-dark fs-5">{productivity}%</span>
          </div>
          <div className="progress rounded-pill" style={{ height: '10px', backgroundColor: '#e9ecef' }}>
            <div
              className="progress-bar rounded-pill transition-width"
              role="progressbar"
              style={{
                width: `${productivity}%`,
                backgroundColor: '#25D366',
              }}
              aria-valuenow={productivity}
              aria-valuemin="0"
              aria-valuemax="100"
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
