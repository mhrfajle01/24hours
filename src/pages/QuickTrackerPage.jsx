import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase/firebase';
import { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp, collection, getDocs, limit } from 'firebase/firestore';

const BAZAR_SUGGESTIONS = [
  'আলু', 'পেঁয়াজ', 'রসুন', 'আদা', 'কাঁচা মরিচ', 'টমেটো', 
  'ডিম', 'চাল', 'ডাল', 'সয়াবিন তেল', 'লবণ', 'মাছ', 'মুরগির মাংস', 'শাক'
];

const TOUR_SUGGESTIONS = [
  'বাস/ট্রেন টিকিট', 'হোটেল বুকিং', 'সকালের নাস্তা', 'দুপুরের খাবার', 
  'রাতের খাবার', 'সিএনজি/রিকশা ভাড়া', 'এন্ট্রি টিকিট', 'হালকা স্ন্যাক্স', 'জরুরি ওষুধ'
];

const CONFETTI_PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  x: `${(i * 14) % 100}%`,
  duration: 1.4 + (i % 4) * 0.3,
  size: 8 + (i % 4) * 2,
  color: ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899'][i % 6]
}));

export default function QuickTrackerPage({ currentUser, onBack }) {
  const [activeTab, setActiveTab] = useState('tracker'); // 'tracker' | 'history'
  const [step, setStep] = useState(1);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  
  // Session configuration
  const [sessionType, setSessionType] = useState('bazar'); // 'bazar' | 'tour'
  const [tourTitle, setTourTitle] = useState('');
  const [fundingSource, setFundingSource] = useState('manual');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedDistId, setSelectedDistId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [items, setItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  
  // Wallets data
  const [walletData, setWalletData] = useState({ accounts: [] });

  // History data
  const [historyList, setHistoryList] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);

  // Active check modal
  const [showConfetti, setShowConfetti] = useState(false);
  const [activeCheckItem, setActiveCheckItem] = useState(null);
  const [enteredPrice, setEnteredPrice] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Custom UI Modals (No native popups/alerts)
  const [newKhatModalOpen, setNewKhatModalOpen] = useState(false);
  const [newKhatName, setNewKhatName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // 1. Load active session check
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'wallets', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWalletData(data);
        if (data.accounts?.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data.accounts[0].id);
        }
      }
    });

    const activeDocRef = doc(db, 'users', currentUser.uid, 'quick_active_session', 'current');
    const unsubActive = onSnapshot(activeDocRef, (snap) => {
      if (snap.exists() && snap.data().status === 'active') {
        setHasSavedSession(true);
      } else {
        const local = localStorage.getItem(`quick_tracker_${currentUser.uid}`);
        if (local) {
          try {
            const parsed = JSON.parse(local);
            if (parsed?.status === 'active') setHasSavedSession(true);
          } catch {}
        }
      }
    });

    return () => {
      unsub();
      unsubActive();
    };
  }, [currentUser]);

  // Load Saved Session into State
  const handleResumeSavedSession = async () => {
    if (!currentUser?.uid) return;
    try {
      const activeDocRef = doc(db, 'users', currentUser.uid, 'quick_active_session', 'current');
      const snap = await doc(db, 'users', currentUser.uid, 'quick_active_session', 'current');
      const local = localStorage.getItem(`quick_tracker_${currentUser.uid}`);
      let data = local ? JSON.parse(local) : null;
      if (data) {
        setSessionType(data.sessionType || 'bazar');
        setTourTitle(data.tourTitle || '');
        setFundingSource(data.fundingSource || 'manual');
        setSelectedAccountId(data.selectedAccountId || '');
        setSelectedDistId(data.selectedDistId || '');
        setBudgetAmount((data.budgetAmount || 0).toString());
        setItems(data.items || []);
        setStep(4);
      }
    } catch (e) {
      console.error(e);
      setStep(4);
    }
  };

  // Reset & Start New
  const handleDiscardSavedSession = async () => {
    if (!currentUser?.uid) return;
    localStorage.removeItem(`quick_tracker_${currentUser.uid}`);
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'quick_active_session', 'current'));
    } catch {}
    setHasSavedSession(false);
    setStep(1);
    setItems([]);
    setBudgetAmount('');
    setTourTitle('');
  };

  // Save on state change in Step 4
  useEffect(() => {
    if (!currentUser?.uid) return;
    if (step === 4) {
      const payload = {
        status: 'active',
        sessionType,
        tourTitle,
        fundingSource,
        selectedAccountId,
        selectedDistId,
        budgetAmount: parseFloat(budgetAmount) || 0,
        items,
        updatedAt: Date.now()
      };
      localStorage.setItem(`quick_tracker_${currentUser.uid}`, JSON.stringify(payload));
      setDoc(doc(db, 'users', currentUser.uid, 'quick_active_session', 'current'), payload, { merge: true }).catch(console.error);
    }
  }, [step, sessionType, tourTitle, fundingSource, selectedAccountId, selectedDistId, budgetAmount, items, currentUser]);

  // Accurate distribution balance calculation matching WalletPage
  const getDistBalance = (wallet, distId) => {
    const dist = (wallet?.distributions || []).find(d => d.id === distId);
    if (!dist) return 0;
    const distTxns = wallet.transactions || [];
    const added = distTxns.reduce((sum, t) => {
      if (t.type === 'deposit' && t.targetId === distId) return sum + (Number(t.amount) || 0);
      if (t.type === 'transfer' && t.to === distId) return sum + (Number(t.amount) || 0);
      if (t.type === 'transfer' && t.from === distId) return sum - (Number(t.amount) || 0);
      return sum;
    }, 0);
    const spent = (dist.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return Math.max(0, (Number(dist.amount) || 0) + added - spent);
  };

  // Compute accurate usable cash from selected wallet
  const currentWallet = (walletData.accounts || []).find(a => a.id === selectedAccountId);
  const totalAllocatedInDists = (currentWallet?.distributions || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const unallocatedLiquidCash = Math.max(0, (Number(currentWallet?.amount) || 0) - totalAllocatedInDists);
  const selectedDistBalance = selectedDistId ? getDistBalance(currentWallet, selectedDistId) : null;
  const actualUsableBalance = selectedDistId 
    ? selectedDistBalance 
    : (unallocatedLiquidCash + (currentWallet?.distributions || []).reduce((sum, d) => sum + getDistBalance(currentWallet, d.id), 0));

  // Load history
  const fetchHistory = async () => {
    if (!currentUser?.uid) return;
    setLoadingHistory(true);
    try {
      const snap = await getDocs(collection(db, 'users', currentUser.uid, 'quick_sessions'), limit(30));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setHistoryList(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab]);

  const totalSpent = items.reduce((sum, item) => sum + (item.bought ? (parseFloat(item.price) || 0) : 0), 0);
  const parsedBudget = parseFloat(budgetAmount) || 0;
  const remainingBudget = parsedBudget - totalSpent;
  const progressPercent = parsedBudget > 0 ? Math.min(100, Math.round((totalSpent / parsedBudget) * 100)) : 0;
  const currentSuggestions = sessionType === 'bazar' ? BAZAR_SUGGESTIONS : TOUR_SUGGESTIONS;

  const handleAddItem = (name) => {
    const trimmed = (name || newItemName).trim();
    if (!trimmed) return;
    if (items.some(i => i.name.toLowerCase() === trimmed.toLowerCase())) return;
    setItems([...items, { id: Date.now().toString() + Math.random().toString(36).substr(2, 4), name: trimmed, bought: false, price: 0 }]);
    setNewItemName('');
  };

  const handleRemoveItem = (id) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleInitiateCheck = (item) => {
    if (item.bought) {
      setItems(items.map(i => i.id === item.id ? { ...i, bought: false, price: 0 } : i));
    } else {
      setActiveCheckItem(item);
      setEnteredPrice(item.price > 0 ? item.price.toString() : '');
    }
  };

  const handleConfirmPrice = () => {
    if (!activeCheckItem) return;
    const priceVal = parseFloat(enteredPrice) || 0;
    setItems(items.map(i => i.id === activeCheckItem.id ? { ...i, bought: true, price: priceVal } : i));
    setActiveCheckItem(null);
    setEnteredPrice('');
  };

  const handleCompleteBazar = () => {
    setShowConfetti(true);
    setStep(5);
    setTimeout(() => setShowConfetti(false), 3000);
  };

  const handleFinishAndSave = async (deductFromWallet) => {
    setIsSyncing(true);
    try {
      const sessionTitle = sessionType === 'tour' ? (tourTitle || 'Quick Tour') : 'Quick Bazar';
      const boughtItems = items.filter(i => i.bought);

      if (currentUser?.uid) {
        const sessionDocRef = doc(collection(db, 'users', currentUser.uid, 'quick_sessions'));
        await setDoc(sessionDocRef, {
          type: sessionType,
          title: sessionTitle,
          budget: parsedBudget,
          totalSpent,
          remaining: remainingBudget,
          fundingSource,
          items,
          timestamp: Date.now(),
          createdAt: serverTimestamp()
        });
      }

      if (deductFromWallet && totalSpent > 0 && currentUser?.uid && walletData.accounts?.length > 0) {
        let updatedAccounts = [...walletData.accounts];
        const accountIndex = updatedAccounts.findIndex(a => a.id === selectedAccountId);

        if (accountIndex !== -1) {
          const acc = { ...updatedAccounts[accountIndex] };
          const newTx = {
            id: 'quick_' + Date.now(),
            type: 'expense',
            amount: totalSpent,
            description: `${sessionTitle} (${boughtItems.map(i => i.name).slice(0, 3).join(', ')}${boughtItems.length > 3 ? '...' : ''})`,
            category: sessionType === 'tour' ? 'Travel' : 'Groceries',
            date: new Date().toISOString(),
            targetId: selectedDistId || null
          };

          acc.transactions = [newTx, ...(acc.transactions || [])];

          if (selectedDistId && acc.distributions) {
            acc.distributions = acc.distributions.map(d => {
              if (d.id === selectedDistId) {
                return {
                  ...d,
                  expenses: [...(d.expenses || []), { id: newTx.id, amount: totalSpent, note: newTx.description, date: newTx.date }]
                };
              }
              return d;
            });
          }

          updatedAccounts[accountIndex] = acc;
          await setDoc(doc(db, 'wallets', currentUser.uid), { accounts: updatedAccounts, updatedAt: serverTimestamp() }, { merge: true });
        }
      }

      localStorage.removeItem(`quick_tracker_${currentUser.uid}`);
      if (currentUser?.uid) {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'quick_active_session', 'current')).catch(console.error);
      }
      setHasSavedSession(false);
      setIsSyncing(false);
      setStep(1);
      setItems([]);
      setBudgetAmount('');
      setTourTitle('');
      setActiveTab('history');
    } catch (err) {
      console.error(err);
      setIsSyncing(false);
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2600);
  };

  const handleCloneHistory = (session) => {
    setSessionType(session.type || 'bazar');
    setTourTitle(session.title || '');
    setBudgetAmount((session.budget || 0).toString());
    setItems((session.items || []).map(i => ({ ...i, bought: false, price: 0 })));
    setActiveTab('tracker');
    setStep(3);
  };

  const handleDeleteHistory = async () => {
    if (!deleteConfirmId) return;
    try {
      if (currentUser?.uid) {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'quick_sessions', deleteConfirmId));
      }
      setHistoryList(prev => prev.filter(h => h.id !== deleteConfirmId));
      setDeleteConfirmId(null);
      showToast('হিস্ট্রি রেকর্ড সফলভাবে মুছে ফেলা হয়েছে');
    } catch (e) {
      console.error(e);
      setDeleteConfirmId(null);
      showToast('হিস্ট্রি ডিলিট করতে সমস্যা হয়েছে');
    }
  };

  const handleShareSessionWhatsApp = (session) => {
    const isTour = session.type === 'tour';
    const dateStr = session.timestamp 
      ? new Date(session.timestamp).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('bn-BD');

    let text = `${isTour ? '✈️ *ভ্রমণ ও ট্যুর বিবরণী*' : '🛒 *বাজারের সম্পূর্ণ হিসাব*'}\n`;
    text += `📌 *শিরোনাম:* ${session.title}\n`;
    text += `📅 *তারিখ:* ${dateStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (session.budget > 0) {
      text += `💵 *বাজেট:* ৳${session.budget.toLocaleString()}\n`;
    }
    text += `💰 *মোট খরচ:* *৳${session.totalSpent.toLocaleString()}*\n`;
    if (session.budget > 0) {
      const remaining = session.budget - session.totalSpent;
      text += `${remaining >= 0 ? '🟢 *সাশ্রয়/অবশিষ্ট:*' : '🔴 *ঘাটতি:*'} ৳${Math.abs(remaining).toLocaleString()}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📝 *আইটেম ও খরচের তালিকা:*\n`;

    const bought = (session.items || []).filter(i => i.bought);
    if (bought.length === 0) {
      (session.items || []).forEach((it, idx) => {
        text += `${idx + 1}. ${it.name} - ৳${it.price || 0}\n`;
      });
    } else {
      bought.forEach((it, idx) => {
        text += `${idx + 1}. ${it.name} - ৳${it.price || 0}\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_শেয়ার করা হয়েছে 24Hours Smart Tracker থেকে_`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const filteredHistory = historyList.filter(h => historyFilter === 'all' || h.type === historyFilter);

  return (
    <div className="w-100 min-vh-100 position-fixed top-0 start-0 bottom-0" style={{ zIndex: 1050, height: '100dvh', background: '#F8FAFC', overflowY: 'auto' }}>
      
      {/* Top Bar Header */}
      <div className="bg-white border-bottom sticky-top shadow-xs">
        <div className="container-fluid max-width-container py-2.5 px-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <span className="badge rounded-circle p-2 text-white shadow-xs" style={{ background: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }}>
              <i className={`bi ${sessionType === 'bazar' ? 'bi-basket2-fill' : 'bi-airplane-fill'} fs-6`}></i>
            </span>
            <div>
              <h6 className="fw-bold text-dark mb-0">Quick Bazar & Tour</h6>
              <span className="text-muted" style={{ fontSize: '0.72rem' }}>স্মার্ট খরচ ও বাজার ট্র্যাকার</span>
            </div>
          </div>
          <button className="btn btn-sm btn-outline-secondary rounded-pill fw-bold hover-scale" onClick={onBack}>
            <i className="bi bi-arrow-left me-1" /> Back
          </button>
        </div>
      </div>

      <div className="container-fluid max-width-container py-3 px-3" style={{ maxWidth: '540px' }}>
        
        {/* Navigation Switcher */}
        <div className="d-flex p-1 bg-white rounded-pill border shadow-xs mb-3">
          <button
            className={`btn btn-sm flex-fill rounded-pill fw-bold ${activeTab === 'tracker' ? 'btn-success text-white shadow-xs' : 'text-secondary border-0'}`}
            style={activeTab === 'tracker' ? { backgroundColor: sessionType === 'bazar' ? '#10B981' : '#3B82F6' } : {}}
            onClick={() => setActiveTab('tracker')}
          >
            ⚡ Live Tracker
          </button>
          <button
            className={`btn btn-sm flex-fill rounded-pill fw-bold ${activeTab === 'history' ? 'btn-dark text-white shadow-xs' : 'text-secondary border-0'}`}
            onClick={() => setActiveTab('history')}
          >
            📜 পূর্ববর্তী হিস্ট্রি
          </button>
        </div>

        {/* Saved Session Notification Banner */}
        {hasSavedSession && step === 1 && activeTab === 'tracker' && (
          <div className="card p-3 rounded-4 border-0 shadow-sm text-white mb-3" style={{ background: 'linear-gradient(135deg, #1E293B, #0F172A)' }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="badge bg-warning text-dark fw-bold">চলমান রয়েছে</span>
              <button className="btn btn-xs btn-outline-light rounded-pill py-0 px-2" onClick={handleDiscardSavedSession}>
                নতুন শুরু করুন
              </button>
            </div>
            <h6 className="fw-bold mb-1">আপনার একটি অসম্পূর্ণ বাজার/ট্যুর সেশন রয়েছে!</h6>
            <p className="text-white-50 small mb-2">আপনি পূর্ববর্তী ট্র্যাকার সরাসরি চালিয়ে যেতে পারেন।</p>
            <button className="btn btn-sm btn-success fw-bold rounded-pill" onClick={handleResumeSavedSession}>
              চলমান ট্র্যাকার খুলুন ➜
            </button>
          </div>
        )}

        {/* Tab 1: Live Tracker */}
        {activeTab === 'tracker' ? (
          <div className="card border-0 rounded-4 shadow-sm p-4 bg-white position-relative overflow-hidden" style={{ minHeight: '440px' }}>
            
            {showConfetti && (
              <div className="position-absolute top-0 start-0 w-100 h-100 overflow-hidden" style={{ zIndex: 12, pointerEvents: 'none' }}>
                {CONFETTI_PARTICLES.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ y: -10, x: p.x, opacity: 1, rotate: 0 }}
                    animate={{ y: 500, rotate: 720, opacity: 0 }}
                    transition={{ duration: p.duration, ease: 'easeOut' }}
                    style={{
                      position: 'absolute',
                      width: `${p.size}px`,
                      height: `${p.size * 1.3}px`,
                      backgroundColor: p.color,
                      borderRadius: '3px'
                    }}
                  />
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              {/* STEP 1 */}
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-2">
                  <div className="d-flex justify-content-center gap-3 mb-3">
                    <div 
                      onClick={() => setSessionType('bazar')}
                      className={`p-3 rounded-4 cursor-pointer text-center border transition-all ${sessionType === 'bazar' ? 'bg-success text-white shadow-sm border-success' : 'bg-light text-secondary'}`}
                      style={{ cursor: 'pointer', width: '135px' }}
                    >
                      <i className="bi bi-cart4 display-6 d-block mb-1"></i>
                      <span className="fw-bold small">Quick Bazar</span>
                    </div>
                    <div 
                      onClick={() => setSessionType('tour')}
                      className={`p-3 rounded-4 cursor-pointer text-center border transition-all ${sessionType === 'tour' ? 'bg-primary text-white shadow-sm border-primary' : 'bg-light text-secondary'}`}
                      style={{ cursor: 'pointer', width: '135px' }}
                    >
                      <i className="bi bi-airplane-engines display-6 d-block mb-1"></i>
                      <span className="fw-bold small">Tour & Trip</span>
                    </div>
                  </div>

                  <h5 className="fw-bolder text-dark mb-1">
                    {sessionType === 'bazar' ? 'আজকের বাজার শুরু করবেন?' : 'নতুন ট্যুর বা ট্রিপ শুরু করবেন?'}
                  </h5>
                  <p className="text-secondary small px-3 mb-3">
                    {sessionType === 'bazar' ? 'বাজারের ফর্দ বানান এবং কেনাকাটা করার সময় লাইভ হিসেব রাখুন!' : 'ভ্রমণের আনুমানিক বাজেট নির্ধারণ করুন এবং পথখরচ ট্র্যাক রাখুন!'}
                  </p>

                  {sessionType === 'tour' && (
                    <div className="mb-3">
                      <input
                        type="text"
                        className="form-control rounded-3 text-center fw-bold"
                        placeholder="ট্যুরের নাম (যেমন: সিলেট ট্যুর, ডে-আউট)..."
                        value={tourTitle}
                        onChange={(e) => setTourTitle(e.target.value)}
                      />
                    </div>
                  )}

                  <button
                    className="btn w-100 fw-bold py-2.5 rounded-4 shadow-sm text-white"
                    style={{ background: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }}
                    onClick={() => setStep(2)}
                  >
                    🚀 বাজেট ও ফান্ড নির্ধারণ করুন
                  </button>
                </motion.div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="w-100">
                  <h6 className="fw-bold text-dark text-center mb-2">বাজেট ও ফান্ডিং সোর্স</h6>
                  
                  <div className="card p-1.5 bg-light border-0 rounded-4 mb-3 d-flex flex-row gap-1">
                    <button
                      className={`btn btn-sm flex-fill rounded-3 fw-bold ${fundingSource === 'manual' ? 'bg-white shadow-xs text-success' : 'text-secondary border-0'}`}
                      onClick={() => setFundingSource('manual')}
                    >
                      হাতে ক্যাশ
                    </button>
                    <button
                      className={`btn btn-sm flex-fill rounded-3 fw-bold ${fundingSource === 'wallet' ? 'bg-white shadow-xs text-success' : 'text-secondary border-0'}`}
                      onClick={() => setFundingSource('wallet')}
                    >
                      Wallet থেকে
                    </button>
                  </div>

                  {fundingSource === 'wallet' && (
                    <div className="bg-light p-3 rounded-4 mb-3">
                      <label className="form-label small fw-bold text-secondary mb-1">অ্যাকাউন্ট সিলেক্ট করুন</label>
                      <select 
                        className="form-select rounded-3 mb-2"
                        value={selectedAccountId}
                        onChange={(e) => {
                          setSelectedAccountId(e.target.value);
                          setSelectedDistId('');
                        }}
                      >
                        {walletData.accounts?.map(acc => {
                          const wAllocated = (acc.distributions || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
                          const wUnallocated = Math.max(0, (Number(acc.amount) || 0) - wAllocated);
                          const wDistTotal = (acc.distributions || []).reduce((sum, d) => sum + getDistBalance(acc, d.id), 0);
                          const wActual = wUnallocated + wDistTotal;
                          return (
                            <option key={acc.id} value={acc.id}>
                              💼 {acc.name} (ব্যবহারযোগ্য: ৳{wActual.toLocaleString()})
                            </option>
                          );
                        })}
                      </select>

                      {currentWallet?.distributions?.length > 0 && (
                        <div className="mb-2">
                          <label className="form-label small fw-bold text-secondary mb-1">ডিস্ট্রিবিউশন হেড (ঐচ্ছিক)</label>
                          <select 
                            className="form-select rounded-3"
                            value={selectedDistId}
                            onChange={(e) => setSelectedDistId(e.target.value)}
                          >
                            <option value="">🌐 পুরো অ্যাকাউন্ট থেকে</option>
                            {currentWallet.distributions.map(d => (
                              <option key={d.id} value={d.id}>
                                🏷️ {d.name} (অবশিষ্ট: ৳{getDistBalance(currentWallet, d.id).toLocaleString()})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Actual Usable Balance Badge Card */}
                      <div className="card p-2.5 rounded-3 border-0 bg-white shadow-xs mt-2 d-flex flex-row justify-content-between align-items-center">
                        <div>
                          <span className="text-secondary small d-block" style={{ fontSize: '0.72rem' }}>
                            {selectedDistId ? 'নির্বাচিত ফান্ডে প্রকৃত ব্যালেন্স' : 'ওয়ালেটে মোট খরচযোগ্য নগদ'}
                          </span>
                          <span className="fw-bolder fs-6 text-success">৳{(actualUsableBalance || 0).toLocaleString()}</span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline-success rounded-pill px-2.5 py-1 fw-bold"
                          onClick={() => setBudgetAmount((actualUsableBalance || 0).toString())}
                          title="পুরো ব্যালেন্স বাজেট হিসেবে নিন"
                        >
                          পুরোটা বাজেট নিন
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="card p-3 bg-light border-0 rounded-4 mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label small fw-bold text-secondary mb-0">মোট বাজেট (৳)</label>
                      {fundingSource === 'wallet' && parsedBudget > actualUsableBalance && (
                        <span className="badge bg-danger-subtle text-danger" style={{ fontSize: '0.7rem' }}>
                          ⚠️ পর্যাপ্ত ব্যালেন্স নেই!
                        </span>
                      )}
                    </div>
                    <div className="input-group">
                      <span className="input-group-text bg-white border-0 fw-bold fs-5 text-success">৳</span>
                      <input
                        type="number"
                        className="form-control form-control-lg border-0 bg-white rounded-end-3 fw-bolder fs-4"
                        placeholder="১,০০০"
                        value={budgetAmount}
                        onChange={(e) => setBudgetAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="d-flex gap-2">
                    <button className="btn btn-light rounded-3 fw-bold flex-grow-1" onClick={() => setStep(1)}>পেছনে</button>
                    <button className="btn rounded-3 fw-bold flex-grow-2 text-white" style={{ background: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }} onClick={() => setStep(3)}>পরবর্তী ধাপ ➜</button>
                  </div>
                </motion.div>
              )}

              {/* STEP 3 */}
              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="w-100">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="fw-bold text-dark mb-0">{sessionType === 'bazar' ? 'বাজারের ফর্দ' : 'ট্যুরের খরচের তালিকা'}</h6>
                    <span className="badge bg-light text-secondary border rounded-pill">{items.length} টি</span>
                  </div>

                  <div className="input-group mb-2">
                    <input
                      type="text"
                      className="form-control rounded-start-3"
                      placeholder={sessionType === 'bazar' ? 'আইটেম লিখুন...' : 'খরচের খাত লিখুন...'}
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                    />
                    <button className="btn rounded-end-3 fw-bold px-3 text-white" style={{ background: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }} onClick={() => handleAddItem()}>+ যোগ</button>
                  </div>

                  <div className="d-flex flex-wrap gap-1 mb-2" style={{ maxHeight: '60px', overflowY: 'auto' }}>
                    {currentSuggestions.filter(p => !items.some(i => i.name === p)).slice(0, 8).map(chip => (
                      <button key={chip} className="btn btn-xs btn-outline-secondary rounded-pill py-0 px-2 small" onClick={() => handleAddItem(chip)}>+ {chip}</button>
                    ))}
                  </div>

                  <div className="card border bg-light shadow-xs rounded-4 p-2 mb-3" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                    {items.length === 0 ? (
                      <p className="text-muted text-center small my-3">কোনো আইটেম যোগ করা হয়নি। সাজেশন থেকে ট্যাপ করুন।</p>
                    ) : (
                      items.map((item, idx) => (
                        <div key={item.id} className="d-flex justify-content-between align-items-center p-1.5 border-bottom border-white">
                          <span className="small fw-semibold text-dark">{idx + 1}. {item.name}</span>
                          <button className="btn btn-sm btn-white py-0 px-1 text-danger rounded" onClick={() => handleRemoveItem(item.id)}>
                            <i className="bi bi-trash small"></i>
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="d-flex gap-2">
                    <button className="btn btn-light rounded-3 fw-bold flex-grow-1" onClick={() => setStep(2)}>পেছনে</button>
                    <button className="btn rounded-3 fw-bold flex-grow-2 text-white" style={{ background: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }} onClick={() => setStep(4)}>
                      {sessionType === 'bazar' ? 'বাজারে প্রবেশ করুন 🛒' : 'ট্যুর শুরু করুন ✈️'}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP 4 */}
              {step === 4 && (
                <motion.div key="step4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-100">
                  <div className="card p-3 rounded-4 border-0 shadow-sm text-white mb-2" style={{ background: sessionType === 'bazar' ? 'linear-gradient(135deg, #10B981, #047857)' : 'linear-gradient(135deg, #3B82F6, #1D4ED8)' }}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="small text-white-50">মোট খরচ:</span>
                      <span className="fs-5 fw-bolder">৳{totalSpent}</span>
                    </div>
                    {parsedBudget > 0 && (
                      <>
                        <div className="d-flex justify-content-between align-items-center small text-white-50 mb-1">
                          <span>বাজেট: ৳{parsedBudget}</span>
                          <span className={remainingBudget < 0 ? 'text-warning fw-bold' : ''}>
                            {remainingBudget >= 0 ? `অবশিষ্ট: ৳${remainingBudget}` : `বাজেট ছাড়িয়েছে: ৳${Math.abs(remainingBudget)}!`}
                          </span>
                        </div>
                        <div className="progress rounded-pill bg-white bg-opacity-25" style={{ height: '7px' }}>
                          <div className={`progress-bar rounded-pill ${remainingBudget < 0 ? 'bg-warning' : 'bg-white'}`} style={{ width: `${progressPercent}%` }}></div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="small fw-bold text-muted">টিক দিয়ে খরচের দাম লিখুন:</span>
                    <button 
                      className="btn btn-sm btn-link p-0 text-decoration-none fw-bold small"
                      style={{ color: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }}
                      onClick={() => {
                        setNewKhatName('');
                        setNewKhatModalOpen(true);
                      }}
                    >
                      + নতুন খাত
                    </button>
                  </div>

                  <div className="rounded-4 border p-2 mb-3" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {items.map(item => (
                      <div 
                        key={item.id}
                        onClick={() => handleInitiateCheck(item)}
                        className={`d-flex justify-content-between align-items-center p-2 rounded-3 mb-1 cursor-pointer ${item.bought ? 'bg-light text-muted' : 'border hover-bg-light'}`}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="d-flex align-items-center gap-2">
                          <input type="checkbox" className="form-check-input mt-0 fs-5" checked={item.bought} readOnly />
                          <span className={`fw-semibold small ${item.bought ? 'text-decoration-line-through text-secondary' : 'text-dark'}`}>{item.name}</span>
                        </div>
                        <div>
                          {item.bought ? (
                            <span className="badge bg-success-subtle text-success fw-bold rounded-pill">৳{item.price}</span>
                          ) : (
                            <span className="small text-muted border rounded px-1.5 py-0.5">লিখুন</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="d-flex gap-2">
                    <button className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={handleDiscardSavedSession} title="রিসেট">
                      বাতিল / রিসেট
                    </button>
                    <button
                      className="btn flex-fill py-2.5 rounded-4 fw-bold shadow-sm text-white"
                      style={{ background: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }}
                      onClick={handleCompleteBazar}
                    >
                      🎉 {sessionType === 'bazar' ? 'বাজার শেষ করুন' : 'ট্যুর সম্পন্ন করুন'} ({items.filter(i => i.bought).length}/{items.length})
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP 5 */}
              {step === 5 && (
                <motion.div key="step5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-2">
                  <div className="display-6 mb-2">🎉</div>
                  <h5 className="fw-bolder text-dark mb-1">{sessionType === 'bazar' ? 'বাজার সফলভাবে সম্পন্ন!' : 'ট্যুর সফলভাবে সম্পন্ন!'}</h5>
                  <div className="card p-3 border-0 bg-light rounded-4 text-start mb-3">
                    <div className="d-flex justify-content-between py-1 border-bottom border-white">
                      <span className="text-muted small">মোট খাত:</span>
                      <span className="fw-bold text-dark">{items.filter(i => i.bought).length} টি</span>
                    </div>
                    <div className="d-flex justify-content-between py-1 border-bottom border-white">
                      <span className="text-muted small">মোট ব্যয়:</span>
                      <span className="fw-bolder text-success fs-5">৳{totalSpent}</span>
                    </div>
                  </div>

                  <div className="d-grid gap-2">
                    {fundingSource === 'wallet' && (
                      <button className="btn btn-success py-2 rounded-3 fw-bold" disabled={isSyncing} onClick={() => handleFinishAndSave(true)}>
                        {isSyncing ? 'সংরক্ষণ হচ্ছে...' : '💳 ওয়ালেট থেকে টাকা বাদ দিয়ে সেভ করুন'}
                      </button>
                    )}
                    <button className="btn btn-light py-2 rounded-3 fw-bold text-secondary" disabled={isSyncing} onClick={() => handleFinishAndSave(false)}>
                      শুধু হিস্টোরিতে সেভ করুন
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* Tab 2: History (Modern FinTech Voucher Look) */
          <div className="w-100">
            {/* Top Lifetime Summary Banner */}
            {historyList.length > 0 && (
              <div className="card p-3 rounded-4 border-0 shadow-sm text-white mb-3" style={{ background: 'linear-gradient(135deg, #0F172A, #1E293B)' }}>
                <div className="d-flex justify-content-between align-items-center mb-2.5">
                  <span className="small text-white-50 fw-semibold d-flex align-items-center gap-1.5">
                    <i className="bi bi-pie-chart-fill text-success"></i>
                    সার্বিক হিসাব পর্যালোচনা
                  </span>
                  <span className="badge bg-white text-dark fw-bolder rounded-pill px-2.5 py-1 shadow-xs border" style={{ fontSize: '0.78rem' }}>
                    📊 {historyList.length} টি ইভেন্ট
                  </span>
                </div>
                <div className="row g-2 text-center">
                  <div className="col-4">
                    <div className="p-2 rounded-3 bg-white bg-opacity-10 border border-white border-opacity-10">
                      <span className="d-block text-white-50 mb-0.5" style={{ fontSize: '0.68rem' }}>মোট ট্রিপ/বাজার</span>
                      <span className="fw-bolder fs-6 text-white">{historyList.length} টি</span>
                    </div>
                  </div>
                  <div className="col-4">
                    <div className="p-2 rounded-3 bg-white bg-opacity-10 border border-white border-opacity-10">
                      <span className="d-block text-white-50 mb-0.5" style={{ fontSize: '0.68rem' }}>সর্বমোট খরচ</span>
                      <span className="fw-bolder fs-6 text-success">৳{historyList.reduce((sum, h) => sum + (h.totalSpent || 0), 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="col-4">
                    <div className="p-2 rounded-3 bg-white bg-opacity-10 border border-white border-opacity-10">
                      <span className="d-block text-white-50 mb-0.5" style={{ fontSize: '0.68rem' }}>মোট সাশ্রয়</span>
                      <span className="fw-bolder fs-6 text-warning">৳{historyList.reduce((sum, h) => sum + Math.max(0, (h.budget || 0) - (h.totalSpent || 0)), 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Filter Pills */}
            <div className="d-flex justify-content-between align-items-center mb-2.5">
              <span className="small fw-bold text-dark">ইভেন্ট তালিকা</span>
              <div className="d-flex p-1 bg-white rounded-pill border shadow-xs gap-1">
                {['all', 'bazar', 'tour'].map(t => (
                  <button 
                    key={t} 
                    className={`btn btn-xs rounded-pill px-2.5 py-0.5 fw-bold transition-all ${historyFilter === t ? 'btn-dark text-white shadow-xs' : 'text-secondary border-0'}`}
                    onClick={() => setHistoryFilter(t)}
                  >
                    {t === 'all' ? 'সব' : t === 'bazar' ? '🛒 বাজার' : '✈️ ট্যুর'}
                  </button>
                ))}
              </div>
            </div>

            {loadingHistory ? (
              <div className="text-center py-5 text-muted small"><div className="spinner-border spinner-border-sm me-2"></div>লোড হচ্ছে...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-white">
                <i className="bi bi-clock-history fs-2 text-muted mb-2"></i>
                <p className="text-muted small mb-0">কোনো পূর্ববর্তী হিস্ট্রি পাওয়া যায়নি।</p>
              </div>
            ) : (
              filteredHistory.map(session => {
                const isTour = session.type === 'tour';
                const diff = (session.budget || 0) - (session.totalSpent || 0);
                const isSaved = diff >= 0;
                const boughtItems = (session.items || []).filter(i => i.bought);
                const displayItems = boughtItems.length > 0 ? boughtItems : (session.items || []);

                return (
                  <div key={session.id} className="card p-3 rounded-4 border-0 shadow-sm mb-3 bg-white hover-shadow transition-all">
                    {/* Top Row: Type, Title & Big Amount */}
                    <div className="d-flex justify-content-between align-items-start mb-1.5">
                      <div className="d-flex align-items-center gap-2">
                        <span 
                          className="badge rounded-circle p-2 text-white shadow-xs d-flex align-items-center justify-content-center"
                          style={{ width: '36px', height: '36px', background: isTour ? 'linear-gradient(135deg, #3B82F6, #1D4ED8)' : 'linear-gradient(135deg, #10B981, #059669)' }}
                        >
                          <i className={`bi ${isTour ? 'bi-airplane-fill' : 'bi-basket2-fill'} fs-6`}></i>
                        </span>
                        <div>
                          <div className="fw-bolder text-dark mb-0 lh-sm" style={{ fontSize: '0.92rem' }}>{session.title}</div>
                          <span className="text-muted" style={{ fontSize: '0.72rem' }}>
                            <i className="bi bi-calendar3 me-1"></i>
                            {session.timestamp 
                              ? new Date(session.timestamp).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : 'পূর্ববর্তী রেকর্ড'}
                          </span>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className="fw-bolder fs-5 text-dark lh-sm">৳{session.totalSpent?.toLocaleString()}</div>
                        {session.budget > 0 && (
                          <span className={`badge rounded-pill ${isSaved ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`} style={{ fontSize: '0.68rem' }}>
                            {isSaved ? `+৳${diff} সাশ্রয়` : `-৳${Math.abs(diff)} অতিরিক্ত`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Preview Tag Chips */}
                    {displayItems.length > 0 && (
                      <div className="d-flex flex-wrap gap-1 my-2">
                        {displayItems.slice(0, 4).map((it, idx) => (
                          <span key={idx} className="badge bg-light text-secondary border fw-normal rounded-pill px-2 py-1" style={{ fontSize: '0.72rem' }}>
                            {it.name} <strong className="text-dark">৳{it.price || 0}</strong>
                          </span>
                        ))}
                        {displayItems.length > 4 && (
                          <span className="badge bg-light text-muted border fw-normal rounded-pill px-2 py-1" style={{ fontSize: '0.72rem' }}>
                            +{displayItems.length - 4}টি আরো...
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bottom Action Bar */}
                    <div className="d-flex justify-content-between align-items-center pt-2 border-top mt-1">
                      <button 
                        className="btn btn-xs btn-outline-success rounded-pill px-2.5 py-1 fw-bold d-flex align-items-center gap-1 shadow-xs"
                        onClick={() => handleShareSessionWhatsApp(session)}
                        title="WhatsApp শেয়ার"
                      >
                        <i className="bi bi-whatsapp"></i>
                        <span>শেয়ার</span>
                      </button>

                      <div className="d-flex align-items-center gap-1.5">
                        <button 
                          className={`btn btn-xs rounded-pill px-2.5 py-1 fw-semibold ${expandedHistoryId === session.id ? 'btn-secondary text-white' : 'btn-light text-dark border'}`}
                          onClick={() => setExpandedHistoryId(expandedHistoryId === session.id ? null : session.id)}
                        >
                          <i className="bi bi-receipt me-1"></i>
                          {expandedHistoryId === session.id ? 'সংক্ষেপ' : 'ভাউচার'}
                        </button>
                        <button 
                          className="btn btn-xs btn-light border rounded-pill px-2.5 py-1 text-primary fw-semibold"
                          onClick={() => handleCloneHistory(session)}
                          title="পুনরায় ব্যবহার"
                        >
                          <i className="bi bi-arrow-repeat me-1"></i>রি-ইউজ
                        </button>
                        <button 
                          className="btn btn-xs btn-light border text-danger rounded-circle p-1 d-flex align-items-center justify-content-center"
                          style={{ width: '28px', height: '28px' }}
                          onClick={() => setDeleteConfirmId(session.id)}
                          title="মুছে ফেলুন"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </div>

                    {/* Expanded Voucher / Receipt Breakdown */}
                    {expandedHistoryId === session.id && (
                      <div className="bg-light p-2.5 rounded-3 mt-2.5 border border-dashed">
                        <div className="d-flex justify-content-between align-items-center pb-1 mb-1 border-bottom border-secondary border-opacity-25 small fw-bold text-muted">
                          <span>আইটেম / খাতের নাম</span>
                          <span>পরিমাণ / দাম</span>
                        </div>
                        {displayItems.map((it, idx) => (
                          <div key={idx} className="d-flex justify-content-between small text-dark py-1">
                            <span>{idx + 1}. {it.name}</span>
                            <span className="fw-semibold">৳{it.price || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>

      {/* Quick Price Entry Popup */}
      {activeCheckItem && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1200, backdropFilter: 'blur(2px)' }}>
          <div className="card p-3 rounded-4 shadow border-0 w-100 text-center" style={{ maxWidth: '280px' }}>
            <h6 className="fw-bold text-dark mb-1">"{activeCheckItem.name}" খরচ কত?</h6>
            <div className="input-group my-2">
              <span className="input-group-text bg-light border-0 fw-bold text-success">৳</span>
              <input
                type="number"
                autoFocus
                className="form-control form-control-lg bg-light border-0 fw-bolder fs-4 text-center"
                placeholder="0"
                value={enteredPrice}
                onChange={(e) => setEnteredPrice(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmPrice()}
              />
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-light rounded-3 fw-bold flex-grow-1" onClick={() => setActiveCheckItem(null)}>বাতিল</button>
              <button className="btn btn-success rounded-3 fw-bold flex-grow-1" onClick={handleConfirmPrice}>নিশ্চিত</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Add Extra Khat Modal */}
      {newKhatModalOpen && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3 animate-fade-in" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1200, backdropFilter: 'blur(3px)' }}>
          <div className="card p-3 rounded-4 shadow-lg border-0 w-100 animate-slide-up" style={{ maxWidth: '300px' }}>
            <h6 className="fw-bold text-dark mb-1">নতুন আইটেম বা খরচের খাত</h6>
            <p className="text-muted small mb-2">বাজারে হঠাৎ কেনা জিনিস বা খরচ যোগ করুন</p>
            <input
              type="text"
              autoFocus
              className="form-control rounded-3 mb-3 fw-semibold"
              placeholder="যেমন: লেবু বা অতিরিক্ত ভাড়া..."
              value={newKhatName}
              onChange={(e) => setNewKhatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newKhatName.trim()) {
                  handleAddItem(newKhatName);
                  setNewKhatModalOpen(false);
                }
              }}
            />
            <div className="d-flex gap-2">
              <button className="btn btn-light rounded-3 fw-bold flex-grow-1" onClick={() => setNewKhatModalOpen(false)}>বাতিল</button>
              <button 
                className="btn btn-success rounded-3 fw-bold flex-grow-1 text-white"
                style={{ background: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }}
                onClick={() => {
                  if (newKhatName.trim()) {
                    handleAddItem(newKhatName);
                    setNewKhatModalOpen(false);
                  }
                }}
              >
                যুক্ত করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3 animate-fade-in" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1200, backdropFilter: 'blur(3px)' }}>
          <div className="card p-3 rounded-4 shadow-lg border-0 w-100 text-center animate-slide-up" style={{ maxWidth: '290px' }}>
            <div className="text-danger fs-2 mb-1"><i className="bi bi-trash-fill"></i></div>
            <h6 className="fw-bold text-dark mb-1">হিস্ট্রি মুছে ফেলতে চান?</h6>
            <p className="text-muted small mb-3">এই হিস্ট্রি রেকর্ডটি স্থায়ীভাবে মুছে যাবে।</p>
            <div className="d-flex gap-2">
              <button className="btn btn-light rounded-3 fw-bold flex-grow-1" onClick={() => setDeleteConfirmId(null)}>বাতিল</button>
              <button className="btn btn-danger rounded-3 fw-bold flex-grow-1" onClick={handleDeleteHistory}>মুছে ফেলুন</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Modern Toast */}
      {toastMessage && (
        <div className="position-fixed bottom-0 start-50 translate-middle-x mb-4 shadow-lg" style={{ zIndex: 1300 }}>
          <div className="bg-dark text-white py-2 px-3.5 rounded-pill small fw-bold d-flex align-items-center gap-2">
            <i className="bi bi-check-circle-fill text-success"></i>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

    </div>
  );
}
