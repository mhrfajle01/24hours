import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSyncQueue, clearSyncQueueItems } from '../utils/localSyncManager';
import { db } from '../firebase/firebase';
import { writeBatch, doc, serverTimestamp } from 'firebase/firestore';

export default function SyncButton({ uid, onSyncComplete }) {
  const [queue, setQueue] = useState([]);
  const [syncState, setSyncState] = useState('idle'); // 'idle', 'syncing', 'success'
  const [syncedCount, setSyncedCount] = useState(0);

  const checkQueue = async () => {
    const items = await getSyncQueue();
    setQueue(items);
  };

  useEffect(() => {
    checkQueue();
    window.addEventListener('syncQueueUpdated', checkQueue);
    return () => window.removeEventListener('syncQueueUpdated', checkQueue);
  }, []);

  const playSound = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      if (type === 'start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      }
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch (e) {}
  };

  const handleSync = async () => {
    if (queue.length === 0 || !uid) return;
    setSyncState('syncing');
    setSyncedCount(0);
    playSound('start');

    try {
      const batch = writeBatch(db);
      const total = queue.length;

      queue.forEach((item, i) => {
        const ref = doc(db, item.collection, item.data.id);
        if (item.action === 'create' || item.action === 'update') {
          const { _collection, _deleted, _localOnly, ...cleanData } = item.data;
          batch.set(ref, {
            ...cleanData,
            uid,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } else if (item.action === 'delete') {
          batch.delete(ref);
        }
        // Staggered count animation
        setTimeout(() => {
          setSyncedCount(i + 1);
          if (i % 2 === 0) playSound('start');
        }, (i + 1) * (2000 / total));
      });

      await batch.commit();
      await clearSyncQueueItems(queue.map(q => q.syncId));

      setTimeout(() => {
        setSyncState('success');
        playSound('success');
        window.dispatchEvent(new Event('syncQueueUpdated'));
        setTimeout(() => {
          setSyncState('idle');
          checkQueue();
          onSyncComplete?.();
        }, 2500);
      }, 2200);

    } catch (error) {
      console.error('Sync failed:', error);
      setSyncState('idle');
    }
  };

  if (queue.length === 0 && syncState === 'idle') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-100 py-4 rounded-4 text-center"
        style={{ background: 'linear-gradient(135deg, #e8f5e9, #f1f8e9)', border: '1px solid #c8e6c9' }}
      >
        <div style={{ fontSize: '2.2rem' }}>☁️✅</div>
        <div className="fw-bold text-success mt-1">All data is synced!</div>
        <div className="text-muted small mt-1">Everything is safe in the cloud.</div>
      </motion.div>
    );
  }

  return (
    <div
      className="w-100 d-flex flex-column align-items-center justify-content-center rounded-4 shadow"
      style={{
        background: 'linear-gradient(145deg, #0d0d2b 0%, #1a1a3e 50%, #0d0d2b 100%)',
        color: 'white',
        minHeight: '220px',
        position: 'relative',
        overflow: 'hidden',
        padding: '2rem 1rem'
      }}
    >
      {/* Starfield background */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={`star-${i}`}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ repeat: Infinity, duration: 1.5 + Math.random() * 2, delay: Math.random() * 2 }}
          style={{
            position: 'absolute',
            width: `${2 + Math.random() * 2}px`,
            height: `${2 + Math.random() * 2}px`,
            background: '#fff',
            borderRadius: '50%',
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            zIndex: 0
          }}
        />
      ))}

      {/* Cosmic rays during sync */}
      <AnimatePresence>
        {(syncState === 'syncing' || syncState === 'success') && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6, rotate: 360 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                width: '500px',
                height: '500px',
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(0,255,200,0.25) 30deg, transparent 90deg, rgba(255,215,0,0.25) 150deg, transparent 210deg, rgba(0,150,255,0.25) 270deg, transparent 330deg)',
                borderRadius: '50%',
                zIndex: 0
              }}
            />
            {/* Orbiting particles */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={`orbit-${i}`}
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3 + i * 0.5, ease: 'linear' }}
                style={{
                  position: 'absolute',
                  width: `${120 + i * 30}px`,
                  height: `${120 + i * 30}px`,
                  zIndex: 0
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  width: `${6 + i}px`,
                  height: `${6 + i}px`,
                  background: ['#00ffcc', '#FFD700', '#FF6B6B', '#7B68EE', '#00BFFF', '#FF69B4'][i],
                  borderRadius: '50%',
                  boxShadow: `0 0 12px ${['#00ffcc', '#FFD700', '#FF6B6B', '#7B68EE', '#00BFFF', '#FF69B4'][i]}`,
                  transform: 'translateX(-50%)'
                }} />
              </motion.div>
            ))}
          </>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {syncState === 'idle' && (
          <motion.div
            key="idle"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0, filter: 'blur(12px)' }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="text-center z-1"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              style={{ fontSize: '3.5rem', filter: 'drop-shadow(0 4px 20px rgba(255,152,0,0.5))' }}
            >
              📦
            </motion.div>
            <h5 className="fw-bold mb-1 mt-2">
              <span className="text-warning">{queue.length}</span> Unsynced Change{queue.length > 1 ? 's' : ''}
            </h5>
            <p className="small mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Your local changes are waiting to be backed up.
            </p>
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(255,215,0,0.5)' }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSync}
              className="btn fw-bold px-4 py-2 rounded-pill border-0 shadow-lg"
              style={{ background: 'linear-gradient(135deg, #FFD700, #FF8C00)', color: '#000', fontSize: '1rem' }}
            >
              <i className="bi bi-cloud-arrow-up-fill me-2" /> Sync Now
            </motion.button>
          </motion.div>
        )}

        {syncState === 'syncing' && (
          <motion.div
            key="syncing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.5, filter: 'blur(20px)' }}
            className="text-center z-1"
          >
            {/* Shaking + glowing box */}
            <motion.div
              animate={{
                x: [-4, 4, -4, 4, -2, 2, 0],
                y: [0, -12, 0, -12, 0],
                rotate: [-3, 3, -3, 3, 0]
              }}
              transition={{ repeat: Infinity, duration: 0.5 }}
              style={{
                fontSize: '4rem',
                filter: 'drop-shadow(0 0 30px #FFD700)',
              }}
            >
              🎁
            </motion.div>

            {/* Flying data particles */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ y: 30, x: 0, opacity: 0, scale: 0 }}
                animate={{
                  y: -120,
                  x: (Math.random() - 0.5) * 140,
                  opacity: [0, 1, 0],
                  scale: [0, 1.2, 0]
                }}
                transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }}
                style={{
                  position: 'absolute',
                  width: `${8 + Math.random() * 6}px`,
                  height: `${8 + Math.random() * 6}px`,
                  background: ['#00ffcc', '#FFD700', '#7B68EE', '#FF6B6B', '#00BFFF', '#FF69B4', '#FFA500', '#32CD32'][i],
                  borderRadius: '50%',
                  boxShadow: `0 0 14px ${['#00ffcc', '#FFD700', '#7B68EE', '#FF6B6B', '#00BFFF', '#FF69B4', '#FFA500', '#32CD32'][i]}`,
                  left: '50%',
                  bottom: '30%'
                }}
              />
            ))}

            {/* Progress counter */}
            <motion.div
              className="mt-3 fw-bold"
              style={{ color: '#00ffcc', fontSize: '1.1rem', letterSpacing: '1px' }}
            >
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                SYNCING
              </motion.span>
              <span className="text-warning ms-2">
                {syncedCount}/{queue.length}
              </span>
            </motion.div>

            {/* Progress bar */}
            <div className="mt-2 mx-auto rounded-pill overflow-hidden" style={{ width: '180px', height: '6px', background: 'rgba(255,255,255,0.15)' }}>
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: `${queue.length > 0 ? (syncedCount / queue.length) * 100 : 0}%` }}
                style={{ height: '100%', background: 'linear-gradient(90deg, #00ffcc, #FFD700)', borderRadius: '99px' }}
              />
            </div>
          </motion.div>
        )}

        {syncState === 'success' && (
          <motion.div
            key="success"
            initial={{ scale: 0 }}
            animate={{ scale: [1.6, 1] }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', bounce: 0.6 }}
            className="text-center z-1"
          >
            {/* Burst rings */}
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={`ring-${i}`}
                initial={{ scale: 0.3, opacity: 0.8 }}
                animate={{ scale: 3 + i, opacity: 0 }}
                transition={{ duration: 1.5, delay: i * 0.2 }}
                style={{
                  position: 'absolute',
                  width: '60px',
                  height: '60px',
                  border: '2px solid #00ffcc',
                  borderRadius: '50%',
                  left: '50%',
                  top: '40%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 0
                }}
              />
            ))}
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: 2, duration: 0.4 }}
              style={{ fontSize: '4rem', filter: 'drop-shadow(0 0 30px #00ffcc)' }}
            >
              💎
            </motion.div>
            <motion.h5
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="fw-bold mt-2"
              style={{ color: '#00ffcc', textShadow: '0 0 20px rgba(0,255,200,0.5)' }}
            >
              SYNC COMPLETE!
            </motion.h5>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="small text-white-50 mt-1"
            >
              All changes saved to cloud ☁️
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
