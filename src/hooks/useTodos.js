import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { addToSyncQueue, getSyncQueue } from '../utils/localSyncManager';

export function useTodos(userId) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAndMergeTodos = async (snapshotData) => {
    // 1. Get pending changes from our Sync Queue
    const syncQueue = await getSyncQueue();
    const pendingTodos = syncQueue.filter(item => item.collection === 'todos');
    
    // 2. Start with Firestore data
    let merged = [...snapshotData];
    
    // 3. Apply pending changes locally
    pendingTodos.forEach(pending => {
      if (pending.action === 'create') {
        merged.push(pending.data);
      } else if (pending.action === 'update') {
        const idx = merged.findIndex(t => t.id === pending.data.id);
        if (idx !== -1) merged[idx] = { ...merged[idx], ...pending.data };
      } else if (pending.action === 'delete') {
        merged = merged.filter(t => t.id !== pending.data.id);
      }
    });

    // 4. Sort
    merged.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
      if (a.dragIndex !== undefined && b.dragIndex !== undefined) {
        return a.dragIndex - b.dragIndex;
      }
      return timeB - timeA;
    });

    setTodos(merged);
    setLoading(false);
  };

  useEffect(() => {
    if (!userId) {
      setTodos([]);
      setLoading(false);
      return;
    }

    let currentSnapshotData = [];

    const q = query(collection(db, 'todos'), where('uid', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      currentSnapshotData = [];
      snapshot.forEach((docSnap) => {
        currentSnapshotData.push({ id: docSnap.id, ...docSnap.data() });
      });
      fetchAndMergeTodos(currentSnapshotData);
    });

    // Listen for local UI changes so the list updates instantly
    const handleLocalSync = () => fetchAndMergeTodos(currentSnapshotData);
    window.addEventListener('syncQueueUpdated', handleLocalSync);

    return () => {
      unsubscribe();
      window.removeEventListener('syncQueueUpdated', handleLocalSync);
    };
  }, [userId]);

  const addTodo = async (todoData) => {
    if (!userId) return;
    const tempId = 'temp_' + Date.now();
    const newTodo = {
      ...todoData,
      id: tempId,
      uid: userId,
      createdAt: Date.now(), // Use local timestamp for offline
    };
    await addToSyncQueue('todos', 'create', newTodo);
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  const updateTodo = async (id, updates) => {
    if (!userId) return;
    await addToSyncQueue('todos', 'update', { id, ...updates });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };

  const deleteTodo = async (id) => {
    if (!userId) return;
    await addToSyncQueue('todos', 'delete', { id });
    window.dispatchEvent(new Event('syncQueueUpdated'));
  };
  
  const reorderTodos = async (reorderedList) => {
     for (let i = 0; i < reorderedList.length; i++) {
        updateTodo(reorderedList[i].id, { dragIndex: i });
     }
  }

  return { todos, loading, addTodo, updateTodo, deleteTodo, reorderTodos };
}
