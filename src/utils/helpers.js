// Helpers for HourLog application

/**
 * Convert 12-hour format with AM/PM to 24-hour hour number.
 * Used for chronological sorting.
 */
export const get24Hour = (hour, ampm) => {
  const h = parseInt(hour, 10);
  if (isNaN(h)) return 0;
  const isPM = typeof ampm === 'string' && ampm.toUpperCase() === 'PM';
  if (isPM) {
    return h === 12 ? 12 : h + 12;
  } else {
    return h === 12 ? 0 : h;
  }
};

/**
 * Sorts reports by Date (ascending), then Hour (chronologically), then AM/PM.
 */
/**
 * Convert HH:MM 24-hour time to 12-hour format with AM/PM (e.g., "14:30" -> "02:30 PM", "08:00" -> "08:00 AM")
 */
export const formatTime12h = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return '';
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  if (isNaN(hours)) return '';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // Convert 0 to 12
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

/**
 * Reconstructs or extracts startTime and endTime from a report object.
 * Falls back to computing them from hour and ampm if the new fields do not exist.
 */
export const getIntervalTimes = (report) => {
  if (!report) {
    return { startTime: '08:00', endTime: '09:00' };
  }
  if (typeof report.startTime === 'string' && typeof report.endTime === 'string' && report.startTime && report.endTime) {
    return { startTime: report.startTime, endTime: report.endTime };
  }
  const hour = parseInt(report.hour, 10);
  if (!isNaN(hour)) {
    const ampm = (report.ampm || 'AM').toUpperCase();
    const h24 = get24Hour(hour, ampm);
    const startStr = `${String(h24).padStart(2, '0')}:00`;
    const endStr = `${String((h24 + 1) % 24).padStart(2, '0')}:00`;
    return { startTime: startStr, endTime: endStr };
  }
  return { startTime: '08:00', endTime: '09:00' };
};

/**
 * Converts a "HH:MM" 24-hour string to minutes since midnight.
 */
export const timeToMinutes = (timeStr) => {
  if (typeof timeStr !== 'string' || !timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  return hours * 60 + minutes;
};

/**
 * Converts any time string (like "08:00 AM", "2:30 PM", or "14:30") to standard HH:MM 24-hour format for time inputs.
 */
export const normalizeTimeTo24h = (timeStr) => {
  if (typeof timeStr !== 'string' || !timeStr) return '08:00';
  const cleanStr = timeStr.trim();
  const match = cleanStr.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3];
    if (ampm) {
      const isPM = ampm.toUpperCase() === 'PM';
      if (isPM) {
        hours = hours === 12 ? 12 : hours + 12;
      } else {
        hours = hours === 12 ? 0 : hours;
      }
    }
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  return '08:00';
};

/**
 * Sorts reports by Date (ascending), then by Start Time (chronologically).
 */
export const sortReports = (reports) => {
  return [...reports].sort((a, b) => {
    // Sort by Date
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    // Sort by Start Time
    const timesA = getIntervalTimes(a);
    const timesB = getIntervalTimes(b);
    return timesA.startTime.localeCompare(timesB.startTime);
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
 * Calculates statistics for reports based on custom intervals.
 * Returns both raw values (in minutes) and formatted friendly string representations.
 */
export const calculateStats = (reports) => {
  let completedMinutes = 0;
  let pendingMinutes = 0;
  let missedMinutes = 0;
  
  reports.forEach((r) => {
    const times = getIntervalTimes(r);
    const startMin = timeToMinutes(times.startTime);
    let endMin = timeToMinutes(times.endTime);
    if (endMin < startMin) {
      endMin += 24 * 60; // Handle overnight wrap-around (e.g. 11 PM to 1 AM)
    }
    const duration = endMin - startMin;

    if (r.status === 'Completed') {
      completedMinutes += duration;
    } else if (r.status === 'Pending') {
      pendingMinutes += duration;
    } else if (r.status === 'Missed') {
      missedMinutes += duration;
    }
  });
  
  const totalMinutes = completedMinutes + pendingMinutes + missedMinutes;
  const productivity = totalMinutes > 0 ? Math.round((completedMinutes / totalMinutes) * 100) : 0;
  
  const formatFriendly = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  return {
    completed: formatFriendly(completedMinutes),
    pending: formatFriendly(pendingMinutes),
    missed: formatFriendly(missedMinutes),
    totalPlanned: formatFriendly(totalMinutes),
    completedRaw: completedMinutes,
    pendingRaw: pendingMinutes,
    missedRaw: missedMinutes,
    totalPlannedRaw: totalMinutes,
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
