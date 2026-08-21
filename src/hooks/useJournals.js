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
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

/**
 * useJournals — Real-time hook for managing user journal entries.
 * Scoped by authenticated user's uid.
 */
export const useJournals = (uid) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Fetch entries, without orderBy to avoid composite index requirement
    const q = query(
      collection(db, 'journals'),
      where('uid', '==', uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort in memory by date descending, then by createdAt descending
        fetched.sort((a, b) => {
          if (b.date !== a.date) return b.date.localeCompare(a.date);
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeB - timeA;
        });
        setEntries(fetched);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore journals error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  const addJournalEntry = async (entryData) => {
    if (!uid) throw new Error('Authentication required');
    const ref = await addDoc(collection(db, 'journals'), {
      ...entryData,
      uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  };

  const updateJournalEntry = async (id, updatedData) => {
    if (!uid) throw new Error('Authentication required');
    await updateDoc(doc(db, 'journals', id), {
      ...updatedData,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteJournalEntry = async (id) => {
    if (!uid) throw new Error('Authentication required');
    await deleteDoc(doc(db, 'journals', id));
  };

  return {
    entries,
    loading,
    error,
    addJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
  };
};
