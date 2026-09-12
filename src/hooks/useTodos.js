import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export function useTodos(userId) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setTodos([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'todos'),
      where('uid', '==', userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const todosData = [];
      snapshot.forEach((docSnap) => {
        todosData.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort by createdAt descending
      todosData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt || 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt || 0);
        // Also order by dragIndex if we have it
        if (a.dragIndex !== undefined && b.dragIndex !== undefined) {
          return a.dragIndex - b.dragIndex;
        }
        return timeB - timeA;
      });
      setTodos(todosData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching todos: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const addTodo = async (todoData) => {
    if (!userId) return;
    try {
      await addDoc(collection(db, 'todos'), {
        ...todoData,
        uid: userId,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Error adding todo: ', e);
    }
  };

  const updateTodo = async (id, updates) => {
    if (!userId) return;
    try {
      await updateDoc(doc(db, 'todos', id), updates);
    } catch (e) {
      console.error('Error updating todo: ', e);
    }
  };

  const deleteTodo = async (id) => {
    if (!userId) return;
    try {
      await deleteDoc(doc(db, 'todos', id));
    } catch (e) {
      console.error('Error deleting todo: ', e);
    }
  };
  
  const reorderTodos = async (reorderedList) => {
     // A simplified bulk update for drag-and-drop order
     for (let i = 0; i < reorderedList.length; i++) {
        updateTodo(reorderedList[i].id, { dragIndex: i });
     }
  }

  return { todos, loading, addTodo, updateTodo, deleteTodo, reorderTodos };
}
