import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const useCustomFeatures = () => {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'custom_features'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFeatures(fetched);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching custom features:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addFeature = async (feature) => {
    await addDoc(collection(db, 'custom_features'), {
      ...feature,
      isActive: true,
      createdAt: serverTimestamp(),
    });
  };

  const updateFeature = async (id, data) => {
    await updateDoc(doc(db, 'custom_features', id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  };

  const deleteFeature = async (id) => {
    await deleteDoc(doc(db, 'custom_features', id));
  };

  return { features, loading, addFeature, updateFeature, deleteFeature };
};
