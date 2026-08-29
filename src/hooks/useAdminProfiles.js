import { useState, useEffect } from 'react';
import { collection, doc, getDocs, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const useAdminProfiles = (isAdmin, uid) => {
  const [adminProfiles, setAdminProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all admin profiles (realtime so users see updates instantly)
  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'adminProfiles'), (snapshot) => {
      const profiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAdminProfiles(profiles);
      setLoading(false);
    }, (err) => {
      console.error("Failed to fetch admin profiles:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Update the current admin's profile
  const updateMyAdminProfile = async (profileData) => {
    if (!isAdmin || !uid) throw new Error("Unauthorized");
    
    await setDoc(doc(db, 'adminProfiles', uid), {
      ...profileData,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  };

  return {
    adminProfiles,
    loading,
    updateMyAdminProfile
  };
};
