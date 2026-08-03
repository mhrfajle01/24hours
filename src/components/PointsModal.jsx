import React, { useState } from 'react';

export default function PointsModal({ show, onClose, pointsData, redeemPerk, showToast }) {
  const [activeTab, setActiveTab] = useState('shop'); // 'shop' | 'history' | 'rules'
  const [loadingPerk, setLoadingPerk] = useState(null);

  if (!show) return null;

  const { points = 0, history = [] } = pointsData || {};

  const handleRedeem = async (perkType, cost, payload = {}) => {
    try {
      setLoadingPerk(perkType);
      await redeemPerk(perkType, cost, payload);
      showToast(`Successfully redeemed! (-${cost} pts)`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to redeem perk', 'danger');
    } finally {
      setLoadingPerk(null);
    }
  };

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }} tabIndex="-1">
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content shadow border-0 text-dark">
          
          {/* Header */}
          <div className="modal-header border-0 text-white d-flex align-items-center justify-content-between" style={{ backgroundColor: '#075E54' }}>
            <div className="d-flex align-items-center gap-2">
              <span className="fs-3">🪙</span>
              <div>
                <h5 className="modal-title mb-0 fw-bold">Points & Rewards</h5>
                <small className="text-white-50">Earn points by tracking your daily activity</small>
              </div>
            </div>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>

          {/* Balance Bar */}
          <div className="p-3 bg-light border-bottom d-flex align-items-center justify-content-between">
            <div>
              <span className="text-muted small text-uppercase fw-semibold d-block">Current Balance</span>
              <span className="fs-2 fw-bold text-success d-flex align-items-center gap-1">
                🪙 {points.toLocaleString()} <span className="fs-6 text-muted fw-normal">pts</span>
              </span>
            </div>
            <div className="d-flex gap-2">
              <button 
                className={`btn btn-sm ${activeTab === 'shop' ? 'btn-success' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('shop')}
              >
                🛒 Perks & Shop
              </button>
              <button 
                className={`btn btn-sm ${activeTab === 'history' ? 'btn-success' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('history')}
              >
                📜 History
              </button>
              <button 
                className={`btn btn-sm ${activeTab === 'rules' ? 'btn-success' : 'btn-outline-secondary'}`}
                onClick={() => setActiveTab('rules')}
              >
                ℹ️ Rules
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="modal-body p-4" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {activeTab === 'shop' && (
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="card h-100 border-0 shadow-sm p-3 bg-body rounded">
                    <div className="d-flex align-items-center gap-3 mb-2">
                      <span className="fs-1">🧊</span>
                      <div>
                        <h6 className="fw-bold mb-1">Streak Freeze</h6>
                        <small className="text-muted">Protects your streak if you miss completing a day.</small>
                      </div>
                    </div>
                    <div className="mt-auto d-flex align-items-center justify-content-between pt-3 border-top">
                      <span className="fw-bold text-success">50 pts</span>
                      <button 
                        className="btn btn-sm btn-outline-success rounded-pill px-3"
                        disabled={points < 50 || loadingPerk === 'STREAK_FREEZE'}
                        onClick={() => handleRedeem('STREAK_FREEZE', 50)}
                      >
                        {loadingPerk === 'STREAK_FREEZE' ? 'Redeeming...' : 'Redeem'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="card h-100 border-0 shadow-sm p-3 bg-body rounded">
                    <div className="d-flex align-items-center gap-3 mb-2">
                      <span className="fs-1">🛡️</span>
                      <div>
                        <h6 className="fw-bold mb-1">Excuse Yesterday</h6>
                        <small className="text-muted">Excuse a missed day so it doesn't count against your goals.</small>
                      </div>
                    </div>
                    <div className="mt-auto d-flex align-items-center justify-content-between pt-3 border-top">
                      <span className="fw-bold text-success">50 pts</span>
                      <button 
                        className="btn btn-sm btn-outline-success rounded-pill px-3"
                        disabled={points < 50 || loadingPerk === 'EXCUSE_DAY'}
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() - 1);
                          const yesterdayStr = d.toISOString().slice(0, 10);
                          handleRedeem('EXCUSE_DAY', 50, { date: yesterdayStr });
                        }}
                      >
                        {loadingPerk === 'EXCUSE_DAY' ? 'Redeeming...' : 'Excuse Day'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                {history.length === 0 ? (
                  <p className="text-muted text-center py-4">No points history recorded yet.</p>
                ) : (
                  <ul className="list-group list-group-flush border-top">
                    {history.map((item) => (
                      <li key={item.id} className="list-group-item d-flex align-items-center justify-content-between py-3 px-1">
                        <div>
                          <span className="fw-semibold d-block">{item.title}</span>
                          <small className="text-muted">{new Date(item.date).toLocaleString()}</small>
                        </div>
                        <span className={`fw-bold ${item.type === 'earn' ? 'text-success' : 'text-danger'}`}>
                          {item.type === 'earn' ? `+${item.amount}` : `-${item.amount}`} pts
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab === 'rules' && (
              <div className="vstack gap-3">

                {/* Section 1: Earning Points */}
                <div className="card border-0 shadow-sm overflow-hidden">
                  <div className="card-header bg-success-subtle text-success-emphasis border-0 fw-bold py-2 d-flex align-items-center justify-content-between">
                    <span><i className="bi bi-graph-up-arrow me-2"></i>1. How to Earn Points</span>
                    <span className="badge bg-success text-white">EARN</span>
                  </div>
                  <div className="card-body vstack gap-2 p-3">
                    <div className="d-flex align-items-start gap-2">
                      <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill mt-1">Daily</span>
                      <div>
                        <strong className="text-dark">Daily Check-in (+20 pts)</strong>
                        <p className="small text-secondary mb-0">Claimed automatically the first time you open the app each day.</p>
                      </div>
                    </div>

                    <hr className="my-1 text-black-50" />

                    <div className="d-flex align-items-start gap-2">
                      <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill mt-1">Blocks</span>
                      <div>
                        <strong className="text-dark">Activity Completion Points</strong>
                        <p className="small text-secondary mb-1">Earn points based on the duration of your completed blocks:</p>
                        <div className="row g-2 text-center small">
                          <div className="col-3">
                            <div className="p-1.5 bg-light rounded border">
                              <span className="d-block text-muted">15 mins</span>
                              <strong className="text-success">+10 pts</strong>
                            </div>
                          </div>
                          <div className="col-3">
                            <div className="p-1.5 bg-light rounded border">
                              <span className="d-block text-muted">30 mins</span>
                              <strong className="text-success">+20 pts</strong>
                            </div>
                          </div>
                          <div className="col-3">
                            <div className="p-1.5 bg-light rounded border">
                              <span className="d-block text-muted">45 mins</span>
                              <strong className="text-success">+30 pts</strong>
                            </div>
                          </div>
                          <div className="col-3">
                            <div className="p-1.5 bg-light rounded border">
                              <span className="d-block text-muted">60 mins (1h)</span>
                              <strong className="text-success">+40 pts</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <hr className="my-1 text-black-50" />

                    <div className="d-flex align-items-start gap-2">
                      <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill mt-1">Streak</span>
                      <div>
                        <strong className="text-dark">🔥 Streak Multiplier Bonus (Daily)</strong>
                        <p className="small text-secondary mb-1">
                          Keep your daily streak active! Completing at least 1 block each day awards:
                        </p>
                        <div className="p-2 bg-warning-subtle rounded border border-warning-subtle small fw-medium text-dark">
                          <strong>Formula:</strong> Streak Day Count × 20 Points
                          <div className="mt-1 d-flex flex-wrap gap-2 text-muted">
                            <span className="badge bg-white text-dark border">Day 1 = +20 pts</span>
                            <span className="badge bg-white text-dark border">Day 2 = +40 pts</span>
                            <span className="badge bg-white text-dark border">Day 3 = +60 pts</span>
                            <span className="badge bg-white text-dark border">Day 10 = +200 pts</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <hr className="my-1 text-black-50" />

                    <div className="d-flex align-items-start gap-2">
                      <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill mt-1">Master</span>
                      <div>
                        <strong className="text-dark">🏆 24-Hour Master Completion Bonus (+50 pts)</strong>
                        <p className="small text-secondary mb-0">Achieved when all 24 hourly blocks of a full day are completed!</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Deductions & Penalties */}
                <div className="card border-0 shadow-sm overflow-hidden">
                  <div className="card-header bg-danger-subtle text-danger-emphasis border-0 fw-bold py-2 d-flex align-items-center justify-content-between">
                    <span><i className="bi bi-shield-slash me-2"></i>2. Deductions & Penalties</span>
                    <span className="badge bg-danger text-white">PENALTY</span>
                  </div>
                  <div className="card-body vstack gap-2 p-3">
                    <div className="d-flex align-items-start gap-2">
                      <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill mt-1">Streak Loss</span>
                      <div>
                        <strong className="text-dark">💔 Streak Break Penalty</strong>
                        <p className="small text-secondary mb-0">
                          If you miss a day without a active Streak Freeze, your streak resets to 0 and all earned streak bonus points from that active streak are deducted as a penalty:
                        </p>
                        <div className="p-2 bg-danger-subtle rounded border border-danger-subtle small fw-medium text-danger-emphasis mt-1">
                          <strong>Deduction:</strong> Lost Streak Count × 20 Points<br/>
                          <em>e.g., losing a 3-Day streak deducts 60 points from your balance.</em>
                        </div>
                      </div>
                    </div>

                    <hr className="my-1 text-black-50" />

                    <div className="d-flex align-items-start gap-2">
                      <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill mt-1">Missed</span>
                      <div>
                        <strong className="text-dark">⚠️ Missed Block Penalty</strong>
                        <p className="small text-secondary mb-0">
                          Marking a slot as <strong>Missed</strong> deducts 50% of the slot duration points (minimum 5 pts penalty).
                        </p>
                      </div>
                    </div>

                    <hr className="my-1 text-black-50" />

                    <div className="d-flex align-items-start gap-2">
                      <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill mt-1">Revert</span>
                      <div>
                        <strong className="text-dark">🔄 Reverting Status to Pending</strong>
                        <p className="small text-secondary mb-0">
                          • <strong>Completed ➔ Pending:</strong> Revokes the earned block points so you don't keep extra points.<br/>
                          • <strong>Missed ➔ Pending:</strong> Refunds the missed deduction penalty back to your balance.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: Spending & Perks */}
                <div className="card border-0 shadow-sm overflow-hidden">
                  <div className="card-header bg-info-subtle text-info-emphasis border-0 fw-bold py-2 d-flex align-items-center justify-content-between">
                    <span><i className="bi bi-cart-check me-2"></i>3. Perks & Rewards Shop</span>
                    <span className="badge bg-info text-dark">PERKS</span>
                  </div>
                  <div className="card-body p-3">
                    <div className="row g-2">
                      <div className="col-6">
                        <div className="p-2 border rounded bg-light">
                          <strong className="d-block text-dark">🧊 Streak Freeze (50 pts)</strong>
                          <span className="small text-muted">Protects your streak if you miss a day.</span>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="p-2 border rounded bg-light">
                          <strong className="d-block text-dark">🛡️ Excuse Yesterday (50 pts)</strong>
                          <span className="small text-muted">Excuses yesterday so streak stays unbroken.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Footer */}
          <div className="modal-footer border-top bg-light">
            <button type="button" className="btn btn-secondary rounded-pill px-4" onClick={onClose}>Close</button>
          </div>

        </div>
      </div>
    </div>
  );
}
