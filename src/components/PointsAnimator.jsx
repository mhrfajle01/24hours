import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * AnimatedCounter — Smoothly animates a numeric value change with
 * a rolling slot-machine style and color flash effect.
 *
 * Props:
 *   value       - current numeric value
 *   duration    - animation duration in ms (default: 800)
 *   className   - extra CSS classes
 *   prefix      - string shown before the number (default: '')
 *   suffix      - string shown after the number (default: '')
 *   onDelta     - callback({ delta, direction }) fired when value changes
 */
export function AnimatedCounter({
  value = 0,
  duration = 800,
  className = '',
  prefix = '',
  suffix = '',
  onDelta,
  isInitial = false,
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [flashClass, setFlashClass] = useState('');
  const prevValueRef = useRef(value);
  const rafRef = useRef(null);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    if (isInitial) {
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    const from = prevValueRef.current;
    const to = value;
    const delta = to - from;

    if (delta === 0) return;

    // Skip the counting animation if it's the initial data load from 0
    if (isFirstLoadRef.current && from === 0) {
      setDisplayValue(to);
      prevValueRef.current = to;
      isFirstLoadRef.current = false;
      return;
    }
    isFirstLoadRef.current = false;

    // Notify parent about the change direction
    if (onDelta) onDelta({ delta, direction: delta > 0 ? 'up' : 'down' });

    // Flash color
    setFlashClass(delta > 0 ? 'pts-flash-up' : 'pts-flash-down');
    const flashTimer = setTimeout(() => setFlashClass(''), 1200);

    // Animate counting
    const startTime = performance.now();
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + delta * eased);
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(to);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    prevValueRef.current = to;

    return () => {
      clearTimeout(flashTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, onDelta]);

  return (
    <span className={`pts-animated-counter ${flashClass} ${className}`}>
      {prefix}{displayValue.toLocaleString()}{suffix}
    </span>
  );
}

/**
 * FloatingPointsBadge — Shows a floating "+X" or "-X" particle
 * that drifts upward and fades out when points change.
 *
 * Usage:
 *   <FloatingPointsBadge delta={20} key={uniqueKey} />
 *
 * Props:
 *   delta - the point change amount (positive = earn, negative = spend)
 */
export function FloatingPointsBadge({ delta }) {
  if (!delta || delta === 0) return null;

  const isPositive = delta > 0;
  const text = isPositive ? `+${delta}` : `${delta}`;
  const colorClass = isPositive ? 'pts-float-positive' : 'pts-float-negative';

  return (
    <span className={`pts-floating-badge ${colorClass}`} aria-hidden="true">
      {isPositive ? '🪙 ' : ''}{text} pts
    </span>
  );
}

export function PointsCollectionAnimation({ delta, sourceId, animationKey }) {
  const [flight, setFlight] = useState(null);

  useEffect(() => {
    if (!delta || !sourceId) return undefined;
    const source = document.querySelector(`[data-timing-id="${sourceId}"]`);
    const target = document.querySelector('.pts-points-btn');
    if (!source || !target) return undefined;
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    setFlight({
      startX: sourceRect.left + sourceRect.width / 2,
      startY: sourceRect.top + sourceRect.height / 2,
      deltaX: targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2),
      deltaY: targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2),
    });
  }, [delta, sourceId, animationKey]);

  if (!flight || !delta) return null;
  const isPositive = delta > 0;
  return (
    <span
      className={`pts-collection-animation ${isPositive ? 'pts-collection-earn' : 'pts-collection-spend'}`}
      style={{ left: flight.startX, top: flight.startY }}
      aria-hidden="true"
    >
      {Array.from({ length: isPositive ? 7 : 4 }).map((_, index) => (
        <span
          key={index}
          className="pts-collection-coin"
          style={{ '--coin-index': index, '--fly-x': `${flight.deltaX}px`, '--fly-y': `${flight.deltaY}px` }}
        >
          {isPositive ? '🪙' : '✦'}
        </span>
      ))}
      <span
        className="pts-collection-total"
        style={{ '--fly-x': `${flight.deltaX}px`, '--fly-y': `${flight.deltaY}px` }}
      >
        {isPositive ? '+' : ''}{delta}
      </span>
    </span>
  );
}

/**
 * PointsChangeOverlay — A brief full-width toast/banner that slides in
 * from the top when points change, then auto-dismisses.
 *
 * Props:
 *   delta      - point change amount
 *   message    - description text
 *   show       - whether to display
 *   onDone     - callback when animation ends
 */
export function PointsChangeOverlay({ delta, message, show, onDone }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (show && delta !== 0) {
      setVisible(true);
      setExiting(false);

      const exitTimer = setTimeout(() => {
        setExiting(true);
      }, 2200);

      const doneTimer = setTimeout(() => {
        setVisible(false);
        setExiting(false);
        if (onDone) onDone();
      }, 2800);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(doneTimer);
      };
    }
  }, [show, delta, onDone]);

  if (!visible) return null;

  const isPositive = delta > 0;

  return (
    <div
      className={`pts-change-overlay ${exiting ? 'pts-overlay-exit' : 'pts-overlay-enter'}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        className={`pts-overlay-banner ${isPositive ? 'pts-banner-earn' : 'pts-banner-spend'}`}
      >
        <div className="pts-overlay-icon">
          {isPositive ? '🪙✨' : '💸'}
        </div>
        <div className="pts-overlay-content">
          <span className="pts-overlay-delta">
            {isPositive ? '+' : ''}{delta} pts
          </span>
          {message && <span className="pts-overlay-message">{message}</span>}
        </div>
        {/* Sparkle particles for earn */}
        {isPositive && (
          <div className="pts-sparkles" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="pts-sparkle" style={{ '--sparkle-i': i }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * usePointsAnimation — Hook that watches pointsData and triggers
 * animation state whenever points change.
 *
 * Returns:
 *   { lastDelta, lastMessage, showOverlay, dismissOverlay, floatKey }
 */
export function usePointsAnimation(pointsData) {
  const [lastDelta, setLastDelta] = useState(0);
  const [lastMessage, setLastMessage] = useState('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [floatKey, setFloatKey] = useState(0);
  const [lastSourceId, setLastSourceId] = useState(null);
  const prevPointsRef = useRef(null);

  useEffect(() => {
    if (!pointsData || pointsData.isInitial) return;

    const currentPoints = pointsData.points || 0;
    const history = pointsData.history || [];

    // Skip first mount
    if (prevPointsRef.current === null) {
      prevPointsRef.current = currentPoints;
      return;
    }

    const delta = currentPoints - prevPointsRef.current;

    if (delta !== 0) {
      setLastDelta(delta);
      // Get the latest history message
      const latestEntry = history[0];
      setLastMessage(latestEntry?.title || '');
      setLastSourceId(latestEntry?.sourceId || null);
      setShowOverlay(true);
      setFloatKey((k) => k + 1);
    }

    prevPointsRef.current = currentPoints;
  }, [pointsData?.points]);

  const dismissOverlay = useCallback(() => {
    setShowOverlay(false);
  }, []);

  return { lastDelta, lastMessage, showOverlay, dismissOverlay, floatKey, lastSourceId };
}

export default {
  AnimatedCounter,
  FloatingPointsBadge,
  PointsCollectionAnimation,
  PointsChangeOverlay,
  usePointsAnimation,
};
