import React, { useState, useEffect } from 'react';
import { db, messaging } from '../firebase/firebase';
import { getToken } from 'firebase/messaging';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

export default function NotificationPrompt({ currentUser }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid || !messaging) return;
    
    const checkNotificationStatus = async () => {
      // Check if browser supports notifications
      if (!('Notification' in window)) return;
      
      // If already granted or denied, don't show the soft ask
      if (Notification.permission === 'granted' || Notification.permission === 'denied') return;

      // Check user preferences in Firestore to see if they previously dismissed the soft ask
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.notificationPromptDismissedAt) {
            const dismissedAt = data.notificationPromptDismissedAt.toDate();
            const daysSinceDismissed = (new Date() - dismissedAt) / (1000 * 60 * 60 * 24);
            // Don't ask again if dismissed within the last 30 days
            if (daysSinceDismissed < 30) return;
          }
          // If they already have tokens, maybe they granted on another device but not this one. We can ask.
        }
        setShowPrompt(true);
      } catch (err) {
        console.error("Failed to check notification status", err);
      }
    };

    checkNotificationStatus();
  }, [currentUser]);

  const handleDismiss = async () => {
    setShowPrompt(false);
    if (!currentUser?.uid) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        notificationPromptDismissedAt: new Date()
      });
    } catch (err) {
      console.error("Failed to dismiss prompt", err);
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: 'BAfkqUVQqhxiV2Bt34JRFv_FbGhAAAaGHtvSLzUjzwxm4OeHWXdLxoZzuX1Q0tvogyluVUUCPh1jpF1NQaQBQQY'
        });

        if (token) {
          await updateDoc(doc(db, 'users', currentUser.uid), {
            fcmTokens: arrayUnion(token)
          });
          setShowPrompt(false);
        }
      } else {
        handleDismiss(); // They denied the hard prompt
      }
    } catch (err) {
      console.error("Error enabling notifications", err);
    } finally {
      setLoading(false);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="position-fixed bottom-0 start-0 w-100 p-3" style={{ zIndex: 1060 }}>
      <div className="card shadow-lg border-0 rounded-4 p-3 bg-white mx-auto animate-slide-up" style={{ maxWidth: '500px' }}>
        <div className="d-flex align-items-start gap-3">
          <div className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '48px', height: '48px' }}>
            <i className="bi bi-bell-fill text-primary fs-4"></i>
          </div>
          <div className="flex-grow-1">
            <h6 className="fw-bold mb-1">Stay on Track!</h6>
            <p className="small text-secondary mb-3">Enable notifications so we can remind you before your streak expires and notify you of new rewards.</p>
            <div className="d-flex gap-2">
              <button 
                className="btn btn-primary btn-sm rounded-pill px-4 fw-bold flex-grow-1"
                onClick={handleEnable}
                disabled={loading}
              >
                {loading ? 'Enabling...' : 'Enable Now'}
              </button>
              <button 
                className="btn btn-light btn-sm rounded-pill px-4 fw-bold border text-secondary"
                onClick={handleDismiss}
                disabled={loading}
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
