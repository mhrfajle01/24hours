import { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { addToSyncQueue, getSyncQueue } from '../utils/localSyncManager';

export function useProducts(userId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAndMergeProducts = async (snapshotData) => {
    const syncQueue = await getSyncQueue();
    const pendingProducts = syncQueue.filter(item => item.collection === 'products');
    
    let merged = [...snapshotData];
    
    pendingProducts.forEach(pending => {
      if (pending.action === 'create') {
        merged.push(pending.data);
      } else if (pending.action === 'update') {
        const idx = merged.findIndex(t => t.id === pending.data.id);
        if (idx !== -1) merged[idx] = { ...merged[idx], ...pending.data };
      } else if (pending.action === 'delete') {
        merged = merged.filter(t => t.id !== pending.data.id);
      }
    });

    merged.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
      return timeB - timeA;
    });

    setProducts(merged);
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    let currentSnapshotData = [];
    const q = query(
      collection(db, 'products'),
      where('userId', '==', userId)
    );
    const unsub = onSnapshot(q, (snap) => {
      currentSnapshotData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchAndMergeProducts(currentSnapshotData);
    });

    const handleLocalSync = () => fetchAndMergeProducts(currentSnapshotData);
    window.addEventListener('syncQueueUpdated', handleLocalSync);

    return () => {
      unsub();
      window.removeEventListener('syncQueueUpdated', handleLocalSync);
    };
  }, [userId]);

  const addProduct = async (name, emoji, customStartDate) => {
    const tempId = 'temp_' + Date.now();
    await addToSyncQueue('products', 'create', {
      id: tempId,
      userId,
      name,
      emoji,
      startDate: customStartDate ? new Date(customStartDate).toISOString() : new Date().toISOString(),
      longestStreak: 0,
      status: 'active',
      relapseHistory: [],
      createdAt: Date.now()
    });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  const logRelapse = async (productId, currentProduct, reason, currentStreak) => {
    const newLongest = Math.max(currentProduct.longestStreak || 0, currentStreak);
    const relapseLog = { date: new Date().toISOString(), reason, streak: currentStreak };
    
    await addToSyncQueue('products', 'update', {
      id: productId,
      startDate: new Date().toISOString(),
      longestStreak: newLongest,
      relapseHistory: [relapseLog, ...(currentProduct.relapseHistory || [])]
    });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  const destroyProduct = async (productId, currentProduct, reason, currentStreak) => {
    const newLongest = Math.max(currentProduct.longestStreak || 0, currentStreak);
    const relapseLog = { date: new Date().toISOString(), reason, streak: currentStreak, final: true };
    await addToSyncQueue('products', 'update', {
      id: productId,
      status: 'destroyed',
      longestStreak: newLongest,
      relapseHistory: [relapseLog, ...(currentProduct.relapseHistory || [])]
    });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  const deleteProduct = async (productId) => {
    await addToSyncQueue('products', 'delete', { id: productId });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  return { products, loading, addProduct, logRelapse, destroyProduct, deleteProduct };
}
