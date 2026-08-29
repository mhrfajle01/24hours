import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

export const useMessages = (uid, isAdmin = false) => {
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
      // Admins see all feedback sent to 'admin', plus they can see their own sent global notices if we wanted, 
      // but let's just fetch messages where receiverId is 'admin' (user feedback)
      // AND maybe global notices so they can see what they sent.
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
      
      // Sort by createdAt descending (newest first)
      fetched.sort((a, b) => {
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

  const sendMessage = async ({ type, content, receiverId, title = '' }) => {
    if (!uid) throw new Error('Authentication required');
    await addDoc(collection(db, 'messages'), {
      type, // 'feedback', 'global_notice', 'direct_notice'
      content,
      title,
      senderId: uid,
      receiverId,
      readBy: [],
      createdAt: serverTimestamp(),
    });
  };

  const markAsRead = async (messageId) => {
    if (!uid) return;
    await updateDoc(doc(db, 'messages', messageId), {
      readBy: arrayUnion(uid)
    });
  };

  const deleteMessage = async (messageId) => {
    // Only admins should delete global notices, but users could hide them.
    // For simplicity, we just mark as read. If needed, we can implement actual deletion.
  };

  return {
    messages,
    loading,
    sendMessage,
    markAsRead
  };
};
