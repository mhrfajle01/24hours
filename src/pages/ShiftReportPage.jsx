import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase/firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';

// Helper for pure SVG Bar Chart
const BarChart = ({ data }) => {
  const chartData = [...data].reverse();
  const maxProd = Math.max(...chartData.map(d => Math.max(d.actual || 0, d.target || 0)), 1);
  
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 220, gap: 12, paddingTop: 30, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
      {chartData.map((day, i) => {
        const heightPct = Math.min(((day.actual || 0) / maxProd) * 100, 100);
        const targetPct = Math.min(((day.target || 0) / maxProd) * 100, 100);
        const isSuccess = (day.actual || 0) >= (day.target || 0);
        
        return (
          <div key={i} style={{ flex: '1 0 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%' }}>
            
            {/* Tooltip-like label above the bar */}
            <div style={{ fontSize: 10, fontWeight: 700, color: isSuccess ? '#10B981' : '#0EA5E9', opacity: 0.8 }}>
               {day.actual}
            </div>

            <div style={{ position: 'relative', width: 28, flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 14, overflow: 'hidden' }}>
               {/* Target Indicator Line */}
               {day.target > 0 && (
                 <div style={{ position: 'absolute', bottom: `${targetPct}%`, left: 0, width: '100%', height: 2, background: 'rgba(255,255,255,0.6)', zIndex: 10, boxShadow: '0 0 4px rgba(255,255,255,0.4)' }} />
               )}
               {/* Actual Bar */}
               <motion.div 
                 initial={{ height: 0 }} 
                 animate={{ height: `${heightPct}%` }} 
                 transition={{ delay: i * 0.03, type: 'spring', damping: 20 }}
                 style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', background: isSuccess ? 'linear-gradient(180deg, #10B981, #059669)' : 'linear-gradient(180deg, #0EA5E9, #2563EB)', borderRadius: 14 }} 
               />
            </div>
            
            {/* Date Label */}
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>{day.date.split('-')[2]}</div>
          </div>
        );
      })}
    </div>
  );
};

