import React from 'react';

export default function IslamicReportCharts({
  filteredDates,
  salatHistory,
  filterJamat,
  filterAlone,
  filterMissed = 0,
  filterTotalSalat,
  missedLog = []
}) {
  const totalTracked = filterJamat + filterAlone + filterMissed;
  const jamatPct = totalTracked > 0 ? (filterJamat / totalTracked) * 100 : 0;
  const alonePct = totalTracked > 0 ? (filterAlone / totalTracked) * 100 : 0;
  const missedPct = totalTracked > 0 ? (filterMissed / totalTracked) * 100 : 0;

  // Donut SVG Parameters
  const radius = 62;
  const circumference = 2 * Math.PI * radius; // ~389.5
  const jamatDash = (jamatPct / 100) * circumference;
  const aloneDash = (alonePct / 100) * circumference;
  const missedDash = (missedPct / 100) * circumference;

  const aloneOffset = -jamatDash;
  const missedOffset = -(jamatDash + aloneDash);

  // Line Chart Parameters (Daily Trend)
  const chartWidth = 320;
  const chartHeight = 120;
  const padX = 24;
  const padY = 16;
  const innerW = chartWidth - padX * 2;
  const innerH = chartHeight - padY * 2;

  const datesToDraw = filteredDates.slice(-14); // up to 14 days for clarity
  const points = datesToDraw.map((dKey, idx) => {
    const s = salatHistory[dKey] || {};
    let jCount = 0;
    let totalDone = 0;
    Object.values(s).forEach(entry => {
      const st = entry && typeof entry === 'object' ? entry.status : entry;
      if (st === 'jamat') { jCount++; totalDone++; }
      else if (st === 'alone') { totalDone++; }
    });
    const x = datesToDraw.length > 1 ? padX + (idx / (datesToDraw.length - 1)) * innerW : chartWidth / 2;
    const yTotal = padY + innerH - (totalDone / 5) * innerH;
    const yJamat = padY + innerH - (jCount / 5) * innerH;
    return { dKey, jCount, totalDone, x, yTotal, yJamat };
  });

  const totalPolyline = points.map(p => `${p.x},${p.yTotal}`).join(' ');
  const jamatPolyline = points.map(p => `${p.x},${p.yJamat}`).join(' ');

  // Missed reason breakdown
  const reasonMap = {};
  missedLog.forEach(m => {
    if (m.reason) {
      reasonMap[m.reason] = (reasonMap[m.reason] || 0) + 1;
    }
  });
  const sortedReasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="d-flex flex-column gap-3 mb-3">
      {/* 1. Donut Chart (Salat Ratio) & Waqt Breakdown */}
      <div className="p-3 bg-white rounded-3 border" style={{ borderColor: '#E2E8F0' }}>
        <div className="fw-bold mb-3 d-flex align-items-center gap-2 text-dark" style={{ fontSize: 13.5 }}>
          <i className="bi bi-pie-chart-fill text-success" />
          <span>সালাত কোয়ালিটি ও বন্টন (Donut Ratio)</span>
        </div>

        <div className="d-flex align-items-center justify-content-around flex-wrap gap-3">
          {/* SVG Donut */}
          <div className="position-relative d-flex align-items-center justify-content-center" style={{ width: 150, height: 150 }}>
            <svg width="150" height="150" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
              {/* Background ring */}
              <circle cx="80" cy="80" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="18" />
              {/* Jamat Arc */}
              {jamatDash > 0 && (
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="18"
                  strokeDasharray={`${jamatDash} ${circumference}`}
                  strokeDashoffset="0"
                />
              )}
              {/* Alone Arc */}
              {aloneDash > 0 && (
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="18"
                  strokeDasharray={`${aloneDash} ${circumference}`}
                  strokeDashoffset={aloneOffset}
                />
              )}
              {/* Missed Arc */}
              {missedDash > 0 && (
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="18"
                  strokeDasharray={`${missedDash} ${circumference}`}
                  strokeDashoffset={missedOffset}
                />
              )}
            </svg>
            <div className="position-absolute text-center">
              <div style={{ fontSize: 18, fontWeight: 800, color: '#065F46' }}>
                {totalTracked > 0 ? Math.round(((filterJamat + filterAlone) / filterTotalSalat) * 100) : 0}%
              </div>
              <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>সালাত সম্পন্ন</div>
            </div>
          </div>

          {/* Legends */}
          <div className="d-flex flex-column gap-2" style={{ minWidth: 140 }}>
            <div className="d-flex align-items-center justify-content-between gap-3 text-dark" style={{ fontSize: 12 }}>
              <div className="d-flex align-items-center gap-2">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }} />
                <span>🕌 জামাতে</span>
              </div>
              <b>{filterJamat} ({Math.round(jamatPct)}%)</b>
            </div>

            <div className="d-flex align-items-center justify-content-between gap-3 text-dark" style={{ fontSize: 12 }}>
              <div className="d-flex align-items-center gap-2">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3B82F6' }} />
                <span>🧍 একাকী</span>
              </div>
              <b>{filterAlone} ({Math.round(alonePct)}%)</b>
            </div>

            <div className="d-flex align-items-center justify-content-between gap-3 text-dark" style={{ fontSize: 12 }}>
              <div className="d-flex align-items-center gap-2">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
                <span>❌ মিস / কাযা</span>
              </div>
              <b>{filterMissed} ({Math.round(missedPct)}%)</b>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Multi-Line Chart (Daily Trend) */}
      <div className="p-3 bg-white rounded-3 border" style={{ borderColor: '#E2E8F0' }}>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="fw-bold d-flex align-items-center gap-2 text-dark" style={{ fontSize: 13.5 }}>
            <i className="bi bi-graph-up text-primary" />
            <span>দৈনিক সালাত ও জামাত ট্রেন্ড (Trend Curve)</span>
          </div>
          <div className="d-flex gap-2" style={{ fontSize: 10.5, fontWeight: 700 }}>
            <span style={{ color: '#10B981' }}>● জামাত</span>
            <span style={{ color: '#3B82F6' }}>● মোট সালাত</span>
          </div>
        </div>

        {points.length === 0 ? (
          <div className="text-center py-4 text-muted small">রেকর্ড নেই</div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', minWidth: 280, height: 'auto', display: 'block' }}>
              {/* Grid Lines */}
              {[0, 1, 2, 3, 4, 5].map(v => {
                const y = padY + innerH - (v / 5) * innerH;
                return (
                  <g key={v}>
                    <line x1={padX} y1={y} x2={chartWidth - padX} y2={y} stroke="#F1F5F9" strokeWidth="1" />
                    <text x={padX - 8} y={y + 3} fontSize="8" fill="#94A3B8" textAnchor="end">{v}</text>
                  </g>
                );
              })}

              {/* Polylines */}
              {points.length > 1 && (
                <>
                  <polyline fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={totalPolyline} />
                  <polyline fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={jamatPolyline} />
                </>
              )}

              {/* Data Dots */}
              {points.map((p, idx) => (
                <g key={idx}>
                  <circle cx={p.x} cy={p.yTotal} r="3.5" fill="#3B82F6" stroke="#fff" strokeWidth="1.5" />
                  <circle cx={p.x} cy={p.yJamat} r="3.5" fill="#10B981" stroke="#fff" strokeWidth="1.5" />
                  <text x={p.x} y={chartHeight - 3} fontSize="8" fill="#64748B" textAnchor="middle">
                    {p.dKey.slice(5)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}
      </div>

      {/* 3. Missed Reason Pie/Donut Chart & Muhasaba Breakdown */}
      {(() => {
        const totalMissedCount = sortedReasons.reduce((acc, curr) => acc + curr[1], 0);
        if (totalMissedCount === 0) {
          return (
            <div className="p-3 rounded-3 border text-center" style={{ background: '#ECFDF5', borderColor: '#A7F3D0' }}>
              <i className="bi bi-check-circle-fill text-success fs-5 d-block mb-1" />
              <span className="fw-bold text-success" style={{ fontSize: 13 }}>আলহামদুলিল্লাহ! কোনো সালাত মিস হওয়ার রেকর্ড নেই।</span>
            </div>
          );
        }

        const colors = ['#EF4444', '#F59E0B', '#6366F1', '#8B5CF6', '#06B6D4', '#64748B'];
        const rRadius = 55;
        const rCircumference = 2 * Math.PI * rRadius; // ~345.57
        let accumulatedPercent = 0;

        return (
          <div className="p-3 bg-white rounded-3 border" style={{ borderColor: '#FECACA' }}>
            <div className="fw-bold mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2 text-danger" style={{ fontSize: 13.5 }}>
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-pie-chart-fill" />
                <span>ওয়াক্ত মিস হওয়ার কারণ বিশ্লেষণ</span>
              </div>
              <span className="badge bg-danger-subtle text-danger" style={{ fontSize: 11 }}>
                মোট মিস: {totalMissedCount} ওয়াক্ত
              </span>
            </div>

            <div className="d-flex align-items-center justify-content-around flex-wrap gap-3">
              {/* SVG Donut / Pie */}
              <div className="position-relative d-flex align-items-center justify-content-center" style={{ width: 140, height: 140 }}>
                <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="70" cy="70" r={rRadius} fill="none" stroke="#F8FAFC" strokeWidth="16" />
                  {sortedReasons.map(([reason, count], idx) => {
                    const pct = (count / totalMissedCount) * 100;
                    const strokeDash = (pct / 100) * rCircumference;
                    const strokeOffset = -(accumulatedPercent / 100) * rCircumference;
                    accumulatedPercent += pct;
                    return (
                      <circle
                        key={reason}
                        cx="70"
                        cy="70"
                        r={rRadius}
                        fill="none"
                        stroke={colors[idx % colors.length]}
                        strokeWidth="16"
                        strokeDasharray={`${strokeDash} ${rCircumference}`}
                        strokeDashoffset={strokeOffset}
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
                      />
                    );
                  })}
                </svg>
                <div className="position-absolute text-center" style={{ pointerEvents: 'none' }}>
                  <div className="fw-bold text-danger" style={{ fontSize: 17, lineHeight: 1.1 }}>{totalMissedCount}</div>
                  <div style={{ fontSize: 9.5, color: '#64748B', fontWeight: 700 }}>মিসড ওয়াক্ত</div>
                </div>
              </div>

              {/* Reason Legend with Bar */}
              <div className="d-flex flex-column gap-2 flex-grow-1" style={{ minWidth: 200, maxWidth: 320 }}>
                {sortedReasons.map(([reason, count], idx) => {
                  const pct = Math.round((count / totalMissedCount) * 100);
                  const color = colors[idx % colors.length];
                  return (
                    <div key={reason} className="p-2 rounded-2" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div className="d-flex justify-content-between align-items-center mb-1" style={{ fontSize: 11.5 }}>
                        <span className="fw-bold text-dark d-flex align-items-center gap-1.5 text-truncate" style={{ maxWidth: 170 }} title={reason}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {reason}
                        </span>
                        <span className="fw-bold" style={{ color }}>{count} বার ({pct}%)</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 4, background: '#E2E8F0', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, background: color, height: '100%', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
