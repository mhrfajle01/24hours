import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { sortReports, getDayHoursList, get24Hour, getIntervalTimes, timeToMinutes, getTodayDateString, calculateBlockPoints } from '../utils/helpers';

/** Returns YYYY-MM-DD for N days ago */
const getDateNDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Returns weekday name for a YYYY-MM-DD string */
const getWeekdayName = (dateStr) => {
  const parts = dateStr.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
};

const FEATURE_COSTS = {
  consistency_insights: 500,
  history: 350,
  pdf_export: 1000,
  security_scan: 500,
  islamic_theme: 750,
  import_json: 50,
  unlimited_todo_tags: 150,
};

/**
 * useFirestore — Firestore hook with full trash/undo support.
 * All operations are scoped by the authenticated user's uid.
 * 
 * Trash architecture:
 *   - 'reports' collection: active records
 *   - 'trash' collection: soft-deleted records (include originalId + deletedAt)
 */
export const useFirestore = (selectedDate, uid) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [trashItems, setTrashItems] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);

  // ─── Reports real-time listener ───────────────────────────────────────
  useEffect(() => {
    if (!selectedDate || !uid) {
      setReports([]);
      setLoading(false);
      return;
    }
    const cacheKey = `reports-cache:${uid}:${selectedDate}`;
    let hasCachedReports = false;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (Array.isArray(cached)) {
        setReports(sortReports(cached));
        hasCachedReports = true;
      }
    } catch (cacheError) {
      console.warn('Unable to read cached reports:', cacheError);
    }
    setLoading(!hasCachedReports);
    setError(null);

    const q = query(
      collection(db, 'reports'),
      where('uid', '==', uid),
      where('date', '==', selectedDate)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReports(sortReports(fetched));
        try {
          localStorage.setItem(cacheKey, JSON.stringify(fetched));
        } catch (cacheError) {
          console.warn('Unable to cache reports:', cacheError);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Firestore reports error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedDate, uid]);

  // ─── Trash real-time listener ─────────────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setTrashItems([]);
      return;
    }
    setTrashLoading(true);

    const q = query(collection(db, 'trash'), where('uid', '==', uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (b.deletedAt?.toMillis?.() ?? 0) - (a.deletedAt?.toMillis?.() ?? 0)
          );
        setTrashItems(items);
        setTrashLoading(false);
      },
      (err) => {
        console.error('Firestore trash error:', err);
        setTrashLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  // ─── Reports CRUD ─────────────────────────────────────────────────────

  /** Add a new report; returns the new document ID */
  const addReport = async (reportData) => {
    if (!uid) throw new Error('Authentication required');
    const ref = await addDoc(collection(db, 'reports'), {
      ...reportData,
      uid,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  };

  /** Update specific fields on an existing report */
  const updateReport = async (id, updatedData) => {
    await updateDoc(doc(db, 'reports', id), updatedData);
  };

  /**
   * Soft delete — copies report to 'trash' collection then removes from 'reports'.
   * Returns { trashId, originalData } for undo support.
   */
  const moveToTrash = async (id) => {
    if (!uid) throw new Error('Authentication required');
    const ref = doc(db, 'reports', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Document not found');
    const data = snap.data();

    const trashRef = await addDoc(collection(db, 'trash'), {
      ...data,
      originalId: id,
      deletedAt: serverTimestamp(),
    });

    await deleteDoc(ref);
    return { trashId: trashRef.id, originalData: { id, ...data } };
  };

  /**
   * Hard delete — permanently removes from 'reports' without trash.
   * Used internally for undo of ADD operations.
   */
  const hardDeleteReport = async (id) => {
    await deleteDoc(doc(db, 'reports', id));
  };

  // ─── Trash operations ─────────────────────────────────────────────────

  /**
   * Restore a single trash item back to 'reports'.
   * Returns the new document ID.
   */
  const restoreFromTrash = async (trashId) => {
    if (!uid) throw new Error('Authentication required');
    const trashRef = doc(db, 'trash', trashId);
    const snap = await getDoc(trashRef);
    if (!snap.exists()) throw new Error('Trash item not found');
    const { originalId, deletedAt, ...reportData } = snap.data();

    const newRef = await addDoc(collection(db, 'reports'), reportData);
    await deleteDoc(trashRef);
    return newRef.id;
  };

  /** Permanently delete a single item from trash */
  const permanentDeleteFromTrash = async (trashId) => {
    await deleteDoc(doc(db, 'trash', trashId));
  };

  /** Permanently delete ALL trash items for this user; returns count */
  const emptyTrash = async () => {
    if (!uid) throw new Error('Authentication required');
    const q = query(collection(db, 'trash'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return 0;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  };

  /**
   * Restore multiple trash items by IDs.
   * Returns array of new document IDs (for redo support).
   */
  const restoreAllFromTrash = async (trashIds) => {
    if (!uid || !trashIds.length) return [];
    const reportsCol = collection(db, 'reports');
    const trashCol = collection(db, 'trash');
    const batch = writeBatch(db);
    const newIds = [];

    for (const trashId of trashIds) {
      const snap = await getDoc(doc(trashCol, trashId));
      if (!snap.exists()) continue;
      const { originalId, deletedAt, ...reportData } = snap.data();
      const newDocRef = doc(reportsCol);
      batch.set(newDocRef, reportData);
      batch.delete(doc(trashCol, trashId));
      newIds.push(newDocRef.id);
    }

    await batch.commit();
    return newIds;
  };

  // ─── Bulk operations ──────────────────────────────────────────────────

  /**
   * Auto-generate a full day's hourly blocks.
   * Returns array of new docIds (for undo support).
   */
  const generateDayReports = async (date) => {
    if (!uid) throw new Error('Authentication required');
    const q = query(
      collection(db, 'reports'),
      where('uid', '==', uid),
      where('date', '==', date)
    );
    const snap = await getDocs(q);

    // Map existing reports to their start and end times in minutes
    const existingIntervals = snap.docs.map((d) => {
      const data = d.data();
      const times = getIntervalTimes(data);
      const startMin = timeToMinutes(times.startTime);
      let endMin = timeToMinutes(times.endTime);
      if (endMin <= startMin) endMin += 24 * 60; // overnight wrap
      return { startMin, endMin };
    });

    const dayHours = getDayHoursList();
    const batch = writeBatch(db);
    const reportsCol = collection(db, 'reports');
    const newIds = [];

    dayHours.forEach(({ hour, ampm }) => {
      const h24 = get24Hour(hour, ampm);
      const startStr = `${String(h24).padStart(2, '0')}:00`;
      const endStr = `${String((h24 + 1) % 24).padStart(2, '0')}:00`;

      const newStart = timeToMinutes(startStr);
      let newEnd = timeToMinutes(endStr);
      if (newEnd <= newStart) newEnd += 24 * 60; // overnight wrap

      // Check if this default slot overlaps with any existing custom/default slots
      const hasOverlap = existingIntervals.some(
        (exist) => newStart < exist.endMin && newEnd > exist.startMin
      );

      if (!hasOverlap) {
        const ref = doc(reportsCol);
        batch.set(ref, {
          uid,
          date,
          hour,
          ampm,
          startTime: startStr,
          endTime: endStr,
          plan: '',
          report: '',
          status: 'Pending',
          createdAt: serverTimestamp(),
        });
        newIds.push(ref.id);
      }
    });

    if (newIds.length > 0) await batch.commit();
    return newIds;
  };

  /**
   * Move ALL reports for a date to trash (soft clear).
   * Returns array of new trashIds (for undo support).
   */
  const clearDayReports = async (date) => {
    if (!uid) throw new Error('Authentication required');
    const q = query(
      collection(db, 'reports'),
      where('uid', '==', uid),
      where('date', '==', date)
    );
    const snap = await getDocs(q);
    if (snap.empty) return [];

    const batch = writeBatch(db);
    const trashCol = collection(db, 'trash');
    const trashIds = [];

    snap.docs.forEach((d) => {
      const trashRef = doc(trashCol);
      batch.set(trashRef, {
        ...d.data(),
        originalId: d.id,
        deletedAt: serverTimestamp(),
      });
      batch.delete(d.ref);
      trashIds.push(trashRef.id);
    });

    await batch.commit();
    return trashIds;
  };

  const [userDictionary, setUserDictionary] = useState([]);
  const [dictionaryLoading, setDictionaryLoading] = useState(true);

  // ─── Dictionary real-time listener ────────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setUserDictionary([]);
      setDictionaryLoading(false);
      return;
    }
    setDictionaryLoading(true);

    const ref = doc(db, 'dictionaries', uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setUserDictionary(snap.data().items || []);
        } else {
          setUserDictionary([]);
        }
        setDictionaryLoading(false);
      },
      (err) => {
        console.error('Firestore dictionary error:', err);
        setDictionaryLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const updateDictionary = async (newItems) => {
    if (!uid) throw new Error('Authentication required');
    const ref = doc(db, 'dictionaries', uid);
    await setDoc(ref, { items: newItems, updatedAt: serverTimestamp() }, { merge: true });
  };

  // ─── Daily Goal ── declared FIRST so all downstream effects can read it ─
  const [dailyGoal, setDailyGoalState] = useState(6);

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'goals', uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setDailyGoalState(snap.data().dailyGoal ?? 6);
      }
    });
    return () => unsub();
  }, [uid]);

  const updateDailyGoal = async (newGoal) => {
    if (!uid) return;
    const ref = doc(db, 'goals', uid);
    await setDoc(ref, { dailyGoal: newGoal, updatedAt: serverTimestamp() }, { merge: true });
  };

  // ─── Streak helper ────────────────────────────────────────────────────
  const getMissingDaysBetween = (fromDate, toDate, excusedDays = []) => {
    if (!fromDate || !toDate || fromDate >= toDate) return [];
    const missing = [];
    let cur = new Date(fromDate + 'T00:00:00');
    while (true) {
      cur.setDate(cur.getDate() + 1);
      const year = cur.getFullYear();
      const month = String(cur.getMonth() + 1).padStart(2, '0');
      const day = String(cur.getDate()).padStart(2, '0');
      const curStr = `${year}-${month}-${day}`;
      if (curStr >= toDate) break;
      if (!excusedDays.includes(curStr)) missing.push(curStr);
    }
    return missing;
  };

  // ─── Streak ───────────────────────────────────────────────────────────
  const [streakData, setStreakData] = useState({ currentStreak: 0, longestStreak: 0, lastActiveDate: null, streakFreezes: 1, excusedDays: [] });
  const [streakRequirements, setStreakRequirements] = useState({
    appUsageSeconds: 0,
    appUsageMet: false,
    journalMet: false,
    planningCount: 0,
    planningMet: false,
    qualified: false,
  });
  const streakRefreshInFlightRef = useRef(false);

  const getYesterdayDate = (dateStr) => {
    const date = new Date(`${dateStr}T00:00:00`);
    date.setDate(date.getDate() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const reconcileDailyStreakBonus = async (today, desiredAmount) => {
    if (!uid) return;
    const ref = doc(db, 'points', uid);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const current = snap.exists() ? snap.data() : { points: 0, history: [] };
      const bonuses = current.streakBonusByDate || {};
      const previous = bonuses[today] || 0;
      const delta = desiredAmount - previous;
      if (!delta) return;
      const record = {
        id: `pts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: `🔥 Day ${Math.max(0, desiredAmount / 20)} Streak Bonus Adjustment (${delta > 0 ? '+' : ''}${delta} pts)`,
        amount: delta,
        date: new Date().toISOString(),
        type: delta >= 0 ? 'earn' : 'spend',
      };
      bonuses[today] = desiredAmount;
      transaction.set(ref, {
        points: Math.max(0, (current.points || 0) + delta),
        history: [record, ...(current.history || [])].slice(0, 50),
        streakBonusByDate: bonuses,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
  };

  const refreshStreakInternal = async () => {
    if (!uid) return;
    const today = getTodayDateString();
    const ref = doc(db, 'streaks', uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};

    let {
      currentStreak = 0,
      longestStreak = 0,
      lastActiveDate = null,
      streakFreezes = 1,
      excusedDays = [],
    } = existing;

    const todayQ = query(collection(db, 'reports'), where('uid', '==', uid), where('date', '==', today));
    const todaySnap = await getDocs(todayQ);
    const todayHasThreePlans = todaySnap.size >= 3;
    const journalsQ = query(collection(db, 'journals'), where('uid', '==', uid));
    const journalsSnap = await getDocs(journalsQ);
    const hasJournalToday = journalsSnap.docs.some((journal) => journal.data().date === today);
    const usageSnap = await getDoc(doc(db, 'appUsage', uid, 'days', today));
    const activeUsageSeconds = usageSnap.exists() ? usageSnap.data().activeSeconds || 0 : 0;
    const todayQualifies = activeUsageSeconds >= 180 && hasJournalToday && todayHasThreePlans;
    setStreakRequirements({
      appUsageSeconds: activeUsageSeconds,
      appUsageMet: activeUsageSeconds >= 180,
      journalMet: hasJournalToday,
      planningCount: todaySnap.size,
      planningMet: todayHasThreePlans,
      qualified: todayQualifies,
    });

    const missingDays = getMissingDaysBetween(lastActiveDate, today, excusedDays);
    const neededFreezes = missingDays.length;

    if (todayQualifies) {
      if (lastActiveDate !== today) {
        const streakBeforeToday = currentStreak || 0;
        const lastActiveDateBeforeToday = lastActiveDate;
        if (neededFreezes <= streakFreezes) {
          if (neededFreezes > 0) {
            streakFreezes = Math.max(0, streakFreezes - neededFreezes);
            excusedDays = [...excusedDays, ...missingDays];
          }
          currentStreak = (currentStreak || 0) + 1;
          longestStreak = Math.max(longestStreak || 0, currentStreak);
        } else {
          currentStreak = 1;
          longestStreak = Math.max(longestStreak || 0, 1);
        }
        lastActiveDate = today;

        await setDoc(ref, {
          currentStreak,
          longestStreak,
          lastActiveDate,
          streakFreezes,
          excusedDays,
          streakQualifiedDate: today,
          streakBeforeToday,
          lastActiveDateBeforeToday,
          lastBonusStreakDay: currentStreak,
          lastBonusStreakDate: today,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
      }
    } else {
      // Undo today's qualification while the day is still open. This is reversible
      // if the user completes the requirements again later today.
      if (lastActiveDate === today && currentStreak > 0) {
        currentStreak = existing.streakQualifiedDate === today
          ? Math.max(0, existing.streakBeforeToday || 0)
          : Math.max(0, currentStreak - 1);
        lastActiveDate = existing.streakQualifiedDate === today
          ? (existing.lastActiveDateBeforeToday || getYesterdayDate(today))
          : getYesterdayDate(today);
        await setDoc(ref, {
          currentStreak,
          lastActiveDate,
          streakQualifiedDate: null,
          streakBeforeToday: null,
          lastActiveDateBeforeToday: null,
          updatedAt: serverTimestamp()
        }, { merge: true });
      // No qualification today — check if a previous day gap already exceeded freezes.
      } else if (neededFreezes > streakFreezes && currentStreak > 0) {
        // Calculate penalty based on lost streak count (20 pts per streak day lost)
        const penalty = 100 + (currentStreak * 20);
        updatePoints(-penalty, `💔 Streak Broken Penalty (${currentStreak} day streak lost, -${penalty} pts)`, 'spend', {}, `streak-break:${today}:${currentStreak}`);

        currentStreak = 0;
        await setDoc(ref, { currentStreak, lastBonusStreakDay: 0, updatedAt: serverTimestamp() }, { merge: true });
      }
    }
    await reconcileDailyStreakBonus(today, todayQualifies ? currentStreak * 20 : 0);
    setStreakData({ currentStreak, longestStreak, lastActiveDate, streakFreezes, excusedDays });
  };

  const refreshStreak = async () => {
    if (!uid || streakRefreshInFlightRef.current) return;
    streakRefreshInFlightRef.current = true;
    try {
      await refreshStreakInternal();
    } finally {
      streakRefreshInFlightRef.current = false;
    }
  };

  const excuseDay = async (dateStr) => {
    if (!uid) return;
    const ref = doc(db, 'streaks', uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    const excusedDays = [...(existing.excusedDays || [])];
    if (!excusedDays.includes(dateStr)) {
      excusedDays.push(dateStr);
      await setDoc(ref, { excusedDays, updatedAt: serverTimestamp() }, { merge: true });
      await refreshStreak();
    }
  };

  const addStreakFreeze = async () => {
    if (!uid) return;
    const ref = doc(db, 'streaks', uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data() : {};
    const newFreezes = (existing.streakFreezes || 0) + 1;
    await setDoc(ref, { streakFreezes: newFreezes, updatedAt: serverTimestamp() }, { merge: true });
    await refreshStreak();
  };

  useEffect(() => {
    if (uid) refreshStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    if (uid && reports.length > 0) refreshStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  // Re-evaluate streak requirements when today's journal or app usage changes.
  useEffect(() => {
    if (!uid) return undefined;
    const today = getTodayDateString();
    const journalsQ = query(collection(db, 'journals'), where('uid', '==', uid));
    const unsubscribeJournals = onSnapshot(journalsQ, () => {
      refreshStreak();
    });
    const unsubscribeUsage = onSnapshot(doc(db, 'appUsage', uid, 'days', today), () => {
      refreshStreak();
    });
    return () => {
      unsubscribeJournals();
      unsubscribeUsage();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // ─── Weekly Stats ─────────────────────────────────────────────────────
  const [weeklyStats, setWeeklyStats] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const dates = Array.from({ length: 7 }, (_, i) => getDateNDaysAgo(i));
    const q = query(
      collection(db, 'reports'),
      where('uid', '==', uid),
      where('date', 'in', dates)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => d.data());
      let completedHours = 0;
      let missedHours = 0;
      const today = getTodayDateString();
      const now = new Date();
        docs.forEach((d) => {
          const times = getIntervalTimes(d);
          const isOvernight = endMin < startMin;
          if (isOvernight) endMin += 24 * 60; // overnight wrap
          const durationHours = (endMin - startMin) / 60;

          // Build end timestamp
          const endDateTimeStr = `${d.date}T${times.endTime}:00`;
          let endDate = new Date(endDateTimeStr);
          // If overnight, add a day
          if (isOvernight) {
            endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
          }

          if (d.status === 'Completed') {
            completedHours += durationHours;
          } else {
            // Count as missed only if the block has already ended
            if (endDate <= now) {
              missedHours += durationHours;
            }
          }
        });
      completedHours = Number(completedHours.toFixed(1));
      missedHours = Number(missedHours.toFixed(1));
      
      const weeklyTarget = 7 * dailyGoal;
      const completionRate = Math.min(Math.round((completedHours / weeklyTarget) * 100), 100);
      const missedRate = Math.min(Math.round((missedHours / weeklyTarget) * 100), 100);

      // Best day: weekday with most completed hours
      const dayMap = {};
      docs.forEach((d) => {
        if (d.status === 'Completed') {
          const day = getWeekdayName(d.date);
          const times = getIntervalTimes(d);
          const startMin = timeToMinutes(times.startTime);
          let endMin = timeToMinutes(times.endTime);
          if (endMin < startMin) endMin += 24 * 60;
          const durationHours = (endMin - startMin) / 60;
          dayMap[day] = (dayMap[day] || 0) + durationHours;
        }
      });
      const bestDay = Object.keys(dayMap).length > 0
        ? Object.entries(dayMap).sort((a, b) => b[1] - a[1])[0][0]
        : null;

      setWeeklyStats({ completed: completedHours, missed: missedHours, completionRate, missedRate, bestDay });
    });
    return () => unsub();
  }, [uid, dailyGoal]);

  // ─── Heatmap Data (Last 30 Days) ──────────────────────────────────────
  const [heatmapData, setHeatmapData] = useState({});
  const [recentPlans, setRecentPlans] = useState([]);

  useEffect(() => {
    if (!uid) {
      setHeatmapData({});
      setRecentPlans([]);
      return;
    }
    const startDate = getDateNDaysAgo(30);
    const q = query(
      collection(db, 'reports'),
      where('uid', '==', uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const counts = {};
        const plansSet = new Set();
        snap.docs.forEach((d) => {
          const data = d.data();

          if (data.plan && data.plan.trim()) {
            plansSet.add(data.plan.trim());
          }

          if (data.status === 'Completed' && data.date >= startDate) {
            const date = data.date;
            const times = getIntervalTimes(data);
            const startMin = timeToMinutes(times.startTime);
            let endMin = timeToMinutes(times.endTime);
            if (endMin < startMin) {
              endMin += 24 * 60; // overnight wrap
            }
            const durationHours = (endMin - startMin) / 60;
            counts[date] = (counts[date] || 0) + durationHours;
          }
        });
        // Round to 1 decimal place to clean up float addition
        for (const date in counts) {
          counts[date] = Number(counts[date].toFixed(1));
        }
        setHeatmapData(counts);
        setRecentPlans(Array.from(plansSet));
      },
      (err) => {
        console.error('Firestore heatmap data error:', err);
      }
    );
    return () => unsub();
  }, [uid]);

// Duplicate daily goal block removed – keep the earlier declaration above

  // ─── Points System & Feature Unlocks ──────────────────────────────
  const [pointsData, setPointsData] = useState({ points: 0, history: [], unlockedFeatures: {}, featureExpirations: {}, mysteryBoxOpens: {}, dailyPurchases: {}, isInitial: true });

  useEffect(() => {
    if (!uid) {
      setPointsData({ points: 0, history: [], unlockedFeatures: {}, featureExpirations: {}, mysteryBoxOpens: {}, dailyPurchases: {}, isInitial: true });
      return;
    }
    const ref = doc(db, 'points', uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        let data = snap.data();
        // Start the new purchase cycle once without changing points or history.
        if (!data.featureEntitlementsResetAt) {
          const resetAt = new Date().toISOString();
          setDoc(ref, {
            unlockedFeatures: {},
            featureExpirations: {},
            featureEntitlementsResetAt: resetAt,
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch((resetError) => {
            console.error('Failed to reset feature purchases:', resetError);
          });
          data = { ...data, unlockedFeatures: {}, featureExpirations: {}, featureEntitlementsResetAt: resetAt };
        }
        setPointsData({
          points: data.points || 0,
          history: data.history || [],
          unlockedFeatures: data.unlockedFeatures || {},
          featureExpirations: data.featureExpirations || {},
          mysteryBoxOpens: data.mysteryBoxOpens || {},
          dailyPurchases: data.dailyPurchases || {},
          isInitial: false,
        });
      } else {
        // Initial setup for new/existing user without points doc
        const initPoints = {
          points: 20,
          history: [{
            id: 'init_' + Date.now(),
            title: 'Welcome Check-in Bonus',
            amount: 20,
            date: new Date().toISOString(),
            type: 'earn'
          }],
          unlockedFeatures: {},
          featureExpirations: {},
          mysteryBoxOpens: {},
          dailyPurchases: {},
          lastDailyCheckin: getTodayDateString()
        };
        setDoc(ref, { ...initPoints, updatedAt: serverTimestamp() });
        setPointsData({ points: 20, history: initPoints.history, unlockedFeatures: {}, featureExpirations: {}, mysteryBoxOpens: {}, dailyPurchases: {}, isInitial: false });
      }
    });

    return () => unsub();
  }, [uid]);

  /** Add or remove points with history record. eventKey makes repeated calls safe. */
  const updatePoints = async (amount, title, type = 'earn', extraFields = {}, eventKey = null) => {
    if (!uid) return false;
    const ref = doc(db, 'points', uid);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const current = snap.exists() ? snap.data() : { points: 0, history: [] };
      const processedEvents = current.processedPointEvents || {};
      if (eventKey && processedEvents[eventKey]) return;
      const newRecord = {
        id: `pts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title,
        amount,
        date: new Date().toISOString(),
        type,
      };
      if (eventKey) processedEvents[eventKey] = true;
      transaction.set(ref, {
        points: Math.max(0, (current.points || 0) + amount),
        history: [newRecord, ...(current.history || [])].slice(0, 50),
        ...(eventKey ? { processedPointEvents: processedEvents } : {}),
        updatedAt: serverTimestamp(),
        ...extraFields
      }, { merge: true });
    });

    return true;
  };

  // Reconcile a block's contribution instead of blindly adding on every save.
  const reconcileBlockPoints = async (report, status) => {
    if (!uid || !report?.id) return false;
    const ref = doc(db, 'points', uid);
    const pts = calculateBlockPoints(report);
    const desired = status === 'Completed' ? pts : status === 'Missed' ? -Math.max(5, Math.round(pts / 2)) : 0;
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const current = snap.exists() ? snap.data() : { points: 0, history: [] };
      const states = current.blockPointStates || {};
      const previous = states[report.id]?.amount || 0;
      const delta = desired - previous;
      if (!delta) return;
      const label = status === 'Completed'
        ? `Completed block (+${pts} pts)`
        : status === 'Missed'
          ? `Missed block penalty (-${Math.abs(desired)} pts)`
          : `Reconciled block status (${delta > 0 ? '+' : ''}${delta} pts)`;
      const record = {
        id: `pts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: label,
        amount: delta,
        date: new Date().toISOString(),
        type: delta >= 0 ? 'earn' : 'spend',
        sourceId: report.id,
      };
      states[report.id] = { status, amount: desired };
      transaction.set(ref, {
        points: Math.max(0, (current.points || 0) + delta),
        history: [record, ...(current.history || [])].slice(0, 50),
        blockPointStates: states,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    return true;
  };

  const claimDailyCheckIn = async () => {
    if (!uid) return false;
    const today = getTodayDateString();

    // Validate the 3 streak requirements BEFORE awarding check-in points
    const todayQ = query(collection(db, 'reports'), where('uid', '==', uid), where('date', '==', today));
    const todaySnap = await getDocs(todayQ);
    const todayHasThreePlans = todaySnap.size >= 3;

    const journalsQ = query(collection(db, 'journals'), where('uid', '==', uid));
    const journalsSnap = await getDocs(journalsQ);
    const hasJournalToday = journalsSnap.docs.some((journal) => journal.data().date === today);

    const usageSnap = await getDoc(doc(db, 'appUsage', uid, 'days', today));
    const activeUsageSeconds = usageSnap.exists() ? usageSnap.data().activeSeconds || 0 : 0;
    const usageMet = activeUsageSeconds >= 180;

    if (!todayHasThreePlans || !hasJournalToday || !usageMet) {
      // Requirements not met — do NOT award daily check-in bonus
      return false;
    }

    const ref = doc(db, 'points', uid);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const current = snap.exists() ? snap.data() : { points: 0, history: [] };
      if (current.lastDailyCheckin === today) return;
      const processedEvents = current.processedPointEvents || {};
      const eventKey = `daily-checkin:${today}`;
      if (processedEvents[eventKey]) return;
      processedEvents[eventKey] = true;
      const record = {
        id: `pts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: `Daily Check-in (${today})`,
        amount: 20,
        date: new Date().toISOString(),
        type: 'earn',
      };
      transaction.set(ref, {
        points: (current.points || 0) + 20,
        history: [record, ...(current.history || [])].slice(0, 50),
        lastDailyCheckin: today,
        processedPointEvents: processedEvents,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    return true;
  };

  /** Redeem points for Streak Freeze, Excusing a missed day, or Mystery Box */
  const redeemPerk = async (perkType, cost, payload = {}) => {
    const today = getTodayDateString();
    let effectiveCost = cost;
    if (perkType === 'STREAK_FREEZE') effectiveCost = 300;
    if (perkType === 'EXCUSE_DAY') effectiveCost = 400;
    if (perkType === 'MYSTERY_BOX') effectiveCost = 500;
    if (perkType === 'UNLOCK_FEATURE') effectiveCost = FEATURE_COSTS[payload.featureKey] || cost;

    if (pointsData.points < effectiveCost) {
      throw new Error(`Insufficient points! You need ${effectiveCost} pts.`);
    }

    if (perkType === 'STREAK_FREEZE') {
      const purchasedToday = pointsData.dailyPurchases?.[today]?.streakFreeze || 0;
      if (purchasedToday >= 1) throw new Error('Streak Freeze can only be purchased once per day.');
      await addStreakFreeze();
      await updatePoints(-effectiveCost, 'Purchased Streak Freeze', 'spend', {
        dailyPurchases: { [today]: { ...(pointsData.dailyPurchases?.[today] || {}), streakFreeze: purchasedToday + 1 } }
      });
    } else if (perkType === 'EXCUSE_DAY') {
      if (!payload.date) throw new Error('Date required to excuse missed day');
      const purchasedToday = pointsData.dailyPurchases?.[today]?.excuseDay || 0;
      if (purchasedToday >= 1) throw new Error('Excuse Day can only be purchased once per day.');
      await excuseDay(payload.date);
      await updatePoints(-effectiveCost, `Excused missed day (${payload.date})`, 'spend', {
        dailyPurchases: { [today]: { ...(pointsData.dailyPurchases?.[today] || {}), excuseDay: purchasedToday + 1 } }
      });
    } else if (perkType === 'MYSTERY_BOX') {
      const currentOpens = pointsData.mysteryBoxOpens?.[today] || 0;
      if (currentOpens >= 3) {
        throw new Error('Daily limit reached! You can open Mystery Box only 3 times per day.');
      }

      // Rewards can exceed the price, but the weighted average remains below 500.
      // 55% Common (250-400), 30% Uncommon (450-600), 12% Rare (700-900), 3% Jackpot (1200)
      const rand = Math.random() * 100;
      let wonAmount = 250;
      let tier = 'common'; // 'common' | 'uncommon' | 'rare' | 'jackpot'

      if (rand < 3) {
        // 3% chance for a 1200 pts Jackpot
        wonAmount = 1200;
        tier = 'jackpot';
      } else if (rand < 15) {
        // 12% chance for 700 - 900 pts Rare
        wonAmount = Math.floor(Math.random() * 201) + 700;
        tier = 'rare';
      } else if (rand < 50) {
        // 30% chance for 450 - 600 pts Uncommon
        wonAmount = Math.floor(Math.random() * 151) + 450;
        tier = 'uncommon';
      } else {
        // 55% chance for 250 - 400 pts Common
        wonAmount = Math.floor(Math.random() * 151) + 250;
        tier = 'common';
      }

      // Deduct cost first
      await updatePoints(-effectiveCost, 'Opened Mystery Loot Box 🎁', 'spend');
      // Award prize
      const tierTitleMap = {
        jackpot: '💎 MEGA JACKPOT Mystery Box Prize!',
        rare: '🥇 Rare Mystery Box Prize!',
        uncommon: '🥈 Uncommon Mystery Box Prize!',
        common: '🥉 Mystery Box Prize',
      };
      await updatePoints(wonAmount, `${tierTitleMap[tier]} (+${wonAmount} pts)`, 'earn');

      // Update daily opens count in Firestore
      if (uid) {
        const ref = doc(db, 'points', uid);
        await setDoc(ref, {
          mysteryBoxOpens: {
            [today]: currentOpens + 1
          }
        }, { merge: true });
      }

      return { wonAmount, tier };
    } else if (perkType === 'UNLOCK_FEATURE') {
      const featureKey = payload.featureKey;
      const featureName = payload.featureName || featureKey;
      if (!featureKey) throw new Error('Feature key required');
      const existingExpiry = pointsData.featureExpirations?.[featureKey];
      const featureStillActive = pointsData.unlockedFeatures?.[featureKey]
        && (!existingExpiry || new Date(existingExpiry).getTime() > Date.now());
      if (featureStillActive) throw new Error(`${featureName} is already active.`);
      
      // Deduct cost and save feature unlock in firestore
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await updatePoints(-effectiveCost, `Unlocked ${featureName} 🔓 (7 days)`, 'spend');
      if (uid) {
        const ref = doc(db, 'points', uid);
        await setDoc(ref, {
          unlockedFeatures: {
            [featureKey]: true
          },
          featureExpirations: {
            [featureKey]: expiresAt
          }
        }, { merge: true });
      }
      return true;
    }
  };

  /** Helper to unlock feature by key and cost */
  const unlockFeature = async (featureKey, cost, featureName) => {
    return await redeemPerk('UNLOCK_FEATURE', cost, { featureKey, featureName });
  };

  // Check Daily Sign-in bonus once a day — only attempts claim when
  // streak requirements are likely met (claimDailyCheckIn validates them).
  useEffect(() => {
    if (!uid) return;
    const today = getTodayDateString();
    const ref = doc(db, 'points', uid);

    getDoc(ref).then(async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.lastDailyCheckin !== today) {
          // claimDailyCheckIn now validates the 3 requirements internally
          // before awarding points, so this call is safe.
          await claimDailyCheckIn();
        }
      }
    });
  }, [uid]);

  return {
    // Reports
    reports,
    loading,
    error,
    addReport,
    updateReport,
    moveToTrash,
    hardDeleteReport,
    // Trash
    trashItems,
    trashLoading,
    restoreFromTrash,
    permanentDeleteFromTrash,
    emptyTrash,
    restoreAllFromTrash,
    // Bulk
    generateDayReports,
    clearDayReports,
    // Dictionary
    userDictionary,
    dictionaryLoading,
    updateDictionary,
    // Consistency
    streakData,
    streakRequirements,
    weeklyStats,
    dailyGoal,
    updateDailyGoal,
    heatmapData,
    recentPlans,
    excuseDay,
    addStreakFreeze,
    // Points System
    pointsData,
    updatePoints,
    reconcileBlockPoints,
    claimDailyCheckIn,
    redeemPerk,
    unlockFeature,
  };
};
