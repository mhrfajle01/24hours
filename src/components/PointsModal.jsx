import React, { useState, useEffect } from 'react';
import RareEvent from './RareEvent';
import { getTodayDateString, isFeatureActive, getFeatureTimeRemaining } from '../utils/helpers';

export default function PointsModal({ show, onClose, pointsData, redeemPerk, showToast, perkLimits = {}, streakData = {} }) {
  const [activeTab, setActiveTab] = useState('shop'); // 'shop' | 'history' | 'rules'
  const [loadingPerk, setLoadingPerk] = useState(null);
  const [timeNow, setTimeNow] = useState(Date.now());

  // Mystery Box Animation States
  const [isOpeningBox, setIsOpeningBox] = useState(false);
  const [boxReward, setBoxReward] = useState(null); // { wonAmount, tier } | null
  const [purchaseEvent, setPurchaseEvent] = useState(null); // custom purchase string
  const [freezeEvent, setFreezeEvent] = useState(null);
  const [excuseEvent, setExcuseEvent] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => setTimeNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (!show) return null;

  const { points = 0, history = [] } = pointsData || {};
  const today = getTodayDateString();
  const dailyPurchases = pointsData?.dailyPurchases?.[today] || {};

  // Helper: cooldown remaining text
  const getCooldownText = (cooldownUntil) => {
    if (!cooldownUntil) return null;
    const ms = new Date(cooldownUntil).getTime() - timeNow;
    if (ms <= 0) return null;
    const h = Math.ceil(ms / (1000 * 60 * 60));
    return `~${h}h cooldown`;
  };

  const freezeCooldownText = getCooldownText(perkLimits.freezeCooldownUntil);
  const excuseCooldownText = getCooldownText(perkLimits.excuseCooldownUntil);

  const handleRedeem = async (perkType, cost, payload = {}) => {
    try {
      setLoadingPerk(perkType);
      const res = await redeemPerk(perkType, cost, payload);
      if (perkType === 'STREAK_FREEZE') {
        setFreezeEvent(true);
      } else if (perkType === 'EXCUSE_DAY') {
        setExcuseEvent(true);
      } else {
        setPurchaseEvent(`Claimed!`);
      }
      showToast(`Successfully redeemed! (-${cost} pts)`, 'success');
      return res;
    } catch (err) {
      showToast(err.message || 'Failed to redeem perk', 'danger');
      throw err;
    } finally {
      setLoadingPerk(null);
    }
  };

  const handleOpenMysteryBox = async () => {
    try {
      setIsOpeningBox(true);
      setBoxReward(null);
      // Call redeem perk which handles deduction and prize calculation
      const res = await redeemPerk('MYSTERY_BOX', 500);

      // Reveal the reward shortly after the result is available so feedback feels immediate.
      setTimeout(() => {
        setIsOpeningBox(false);
        setBoxReward(res);
      }, 350);

    } catch (err) {
      setIsOpeningBox(false);
    }
  };

  const featureList = [
    { key: 'unlimited_todo_tags', name: 'Unlimited Todo Tags', desc: 'Create custom tags without limits.', cost: 150, icon: '🏷️' },
    { key: 'history', name: 'Points History', desc: 'View full history of all points earned and spent.', cost: 350, icon: '📜' },
    { key: 'security_scan', name: 'Security Scan', desc: 'Scan and secure your workspace data.', cost: 500, icon: '🛡️' },
    { key: 'islamic_theme', name: 'Islamic Theme', desc: 'Enable beautiful Islamic theme mode.', cost: 750, icon: '🌙' },
    { key: 'pdf_export', name: 'PDF Export', desc: 'Export your data and reports to PDF.', cost: 1000, icon: '📄' },
    { key: 'import_json', name: 'JSON Import', desc: 'Import backup JSON files.', cost: 50, icon: '📥' }
  ];

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
                {!isFeatureActive(pointsData, 'history') ? '🔒 📜 History (350 pts)' : '📜 History'}
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
                {/* Perk 1: Streak Freeze */}
                <div className="col-md-4">
                  <div className="card h-100 border-0 shadow-sm p-3 bg-body rounded">
                    <div className="d-flex align-items-center gap-3 mb-2">
                      <span className="fs-1">🧊</span>
                      <div>
                        <h6 className="fw-bold mb-1">Streak Freeze</h6>
                        <small className="text-muted">Protects your streak if you miss completing a day.</small>
                        <small className="d-block mt-1" style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                          {perkLimits.freezeUsesThisMonth || 0}/{perkLimits.freezeMaxPerMonth || 3} used this month
                          {freezeCooldownText && <span className="text-warning ms-1">· {freezeCooldownText}</span>}
                        </small>
                      </div>
                    </div>
                    <div className="mt-auto d-flex align-items-center justify-content-between pt-3 border-top">
                      <span className="fw-bold text-success">300 pts</span>
                      <button 
                        className="btn btn-sm btn-outline-success rounded-pill px-3"
                        disabled={points < 300 || dailyPurchases.streakFreeze >= 1 || loadingPerk === 'STREAK_FREEZE' || !!freezeCooldownText || (perkLimits.freezeUsesThisMonth || 0) >= (perkLimits.freezeMaxPerMonth || 3)}
                        onClick={() => handleRedeem('STREAK_FREEZE', 300)}
                      >
                        {loadingPerk === 'STREAK_FREEZE' ? 'Redeeming...' : dailyPurchases.streakFreeze >= 1 ? 'Purchased Today' : (perkLimits.freezeUsesThisMonth || 0) >= (perkLimits.freezeMaxPerMonth || 3) ? 'Monthly Limit' : freezeCooldownText ? 'Cooldown' : 'Redeem'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Perk 2: Excuse Yesterday */}
                <div className="col-md-4">
                  <div className="card h-100 border-0 shadow-sm p-3 bg-body rounded">
                    <div className="d-flex align-items-center gap-3 mb-2">
                      <span className="fs-1">🛡️</span>
                      <div>
                        <h6 className="fw-bold mb-1">Excuse Yesterday</h6>
                        <small className="text-muted">Excuse a missed day within 48h so it doesn't break your streak.</small>
                        <small className="d-block mt-1" style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                          {perkLimits.excuseUsesThisMonth || 0}/{perkLimits.excuseMaxPerMonth || 2} used this month
                          {excuseCooldownText && <span className="text-warning ms-1">· {excuseCooldownText}</span>}
                        </small>
                      </div>
                    </div>
                    <div className="mt-auto d-flex align-items-center justify-content-between pt-3 border-top">
                      <span className="fw-bold text-success">400 pts</span>
                      <button 
                        className={`btn btn-sm ${dailyPurchases.excuseDay >= 1 && (streakData.currentStreak || 0) === 0 ? 'btn-warning' : 'btn-outline-success'} rounded-pill px-3`}
                        disabled={loadingPerk === 'EXCUSE_DAY' || (dailyPurchases.excuseDay >= 1 && (streakData.currentStreak || 0) > 0) || (dailyPurchases.excuseDay < 1 && (points < 400 || !!excuseCooldownText || (perkLimits.excuseUsesThisMonth || 0) >= (perkLimits.excuseMaxPerMonth || 2)))}
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() - 1);
                          const yesterdayStr = d.toISOString().slice(0, 10);
                          handleRedeem('EXCUSE_DAY', 400, { date: yesterdayStr });
                        }}
                      >
                        {loadingPerk === 'EXCUSE_DAY' ? 'Redeeming...' : dailyPurchases.excuseDay >= 1 && (streakData.currentStreak || 0) === 0 ? '🔄 Retry Fix' : dailyPurchases.excuseDay >= 1 ? 'Purchased Today' : (perkLimits.excuseUsesThisMonth || 0) >= (perkLimits.excuseMaxPerMonth || 2) ? 'Monthly Limit' : excuseCooldownText ? 'Cooldown' : 'Excuse Day'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Perk 3: Consistency Insights */}
                <div className="col-md-4">
                  <div className="card h-100 border-0 shadow-sm p-3 bg-body rounded">
                    <div className="d-flex align-items-center gap-3 mb-2">
                      <span className="fs-1">📊</span>
                      <div>
                        <h6 className="fw-bold mb-1">Consistency Insights</h6>
                        <small className="text-muted" style={{ fontSize: '0.78rem' }}>Unlock the 30-day consistency calendar & weekly metrics.</small>
                        {pointsData?.unlockedFeatures?.consistency_insights && (
                          <small className="text-primary fw-semibold d-block mt-1">
                            {getFeatureTimeRemaining(pointsData, 'consistency_insights', timeNow)}
                          </small>
                        )}
                      </div>
                    </div>
                    <div className="mt-auto d-flex align-items-center justify-content-between pt-3 border-top">
                      <span className="fw-bold text-success">500 pts</span>
                      <button 
                        className="btn btn-sm btn-outline-success rounded-pill px-3"
                        disabled={points < 500 || loadingPerk === 'UNLOCK_FEATURE' || isFeatureActive(pointsData, 'consistency_insights')}
                        onClick={async () => {
                          try {
                            setLoadingPerk('UNLOCK_FEATURE');
                            await redeemPerk('UNLOCK_FEATURE', 500, { featureKey: 'consistency_insights', featureName: 'Consistency Insights' });
                            showToast('Consistency Insights unlocked! (-500 pts)', 'success');
                          } catch (err) {
                            showToast(err.message || 'Failed to unlock', 'danger');
                          } finally {
                            setLoadingPerk(null);
                          }
                        }}
                      >
                        {isFeatureActive(pointsData, 'consistency_insights') ? 'Active' : 'Unlock 7 Days'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Additional 7-Day Unlockable Features */}
                {featureList.map(feature => (
                  <div className="col-md-4" key={feature.key}>
                    <div className="card h-100 border-0 shadow-sm p-3 bg-body rounded">
                      <div className="d-flex align-items-center gap-3 mb-2">
                        <span className="fs-1">{feature.icon}</span>
                        <div>
                          <h6 className="fw-bold mb-1">{feature.name}</h6>
                          <small className="text-muted" style={{ fontSize: '0.78rem' }}>{feature.desc}</small>
                          {pointsData?.unlockedFeatures?.[feature.key] && (
                            <small className="text-primary fw-semibold d-block mt-1">
                              {getFeatureTimeRemaining(pointsData, feature.key, timeNow)}
                            </small>
                          )}
                        </div>
                      </div>
                      <div className="mt-auto d-flex align-items-center justify-content-between pt-3 border-top">
                        <span className="fw-bold text-success">{feature.cost} pts</span>
                        <button 
                          className="btn btn-sm btn-outline-success rounded-pill px-3"
                          disabled={points < feature.cost || loadingPerk === `UNLOCK_${feature.key}` || isFeatureActive(pointsData, feature.key)}
                          onClick={async () => {
                            try {
                              setLoadingPerk(`UNLOCK_${feature.key}`);
                              await redeemPerk('UNLOCK_FEATURE', feature.cost, { featureKey: feature.key, featureName: feature.name });
                              showToast(`${feature.name} unlocked! (-${feature.cost} pts)`, 'success');
                            } catch (err) {
                              showToast(err.message || 'Failed to unlock', 'danger');
                            } finally {
                              setLoadingPerk(null);
                            }
                          }}
                        >
                          {isFeatureActive(pointsData, feature.key) ? 'Active' : 'Unlock 7 Days'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Perk 4: Mystery Loot Box */}
                <div className="col-md-4">
                  {(() => {
                    const todayStr = getTodayDateString();
                    const opensToday = pointsData?.mysteryBoxOpens?.[todayStr] || 0;
                    const isLimitReached = opensToday >= 3;

                    return (
                      <div className="card h-100 border-0 shadow-sm p-3 bg-gradient rounded position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #FFF9E6 0%, #FFEDD5 100%)', borderColor: '#FFB703' }}>
                        <span className="position-absolute top-0 end-0 badge bg-warning text-dark m-2 fw-bold" style={{ fontSize: '0.65rem' }}>
                          {isLimitReached ? 'MAX 3/3 🔒' : `${opensToday}/3 Today 🎁`}
                        </span>
                        <div className="d-flex align-items-center gap-3 mb-2">
                          <span className="fs-1 animate-pulse">🎁</span>
                          <div>
                            <h6 className="fw-bold mb-1 text-dark">Mystery Box</h6>
                            <small className="text-dark-50" style={{ fontSize: '0.78rem' }}>Win <strong>250 to 1,200 Points</strong> instantly!</small>
                          </div>
                        </div>
                        <div className="mt-auto d-flex align-items-center justify-content-between pt-3 border-top border-warning-subtle">
                          <div>
                            <span className="fw-bold text-warning-emphasis d-block">500 pts / use</span>
                            <small className="text-muted" style={{ fontSize: '0.65rem' }}>
                              {isLimitReached ? 'Daily limit (3/3) reached' : `Opened ${opensToday}/3 times`}
                            </small>
                          </div>
                          <button 
                            className="btn btn-sm btn-warning text-dark fw-bold rounded-pill px-3 shadow-sm hover-scale"
                            disabled={points < 500 || isOpeningBox || loadingPerk === 'MYSTERY_BOX' || isLimitReached}
                            onClick={handleOpenMysteryBox}
                          >
                            {isOpeningBox ? 'Opening...' : isLimitReached ? 'Limit Reached' : 'Open Box'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                {!isFeatureActive(pointsData, 'history') ? (
                  <div className="text-center py-4 bg-light rounded-3 border p-4">
                    <div className="fs-1 mb-2">🔒</div>
                    <h5 className="fw-bold text-dark mb-1">History Locked</h5>
                    {pointsData?.unlockedFeatures?.history && (
                      <p className="text-danger small fw-semibold mb-3">
                        {getFeatureTimeRemaining(pointsData, 'history', timeNow)}
                      </p>
                    )}
                    <p className="text-muted small mb-3">Pay to unlock full points transaction history for 7 days.</p>
                    <button
                      className="btn btn-warning text-dark fw-bold rounded-pill px-4"
                      disabled={points < 350 || loadingPerk === 'UNLOCK_FEATURE'}
                      onClick={async () => {
                        try {
                          setLoadingPerk('UNLOCK_FEATURE');
                          await redeemPerk('UNLOCK_FEATURE', 350, { featureKey: 'history', featureName: 'History Tab' });
                          showToast('History Tab unlocked for 7 days! (-350 pts)', 'success');
                        } catch (err) {
                          showToast(err.message || 'Failed to unlock History Tab', 'danger');
                        } finally {
                          setLoadingPerk(null);
                        }
                      }}
                    >
                      {loadingPerk === 'UNLOCK_FEATURE' ? 'Unlocking...' : '🔒 Unlock History (350 pts)'}
                    </button>
                  </div>
                ) : history.length === 0 ? (
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
                          Keep your daily streak active! Complete all three daily requirements:
                        </p>
                        <div className="p-2 bg-warning-subtle rounded border border-warning-subtle small fw-medium text-dark">
                          <strong>Requirements:</strong> 3 minutes app usage + 1 journal + 3 planning blocks
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
                          If you miss a day without an active Streak Freeze, your streak resets to 0 and a fixed penalty is deducted:
                        </p>
                        <div className="p-2 bg-danger-subtle rounded border border-danger-subtle small fw-medium text-danger-emphasis mt-1">
                          <strong>Deduction:</strong> 100 base points + (Lost Streak Count × 20)<br/>
                          <em>e.g., losing a 3-Day streak deducts 160 points from your balance.</em>
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
                    <span><i className="bi bi-cart-check me-2"></i>3. Perks & Feature Unlocks</span>
                    <span className="badge bg-info text-dark">UNLOCKS</span>
                  </div>
                  <div className="card-body p-3">
                    <div className="row g-2">
                      <div className="col-6 col-md-4">
                        <div className="p-2 border rounded bg-light">
                          <strong className="d-block text-dark">📄 PDF Export (1000 pts)</strong>
                          <span className="small text-muted">Download PDF reports & plans.</span>
                        </div>
                      </div>
                      <div className="col-6 col-md-4">
                        <div className="p-2 border rounded bg-light">
                          <strong className="d-block text-dark">🔍 Security Scan (500 pts)</strong>
                          <span className="small text-muted">Manual timing-block scan.</span>
                        </div>
                      </div>
                      <div className="col-6 col-md-4">
                        <div className="p-2 border rounded bg-light">
                          <strong className="d-block text-dark">🌙 Islamic Vibe Theme (750 pts)</strong>
                          <span className="small text-muted">Unlock Noor theme & Prayer Checklist.</span>
                        </div>
                      </div>
                      <div className="col-6 col-md-4">
                        <div className="p-2 border rounded bg-light">
                          <strong className="d-block text-dark">📜 History Tab (350 pts)</strong>
                          <span className="small text-muted">View points transaction history.</span>
                        </div>
                      </div>
                      <div className="col-6 col-md-4">
                        <div className="p-2 border rounded bg-light">
                          <strong className="d-block text-dark">📥 Import JSON (50 pts)</strong>
                          <span className="small text-muted">Import backup JSON data.</span>
                        </div>
                      </div>
                      <div className="col-6 col-md-4">
                        <div className="p-2 border rounded bg-light">
                          <strong className="d-block text-dark">🎁 Mystery Box (500 pts / use)</strong>
                          <span className="small text-muted">Win 250 to 1,200 pts reward; average value stays below the 500-point cost.</span>
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

      {/* ── Mystery Box Shaking / Unboxing Overlay ──────────────────────── */}
      {isOpeningBox && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center text-white" 
          style={{ backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1100 }}
        >
          <div className="animate-box-shake fs-1 mb-3" style={{ fontSize: '5rem' }}>🎁</div>
          <h4 className="fw-bold animate-pulse text-warning">Opening Mystery Loot Box...</h4>
          <span className="small text-white-50">Testing your luck...</span>
        </div>
      )}

      {/* ── Mystery Box Win Announcement Modal ──────────────────────────── */}
      {boxReward && (
        <RareEvent
          type={boxReward.tier === 'jackpot' ? 'card' : 'box'}
          result={
            <div className="text-center" style={{ textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
               <div style={{ fontSize: '2.5rem', marginBottom: '10px', color: boxReward.tier === 'jackpot' ? '#ffd700' : 'white' }}>
                 {boxReward.tier === 'jackpot' ? '💎 MEGA JACKPOT 💎' :
                  boxReward.tier === 'rare' ? '🥇 RARE REWARD' :
                  boxReward.tier === 'uncommon' ? '🥈 UNCOMMON REWARD' : '🥉 COMMON REWARD'}
               </div>
               <div style={{ fontSize: '4.5rem', fontWeight: '900', color: '#fff', lineHeight: '1' }}>
                 +{boxReward.wonAmount} <span style={{fontSize:'2rem', fontWeight: 'normal'}}>pts</span>
               </div>
               <div style={{ fontSize: '1.2rem', marginTop: '10px', opacity: 0.9 }}>
                 Added directly to your balance!
               </div>
            </div>
          }
          onClose={() => setBoxReward(null)}
        />
      )}

      {/* ── Streak Freeze Animation ──────────────────────────── */}
      {freezeEvent && (
        <RareEvent
          type="freeze"
          result={
            <div className="text-center" style={{ textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px', color: '#00BFFF' }}>🧊 STREAK FREEZE ACTIVATED</div>
              <div style={{ fontSize: '1.5rem', color: '#fff', opacity: 0.9 }}>Your streak is protected for the next missed day!</div>
              <div style={{ fontSize: '0.85rem', marginTop: '10px', color: '#87CEFA' }}>{perkLimits.freezeMaxPerMonth - (perkLimits.freezeUsesThisMonth || 0)} uses remaining this month</div>
            </div>
          }
          onClose={() => setFreezeEvent(null)}
        />
      )}

      {/* ── Excuse Day Animation ──────────────────────────── */}
      {excuseEvent && (
        <RareEvent
          type="excuse"
          result={
            <div className="text-center" style={{ textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px', color: '#FFD700' }}>🛡️ DAY EXCUSED</div>
              <div style={{ fontSize: '1.5rem', color: '#fff', opacity: 0.9 }}>Yesterday has been forgiven — streak safe!</div>
              <div style={{ fontSize: '0.85rem', marginTop: '10px', color: '#FFA500' }}>{(perkLimits.excuseMaxPerMonth || 2) - (perkLimits.excuseUsesThisMonth || 0)} uses remaining this month</div>
            </div>
          }
          onClose={() => setExcuseEvent(null)}
        />
      )}

      {/* ── Purchase Announcement Modal ──────────────────────────── */}
      {purchaseEvent && (
        <RareEvent
          type="purchase"
          result={<div style={{ fontWeight: '900', filter: 'drop-shadow(0 0 20px #20c997)' }}>{purchaseEvent}</div>}
          onClose={() => setPurchaseEvent(null)}
        />
      )}

    </div>
  );
}
