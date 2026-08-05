import { useState, useEffect } from 'react';
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
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { sortReports, getDayHoursList, get24Hour, getIntervalTimes, timeToMinutes, getTodayDateString } from '../utils/helpers';

/** Returns YYYY-MM-DD for N days ago */
const getDateNDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** Returns weekday name for a YYYY-MM-DD string */
const getWeekdayName = (dateStr) => {
  const parts = dateStr.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
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
    setLoading(true);
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
      const curStr = cur.toISOString().slice(0, 10);
      if (curStr >= toDate) break;
      if (!excusedDays.includes(curStr)) missing.push(curStr);
    }
    return missing;
  };

  // ─── Streak ───────────────────────────────────────────────────────────
  const [streakData, setStreakData] = useState({ currentStreak: 0, longestStreak: 0, lastActiveDate: null, streakFreezes: 1, excusedDays: [] });

  const refreshStreak = async () => {
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
    const todayHasCompleted = todaySnap.docs.some((d) => d.data().status === 'Completed');

    const missingDays = getMissingDaysBetween(lastActiveDate, today, excusedDays);
    const neededFreezes = missingDays.length;

    if (todayHasCompleted) {
      if (lastActiveDate !== today) {
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

        // Award streak bonus points based on streak count (20 pts per streak day)
        const streakBonus = currentStreak * 20;
        updatePoints(streakBonus, `🔥 Day ${currentStreak} Streak Bonus (+${streakBonus} pts)`, 'earn');
        await setDoc(ref, { currentStreak, longestStreak, lastActiveDate, streakFreezes, excusedDays, lastBonusStreakDay: currentStreak, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        // Backfill: If active today, and lastBonusStreakDay hasn't awarded for this streak count yet
        if (existing.lastBonusStreakDay !== currentStreak && currentStreak > 0) {
          const streakBonus = currentStreak * 20;
          updatePoints(streakBonus, `🔥 Day ${currentStreak} Streak Bonus Adjustment (+${streakBonus} pts)`, 'earn');
          await setDoc(ref, { lastBonusStreakDay: currentStreak, updatedAt: serverTimestamp() }, { merge: true });
        }
      }
    } else {
      // No completions today — check if gap already exceeded
      if (neededFreezes > streakFreezes && currentStreak > 0) {
        // Calculate penalty based on lost streak count (20 pts per streak day lost)
        const penalty = currentStreak * 20;
        updatePoints(-penalty, `💔 Streak Broken Penalty (${currentStreak} day streak lost, -${penalty} pts)`, 'spend');

        currentStreak = 0;
        await setDoc(ref, { currentStreak, lastBonusStreakDay: 0, updatedAt: serverTimestamp() }, { merge: true });
      } else if (existing.lastBonusStreakDay !== currentStreak && currentStreak > 0) {
        // Backfill for active current streak if not yet awarded
        const streakBonus = currentStreak * 20;
        updatePoints(streakBonus, `🔥 Day ${currentStreak} Streak Bonus Adjustment (+${streakBonus} pts)`, 'earn');
        await setDoc(ref, { lastBonusStreakDay: currentStreak, updatedAt: serverTimestamp() }, { merge: true });
      }
    }
    setStreakData({ currentStreak, longestStreak, lastActiveDate, streakFreezes, excusedDays });
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

  useEffect(() => {
    if (!uid) {
      setHeatmapData({});
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
        snap.docs.forEach((d) => {
          const data = d.data();
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
      },
      (err) => {
        console.error('Firestore heatmap data error:', err);
      }
    );
    return () => unsub();
  }, [uid]);

// Duplicate daily goal block removed – keep the earlier declaration above

  // ─── Points System & Feature Unlocks ──────────────────────────────
  const [pointsData, setPointsData] = useState({ points: 0, history: [], unlockedFeatures: {}, mysteryBoxOpens: {} });

  useEffect(() => {
    if (!uid) {
      setPointsData({ points: 0, history: [], unlockedFeatures: {}, mysteryBoxOpens: {} });
      return;
    }
    const ref = doc(db, 'points', uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPointsData({
          points: data.points || 0,
          history: data.history || [],
          unlockedFeatures: data.unlockedFeatures || {},
          mysteryBoxOpens: data.mysteryBoxOpens || {},
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
          mysteryBoxOpens: {},
          lastDailyCheckin: getTodayDateString()
        };
        setDoc(ref, { ...initPoints, updatedAt: serverTimestamp() });
        setPointsData({ points: 20, history: initPoints.history, unlockedFeatures: {}, mysteryBoxOpens: {} });
      }
    });

    return () => unsub();
  }, [uid]);

  /** Add or remove points with history record */
  const updatePoints = async (amount, title, type = 'earn', extraFields = {}) => {
    if (!uid) return false;
    const ref = doc(db, 'points', uid);
    const snap = await getDoc(ref);
    const current = snap.exists() ? snap.data() : { points: 0, history: [] };

    const newPoints = Math.max(0, (current.points || 0) + amount);
    const newRecord = {
      id: 'pts_' + Date.now(),
      title,
      amount,
      date: new Date().toISOString(),
      type, // 'earn' | 'spend'
    };

    const newHistory = [newRecord, ...(current.history || [])].slice(0, 50); // keep last 50 entries

    await setDoc(ref, {
      points: newPoints,
      history: newHistory,
      updatedAt: serverTimestamp(),
      ...extraFields
    }, { merge: true });

    return true;
  };

  /** Redeem points for Streak Freeze, Excusing a missed day, or Mystery Box */
  const redeemPerk = async (perkType, cost, payload = {}) => {
    if (pointsData.points < cost) {
      throw new Error(`Insufficient points! You need ${cost} pts.`);
    }

    if (perkType === 'STREAK_FREEZE') {
      await addStreakFreeze();
      await updatePoints(-cost, 'Purchased Streak Freeze', 'spend');
    } else if (perkType === 'EXCUSE_DAY') {
      if (!payload.date) throw new Error('Date required to excuse missed day');
      await excuseDay(payload.date);
      await updatePoints(-cost, `Excused missed day (${payload.date})`, 'spend');
    } else if (perkType === 'MYSTERY_BOX') {
      const today = getTodayDateString();
      const currentOpens = pointsData.mysteryBoxOpens?.[today] || 0;
      if (currentOpens >= 3) {
        throw new Error('Daily limit reached! You can open Mystery Box only 3 times per day.');
      }

      // Calculate Mystery Box outcome based on weighted probabilities
      // 50% Common (20-45), 35% Uncommon (50-90), 12% Rare (100-150), 3% Mega Jackpot (200)
      const rand = Math.random() * 100;
      let wonAmount = 20;
      let tier = 'common'; // 'common' | 'uncommon' | 'rare' | 'jackpot'

      if (rand < 3) {
        // 3% chance for 200 pts Jackpot
        wonAmount = 200;
        tier = 'jackpot';
      } else if (rand < 15) {
        // 12% chance for 100 - 150 pts Rare
        wonAmount = Math.floor(Math.random() * 51) + 100;
        tier = 'rare';
      } else if (rand < 50) {
        // 35% chance for 50 - 90 pts Uncommon
        wonAmount = Math.floor(Math.random() * 41) + 50;
        tier = 'uncommon';
      } else {
        // 50% chance for 20 - 45 pts Common
        wonAmount = Math.floor(Math.random() * 26) + 20;
        tier = 'common';
      }

      // Deduct cost first
      await updatePoints(-cost, 'Opened Mystery Loot Box 🎁', 'spend');
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
      
      // Deduct cost and save feature unlock in firestore
      await updatePoints(-cost, `Unlocked ${featureName} 🔓`, 'spend');
      if (uid) {
        const ref = doc(db, 'points', uid);
        await setDoc(ref, {
          unlockedFeatures: {
            [featureKey]: true
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

  // Check Daily Sign-in bonus once a day
  useEffect(() => {
    if (!uid) return;
    const today = getTodayDateString();
    const ref = doc(db, 'points', uid);

    getDoc(ref).then(async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.lastDailyCheckin !== today) {
          await updatePoints(20, `Daily Check-in (${today})`, 'earn', { lastDailyCheckin: today });
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
    weeklyStats,
    dailyGoal,
    updateDailyGoal,
    heatmapData,
    excuseDay,
    addStreakFreeze,
    // Points System
    pointsData,
    updatePoints,
    redeemPerk,
    unlockFeature,
  };
};
