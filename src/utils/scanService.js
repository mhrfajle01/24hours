// src/utils/scanService.js
// Scan service that walks the DOM looking for timing blocks and validates them.

/**
 * Find all elements that represent timing blocks.
 * Expected attributes on each element:
 *   data-timing-id      – unique identifier of the block
 *   data-timing-state   – "pending" | "completed"
 *   data-timing-closed  – presence indicates the block has a closing tag
 */
export function collectTimingBlocks() {
  const blocks = [];
  document.querySelectorAll('[data-timing-id]').forEach(el => {
    const id = el.dataset.timingId;
    const state = el.dataset.timingState || 'unknown';
    const plan = el.dataset.timingPlan || '';
    const time = el.dataset.timingTime || '';
    const hasClose = !!el.dataset.timingClosed;
    blocks.push({ id, state, plan, time, hasClose, element: el });
  });
  return blocks;
}

/**
 * Return the subset of blocks that are pending/completed but missing a closing tag.
 */
export function findInvalidBlocks(blocks) {
  return blocks.filter(b =>
    (b.state === 'pending' || b.state === 'completed') && !b.hasClose
  );
}

/**
 * Run a full scan and return the validation result.
 * The function is intended to be called from the UI thread or a worker.
 */
export function runFullUIScan() {
  const all = collectTimingBlocks();
  const invalid = findInvalidBlocks(all);
  // Persist results for later inspection (e.g., to IndexedDB or localStorage).
  const timestamp = new Date().toISOString();
  const report = { 
    timestamp, 
    total: all.length, 
    invalidCount: invalid.length, 
    invalid: invalid.map(b => ({ id: b.id, state: b.state, plan: b.plan, time: b.time })) 
  };
  try {
    localStorage.setItem('ui-scan-report', JSON.stringify(report));
  } catch (e) {
    console.warn('Unable to persist UI scan report', e);
  }
  return report;
}

// Export a helper to schedule periodic scans (5 min interval).
export function startPeriodicScan(callback) {
  const intervalMs = 5 * 60 * 1000; // 5 minutes
  // Run once immediately
  const result = runFullUIScan();
  if (callback) callback(result);
  // Schedule recurring scans
  const id = setInterval(() => {
    const res = runFullUIScan();
    if (callback) callback(res);
  }, intervalMs);
  // Return a function to stop the interval.
  return () => clearInterval(id);
}
