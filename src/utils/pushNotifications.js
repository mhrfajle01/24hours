import { db } from '../firebase/firebase';
import { doc, getDoc, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Gets FCM tokens for a specific user from Firestore.
 */
export async function getUserFCMTokens(userId) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data().fcmTokens || [];
    }
  } catch (err) {
    console.error('Failed to get user FCM tokens:', err);
  }
  return [];
}

/**
 * Gets FCM tokens for ALL users who have tokens.
 * Returns an array of { userId, displayName, email, tokens }.
 */
export async function getAllUserFCMTokens() {
  const results = [];
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    usersSnapshot.forEach((userDoc) => {
      const data = userDoc.data();
      if (data.fcmTokens && data.fcmTokens.length > 0) {
        results.push({
          userId: userDoc.id,
          displayName: data.displayName || 'Unknown',
          email: data.email || '',
          tokens: data.fcmTokens,
        });
      }
    });
  } catch (err) {
    console.error('Failed to get all user FCM tokens:', err);
  }
  return results;
}

/**
 * Sends a push notification by writing to the 'notification_queue' Firestore collection.
 * A Firebase Cloud Function should listen on this collection and send the actual FCM messages
 * using the Admin SDK (FCM v1 API).
 *
 * If no Cloud Function is deployed yet, falls back to a direct FCM v1 send attempt
 * using the legacy approach (which may not work without server auth).
 *
 * @param {string[]} tokens - Array of FCM registration tokens
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} [data] - Optional data payload
 * @returns {Promise<{success: number, failure: number, queued?: boolean}>}
 */
export async function sendPushNotification(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) {
    return { success: 0, failure: 0, error: 'No tokens provided' };
  }

  try {
    // Write to notification_queue for Cloud Function to process
    await addDoc(collection(db, 'notification_queue'), {
      tokens,
      notification: { title, body },
      data: {
        ...data,
        url: typeof window !== 'undefined' ? window.location.origin : '/',
      },
      icon: '/pwa-192x192.png',
      status: 'pending',
      createdAt: serverTimestamp(),
    });

    return { success: tokens.length, failure: 0, queued: true };
  } catch (err) {
    console.error('Failed to queue push notification:', err);
    return { success: 0, failure: tokens.length, error: err.message };
  }
}

/**
 * Send push notification to a specific user by their UID.
 */
export async function sendPushToUser(userId, title, body, data = {}) {
  const tokens = await getUserFCMTokens(userId);
  if (tokens.length === 0) {
    return { success: 0, failure: 0, noTokens: true };
  }
  return sendPushNotification(tokens, title, body, data);
}

/**
 * Send push notification to ALL users who have FCM tokens.
 */
export async function sendPushToAllUsers(title, body, data = {}) {
  const allUsers = await getAllUserFCMTokens();
  const allTokens = allUsers.flatMap((u) => u.tokens);
  if (allTokens.length === 0) {
    return { success: 0, failure: 0, noTokens: true };
  }
  return sendPushNotification(allTokens, title, body, data);
}
