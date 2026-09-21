import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, limit, getDocs, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const useSurveys = (uid) => {
  const [surveys, setSurveys] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const q = query(collection(db, 'surveys', uid, 'userSurveys'));
    const unsub = onSnapshot(q, (snap) => {
      setSurveys(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'surveys', uid, 'results'), orderBy('completedAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [uid]);

  const createSurvey = async (data) => {
    if (!uid) return;
    return addDoc(collection(db, 'surveys', uid, 'userSurveys'), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  };

  const updateSurvey = async (surveyId, data) => {
    if (!uid) return;
    return updateDoc(doc(db, 'surveys', uid, 'userSurveys', surveyId), {
      ...data,
      updatedAt: serverTimestamp()
    });
  };

  const deleteSurvey = async (surveyId) => {
    if (!uid) return;
    
    const resultsQ = query(collection(db, 'surveys', uid, 'results'), where('surveyId', '==', surveyId));
    const resultsSnap = await getDocs(resultsQ);
    
    const batch = writeBatch(db);
    batch.delete(doc(db, 'surveys', uid, 'userSurveys', surveyId));
    resultsSnap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    
    return batch.commit();
  };

  const submitResult = async (resultData) => {
    if (!uid) return;
    return addDoc(collection(db, 'surveys', uid, 'results'), {
      ...resultData,
      completedAt: serverTimestamp()
    });
  };

  return { surveys, results, loading, createSurvey, updateSurvey, deleteSurvey, submitResult };
};
