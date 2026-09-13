import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

export default function WalletPage({ currentUser, onBack, initialDistId }) {
  const [wallet, setWallet] = useState({ accounts: [] });
  const [loading, setLoading] = useState(true);
  
  // Settings & Navigation
  const [walletUI, setWalletUI] = useState(() => localStorage.getItem('wallet-ui-preference') || 'dropdown');
  const [activeAccountId, setActiveAccountId] = useState(null); // If null, shows dashboard
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Wallet Creation/Edit
  const [isWalletFormOpen, setIsWalletFormOpen] = useState(false);
  const [walletForm, setWalletForm] = useState({ id: null, name: '', amount: '' });

  // Account Data Edit
  const [isEditTotalOpen, setIsEditTotalOpen] = useState(false);
  const [editTotalValue, setEditTotalValue] = useState('');
  
  // Distributions & Expenses
  const [isDistOpen, setIsDistOpen] = useState(false);
  const [distForm, setDistForm] = useState({ id: null, name: '', amount: '', percentage: '' });
  
  const [selectedDistId, setSelectedDistId] = useState(initialDistId || null);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ id: null, note: '', amount: '' });

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  
  // Listen for UI preference changes from Settings Modal
  useEffect(() => {
    const handleUiChange = () => setWalletUI(localStorage.getItem('wallet-ui-preference') || 'dropdown');
    window.addEventListener('wallet-ui-changed', handleUiChange);
    return () => window.removeEventListener('wallet-ui-changed', handleUiChange);
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const ref = doc(db, 'wallets', currentUser.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.totalAmount !== undefined && !data.accounts) {
          // Migration from old single wallet structure
          const migratedAccount = {
            id: 'main',
            name: 'Main Wallet',
            amount: data.totalAmount,
            distributions: data.distributions || []
          };
          setDoc(ref, { accounts: [migratedAccount] }, { merge: true });
          setWallet({ accounts: [migratedAccount] });
        } else {
          setWallet(data.accounts ? data : { accounts: [] });
        }
      } else {
        setWallet({ accounts: [] });
      }
      setLoading(false);
    }, (error) => {
      console.error("Wallet snapshot error:", error);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const accounts = wallet.accounts || [];

  // Initialize view based on preferences & deep links
  useEffect(() => {
    if (loading) return;
    if (initialDistId && accounts.length > 0) {
      const acc = accounts.find(a => (a.distributions || []).some(d => d.id === initialDistId));
      if (acc) {
        setActiveAccountId(acc.id);
        setSelectedDistId(initialDistId);
      }
    } else if (!activeAccountId && accounts.length > 0 && walletUI === 'dropdown') {
      setActiveAccountId(accounts[0].id);
    }
  }, [loading, accounts.length, initialDistId, walletUI]);

  const currentAccount = accounts.find(a => a.id === activeAccountId) || (walletUI === 'dropdown' ? accounts[0] : null);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const saveWallet = async (newAccounts) => {
    if (!currentUser?.uid) return;
    try {
      await setDoc(doc(db, 'wallets', currentUser.uid), {
        accounts: newAccounts,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving wallet:', error);
      showToast('Failed to save data', 'danger');
    }
  };

  const handleSaveWalletForm = () => {
    const val = parseFloat(walletForm.amount);
    if (!walletForm.name.trim()) { showToast('Name required', 'danger'); return; }
    if (isNaN(val) || val < 0) { showToast('Invalid amount', 'danger'); return; }
    
    const isEdit = !!walletForm.id;
    const newItem = {
      id: isEdit ? walletForm.id : Date.now().toString(36),
      name: walletForm.name.trim(),
      amount: val,
      distributions: isEdit ? (accounts.find(a => a.id === walletForm.id)?.distributions || []) : []
    };
    
    let newAccounts = [...accounts];
    if (isEdit) {
      newAccounts = newAccounts.map(a => a.id === newItem.id ? newItem : a);
    } else {
      newAccounts.push(newItem);
      if (walletUI === 'dropdown') setActiveAccountId(newItem.id);
    }
    
    saveWallet(newAccounts);
    setIsWalletFormOpen(false);
    showToast(`Wallet ${isEdit ? 'updated' : 'created'}`);
  };
  
  const handleSaveTotal = () => {
    const val = parseFloat(editTotalValue);
    if (isNaN(val) || val < 0) { showToast('Invalid amount', 'danger'); return; }
    
    const newAccounts = accounts.map(a => a.id === activeAccountId ? { ...a, amount: val } : a);
    saveWallet(newAccounts);
    setIsEditTotalOpen(false);
    showToast('Balance updated');
  };

  const handleSaveDist = () => {
    if (!distForm.name.trim()) { showToast('Name required', 'danger'); return; }
    const amt = parseFloat(distForm.amount);
    if (isNaN(amt) || amt < 0) { showToast('Invalid amount', 'danger'); return; }

    const isEdit = !!distForm.id;
    const accountDists = currentAccount.distributions || [];
    const currentTotalDist = accountDists
      .filter(d => d.id !== distForm.id)
      .reduce((sum, d) => sum + d.amount, 0);

    if (currentTotalDist + amt > currentAccount.amount) {
      showToast('Distributed amount exceeds total balance', 'danger');
      return;
    }

    const newItem = {
      id: isEdit ? distForm.id : Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      name: distForm.name.trim(),
      amount: amt,
      expenses: isEdit ? (accountDists.find(d => d.id === distForm.id)?.expenses || []) : []
    };

    let newDistributions = [...accountDists];
    if (isEdit) newDistributions = newDistributions.map(d => d.id === newItem.id ? newItem : d);
    else newDistributions.push(newItem);

    const newAccounts = accounts.map(a => a.id === activeAccountId ? { ...a, distributions: newDistributions } : a);
    saveWallet(newAccounts);
    setIsDistOpen(false);
    showToast(`Category ${isEdit ? 'updated' : 'added'}`);
  };

  const handleDeleteDist = (id) => {
    const newDistributions = (currentAccount.distributions || []).filter(d => d.id !== id);
    const newAccounts = accounts.map(a => a.id === activeAccountId ? { ...a, distributions: newDistributions } : a);
    saveWallet(newAccounts);
    setConfirmDelete(null);
    showToast('Category deleted');
  };

  const handleSaveExpense = () => {
    if (!expenseForm.note.trim()) { showToast('Note required', 'danger'); return; }
    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || amt <= 0) { showToast('Invalid amount', 'danger'); return; }

    const accountDists = currentAccount.distributions || [];
    const distIndex = accountDists.findIndex(d => d.id === selectedDistId);
    if (distIndex === -1) return;

    const dist = { ...accountDists[distIndex] };
    const expenses = dist.expenses || [];
    const isEdit = !!expenseForm.id;
    
    const newItem = {
      id: isEdit ? expenseForm.id : Date.now().toString(36),
      note: expenseForm.note.trim(),
      amount: amt,
      date: isEdit ? (expenses.find(e => e.id === expenseForm.id)?.date || new Date().toISOString()) : new Date().toISOString()
    };

    let newExpenses = [...expenses];
    if (isEdit) newExpenses = newExpenses.map(e => e.id === newItem.id ? newItem : e);
    else newExpenses.push(newItem);
    
    newExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    dist.expenses = newExpenses;
    
    const newDistributions = [...accountDists];
    newDistributions[distIndex] = dist;

    const newAccounts = accounts.map(a => a.id === activeAccountId ? { ...a, distributions: newDistributions } : a);
    saveWallet(newAccounts);
    setIsExpenseOpen(false);
    showToast(`Expense ${isEdit ? 'updated' : 'added'}`);
  };

  const handleDeleteExpense = (distId, expenseId) => {
    const accountDists = currentAccount.distributions || [];
    const distIndex = accountDists.findIndex(d => d.id === distId);
    if (distIndex === -1) return;

    const dist = { ...accountDists[distIndex] };
    dist.expenses = (dist.expenses || []).filter(e => e.id !== expenseId);
    
    const newDistributions = [...accountDists];
    newDistributions[distIndex] = dist;

    const newAccounts = accounts.map(a => a.id === activeAccountId ? { ...a, distributions: newDistributions } : a);
    saveWallet(newAccounts);
    showToast('Expense deleted');
  };

  // Render Expense Detailed Category View
  if (selectedDistId && currentAccount) {
    const dist = (currentAccount.distributions || []).find(d => d.id === selectedDistId);
    if (!dist) {
      if (loading) {
        return (
          <div className="wallet-page w-100 position-fixed top-0 start-0 bottom-0 d-flex justify-content-center align-items-center" style={{ zIndex: 1050, background: '#ECE5DD' }}>
            <div className="spinner-border text-success" role="status"><span className="visually-hidden">Loading...</span></div>
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
      <div className="wallet-page w-100 position-fixed top-0 start-0 bottom-0" style={{ zIndex: 1050, height: '100dvh', background: '#ECE5DD', overflowY: 'auto' }}>
        <div className="container-fluid max-width-container py-3 py-md-4 px-3">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <div className="text-success fw-bold small text-uppercase">{currentAccount.name}</div>
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
                <div className="text-white fw-bold display-6">৳{remaining.toLocaleString()}</div>
              </div>
            </div>
            <div className="progress rounded-pill bg-white bg-opacity-25" style={{ height: '8px' }}>
              <div className="progress-bar bg-white" role="progressbar" style={{ width: `${spentPerc}%` }}></div>
            </div>
            <div className="d-flex justify-content-between text-white-50 small mt-2">
              <span>Spent: ৳{spent.toLocaleString()}</span>
              <span>Allocated: ৳{dist.amount.toLocaleString()}</span>
            </div>
          </div>

          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="fw-bold text-dark m-0"><i className="bi bi-receipt text-warning me-2" />Expense Log</h5>
            <button className="btn btn-success rounded-pill fw-bold btn-sm hover-scale shadow-sm" onClick={() => { setExpenseForm({ id: null, note: '', amount: '' }); setIsExpenseOpen(true); }}>
              <i className="bi bi-plus-lg me-1" /> Add Expense
            </button>
          </div>

          {(!dist.expenses || dist.expenses.length === 0) ? (
            <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white mb-4">
              <i className="bi bi-journal-text fs-1 text-muted mb-2"></i>
              <h6 className="fw-bold text-dark">No expenses logged</h6>
              <p className="text-secondary small mb-3">Track your spending for {dist.name} here.</p>
              <button className="btn btn-outline-success rounded-pill fw-bold" onClick={() => { setExpenseForm({ id: null, note: '', amount: '' }); setIsExpenseOpen(true); }}>
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
                        <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Lunch" value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} />
                      </div>
                      <div>
                        <label className="form-label fw-bold text-secondary">Amount Spent (৳)</label>
                        <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
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

  // Common Header
  const pageHeader = (
    <div className="d-flex align-items-center justify-content-between mb-3">
      <div>
        <div className="text-success fw-bold small text-uppercase">Finance</div>
        <h2 className="fw-bold text-dark mb-0">Wallets</h2>
      </div>
      <button className="btn btn-outline-secondary rounded-pill fw-bold hover-scale" onClick={onBack}>
        <i className="bi bi-arrow-left me-1" /> Back
      </button>
    </div>
  );

  // Render Dashboard Grid UI
  if (walletUI === 'dashboard' && !activeAccountId) {
    return (
      <div className="wallet-page w-100 position-fixed top-0 start-0 bottom-0" style={{ zIndex: 1050, height: '100dvh', background: '#ECE5DD', overflowY: 'auto' }}>
        <div className="container-fluid max-width-container py-3 py-md-4 px-3">
          {pageHeader}
          <div className="row g-3">
            {accounts.map(acc => {
              const accSpent = (acc.distributions || []).reduce((sum, d) => sum + (d.expenses || []).reduce((s, e) => s + e.amount, 0), 0);
              return (
                <div key={acc.id} className="col-12 col-md-6">
                  <div className="card border-0 shadow-sm rounded-4 p-4 hover-scale cursor-pointer h-100" style={{ cursor: 'pointer', background: 'linear-gradient(135deg, #075E54, #128C7E)' }} onClick={() => setActiveAccountId(acc.id)}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div className="text-white-50 fw-semibold"><i className="bi bi-wallet2 me-2" />{acc.name}</div>
                    </div>
                    <div className="text-white fw-bold display-6 mb-2">৳{acc.amount.toLocaleString()}</div>
                    <div className="text-white-50 small">Spent: ৳{accSpent.toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
            <div className="col-12 col-md-6">
              <div className="card border-0 shadow-sm rounded-4 p-4 hover-scale cursor-pointer h-100 d-flex flex-column align-items-center justify-content-center text-success bg-white border" style={{ cursor: 'pointer', minHeight: '140px', borderStyle: 'dashed !important' }} onClick={() => { setWalletForm({ id: null, name: '', amount: '' }); setIsWalletFormOpen(true); }}>
                <i className="bi bi-plus-circle-fill fs-2 mb-2" />
                <div className="fw-bold">Create New Wallet</div>
              </div>
            </div>
          </div>
        </div>
        
        {isWalletFormOpen && (
          <>
            <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsWalletFormOpen(false)}></div>
            <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                    <h5 className="modal-title fw-bold">New Wallet</h5>
                    <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsWalletFormOpen(false)}></button>
                  </div>
                  <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                    <div>
                      <label className="form-label fw-bold text-secondary">Wallet Name</label>
                      <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Business, Savings" value={walletForm.name} onChange={(e) => setWalletForm({ ...walletForm, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label fw-bold text-secondary">Initial Balance (৳)</label>
                      <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={walletForm.amount} onChange={(e) => setWalletForm({ ...walletForm, amount: e.target.value })} />
                    </div>
                  </div>
                  <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                    <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsWalletFormOpen(false)}>Cancel</button>
                    <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveWalletForm}>Create Wallet</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        
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

  // Prepare standard wallet view stats
  let totalDistributed = 0, totalSpentAcrossAll = 0, remaining = 0, distPerc = 0, remainPerc = 0, overallSpentPerc = 0;
  if (currentAccount) {
    totalDistributed = (currentAccount.distributions || []).reduce((sum, d) => sum + d.amount, 0);
    totalSpentAcrossAll = (currentAccount.distributions || []).reduce((sum, d) => sum + (d.expenses || []).reduce((s, e) => s + e.amount, 0), 0);
    remaining = Math.max(0, currentAccount.amount - totalDistributed);
    distPerc = currentAccount.amount > 0 ? (totalDistributed / currentAccount.amount) * 100 : 0;
    remainPerc = Math.max(0, 100 - distPerc);
    overallSpentPerc = currentAccount.amount > 0 ? (totalSpentAcrossAll / currentAccount.amount) * 100 : 0;
  }

  // Ensure there's a fallback UI when no accounts exist (dropdown mode)
  if (!currentAccount && !loading) {
    return (
      <div className="wallet-page w-100 position-fixed top-0 start-0 bottom-0" style={{ zIndex: 1050, height: '100dvh', background: '#ECE5DD', overflowY: 'auto' }}>
        <div className="container-fluid max-width-container py-3 py-md-4 px-3">
          {pageHeader}
          <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white mb-4 mt-5">
            <i className="bi bi-wallet2 fs-1 text-muted mb-2"></i>
            <h6 className="fw-bold text-dark">No Wallets Found</h6>
            <p className="text-secondary small mb-3">Create your first wallet to start managing finances.</p>
            <button className="btn btn-success rounded-pill fw-bold" onClick={() => { setWalletForm({ id: null, name: '', amount: '' }); setIsWalletFormOpen(true); }}>
              <i className="bi bi-plus-lg me-1" /> Create Wallet
            </button>
          </div>
        </div>
        
        {isWalletFormOpen && (
          <>
            <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsWalletFormOpen(false)}></div>
            <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                    <h5 className="modal-title fw-bold">New Wallet</h5>
                    <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsWalletFormOpen(false)}></button>
                  </div>
                  <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                    <div>
                      <label className="form-label fw-bold text-secondary">Wallet Name</label>
                      <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Main Wallet" value={walletForm.name} onChange={(e) => setWalletForm({ ...walletForm, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label fw-bold text-secondary">Initial Balance (৳)</label>
                      <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={walletForm.amount} onChange={(e) => setWalletForm({ ...walletForm, amount: e.target.value })} />
                    </div>
                  </div>
                  <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                    <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsWalletFormOpen(false)}>Cancel</button>
                    <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveWalletForm}>Create Wallet</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-page w-100 position-fixed top-0 start-0 bottom-0" style={{ zIndex: 1050, height: '100dvh', background: '#ECE5DD', overflowY: 'auto' }}>
      <div className="container-fluid max-width-container py-3 py-md-4 px-3">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <div className="text-success fw-bold small text-uppercase">Finance</div>
            {walletUI === 'dashboard' ? (
              <h2 className="fw-bold text-dark mb-0">{currentAccount?.name}</h2>
            ) : (
              <div className="dropdown mt-1 position-relative">
                <button 
                  className="btn btn-light bg-white border rounded-pill fw-bold shadow-sm d-flex align-items-center gap-2" 
                  type="button" 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <i className="bi bi-wallet2 text-success" />
                  {currentAccount?.name}
                  <i className="bi bi-chevron-down ms-1" style={{ fontSize: '0.8rem' }} />
                </button>
                {isDropdownOpen && (
                  <>
                    <div className="position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 1040 }} onClick={() => setIsDropdownOpen(false)}></div>
                    <ul className="dropdown-menu show shadow-lg border-0 rounded-4 mt-2 p-2 position-absolute" style={{ minWidth: '220px', zIndex: 1050, top: '100%', left: 0 }}>
                      {accounts.map(acc => (
                        <li key={acc.id}>
                          <button 
                            className={`dropdown-item rounded-3 mb-1 fw-semibold ${acc.id === activeAccountId ? 'bg-success-subtle text-success' : ''}`} 
                            onClick={() => { setActiveAccountId(acc.id); setIsDropdownOpen(false); }}
                          >
                            <i className={`bi bi-wallet me-2 ${acc.id === activeAccountId ? 'text-success' : 'text-secondary'}`} />
                            {acc.name}
                          </button>
                        </li>
                      ))}
                      <li><hr className="dropdown-divider" /></li>
                      <li>
                        <button className="dropdown-item rounded-3 fw-bold text-success d-flex align-items-center" onClick={() => { setIsDropdownOpen(false); setWalletForm({ id: null, name: '', amount: '' }); setIsWalletFormOpen(true); }}>
                          <i className="bi bi-plus-circle-fill me-2" /> Add New Wallet
                        </button>
                      </li>
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
          <button className="btn btn-outline-secondary rounded-pill fw-bold hover-scale" onClick={walletUI === 'dashboard' ? () => setActiveAccountId(null) : onBack}>
            <i className="bi bi-arrow-left me-1" /> {walletUI === 'dashboard' ? 'Wallets' : 'Back'}
          </button>
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-success" role="status"><span className="visually-hidden">Loading...</span></div>
          </div>
        ) : (
          <>
            <div className="card border-0 shadow-sm rounded-4 p-4 mb-4" style={{ background: 'linear-gradient(135deg, #075E54, #128C7E)' }}>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-white-50 fw-semibold mb-1">Total Balance</div>
                  <div className="text-white fw-bold display-5">৳{currentAccount?.amount.toLocaleString()}</div>
                </div>
                <button
                  className="btn btn-light rounded-circle shadow-sm hover-scale"
                  style={{ width: '48px', height: '48px' }}
                  onClick={() => { setEditTotalValue(currentAccount?.amount.toString() || '0'); setIsEditTotalOpen(true); }}
                >
                  <i className="bi bi-pencil-fill text-success" />
                </button>
              </div>
            </div>

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
                <div className="progress-bar bg-danger progress-bar-striped progress-bar-animated" role="progressbar" style={{ width: `${overallSpentPerc}%` }}></div>
                <div className="progress-bar bg-success" role="progressbar" style={{ width: `${Math.max(0, distPerc - overallSpentPerc)}%` }}></div>
              </div>
            </div>

            <div className="d-flex align-items-center justify-content-between mb-3">
              <h5 className="fw-bold text-dark m-0"><i className="bi bi-list-nested text-warning me-2" />Distributions</h5>
              <button className="btn btn-success rounded-pill fw-bold btn-sm hover-scale shadow-sm" onClick={() => { setDistForm({ id: null, name: '', amount: '', percentage: '' }); setIsDistOpen(true); }}>
                <i className="bi bi-plus-lg me-1" /> Add
              </button>
            </div>

            {!currentAccount?.distributions || currentAccount.distributions.length === 0 ? (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white mb-4">
                <i className="bi bi-inbox fs-1 text-muted mb-2"></i>
                <h6 className="fw-bold text-dark">No distributions yet</h6>
                <p className="text-secondary small mb-3">Divide your total balance into different categories.</p>
                <button className="btn btn-outline-success rounded-pill fw-bold" onClick={() => { setDistForm({ id: null, name: '', amount: '', percentage: '' }); setIsDistOpen(true); }}>
                  <i className="bi bi-plus-lg me-1" /> Add Category
                </button>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3 pb-5">
                {currentAccount.distributions.map(dist => {
                  const spent = (dist.expenses || []).reduce((sum, e) => sum + e.amount, 0);
                  const distRemaining = dist.amount - spent;
                  const spentPerc = dist.amount > 0 ? Math.min((spent / dist.amount) * 100, 100) : 0;
                  const isOverBudget = spent > dist.amount;

                  return (
                    <div key={dist.id} className="card border-0 shadow-sm rounded-4 p-3 hover-scale cursor-pointer" onClick={(e) => { if (!e.target.closest('.action-btns')) setSelectedDistId(dist.id); }}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="d-flex align-items-center gap-3">
                          <div className="rounded-circle d-flex align-items-center justify-content-center text-white bg-success shadow-sm" style={{ width: '40px', height: '40px' }}><i className="bi bi-wallet2" /></div>
                          <div>
                            <div className="fw-bold text-dark">{dist.name}</div>
                            <div className="d-flex align-items-center gap-2"><span className="text-secondary small" style={{ fontSize: '0.8rem' }}>Allocated: ৳{dist.amount.toLocaleString()}</span></div>
                          </div>
                        </div>
                        <div className="d-flex gap-2 action-btns">
                          <button className="btn btn-light rounded-circle shadow-sm" style={{ width: '36px', height: '36px', padding: 0 }} onClick={(e) => { e.stopPropagation(); setDistForm({ id: dist.id, name: dist.name, amount: dist.amount, percentage: currentAccount.amount > 0 ? ((dist.amount / currentAccount.amount) * 100).toFixed(3) : 0 }); setIsDistOpen(true); }}>
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
                          <div className={`progress-bar ${isOverBudget ? 'bg-danger' : spentPerc > 80 ? 'bg-warning' : 'bg-success'}`} role="progressbar" style={{ width: `${spentPerc}%` }}></div>
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

      {isWalletFormOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsWalletFormOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                  <h5 className="modal-title fw-bold">New Wallet</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsWalletFormOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fw-bold text-secondary">Wallet Name</label>
                    <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Business, Savings" value={walletForm.name} onChange={(e) => setWalletForm({ ...walletForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Initial Balance (৳)</label>
                    <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={walletForm.amount} onChange={(e) => setWalletForm({ ...walletForm, amount: e.target.value })} />
                  </div>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsWalletFormOpen(false)}>Cancel</button>
                  <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveWalletForm}>Create Wallet</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Total Modal */}
      {isEditTotalOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsEditTotalOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                  <h5 className="modal-title fw-bold">Edit Balance</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsEditTotalOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light">
                  <label className="form-label fw-bold text-secondary">Total Amount (৳)</label>
                  <input type="number" className="form-control form-control-lg rounded-3 shadow-sm border-0" placeholder="Enter amount" value={editTotalValue} onChange={(e) => setEditTotalValue(e.target.value)} autoFocus />
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsEditTotalOpen(false)}>Cancel</button>
                  <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveTotal}>Save</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Dist Modal */}
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
                    <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Food" value={distForm.name} onChange={(e) => setDistForm({ ...distForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Amount (৳)</label>
                    <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={distForm.amount} onChange={(e) => {
                      const amt = e.target.value;
                      let perc = '';
                      if (amt !== '' && !isNaN(amt) && currentAccount.amount > 0) perc = ((parseFloat(amt) / currentAccount.amount) * 100).toFixed(3);
                      setDistForm({ ...distForm, amount: amt, percentage: perc });
                    }} />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Percentage (%)</label>
                    <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter percentage" value={distForm.percentage} onChange={(e) => {
                      const perc = e.target.value;
                      let amt = '';
                      if (perc !== '' && !isNaN(perc) && currentAccount.amount > 0) amt = ((parseFloat(perc) / 100) * currentAccount.amount).toFixed(2);
                      setDistForm({ ...distForm, percentage: perc, amount: amt });
                    }} />
                  </div>
                  <div className="bg-white p-2 rounded-3 border text-center small text-secondary">
                    Total Balance: <strong>৳{currentAccount?.amount.toLocaleString()}</strong>
                  </div>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsDistOpen(false)}>Cancel</button>
                  <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveDist}>Save</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Category Modal */}
      {confirmDelete && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setConfirmDelete(null)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}>
                  <h5 className="modal-title fw-bold d-flex align-items-center gap-2"><i className="bi bi-trash3-fill"></i> Delete Category</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setConfirmDelete(null)}></button>
                </div>
                <div className="modal-body p-4 bg-light text-center">
                  <h5 className="fw-bold text-dark mb-2">Are you sure?</h5>
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
