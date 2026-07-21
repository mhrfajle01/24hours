import React from 'react';
import { calculateStats, getIntervalTimes, timeToMinutes } from '../utils/helpers';

/**
 * Summary card component displaying daily statistics, productivity metrics, progress bar, 
 * date filter picker, and quick-generator button.
 */
export default function Summary({ 
  reports, 
  selectedDate, 
  onDateChange, 
  onGenerateToday, 
  onOpenPDFSettings,
  dictionaryData = [],
  selectedTag,
  onSelectTag
}) {
  const { completed, pending, missed, totalPlanned, productivity } = calculateStats(reports);

  // Compile tag statistics from active reports
  const tagStats = {};
  let totalCount = 0;

  reports.forEach((r) => {
    // Detect tag (check explicit tag field first, fallback to matching report content)
    let activeTag = r.tag;
    if (!activeTag && r.report) {
      const matched = (dictionaryData || []).find(d => 
        (d.report_bn && d.report_bn === r.report) ||
        (d.plan_bn && d.plan_bn === r.report) ||
        (d.report_en && d.report_en === r.report) ||
        (d.plan_en && d.plan_en === r.report)
      );
      if (matched) activeTag = matched.tag;
    }

    if (!activeTag) return;

    totalCount++;
    if (!tagStats[activeTag]) {
      tagStats[activeTag] = { count: 0, completed: 0, missed: 0, duration: 0 };
    }
    tagStats[activeTag].count++;
    
    // Calculate block duration
    const times = getIntervalTimes(r);
    const startMin = timeToMinutes(times.startTime);
    let endMin = timeToMinutes(times.endTime);
    if (endMin < startMin) endMin += 24 * 60;
    const duration = endMin - startMin;
    tagStats[activeTag].duration += duration;

    if (r.status === 'Completed') {
      tagStats[activeTag].completed++;
    } else if (r.status === 'Missed') {
      tagStats[activeTag].missed++;
    }
  });

  const formatFriendlyDuration = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="container-fluid max-width-container my-3 px-3 animate-fade-in">
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
        {/* Date Filter & Auto Generate / Export Row */}
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
            {reports.length === 0 ? (
              <button
                className="btn text-white fw-bold px-4 py-2 rounded-pill shadow-sm transition-all hover-scale"
                style={{ backgroundColor: '#128C7E' }}
                onClick={onGenerateToday}
              >
                <i className="bi bi-lightning-charge-fill me-2"></i>Generate Today
              </button>
            ) : (
              <button
                className="btn btn-danger text-white fw-bold px-4 py-2 rounded-pill shadow-sm transition-all hover-scale border-0"
                style={{ backgroundColor: '#DC3545' }}
                onClick={onOpenPDFSettings}
                title="Configure and download PDF report"
              >
                <i className="bi bi-file-earmark-pdf-fill me-2"></i>Export PDF (PDF ডাউনলোড)
              </button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="row g-3 text-center mb-3">
          <div className="col-6 col-sm-3">
            <div className="p-2 bg-light rounded-3 border-start border-4 border-success">
              <div className="text-secondary small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Completed</div>
              <div className="fs-4 fw-extrabold text-success">{completed}</div>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="p-2 bg-light rounded-3 border-start border-4 border-warning">
              <div className="text-secondary small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Pending</div>
              <div className="fs-4 fw-extrabold text-warning">{pending}</div>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="p-2 bg-light rounded-3 border-start border-4 border-danger">
              <div className="text-secondary small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Missed</div>
              <div className="fs-4 fw-extrabold text-danger">{missed}</div>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="p-2 bg-light rounded-3 border-start border-4 border-primary">
              <div className="text-secondary small fw-semibold text-uppercase" style={{ fontSize: '0.75rem' }}>Total Planned</div>
              <div className="fs-4 fw-extrabold text-primary">{totalPlanned}</div>
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

        {/* Tag Analysis Section */}
        {totalCount > 0 && (
          <div className="mt-4 pt-3 border-top text-start">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-semibold text-secondary" style={{ fontSize: '0.9rem' }}>
                <i className="bi bi-tags-fill text-primary me-1"></i>Task Category Analysis (ট্যাগ বিশ্লেষণ)
              </span>
              {selectedTag && (
                <button 
                  className="btn btn-xs btn-outline-secondary rounded-pill py-0 px-2 fw-semibold border" 
                  style={{ fontSize: '0.7rem' }}
                  onClick={() => onSelectTag(null)}
                >
                  Clear Filter
                </button>
              )}
            </div>
            <p className="text-muted small mb-3" style={{ fontSize: '0.75rem' }}>
              Click any category below to filter the timeline by that tag / ফিল্টার করতে যেকোনো ট্যাগে ক্লিক করুন।
            </p>
            <div className="row g-2">
              {Object.entries(tagStats).sort((a, b) => b[1].duration - a[1].duration).map(([tagName, stats]) => {
                const percentage = Math.round((stats.count / reports.length) * 100);
                const completionRate = stats.count > 0 ? Math.round((stats.completed / stats.count) * 100) : 0;
                const isSelected = selectedTag === tagName;
                
                // Color mapping
                const TAG_COLORS = [
                  { bg: '#E8F5E9', text: '#2E7D32', bar: '#4CAF50', border: '#A5D6A7' },
                  { bg: '#E3F2FD', text: '#1565C0', bar: '#2196F3', border: '#90CAF9' },
                  { bg: '#FFF8E1', text: '#F57F17', bar: '#FFC107', border: '#FFE082' },
                  { bg: '#FCE4EC', text: '#C2185B', bar: '#E91E63', border: '#F8BBD0' },
                  { bg: '#F3E5F5', text: '#7B1FA2', bar: '#9C27B0', border: '#E1BEE7' },
                  { bg: '#FFEBEE', text: '#C62828', bar: '#F44336', border: '#FFCDD2' },
                  { bg: '#E0F2F1', text: '#00695C', bar: '#009688', border: '#B2DFDB' },
                  { bg: '#E0F7FA', text: '#00838F', bar: '#00BCD4', border: '#B2EBF2' },
                ];
                let hash = 0;
                for (let i = 0; i < tagName.length; i++) hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
                const color = TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];

                return (
                  <div key={tagName} className="col-12 col-sm-6">
                    <div 
                      className={`p-2.5 border rounded-3 bg-white transition-all`}
                      style={{ 
                        cursor: 'pointer',
                        borderColor: isSelected ? color.bar : '#E5E7EB',
                        backgroundColor: isSelected ? color.bg : '#FFFFFF',
                        transform: isSelected ? 'scale(1.01)' : 'none',
                        boxShadow: isSelected ? `0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px ${color.bg}` : '',
                        borderWidth: isSelected ? '2px' : '1px'
                      }}
                      onClick={() => onSelectTag(isSelected ? null : tagName)}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-1.5">
                        <span className="badge rounded-pill fw-bold text-uppercase" style={{ backgroundColor: color.bg, color: color.text, fontSize: '0.65rem', border: `1px solid ${color.border}` }}>
                          #{tagName}
                        </span>
                        <div className="text-secondary fw-semibold" style={{ fontSize: '0.7rem' }}>
                          {formatFriendlyDuration(stats.duration)} ({stats.count} block{stats.count !== 1 ? 's' : ''})
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="progress mb-1.5" style={{ height: '6px', borderRadius: '999px', backgroundColor: '#F3F4F6' }}>
                        <div 
                          className="progress-bar" 
                          role="progressbar" 
                          style={{ width: `${completionRate}%`, backgroundColor: color.bar, borderRadius: '999px' }}
                          aria-valuenow={completionRate} 
                          aria-valuemin="0" 
                          aria-valuemax="100"
                        ></div>
                      </div>

                      <div className="d-flex justify-content-between align-items-center" style={{ fontSize: '0.65rem' }}>
                        <span className="text-muted">
                          Done: <span className="text-success fw-bold">{stats.completed}</span> | Missed: <span className="text-danger fw-bold">{stats.missed}</span>
                        </span>
                        <span className="fw-bold" style={{ color: completionRate > 50 ? '#2E7D32' : '#757575' }}>
                          Success: {completionRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
