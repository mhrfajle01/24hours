import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { addToSyncQueue, getSyncQueue } from '../utils/localSyncManager';

export const useSurveys = (uid) => {
  const [surveys, setSurveys] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAndMerge = async (collectionPath, snapshotData, setState, sortField = 'createdAt', desc = false) => {
    const syncQueue = await getSyncQueue();
    const pendingItems = syncQueue.filter(item => item.collection === collectionPath);
    
    let merged = [...snapshotData];
    
    pendingItems.forEach(pending => {
      if (pending.action === 'create') {
        merged.push(pending.data);
      } else if (pending.action === 'update') {
        const idx = merged.findIndex(i => i.id === pending.data.id);
        if (idx !== -1) merged[idx] = { ...merged[idx], ...pending.data };
      } else if (pending.action === 'delete') {
        merged = merged.filter(i => i.id !== pending.data.id);
      }
    });

    merged.sort((a, b) => {
      const timeA = a[sortField]?.toMillis ? a[sortField].toMillis() : (a[sortField] || 0);
      const timeB = b[sortField]?.toMillis ? b[sortField].toMillis() : (b[sortField] || 0);
      return desc ? timeB - timeA : timeA - timeB;
    });

    setState(merged);
  };

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    
    let currentSurveys = [];
    const surveysPath = `surveys/${uid}/userSurveys`;
    const q1 = query(collection(db, surveysPath));
    const unsub1 = onSnapshot(q1, (snap) => {
      currentSurveys = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      fetchAndMerge(surveysPath, currentSurveys, setSurveys);
      setLoading(false);
    }, () => setLoading(false));

    let currentResults = [];
    const resultsPath = `surveys/${uid}/results`;
    const q2 = query(collection(db, resultsPath), orderBy('completedAt', 'desc'), limit(100));
    const unsub2 = onSnapshot(q2, (snap) => {
      currentResults = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      fetchAndMerge(resultsPath, currentResults, setResults, 'completedAt', true);
    });

    const handleLocalSync = () => {
      fetchAndMerge(surveysPath, currentSurveys, setSurveys);
      fetchAndMerge(resultsPath, currentResults, setResults, 'completedAt', true);
    };
    window.addEventListener('syncQueueUpdated', handleLocalSync);

    return () => {
      unsub1();
      unsub2();
      window.removeEventListener('syncQueueUpdated', handleLocalSync);
    };
  }, [uid]);

  const createSurvey = async (data) => {
    if (!uid) return;
    const tempId = 'temp_' + Date.now();
    await addToSyncQueue(`surveys/${uid}/userSurveys`, 'create', {
      ...data,
      id: tempId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    window.dispatchEvent(new Event('syncQueueUpdated'));
    return { id: tempId };
  };

  const updateSurvey = async (surveyId, data) => {
    if (!uid) return;
    await addToSyncQueue(`surveys/${uid}/userSurveys`, 'update', {
      ...data,
      id: surveyId,
      updatedAt: Date.now()
    });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  const deleteSurvey = async (surveyId) => {
    if (!uid) return;
    // We add a delete operation for the survey
    await addToSyncQueue(`surveys/${uid}/userSurveys`, 'delete', { id: surveyId });
    // Note: Local first deletion of nested results by surveyId is complex without fetching all.
    // We rely on the backend/Firestore rules or cloud functions to cascade delete in a real app,
    // or just leave orphaned results.
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  const submitResult = async (resultData) => {
    if (!uid) return;
    const tempId = 'temp_' + Date.now();
    await addToSyncQueue(`surveys/${uid}/results`, 'create', {
      ...resultData,
      id: tempId,
      completedAt: Date.now()
    });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  return { surveys, results, loading, createSurvey, updateSurvey, deleteSurvey, submitResult };
};
