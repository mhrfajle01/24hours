import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase/firebase';
import { doc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import QuickTrackerPage from './QuickTrackerPage';

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
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState(null);

  // Transfer & Deposit
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ from: 'main', to: '', amount: '', note: '' });
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositForm, setDepositForm] = useState({ targetId: 'main', amount: '', note: '' });

  // Main Mode: 'wallets' or 'savings'
  const [activeMainTab, setActiveMainTab] = useState('wallets');

  // Savings State
  const [savingsList, setSavingsList] = useState([]);
  const [isSavingsFormOpen, setIsSavingsFormOpen] = useState(false);
  const [savingsForm, setSavingsForm] = useState({ id: null, name: '', targetAmount: '', category: 'monthly', note: '' });
  const [isSavingsTransferOpen, setIsSavingsTransferOpen] = useState(false);
  const [savingsTransferForm, setSavingsTransferForm] = useState({
    savingId: '',
    walletId: '',
    amount: '',
    type: 'deposit',
    mode: 'single', // 'single' | 'split'
    splitAllocations: {}, // { [walletId]: amount }
    note: ''
  });
  const [savingsFilter, setSavingsFilter] = useState('ALL');
  const [confirmDeleteSaving, setConfirmDeleteSaving] = useState(null);
  const [viewSavingsHistory, setViewSavingsHistory] = useState(null);
  const [isQuickBazarOpen, setIsQuickBazarOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportRange, setReportRange] = useState('all'); // 'all' | 'today' | 'month'
  const [reportWalletScope, setReportWalletScope] = useState('all'); // 'all' | walletId
  
  // Listen for UI preference changes from Settings Modal
  const getDistBalance = useCallback((wallet, distId) => {
    const dist = (wallet?.distributions || []).find(d => d.id === distId);
    if (!dist) return 0;
    const distTxns = wallet.transactions || [];
    const added = distTxns.reduce((sum, t) => {
      if (t.type === 'deposit' && t.targetId === distId) return sum + t.amount;
      if (t.type === 'transfer' && t.to === distId) return sum + t.amount;
      if (t.type === 'transfer' && t.from === distId) return sum - t.amount;
      return sum;
    }, 0);
    const spent = (dist.expenses || []).reduce((sum, e) => sum + e.amount, 0);
    return dist.amount + added - spent;
  }, []);

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
          setSavingsList(data.savings || []);
        }
      } else {
        setWallet({ accounts: [] });
        setSavingsList([]);
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

  const saveWallet = async (newAccounts, newSavings = null) => {
    if (!currentUser?.uid) return;
    try {
      const payload = {
        accounts: newAccounts,
        updatedAt: serverTimestamp()
      };
      if (newSavings !== null) {
        payload.savings = newSavings;
      }
      await setDoc(doc(db, 'wallets', currentUser.uid), payload, { merge: true });
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

  const logTransaction = (account, txn) => {
    const txns = account.transactions || [];
    return { ...account, transactions: [{ id: Date.now().toString(36), date: new Date().toISOString(), ...txn }, ...txns] };
  };

  const handleDeposit = () => {
    const amt = parseFloat(depositForm.amount);
    if (isNaN(amt) || amt <= 0) { showToast('Invalid amount', 'danger'); return; }
    
    let updatedAccount = { ...currentAccount };
    
    if (depositForm.targetId === 'main') {
      updatedAccount.amount += amt;
    } else {
      // We don't mutate dist.amount anymore; it represents the fixed budget.
      // The deposit is simply logged in transactions and dynamically calculated.
    }
    
    updatedAccount = logTransaction(updatedAccount, {
      type: 'deposit',
      targetId: depositForm.targetId,
      amount: amt,
      note: depositForm.note || 'Deposit'
    });

    const newAccounts = accounts.map(a => a.id === activeAccountId ? updatedAccount : a);
    saveWallet(newAccounts);
    setIsDepositOpen(false);
    showToast('Funds added successfully');
  };

  const handleTransfer = () => {
    const amt = parseFloat(transferForm.amount);
    if (isNaN(amt) || amt <= 0) { showToast('Invalid amount', 'danger'); return; }
    if (transferForm.from === transferForm.to) { showToast('Cannot transfer to same account', 'danger'); return; }
    if (!transferForm.to) { showToast('Select a destination', 'danger'); return; }

    const [fromWalletId, fromId] = transferForm.from.split(':');
    const [toWalletId, toId] = transferForm.to.split(':');

    // Deep clone accounts
    let newAccounts = JSON.parse(JSON.stringify(accounts));
    const sourceWallet = newAccounts.find(a => a.id === fromWalletId);
    const targetWallet = newAccounts.find(a => a.id === toWalletId);

    if (!sourceWallet || !targetWallet) { showToast('Error locating wallets', 'danger'); return; }

    // Check balances
    let sourceBalance = 0;
    if (fromId === 'main') sourceBalance = sourceWallet.amount;
    else sourceBalance = getDistBalance(sourceWallet, fromId);
    
    if (amt > sourceBalance) { showToast('Insufficient funds', 'danger'); return; }

    // Deduct from source (only mutate if it's the main account)
    if (fromId === 'main') sourceWallet.amount -= amt;

    // Add to target (only mutate if it's the main account)
    if (toId === 'main') targetWallet.amount += amt;

    // Log transaction
    const txnBase = { amount: amt, note: transferForm.note || 'Transfer', type: 'transfer' };
    
    if (fromWalletId === toWalletId) {
      // Intra-wallet transfer
      sourceWallet.transactions = [{
        id: Date.now().toString(36), date: new Date().toISOString(), ...txnBase, from: fromId, to: toId
      }, ...(sourceWallet.transactions || [])];
    } else {
      // Inter-wallet transfer
      sourceWallet.transactions = [{
        id: Date.now().toString(36), date: new Date().toISOString(), ...txnBase, from: fromId, to: `${toWalletId}:${toId}`, note: transferForm.note || `Transfer to ${targetWallet.name}`
      }, ...(sourceWallet.transactions || [])];
      
      targetWallet.transactions = [{
        id: Date.now().toString(36) + 'R', date: new Date().toISOString(), ...txnBase, from: `${fromWalletId}:${fromId}`, to: toId, note: transferForm.note || `Transfer from ${sourceWallet.name}`
      }, ...(targetWallet.transactions || [])];
    }

    saveWallet(newAccounts);
    setIsTransferOpen(false);
    showToast('Transfer complete');
  };

  // --- Savings Operations ---
  const handleSaveSavingGoal = () => {
    if (!savingsForm.name.trim()) { showToast('Name required', 'danger'); return; }
    const target = parseFloat(savingsForm.targetAmount);
    if (isNaN(target) || target <= 0) { showToast('Valid target amount required', 'danger'); return; }

    const isEdit = !!savingsForm.id;
    let updatedSavings = [...savingsList];

    if (isEdit) {
      updatedSavings = updatedSavings.map(s => s.id === savingsForm.id ? {
        ...s,
        name: savingsForm.name.trim(),
        targetAmount: target,
        category: savingsForm.category,
        note: savingsForm.note.trim()
      } : s);
    } else {
      updatedSavings.push({
        id: Date.now().toString(36),
        name: savingsForm.name.trim(),
        targetAmount: target,
        currentAmount: 0,
        category: savingsForm.category,
        note: savingsForm.note.trim(),
        createdAt: new Date().toISOString()
      });
    }

    saveWallet(accounts, updatedSavings);
    setSavingsList(updatedSavings);
    setIsSavingsFormOpen(false);
    showToast(`Savings goal ${isEdit ? 'updated' : 'created'}`);
  };

  const handleDeleteSavingGoal = (id) => {
    const updatedSavings = savingsList.filter(s => s.id !== id);
    saveWallet(accounts, updatedSavings);
    setSavingsList(updatedSavings);
    setConfirmDeleteSaving(null);
    showToast('Savings goal deleted');
  };

  const handleSavingsTransfer = () => {
    const isDeposit = savingsTransferForm.type === 'deposit';
    const isSplit = isDeposit && savingsTransferForm.mode === 'split';
    const savingIdx = savingsList.findIndex(s => s.id === savingsTransferForm.savingId);
    if (savingIdx === -1) { showToast('Savings goal not found', 'danger'); return; }

    const txNote = (savingsTransferForm.note || '').trim();
    let newAccounts = JSON.parse(JSON.stringify(accounts));
    let newSavings = JSON.parse(JSON.stringify(savingsList));

    if (isSplit) {
      // Split / Multi-Source Deposit (Wallets and Distributions)
      const allocations = savingsTransferForm.splitAllocations || {};
      const activeEntries = Object.entries(allocations).filter(([_, val]) => parseFloat(val) > 0);
      if (activeEntries.length === 0) {
        showToast('Please allocate an amount to at least one source', 'danger');
        return;
      }

      let totalAllocated = 0;
      const sourcesSummary = [];

      for (const [compositeKey, valStr] of activeEntries) {
        const val = parseFloat(valStr);
        const [wId, distId] = compositeKey.includes(':') ? compositeKey.split(':') : [compositeKey, 'main'];
        const wIdx = newAccounts.findIndex(a => a.id === wId);
        if (wIdx === -1) continue;

        let availableBal = 0;
        let sourceLabel = '';
        if (distId === 'main') {
          availableBal = newAccounts[wIdx].amount;
          sourceLabel = `${newAccounts[wIdx].name} (Main)`;
        } else {
          availableBal = getDistBalance(newAccounts[wIdx], distId);
          const dObj = (newAccounts[wIdx].distributions || []).find(d => d.id === distId);
          sourceLabel = `${newAccounts[wIdx].name} ➔ ${dObj?.name || 'Distribution'}`;
        }

        if (val > availableBal) {
          showToast(`Insufficient balance in ${sourceLabel}`, 'danger');
          return;
        }

        totalAllocated += val;
        if (distId === 'main') {
          newAccounts[wIdx].amount -= val;
        }

        newAccounts[wIdx].transactions = [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
          date: new Date().toISOString(),
          amount: val,
          type: 'transfer',
          from: distId,
          to: `saving:${newSavings[savingIdx].name}`,
          note: txNote || `Transfer to Savings from ${sourceLabel}: ${newSavings[savingIdx].name}`
        }, ...(newAccounts[wIdx].transactions || [])];

        sourcesSummary.push({
          sourceLabel,
          amount: val
        });
      }

      newSavings[savingIdx].currentAmount = (newSavings[savingIdx].currentAmount || 0) + totalAllocated;
      const histEntry = {
        id: Date.now().toString(36),
        date: new Date().toISOString(),
        type: 'deposit',
        amount: totalAllocated,
        walletName: sourcesSummary.map(s => `${s.sourceLabel} (৳${s.amount})`).join(', '),
        note: txNote
      };
      newSavings[savingIdx].history = [histEntry, ...(newSavings[savingIdx].history || [])];

      saveWallet(newAccounts, newSavings);
      setSavingsList(newSavings);
      setIsSavingsTransferOpen(false);
      showToast(`Transferred ৳${totalAllocated.toLocaleString()} to Savings`);
      return;
    }

    // Standard Single Wallet / Distribution Transfer
    const amt = parseFloat(savingsTransferForm.amount);
    if (isNaN(amt) || amt <= 0) { showToast('Valid amount required', 'danger'); return; }
    if (!savingsTransferForm.walletId) { showToast('Please select a source', 'danger'); return; }

    const [wId, distId] = savingsTransferForm.walletId.includes(':')
      ? savingsTransferForm.walletId.split(':')
      : [savingsTransferForm.walletId, 'main'];

    const walletIdx = newAccounts.findIndex(a => a.id === wId);
    if (walletIdx === -1) { showToast('Account not found', 'danger'); return; }

    const isMain = distId === 'main';
    const distObj = (newAccounts[walletIdx].distributions || []).find(d => d.id === distId);
    const sourceLabel = isMain ? `${newAccounts[walletIdx].name} (Main)` : `${newAccounts[walletIdx].name} ➔ ${distObj?.name || 'Distribution'}`;

    if (isDeposit) {
      const availableBal = isMain ? newAccounts[walletIdx].amount : getDistBalance(newAccounts[walletIdx], distId);
      if (amt > availableBal) {
        showToast(`Insufficient balance in ${sourceLabel}`, 'danger');
        return;
      }

      if (isMain) {
        newAccounts[walletIdx].amount -= amt;
      }

      newSavings[savingIdx].currentAmount = (newSavings[savingIdx].currentAmount || 0) + amt;
      newAccounts[walletIdx].transactions = [{
        id: Date.now().toString(36),
        date: new Date().toISOString(),
        amount: amt,
        type: 'transfer',
        from: distId,
        to: `saving:${newSavings[savingIdx].name}`,
        note: txNote || `Transfer to Savings from ${sourceLabel}: ${newSavings[savingIdx].name}`
      }, ...(newAccounts[walletIdx].transactions || [])];

      const histEntry = {
        id: Date.now().toString(36),
        date: new Date().toISOString(),
        type: 'deposit',
        amount: amt,
        walletId: newAccounts[walletIdx].id,
        walletName: sourceLabel,
        note: txNote
      };
      newSavings[savingIdx].history = [histEntry, ...(newSavings[savingIdx].history || [])];
    } else {
      // Withdraw back to wallet or distribution
      if (amt > (newSavings[savingIdx].currentAmount || 0)) {
        showToast('Insufficient savings balance', 'danger');
        return;
      }

      newSavings[savingIdx].currentAmount -= amt;
      if (isMain) {
        newAccounts[walletIdx].amount += amt;
      }

      newAccounts[walletIdx].transactions = [{
        id: Date.now().toString(36),
        date: new Date().toISOString(),
        amount: amt,
        type: 'deposit',
        targetId: distId,
        note: txNote || `Withdrawal from Savings to ${sourceLabel}: ${newSavings[savingIdx].name}`
      }, ...(newAccounts[walletIdx].transactions || [])];

      const histEntry = {
        id: Date.now().toString(36),
        date: new Date().toISOString(),
        type: 'withdraw',
        amount: amt,
        walletId: newAccounts[walletIdx].id,
        walletName: sourceLabel,
        note: txNote
      };
      newSavings[savingIdx].history = [histEntry, ...(newSavings[savingIdx].history || [])];
    }

    saveWallet(newAccounts, newSavings);
    setSavingsList(newSavings);
    setIsSavingsTransferOpen(false);
    showToast(isDeposit ? 'Transferred to Savings' : 'Withdrawn from Savings');
  };

  const handleDeleteWallet = (walletId) => {
    const newAccounts = accounts.filter(a => a.id !== walletId);
    saveWallet(newAccounts);
    if (activeAccountId === walletId) {
      setActiveAccountId(newAccounts.length > 0 ? newAccounts[0].id : null);
    }
    setConfirmDeleteWallet(null);
    showToast('Wallet deleted');
  };

  const generateWalletReportText = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthPrefix = todayStr.slice(0, 7);

    const targetAccounts = reportWalletScope === 'all' 
      ? accounts 
      : accounts.filter(a => a.id === reportWalletScope);

    const selectedAccObj = accounts.find(a => a.id === reportWalletScope);
    const scopeName = reportWalletScope === 'all' ? 'সব ওয়ালেট ও ফান্ড' : selectedAccObj?.name || 'নির্বাচিত ওয়ালেট';

    let totalBudgetPool = 0;
    let totalUnallocatedCash = 0;
    let totalDistRemaining = 0;
    let totalLifetimeSpent = 0;
    const categorySpending = {};
    const recentExpenses = [];
    let periodSpent = 0;

    targetAccounts.forEach(acc => {
      totalBudgetPool += (acc.amount || 0);
      const accAllocated = (acc.distributions || []).reduce((sum, d) => sum + (d.amount || 0), 0);
      const unallocated = Math.max(0, (acc.amount || 0) - accAllocated);
      totalUnallocatedCash += unallocated;

      (acc.distributions || []).forEach(d => {
        const remaining = getDistBalance(acc, d.id);
        totalDistRemaining += Math.max(0, remaining);

        (d.expenses || []).forEach(e => {
          const amt = Number(e.amount) || 0;
          totalLifetimeSpent += amt;
          const eDate = (e.date || '').slice(0, 10);
          const inRange = reportRange === 'all' || 
            (reportRange === 'today' && eDate === todayStr) || 
            (reportRange === 'month' && eDate.startsWith(monthPrefix));

          if (inRange) {
            periodSpent += amt;
            const catKey = reportWalletScope === 'all' ? `${d.name} (${acc.name})` : d.name;
            categorySpending[catKey] = (categorySpending[catKey] || 0) + amt;
            recentExpenses.push({
              desc: e.name || e.desc || 'খরচ',
              amount: amt,
              distName: d.name,
              walletName: acc.name,
              date: eDate || todayStr
            });
          }
        });
      });
    });

    let periodSavingsDeposited = 0;
    const totalSaved = savingsList.reduce((sum, s) => sum + (s.currentAmount || 0), 0);
    savingsList.forEach(s => {
      (s.history || []).forEach(h => {
        const hDate = (h.date || '').slice(0, 10);
        const inRange = reportRange === 'all' || 
          (reportRange === 'today' && hDate === todayStr) || 
          (reportRange === 'month' && hDate.startsWith(monthPrefix));
        if (inRange && h.type === 'deposit') {
          periodSavingsDeposited += (Number(h.amount) || 0);
        }
      });
    });

    const realLiquidCash = totalDistRemaining + totalUnallocatedCash;
    const isSingleWallet = reportWalletScope !== 'all';
    const realNetBalance = isSingleWallet ? realLiquidCash : (realLiquidCash + totalSaved);
    const rangeTitle = reportRange === 'today' ? `আজকের (${todayStr})` : reportRange === 'month' ? `চলতি মাসের (${monthPrefix})` : 'সার্বিক (সব সময়)';

    const makeProgressBar = (percent) => {
      const filled = Math.min(5, Math.max(0, Math.round((percent / 100) * 5)));
      return '▰'.repeat(filled) + '▱'.repeat(5 - filled);
    };

    let txt = `📋 *ব্যক্তিগত ও ওয়ালেট আর্থিক বিবরণী*\n`;
    txt += `💼 *ওয়ালেট:* ${scopeName}\n`;
    txt += `🗓 *সময়কাল:* ${rangeTitle}\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `💵 *প্রকৃত খরচযোগ্য নগদ (Real Cash)*\n`;
    txt += `• বণ্টন ফান্ডে ব্যালেন্স:  ৳${totalDistRemaining.toLocaleString()}\n`;
    if (totalUnallocatedCash > 0) {
      txt += `• অবণ্টনকৃত অতিরিক্ত ক্যাশ: ৳${totalUnallocatedCash.toLocaleString()}\n`;
    }
    txt += `────────────────────────\n`;
    txt += `💰 *বর্তমান মোট নগদ:* *৳${realLiquidCash.toLocaleString()}*\n`;
    if (!isSingleWallet) {
      txt += `🐷 *মোট জমানো সঞ্চয়:* ৳${totalSaved.toLocaleString()}\n`;
      txt += `────────────────────────\n`;
      txt += `💎 *প্রকৃত নীট সম্পদ (Net Balance):* *৳${realNetBalance.toLocaleString()}*\n`;
    }
    txt += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (totalBudgetPool > 0) {
      const spentRate = Math.min(100, Math.round((totalLifetimeSpent / totalBudgetPool) * 100));
      txt += `📈 *বাজেট ও খরচ পর্যালোচনা*\n`;
      txt += `• মোট বাজেট বরাদ্দ: ৳${totalBudgetPool.toLocaleString()}\n`;
      txt += `• মোট ব্যয় হয়েছে: ৳${totalLifetimeSpent.toLocaleString()} (${spentRate}%)\n`;
      txt += `• অবশিষ্ট ব্যবহারযোগ্য: ৳${realLiquidCash.toLocaleString()}\n`;
      txt += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    txt += `📊 *নির্বাচিত সময়কালের লেনদেন:*\n`;
    txt += `• মোট ব্যয়/খরচ:   🔻 ৳${periodSpent.toLocaleString()}\n`;
    if (!isSingleWallet) {
      txt += `• নতুন সঞ্চয় জমা:  🟢 ৳${periodSavingsDeposited.toLocaleString()}\n`;
    }
    txt += `\n`;

    const topCategories = Object.entries(categorySpending).sort((a, b) => b[1] - a[1]);
    if (topCategories.length > 0) {
      txt += `🛒 *শীর্ষ খরচের খাতসমূহ:*\n`;
      topCategories.slice(0, 5).forEach(([cat, amt], i) => {
        const perc = periodSpent > 0 ? Math.round((amt / periodSpent) * 100) : 0;
        txt += `${i + 1}. ${cat}: ৳${amt.toLocaleString()} (${perc}%)\n`;
      });
      txt += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    }

    if (!isSingleWallet && savingsList.length > 0) {
      txt += `🎯 *সঞ্চয় লক্ষ্যমাত্রা অগ্রগতি:*\n`;
      savingsList.slice(0, 5).forEach(s => {
        const perc = s.targetAmount ? Math.min(100, Math.round(((s.currentAmount || 0) / s.targetAmount) * 100)) : 0;
        txt += `• ${s.name}: ৳${(s.currentAmount || 0).toLocaleString()}/৳${(s.targetAmount || 0).toLocaleString()} ${makeProgressBar(perc)} (${perc}%)\n`;
      });
      txt += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    }

    if (recentExpenses.length > 0) {
      txt += `📝 *সাম্প্রতিক খরচসমূহ:*\n`;
      recentExpenses.slice(0, 5).forEach((ex, i) => {
        txt += `${i + 1}. ${ex.desc}: ৳${ex.amount} (${ex.distName})\n`;
      });
      txt += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    txt += `_তৈরি: 24Hours Smart Wallet • সময়: ${timeStr}_`;
    return txt;
  };

  const handleShareWalletReport = (mode = 'whatsapp') => {
    const reportText = generateWalletReportText();
    if (mode === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, '_blank');
    } else if (mode === 'copy') {
      navigator.clipboard?.writeText(reportText);
      showToast('রিপোর্ট কপি করা হয়েছে!');
    }
  };

  const handleSaveDist = () => {
    if (!distForm.name.trim()) { showToast('Name required', 'danger'); return; }
    const amt = parseFloat(distForm.amount);
    if (isNaN(amt) || amt < 0) { showToast('Invalid amount', 'danger'); return; }

    const isEdit = !!distForm.id;
    const accountDists = currentAccount.distributions || [];
    // Distributions are now separate from main balance.

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
    
    let updatedAccount = { ...currentAccount, distributions: newDistributions };
    updatedAccount = logTransaction(updatedAccount, {
      id: newItem.id,
      date: newItem.date,
      type: 'expense',
      targetId: selectedDistId,
      amount: amt,
      note: expenseForm.note
    });

    const newAccounts = accounts.map(a => a.id === activeAccountId ? updatedAccount : a);
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

    let updatedAccount = { ...currentAccount, distributions: newDistributions };
    updatedAccount.transactions = (updatedAccount.transactions || []).filter(t => t.id !== expenseId);

    const newAccounts = accounts.map(a => a.id === activeAccountId ? updatedAccount : a);
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
    const distTxns = currentAccount.transactions || [];
    const addedFunds = distTxns.reduce((sum, t) => {
      if (t.type === 'deposit' && t.targetId === dist.id) return sum + t.amount;
      if (t.type === 'transfer' && t.to === dist.id) return sum + t.amount;
      if (t.type === 'transfer' && t.from === dist.id) return sum - t.amount;
      return sum;
    }, 0);
    const spent = (dist.expenses || []).reduce((sum, e) => sum + e.amount, 0);
    
    const totalAvailable = dist.amount + addedFunds;
    const remaining = totalAvailable - spent;
    const spentPerc = totalAvailable > 0 ? Math.min((spent / totalAvailable) * 100, 100) : 0;
    const isOverBudget = spent > totalAvailable;

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
                <div className="text-white-50 fw-semibold mb-1">Available to Spend</div>
                <div className="text-white fw-bold display-6">৳{remaining.toLocaleString()}</div>
              </div>
            </div>
            <div className="progress rounded-pill bg-white bg-opacity-25" style={{ height: '8px' }}>
              <div className="progress-bar bg-white" role="progressbar" style={{ width: `${spentPerc}%` }}></div>
            </div>
            <div className="d-flex justify-content-between text-white-50 small mt-2">
              <span>Spent: ৳{spent.toLocaleString()}</span>
              <span>Budget: ৳{dist.amount.toLocaleString()} {addedFunds !== 0 ? `(${addedFunds > 0 ? '+' : ''}${addedFunds.toLocaleString()})` : ''}</span>
            </div>
          </div>

          <div className="d-flex gap-2 mb-4">
            <button className="btn btn-success rounded-pill fw-bold shadow-sm flex-grow-1" onClick={() => { setDepositForm({ targetId: dist.id, amount: '', note: '' }); setIsDepositOpen(true); }}>
              <i className="bi bi-plus-circle-fill me-1" /> Add Funds
            </button>
            <button className="btn btn-light bg-white border rounded-pill fw-bold shadow-sm flex-grow-1" onClick={() => { setExpenseForm({ id: null, note: '', amount: '' }); setIsExpenseOpen(true); }}>
              <i className="bi bi-dash-circle-fill text-danger me-1" /> Add Expense
            </button>
          </div>

          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="fw-bold text-dark m-0"><i className="bi bi-clock-history text-warning me-2" />Transaction Log</h5>
          </div>

          {(() => {
            const distTransactions = (currentAccount.transactions || []).filter(t => t.targetId === dist.id || t.from === dist.id || t.to === dist.id).sort((a, b) => new Date(b.date) - new Date(a.date));
            if (distTransactions.length === 0) {
              return (
                <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white mb-4">
                  <i className="bi bi-journal-text fs-1 text-muted mb-2"></i>
                  <h6 className="fw-bold text-dark">No transactions yet</h6>
                  <p className="text-secondary small mb-3">Track your deposits and spending for {dist.name} here.</p>
                  <button className="btn btn-outline-success rounded-pill fw-bold" onClick={() => { setExpenseForm({ id: null, note: '', amount: '' }); setIsExpenseOpen(true); }}>
                    <i className="bi bi-plus-lg me-1" /> Add First Expense
                  </button>
                </div>
              );
            }
            return (
              <div className="d-flex flex-column gap-3 pb-5">
                {distTransactions.map(txn => {
                  let icon = 'bi-check-circle'; let iconColor = 'text-success'; let bg = 'bg-success'; let amountColor = 'text-success'; let prefix = '+';
                  if (txn.type === 'expense' || (txn.type === 'transfer' && txn.from === dist.id)) {
                    icon = 'bi-arrow-down-right'; iconColor = 'text-danger'; bg = 'bg-danger'; amountColor = 'text-danger'; prefix = '-';
                  } else if (txn.type === 'transfer' && txn.to === dist.id) {
                    icon = 'bi-arrow-left-right'; iconColor = 'text-primary'; bg = 'bg-primary'; amountColor = 'text-primary'; prefix = '+';
                  }
                  return (
                    <div key={txn.id} className="card border-0 shadow-sm rounded-4 p-3 hover-scale">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center gap-3">
                          <div className={`rounded-circle d-flex align-items-center justify-content-center ${bg} bg-opacity-10 ${iconColor}`} style={{ width: '40px', height: '40px', minWidth: '40px' }}>
                            <i className={`bi ${icon}`} />
                          </div>
                          <div style={{ wordBreak: 'break-word' }}>
                            <div className="fw-bold text-dark">{txn.note || txn.type}</div>
                            <div className="text-muted small" style={{ fontSize: '0.75rem' }}>{new Date(txn.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                        <div className="d-flex align-items-center gap-2 ms-2">
                          <div className={`fw-bold ${amountColor} whitespace-nowrap`}>{prefix}৳{txn.amount.toLocaleString()}</div>
                          {txn.type === 'expense' && (
                            <button className="btn btn-light rounded-circle shadow-sm flex-shrink-0" style={{ width: '32px', height: '32px', padding: 0 }} onClick={() => handleDeleteExpense(dist.id, txn.id)}>
                              <i className="bi bi-trash3-fill text-danger small" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

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

          {isDepositOpen && (
            <>
              <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsDepositOpen(false)}></div>
              <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
                <div className="modal-dialog modal-dialog-centered">
                  <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                    <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                      <h5 className="modal-title fw-bold">Add Funds</h5>
                      <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsDepositOpen(false)}></button>
                    </div>
                    <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                      <div>
                        <label className="form-label fw-bold text-secondary">Target</label>
                        <select className="form-select rounded-3 shadow-sm border-0" value={depositForm.targetId} disabled>
                          <option value={dist.id}>{dist.name}</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label fw-bold text-secondary">Amount (৳)</label>
                        <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={depositForm.amount} onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })} />
                      </div>
                      <div>
                        <label className="form-label fw-bold text-secondary">Note (Optional)</label>
                        <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Salary" value={depositForm.note} onChange={(e) => setDepositForm({ ...depositForm, note: e.target.value })} />
                      </div>
                    </div>
                    <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                      <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsDepositOpen(false)}>Cancel</button>
                      <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleDeposit}>Deposit</button>
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

  // Common Header with Wallets vs Savings navigation
  const pageHeader = (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div>
          <div className="text-success fw-bold small text-uppercase">Finance</div>
          <h2 className="fw-bold text-dark mb-0">{activeMainTab === 'wallets' ? 'Wallets' : 'Savings Goals'}</h2>
        </div>
        <div className="d-flex align-items-center gap-1.5">
          <button 
            className="btn btn-sm btn-success text-white border-0 rounded-pill fw-bold shadow-xs d-flex align-items-center gap-1"
            style={{ backgroundColor: '#10B981' }}
            onClick={() => setIsQuickBazarOpen(true)}
            title="Quick Bazar শুরু করুন"
          >
            <i className="bi bi-basket2-fill" />
            <span className="d-none d-sm-inline">Quick Bazar</span>
          </button>
          <button 
            className="btn btn-sm btn-white bg-white text-dark border rounded-pill fw-bold shadow-xs d-flex align-items-center gap-1"
            onClick={() => setIsReportModalOpen(true)}
            title="রিপোর্ট ও শেয়ার"
          >
            <i className="bi bi-file-earmark-text text-success" />
            <span className="d-none d-sm-inline">রিপোর্ট</span>
          </button>
          <button className="btn btn-outline-secondary rounded-pill fw-bold hover-scale" onClick={onBack}>
            <i className="bi bi-arrow-left me-1" /> Back
          </button>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="d-flex bg-white p-1 rounded-pill shadow-xs border">
        <button
          type="button"
          className={`btn btn-sm rounded-pill flex-grow-1 fw-bold transition-all ${activeMainTab === 'wallets' ? 'btn-success text-white shadow-xs' : 'btn-light text-secondary border-0'}`}
          style={activeMainTab === 'wallets' ? { backgroundColor: '#128C7E' } : {}}
          onClick={() => setActiveMainTab('wallets')}
        >
          <i className="bi bi-wallet2 me-1.5" /> Wallets & Distributions
        </button>
        <button
          type="button"
          className={`btn btn-sm rounded-pill flex-grow-1 fw-bold transition-all ${activeMainTab === 'savings' ? 'btn-success text-white shadow-xs' : 'btn-light text-secondary border-0'}`}
          style={activeMainTab === 'savings' ? { backgroundColor: '#128C7E' } : {}}
          onClick={() => setActiveMainTab('savings')}
        >
          <i className="bi bi-piggy-bank-fill me-1.5" /> Savings Goals ({savingsList.length})
        </button>
      </div>
    </div>
  );

  // Render Dashboard Grid UI (no wallet selected yet)
  if (walletUI === 'dashboard' && !activeAccountId) {
    // In dashboard mode without a selected wallet, show the page header with tab switcher.
    // If savings tab is active, render savings content here; otherwise show wallet grid.
    const renderDashboardSavingsContent = () => (
      <div>
        {/* Total Savings Overview Card */}
        {(() => {
          const totalSavedAll = savingsList.reduce((acc, s) => acc + (s.currentAmount || 0), 0);
          const totalTargetAll = savingsList.reduce((acc, s) => acc + (s.targetAmount || 0), 0);
          const overallPerc = totalTargetAll > 0 ? Math.min(100, (totalSavedAll / totalTargetAll) * 100) : 0;
          return (
            <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 text-white" style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}>
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <div className="text-white-50 fw-semibold small text-uppercase">Total Saved Across Goals</div>
                  <div className="fw-bold display-5">৳{totalSavedAll.toLocaleString()}</div>
                </div>
                <div className="rounded-circle d-flex align-items-center justify-content-center bg-white bg-opacity-20 shadow-sm" style={{ width: '56px', height: '56px' }}>
                  <i className="bi bi-piggy-bank fs-2 text-white" />
                </div>
              </div>
              <div className="d-flex justify-content-between small text-white-50 mt-2 mb-1">
                <span>Overall Target: ৳{totalTargetAll.toLocaleString()}</span>
                <span>{overallPerc.toFixed(1)}% Achieved</span>
              </div>
              <div className="progress rounded-pill bg-white bg-opacity-25" style={{ height: '10px' }}>
                <div className="progress-bar bg-white" role="progressbar" style={{ width: `${overallPerc}%` }}></div>
              </div>
            </div>
          );
        })()}

        {/* Filter and Add Goal Header */}
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div className="d-flex gap-1.5 flex-wrap">
            {['ALL', 'monthly', 'purchase', 'shopping', 'custom'].map(cat => (
              <button
                key={cat}
                type="button"
                className={`btn btn-xs rounded-pill px-2.5 py-1 fw-bold border ${savingsFilter === cat ? 'bg-success text-white border-success' : 'btn-light text-secondary'}`}
                style={savingsFilter === cat ? { backgroundColor: '#128C7E' } : {}}
                onClick={() => setSavingsFilter(cat)}
              >
                {cat === 'ALL' ? 'All Goals' : cat === 'monthly' ? 'Monthly' : cat === 'purchase' ? 'Purchases' : cat === 'shopping' ? 'Shopping' : 'Custom'}
              </button>
            ))}
          </div>
          <button 
            className="btn btn-success rounded-pill fw-bold btn-sm shadow-sm"
            onClick={() => {
              setSavingsForm({ id: null, name: '', targetAmount: '', category: 'monthly', note: '' });
              setIsSavingsFormOpen(true);
            }}
          >
            <i className="bi bi-plus-lg me-1" /> New Savings Goal
          </button>
        </div>

        {/* Savings Cards */}
        {(() => {
          const filteredSavings = savingsFilter === 'ALL' ? savingsList : savingsList.filter(s => s.category === savingsFilter);
          if (filteredSavings.length === 0) {
            return (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white mb-4">
                <i className="bi bi-piggy-bank fs-1 text-muted mb-2"></i>
                <h6 className="fw-bold text-dark">No savings goals yet</h6>
                <p className="text-secondary small mb-3">
                  Start saving for monthly reserves, gadgets, shopping, or custom targets!
                </p>
                <div>
                  <button
                    className="btn btn-outline-success rounded-pill fw-bold"
                    onClick={() => {
                      setSavingsForm({ id: null, name: '', targetAmount: '', category: 'monthly', note: '' });
                      setIsSavingsFormOpen(true);
                    }}
                  >
                    <i className="bi bi-plus-lg me-1" /> Create Your First Goal
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="d-flex flex-column gap-3 pb-5">
              {filteredSavings.map(s => {
                const saved = s.currentAmount || 0;
                const target = s.targetAmount || 1;
                const perc = Math.min(100, (saved / target) * 100);
                const isCompleted = saved >= target;
                const iconName = s.category === 'purchase' ? 'bi-laptop' : s.category === 'shopping' ? 'bi-bag-heart-fill' : s.category === 'monthly' ? 'bi-calendar-check-fill' : 'bi-bullseye';
                
                return (
                  <div key={s.id} className="card border-0 shadow-sm rounded-4 p-3 bg-white hover-scale">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="d-flex align-items-center gap-3">
                        <div 
                          className="rounded-circle d-flex align-items-center justify-content-center text-white shadow-xs"
                          style={{ width: '44px', height: '44px', backgroundColor: isCompleted ? '#25D366' : '#128C7E' }}
                        >
                          <i className={`bi ${iconName} fs-5`} />
                        </div>
                        <div>
                          <div className="fw-bold text-dark d-flex align-items-center gap-1.5">
                            {s.name}
                            {isCompleted && (
                              <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill small">
                                <i className="bi bi-check-circle-fill me-1" /> Reached
                              </span>
                            )}
                          </div>
                          <span className="badge bg-light text-secondary border rounded-pill small px-2">
                            #{s.category.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="d-flex gap-1.5">
                        <button
                          className="btn btn-sm btn-light border rounded-pill text-primary"
                          onClick={() => setViewSavingsHistory(s)}
                          title="View History"
                        >
                          <i className="bi bi-clock-history" />
                        </button>
                        <button
                          className="btn btn-sm btn-light border rounded-pill fw-semibold text-secondary"
                          onClick={() => {
                            setSavingsForm({ id: s.id, name: s.name, targetAmount: s.targetAmount, category: s.category || 'custom', note: s.note || '' });
                            setIsSavingsFormOpen(true);
                          }}
                          title="Edit Goal"
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          className="btn btn-sm btn-light border rounded-pill text-danger"
                          onClick={() => setConfirmDeleteSaving(s.id)}
                          title="Delete Goal"
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar & Amount */}
                    <div className="mt-2">
                      <div className="d-flex justify-content-between small mb-1">
                        <span>Saved: <strong className="text-success">৳{saved.toLocaleString()}</strong></span>
                        <span>Target: <strong className="text-dark">৳{target.toLocaleString()}</strong> ({perc.toFixed(1)}%)</span>
                      </div>
                      <div className="progress rounded-pill bg-light border" style={{ height: '10px' }}>
                        <div 
                          className={`progress-bar ${isCompleted ? 'bg-success' : 'bg-primary'}`} 
                          role="progressbar" 
                          style={{ width: `${perc}%` }}
                        />
                      </div>
                      <div className="d-flex justify-content-between text-muted small mt-1" style={{ fontSize: '0.78rem' }}>
                        <span>Remaining: ৳{Math.max(0, target - saved).toLocaleString()}</span>
                        {s.note && <span className="fst-italic text-truncate" style={{ maxWidth: '200px' }}>{s.note}</span>}
                      </div>
                    </div>

                    {/* Quick Transfer Actions */}
                    <div className="d-flex gap-2 mt-3 pt-2 border-top">
                      <button
                        className="btn btn-sm btn-outline-success rounded-pill fw-bold flex-grow-1"
                        onClick={() => {
                          setSavingsTransferForm({
                            savingId: s.id,
                            walletId: accounts.length > 0 ? accounts[0].id : '',
                            amount: '',
                            type: 'deposit'
                          });
                          setIsSavingsTransferOpen(true);
                        }}
                      >
                        <i className="bi bi-arrow-down-circle me-1" /> Transfer In
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary rounded-pill fw-bold flex-grow-1"
                        disabled={saved <= 0}
                        onClick={() => {
                          setSavingsTransferForm({
                            savingId: s.id,
                            walletId: accounts.length > 0 ? accounts[0].id : '',
                            amount: '',
                            type: 'withdraw'
                          });
                          setIsSavingsTransferOpen(true);
                        }}
                      >
                        <i className="bi bi-arrow-up-circle me-1" /> Withdraw
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    );

    if (isQuickBazarOpen) {
      return (
        <QuickTrackerPage
          currentUser={currentUser}
          onBack={() => setIsQuickBazarOpen(false)}
        />
      );
    }

    return (
      <div className="wallet-page w-100 position-fixed top-0 start-0 bottom-0" style={{ zIndex: 1050, height: '100dvh', background: '#ECE5DD', overflowY: 'auto' }}>
        <div className="container-fluid max-width-container py-3 py-md-4 px-3">
          {pageHeader}

          {activeMainTab === 'savings' ? renderDashboardSavingsContent() : (
            <div className="row g-3">
              {accounts.map(acc => {
                const accSpent = (acc.distributions || []).reduce((sum, d) => sum + (d.expenses || []).reduce((s, e) => s + e.amount, 0), 0);
                return (
                  <div key={acc.id} className="col-12 col-md-6">
                    <div className="card border-0 shadow-sm rounded-4 p-4 hover-scale cursor-pointer h-100" style={{ cursor: 'pointer', background: 'linear-gradient(135deg, #075E54, #128C7E)' }} onClick={() => setActiveAccountId(acc.id)}>
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <div className="text-white-50 fw-semibold"><i className="bi bi-wallet2 me-2" />{acc.name}</div>
                        <button 
                          className="btn btn-sm btn-outline-light rounded-circle border-0 px-2 py-1" 
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteWallet(acc.id); }}
                          title="Delete Wallet"
                        >
                          <i className="bi bi-trash" />
                        </button>
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
        
        {confirmDeleteWallet && (
          <>
            <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setConfirmDeleteWallet(null)}></div>
            <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}>
                    <h5 className="modal-title fw-bold d-flex align-items-center gap-2"><i className="bi bi-trash3-fill"></i> Delete Wallet</h5>
                    <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setConfirmDeleteWallet(null)}></button>
                  </div>
                  <div className="modal-body p-4 bg-light text-center">
                    <h5 className="fw-bold text-dark mb-2">Are you sure?</h5>
                    <p className="text-secondary small">This will delete the wallet and all its distributions. This action cannot be undone.</p>
                  </div>
                  <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4 d-flex justify-content-center gap-2">
                    <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setConfirmDeleteWallet(null)}>Cancel</button>
                    <button className="btn text-white rounded-pill px-4 py-2 fw-bold shadow-sm" style={{ background: '#c62828' }} onClick={() => handleDeleteWallet(confirmDeleteWallet)}>Delete</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Savings Goal Create / Edit Modal (for dashboard savings tab) */}
        {isSavingsFormOpen && (
          <>
            <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsSavingsFormOpen(false)}></div>
            <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                    <h5 className="modal-title fw-bold">
                      <i className="bi bi-piggy-bank me-2" />
                      {savingsForm.id ? 'Edit Savings Goal' : 'New Savings Goal'}
                    </h5>
                    <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsSavingsFormOpen(false)}></button>
                  </div>
                  <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                    <div>
                      <label className="form-label fw-bold text-secondary">Goal Name</label>
                      <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. MacBook Pro, Monthly Reserve, Eid Shopping" value={savingsForm.name} onChange={(e) => setSavingsForm({ ...savingsForm, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label fw-bold text-secondary">Category</label>
                      <select className="form-select rounded-3 shadow-sm border-0" value={savingsForm.category} onChange={(e) => setSavingsForm({ ...savingsForm, category: e.target.value })}>
                        <option value="monthly">Monthly Saving (Emergency, Fixed fund)</option>
                        <option value="purchase">Purchase Items (Gadget, Vehicle, Asset)</option>
                        <option value="shopping">Shopping Saving (Clothes, Gifts, Festivals)</option>
                        <option value="custom">Custom Goal</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label fw-bold text-secondary">Target Amount (৳)</label>
                      <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter target amount" value={savingsForm.targetAmount} onChange={(e) => setSavingsForm({ ...savingsForm, targetAmount: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label fw-bold text-secondary">Note / Purpose (Optional)</label>
                      <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Target by December" value={savingsForm.note} onChange={(e) => setSavingsForm({ ...savingsForm, note: e.target.value })} />
                    </div>
                  </div>
                  <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                    <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsSavingsFormOpen(false)}>Cancel</button>
                    <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveSavingGoal}>Save Goal</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Savings Transfer / Withdraw Modal (for dashboard savings tab) */}
        {isSavingsTransferOpen && (
          <>
            <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsSavingsTransferOpen(false)}></div>
            <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                    <h5 className="modal-title fw-bold">
                      <i className="bi bi-arrow-left-right me-2" />
                      {savingsTransferForm.type === 'deposit' ? 'Transfer Wallet to Savings' : 'Withdraw from Savings to Wallet'}
                    </h5>
                    <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsSavingsTransferOpen(false)}></button>
                  </div>
                  <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                    <div>
                      <label className="form-label fw-bold text-secondary">Action</label>
                      <div className="btn-group w-100">
                        <button type="button" className={`btn btn-sm fw-bold ${savingsTransferForm.type === 'deposit' ? 'btn-success text-white' : 'btn-outline-secondary'}`} onClick={() => setSavingsTransferForm({ ...savingsTransferForm, type: 'deposit' })}>
                          Wallet ➔ Savings
                        </button>
                        <button type="button" className={`btn btn-sm fw-bold ${savingsTransferForm.type === 'withdraw' ? 'btn-success text-white' : 'btn-outline-secondary'}`} onClick={() => setSavingsTransferForm({ ...savingsTransferForm, type: 'withdraw' })}>
                          Savings ➔ Wallet
                        </button>
                      </div>
                    </div>
                    {/* Single vs Split Mode for Deposits */}
                    {savingsTransferForm.type === 'deposit' && (
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className={`btn btn-xs rounded-pill flex-grow-1 fw-bold border ${savingsTransferForm.mode !== 'split' ? 'btn-success text-white' : 'btn-light text-secondary'}`}
                          onClick={() => setSavingsTransferForm(f => ({ ...f, mode: 'single' }))}
                        >
                          Single Wallet
                        </button>
                        <button
                          type="button"
                          className={`btn btn-xs rounded-pill flex-grow-1 fw-bold border ${savingsTransferForm.mode === 'split' ? 'btn-success text-white' : 'btn-light text-secondary'}`}
                          onClick={() => setSavingsTransferForm(f => ({ ...f, mode: 'split' }))}
                        >
                          Split Across Wallets
                        </button>
                      </div>
                    )}

                    {savingsTransferForm.type === 'deposit' && savingsTransferForm.mode === 'split' ? (
                      <div className="card border-0 bg-white p-3 rounded-3 shadow-xs">
                        <label className="form-label fw-bold text-secondary small mb-2">Allocate from Wallets & Distributions:</label>
                        <div className="d-flex flex-column gap-2" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                          {accounts.map(a => {
                            const dists = a.distributions || [];
                            return (
                              <div key={a.id} className="border rounded-2 p-2 bg-light">
                                <div className="d-flex align-items-center justify-content-between gap-2 mb-1.5">
                                  <div>
                                    <div className="fw-bold small text-dark">{a.name} (Main)</div>
                                    <div className="text-secondary" style={{ fontSize: '0.72rem' }}>Bal: ৳{a.amount.toLocaleString()}</div>
                                  </div>
                                  <div style={{ width: 100 }}>
                                    <input
                                      type="number"
                                      className="form-control form-control-sm rounded-2 text-end fw-bold"
                                      placeholder="৳ 0"
                                      value={savingsTransferForm.splitAllocations?.[`${a.id}:main`] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setSavingsTransferForm(f => ({
                                          ...f,
                                          splitAllocations: { ...f.splitAllocations, [`${a.id}:main`]: val }
                                        }));
                                      }}
                                    />
                                  </div>
                                </div>

                                {dists.length > 0 && (
                                  <div className="d-flex flex-column gap-1 ms-2 ps-2 border-start">
                                    {dists.map(d => {
                                      const dBal = getDistBalance(a, d.id);
                                      const compKey = `${a.id}:${d.id}`;
                                      return (
                                        <div key={d.id} className="d-flex align-items-center justify-content-between gap-2">
                                          <div>
                                            <div className="small text-dark fw-semibold">↳ {d.name}</div>
                                            <div className="text-secondary" style={{ fontSize: '0.7rem' }}>Avail: ৳{dBal.toLocaleString()}</div>
                                          </div>
                                          <div style={{ width: 90 }}>
                                            <input
                                              type="number"
                                              className="form-control form-control-sm rounded-2 text-end"
                                              placeholder="৳ 0"
                                              value={savingsTransferForm.splitAllocations?.[compKey] || ''}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setSavingsTransferForm(f => ({
                                                  ...f,
                                                  splitAllocations: { ...f.splitAllocations, [compKey]: val }
                                                }));
                                              }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                          <span className="small fw-bold text-secondary">Total Deposit:</span>
                          <span className="fw-bold text-success">
                            ৳{Object.values(savingsTransferForm.splitAllocations || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="form-label fw-bold text-secondary">
                            {savingsTransferForm.type === 'deposit' ? 'Select Source (Wallet or Distribution)' : 'Select Target (Wallet or Distribution)'}
                          </label>
                          <select
                            className="form-select rounded-3 shadow-sm border-0"
                            value={savingsTransferForm.walletId}
                            onChange={(e) => setSavingsTransferForm({ ...savingsTransferForm, walletId: e.target.value })}
                          >
                            <option value="">-- Choose Source --</option>
                            {accounts.map(a => {
                              const dists = a.distributions || [];
                              return (
                                <optgroup key={a.id} label={a.name}>
                                  <option value={`${a.id}:main`}>
                                    {a.name} (Main Balance: ৳{a.amount.toLocaleString()})
                                  </option>
                                  {dists.map(d => {
                                    const dBal = getDistBalance(a, d.id);
                                    return (
                                      <option key={d.id} value={`${a.id}:${d.id}`}>
                                        &nbsp;&nbsp;↳ {d.name} (Available: ৳{dBal.toLocaleString()})
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              );
                            })}
                          </select>
                        </div>
                        <div>
                          <label className="form-label fw-bold text-secondary">Amount (৳)</label>
                          <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={savingsTransferForm.amount} onChange={(e) => setSavingsTransferForm({ ...savingsTransferForm, amount: e.target.value })} />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="form-label fw-bold text-secondary">Note / Reason (Optional)</label>
                      <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Salary bonus allocation" value={savingsTransferForm.note || ''} onChange={(e) => setSavingsTransferForm({ ...savingsTransferForm, note: e.target.value })} />
                    </div>
                  </div>
                  <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                    <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsSavingsTransferOpen(false)}>Cancel</button>
                    <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSavingsTransfer}>
                      {savingsTransferForm.type === 'deposit' ? 'Transfer Now' : 'Withdraw Now'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Savings Goal History Modal */}
        {viewSavingsHistory && (
          <>
            <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setViewSavingsHistory(null)}></div>
            <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #128C7E, #075E54)' }}>
                    <div>
                      <h5 className="modal-title fw-bold d-flex align-items-center gap-2 mb-0">
                        <i className="bi bi-clock-history"></i> {viewSavingsHistory.name} History
                      </h5>
                      <span className="small opacity-75">
                        Saved: ৳{(viewSavingsHistory.currentAmount || 0).toLocaleString()} / Target: ৳{(viewSavingsHistory.targetAmount || 0).toLocaleString()}
                      </span>
                    </div>
                    <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setViewSavingsHistory(null)}></button>
                  </div>
                  <div className="modal-body p-3 bg-light">
                    {(!viewSavingsHistory.history || viewSavingsHistory.history.length === 0) ? (
                      <div className="text-center py-4 text-muted">
                        <i className="bi bi-receipt fs-2 mb-2 d-block"></i>
                        No transaction history for this savings goal yet.
                      </div>
                    ) : (
                      <div className="d-flex flex-column gap-2">
                        {viewSavingsHistory.history.map(item => {
                          const isDep = item.type === 'deposit';
                          return (
                            <div key={item.id} className="card border-0 shadow-xs rounded-3 p-2.5 bg-white">
                              <div className="d-flex justify-content-between align-items-center">
                                <div className="d-flex align-items-center gap-2">
                                  <div className={`rounded-circle d-flex align-items-center justify-content-center text-white small ${isDep ? 'bg-success' : 'bg-warning'}`} style={{ width: 30, height: 30 }}>
                                    <i className={`bi ${isDep ? 'bi-arrow-down-left' : 'bi-arrow-up-right'}`} />
                                  </div>
                                  <div>
                                    <div className="fw-bold text-dark small">
                                      {isDep ? 'Cash In (Deposit)' : 'Withdrawal'}
                                    </div>
                                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                      {item.walletName ? `Via ${item.walletName}` : 'Wallet'} • {new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-end">
                                  <div className={`fw-bold ${isDep ? 'text-success' : 'text-danger'}`}>
                                    {isDep ? '+' : '-'}৳{item.amount.toLocaleString()}
                                  </div>
                                </div>
                              </div>
                              {item.note && (
                                <div className="text-muted small mt-1 pt-1 border-top" style={{ fontSize: '0.75rem' }}>
                                  💬 {item.note}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="modal-footer border-0 bg-light pt-0 pb-3 px-3">
                    <button className="btn btn-secondary rounded-pill px-4 py-1.5 fw-bold w-100" onClick={() => setViewSavingsHistory(null)}>Close</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Delete Savings Goal Confirmation (for dashboard savings tab) */}
        {confirmDeleteSaving && (
          <>
            <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setConfirmDeleteSaving(null)}></div>
            <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}>
                    <h5 className="modal-title fw-bold d-flex align-items-center gap-2"><i className="bi bi-trash3-fill"></i> Delete Savings Goal</h5>
                    <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setConfirmDeleteSaving(null)}></button>
                  </div>
                  <div className="modal-body p-4 bg-light text-center">
                    <h5 className="fw-bold text-dark mb-2">Delete this savings goal?</h5>
                    <p className="text-secondary small">The goal will be deleted. Any funds in this goal should be withdrawn to your wallet first.</p>
                  </div>
                  <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4 d-flex justify-content-center gap-2">
                    <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setConfirmDeleteSaving(null)}>Cancel</button>
                    <button className="btn text-white rounded-pill px-4 py-2 fw-bold shadow-sm" style={{ background: '#c62828' }} onClick={() => handleDeleteSavingGoal(confirmDeleteSaving)}>Delete</button>
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

        {/* Financial Report & Share Modal for Dashboard */}
        {isReportModalOpen && (
          <>
            <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setIsReportModalOpen(false)}></div>
            <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
              <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                  <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #128C7E, #075E54)' }}>
                    <div>
                      <h5 className="modal-title fw-bold d-flex align-items-center gap-2 mb-0">
                        <i className="bi bi-file-earmark-text"></i> ওয়ালেট আর্থিক রিপোর্ট
                      </h5>
                      <span className="small opacity-75">সারসংক্ষেপ ও শেয়ার জেনারেটর</span>
                    </div>
                    <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsReportModalOpen(false)}></button>
                  </div>
                  <div className="modal-body p-3 bg-light">
                    {accounts.length > 1 && (
                      <div className="mb-2">
                        <label className="text-secondary fw-bold small mb-1" style={{ fontSize: '0.72rem' }}>
                          <i className="bi bi-wallet2 me-1"></i>কোন ওয়ালেটের হিসাব দেখতে চান?
                        </label>
                        <select
                          className="form-select form-select-sm rounded-pill shadow-xs border fw-semibold"
                          value={reportWalletScope}
                          onChange={(e) => setReportWalletScope(e.target.value)}
                          style={{ fontSize: '0.78rem' }}
                        >
                          <option value="all">🌐 সব ওয়ালেট একত্রে (Overall)</option>
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>💼 {acc.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="d-flex p-1 bg-white rounded-pill mb-3 border">
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${reportRange === 'all' ? 'bg-success text-white shadow-xs' : 'text-secondary'}`}
                        style={reportRange === 'all' ? { backgroundColor: '#128C7E' } : {}}
                        onClick={() => setReportRange('all')}
                      >
                        সব হিসাব
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${reportRange === 'month' ? 'bg-success text-white shadow-xs' : 'text-secondary'}`}
                        style={reportRange === 'month' ? { backgroundColor: '#128C7E' } : {}}
                        onClick={() => setReportRange('month')}
                      >
                        চলতি মাস
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${reportRange === 'today' ? 'bg-success text-white shadow-xs' : 'text-secondary'}`}
                        style={reportRange === 'today' ? { backgroundColor: '#128C7E' } : {}}
                        onClick={() => setReportRange('today')}
                      >
                        আজকের দিন
                      </button>
                    </div>

                    <div className="card border-0 shadow-xs rounded-3 p-3 bg-white mb-2">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="text-muted fw-bold" style={{ fontSize: '0.72rem' }}>রিপোর্ট প্রিভিউ (WhatsApp Format)</span>
                        <span className="badge bg-light text-secondary border">Auto-generated</span>
                      </div>
                      <pre className="mb-0 text-dark small" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.78rem', maxHeight: '250px', overflowY: 'auto' }}>
                        {generateWalletReportText()}
                      </pre>
                    </div>
                  </div>

                  <div className="modal-footer border-0 bg-white pt-2 pb-3 px-3 d-flex gap-2">
                    <button 
                      type="button" 
                      className="btn btn-sm btn-outline-secondary rounded-pill flex-fill py-2 fw-bold"
                      onClick={() => handleShareWalletReport('copy')}
                    >
                      <i className="bi bi-clipboard me-1" /> কপি করুন
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-sm btn-success rounded-pill flex-fill py-2 fw-bold text-white shadow-xs"
                      style={{ backgroundColor: '#25D366' }}
                      onClick={() => handleShareWalletReport('whatsapp')}
                    >
                      <i className="bi bi-whatsapp me-1" /> WhatsApp শেয়ার
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Prepare standard wallet view stats
  let totalDistributed = 0, totalSpentAcrossAll = 0, remaining = 0, distPerc = 0, remainPerc = 0, overallSpentPerc = 0;
  if (currentAccount) {
    totalDistributed = (currentAccount.distributions || []).reduce((sum, d) => sum + d.amount, 0);
    totalSpentAcrossAll = (currentAccount.distributions || []).reduce((sum, d) => sum + (d.expenses || []).reduce((s, e) => s + e.amount, 0), 0);
    remaining = currentAccount.amount;
    const totalAssets = currentAccount.amount + totalDistributed;
    distPerc = totalAssets > 0 ? (totalDistributed / totalAssets) * 100 : 0;
    remainPerc = Math.max(0, 100 - distPerc);
    overallSpentPerc = totalDistributed > 0 ? (totalSpentAcrossAll / totalDistributed) * 100 : 0;
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
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div>
            <div className="text-success fw-bold small text-uppercase">Finance</div>
            {walletUI === 'dashboard' ? (
              <h2 className="fw-bold text-dark mb-0">{activeMainTab === 'savings' ? 'Savings Goals' : currentAccount?.name}</h2>
            ) : (
              <div className="d-flex align-items-center gap-2 mt-1">
                {activeMainTab === 'wallets' ? (
                  <div className="dropdown position-relative">
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
                ) : (
                  <h2 className="fw-bold text-dark mb-0">Savings Goals</h2>
                )}
              </div>
            )}
          </div>
          <div className="d-flex align-items-center gap-1.5">
            <button 
              className="btn btn-sm btn-success text-white border-0 rounded-pill fw-bold shadow-xs d-flex align-items-center gap-1 px-2.5 py-1.5"
              style={{ backgroundColor: '#10B981' }}
              onClick={() => setIsQuickBazarOpen(true)}
              title="Quick Bazar শুরু করুন"
            >
              <i className="bi bi-basket2-fill" />
              <span className="d-none d-sm-inline">Quick Bazar</span>
            </button>
            <button 
              className="btn btn-sm btn-white bg-white text-dark border rounded-pill fw-bold shadow-xs d-flex align-items-center gap-1 px-2.5 py-1.5"
              onClick={() => setIsReportModalOpen(true)}
              title="রিপোর্ট ও শেয়ার"
            >
              <i className="bi bi-file-earmark-text text-success" />
              <span className="d-none d-sm-inline">রিপোর্ট</span>
            </button>
            <button className="btn btn-outline-secondary rounded-pill fw-bold hover-scale px-3 py-1.5" onClick={walletUI === 'dashboard' ? () => setActiveAccountId(null) : onBack}>
              <i className="bi bi-arrow-left me-1" /> {walletUI === 'dashboard' ? 'Wallets' : 'Back'}
            </button>
          </div>
        </div>

        {/* Main Tab Switcher: Wallets vs Savings */}
        <div className="d-flex bg-white p-1 rounded-pill shadow-xs border mb-3">
          <button
            type="button"
            className={`btn btn-sm rounded-pill flex-grow-1 fw-bold transition-all ${activeMainTab === 'wallets' ? 'btn-success text-white shadow-xs' : 'btn-light text-secondary border-0'}`}
            style={activeMainTab === 'wallets' ? { backgroundColor: '#128C7E' } : {}}
            onClick={() => setActiveMainTab('wallets')}
          >
            <i className="bi bi-wallet2 me-1.5" /> Wallets & Distributions
          </button>
          <button
            type="button"
            className={`btn btn-sm rounded-pill flex-grow-1 fw-bold transition-all ${activeMainTab === 'savings' ? 'btn-success text-white shadow-xs' : 'btn-light text-secondary border-0'}`}
            style={activeMainTab === 'savings' ? { backgroundColor: '#128C7E' } : {}}
            onClick={() => setActiveMainTab('savings')}
          >
            <i className="bi bi-piggy-bank-fill me-1.5" /> Savings Goals ({savingsList.length})
          </button>
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-success" role="status"><span className="visually-hidden">Loading...</span></div>
          </div>
        ) : activeMainTab === 'savings' ? (
          // ==================== SAVINGS SYSTEM VIEW ====================
          <div>
            {/* Total Savings Overview Card */}
            {(() => {
              const totalSavedAll = savingsList.reduce((acc, s) => acc + (s.currentAmount || 0), 0);
              const totalTargetAll = savingsList.reduce((acc, s) => acc + (s.targetAmount || 0), 0);
              const overallPerc = totalTargetAll > 0 ? Math.min(100, (totalSavedAll / totalTargetAll) * 100) : 0;
              return (
                <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 text-white" style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <div>
                      <div className="text-white-50 fw-semibold small text-uppercase">Total Saved Across Goals</div>
                      <div className="fw-bold display-5">৳{totalSavedAll.toLocaleString()}</div>
                    </div>
                    <div className="rounded-circle d-flex align-items-center justify-content-center bg-white bg-opacity-20 shadow-sm" style={{ width: '56px', height: '56px' }}>
                      <i className="bi bi-piggy-bank fs-2 text-white" />
                    </div>
                  </div>
                  <div className="d-flex justify-content-between small text-white-50 mt-2 mb-1">
                    <span>Overall Target: ৳{totalTargetAll.toLocaleString()}</span>
                    <span>{overallPerc.toFixed(1)}% Achieved</span>
                  </div>
                  <div className="progress rounded-pill bg-white bg-opacity-25" style={{ height: '10px' }}>
                    <div className="progress-bar bg-white" role="progressbar" style={{ width: `${overallPerc}%` }}></div>
                  </div>
                </div>
              );
            })()}

            {/* Filter and Add Goal Header */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div className="d-flex gap-1.5 flex-wrap">
                {['ALL', 'monthly', 'purchase', 'shopping', 'custom'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    className={`btn btn-xs rounded-pill px-2.5 py-1 fw-bold border ${savingsFilter === cat ? 'bg-success text-white border-success' : 'btn-light text-secondary'}`}
                    style={savingsFilter === cat ? { backgroundColor: '#128C7E' } : {}}
                    onClick={() => setSavingsFilter(cat)}
                  >
                    {cat === 'ALL' ? 'All Goals' : cat === 'monthly' ? 'Monthly' : cat === 'purchase' ? 'Purchases' : cat === 'shopping' ? 'Shopping' : 'Custom'}
                  </button>
                ))}
              </div>
              <button 
                className="btn btn-success rounded-pill fw-bold btn-sm shadow-sm"
                onClick={() => {
                  setSavingsForm({ id: null, name: '', targetAmount: '', category: 'monthly', note: '' });
                  setIsSavingsFormOpen(true);
                }}
              >
                <i className="bi bi-plus-lg me-1" /> New Savings Goal
              </button>
            </div>

            {/* Savings Cards Grid */}
            {(() => {
              const filteredSavings = savingsFilter === 'ALL' ? savingsList : savingsList.filter(s => s.category === savingsFilter);
              if (filteredSavings.length === 0) {
                return (
                  <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white mb-4">
                    <i className="bi bi-piggy-bank fs-1 text-muted mb-2"></i>
                    <h6 className="fw-bold text-dark">No savings goals yet</h6>
                    <p className="text-secondary small mb-3">
                      Start saving for monthly reserves, gadgets, shopping, or custom targets!
                    </p>
                    <div>
                      <button
                        className="btn btn-outline-success rounded-pill fw-bold"
                        onClick={() => {
                          setSavingsForm({ id: null, name: '', targetAmount: '', category: 'monthly', note: '' });
                          setIsSavingsFormOpen(true);
                        }}
                      >
                        <i className="bi bi-plus-lg me-1" /> Create Your First Goal
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="d-flex flex-column gap-3 pb-5">
                  {filteredSavings.map(s => {
                    const saved = s.currentAmount || 0;
                    const target = s.targetAmount || 1;
                    const perc = Math.min(100, (saved / target) * 100);
                    const isCompleted = saved >= target;
                    const iconName = s.category === 'purchase' ? 'bi-laptop' : s.category === 'shopping' ? 'bi-bag-heart-fill' : s.category === 'monthly' ? 'bi-calendar-check-fill' : 'bi-bullseye';
                    
                    return (
                      <div key={s.id} className="card border-0 shadow-sm rounded-4 p-3 bg-white hover-scale">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <div className="d-flex align-items-center gap-3">
                            <div 
                              className="rounded-circle d-flex align-items-center justify-content-center text-white shadow-xs"
                              style={{ width: '44px', height: '44px', backgroundColor: isCompleted ? '#25D366' : '#128C7E' }}
                            >
                              <i className={`bi ${iconName} fs-5`} />
                            </div>
                            <div>
                              <div className="fw-bold text-dark d-flex align-items-center gap-1.5">
                                {s.name}
                                {isCompleted && (
                                  <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill small">
                                    <i className="bi bi-check-circle-fill me-1" /> Reached
                                  </span>
                                )}
                              </div>
                              <span className="badge bg-light text-secondary border rounded-pill small px-2">
                                #{s.category.toUpperCase()}
                              </span>
                            </div>
                          </div>

                          <div className="d-flex gap-1.5">
                            <button
                              className="btn btn-sm btn-light border rounded-pill text-primary"
                              onClick={() => setViewSavingsHistory(s)}
                              title="View History"
                            >
                              <i className="bi bi-clock-history" />
                            </button>
                            <button
                              className="btn btn-sm btn-light border rounded-pill fw-semibold text-secondary"
                              onClick={() => {
                                setSavingsForm({ id: s.id, name: s.name, targetAmount: s.targetAmount, category: s.category || 'custom', note: s.note || '' });
                                setIsSavingsFormOpen(true);
                              }}
                              title="Edit Goal"
                            >
                              <i className="bi bi-pencil" />
                            </button>
                            <button
                              className="btn btn-sm btn-light border rounded-pill text-danger"
                              onClick={() => setConfirmDeleteSaving(s.id)}
                              title="Delete Goal"
                            >
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        </div>

                        {/* Progress Bar & Amount */}
                        <div className="mt-2">
                          <div className="d-flex justify-content-between small mb-1">
                            <span>Saved: <strong className="text-success">৳{saved.toLocaleString()}</strong></span>
                            <span>Target: <strong className="text-dark">৳{target.toLocaleString()}</strong> ({perc.toFixed(1)}%)</span>
                          </div>
                          <div className="progress rounded-pill bg-light border" style={{ height: '10px' }}>
                            <div 
                              className={`progress-bar ${isCompleted ? 'bg-success' : 'bg-primary'}`} 
                              role="progressbar" 
                              style={{ width: `${perc}%` }}
                            />
                          </div>
                          <div className="d-flex justify-content-between text-muted small mt-1" style={{ fontSize: '0.78rem' }}>
                            <span>Remaining: ৳{Math.max(0, target - saved).toLocaleString()}</span>
                            {s.note && <span className="fst-italic text-truncate" style={{ maxWidth: '200px' }}>{s.note}</span>}
                          </div>
                        </div>

                        {/* Quick Transfer Actions */}
                        <div className="d-flex gap-2 mt-3 pt-2 border-top">
                          <button
                            className="btn btn-sm btn-outline-success rounded-pill fw-bold flex-grow-1"
                            onClick={() => {
                              setSavingsTransferForm({
                                savingId: s.id,
                                walletId: accounts.length > 0 ? accounts[0].id : '',
                                amount: '',
                                type: 'deposit'
                              });
                              setIsSavingsTransferOpen(true);
                            }}
                          >
                            <i className="bi bi-arrow-down-circle me-1" /> Transfer In
                          </button>
                          <button
                            className="btn btn-sm btn-outline-secondary rounded-pill fw-bold flex-grow-1"
                            disabled={saved <= 0}
                            onClick={() => {
                              setSavingsTransferForm({
                                savingId: s.id,
                                walletId: accounts.length > 0 ? accounts[0].id : '',
                                amount: '',
                                type: 'withdraw'
                              });
                              setIsSavingsTransferOpen(true);
                            }}
                          >
                            <i className="bi bi-arrow-up-circle me-1" /> Withdraw
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ) : (
          <>
            <div className="card border-0 shadow-sm rounded-4 p-4 mb-4" style={{ background: 'linear-gradient(135deg, #075E54, #128C7E)' }}>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-white-50 fw-semibold mb-1">Total Balance</div>
                  <div className="text-white fw-bold display-5">৳{currentAccount?.amount.toLocaleString()}</div>
                </div>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-light rounded-circle shadow-sm hover-scale"
                    style={{ width: '48px', height: '48px' }}
                    onClick={() => { setEditTotalValue(currentAccount?.amount.toString() || '0'); setIsEditTotalOpen(true); }}
                  >
                    <i className="bi bi-pencil-fill text-success" />
                  </button>
                  <button
                    className="btn btn-danger rounded-circle shadow-sm hover-scale text-white"
                    style={{ width: '48px', height: '48px' }}
                    onClick={() => setConfirmDeleteWallet(currentAccount?.id)}
                  >
                    <i className="bi bi-trash-fill" />
                  </button>
                </div>
              </div>
              <div className="d-flex gap-2 mt-4">
                <button className="btn btn-light bg-white rounded-pill fw-bold flex-grow-1 shadow-sm border" onClick={() => { setDepositForm({ targetId: 'main', amount: '', note: '' }); setIsDepositOpen(true); }}>
                  <i className="bi bi-plus-circle-fill text-success me-2" /> Add Funds
                </button>
                <button className="btn btn-light bg-white rounded-pill fw-bold flex-grow-1 shadow-sm border" onClick={() => { setTransferForm({ from: `${currentAccount?.id}:main`, to: '', amount: '', note: '' }); setIsTransferOpen(true); }}>
                  <i className="bi bi-arrow-left-right text-primary me-2" /> Transfer
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
                    <div className="text-secondary small fw-semibold" style={{ fontSize: '0.7rem' }}>Main Balance</div>
                    <div className="fs-6 fw-bold text-success">৳{remaining.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              <div className="d-flex justify-content-between text-muted small mb-1">
                <span>Allocations Spent: {overallSpentPerc.toFixed(1)}%</span>
              </div>
              <div className="progress rounded-pill bg-light border" style={{ height: '20px' }}>
                <div className="progress-bar bg-danger progress-bar-striped progress-bar-animated" role="progressbar" style={{ width: `${overallSpentPerc}%` }}></div>
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
                  const distTxns = currentAccount.transactions || [];
                  const addedFunds = distTxns.reduce((sum, t) => {
                    if (t.type === 'deposit' && t.targetId === dist.id) return sum + t.amount;
                    if (t.type === 'transfer' && t.to === dist.id) return sum + t.amount;
                    if (t.type === 'transfer' && t.from === dist.id) return sum - t.amount;
                    return sum;
                  }, 0);
                  const spent = (dist.expenses || []).reduce((sum, e) => sum + e.amount, 0);
                  const totalAvailable = dist.amount + addedFunds;
                  const distRemaining = totalAvailable - spent;
                  const spentPerc = totalAvailable > 0 ? Math.min((spent / totalAvailable) * 100, 100) : 0;
                  const isOverBudget = spent > totalAvailable;

                  return (
                    <div key={dist.id} className="card border-0 shadow-sm rounded-4 p-3 hover-scale cursor-pointer" onClick={(e) => { if (!e.target.closest('.action-btns')) setSelectedDistId(dist.id); }}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <div className="d-flex align-items-center gap-3">
                          <div className="rounded-circle d-flex align-items-center justify-content-center text-white bg-success shadow-sm" style={{ width: '40px', height: '40px' }}><i className="bi bi-wallet2" /></div>
                          <div>
                            <div className="fw-bold text-dark">{dist.name}</div>
                            <div className="d-flex align-items-center gap-2"><span className="text-secondary small" style={{ fontSize: '0.8rem' }}>Budget: ৳{dist.amount.toLocaleString()} {addedFunds !== 0 ? `(${addedFunds > 0 ? '+' : ''}${addedFunds.toLocaleString()})` : ''}</span></div>
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
            
            {/* Global Transaction History */}
            <div className="mt-4 mb-4">
              <h5 className="fw-bold text-dark mb-3"><i className="bi bi-clock-history text-secondary me-2" />Recent Transactions</h5>
              {!currentAccount.transactions || currentAccount.transactions.length === 0 ? (
                <div className="card border-0 shadow-sm rounded-4 p-4 text-center bg-white">
                  <p className="text-secondary small mb-0">No transactions yet.</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {currentAccount.transactions.slice(0, 10).map(txn => {
                    let icon = 'bi-check-circle';
                    let iconColor = 'text-success';
                    let bg = 'bg-success';
                    let amountColor = 'text-success';
                    let prefix = '+';
                    
                    if (txn.type === 'expense') {
                      icon = 'bi-arrow-down-right'; iconColor = 'text-danger'; bg = 'bg-danger'; amountColor = 'text-danger'; prefix = '-';
                    } else if (txn.type === 'transfer') {
                      icon = 'bi-arrow-left-right'; iconColor = 'text-primary'; bg = 'bg-primary'; amountColor = 'text-primary'; prefix = '⇆';
                    }

                    return (
                      <div key={txn.id} className="card border-0 shadow-sm rounded-4 p-3 hover-scale">
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center gap-3">
                            <div className={`rounded-circle d-flex align-items-center justify-content-center ${bg} bg-opacity-10 ${iconColor}`} style={{ width: '40px', height: '40px' }}>
                              <i className={`bi ${icon}`} />
                            </div>
                            <div>
                              <div className="fw-bold text-dark">{txn.note || txn.type}</div>
                              <div className="text-muted small" style={{ fontSize: '0.75rem' }}>{new Date(txn.date).toLocaleString()}</div>
                            </div>
                          </div>
                          <div className={`fw-bold ${amountColor}`}>{prefix}৳{txn.amount.toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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

      {/* Add Funds Modal */}
      {isDepositOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsDepositOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                  <h5 className="modal-title fw-bold">Add Funds</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsDepositOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fw-bold text-secondary">Target</label>
                    <select className="form-select rounded-3 shadow-sm border-0" value={depositForm.targetId} onChange={(e) => setDepositForm({ ...depositForm, targetId: e.target.value })}>
                      <option value="main">Main Balance</option>
                      {(currentAccount?.distributions || []).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Amount (৳)</label>
                    <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={depositForm.amount} onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Note (Optional)</label>
                    <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Salary" value={depositForm.note} onChange={(e) => setDepositForm({ ...depositForm, note: e.target.value })} />
                  </div>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsDepositOpen(false)}>Cancel</button>
                  <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleDeposit}>Deposit</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Transfer Modal */}
      {isTransferOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsTransferOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                  <h5 className="modal-title fw-bold">Transfer Money</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsTransferOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fw-bold text-secondary">From</label>
                    <select className="form-select rounded-3 shadow-sm border-0" value={transferForm.from} onChange={(e) => setTransferForm({ ...transferForm, from: e.target.value })}>
                      {accounts.map(w => (
                        <optgroup label={w.name} key={w.id}>
                          <option value={`${w.id}:main`}>Main Balance</option>
                          {(w.distributions || []).map(d => (
                            <option value={`${w.id}:${d.id}`} key={d.id}>{d.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">To</label>
                    <select className="form-select rounded-3 shadow-sm border-0" value={transferForm.to} onChange={(e) => setTransferForm({ ...transferForm, to: e.target.value })}>
                      <option value="">Select Destination</option>
                      {accounts.map(w => (
                        <optgroup label={w.name} key={w.id}>
                          <option value={`${w.id}:main`}>Main Balance</option>
                          {(w.distributions || []).map(d => (
                            <option value={`${w.id}:${d.id}`} key={d.id}>{d.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Amount (৳)</label>
                    <input type="number" className="form-control rounded-3 shadow-sm border-0" placeholder="Enter amount" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Note (Optional)</label>
                    <input type="text" className="form-control rounded-3 shadow-sm border-0" placeholder="e.g. Move to savings" value={transferForm.note} onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })} />
                  </div>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsTransferOpen(false)}>Cancel</button>
                  <button className="btn btn-primary rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleTransfer}>Transfer</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Wallet Modal */}
      {confirmDeleteWallet && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setConfirmDeleteWallet(null)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}>
                  <h5 className="modal-title fw-bold d-flex align-items-center gap-2"><i className="bi bi-trash3-fill"></i> Delete Wallet</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setConfirmDeleteWallet(null)}></button>
                </div>
                <div className="modal-body p-4 bg-light text-center">
                  <h5 className="fw-bold text-dark mb-2">Are you sure?</h5>
                  <p className="text-secondary small">This will delete the wallet and all its distributions. This action cannot be undone.</p>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4 d-flex justify-content-center gap-2">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setConfirmDeleteWallet(null)}>Cancel</button>
                  <button className="btn text-white rounded-pill px-4 py-2 fw-bold shadow-sm" style={{ background: '#c62828' }} onClick={() => handleDeleteWallet(confirmDeleteWallet)}>Delete</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Savings Goal Create / Edit Modal */}
      {isSavingsFormOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsSavingsFormOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                  <h5 className="modal-title fw-bold">
                    <i className="bi bi-piggy-bank me-2" />
                    {savingsForm.id ? 'Edit Savings Goal' : 'New Savings Goal'}
                  </h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsSavingsFormOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fw-bold text-secondary">Goal Name</label>
                    <input 
                      type="text" 
                      className="form-control rounded-3 shadow-sm border-0" 
                      placeholder="e.g. MacBook Pro, Monthly Reserve, Eid Shopping" 
                      value={savingsForm.name} 
                      onChange={(e) => setSavingsForm({ ...savingsForm, name: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Category</label>
                    <select 
                      className="form-select rounded-3 shadow-sm border-0" 
                      value={savingsForm.category} 
                      onChange={(e) => setSavingsForm({ ...savingsForm, category: e.target.value })}
                    >
                      <option value="monthly">Monthly Saving (Emergency, Fixed fund)</option>
                      <option value="purchase">Purchase Items (Gadget, Vehicle, Asset)</option>
                      <option value="shopping">Shopping Saving (Clothes, Gifts, Festivals)</option>
                      <option value="custom">Custom Goal</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Target Amount (৳)</label>
                    <input 
                      type="number" 
                      className="form-control rounded-3 shadow-sm border-0" 
                      placeholder="Enter target amount" 
                      value={savingsForm.targetAmount} 
                      onChange={(e) => setSavingsForm({ ...savingsForm, targetAmount: e.target.value })} 
                    />
                  </div>
                  <div>
                    <label className="form-label fw-bold text-secondary">Note / Purpose (Optional)</label>
                    <input 
                      type="text" 
                      className="form-control rounded-3 shadow-sm border-0" 
                      placeholder="e.g. Target by December" 
                      value={savingsForm.note} 
                      onChange={(e) => setSavingsForm({ ...savingsForm, note: e.target.value })} 
                    />
                  </div>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsSavingsFormOpen(false)}>Cancel</button>
                  <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSaveSavingGoal}>Save Goal</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Savings Transfer / Withdraw Modal */}
      {isSavingsTransferOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1100 }} onClick={() => setIsSavingsTransferOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1110 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
                  <h5 className="modal-title fw-bold">
                    <i className="bi bi-arrow-left-right me-2" />
                    {savingsTransferForm.type === 'deposit' ? 'Transfer Wallet to Savings' : 'Withdraw from Savings to Wallet'}
                  </h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsSavingsTransferOpen(false)}></button>
                </div>
                <div className="modal-body p-4 bg-light d-flex flex-column gap-3">
                  <div>
                    <label className="form-label fw-bold text-secondary">Action</label>
                    <div className="btn-group w-100">
                      <button 
                        type="button" 
                        className={`btn btn-sm fw-bold ${savingsTransferForm.type === 'deposit' ? 'btn-success text-white' : 'btn-outline-secondary'}`}
                        onClick={() => setSavingsTransferForm({ ...savingsTransferForm, type: 'deposit' })}
                      >
                        Wallet ➔ Savings
                      </button>
                      <button 
                        type="button" 
                        className={`btn btn-sm fw-bold ${savingsTransferForm.type === 'withdraw' ? 'btn-success text-white' : 'btn-outline-secondary'}`}
                        onClick={() => setSavingsTransferForm({ ...savingsTransferForm, type: 'withdraw' })}
                      >
                        Savings ➔ Wallet
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="form-label fw-bold text-secondary">
                      {savingsTransferForm.type === 'deposit' ? 'Select Source (Wallet or Distribution)' : 'Select Target (Wallet or Distribution)'}
                    </label>
                    <select 
                      className="form-select rounded-3 shadow-sm border-0" 
                      value={savingsTransferForm.walletId} 
                      onChange={(e) => setSavingsTransferForm({ ...savingsTransferForm, walletId: e.target.value })}
                    >
                      <option value="">-- Choose Source / Target --</option>
                      {accounts.map(a => {
                        const dists = a.distributions || [];
                        return (
                          <optgroup key={a.id} label={a.name}>
                            <option value={`${a.id}:main`}>
                              {a.name} (Main Balance: ৳{a.amount.toLocaleString()})
                            </option>
                            {dists.map(d => {
                              const dBal = getDistBalance(a, d.id);
                              return (
                                <option key={d.id} value={`${a.id}:${d.id}`}>
                                  &nbsp;&nbsp;↳ {d.name} (Available: ৳{dBal.toLocaleString()})
                                </option>
                              );
                            })}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="form-label fw-bold text-secondary">Amount (৳)</label>
                    <input 
                      type="number" 
                      className="form-control rounded-3 shadow-sm border-0" 
                      placeholder="Enter amount" 
                      value={savingsTransferForm.amount} 
                      onChange={(e) => setSavingsTransferForm({ ...savingsTransferForm, amount: e.target.value })} 
                    />
                  </div>

                  <div>
                    <label className="form-label fw-bold text-secondary">Note / Reason (Optional)</label>
                    <input 
                      type="text" 
                      className="form-control rounded-3 shadow-sm border-0" 
                      placeholder="e.g. Salary bonus allocation" 
                      value={savingsTransferForm.note || ''} 
                      onChange={(e) => setSavingsTransferForm({ ...savingsTransferForm, note: e.target.value })} 
                    />
                  </div>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setIsSavingsTransferOpen(false)}>Cancel</button>
                  <button className="btn btn-success rounded-pill px-4 py-2 text-white fw-bold shadow-sm" onClick={handleSavingsTransfer}>
                    {savingsTransferForm.type === 'deposit' ? 'Transfer Now' : 'Withdraw Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Savings Goal Confirmation */}
      {confirmDeleteSaving && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setConfirmDeleteSaving(null)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #b71c1c, #c62828)' }}>
                  <h5 className="modal-title fw-bold d-flex align-items-center gap-2"><i className="bi bi-trash3-fill"></i> Delete Savings Goal</h5>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setConfirmDeleteSaving(null)}></button>
                </div>
                <div className="modal-body p-4 bg-light text-center">
                  <h5 className="fw-bold text-dark mb-2">Delete this savings goal?</h5>
                  <p className="text-secondary small">The goal will be deleted. Any funds in this goal should be withdrawn to your wallet first.</p>
                </div>
                <div className="modal-footer border-0 bg-light pt-0 pb-4 px-4 d-flex justify-content-center gap-2">
                  <button className="btn btn-white border rounded-pill px-4 py-2 text-secondary fw-bold" onClick={() => setConfirmDeleteSaving(null)}>Cancel</button>
                  <button className="btn text-white rounded-pill px-4 py-2 fw-bold shadow-sm" style={{ background: '#c62828' }} onClick={() => handleDeleteSavingGoal(confirmDeleteSaving)}>Delete</button>
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

      {/* Wallet Financial Report & Share Modal */}
      {isReportModalOpen && (
        <>
          <div className="modal-backdrop fade show animate-fade-in" style={{ zIndex: 1200 }} onClick={() => setIsReportModalOpen(false)}></div>
          <div className="modal fade show d-block animate-slide-up" style={{ zIndex: 1210 }} tabIndex="-1">
            <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
              <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                <div className="modal-header border-0 text-white pb-3" style={{ background: 'linear-gradient(135deg, #128C7E, #075E54)' }}>
                  <div>
                    <h5 className="modal-title fw-bold d-flex align-items-center gap-2 mb-0">
                      <i className="bi bi-file-earmark-text"></i> ওয়ালেট আর্থিক রিপোর্ট
                    </h5>
                    <span className="small opacity-75">সারসংক্ষেপ ও শেয়ার জেনারেটর</span>
                  </div>
                  <button type="button" className="btn-close btn-close-white shadow-none" onClick={() => setIsReportModalOpen(false)}></button>
                </div>
                <div className="modal-body p-3 bg-light">
                  {/* Wallet Scope Selector (Multi-wallet Support) */}
                  {accounts.length > 1 && (
                    <div className="mb-2">
                      <label className="text-secondary fw-bold small mb-1" style={{ fontSize: '0.72rem' }}>
                        <i className="bi bi-wallet2 me-1"></i>কোন ওয়ালেটের হিসাব দেখতে চান?
                      </label>
                      <select
                        className="form-select form-select-sm rounded-pill shadow-xs border fw-semibold"
                        value={reportWalletScope}
                        onChange={(e) => setReportWalletScope(e.target.value)}
                        style={{ fontSize: '0.78rem' }}
                      >
                        <option value="all">🌐 সব ওয়ালেট একত্রে (Overall)</option>
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>💼 {acc.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Scope Selector */}
                  <div className="d-flex p-1 bg-white rounded-pill mb-3 border">
                    <button
                      type="button"
                      className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${reportRange === 'all' ? 'bg-success text-white shadow-xs' : 'text-secondary'}`}
                      style={reportRange === 'all' ? { backgroundColor: '#128C7E' } : {}}
                      onClick={() => setReportRange('all')}
                    >
                      সব হিসাব
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${reportRange === 'month' ? 'bg-success text-white shadow-xs' : 'text-secondary'}`}
                      style={reportRange === 'month' ? { backgroundColor: '#128C7E' } : {}}
                      onClick={() => setReportRange('month')}
                    >
                      চলতি মাস
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${reportRange === 'today' ? 'bg-success text-white shadow-xs' : 'text-secondary'}`}
                      style={reportRange === 'today' ? { backgroundColor: '#128C7E' } : {}}
                      onClick={() => setReportRange('today')}
                    >
                      আজকের দিন
                    </button>
                  </div>

                  {/* Report Text Preview */}
                  <div className="card border-0 shadow-xs rounded-3 p-3 bg-white mb-2">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="text-muted fw-bold" style={{ fontSize: '0.72rem' }}>রিপোর্ট প্রিভিউ (WhatsApp Format)</span>
                      <span className="badge bg-light text-secondary border">Auto-generated</span>
                    </div>
                    <pre className="mb-0 text-dark small" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.78rem', maxHeight: '250px', overflowY: 'auto' }}>
                      {generateWalletReportText()}
                    </pre>
                  </div>
                </div>

                <div className="modal-footer border-0 bg-white pt-2 pb-3 px-3 d-flex gap-2">
                  <button 
                    type="button" 
                    className="btn btn-sm btn-outline-secondary rounded-pill flex-fill py-2 fw-bold"
                    onClick={() => handleShareWalletReport('copy')}
                  >
                    <i className="bi bi-clipboard me-1" /> কপি করুন
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-sm btn-success rounded-pill flex-fill py-2 fw-bold text-white shadow-xs"
                    style={{ backgroundColor: '#25D366' }}
                    onClick={() => handleShareWalletReport('whatsapp')}
                  >
                    <i className="bi bi-whatsapp me-1" /> WhatsApp শেয়ার
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {isQuickBazarOpen && (
        <QuickTrackerPage
          currentUser={currentUser}
          onBack={() => setIsQuickBazarOpen(false)}
        />
      )}
    </div>
  );
}
