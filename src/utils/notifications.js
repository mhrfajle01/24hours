import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db, messaging } from '../firebase/firebase';

const VAPID_KEY = 'BAfkqUVQqhxiV2Bt34JRFv_FbGhAAAaGHtvSLzUjzwxm4OeHWXdLxoZzuX1Q0tvogyluVUUCPh1jpF1NQaQBQQY';

export const requestNotificationPermission = async (userId) => {
  if (!messaging) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token && userId) {
        // Save token to Firestore
        await setDoc(doc(db, 'users', userId), { fcmToken: token }, { merge: true });
        console.log('FCM Token saved successfully:', token);
      }
    } else {
      console.log('Notification permission denied.');
    }
  } catch (error) {
    console.error('An error occurred while retrieving token:', error);
  }
};

export const onForegroundMessage = (callback) => {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    console.log('Foreground message received:', payload);
    callback(payload);
  });
};

export const sendLocalNotification = (title, body) => {
  if (Notification.permission === 'granted') {
    if (localStorage.getItem('notifications_muted') === 'true') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, { body, icon: '/logo192.png' });
      }).catch((err) => {
        console.error('Service worker not ready for notification:', err);
        // Fallback for some non-mobile browsers where new Notification still works
        try {
          new Notification(title, { body, icon: '/logo192.png' });
        } catch (e) {
          console.error('Notification fallback failed:', e);
        }
      });
    } else {
      try {
        new Notification(title, { body, icon: '/logo192.png' });
      } catch (e) {
        console.error('Notification constructor failed:', e);
      }
    }
  }
};
