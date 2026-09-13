import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const baseFeatures = [
  { id: 'journal', title: 'Journal', icon: 'bi-journal-text', color: '#6f42c1' },
  { id: 'streaks', title: 'Streaks', icon: 'bi-fire', color: '#fd7e14' },
  { id: 'rewards', title: 'Rewards', icon: 'bi-shop', color: '#198754' },
  { id: 'wallet', title: 'Wallet', icon: 'bi-wallet2', color: '#075E54' },
  { id: 'insights', title: 'Insights', icon: 'bi-bar-chart-line-fill', color: '#0d6efd' },
  { id: 'feature-hub', title: 'Hub', icon: 'bi-grid-1x2-fill', color: '#20c997' }
];

export default function QuickAccessDashboardWidget({ 
  currentUser,
  onOpenJournal, 
  onOpenStreaks, 
  onOpenRewards, 
  onOpenWallet, 
  onOpenWalletDist,
  onOpenInsights,
  onOpenFeatureHub
}) {
  const [pinnedFeatures, setPinnedFeatures] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [walletDists, setWalletDists] = useState([]);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'wallets', currentUser.uid), (snap) => {
      if (snap.exists() && snap.data().distributions) {
        setWalletDists(snap.data().distributions);
      } else {
        setWalletDists([]);
      }
    });
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
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
  }, []);

  const availableFeatures = [
    ...baseFeatures,
    ...walletDists.map(dist => ({
      id: `wallet-dist-${dist.id}`,
      title: dist.name,
      icon: 'bi-receipt',
      color: '#075E54', // Keep wallet color
      isWalletDist: true,
      distId: dist.id
    }))
  ];

  const toggleFeature = (id) => {
    let newPinned = [...pinnedFeatures];
    if (newPinned.includes(id)) {
      newPinned = newPinned.filter(fId => fId !== id);
    } else {
      newPinned.push(id);
    }
    setPinnedFeatures(newPinned);
    localStorage.setItem('quick-access-features', JSON.stringify(newPinned));
  };

  const handleOpenFeature = (feature) => {
    if (isEditMode) return;
    if (feature.isWalletDist) {
      onOpenWalletDist?.(feature.distId);
      return;
    }
    const id = feature.id;
    if (id === 'journal') onOpenJournal?.();
    if (id === 'streaks') onOpenStreaks?.();
    if (id === 'rewards') onOpenRewards?.();
    if (id === 'wallet') onOpenWallet?.();
    if (id === 'insights') onOpenInsights?.();
    if (id === 'feature-hub') onOpenFeatureHub?.();
  };

  if (pinnedFeatures.length === 0 && !isEditMode) {
    return (
      <div className="container-fluid max-width-container px-3 mb-3">
        <div className="card border-0 shadow-sm rounded-4 p-3 d-flex flex-row justify-content-between align-items-center">
          <span className="fw-bold text-dark small">Quick Access</span>
          <button className="btn btn-sm btn-light rounded-pill border fw-bold text-secondary" onClick={() => setIsEditMode(true)}>
            <i className="bi bi-plus me-1"></i>Add Features
          </button>
        </div>
      </div>
    );
  }

  const featuresToRender = isEditMode ? availableFeatures : availableFeatures.filter(f => pinnedFeatures.includes(f.id));

  return (
    <div className="container-fluid max-width-container px-3 mb-3">
      <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="fw-bold text-dark mb-0">
            <i className="bi bi-lightning-charge-fill text-warning me-2"></i>
            Quick Access
          </h6>
          <button 
            className={`btn btn-sm rounded-pill fw-bold ${isEditMode ? 'btn-success text-white' : 'btn-light border text-secondary'}`}
            onClick={() => setIsEditMode(!isEditMode)}
          >
            {isEditMode ? 'Done' : <><i className="bi bi-pencil-fill me-1"></i>Edit</>}
          </button>
        </div>
        
        <div className="d-flex gap-3 overflow-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {featuresToRender.map(feature => {
            const isPinned = pinnedFeatures.includes(feature.id);
            return (
              <div 
                key={feature.id} 
                className="d-flex flex-column align-items-center"
                style={{ cursor: 'pointer', minWidth: '70px', position: 'relative' }}
                onClick={() => isEditMode ? toggleFeature(feature.id) : handleOpenFeature(feature)}
              >
                <div 
                  className="rounded-4 d-flex justify-content-center align-items-center shadow-sm mb-2" 
                  style={{ 
                    width: '56px', height: '56px', 
                    background: isEditMode && !isPinned ? '#e9ecef' : feature.color,
                    transition: 'all 0.2s',
                    opacity: isEditMode && !isPinned ? 0.6 : 1
                  }}
                >
                  <i className={`bi ${feature.icon} text-white fs-4`}></i>
                </div>
                <span className="small fw-semibold text-dark text-center" style={{ fontSize: '0.75rem', lineHeight: '1.1' }}>{feature.title}</span>
                
                {isEditMode && (
                  <div 
                    className={`position-absolute rounded-circle d-flex justify-content-center align-items-center shadow-sm ${isPinned ? 'bg-danger text-white' : 'bg-success text-white'}`}
                    style={{ width: '20px', height: '20px', top: '-4px', right: '4px', border: '2px solid white' }}
                  >
                    <i className={`bi ${isPinned ? 'bi-dash' : 'bi-plus'} fs-6`}></i>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
