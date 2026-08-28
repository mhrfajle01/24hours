import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, setDoc
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const defaultMilestones = [
  { day: 7, achieved: false },
  { day: 14, achieved: false },
  { day: 21, achieved: false },
  { day: 30, achieved: false },
  { day: 60, achieved: false },
  { day: 90, achieved: false },
  { day: 180, achieved: false },
  { day: 365, achieved: false }
];

/**
 * Utility function to calculate the number of days between the start date and today.
 */
export const getStreakDays = (streak) => {
  if (!streak || !streak.startDate) return 0;
  const [year, month, day] = streak.startDate.split('-');
  const start = new Date(year, month - 1, day);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffTime = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
};

/**
 * useStreaks — Real-time hook for managing user streaks.
 * Scoped by authenticated user's uid.
 */
export const useStreaks = (uid) => {
  const [streaks, setStreaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setStreaks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const q = query(
      collection(db, 'streaks'),
      where('uid', '==', uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        // Dynamically compute currentDays based on startDate
        fetched.forEach(streak => {
          streak.currentDays = getStreakDays(streak);
        });

        // Sort streaks: active first, then by currentDays descending
        fetched.sort((a, b) => {
          if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
          }
          return b.currentDays - a.currentDays;
        });
        
        setStreaks(fetched);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore streaks error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const addStreak = async (streakData) => {
    if (!uid) throw new Error('Authentication required');
    const ref = await addDoc(collection(db, 'streaks'), {
      ...streakData,
      uid,
      currentDays: 0,
      bestStreak: 0,
      totalRelapses: 0,
      isActive: true,
      relapseHistory: [],
      milestones: streakData.milestones || defaultMilestones,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  };

  const updateStreak = async (id, updatedData) => {
    if (!uid) throw new Error('Authentication required');
    await updateDoc(doc(db, 'streaks', id), {
      ...updatedData,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteStreak = async (id) => {
    if (!uid) throw new Error('Authentication required');
    await deleteDoc(doc(db, 'streaks', id));
  };

  const recordRelapse = async (id, trigger, note) => {
    if (!uid) throw new Error('Authentication required');
    
    // We need to fetch the current streak to get its current values
    const streakRef = doc(db, 'streaks', id);
    const streakSnap = await getDoc(streakRef);
    
    if (!streakSnap.exists()) {
      throw new Error('Streak not found');
    }
    
    const streak = streakSnap.data();
    const currentStreakLength = getStreakDays(streak);
    
    const newBestStreak = Math.max(streak.bestStreak || 0, currentStreakLength);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const penalty = 100 + (currentStreakLength * 20);
    
    const newRelapse = {
      date: today,
      trigger: trigger || '',
      note: note || '',
      streakLength: currentStreakLength
    };
    
    // Reset all milestone achieved statuses to false
    const resetMilestones = (streak.milestones || defaultMilestones).map(m => ({
      ...m,
      achieved: false
    }));

    await updateDoc(streakRef, {
      totalRelapses: (streak.totalRelapses || 0) + 1,
      startDate: today,
      bestStreak: newBestStreak,
      relapseHistory: [...(streak.relapseHistory || []), newRelapse],
      milestones: resetMilestones,
      updatedAt: serverTimestamp(),
    });

    if (currentStreakLength > 0) {
      const pointsRef = doc(db, 'points', uid);
      const pointsSnap = await getDoc(pointsRef);
      const pointsData = pointsSnap.exists() ? pointsSnap.data() : { points: 0, history: [] };
      const penaltyRecord = {
        id: `pts_${Date.now()}`,
        title: `💔 Habit Streak Relapse Penalty (${currentStreakLength} days lost, -${penalty} pts)`,
        amount: penalty,
        date: new Date().toISOString(),
        type: 'spend',
      };
      await setDoc(pointsRef, {
        points: Math.max(0, (pointsData.points || 0) - penalty),
        history: [penaltyRecord, ...(pointsData.history || [])].slice(0, 50),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  };

  return {
    streaks,
    loading,
    error,
    addStreak,
    updateStreak,
    deleteStreak,
    recordRelapse,
  };
};
