import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, arrayUnion
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
    if (!uid) return;
    await deleteDoc(doc(db, 'messages', messageId));
  };

  return {
    messages,
    loading,
    sendMessage,
    markAsRead,
    deleteMessage,
  };
};
