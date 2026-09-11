import { useState, useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging, db } from '../firebase/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';

export const useNotifications = (user) => {
  const [permission, setPermission] = useState(Notification.permission);
  const [fcmToken, setFcmToken] = useState(null);

  useEffect(() => {
    setPermission(Notification.permission);
  }, []);

  const requestPermission = async () => {
    try {
      const currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
      
      if (currentPermission === 'granted' && messaging) {
        // VAPID key is required to receive push notifications
        // Replace with your actual VAPID key if needed
        const token = await getToken(messaging, {
          vapidKey: 'BLeW-W3O2h-zW67tO5iQkF_2h_Y5pUXX-zP4q7162rF1T1pYqM8J_xUjF2K_iG9wK4-VfP9QjW_N_U_9XQ_L_oI' // Placeholder or use your actual key
        });
        
        setFcmToken(token);
        
        if (user && user.uid && token) {
          // Store token in Firestore
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(token)
          }).catch(console.error); // might fail if users doc doesn't exist, handle appropriately
        }
        
        return token;
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
    return null;
  };

  useEffect(() => {
    if (!messaging) return;
    
    // Listen for foreground messages
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Message received in foreground: ', payload);
      
      // Custom toast for in-app notification
      const toast = document.createElement('div');
      toast.className = 'position-fixed top-0 start-50 translate-middle-x mt-4 p-3 rounded-4 shadow-lg text-white fw-bold animate-slide-down-toast-container';
      toast.style.background = 'linear-gradient(135deg, #00d4ff, #007bff)';
      toast.style.zIndex = 9999;
      toast.innerHTML = `<div><h5>${payload.notification?.title || 'Notification'}</h5><p class="mb-0">${payload.notification?.body || ''}</p></div>`;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s';
        setTimeout(() => toast.remove(), 500);
      }, 4000);
    });

    return () => unsubscribe();
  }, []);

  return { permission, requestPermission, fcmToken };
};
