import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSyncQueue, clearSyncQueueItems } from '../utils/localSyncManager';
import { db } from '../firebase/firebase';
import { writeBatch, doc, serverTimestamp } from 'firebase/firestore';

export default function SyncButton({ uid }) {
  const [queue, setQueue] = useState([]);
  const [syncState, setSyncState] = useState('idle'); // 'idle', 'syncing', 'success'

  const checkQueue = async () => {
    const items = await getSyncQueue();
    setQueue(items);
  };

  useEffect(() => {
    checkQueue();
    window.addEventListener('syncQueueUpdated', checkQueue);
    return () => window.removeEventListener('syncQueueUpdated', checkQueue);
  }, []);

  const handleSync = async () => {
    if (queue.length === 0 || !uid) return;
    setSyncState('syncing');

    try {
      const batch = writeBatch(db);
      
      queue.forEach(item => {
        const ref = doc(db, item.collection, item.data.id);
        if (item.action === 'create' || item.action === 'update') {
          const { _collection, _deleted, ...cleanData } = item.data;
          batch.set(ref, { 
            ...cleanData, 
            uid, 
            updatedAt: serverTimestamp() 
          }, { merge: true });
        } else if (item.action === 'delete') {
          batch.delete(ref);
        }
      });

      await batch.commit();
      await clearSyncQueueItems(queue.map(q => q.syncId));
      
      // Delay success slightly for the dramatic animation
      setTimeout(() => {
        setSyncState('success');
        setTimeout(() => {
          setSyncState('idle');
          checkQueue();
        }, 3000);
      }, 2500);

    } catch (error) {
      console.error('Sync failed:', error);
      setSyncState('idle');
    }
  };

  if (queue.length === 0 && syncState === 'idle') {
    return (
      <div className="w-100 py-3 rounded-4 bg-light text-center border text-secondary small fw-bold">
        <i className="bi bi-cloud-check me-2" /> All data is synced to cloud.
      </div>
    );
  }

  return (
    <div className="w-100 d-flex flex-column align-items-center justify-content-center p-4 rounded-4 shadow-sm" style={{ backgroundColor: '#1a1a2e', color: 'white', minHeight: '180px', position: 'relative', overflow: 'hidden' }}>
      
      {/* Background magical rays */}
      <AnimatePresence>
        {(syncState === 'syncing' || syncState === 'success') && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            style={{
              position: 'absolute',
              width: '400px',
              height: '400px',
              background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255, 215, 0, 0.4) 60deg, transparent 120deg, rgba(255, 215, 0, 0.4) 180deg, transparent 240deg, rgba(255, 215, 0, 0.4) 300deg, transparent 360deg)',
              borderRadius: '50%',
              zIndex: 0
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {syncState === 'idle' && (
          <motion.div 
            key="idle"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0, filter: 'blur(10px)' }}
            className="text-center z-1"
          >
            <div className="mb-2" style={{ fontSize: '3rem', filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))' }}>📦</div>
            <h6 className="fw-bold mb-1">Unsynced Changes ({queue.length})</h6>
            <p className="small text-white-50 mb-3">Your local changes are waiting to be backed up.</p>
            <button
              onClick={handleSync}
              className="btn fw-bold px-4 rounded-pill border-0 shadow-lg"
              style={{ background: 'linear-gradient(45deg, #FFD700, #FFA500)', color: '#000' }}
            >
              <i className="bi bi-magic me-2"/> Sync & Unlock
            </button>
          </motion.div>
        )}

        {syncState === 'syncing' && (
          <motion.div
            key="syncing"
            className="text-center z-1"
          >
            {/* The Shaking Box */}
            <motion.div
              animate={{ 
                x: [-5, 5, -5, 5, -2, 2, 0],
                y: [0, -10, 0, -10, 0],
                rotate: [-5, 5, -5, 5, 0]
              }}
              transition={{ repeat: Infinity, duration: 0.5 }}
              style={{ fontSize: '4rem', filter: 'drop-shadow(0 0 20px #FFD700)' }}
            >
              🎁
            </motion.div>
            
            {/* Flying particles */}
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ y: 20, x: 0, opacity: 0, scale: 0 }}
                animate={{ 
                  y: -100, 
                  x: (Math.random() - 0.5) * 100,
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0]
                }}
                transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                style={{
                  position: 'absolute',
                  width: '10px', height: '10px',
                  background: '#00ffcc',
                  borderRadius: '50%',
                  boxShadow: '0 0 10px #00ffcc',
                  left: '50%',
                  bottom: '30%'
                }}
              />
            ))}
            
            <motion.div 
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="mt-3 fw-bold text-warning"
              style={{ letterSpacing: '2px' }}
            >
              EXTRACTING DATA...
            </motion.div>
          </motion.div>
        )}

        {syncState === 'success' && (
          <motion.div
            key="success"
            initial={{ scale: 0 }}
            animate={{ scale: [1.5, 1], rotate: [0, 15, -15, 0] }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', bounce: 0.6 }}
            className="text-center z-1"
          >
            <div style={{ fontSize: '4rem', filter: 'drop-shadow(0 0 20px #00ffcc)' }}>
              💎
            </div>
            <motion.h4 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="fw-bold mt-2 text-white"
              style={{ textShadow: '0 0 10px #00ffcc' }}
            >
              SYNC SUCCESS!
            </motion.h4>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
