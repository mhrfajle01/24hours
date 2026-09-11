import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatTime12h, getIntervalTimes } from '../utils/helpers';
import { useCustomFeatures } from '../hooks/useCustomFeatures';

const QUICK_LINKS = [
  { id: 'feature-hub', title: 'Productivity Hub', subtitle: 'All features in one place – journal, streaks, rewards and more', icon: 'bi-grid-1x2-fill', type: 'feature-hub' },
  { id: 'journal', title: 'Journal', subtitle: 'Reflections, moods, prompts and history', icon: 'bi-journal-text', type: 'journal' },
  { id: 'streaks', title: 'Streaks', subtitle: 'Daily check-in and milestones', icon: 'bi-fire', type: 'streaks' },
  { id: 'rewards', title: 'Rewards Store', subtitle: 'Perks, unlocks and points history', icon: 'bi-gift', type: 'rewards' },
  { id: 'insights', title: 'Insights', subtitle: 'Consistency, heatmap and productivity trends', icon: 'bi-bar-chart-line-fill', type: 'insights' },
  { id: 'messages', title: 'Message Center', subtitle: 'Notices, alerts and admin messages', icon: 'bi-chat-dots', type: 'messages' },
  { id: 'security-scan', title: 'Security Scan', subtitle: 'Scan hourly blocks or habit streaks', icon: 'bi-shield-check', type: 'security-scan' },
  { id: 'pending-review', title: 'Review Pending Blocks', subtitle: 'Resolve unfinished timing blocks', icon: 'bi-clock-history', type: 'pending-review' },
  { id: 'pomodoro', title: 'Pomodoro Timer', subtitle: 'Focus timer for an hourly block', icon: 'bi-stopwatch', type: 'pomodoro' },
  { id: 'prayer', title: 'Prayer Checklist', subtitle: 'Islamic theme prayer tracking', icon: 'bi-moon-stars', type: 'islamic' },
  { id: 'profile', title: 'My Profile', subtitle: 'View and edit your profile details', icon: 'bi-person-circle', type: 'profile' },
  { id: 'trash', title: 'Trash', subtitle: 'View and restore deleted blocks', icon: 'bi-trash3', type: 'trash' },
  { id: 'about-admins', title: 'About Admins', subtitle: 'See admin profiles and team info', icon: 'bi-people', type: 'about-admins' },
  { id: 'settings', title: 'Settings', subtitle: 'All app preferences and controls', icon: 'bi-gear', type: 'settings' },
  { id: 'settings-tools', title: 'Tools Settings', subtitle: 'Security scan, PDF export and dictionary tools', icon: 'bi-tools', type: 'settings-tools' },
  { id: 'settings-sounds', title: 'Sound Settings', subtitle: 'Customize success, points, missed and timer sounds', icon: 'bi-volume-up', type: 'settings-sounds' },
  { id: 'settings-notifications', title: 'Notification Settings', subtitle: 'In-app alerts, reminders and popup notifications', icon: 'bi-bell', type: 'settings-notifications' },
  { id: 'settings-goals', title: 'Goals Settings', subtitle: 'Daily goals and consistency insights', icon: 'bi-bullseye', type: 'settings-goals' },
  { id: 'settings-data', title: 'Data Settings', subtitle: 'Import, export and browser data management', icon: 'bi-database', type: 'settings-data' },
  { id: 'habit-scanner', title: 'Habit Streak Scanner', subtitle: 'Review forgotten habit days and record what happened', icon: 'bi-shield-exclamation', type: 'security-scan' },
  { id: 'daily-checkin', title: 'Daily Check-in', subtitle: 'Record today\u2019s streak check-in', icon: 'bi-calendar-check', type: 'streaks' },
  { id: 'automatic-scan', title: 'Automatic Streak Scan', subtitle: 'Automatically review habits when opening Streaks', icon: 'bi-arrow-repeat', type: 'settings-tools' },
  { id: 'pdf-export', title: 'PDF Export', subtitle: 'Download plans and reports as a PDF', icon: 'bi-file-pdf', type: 'settings-tools' },
  { id: 'dictionary', title: 'Suggestion Dictionary', subtitle: 'Manage plan and report suggestions', icon: 'bi-book', type: 'settings-tools' },
  { id: 'browser-data', title: 'Clear Browser App Data', subtitle: 'Manage local cached application data', icon: 'bi-eraser', type: 'settings-data' },
  { id: 'account', title: 'Account and Profile', subtitle: 'Profile, account and sign-out controls', icon: 'bi-person-circle', type: 'settings-account' },
  { id: 'admin', title: 'Admin Console', subtitle: 'Protected administration, activity and system controls', icon: 'bi-shield-lock', type: 'settings-admin' },
  { id: 'undo-redo', title: 'Undo and Redo', subtitle: 'Reverse or restore recent changes', icon: 'bi-arrow-counterclockwise', type: 'dashboard' },
];

