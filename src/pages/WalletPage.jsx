import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

export default function WalletPage({ currentUser, onBack, initialDistId }) {
  const [wallet, setWallet] = useState({ totalAmount: 0, distributions: [] });
  const [loading, setLoading] = useState(true);
  const [isEditTotalOpen, setIsEditTotalOpen] = useState(false);
  const [editTotalValue, setEditTotalValue] = useState('');
  
  const [isDistOpen, setIsDistOpen] = useState(false);
  const [distForm, setDistForm] = useState({ id: null, name: '', amount: '', percentage: '' });
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  // New states for Expense Tracking
  const [selectedDistId, setSelectedDistId] = useState(initialDistId || null);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ id: null, note: '', amount: '' });

  useEffect(() => {
    if (!currentUser?.uid) return;
    const ref = doc(db, 'wallets', currentUser.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setWallet(snap.data());
      } else {
        setWallet({ totalAmount: 0, distributions: [] });
      }
      setLoading(false);
    }, (error) => {
      console.error("Wallet snapshot error:", error);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const saveWallet = async (newWallet) => {
    if (!currentUser?.uid) return;
    try {
      await setDoc(doc(db, 'wallets', currentUser.uid), {
        ...newWallet,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving wallet:', error);
      showToast('Failed to save data', 'danger');
    }
  };

  const handleSaveTotal = () => {
    const val = parseFloat(editTotalValue);
    if (isNaN(val) || val < 0) {
      showToast('Please enter a valid positive number', 'danger');
      return;
    }
    const newWallet = { ...wallet, totalAmount: val };
    saveWallet(newWallet);
    setIsEditTotalOpen(false);
    showToast('Total amount updated');
  };

  const handleAmountChange = (e) => {
    const amt = e.target.value;
    setDistForm(prev => {
      let perc = '';
      if (amt !== '' && !isNaN(amt) && wallet.totalAmount > 0) {
        perc = ((parseFloat(amt) / wallet.totalAmount) * 100).toFixed(3);
      }
      return { ...prev, amount: amt, percentage: perc };
    });
  };

  const handlePercentageChange = (e) => {
    const perc = e.target.value;
    setDistForm(prev => {
      let amt = '';
      if (perc !== '' && !isNaN(perc) && wallet.totalAmount > 0) {
        amt = ((parseFloat(perc) / 100) * wallet.totalAmount).toFixed(2);
      }
      return { ...prev, percentage: perc, amount: amt };
    });
  };

  const handleSaveDist = () => {
    if (!distForm.name.trim()) {
      showToast('Name is required', 'danger');
      return;
    }
    const amt = parseFloat(distForm.amount);
    if (isNaN(amt) || amt < 0) {
      showToast('Invalid amount', 'danger');
      return;
    }

    const isEdit = !!distForm.id;
    const currentTotalDist = wallet.distributions
      .filter(d => d.id !== distForm.id)
      .reduce((sum, d) => sum + d.amount, 0);

    if (currentTotalDist + amt > wallet.totalAmount) {
      showToast('Total distributed amount cannot exceed total balance', 'danger');
      return;
    }

    const newItem = {
      id: isEdit ? distForm.id : Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      name: distForm.name.trim(),
      amount: amt,
      expenses: isEdit ? (wallet.distributions.find(d => d.id === distForm.id)?.expenses || []) : []
    };

    let newDistributions = [...wallet.distributions];
    if (isEdit) {
      newDistributions = newDistributions.map(d => d.id === newItem.id ? newItem : d);
    } else {
      newDistributions.push(newItem);
    }

    saveWallet({ ...wallet, distributions: newDistributions });
    setIsDistOpen(false);
    showToast(`Category ${isEdit ? 'updated' : 'added'}`);
  };

  const handleDeleteDist = (id) => {
    const newDistributions = wallet.distributions.filter(d => d.id !== id);
    saveWallet({ ...wallet, distributions: newDistributions });
    setConfirmDelete(null);
    showToast('Category deleted');
  };

  const openEditDist = (dist) => {
    const perc = wallet.totalAmount > 0 ? ((dist.amount / wallet.totalAmount) * 100).toFixed(3) : 0;
    setDistForm({ id: dist.id, name: dist.name, amount: dist.amount, percentage: perc });
    setIsDistOpen(true);
  };

  const openAddDist = () => {
    setDistForm({ id: null, name: '', amount: '', percentage: '' });
    setIsDistOpen(true);
  };

  // Expense Tracking Functions
  const handleSaveExpense = () => {
    if (!expenseForm.note.trim()) {
      showToast('Note is required', 'danger');
      return;
    }
    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Invalid amount', 'danger');
      return;
    }

    const distIndex = wallet.distributions.findIndex(d => d.id === selectedDistId);
    if (distIndex === -1) return;

    const newDistributions = [...wallet.distributions];
    const dist = { ...newDistributions[distIndex] };
    const expenses = dist.expenses || [];

    const isEdit = !!expenseForm.id;
    const newItem = {
      id: isEdit ? expenseForm.id : Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      note: expenseForm.note.trim(),
      amount: amt,
      date: isEdit ? (expenses.find(e => e.id === expenseForm.id)?.date || new Date().toISOString()) : new Date().toISOString()
    };

    let newExpenses = [...expenses];
    if (isEdit) {
      newExpenses = newExpenses.map(e => e.id === newItem.id ? newItem : e);
    } else {
      newExpenses.push(newItem);
    }
    
    newExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    dist.expenses = newExpenses;
    newDistributions[distIndex] = dist;

    saveWallet({ ...wallet, distributions: newDistributions });
    setIsExpenseOpen(false);
    showToast(`Expense ${isEdit ? 'updated' : 'added'}`);
  };

  const handleDeleteExpense = (distId, expenseId) => {
    const distIndex = wallet.distributions.findIndex(d => d.id === distId);
    if (distIndex === -1) return;

    const newDistributions = [...wallet.distributions];
    const dist = { ...newDistributions[distIndex] };
    dist.expenses = (dist.expenses || []).filter(e => e.id !== expenseId);
    newDistributions[distIndex] = dist;

    saveWallet({ ...wallet, distributions: newDistributions });
    showToast('Expense deleted');
  };

  const openAddExpense = () => {
    setExpenseForm({ id: null, note: '', amount: '' });
    setIsExpenseOpen(true);
  };

  // Render Detailed Category View
  if (selectedDistId) {
    const dist = wallet.distributions.find(d => d.id === selectedDistId);
    if (!dist) {
      if (loading) {
        return (
          <div className="wallet-page w-100 position-fixed top-0 start-0 bottom-0 d-flex justify-content-center align-items-center" style={{ zIndex: 1050, background: '#ECE5DD' }}>
            <div className="spinner-border text-success" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        );
      }
      setSelectedDistId(null);
      return null;
    }
    const spent = (dist.expenses || []).reduce((sum, e) => sum + e.amount, 0);
    const remaining = dist.amount - spent;
    const spentPerc = dist.amount > 0 ? Math.min((spent / dist.amount) * 100, 100) : 0;
    const isOverBudget = spent > dist.amount;

    return (
      <div
        className="wallet-page w-100 position-fixed top-0 start-0 bottom-0"
        style={{ zIndex: 1050, height: '100dvh', background: '#ECE5DD', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="container-fluid max-width-container py-3 py-md-4 px-3">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <div className="text-success fw-bold small text-uppercase">Distribution</div>
              <h2 className="fw-bold text-dark mb-0">{dist.name}</h2>
            </div>
            <button className="btn btn-outline-secondary rounded-pill fw-bold hover-scale" onClick={() => setSelectedDistId(null)}>
              <i className="bi bi-arrow-left me-1" /> Back
            </button>
          </div>

          <div className="card border-0 shadow-sm rounded-4 p-4 mb-4" style={{ background: isOverBudget ? 'linear-gradient(135deg, #c62828, #e53935)' : 'linear-gradient(135deg, #075E54, #128C7E)' }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <div className="text-white-50 fw-semibold mb-1">Remaining Budget</div>
                <div className="text-white fw-bold display-6">
                  ৳{remaining.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="progress rounded-pill bg-white bg-opacity-25" style={{ height: '8px' }}>
              <div
                className="progress-bar bg-white"
                role="progressbar"
                style={{ width: `${spentPerc}%` }}
              ></div>
            </div>
            <div className="d-flex justify-content-between text-white-50 small mt-2">
              <span>Spent: ৳{spent.toLocaleString()}</span>
              <span>Allocated: ৳{dist.amount.toLocaleString()}</span>
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="fw-bold text-dark m-0"><i className="bi bi-receipt text-warning me-2" />Expense Log</h5>
            <button className="btn btn-success rounded-pill fw-bold btn-sm hover-scale shadow-sm" onClick={openAddExpense}>
              <i className="bi bi-plus-lg me-1" /> Add Expense
            </button>
          </div>

          {(!dist.expenses || dist.expenses.length === 0) ? (
            <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white mb-4">
              <i className="bi bi-journal-text fs-1 text-muted mb-2"></i>
              <h6 className="fw-bold text-dark">No expenses logged</h6>
              <p className="text-secondary small mb-3">Track your spending for {dist.name} here.</p>
              <button className="btn btn-outline-success rounded-pill fw-bold" onClick={openAddExpense}>
                <i className="bi bi-plus-lg me-1" /> Add First Expense
              </button>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3 pb-5">
              {(dist.expenses || []).map(exp => (
                <div key={exp.id} className="card border-0 shadow-sm rounded-4 p-3 hover-scale">
                  <div className="d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-3">
                      <div className="rounded-circle d-flex align-items-center justify-content-center bg-danger bg-opacity-10 text-danger" style={{ width: '40px', height: '40px', minWidth: '40px' }}>
                        <i className="bi bi-arrow-down-right" />
                      </div>
                      <div style={{ wordBreak: 'break-word' }}>
                        <div className="fw-bold text-dark">{exp.note}</div>
                        <div className="text-muted small" style={{ fontSize: '0.75rem' }}>{new Date(exp.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                    <div className="d-flex align-items-center gap-2 ms-2">
                      <div className="fw-bold text-danger whitespace-nowrap">-৳{exp.amount.toLocaleString()}</div>
                      <button className="btn btn-light rounded-circle shadow-sm flex-shrink-0" style={{ width: '32px', height: '32px', padding: 0 }} onClick={() => handleDeleteExpense(dist.id, exp.id)}>
                        <i className="bi bi-trash3-fill text-danger small" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Expense Modal */}
          {isExpenseOpen && (
            <>
              <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsExpenseOpen(false)}></div>
              <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                    <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                      <h5 className="modal-title fw-bold">Add Expense</h5>
                      <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsExpenseOpen(false)}></button>
                    </div>
                    <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                      <div>
                        <label className="form-label fw-bold text-secondary">Note / Description</label>
                        <input
                          type="text"
                          className="form-control rounded-3 shadow-sm border-0"
                          placeholder="e.g. Lunch at KFC"
                          value={expenseForm.note}
                          onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="form-label fw-bold text-secondary">Amount Spent (৳)</label>
                        <input
                          type="number"
                          className="form-control rounded-3 shadow-sm border-0"
                          placeholder="Enter amount"
                          value={expenseForm.amount}
                          onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                      <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsExpenseOpen(false)}>Cancel</button>
                      <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveExpense}>Save Expense</button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Toast inside detail view */}
          {toast.show && (
            <div className="position-fixed top-0 start-50 translate-middle-x mt-3 shadow-lg animate-slide-down-toast-container" style={{ zIndex: 2000, width: 'min(92vw, 400px)' }}>
              <div className={`toast show align-items-center border-0 rounded-4 text-white px-3 py-2 bg-${toast.type === 'danger' ? 'danger' : 'success'}`}>
                <div className="d-flex align-items-center gap-2">
                  <i className={`bi bi-${toast.type === 'danger' ? 'exclamation-triangle-fill' : 'check-circle-fill'} fs-5`} />
                  <span className="fw-bold small flex-grow-1">{toast.message}</span>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setToast({ ...toast, show: false })}></button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const totalDistributed = wallet.distributions.reduce((sum, d) => sum + d.amount, 0);
  const totalSpentAcrossAll = wallet.distributions.reduce((sum, d) => sum + (d.expenses || []).reduce((s, e) => s + e.amount, 0), 0);
  const remaining = Math.max(0, wallet.totalAmount - totalDistributed);
  const distPerc = wallet.totalAmount > 0 ? (totalDistributed / wallet.totalAmount) * 100 : 0;
  const remainPerc = Math.max(0, 100 - distPerc);
  const overallSpentPerc = wallet.totalAmount > 0 ? (totalSpentAcrossAll / wallet.totalAmount) * 100 : 0;

  return (
    <div
      className="wallet-page w-100 position-fixed top-0 start-0 bottom-0"
      style={{
        zIndex: 1050,
        height: '100dvh',
        background: '#ECE5DD',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div className="container-fluid max-width-container py-3 py-md-4 px-3">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <div className="text-success fw-bold small text-uppercase">Finance</div>
            <h2 className="fw-bold text-dark mb-0">Wallet</h2>
            <div className="text-secondary small">Manage your money and distributions.</div>
          </div>
          <button className="btn btn-outline-secondary rounded-pill fw-bold hover-scale" onClick={onBack}>
            <i className="bi bi-arrow-left me-1" /> Back
          </button>
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-success" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Balance Card */}
            <div className="card border-0 shadow-sm rounded-4 p-4 mb-4" style={{ background: 'linear-gradient(135deg, #075E54, #128C7E)' }}>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-white-50 fw-semibold mb-1">Total Balance</div>
                  <div className="text-white fw-bold display-5">
                    ৳{wallet.totalAmount.toLocaleString()}
                  </div>
                </div>
                <button
                  className="btn btn-light rounded-circle shadow-sm hover-scale"
                  style={{ width: '48px', height: '48px' }}
                  onClick={() => {
                    setEditTotalValue(wallet.totalAmount.toString());
                    setIsEditTotalOpen(true);
                  }}
                >
                  <i className="bi bi-pencil-fill text-success" />
                </button>
              </div>
            </div>

            {/* Summary Card */}
            <div className="card border-0 shadow-sm rounded-4 p-3 mb-4">
              <h5 className="fw-bold text-dark mb-3"><i className="bi bi-pie-chart-fill text-primary me-2" />Summary</h5>
              
              <div className="row g-3 mb-3">
                <div className="col-4">
                  <div className="p-2 bg-light rounded-3 border h-100">
                    <div className="text-secondary small fw-semibold" style={{ fontSize: '0.7rem' }}>Allocated</div>
                    <div className="fs-6 fw-bold text-dark">৳{totalDistributed.toLocaleString()}</div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="p-2 bg-light rounded-3 border h-100">
                    <div className="text-secondary small fw-semibold" style={{ fontSize: '0.7rem' }}>Total Spent</div>
                    <div className="fs-6 fw-bold text-danger">৳{totalSpentAcrossAll.toLocaleString()}</div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="p-2 bg-light rounded-3 border h-100">
                    <div className="text-secondary small fw-semibold" style={{ fontSize: '0.7rem' }}>Unallocated</div>
                    <div className="fs-6 fw-bold text-success">৳{remaining.toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="d-flex justify-content-between text-muted small mb-1">
                <span>Budget Spent: {overallSpentPerc.toFixed(1)}%</span>
              </div>
              <div className="progress rounded-pill bg-light border" style={{ height: '20px' }}>
                <div
                  className="progress-bar bg-danger progress-bar-striped progress-bar-animated"
                  role="progressbar"
                  style={{ width: `${overallSpentPerc}%` }}
                ></div>
                <div
                  className="progress-bar bg-success"
                  role="progressbar"
                  style={{ width: `${Math.max(0, distPerc - overallSpentPerc)}%` }}
                ></div>
              </div>
            </div>

            {/* Distribution List */}
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h5 className="fw-bold text-dark m-0"><i className="bi bi-list-nested text-warning me-2" />Distributions</h5>
              <button className="btn btn-success rounded-pill fw-bold btn-sm hover-scale shadow-sm" onClick={openAddDist}>
                <i className="bi bi-plus-lg me-1" /> Add
              </button>
            </div>

            {wallet.distributions.length === 0 ? (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white mb-4">
                <i className="bi bi-inbox fs-1 text-muted mb-2"></i>
                <h6 className="fw-bold text-dark">No distributions yet</h6>
                <p className="text-secondary small mb-3">Divide your total balance into different categories.</p>
                <button className="btn btn-outline-success rounded-pill fw-bold" onClick={openAddDist}>
                  <i className="bi bi-plus-lg me-1" /> Add First Category
                </button>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3 pb-5">
                {wallet.distributions.map(dist => {
                  const spent = (dist.expenses || []).reduce((sum, e) => sum + e.amount, 0);
                  const distRemaining = dist.amount - spent;
                  const spentPerc = dist.amount > 0 ? Math.min((spent / dist.amount) * 100, 100) : 0;
                  const isOverBudget = spent > dist.amount;

                  return (
                    <div 
                      key={dist.id} 
                      className="card border-0 shadow-sm rounded-4 p-3 hover-scale cursor-pointer"
                      onClick={(e) => { 
                        if (!e.target.closest('.action-btns')) setSelectedDistId(dist.id); 
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="d-flex align-items-center gap-3">
                          <div
                            className="rounded-circle d-flex align-items-center justify-content-center text-white bg-success shadow-sm"
                            style={{ width: '40px', height: '40px' }}
                          >
                            <i className="bi bi-wallet2" />
                          </div>
                          <div>
                            <div className="fw-bold text-dark">{dist.name}</div>
                            <div className="d-flex align-items-center gap-2">
                              <span className="text-secondary small" style={{ fontSize: '0.8rem' }}>Allocated: ৳{dist.amount.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="d-flex gap-2 action-btns">
                          <button className="btn btn-light rounded-circle shadow-sm" style={{ width: '36px', height: '36px', padding: 0 }} onClick={(e) => { e.stopPropagation(); openEditDist(dist); }}>
                            <i className="bi bi-pencil-fill text-primary" />
                          </button>
                          <button className="btn btn-light rounded-circle shadow-sm" style={{ width: '36px', height: '36px', padding: 0 }} onClick={(e) => { e.stopPropagation(); setConfirmDelete(dist.id); }}>
                            <i className="bi bi-trash3-fill text-danger" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-1">
                        <div className="d-flex justify-content-between text-muted mb-1" style={{ fontSize: '0.8rem' }}>
                          <span>Spent: <strong className={isOverBudget ? 'text-danger' : 'text-dark'}>৳{spent.toLocaleString()}</strong></span>
                          <span>Left: <strong className={isOverBudget ? 'text-danger' : 'text-success'}>৳{distRemaining.toLocaleString()}</strong></span>
                        </div>
                        <div className="progress rounded-pill bg-light border" style={{ height: '8px' }}>
                          <div
                            className={`progress-bar ${isOverBudget ? 'bg-danger' : spentPerc > 80 ? 'bg-warning' : 'bg-success'}`}
                            role="progressbar"
                            style={{ width: `${spentPerc}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Total Modal */}
      {isEditTotalOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsEditTotalOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                  <h5 className="modal-title fw-bold">Edit Total Balance</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsEditTotalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <label className="form-label fw-bold text-secondary">Total Amount (৳)</label>
                  <input
                    type="number"
                    className="form-control form-control-lg rounded-3 shadow-sm border-0"
                    placeholder="Enter total amount"
                    value={editTotalValue}
                    onChange={(e) => setEditTotalValue(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsEditTotalOpen(false)}>Cancel</button>
                  <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveTotal}>Save Balance</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Distribution Modal */}
      {isDistOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsDistOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                  <h5 className="modal-title fw-bold">{distForm.id ? 'Edit Category' : 'Add Category'}</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsDistOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fw-bold text-secondary">Category Name</label>
                    <input
                      type="text"
                      className="form-control rounded-3 shadow-sm border-0"
                      placeholder="e.g. Family, Food, Savings"
                      value={distForm.name}
                      onChange={(e) => setDistForm({ ...distForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Amount (৳)</label>
                    <input
                      type="number"
                      className="form-control rounded-3 shadow-sm border-0"
                      placeholder="Enter amount"
                      value={distForm.amount}
                      onChange={handleAmountChange}
                    />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Percentage (%)</label>
                    <input
                      type="number"
                      className="form-control rounded-3 shadow-sm border-0"
                      placeholder="Enter percentage"
                      value={distForm.percentage}
                      onChange={handlePercentageChange}
                    />
                  </div>
                  <div className="bg-white p-2 rounded-3 border text-center small text-secondary">
                    Total Balance: <strong>৳{wallet.totalAmount.toLocaleString()}</strong>
                  </div>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsDistOpen(false)}>Cancel</button>
                  <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveDist}>Save Category</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setConfirmDelete(null)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}>
                  <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                    <i className="bi bi-trash3-fill"></i> Delete Category
                  </h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setConfirmDelete(null)}></button>
                </div>
                <div className="modal-body p-4 bg-light text-center">
                  <h5 className="fw-bold text-dark mb-2">Are you sure?</h5>
                  <p className="text-secondary mb-0">This will remove the distribution category and update your remaining balance.</p>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4 d-flex justify-content-center gap-2">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  <button className="btn text-white rounded-pill px-4 py-2 fw-bold shadow-sm" style={{ background: '#c62828' }} onClick={() => handleDeleteDist(confirmDelete)}>Delete</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div className="position-fixed top-0 start-50 translate-middle-x mt-3 shadow-lg animate-slide-down-toast-container" style={{ zIndex: 2000, width: 'min(92vw, 400px)' }}>
          <div className={`toast show align-items-center border-0 rounded-4 text-white px-3 py-2 bg-${toast.type === 'danger' ? 'danger' : 'success'}`}>
            <div className="d-flex align-items-center gap-2">
              <i className={`bi bi-${toast.type === 'danger' ? 'exclamation-triangle-fill' : 'check-circle-fill'} fs-5`} />
              <span className="fw-bold small flex-grow-1">{toast.message}</span>
              <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setToast({ ...toast, show: false })}></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
