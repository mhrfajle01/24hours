// Keyboard shortcut helper for Shift Tracker, Bypass Tracker, and Doc Tracker
const LS_SHORTCUTS_KEY = 'shiftTracker_custom_shortcuts';

export const DEFAULT_SHORTCUTS = {
  openDocTracker: 'Alt+D',
  openBypassTracker: 'Alt+B',
  openShiftTracker: 'Alt+S',
  addNewItem: 'Alt+N',
  focusSearch: 'Alt+F',
  toggleFilter: 'Alt+T',
};

export const getCustomShortcuts = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_SHORTCUTS_KEY));
    return { ...DEFAULT_SHORTCUTS, ...(saved || {}) };
  } catch {
    return DEFAULT_SHORTCUTS;
  }
};

export const saveCustomShortcuts = (shortcuts) => {
  try {
    localStorage.setItem(LS_SHORTCUTS_KEY, JSON.stringify(shortcuts));
  } catch {}
};

export const parseKeyCombo = (e) => {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  
  const key = e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }
  return parts.join('+');
};

export const matchShortcut = (e, comboStr) => {
  if (!comboStr) return false;
  const current = parseKeyCombo(e);
  return current.toUpperCase() === comboStr.toUpperCase();
};
