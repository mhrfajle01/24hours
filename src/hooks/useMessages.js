import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, arrayUnion, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const useMessages = (uid, isAdmin = false, currentUser = null) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let q;
    if (isAdmin) {
      // Admins see all feedback sent to 'admin', plus global notices
      q = query(
        collection(db, 'messages'),
        where('receiverId', 'in', ['admin', 'all'])
      );
    } else {
      // Regular users see direct messages to them AND global messages
      q = query(
        collection(db, 'messages'),
        where('receiverId', 'in', [uid, 'all'])
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      
      // Sort: pinned first, then by createdAt descending (newest first)
      fetched.sort((a, b) => {
        const pinnedA = a.pinned ? 1 : 0;
        const pinnedB = b.pinned ? 1 : 0;
        if (pinnedA !== pinnedB) return pinnedB - pinnedA;
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });
      
      setMessages(fetched);
      setLoading(false);
    }, (err) => {
      console.error('Firestore messages error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid, isAdmin]);

  const sendMessage = async ({ type, content, receiverId, title = '', threadId = null, replyToName = '' }) => {
    if (!uid) throw new Error('Authentication required');
    await addDoc(collection(db, 'messages'), {
      type, // 'feedback', 'global_notice', 'direct_notice', 'bug_report'
      content,
      title,
      senderId: uid,
      receiverId,
      readBy: [],
      // Sender identity — baked into the document at write-time
      senderName: currentUser?.displayName || 'Anonymous',
      senderEmail: currentUser?.email || '',
      senderPhoto: currentUser?.photoURL || '',
      // Threading support
      threadId: threadId || null,
      replyToName: replyToName || '',
      // New fields
      pinned: false,
      editedAt: null,
      createdAt: serverTimestamp(),
    });

    // Option 2: Auto-send push notification for admin notices
    if (isAdmin && (type === 'global_notice' || type === 'direct_notice')) {
      try {
        const pushUtils = await import('../utils/pushNotifications');
        const notifTitle = type === 'global_notice'
          ? '📢 Announcement'
          : `📬 Message from ${currentUser?.displayName || 'Admin'}`;
        const notifBody = content.length > 120 ? content.substring(0, 120) + '...' : content;

        if (type === 'global_notice' || receiverId === 'all') {
          await pushUtils.sendPushToAllUsers(notifTitle, notifBody, { type: 'message_center' });
        } else if (receiverId && receiverId !== 'admin') {
          await pushUtils.sendPushToUser(receiverId, notifTitle, notifBody, { type: 'message_center' });
        }
      } catch (pushErr) {
        console.warn('Auto push notification failed (non-critical):', pushErr);
      }
    }
  };


  const markAsRead = async (messageId) => {
    if (!uid) return;
    await updateDoc(doc(db, 'messages', messageId), {
      readBy: arrayUnion(uid)
    });
  };

  const deleteMessage = async (messageId) => {
    if (!uid) return;
    await deleteDoc(doc(db, 'messages', messageId));
  };

  // --- New Additive Functions ---

  const editMessage = async (messageId, newContent) => {
    if (!uid) return;
    await updateDoc(doc(db, 'messages', messageId), {
      content: newContent,
      editedAt: serverTimestamp(),
    });
  };

  const togglePin = async (messageId, currentPinned) => {
    if (!uid) return;
    await updateDoc(doc(db, 'messages', messageId), {
      pinned: !currentPinned,
    });
  };

  const bulkMarkAsRead = async (messageIds) => {
    if (!uid || !messageIds.length) return;
    const batch = writeBatch(db);
    messageIds.forEach((id) => {
      batch.update(doc(db, 'messages', id), { readBy: arrayUnion(uid) });
    });
    await batch.commit();
  };

  const bulkDelete = async (messageIds) => {
    if (!uid || !messageIds.length) return;
    const batch = writeBatch(db);
    messageIds.forEach((id) => {
      batch.delete(doc(db, 'messages', id));
    });
    await batch.commit();
  };

  return {
    messages,
    loading,
    sendMessage,
    markAsRead,
    deleteMessage,
    editMessage,
    togglePin,
    bulkMarkAsRead,
    bulkDelete,
  };
};