export default function GlobalSearch({ reports = [], onClose, onSelect, isAdmin = false }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const { features: customFeatures } = useCustomFeatures();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const reportResults = reports.map((report) => {
      const times = getIntervalTimes(report);
      const text = [report.plan, report.report, report.status, report.tag, report.date, report.selectedDate]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return {
        id: report.id,
        title: report.plan || 'Hourly block',
        subtitle: `${report.status || 'Pending'} · ${report.date || report.selectedDate || 'Today'} · ${formatTime12h(times.startTime)} - ${formatTime12h(times.endTime)}`,
        icon: report.status === 'Completed' ? 'bi-check-circle-fill' : report.status === 'Missed' ? 'bi-x-circle-fill' : 'bi-clock',
        type: 'report',
        report,
        text,
      };
    });

    const links = QUICK_LINKS
      .filter((link) => isAdmin || (link.type !== 'settings-admin' && link.type !== 'about-admins'))
      .map((link) => ({ ...link, text: `${link.title} ${link.subtitle} ${link.type}`.toLowerCase() }));

    const featureResults = (customFeatures || []).map((f) => ({
      id: f.id,
      title: f.title,
      subtitle: f.description || 'Custom feature',
      icon: f.icon || 'bi-stars',
      type: 'custom-feature',
      feature: f,
      text: `${f.title} ${f.description || ''} custom feature`.toLowerCase(),
    }));

    if (!normalized) return [...links, ...featureResults, ...reportResults.slice(0, 8)];
    return [...featureResults, ...reportResults, ...links].filter((result) => result.text.includes(normalized)).slice(0, 30);
  }, [isAdmin, query, reports, customFeatures]);

  return (
    <div className="global-search position-fixed top-0 start-0 w-100 h-100" role="dialog" aria-modal="true" aria-label="Global search">
      <div className="global-search-backdrop position-absolute top-0 start-0 w-100 h-100" onClick={onClose} />
      <div className="global-search-panel position-relative mx-auto bg-light shadow-lg">
        <div className="d-flex align-items-center gap-2 p-3 bg-success text-white">
          <button type="button" className="btn btn-link text-white p-0" onClick={onClose} aria-label="Close search">
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="form-control rounded-pill border-0 shadow-none"
            placeholder="Search plans, reports, journal, rewards..."
            aria-label="Search everything"
          />
          {query && (
            <button type="button" className="btn btn-link text-white p-0" onClick={() => setQuery('')} aria-label="Clear search">
              <i className="bi bi-x-circle-fill fs-5" />
            </button>
          )}
        </div>

        <div className="p-3 overflow-auto" style={{ maxHeight: 'calc(100vh - 78px)' }}>
          {!query.trim() && <div className="text-uppercase text-secondary fw-bold small mb-2">Explore features</div>}
          {query.trim() && <div className="text-uppercase text-secondary fw-bold small mb-2">Search results</div>}
          {results.length > 0 ? results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              type="button"
              className="global-search-result w-100 text-start d-flex align-items-center gap-3 border-0 bg-white rounded-3 p-3 mb-2 shadow-sm"
              onClick={() => onSelect(result)}
            >
              <span className={`global-search-icon ${result.type === 'report' ? 'text-success' : result.type === 'custom-feature' ? 'text-primary' : 'text-warning'}`}>
                <i className={`bi ${result.icon} fs-5`} />
              </span>
              <span className="flex-grow-1">
                <span className="d-block fw-bold text-dark">{result.title}</span>
                <span className="d-block small text-secondary">{result.subtitle}</span>
              </span>
              <i className="bi bi-chevron-right text-muted" />
            </button>
          )) : (
            <div className="text-center text-secondary py-5">
              <i className="bi bi-search fs-1 d-block mb-3 opacity-50" />
              <div className="fw-bold">No results found</div>
              <small>Try “completed”, “journal”, “rewards”, or a plan name.</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
