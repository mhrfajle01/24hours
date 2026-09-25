import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { addToSyncQueue, getSyncQueue } from '../utils/localSyncManager';

/**
 * useJournals — Real-time hook for managing user journal entries.
 * Scoped by authenticated user's uid.
 */
export const useJournals = (uid) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAndMergeJournals = async (snapshotData) => {
    const syncQueue = await getSyncQueue();
    const pendingJournals = syncQueue.filter(item => item.collection === 'journals');
    
    let merged = [...snapshotData];
    
    pendingJournals.forEach(pending => {
      if (pending.action === 'create') {
        merged.push(pending.data);
      } else if (pending.action === 'update') {
        const idx = merged.findIndex(j => j.id === pending.data.id);
        if (idx !== -1) merged[idx] = { ...merged[idx], ...pending.data };
      } else if (pending.action === 'delete') {
        merged = merged.filter(j => j.id !== pending.data.id);
      }
    });

    merged.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
      return timeB - timeA;
    });

    setEntries(merged);
    setLoading(false);
  };

  useEffect(() => {
    if (!uid) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    let currentSnapshotData = [];

    const q = query(
      collection(db, 'journals'),
      where('uid', '==', uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        currentSnapshotData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        fetchAndMergeJournals(currentSnapshotData);
      },
      (err) => {
        console.error('Firestore journals error:', err);
        setError(err);
        setLoading(false);
      }
    );

    const handleLocalSync = () => fetchAndMergeJournals(currentSnapshotData);
    window.addEventListener('syncQueueUpdated', handleLocalSync);

    return () => {
      unsubscribe();
      window.removeEventListener('syncQueueUpdated', handleLocalSync);
    };
  }, [uid]);

  const addJournalEntry = async (entryData) => {
    if (!uid) throw new Error('Authentication required');
    const tempId = 'temp_' + Date.now();
    const newJournal = {
      ...entryData,
      id: tempId,
      uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await addToSyncQueue('journals', 'create', newJournal);
    window.dispatchEvent(new Event('syncQueueUpdated'));
    return tempId;
  };

  const updateJournalEntry = async (id, updatedData) => {
    if (!uid) throw new Error('Authentication required');
    await addToSyncQueue('journals', 'update', { 
      id, 
      ...updatedData,
      updatedAt: Date.now()
    });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  const deleteJournalEntry = async (id) => {
    if (!uid) throw new Error('Authentication required');
    await addToSyncQueue('journals', 'delete', { id });
    window.dispatchEvent(new Event('syncQueueUpdated'));
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
