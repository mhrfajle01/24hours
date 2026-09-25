import { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';

export function useProducts(userId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, 'products'),
      where('userId', '==', userId)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in JS to avoid index requirements
      data.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setProducts(data);
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  const addProduct = async (name, emoji) => {
    await addDoc(collection(db, 'products'), {
      userId,
      name,
      emoji,
      startDate: new Date().toISOString(),
      longestStreak: 0,
      status: 'active',
      relapseHistory: [],
      createdAt: serverTimestamp()
    });
  };

  const logRelapse = async (productId, currentProduct, reason, currentStreak) => {
    const newLongest = Math.max(currentProduct.longestStreak || 0, currentStreak);
    const relapseLog = { date: new Date().toISOString(), reason, streak: currentStreak };
    
    await updateDoc(doc(db, 'products', productId), {
      startDate: new Date().toISOString(),
      longestStreak: newLongest,
      relapseHistory: [relapseLog, ...(currentProduct.relapseHistory || [])]
    });
  };

  const destroyProduct = async (productId, currentProduct, reason, currentStreak) => {
    const newLongest = Math.max(currentProduct.longestStreak || 0, currentStreak);
    const relapseLog = { date: new Date().toISOString(), reason, streak: currentStreak, final: true };
    await updateDoc(doc(db, 'products', productId), {
      status: 'destroyed',
      longestStreak: newLongest,
      relapseHistory: [relapseLog, ...(currentProduct.relapseHistory || [])]
    });
  };

  const deleteProduct = async (productId) => {
    await deleteDoc(doc(db, 'products', productId));
  };

  return { products, loading, addProduct, logRelapse, destroyProduct, deleteProduct };
}
