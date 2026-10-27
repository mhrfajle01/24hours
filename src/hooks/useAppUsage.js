import { useEffect, useRef, useState } from 'react';
import { doc, increment, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { getTodayDateString } from '../utils/helpers';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const SYNC_INTERVAL_MS = 30 * 1000;

// Maximum seconds that could possibly have elapsed since 12:00 AM today
const getMaxElapsedTodaySeconds = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const diffSec = Math.floor((now.getTime() - startOfDay.getTime()) / 1000);
  return Math.max(0, Math.min(diffSec + 60, 86400));
};

const sanitizeSeconds = (val) => {
  const num = Number.parseInt(val, 10);
  if (!Number.isFinite(num) || num < 0) return 0;
  // If value is greater than the total elapsed time since midnight today,
  // it was corrupted by prior runaway increment bugs. Reset/clamp it!
  const maxElapsed = getMaxElapsedTodaySeconds();
  if (num > maxElapsed) {
    // If it exceeded the day's timeline, clamp to maxElapsed or default reasonable time
    return maxElapsed;
  }
  return num;
};

const getStorageKey = (uid, date) => `app-usage:${uid}:${date}`;

/**
 * Tracks time spent actively using the app, separate from task/report time.
 * Time is counted only while the app is visible, focused, and not idle.
 */
export const useAppUsage = (uid) => {
  const today = getTodayDateString();
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const secondsRef = useRef(0);
  const lastTickRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const lastSyncedSecondsRef = useRef(0);
  const visibleRef = useRef(typeof document === 'undefined' || document.visibilityState === 'visible');
  const focusedRef = useRef(typeof document === 'undefined' || document.hasFocus());

  useEffect(() => {
    if (!uid) {
      setActiveSeconds(0);
      setIsActive(false);
      return undefined;
    }

    const storageKey = getStorageKey(uid, today);
    const storedSeconds = sanitizeSeconds(localStorage.getItem(storageKey));
    secondsRef.current = storedSeconds;
    lastSyncedSecondsRef.current = 0;
    setActiveSeconds(secondsRef.current);

    const usageRef = doc(db, 'appUsage', uid, 'days', today);
    const unsubscribe = onSnapshot(usageRef, (snapshot) => {
      const rawRemote = snapshot.exists() ? snapshot.data().activeSeconds || 0 : 0;
      const remoteSeconds = sanitizeSeconds(rawRemote);
      const localSeconds = sanitizeSeconds(localStorage.getItem(storageKey));
      const maxElapsed = getMaxElapsedTodaySeconds();
      const mergedSeconds = Math.min(maxElapsed, Math.max(localSeconds, remoteSeconds));
      secondsRef.current = mergedSeconds;
      // Preserve locally accumulated seconds that have not been synced yet.
      lastSyncedSecondsRef.current = Math.max(lastSyncedSecondsRef.current, remoteSeconds);
      setActiveSeconds(mergedSeconds);
      localStorage.setItem(storageKey, String(mergedSeconds));

      // Auto-heal Firestore if remote was corrupted with an impossible value
      if (rawRemote > maxElapsed) {
        setDoc(usageRef, {
          uid,
          date: today,
          activeSeconds: mergedSeconds,
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch((err) => console.error('Failed to heal remote usage:', err));
      }
    }, (error) => {
      console.error('Firestore app usage error:', error);
    });

    const currentlyActive = () => (
      visibleRef.current &&
      focusedRef.current &&
      Date.now() - lastActivityRef.current < IDLE_TIMEOUT_MS
    );

    const syncUsage = async () => {
      const unsyncedSeconds = secondsRef.current - lastSyncedSecondsRef.current;
      if (unsyncedSeconds <= 0 && secondsRef.current === lastSyncedSecondsRef.current) return;
      lastSyncedSecondsRef.current = secondsRef.current;
      await setDoc(usageRef, {
        uid,
        date: today,
        // Overwrite Firestore document with sanitized real seconds to cure any prior increment explosion
        activeSeconds: secondsRef.current,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    };

    const markActivity = () => {
      lastActivityRef.current = Date.now();
      setIsActive(currentlyActive());
    };

    const handleVisibilityChange = () => {
      visibleRef.current = document.visibilityState === 'visible';
      if (visibleRef.current) markActivity();
      else setIsActive(false);
    };

    const handleFocus = () => {
      focusedRef.current = true;
      markActivity();
    };

    const handleBlur = () => {
      focusedRef.current = false;
      setIsActive(false);
    };

    const tick = () => {
      const now = Date.now();
      if (lastTickRef.current !== null && currentlyActive()) {
        const elapsedSeconds = Math.min(Math.floor((now - lastTickRef.current) / 1000), 60);
        if (elapsedSeconds > 0) {
          const maxElapsed = getMaxElapsedTodaySeconds();
          secondsRef.current = Math.min(maxElapsed, secondsRef.current + elapsedSeconds);
          setActiveSeconds(secondsRef.current);
          localStorage.setItem(storageKey, String(secondsRef.current));
        }
      }
      lastTickRef.current = now;
      setIsActive(currentlyActive());
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    markActivity();
    lastTickRef.current = Date.now();
    const tickInterval = window.setInterval(tick, 1000);
    const syncInterval = window.setInterval(() => {
      syncUsage().catch((error) => console.error('Failed to sync app usage:', error));
    }, SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(tickInterval);
      window.clearInterval(syncInterval);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      syncUsage().catch((error) => console.error('Failed to sync app usage:', error));
      unsubscribe();
    };
  }, [uid, today]);

  return { activeSeconds, isActive };
};