export default function ShiftReportPage({ currentUser, onBack }) {
  const [filter, setFilter] = useState('7days'); // 'today', '7days', '30days', 'all', 'custom'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState(null);
  
  // Custom Alert State
  const [customAlert, setCustomAlert] = useState({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    if (!currentUser?.uid) return;
    const fetchHistory = async () => {
      try {
        const q = query(collection(db, 'shiftTracker', currentUser.uid, 'history'), orderBy('date', 'desc'));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => doc.data());
        
        if (data.length > 0) {
          setHistory(data);
        }
      } catch (err) {
        console.error("Failed to load shift history:", err);
      }
      setLoading(false);
    };
    fetchHistory();
  }, [currentUser?.uid]);

  const getFilteredData = () => {
    let sorted = history.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const today = new Date().toISOString().split('T')[0];
    
    if (filter === 'today') return sorted.filter(d => d.date === today);
    if (filter === '7days') return sorted.slice(0, 7);
    if (filter === '30days') return sorted.slice(0, 30);
    if (filter === 'custom' && customStart && customEnd) {
      return sorted.filter(d => d.date >= customStart && d.date <= customEnd);
    }
    return sorted;
  };

  const filteredData = getFilteredData();
  const totalProduced = filteredData.reduce((s, d) => s + (d.actual || 0), 0);
  const totalTarget = filteredData.reduce((s, d) => s + (d.target || 0), 0);
  const completionPct = totalTarget > 0 ? Math.round((totalProduced / totalTarget) * 100) : 0;
  
  const formatHrs = (sec) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const totalShiftTime = filteredData.reduce((s, d) => s + (d.totalShiftSec || 0), 0);
  const totalBreakTime = filteredData.reduce((s, d) => s + (d.totalBreakSec || 0), 0);

  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      setCustomAlert({ isOpen: true, title: 'No Data', message: 'There is no data available to export for this time range.' });
      return;
    }
    
    const escCSV = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    
    const div = '========================================';
    
    // Summary rows
    const rows = [
      [div],
      ['🚀 SHIFT TRACKER REPORT', `PERIOD: ${filter.toUpperCase()}`],
      [div],
      [''],
      ['--- SUMMARY METRICS ---'],
      ['Total Produced:', totalProduced],
      ['Overall Goal Completion:', `${completionPct}%`],
      ['Total Work Time:', formatHrs(totalShiftTime)],
      ['Total Break Time:', formatHrs(totalBreakTime)],
      ['Days Tracked:', filteredData.length],
      [''],
      [div],
      ['--- DAILY BREAKDOWN ---'],
      ['Date', 'Target', 'Actual', 'Completion %', 'Work Time', 'Break Time', 'Efficiency', 'Blocks Detail']
    ];
    
    filteredData.forEach(day => {
      const blocksText = (day.blocks || []).map(b => `${b.start}-${b.end}: ${b.actual}/${Math.round(b.target)}`).join(' | ');
      const pct = day.target > 0 ? Math.round((day.actual / day.target) * 100) : 0;
      const efficiency = day.totalShiftSec > 0 ? ((day.actual / (day.totalShiftSec / 3600)).toFixed(1) + ' / hr') : 'N/A';
      
      rows.push([
        day.date,
        day.target,
        day.actual,
        `${pct}%`,
        formatHrs(day.totalShiftSec || 0),
        formatHrs(day.totalBreakSec || 0),
        efficiency,
        blocksText
      ]);
    });
    
    const csv = rows.map(r => r.map(escCSV).join(',')).join('\n');
    const BOM = '\uFEFF'; 
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Shift_Report_${filter}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportXLSX = async () => {
    if (filteredData.length === 0) {
      setCustomAlert({ isOpen: true, title: 'No Data', message: 'There is no data available to export for this time range.' });
      return;
    }
    
    try {
      // Dynamically load SheetJS with styling support from CDN
      if (!window.XLSX || !window.XLSX.utils.book_new) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load XLSX library'));
          document.head.appendChild(script);
        });
      }
      
      const XLSX = window.XLSX;
      const wb = XLSX.utils.book_new();
      
      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
        fill: { fgColor: { rgb: "0EA5E9" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: { top: { style: "thin", color: { rgb: "CCCCCC" } }, bottom: { style: "thin", color: { rgb: "CCCCCC" } }, left: { style: "thin", color: { rgb: "CCCCCC" } }, right: { style: "thin", color: { rgb: "CCCCCC" } } }
      };
      
      const titleStyle = {
        font: { bold: true, color: { rgb: "10B981" }, sz: 16 },
        alignment: { horizontal: "left", vertical: "center" }
      };

      const dataStyle = {
        alignment: { horizontal: "center", vertical: "center" },
        border: { top: { style: "thin", color: { rgb: "EEEEEE" } }, bottom: { style: "thin", color: { rgb: "EEEEEE" } }, left: { style: "thin", color: { rgb: "EEEEEE" } }, right: { style: "thin", color: { rgb: "EEEEEE" } } }
      };
      
      // -- SUMMARY SHEET --
      const summaryData = [
        [{ v: '🚀 SHIFT TRACKER SUMMARY', s: titleStyle }, { v: '', s: titleStyle }],
        [{ v: `Period: ${filter.toUpperCase()}`, s: { font: { italic: true, sz: 12 } } }, ''],
        ['', ''],
        [{ v: 'Metric', s: headerStyle }, { v: 'Value', s: headerStyle }],
        [{ v: 'Total Produced', s: dataStyle }, { v: totalProduced, s: dataStyle }],
        [{ v: 'Goal Completion', s: dataStyle }, { v: `${completionPct}%`, s: dataStyle }],
        [{ v: 'Total Work Time', s: dataStyle }, { v: formatHrs(totalShiftTime), s: dataStyle }],
        [{ v: 'Total Break Time', s: dataStyle }, { v: formatHrs(totalBreakTime), s: dataStyle }],
        [{ v: 'Days Tracked', s: dataStyle }, { v: filteredData.length, s: dataStyle }]
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [{ wch: 25 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
      
      // -- DAILY SHEET --
      const dailyHeaders = ['Date', 'Target', 'Actual', 'Completion %', 'Efficiency', 'Work Time', 'Break Time'].map(h => ({ v: h, s: headerStyle }));
      const dailyRows = filteredData.map(day => {
        const pct = day.target > 0 ? Math.round((day.actual / day.target) * 100) : 0;
        const efficiency = day.totalShiftSec > 0 ? ((day.actual / (day.totalShiftSec / 3600)).toFixed(1) + '/hr') : 'N/A';
        return [
          { v: day.date, s: dataStyle },
          { v: day.target, s: dataStyle },
          { v: day.actual, s: dataStyle },
          { v: `${pct}%`, s: dataStyle },
          { v: efficiency, s: dataStyle },
          { v: formatHrs(day.totalShiftSec || 0), s: dataStyle },
          { v: formatHrs(day.totalBreakSec || 0), s: dataStyle }
        ];
      });
      const dailySheet = XLSX.utils.aoa_to_sheet([
        [{ v: 'DAILY PRODUCTION REPORT', s: titleStyle }, '', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
        dailyHeaders, 
        ...dailyRows
      ]);
      dailySheet['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, dailySheet, 'Daily Report');
      
      // -- INDIVIDUAL DAILY SHEETS --
      const blockHeaders = ['Block', 'Time Range', 'Target', 'Actual', 'Cumulative', 'Status'].map(h => ({ v: h, s: headerStyle }));
      
      filteredData.forEach((day, index) => {
        const blockRows = [];
        (day.blocks || []).forEach((b, i) => {
          const status = b.logged ? (b.actual >= b.target ? 'On Target' : 'Behind') : 'Not Logged';
          const statusColor = status === 'On Target' ? "10B981" : status === 'Behind' ? "EF4444" : "94A3B8";
          
          blockRows.push([
            { v: `Block ${i + 1}`, s: dataStyle },
            { v: `${b.start} - ${b.end}`, s: dataStyle },
            { v: Math.round(b.target), s: dataStyle },
            { v: b.actual || 0, s: dataStyle },
            { v: b.cumulative || 0, s: dataStyle },
            { v: status, s: { ...dataStyle, font: { bold: true, color: { rgb: statusColor } } } }
          ]);
        });
        
        const pct = day.target > 0 ? Math.round((day.actual / day.target) * 100) : 0;
        const daySheet = XLSX.utils.aoa_to_sheet([
          [{ v: `REPORT FOR: ${day.date}`, s: titleStyle }, '', '', '', '', ''],
          [{ v: `Production: ${day.actual} / ${day.target} (${pct}%)`, s: { font: { italic: true, sz: 12 } } }, '', '', '', '', ''],
          ['', '', '', '', '', ''],
          blockHeaders, 
          ...blockRows
        ]);
        daySheet['!cols'] = [{ wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 15 }];
        
        // Ensure sheet names are unique and valid (max 31 chars, no special chars)
        let sheetName = day.date.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 31);
        if (wb.SheetNames.includes(sheetName)) sheetName = `${sheetName} (${index})`;
        
        XLSX.utils.book_append_sheet(wb, daySheet, sheetName);
      });
      
      XLSX.writeFile(wb, `Shift_Report_${filter}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('XLSX export failed:', err);
      setCustomAlert({
        isOpen: true,
        title: 'Export Failed',
        message: 'XLSX export failed. Falling back to CSV format...'
      });
      // Fallback to CSV
      setTimeout(() => handleExportCSV(), 500);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100dvh', background: '#0F172A', color: '#F8FAFC', fontFamily: "'Outfit', sans-serif" }}>
      
      {/* Header */}
      <motion.div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(12px)', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.5px' }}>Shift Reports</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={handleExportCSV} style={{ background: '#0EA5E9', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(14,165,233,0.3)' }}>
            CSV
          </button>
          <button onClick={handleExportXLSX} style={{ background: '#10B981', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            XLSX
          </button>
        </div>
      </motion.div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Mobile-Friendly Pills */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
          {['today', '7days', '30days', 'custom', 'all'].map(f => {
            const labels = { today: 'Today', '7days': '7 Days', '30days': '30 Days', custom: 'Custom Date', all: 'All Time' };
            return (
              <button key={f} onClick={() => setFilter(f)} style={{ flexShrink: 0, padding: '10px 20px', background: filter === f ? '#0EA5E9' : 'rgba(255,255,255,0.05)', color: filter === f ? '#fff' : '#94A3B8', border: '1px solid', borderColor: filter === f ? '#0EA5E9' : 'rgba(255,255,255,0.1)', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {labels[f]}
              </button>
            )
          })}
        </div>

        <AnimatePresence>
          {filter === 'custom' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 16, borderRadius: 16 }}>
                 <div style={{ flex: 1 }}>
                   <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>From</div>
                   <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: 8, outline: 'none' }} />
                 </div>
                 <div style={{ flex: 1 }}>
                   <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>To</div>
                   <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px', borderRadius: 8, outline: 'none' }} />
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Area */}
        {filteredData.length === 0 && !loading ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 60, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, background: 'rgba(14,165,233,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <h3 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 10px 0' }}>No Shifts Recorded</h3>
            <p style={{ color: '#94A3B8', fontSize: 16, maxWidth: 280, margin: 0, lineHeight: '1.5' }}>Complete your first shift using the Shift Tracker to see your performance metrics here.</p>
            <button onClick={onBack} style={{ marginTop: 30, background: 'linear-gradient(135deg, #0EA5E9, #2563EB)', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: 20, fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 25px rgba(14,165,233,0.3)' }}>Go to Shift Tracker</button>
          </motion.div>
        ) : (
          <>
            {/* AI Insight */}
            <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.1))', border: '1px solid rgba(16,185,129,0.2)', padding: 16, borderRadius: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 24 }}>🔥</div>
              <div>
                <div style={{ fontSize: 12, color: '#34D399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Smart Insight</div>
                <div style={{ fontSize: 14, color: '#E2E8F0', marginTop: 2 }}>You completed {completionPct}% of your target over this period! Keep up the momentum.</div>
              </div>
            </div>

            {/* Glanceable Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 16, borderRadius: 20 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Total Produced</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#0EA5E9', marginTop: 4 }}>{totalProduced.toLocaleString()}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 16, borderRadius: 20 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Completion</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: completionPct >= 100 ? '#10B981' : '#F59E0B', marginTop: 4 }}>{completionPct}%</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 16, borderRadius: 20 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Total Work Time</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>{formatHrs(totalShiftTime)}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 16, borderRadius: 20 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Total Break Time</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>{formatHrs(totalBreakTime)}</div>
              </div>
            </div>

            {/* Data Visualization */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 20, borderRadius: 20 }}>
               <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Production Trend</div>
               <div style={{ fontSize: 12, color: '#94A3B8', display: 'flex', gap: 12 }}>
                 <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, background: '#0EA5E9', borderRadius: '50%' }}/> Actual</span>
                 <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 12, height: 2, background: 'rgba(255,255,255,0.3)' }}/> Target</span>
               </div>
               {loading ? <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div> : <BarChart data={filteredData} />}
            </div>

        {/* Expandable History Log */}
        <div>
           <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Shift History</div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
             {history.slice(0, filter === '7days' ? 7 : filter === '30days' ? 30 : history.length).map((day, idx) => {
               const isExpanded = expandedDate === day.date;
               const isSuccess = day.actual >= day.target;
               return (
                 <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, overflow: 'hidden' }}>
                   
                   <div onClick={() => setExpandedDate(isExpanded ? null : day.date)} style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                     <div>
                       <div style={{ fontSize: 16, fontWeight: 600 }}>{new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                       <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Prod: {day.actual} / {day.target}</div>
                     </div>
                     <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                       <div style={{ background: isSuccess ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: isSuccess ? '#34D399' : '#FBBF24', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                         {Math.round((day.actual / day.target) * 100)}%
                       </div>
                       <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.3s' }}><path d="M6 9l6 6 6-6"/></svg>
                     </div>
                   </div>

                   <AnimatePresence>
                     {isExpanded && (
                       <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', background: 'rgba(0,0,0,0.2)' }}>
                         <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>
                              <div>Work: {formatHrs(day.totalShiftSec)}</div>
                              <div>Break: {formatHrs(day.totalBreakSec)}</div>
                            </div>
                            
                            {day.blocks && day.blocks.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {day.blocks.map((b, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 8, fontSize: 14 }}>
                                    <div><span style={{ color: '#94A3B8' }}>{b.start} - {b.end}</span></div>
                                    <div style={{ fontWeight: 600, color: b.actual >= b.target ? '#34D399' : '#F8FAFC' }}>{b.actual} / {b.target.toFixed(0)}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>No detailed blocks recorded for this shift.</div>
                            )}
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>
                 </div>
               )
             })}
           </div>
        </div>
          </>
        )}

      </div>

      {/* CUSTOM ALERT MODAL */}
      <AnimatePresence>
        {customAlert.isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} style={{ background: '#1E293B', padding: 24, borderRadius: 24, width: '100%', maxWidth: 360, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
               <h3 style={{ margin: '0 0 10px 0', fontSize: 20, color: '#F8FAFC' }}>{customAlert.title}</h3>
               <p style={{ margin: '0 0 24px 0', color: '#94A3B8', fontSize: 16, lineHeight: '1.5' }}>{customAlert.message}</p>
               <button onClick={() => setCustomAlert({ isOpen: false })} style={{ width: '100%', padding: 14, background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>Okay</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
