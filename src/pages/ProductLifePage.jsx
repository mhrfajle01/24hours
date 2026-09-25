import React, { useState } from 'react';
import { useProducts } from '../hooks/useProducts';
import { motion, AnimatePresence } from 'framer-motion';

// Helper to calculate days between dates
const getDaysStreak = (startDateStr) => {
  if (!startDateStr) return 0;
  const start = new Date(startDateStr);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return isNaN(days) ? 0 : Math.max(0, days);
};

const MILESTONES = [
  { days: 30, label: '1m', emoji: '🥉', color: '#cd7f32' },
  { days: 90, label: '3m', emoji: '🥈', color: '#c0c0c0' },
  { days: 180, label: '6m', emoji: '🥇', color: '#ffd700' },
  { days: 365, label: '1y', emoji: '💎', color: '#00d4ff' },
  { days: 730, label: '2y', emoji: '👑', color: '#ff6b6b' }
];

export default function ProductLifePage({ currentUser, onBack }) {
  const { products, loading, addProduct, logRelapse, destroyProduct, deleteProduct } = useProducts(currentUser?.uid);
  
  const [activeView, setActiveView] = useState('list'); // 'list' or 'add'
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('📱');
  
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [relapseReason, setRelapseReason] = useState('');
  const [isDestroying, setIsDestroying] = useState(false);
  const [showRelapseModal, setShowRelapseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const activeProducts = products.filter(p => p.status === 'active');
  const fallenProducts = products.filter(p => p.status === 'destroyed');

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const finalEmoji = newEmoji.trim() || '📱';
    await addProduct(newName, finalEmoji);
    setNewName('');
    setNewEmoji('📱');
    setActiveView('list');
  };

  const triggerRelapse = (product, destroy = false) => {
    setSelectedProduct(product);
    setIsDestroying(destroy);
    setShowRelapseModal(true);
    setRelapseReason('');
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (selectedProduct) {
      await deleteProduct(selectedProduct.id);
      setActiveView('list');
      setSelectedProduct(null);
      setShowDeleteModal(false);
    }
  };

  const confirmRelapse = async (e) => {
    e.preventDefault();
    if (!selectedProduct || !relapseReason.trim()) return;
    const currentStreak = getDaysStreak(selectedProduct.startDate);
    
    if (isDestroying) {
      await destroyProduct(selectedProduct.id, selectedProduct, relapseReason, currentStreak);
    } else {
      await logRelapse(selectedProduct.id, selectedProduct, relapseReason, currentStreak);
    }
    setShowRelapseModal(false);
    setSelectedProduct(null);
  };

  const getNextMilestone = (days) => {
    for (const m of MILESTONES) {
      if (days < m.days) return m;
    }
    return null;
  };

  return (
    <div className="d-flex flex-column h-100 position-absolute w-100 bg-black top-0 start-0 z-3" style={{ minHeight: '100vh', zIndex: 1050 }}>
      
      <style>{`
        .fire-glow {
          text-shadow: 0 0 20px rgba(0, 212, 255, 0.8), 0 0 40px rgba(0, 212, 255, 0.4);
          background: linear-gradient(135deg, #00d4ff 0%, #ffffff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hover-scale { transition: transform 0.2s ease; }
        .hover-scale:hover { transform: scale(1.02); }
        .glass-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
      `}</style>

      {/* HEADER */}
      <header className="sticky-top glass-card px-3 py-3 d-flex align-items-center justify-content-between z-3">
        <div className="d-flex align-items-center gap-3">
          <button 
            className="btn btn-link text-white p-0 text-decoration-none hover-scale"
            onClick={() => {
              if (activeView !== 'list') setActiveView('list');
              else onBack();
            }}
          >
            <i className="bi bi-arrow-left fs-4" />
          </button>
          <h4 className="m-0 fw-extrabold glowing-text d-flex align-items-center gap-2">
            <i className="bi bi-box-seam text-info" /> Product Life
          </h4>
        </div>
        {activeView === 'list' && (
          <button 
            className="btn btn-sm text-black fw-bold rounded-pill px-3"
            style={{ background: '#00d4ff', boxShadow: '0 0 10px rgba(0,212,255,0.4)' }}
            onClick={() => setActiveView('add')}
          >
            <i className="bi bi-plus-lg" /> Add
          </button>
        )}
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-grow-1 overflow-auto p-3 pb-5">
        <div className="max-width-container mx-auto">

          {activeView === 'list' && (
            <div className="animate-fade-in">
              <div className="text-center mb-4 px-3 py-3 glass-card rounded-4">
                <p className="m-0 fst-italic text-white-50 fs-6">"Take care of your things, and they will take care of you."</p>
              </div>

              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-info" role="status"></div>
                </div>
              ) : activeProducts.length === 0 && fallenProducts.length === 0 ? (
                <div className="text-center py-5 d-flex flex-column align-items-center animate-slide-up">
                  <div style={{ fontSize: '5rem', animation: 'pulseOpacity 2s infinite' }}>📦</div>
                  <h3 className="fw-extrabold mt-3">Start Tracking Products</h3>
                  <p className="text-white-50 px-4">Track how long your gadgets, shoes, and gear last.</p>
                  <button 
                    className="btn btn-lg fw-bold rounded-pill px-4 mt-3 text-black"
                    style={{ background: 'linear-gradient(135deg, #00d4ff, #007bff)' }}
                    onClick={() => setActiveView('add')}
                  >
                    Track Your First Product
                  </button>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {/* ACTIVE PRODUCTS */}
                  {activeProducts.map(product => {
                    const days = getDaysStreak(product.startDate);
                    const nextMile = getNextMilestone(days);
                    const progress = nextMile ? Math.max(0, Math.min(100, (days / nextMile.days) * 100)) : 100;

                    return (
                      <div 
                        key={product.id} 
                        className="glass-card rounded-4 p-4 position-relative hover-scale transition-all cursor-pointer"
                        onClick={() => { setSelectedProduct(product); setActiveView('detail'); }}
                      >
                        <div className="text-center">
                          <div className="fs-1 mb-2">{product.emoji}</div>
                          <h5 className="fw-bold mb-3">{product.name}</h5>
                          
                          <div className="position-relative d-inline-block mb-3">
                            <div className="fw-extrabold fire-glow" style={{ fontSize: '4.5rem', lineHeight: '1' }}>
                              {days}
                            </div>
                            <div className="text-uppercase fw-bold text-white-50" style={{ letterSpacing: '2px', fontSize: '0.8rem' }}>
                              Days Owned
                            </div>
                          </div>

                          {nextMile && (
                            <div className="mb-3 px-4">
                              <div className="d-flex justify-content-between text-white-50 mb-1" style={{ fontSize: '0.75rem' }}>
                                <span>{days}d owned</span>
                                <span>{nextMile.emoji} {nextMile.days}d</span>
                              </div>
                              <div className="progress" style={{ height: '6px', background: 'rgba(255,255,255,0.1)' }}>
                                <div 
                                  className="progress-bar" 
                                  role="progressbar" 
                                  style={{ width: `${progress}%`, background: nextMile.color, boxShadow: `0 0 10px ${nextMile.color}` }}
                                ></div>
                              </div>
                              <div className="text-white-50 mt-1" style={{ fontSize: '0.7rem' }}>
                                {nextMile.days - days} days until {nextMile.label}
                              </div>
                            </div>
                          )}

                          <div className="d-flex justify-content-center gap-2 mt-4">
                            <button 
                              className="btn btn-sm rounded-pill fw-bold px-4"
                              style={{ background: 'rgba(255, 193, 7, 0.2)', color: '#ffc107', border: '1px solid #ffc107' }}
                              onClick={(e) => { e.stopPropagation(); triggerRelapse(product, false); }}
                            >
                              🛠️ Log Repair/Issue
                            </button>
                            <button 
                              className="btn btn-sm rounded-pill fw-bold px-4"
                              style={{ background: 'rgba(255, 107, 107, 0.2)', color: '#ff6b6b', border: '1px solid #ff6b6b' }}
                              onClick={(e) => { e.stopPropagation(); triggerRelapse(product, true); }}
                            >
                              🪦 Destroyed/Lost
                            </button>
                          </div>
                          <div className="d-flex justify-content-between text-white-50 small mt-4 px-3">
                            <span>Best: {Math.max(product.longestStreak || 0, days)}d</span>
                            <span>Issues Logged: {product.relapseHistory?.length || 0}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* FALLEN PRODUCTS */}
                  {fallenProducts.length > 0 && (
                    <div className="mt-4">
                      <h5 className="fw-bold text-white-50 mb-3 px-2 d-flex align-items-center gap-2">
                        <i className="bi bi-archive" /> Graveyard
                      </h5>
                      <div className="d-flex flex-column gap-2">
                        {fallenProducts.map(product => (
                          <div 
                            key={product.id} 
                            className="glass-card rounded-4 p-3 d-flex justify-content-between align-items-center opacity-75 cursor-pointer hover-scale"
                            onClick={() => { setSelectedProduct(product); setActiveView('detail'); }}
                          >
                            <div>
                              <span className="fs-4 me-2">{product.emoji}</span>
                              <span className="fw-bold">{product.name}</span>
                            </div>
                            <div className="text-end">
                              <div className="text-danger fw-bold">{product.longestStreak} days</div>
                              <small className="text-white-50 d-block">Survived</small>
                              <small className="text-white-50 d-block" style={{ fontSize: '0.7rem' }}>Issues: {product.relapseHistory?.length || 0}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeView === 'detail' && selectedProduct && (() => {
            const days = getDaysStreak(selectedProduct.startDate);
            const history = selectedProduct.relapseHistory || [];
            
            return (
              <div className="animate-slide-up pb-5">
                <div className="text-center mb-4">
                  <div className="fs-1">{selectedProduct.emoji}</div>
                  <h3 className="fw-extrabold glowing-text">{selectedProduct.name}</h3>
                  <div className="fs-5 text-white-50">{days} Days Owned</div>
                </div>

                <div className="row g-3 mb-4">
                  <div className="col-6">
                    <div className="glass-card rounded-4 p-3 text-center h-100">
                      <div className="text-white-50 small text-uppercase">Best Run</div>
                      <div className="fs-2 fw-bold text-info">{Math.max(selectedProduct.longestStreak || 0, days)}</div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="glass-card rounded-4 p-3 text-center h-100">
                      <div className="text-white-50 small text-uppercase">Total Issues</div>
                      <div className="fs-2 fw-bold text-warning">{history.length}</div>
                    </div>
                  </div>
                </div>

                {/* Milestones */}
                <div className="glass-card rounded-4 p-4 mb-4">
                  <h6 className="fw-bold mb-3 text-uppercase text-white-50" style={{ letterSpacing: '1px' }}>Milestones</h6>
                  <div className="d-flex flex-column gap-2">
                    {MILESTONES.map(m => {
                      const achieved = days >= m.days;
                      const milestoneProgress = Math.min(100, (days / m.days) * 100);
                      const nextMilestone = !achieved && !MILESTONES.some(other => other.days < m.days && other.days > days);
                      return (
                        <div key={m.days} className="p-2 rounded-3" style={{ background: achieved || nextMilestone ? 'rgba(255,255,255,0.05)' : 'transparent', opacity: achieved || nextMilestone ? 1 : 0.55 }}>
                          <div className="d-flex align-items-center gap-3">
                          <div className="fs-3">{m.emoji}</div>
                          <div className="flex-grow-1">
                            <div className="fw-bold">{m.days} Days</div>
                            <div className="small text-white-50">
                              {achieved ? 'Milestone achieved' : `${days}/${m.days} days`}
                            </div>
                          </div>
                          {achieved && <i className="bi bi-check-circle-fill fs-5 text-success"></i>}
                          </div>
                          {!achieved && (
                            <div className="progress mt-2" style={{ height: '5px', background: 'rgba(255,255,255,0.1)' }}>
                              <div className="progress-bar" style={{ width: `${milestoneProgress}%`, background: m.color, boxShadow: nextMilestone ? `0 0 8px ${m.color}` : 'none' }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Relapse History */}
                <div className="glass-card rounded-4 p-4 mb-4">
                  <h6 className="fw-bold mb-3 text-uppercase text-white-50" style={{ letterSpacing: '1px' }}>Issue Log History</h6>
                  {history.length === 0 ? (
                    <div className="text-center text-white-50 py-3">No issues logged! Running perfectly. 🚀</div>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {history.map((h, i) => (
                        <div key={i} className="p-3 rounded-3" style={{ background: h.final ? 'rgba(255,107,107,0.1)' : 'rgba(255,193,7,0.1)', borderLeft: `4px solid ${h.final ? '#ff6b6b' : '#ffc107'}` }}>
                          <div className="d-flex justify-content-between mb-1">
                            <span className="fw-bold text-white">{new Date(h.date).toLocaleDateString()}</span>
                            <span className={`badge ${h.final ? 'bg-danger' : 'bg-warning text-dark'}`}>
                              {h.streak} days {h.final ? 'until destroyed' : 'until issue'}
                            </span>
                          </div>
                          {h.reason && <div className="small mt-2 fst-italic">"{h.reason}"</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedProduct.status === 'active' && (
                  <div className="d-flex gap-2">
                    <button 
                      className="btn flex-grow-1 rounded-pill fw-bold"
                      style={{ background: 'rgba(255, 193, 7, 0.2)', color: '#ffc107', border: '1px solid #ffc107' }}
                      onClick={() => triggerRelapse(selectedProduct, false)}
                    >
                      🛠️ Log Repair
                    </button>
                    <button 
                      className="btn flex-grow-1 rounded-pill fw-bold"
                      style={{ background: 'rgba(255, 107, 107, 0.2)', color: '#ff6b6b', border: '1px solid #ff6b6b' }}
                      onClick={() => triggerRelapse(selectedProduct, true)}
                    >
                      🪦 Destroyed
                    </button>
                  </div>
                )}

                <button 
                  className="btn btn-outline-danger w-100 rounded-pill fw-bold mt-3"
                  onClick={handleDelete}
                >
                  <i className="bi bi-trash3"></i> Delete Product
                </button>
              </div>
            );
          })()}

          {activeView === 'add' && (
            <div className="animate-slide-up pb-5">
              <div className="glass-card rounded-4 p-4 text-center">
                <h4 className="fw-bold mb-4 glowing-text">New Product 📦</h4>
                <form onSubmit={handleAdd}>
                  <div className="mb-4">
                    <label className="text-white-50 small text-uppercase mb-2 d-block">Emoji</label>
                    <div className="fs-1 bg-black bg-opacity-25 rounded-circle d-inline-flex align-items-center justify-content-center mx-auto border border-secondary" style={{ width: '80px', height: '80px', cursor: 'pointer' }}>
                      <input 
                        type="text" 
                        value={newEmoji}
                        onChange={(e) => setNewEmoji(e.target.value)}
                        className="bg-transparent border-0 text-center text-white p-0 m-0 w-100"
                        style={{ outline: 'none', fontSize: '2.5rem' }}
                        maxLength="2"
                      />
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <label className="text-white-50 small text-uppercase mb-2 d-block">Product Name</label>
                    <input 
                      type="text"
                      className="form-control form-control-lg bg-black bg-opacity-25 text-white border-secondary text-center"
                      placeholder="e.g. iPhone 15, Running Shoes"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-lg w-100 fw-bold rounded-pill text-black mt-3"
                    style={{ background: '#00d4ff' }}
                  >
                    Start Tracking
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* RELAPSE / DESTROY MODAL */}
      {showRelapseModal && selectedProduct && (
        <div className="modal-overlay position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center z-3" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)' }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-card rounded-4 p-4 mx-3 w-100 position-relative text-center" 
            style={{ maxWidth: '400px' }}
          >
            <div className="fs-1 mb-2">{isDestroying ? '🪦' : '🛠️'}</div>
            <h4 className="fw-bold mb-2 glowing-text">
              {isDestroying ? 'Product Destroyed' : 'Log an Issue'}
            </h4>
            <p className="text-white-50 small mb-4">
              What happened to your <strong>{selectedProduct.name}</strong>?
            </p>

            <form onSubmit={confirmRelapse}>
              <textarea
                className="form-control bg-black bg-opacity-25 text-white border-secondary mb-4"
                rows="3"
                placeholder="e.g., Screen cracked, lost it, needs new battery..."
                value={relapseReason}
                onChange={e => setRelapseReason(e.target.value)}
                required
              />
              <div className="d-flex gap-2">
                <button type="button" className="btn btn-dark flex-grow-1 rounded-pill" onClick={() => setShowRelapseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={`btn flex-grow-1 rounded-pill fw-bold ${isDestroying ? 'btn-danger' : 'btn-warning'}`}>
                  {isDestroying ? 'Move to Graveyard' : 'Log & Reset'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && selectedProduct && (
        <div className="modal-overlay position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center z-3" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)' }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass-card rounded-4 p-4 mx-3 w-100 position-relative text-center" 
            style={{ maxWidth: '400px' }}
          >
            <div className="fs-1 mb-2">🗑️</div>
            <h4 className="fw-bold mb-2 text-danger">Delete Product</h4>
            <p className="text-white-50 small mb-4">
              Are you sure you want to completely delete <strong>{selectedProduct.name}</strong>? This action cannot be undone.
            </p>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-dark flex-grow-1 rounded-pill" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger flex-grow-1 rounded-pill fw-bold" onClick={confirmDelete}>
                Yes, Delete It
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
