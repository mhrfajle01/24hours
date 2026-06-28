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
import { sortReports, getDayHoursList } from '../utils/helpers';

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
    const existingKeys = new Set(
      snap.docs.map((d) => {
        const { hour, ampm } = d.data();
        return `${hour}-${ampm}`;
      })
    );

    const dayHours = getDayHoursList();
    const batch = writeBatch(db);
    const reportsCol = collection(db, 'reports');
    const newIds = [];

    dayHours.forEach(({ hour, ampm }) => {
      if (!existingKeys.has(`${hour}-${ampm}`)) {
        const ref = doc(reportsCol);
        batch.set(ref, {
          uid,
          date,
          hour,
          ampm,
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
  };
};
