// A lightweight Promise wrapper for IndexedDB to handle Local-First architecture
const DB_NAME = '24HoursLocalDB';
const DB_VERSION = 1;
const STORE_DATA = 'data';
const STORE_SYNC_QUEUE = 'sync_queue';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_DATA)) {
        db.createObjectStore(STORE_DATA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'syncId' });
      }
    };
  });
}

// Data Store Operations
export async function getLocalItem(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readonly');
    const store = tx.objectStore(STORE_DATA);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllLocalItems(collectionName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readonly');
    const store = tx.objectStore(STORE_DATA);
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result || [];
      resolve(all.filter(item => item._collection === collectionName && !item._deleted));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function setLocalItem(collectionName, item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readwrite');
    const store = tx.objectStore(STORE_DATA);
    const data = { ...item, _collection: collectionName };
    const request = store.put(data);
    request.onsuccess = () => resolve(data);
    request.onerror = () => reject(request.error);
  });
}

// Sync Queue Operations
export async function addToSyncQueue(collectionName, action, item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    const syncItem = {
      syncId: Date.now().toString() + Math.random().toString(36).substring(2),
      collection: collectionName,
      action: action, // 'create', 'update', 'delete'
      data: item,
      timestamp: Date.now()
    };
    const request = store.put(syncItem);
    request.onsuccess = () => resolve(syncItem);
    request.onerror = () => reject(request.error);
  });
}

export async function getSyncQueue() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC_QUEUE, 'readonly');
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function clearSyncQueueItems(syncIds) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_SYNC_QUEUE);
    syncIds.forEach(id => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Helper: Run Action Locally AND Add to Sync Queue
export async function performLocalAction(collectionName, action, item) {
  if (action === 'create' || action === 'update') {
    await setLocalItem(collectionName, item);
  } else if (action === 'delete') {
    await setLocalItem(collectionName, { ...item, _deleted: true });
  }
  await addToSyncQueue(collectionName, action, item);
  
  // Dispatch event for UI updates
  window.dispatchEvent(new Event('syncQueueUpdated'));
}
