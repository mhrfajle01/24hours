// Helpers for HourLog application

/**
 * Convert 12-hour format with AM/PM to 24-hour hour number.
 * Used for chronological sorting.
 */
export const get24Hour = (hour, ampm) => {
  const h = parseInt(hour, 10);
  if (ampm === 'AM') {
    return h === 12 ? 0 : h;
  } else {
    return h === 12 ? 12 : h + 12;
  }
};

/**
 * Sorts reports by Date (ascending), then Hour (chronologically), then AM/PM.
 */
export const sortReports = (reports) => {
  return [...reports].sort((a, b) => {
    // Sort by Date
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    // Sort by Hour (chronological 24-hour)
    const timeA = get24Hour(a.hour, a.ampm);
    const timeB = get24Hour(b.hour, b.ampm);
    return timeA - timeB;
  });
};

/**
 * Pads the hour to 2 digits and appends ":00 AM/PM" to look like WhatsApp timestamps
 */
export const formatHourString = (hour, ampm) => {
  const padded = String(hour).padStart(2, '0');
  return `${padded}:00 ${ampm}`;
};

/**
 * Returns today's date in local YYYY-MM-DD format.
 */
export const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Returns the current local time formatted as HH:MM:SS AM/PM or similar
 */
export const getCurrentTimeString = () => {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

/**
 * Detects the current hour (1-12) and AM/PM indicator.
 */
export const getCurrentHourAndAMPM = () => {
  const now = new Date();
  let hours = now.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // Convert 0 to 12
  return { hour: hours, ampm };
};

/**
 * Calculates statistics for reports: Completed, Pending, Missed, Total Planned, and Productivity percentage.
 */
export const calculateStats = (reports) => {
  const completed = reports.filter((r) => r.status === 'Completed').length;
  const pending = reports.filter((r) => r.status === 'Pending').length;
  const missed = reports.filter((r) => r.status === 'Missed').length;
  
  // Total Planned is the sum of all tasks in the timeline
  const totalPlanned = reports.length;
  
  // Productivity % = (Completed Hours / Total Planned Hours) * 100
  const productivity = totalPlanned > 0 ? Math.round((completed / totalPlanned) * 100) : 0;
  
  return {
    completed,
    pending,
    missed,
    totalPlanned,
    productivity
  };
};

/**
 * Generates an array of hours from 6 AM to 11 PM
 */
export const getDayHoursList = () => {
  const hours = [];
  
  // AM hours: 6 AM to 11 AM
  for (let h = 6; h <= 11; h++) {
    hours.push({ hour: h, ampm: 'AM' });
  }
  
  // 12 PM
  hours.push({ hour: 12, ampm: 'PM' });
  
  // PM hours: 1 PM to 11 PM
  for (let h = 1; h <= 11; h++) {
    hours.push({ hour: h, ampm: 'PM' });
  }
  
  return hours;
};

/**
 * Format date for friendly UI display, e.g. "Saturday, June 27, 2026"
 */
export const formatFriendlyDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
