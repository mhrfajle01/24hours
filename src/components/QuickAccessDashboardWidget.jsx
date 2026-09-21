import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useCustomFeatures } from '../hooks/useCustomFeatures';
import CustomFeatureViewer from './CustomFeatureViewer';

const baseFeatures = [
  { id: 'journal', title: 'Journal', icon: 'bi-journal-text', color: '#6f42c1' },
  { id: 'streaks', title: 'Streaks', icon: 'bi-fire', color: '#fd7e14' },
  { id: 'rewards', title: 'Rewards', icon: 'bi-shop', color: '#198754' },
  { id: 'wallet', title: 'Wallet', icon: 'bi-wallet2', color: '#075E54' },
  { id: 'insights', title: 'Insights', icon: 'bi-bar-chart-line-fill', color: '#0d6efd' },
  { id: 'feature-hub', title: 'Hub', icon: 'bi-grid-1x2-fill', color: '#20c997' },
  { id: 'survey', title: 'Survey', icon: 'bi-clipboard2-check', color: '#e83e8c' }
];

export default function QuickAccessDashboardWidget({ 
  currentUser,
  onOpenJournal, 
  onOpenStreaks, 
  onOpenRewards, 
  onOpenWallet, 
  onOpenWalletDist,
  onOpenInsights,
  onOpenFeatureHub,
  onOpenSurvey
}) {
  const [pinnedFeatures, setPinnedFeatures] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedFeatureId, setDraggedFeatureId] = useState(null);
  const [walletDists, setWalletDists] = useState([]);
  const { features: customFeatures } = useCustomFeatures();
  const [activeCustomFeature, setActiveCustomFeature] = useState(null);

  useEffect(() => {
    const handlePopState = () => {
      if (isEditMode) {
        setIsEditMode(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isEditMode]);

  const openEditMode = () => {
    setIsEditMode(true);
    window.history.pushState({ quickAccessModal: true }, '');
  };

  const closeEditMode = () => {
    setIsEditMode(false);
    setSearchQuery('');
    if (window.history.state?.quickAccessModal) {
      window.history.back();
    }
  };

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'wallets', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let allDists = [];
        if (data.accounts) {
          data.accounts.forEach(acc => {
            if (acc.distributions) allDists = [...allDists, ...acc.distributions];
          });
        } else if (data.distributions) {
          allDists = data.distributions;
        }
        setWalletDists(allDists);
      } else {
        setWalletDists([]);
      }
    });
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists() && snap.data().quickAccessFeatures) {
        setPinnedFeatures(snap.data().quickAccessFeatures);
      } else {
        // Fallback to localStorage if no Firestore data, then migrate it
        const saved = localStorage.getItem('quick-access-features');
        if (saved) {
          try {
            setPinnedFeatures(JSON.parse(saved));
          } catch (e) {
            setPinnedFeatures(['journal', 'streaks', 'wallet']);
          }
        } else {
          setPinnedFeatures(['journal', 'streaks', 'wallet']);
        }
      }
    });
    return () => unsub();
  }, [currentUser]);

  const availableFeatures = [
    ...baseFeatures,
    ...walletDists.map(dist => ({
      id: `wallet-dist-${dist.id}`,
      title: dist.name,
      icon: 'bi-receipt',
      color: '#075E54',
      isWalletDist: true,
      distId: dist.id
    })),
    ...customFeatures.map(cf => ({
      id: `custom-${cf.id}`,
      title: cf.title,
      icon: cf.icon || 'bi-stars',
      color: '#e83e8c',
      isCustomFeature: true,
      customFeatureData: cf
    }))
  ];

  const savePinnedFeatures = async (newPinned) => {
    setPinnedFeatures(newPinned);
    localStorage.setItem('quick-access-features', JSON.stringify(newPinned));
    if (currentUser?.uid) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), { quickAccessFeatures: newPinned }, { merge: true });
      } catch (err) {
        console.error("Failed to save quick access features to Firestore", err);
      }
    }
  };

  const toggleFeature = (id) => {
    let newPinned = [...pinnedFeatures];
    if (newPinned.includes(id)) {
      newPinned = newPinned.filter(fId => fId !== id);
    } else {
      newPinned.push(id);
    }
    savePinnedFeatures(newPinned);
  };

  const handleOpenFeature = (feature) => {
    if (feature.isWalletDist) {
      onOpenWalletDist?.(feature.distId);
      return;
    }
    if (feature.isCustomFeature) {
      setActiveCustomFeature(feature.customFeatureData);
      return;
    }
    const id = feature.id;
    if (id === 'journal') onOpenJournal?.();
    if (id === 'streaks') onOpenStreaks?.();
    if (id === 'rewards') onOpenRewards?.();
    if (id === 'wallet') onOpenWallet?.();
    if (id === 'insights') onOpenInsights?.();
    if (id === 'feature-hub') onOpenFeatureHub?.();
    if (id === 'survey') onOpenSurvey?.();
  };

  if (pinnedFeatures.length === 0) {
    return (
      <div className="container-fluid max-width-container px-3 mb-3">
        <div className="card border-0 shadow-sm rounded-4 p-3 d-flex flex-row justify-content-between align-items-center">
          <span className="fw-bold text-dark small">Quick Access</span>
          <button className="btn btn-sm btn-light rounded-pill border fw-bold text-secondary" onClick={openEditMode}>
            <i className="bi bi-plus me-1"></i>Add Features
          </button>
        </div>
        {isEditMode && renderEditModal()}
      </div>
    );
  }

  const featuresToRender = pinnedFeatures.map(id => availableFeatures.find(f => f.id === id)).filter(Boolean);

  const handleDrop = (targetId) => {
    if (!draggedFeatureId || draggedFeatureId === targetId) return;
    const oldIndex = pinnedFeatures.indexOf(draggedFeatureId);
    const newIndex = pinnedFeatures.indexOf(targetId);
    if (oldIndex !== -1 && newIndex !== -1) {
      const newPinned = [...pinnedFeatures];
      newPinned.splice(oldIndex, 1);
      newPinned.splice(newIndex, 0, draggedFeatureId);
      savePinnedFeatures(newPinned);
    }
    setDraggedFeatureId(null);
  };

  function renderEditModal() {
    const filteredFeatures = availableFeatures.filter(f => f.title.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return (
      <div className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column bg-light" style={{ zIndex: 1050 }}>
        <div className="p-3 bg-white shadow-sm d-flex align-items-center justify-content-between">
          <h5 className="fw-bold mb-0">Edit Quick Access</h5>
          <button className="btn btn-sm btn-success rounded-pill fw-bold px-3" onClick={closeEditMode}>Done</button>
        </div>
        <div className="p-3 bg-light overflow-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          {/* Pinned Features (Draggable) */}
          <div className="mb-4">
            <h6 className="fw-bold text-muted mb-3 small text-uppercase">Pinned (Drag to Reorder)</h6>
            {featuresToRender.length === 0 ? (
              <div className="text-muted small py-2">No features pinned yet.</div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {featuresToRender.map(feature => (
                  <div 
                    key={feature.id}
                    draggable
                    onDragStart={(e) => {
                      setDraggedFeatureId(feature.id);
                      e.dataTransfer.effectAllowed = 'move';
                      // e.dataTransfer.setData('text/plain', feature.id); // for firefox
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(feature.id);
                    }}
                    className="card border-0 shadow-sm rounded-3 p-3 d-flex flex-row align-items-center justify-content-between"
                    style={{ 
                      cursor: 'grab', 
                      background: '#fff', 
                      opacity: draggedFeatureId === feature.id ? 0.5 : 1,
                      transform: draggedFeatureId === feature.id ? 'scale(0.98)' : 'none',
                      transition: 'transform 0.1s'
                    }}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <i className="bi bi-grip-vertical text-muted fs-5"></i>
                      <div className="rounded-3 d-flex justify-content-center align-items-center" style={{ width: '42px', height: '42px', background: feature.color }}>
                        <i className={`bi ${feature.icon} text-white fs-5`}></i>
                      </div>
                      <span className="fw-bold text-dark">{feature.title}</span>
                    </div>
                    <button className="btn btn-sm text-danger" onClick={() => toggleFeature(feature.id)}>
                      <i className="bi bi-dash-circle-fill fs-5"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <h6 className="fw-bold text-muted mb-3 small text-uppercase">Available Features</h6>
          <div className="input-group mb-3 shadow-sm rounded-3 overflow-hidden">
            <span className="input-group-text bg-white border-0"><i className="bi bi-search text-muted"></i></span>
            <input 
              type="text" 
              className="form-control border-0 ps-0" 
              placeholder="Search all features & settings..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="row g-2">
            {filteredFeatures.map(feature => {
              const isPinned = pinnedFeatures.includes(feature.id);
              return (
                <div key={feature.id} className="col-12 col-sm-6 col-md-4">
                  <div 
                    className="card border-0 shadow-sm rounded-3 p-3 d-flex flex-row align-items-center justify-content-between"
                    style={{ cursor: 'pointer', background: isPinned ? 'rgba(25, 135, 84, 0.05)' : '#fff', border: isPinned ? '1px solid rgba(25, 135, 84, 0.3)' : '1px solid transparent' }}
                    onClick={() => toggleFeature(feature.id)}
                  >
                    <div className="d-flex align-items-center gap-3">
                      <div className="rounded-3 d-flex justify-content-center align-items-center" style={{ width: '42px', height: '42px', background: feature.color }}>
                        <i className={`bi ${feature.icon} text-white fs-5`}></i>
                      </div>
                      <span className="fw-bold text-dark">{feature.title}</span>
                    </div>
                    <div>
                      {isPinned ? (
                        <i className="bi bi-check-circle-fill text-success fs-4"></i>
                      ) : (
                        <i className="bi bi-plus-circle text-muted fs-4"></i>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredFeatures.length === 0 && (
              <div className="text-center p-5">
                <i className="bi bi-search fs-1 text-muted mb-2"></i>
                <p className="text-muted">No features found for "{searchQuery}"</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container-fluid max-width-container px-3 mb-3">
        <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold text-dark mb-0">
              <i className="bi bi-lightning-charge-fill text-warning me-2"></i>
              Quick Access
            </h6>
            <button 
              className="btn btn-sm btn-light border text-secondary rounded-pill fw-bold"
              onClick={openEditMode}
            >
              <i className="bi bi-pencil-fill me-1"></i>Edit
            </button>
          </div>
          
          <div className="d-flex gap-3 overflow-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {featuresToRender.map(feature => (
              <div 
                key={feature.id} 
                className="d-flex flex-column align-items-center"
                style={{ cursor: 'pointer', minWidth: '70px' }}
                onClick={() => handleOpenFeature(feature)}
              >
                <div 
                  className="rounded-4 d-flex justify-content-center align-items-center shadow-sm mb-2" 
                  style={{ width: '56px', height: '56px', background: feature.color }}
                >
                  <i className={`bi ${feature.icon} text-white fs-4`}></i>
                </div>
                <span className="small fw-semibold text-dark text-center" style={{ fontSize: '0.75rem', lineHeight: '1.1' }}>{feature.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {isEditMode && renderEditModal()}
      {activeCustomFeature && <CustomFeatureViewer feature={activeCustomFeature} onClose={() => setActiveCustomFeature(null)} />}
    </>
  );
}
