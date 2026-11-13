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

const PACKING_PRESETS = [
  'জাতীয় পরিচয়পত্র/পাসপোর্ট', 'টিকিট ও বুকিং কপি', 'ক্যাশ টাকা', 'মোবাইল চার্জার',
  'পাওয়ার ব্যাংক', 'টি-শার্ট/শার্ট', 'প্যান্ট/ট্রাউজার', 'টুথব্রাশ ও পেস্ট',
  'প্যারাসিটামল/গ্যাস্ট্রিক ওষুধ', 'স্যালাইন', 'রেইনকোট/ছাতা', 'সানগ্লাস'
];

const CONFETTI_PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  x: `${(i * 14) % 100}%`,
  duration: 1.4 + (i % 4) * 0.3,
  size: 8 + (i % 4) * 2,
  color: ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899'][i % 6]
}));

export default function QuickTrackerPage({ currentUser, onBack }) {
  // Theme state: 'dark' | 'light'
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('quick_tracker_theme') || 'dark');
  const isDark = themeMode === 'dark';

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setThemeMode(next);
    localStorage.setItem('quick_tracker_theme', next);
  };

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
  
  // Tour Packing Checklist
  const [packingList, setPackingList] = useState([]);
  const [newPackingItem, setNewPackingItem] = useState('');
  const [tourSubTab, setTourSubTab] = useState('expenses'); // 'expenses' | 'packing'
  
  // Reopen 48-Hour Mode
  const [editingSessionId, setEditingSessionId] = useState(null);
  
  // Multiple Live Sessions List
  const [liveSessions, setLiveSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  
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

  // Top-Up Money Modal
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');

  // Hardware/Browser Back Button & Esc handler
  useEffect(() => {
    const handlePop = (e) => {
      if (topUpModalOpen) {
        setTopUpModalOpen(false);
      } else if (newKhatModalOpen) {
        setNewKhatModalOpen(false);
      } else if (deleteConfirmId) {
        setDeleteConfirmId(null);
      } else if (step > 1 && activeTab === 'tracker') {
        setStep(prev => prev - 1);
      } else if (onBack) {
        onBack();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handlePop(e);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [topUpModalOpen, newKhatModalOpen, deleteConfirmId, step, activeTab, onBack]);

  // Unified safe back action
  const handleSafeBack = () => {
    if (topUpModalOpen) {
      setTopUpModalOpen(false);
    } else if (newKhatModalOpen) {
      setNewKhatModalOpen(false);
    } else if (deleteConfirmId) {
      setDeleteConfirmId(null);
    } else if (step > 1 && activeTab === 'tracker') {
      setStep(prev => prev - 1);
    } else if (onBack) {
      onBack();
    }
  };

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

    // Listen to live sessions
    const unsubSessions = onSnapshot(collection(db, 'users', currentUser.uid, 'quick_sessions'), (snap) => {
      const activeList = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'active') {
          activeList.push({ id: d.id, ...data });
        }
      });
      activeList.sort((a, b) => (b.updatedAt || b.timestamp || 0) - (a.updatedAt || a.timestamp || 0));
      setLiveSessions(activeList);
      if (activeList.length > 0) {
        setHasSavedSession(true);
      }
    });

    return () => {
      unsub();
      unsubSessions();
    };
  }, [currentUser]);

  // Switch or Resume a live session
  const handleSwitchToLiveSession = (session) => {
    setActiveSessionId(session.id);
    setSessionType(session.type || 'bazar');
    setTourTitle(session.title || '');
    setFundingSource(session.fundingSource || 'manual');
    setSelectedAccountId(session.selectedAccountId || '');
    setSelectedDistId(session.selectedDistId || '');
    setBudgetAmount((session.budget || 0).toString());
    setItems(session.items || []);
    setPackingList(session.packingList || []);
    setEditingSessionId(null);
    setStep(4);
    setActiveTab('tracker');
  };

  const handleResumeSavedSession = () => {
    if (liveSessions.length > 0) {
      handleSwitchToLiveSession(liveSessions[0]);
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
    setPackingList([]);
    setEditingSessionId(null);
    setBudgetAmount('');
    setTourTitle('');
  };

  // Save on state change in Step 4
  useEffect(() => {
    if (!currentUser?.uid) return;
    if (step === 4) {
      const currentLiveId = activeSessionId || editingSessionId || ('live_' + (currentUser.uid.slice(0, 5)) + '_' + Date.now());
      if (!activeSessionId) setActiveSessionId(currentLiveId);

      const payload = {
        status: 'active',
        type: sessionType,
        title: sessionType === 'tour' ? (tourTitle || 'Quick Tour') : 'Quick Bazar',
        fundingSource,
        selectedAccountId,
        selectedDistId,
        budget: parseFloat(budgetAmount) || 0,
        items,
        packingList,
        timestamp: Date.now(),
        updatedAt: Date.now()
      };
      setDoc(doc(db, 'users', currentUser.uid, 'quick_sessions', currentLiveId), payload, { merge: true }).catch(console.error);
    }
  }, [step, sessionType, tourTitle, fundingSource, selectedAccountId, selectedDistId, budgetAmount, items, packingList, activeSessionId, editingSessionId, currentUser]);

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
        const finalSessionId = activeSessionId || editingSessionId || ('session_' + Date.now());
        const sessionDocRef = doc(db, 'users', currentUser.uid, 'quick_sessions', finalSessionId);

        await setDoc(sessionDocRef, {
          status: 'completed',
          type: sessionType,
          title: sessionTitle,
          budget: parsedBudget,
          totalSpent,
          remaining: remainingBudget,
          fundingSource,
          items,
          packingList: sessionType === 'tour' ? packingList : [],
          timestamp: Date.now(),
          createdAt: serverTimestamp()
        }, { merge: true });
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
      setActiveSessionId(null);
      setEditingSessionId(null);
      setPackingList([]);
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
    setPackingList((session.packingList || []).map(p => ({ ...p, packed: false })));
    setEditingSessionId(null);
    setActiveTab('tracker');
    setStep(3);
  };

  // Reopen within 48 hours for changes
  const handleReopenSession = (session) => {
    const elapsed = Date.now() - (session.timestamp || 0);
    if (elapsed > 48 * 3600 * 1000) {
      showToast('⚠️ ৪৮ ঘণ্টার বেশি হয়ে যাওয়ায় এটি আর রি-ওপেন করা যাবে না');
      return;
    }
    setSessionType(session.type || 'bazar');
    setTourTitle(session.title || '');
    setBudgetAmount((session.budget || 0).toString());
    setItems(session.items || []);
    setPackingList(session.packingList || []);
    setEditingSessionId(session.id);
    setActiveSessionId(session.id);
    setActiveTab('tracker');
    setStep(4);
    showToast('🔓 সেশন সফলভাবে এডিট ও পরিবর্তনের জন্য রি-ওপেন করা হয়েছে');
  };

  const getRemainingTimeStr = (timestamp) => {
    const limitMs = 48 * 3600 * 1000;
    const diff = (timestamp || 0) + limitMs - Date.now();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    return `${hours}ঘণ্টা ${mins}মি. বাকি`;
  };

  const handleAddTopUpMoney = () => {
    const addVal = parseFloat(topUpAmount) || 0;
    if (addVal <= 0) return;

    // Check if funded via wallet and if wallet has sufficient balance
    if (fundingSource === 'wallet') {
      if (addVal > actualUsableBalance) {
        showToast('⚠️ ওয়ালেটে পর্যাপ্ত ব্যালেন্স নেই!');
        return;
      }
    }

    const currentBudget = parseFloat(budgetAmount) || 0;
    const newBudget = currentBudget + addVal;
    setBudgetAmount(newBudget.toString());
    setTopUpAmount('');
    setTopUpModalOpen(false);
    showToast(`💰 ৳${addVal} বাজেট সফলভাবে বৃদ্ধি করা হয়েছে!`);
  };

  const handleMoveToTrash = async (sessionId) => {
    try {
      if (currentUser?.uid) {
        await setDoc(doc(db, 'users', currentUser.uid, 'quick_sessions', sessionId), {
          status: 'trashed',
          trashedAt: Date.now()
        }, { merge: true });
      }
      setHistoryList(prev => prev.map(h => h.id === sessionId ? { ...h, status: 'trashed' } : h));
      showToast('🗑️ সেশন ট্র্যাশে স্থানান্তর করা হয়েছে');
    } catch (e) {
      console.error(e);
      showToast('ট্র্যাশে সরাতে সমস্যা হয়েছে');
    }
  };

  const handleRestoreFromTrash = async (sessionId) => {
    try {
      if (currentUser?.uid) {
        await setDoc(doc(db, 'users', currentUser.uid, 'quick_sessions', sessionId), {
          status: 'completed',
          trashedAt: null
        }, { merge: true });
      }
      setHistoryList(prev => prev.map(h => h.id === sessionId ? { ...h, status: 'completed' } : h));
      showToast('♻️ সফলভাবে পুনরুদ্ধার করা হয়েছে');
    } catch (e) {
      console.error(e);
      showToast('পুনরুদ্ধার করতে সমস্যা হয়েছে');
    }
  };

  const handleDeletePermanent = async () => {
    if (!deleteConfirmId) return;
    try {
      if (currentUser?.uid) {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'quick_sessions', deleteConfirmId));
      }
      setHistoryList(prev => prev.filter(h => h.id !== deleteConfirmId));
      setDeleteConfirmId(null);
      showToast('চিরতরে মুছে ফেলা হয়েছে');
    } catch (e) {
      console.error(e);
      setDeleteConfirmId(null);
      showToast('মুছতে সমস্যা হয়েছে');
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

    if (isTour && session.packingList && session.packingList.length > 0) {
      const packedCount = session.packingList.filter(p => p.packed).length;
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🎒 *ব্যাগ প্যাকিং (${packedCount}/${session.packingList.length}):*\n`;
      session.packingList.forEach(p => {
        text += `${p.packed ? '✅' : '⬜'} ${p.name}\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_শেয়ার করা হয়েছে 24Hours Smart Tracker থেকে_`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const filteredHistory = historyList.filter(h => {
    if (historyFilter === 'trash') return h.status === 'trashed';
    if (h.status === 'trashed') return false;
    if (h.status === 'active') return false; // active sessions shown in live carousel
    return historyFilter === 'all' || h.type === historyFilter;
  });

  return (
    <div 
      className="w-100 min-vh-100 position-fixed top-0 start-0 bottom-0" 
      style={{ 
        zIndex: 1050, 
        height: '100dvh', 
        background: isDark ? '#090D16' : '#F8FAFC', 
        color: isDark ? '#F8FAFC' : '#0F172A', 
        overflowY: 'auto' 
      }}
    >
      
      {/* Top Bar Header */}
      <div 
        style={{ 
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)', 
          backdropFilter: 'blur(12px)', 
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' 
        }} 
        className="sticky-top"
      >
        <div className="container-fluid max-width-container py-2.5 px-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2.5">
            <span 
              className="badge rounded-circle p-2 text-white shadow-sm d-flex align-items-center justify-content-center" 
              style={{ 
                width: '36px', height: '36px',
                background: sessionType === 'bazar' ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                boxShadow: sessionType === 'bazar' ? '0 0 15px rgba(16,185,129,0.35)' : '0 0 15px rgba(59,130,246,0.35)'
              }}
            >
              <i className={`bi ${sessionType === 'bazar' ? 'bi-basket2-fill' : 'bi-airplane-fill'} fs-6`}></i>
            </span>
            <div>
              <h6 className={`fw-bold mb-0 ${isDark ? 'text-white' : 'text-dark'}`} style={{ letterSpacing: '0.3px' }}>Quick Bazar & Tour</h6>
              <span style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B' }}>স্মার্ট খরচ ও বাজার ট্র্যাকার</span>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              onClick={toggleTheme}
              className="btn btn-sm rounded-pill fw-bold py-1 px-2.5 d-flex align-items-center gap-1 shadow-sm"
              style={{
                background: isDark ? 'rgba(251, 191, 36, 0.15)' : 'rgba(79, 70, 229, 0.1)',
                color: isDark ? '#FBBF24' : '#4F46E5',
                border: isDark ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(79, 70, 229, 0.2)',
                fontSize: '0.75rem'
              }}
              title="থিম পরিবর্তন করুন"
            >
              {isDark ? <span>☀ লাইট</span> : <span>🌙 ডার্ক</span>}
            </button>
            <button 
              className="btn btn-sm rounded-pill fw-bold" 
              style={{ 
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', 
                color: isDark ? '#E2E8F0' : '#334155', 
                border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' 
              }}
              onClick={handleSafeBack}
            >
              <i className="bi bi-arrow-left me-1" /> {step > 1 && activeTab === 'tracker' ? 'ধাপ পেছনে' : 'Back'}
            </button>
          </div>
        </div>
      </div>

      <div className="container-fluid max-width-container py-3 px-3" style={{ maxWidth: '540px' }}>
        
        {/* Navigation Switcher (Luxury Pill Capsule) */}
        <div 
          className="d-flex p-1 rounded-pill mb-3" 
          style={{ 
            background: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0', 
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' 
          }}
        >
          <button
            className={`btn btn-sm flex-fill rounded-pill fw-bold transition-all ${activeTab === 'tracker' ? 'text-white shadow-sm' : 'border-0'}`}
            style={activeTab === 'tracker' 
              ? { background: sessionType === 'bazar' ? 'linear-gradient(135deg, #10B981, #047857)' : 'linear-gradient(135deg, #3B82F6, #1D4ED8)' } 
              : { color: isDark ? '#94A3B8' : '#64748B' }
            }
            onClick={() => setActiveTab('tracker')}
          >
            ⚡ Live Tracker
          </button>
          <button
            className={`btn btn-sm flex-fill rounded-pill fw-bold transition-all ${activeTab === 'history' ? (isDark ? 'bg-white text-dark shadow-sm' : 'bg-white text-dark shadow-sm') : 'border-0'}`}
            style={activeTab === 'history' ? {} : { color: isDark ? '#94A3B8' : '#64748B' }}
            onClick={() => setActiveTab('history')}
          >
            📜 পূর্ববর্তী হিস্ট্রি
          </button>
        </div>

        {/* Saved / Multiple Live Sessions Carousel */}
        {liveSessions.length > 0 && activeTab === 'tracker' && (
          <div 
            className="card p-3 rounded-4 border-0 shadow-sm mb-3" 
            style={{ 
              background: isDark ? 'linear-gradient(135deg, #1E293B, #0F172A)' : '#FFFFFF',
              color: isDark ? '#F8FAFC' : '#0F172A',
              boxShadow: isDark ? 'none' : '0 4px 20px rgba(0,0,0,0.06)',
              border: isDark ? 'none' : '1px solid #E2E8F0'
            }}
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="badge bg-danger text-white fw-bold d-flex align-items-center gap-1">
                <span className="spinner-grow spinner-grow-sm text-white" style={{ width: '8px', height: '8px' }}></span>
                লাইভ চলমান ({liveSessions.length}টি)
              </span>
              <button 
                className={`btn btn-xs rounded-pill py-0.5 px-2 ${isDark ? 'btn-outline-light' : 'btn-outline-secondary'}`} 
                onClick={() => {
                  setActiveSessionId(null);
                  setStep(1);
                  setItems([]);
                  setPackingList([]);
                }}
              >
                + নতুন শুরু
              </button>
            </div>
            
            <div className="d-flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {liveSessions.map(ls => (
                <div 
                  key={ls.id} 
                  onClick={() => handleSwitchToLiveSession(ls)}
                  className={`p-2 rounded-3 border cursor-pointer flex-shrink-0 text-start ${activeSessionId === ls.id ? 'bg-primary text-white border-primary' : (isDark ? 'bg-white bg-opacity-10 border-white border-opacity-10' : 'bg-light border-secondary border-opacity-25')}`}
                  style={{ minWidth: '160px', cursor: 'pointer' }}
                >
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="badge rounded-pill bg-white text-dark py-0 px-1.5" style={{ fontSize: '0.65rem' }}>
                      {ls.type === 'tour' ? '✈️ ট্যুর' : '🛒 বাজার'}
                    </span>
                    <span className={`fw-bolder small ${activeSessionId === ls.id ? 'text-warning' : (isDark ? 'text-warning' : 'text-primary')}`}>
                      ৳{(ls.items || []).reduce((s, it) => s + (it.bought ? (parseFloat(it.price) || 0) : 0), 0)}
                    </span>
                  </div>
                  <div className={`fw-bold small text-truncate ${activeSessionId === ls.id || isDark ? 'text-white' : 'text-dark'}`}>{ls.title || 'চলমান সেশন'}</div>
                  <div className="small" style={{ fontSize: '0.7rem', color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' }}>
                    {(ls.items || []).filter(i => i.bought).length}/{(ls.items || []).length} আইটেম
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 1: Live Tracker (Frosted Glass Container) */}
        {activeTab === 'tracker' ? (
          <div 
            className="rounded-4 p-4 position-relative overflow-hidden" 
            style={{ 
              minHeight: '440px',
              background: isDark ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
              backdropFilter: isDark ? 'blur(16px)' : 'none',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0,0,0,0.06)',
              boxShadow: isDark ? '0 8px 32px 0 rgba(0, 0, 0, 0.37)' : '0 4px 20px rgba(0,0,0,0.05)'
            }}
          >
            
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
                      className="p-3 rounded-4 cursor-pointer text-center transition-all"
                      style={{ 
                        cursor: 'pointer', width: '140px',
                        background: sessionType === 'bazar' 
                          ? (isDark ? 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.1))' : 'rgba(16,185,129,0.1)') 
                          : (isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9'),
                        border: sessionType === 'bazar' ? '2px solid #10B981' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0'),
                        boxShadow: sessionType === 'bazar' ? '0 0 20px rgba(16,185,129,0.2)' : 'none'
                      }}
                    >
                      <i className="bi bi-cart4 display-6 d-block mb-1" style={{ color: sessionType === 'bazar' ? '#10B981' : (isDark ? '#94A3B8' : '#64748B') }}></i>
                      <span className="fw-bold small" style={{ color: sessionType === 'bazar' ? (isDark ? '#34D399' : '#059669') : (isDark ? '#CBD5E1' : '#334155') }}>Quick Bazar</span>
                    </div>
                    <div 
                      onClick={() => setSessionType('tour')}
                      className="p-3 rounded-4 cursor-pointer text-center transition-all"
                      style={{ 
                        cursor: 'pointer', width: '140px',
                        background: sessionType === 'tour' 
                          ? (isDark ? 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(37,99,235,0.1))' : 'rgba(59,130,246,0.1)') 
                          : (isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9'),
                        border: sessionType === 'tour' ? '2px solid #3B82F6' : (isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0'),
                        boxShadow: sessionType === 'tour' ? '0 0 20px rgba(59,130,246,0.2)' : 'none'
                      }}
                    >
                      <i className="bi bi-airplane-engines display-6 d-block mb-1" style={{ color: sessionType === 'tour' ? '#3B82F6' : (isDark ? '#94A3B8' : '#64748B') }}></i>
                      <span className="fw-bold small" style={{ color: sessionType === 'tour' ? (isDark ? '#60A5FA' : '#2563EB') : (isDark ? '#CBD5E1' : '#334155') }}>Tour & Trip</span>
                    </div>
                  </div>

                  <h5 className={`fw-bolder mb-1 ${isDark ? 'text-white' : 'text-dark'}`}>
                    {sessionType === 'bazar' ? 'আজকের বাজার শুরু করবেন?' : 'নতুন ট্যুর বা ট্রিপ শুরু করবেন?'}
                  </h5>
                  <p className="small px-3 mb-3" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                    {sessionType === 'bazar' ? 'বাজারের ফর্দ বানান এবং কেনাকাটা করার সময় লাইভ হিসেব রাখুন!' : 'ভ্রমণের আনুমানিক বাজেট নির্ধারণ করুন এবং পথখরচ ট্র্যাক রাখুন!'}
                  </p>

                  {sessionType === 'tour' && (
                    <div className="mb-3">
                      <input
                        type="text"
                        className="form-control rounded-3 text-center fw-bold"
                        style={{ 
                          background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', 
                          border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #CBD5E1', 
                          color: isDark ? '#fff' : '#0F172A' 
                        }}
                        placeholder="ট্যুরের নাম (যেমন: সিলেট ট্যুর, ডে-আউট)..."
                        value={tourTitle}
                        onChange={(e) => setTourTitle(e.target.value)}
                      />
                    </div>
                  )}

                  <button
                    className="btn w-100 fw-bold py-2.5 rounded-4 shadow-sm text-white"
                    style={{ background: sessionType === 'bazar' ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
                    onClick={() => setStep(2)}
                  >
                    🚀 বাজেট ও ফান্ড নির্ধারণ করুন
                  </button>
                </motion.div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="w-100">
                  <h6 className={`fw-bold text-center mb-3 ${isDark ? 'text-white' : 'text-dark'}`}>বাজেট ও ফান্ডিং সোর্স</h6>
                  
                  <div className="p-1 rounded-pill mb-3 d-flex flex-row gap-1" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
                    <button
                      className={`btn btn-sm flex-fill rounded-pill fw-bold transition-all ${fundingSource === 'manual' ? 'bg-white text-dark shadow-sm' : (isDark ? 'border-0 text-white-50' : 'border-0 text-secondary')}`}
                      onClick={() => setFundingSource('manual')}
                    >
                      💵 হাতে ক্যাশ
                    </button>
                    <button
                      className={`btn btn-sm flex-fill rounded-pill fw-bold transition-all ${fundingSource === 'wallet' ? 'bg-white text-dark shadow-sm' : (isDark ? 'border-0 text-white-50' : 'border-0 text-secondary')}`}
                      onClick={() => setFundingSource('wallet')}
                    >
                      💳 Wallet থেকে
                    </button>
                  </div>

                  {fundingSource === 'wallet' && (
                    <div className="p-3 rounded-4 mb-3" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0' }}>
                      <label className="form-label small fw-bold mb-1" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>অ্যাকাউন্ট সিলেক্ট করুন</label>
                      <select 
                        className="form-select rounded-3 mb-2"
                        style={{ background: isDark ? '#1E293B' : '#FFFFFF', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #CBD5E1', color: isDark ? '#fff' : '#0F172A' }}
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
                          <label className="form-label small fw-bold mb-1" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>ডিস্ট্রিবিউশন হেড (ঐচ্ছিক)</label>
                          <select 
                            className="form-select rounded-3"
                            style={{ background: isDark ? '#1E293B' : '#FFFFFF', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #CBD5E1', color: isDark ? '#fff' : '#0F172A' }}
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
                      <div className="p-2.5 rounded-3 mt-2 d-flex flex-row justify-content-between align-items-center" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E2E8F0' }}>
                        <div>
                          <span className="small d-block" style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B' }}>
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
                          পুরোটা নিন
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="p-3 rounded-4 mb-3" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0' }}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label small fw-bold mb-0" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>মোট বাজেট (৳)</label>
                      {fundingSource === 'wallet' && parsedBudget > actualUsableBalance && (
                        <span className="badge bg-danger-subtle text-danger" style={{ fontSize: '0.7rem' }}>
                          ⚠️ পর্যাপ্ত ব্যালেন্স নেই!
                        </span>
                      )}
                    </div>
                    <div className="input-group">
                      <span className="input-group-text border-0 fw-bold fs-5 text-success" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0', color: '#10B981' }}>৳</span>
                      <input
                        type="number"
                        className="form-control form-control-lg border-0 rounded-end-3 fw-bolder fs-4"
                        style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', color: isDark ? '#fff' : '#0F172A' }}
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
                  <div className="d-flex justify-content-between align-items-center mb-2.5">
                    <h6 className={`fw-bold mb-0 ${isDark ? 'text-white' : 'text-dark'}`}>{sessionType === 'bazar' ? 'বাজারের ফর্দ' : 'ট্যুরের খরচের তালিকা'}</h6>
                    <span className="badge rounded-pill" style={{ background: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0', color: isDark ? '#CBD5E1' : '#334155' }}>{items.length} টি</span>
                  </div>

                  <div className="input-group mb-2.5">
                    <input
                      type="text"
                      className="form-control rounded-start-3"
                      style={{ 
                        background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', 
                        border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #CBD5E1', 
                        color: isDark ? '#fff' : '#0F172A' 
                      }}
                      placeholder={sessionType === 'bazar' ? 'আইটেম লিখুন...' : 'খরচের খাত লিখুন...'}
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                    />
                    <button className="btn rounded-end-3 fw-bold px-3 text-white" style={{ background: sessionType === 'bazar' ? '#10B981' : '#3B82F6' }} onClick={() => handleAddItem()}>+ যোগ</button>
                  </div>

                  <div className="d-flex flex-wrap gap-1 mb-2.5" style={{ maxHeight: '60px', overflowY: 'auto' }}>
                    {currentSuggestions.filter(p => !items.some(i => i.name === p)).slice(0, 8).map(chip => (
                      <button 
                        key={chip} 
                        className="btn btn-xs rounded-pill py-0.5 px-2 small" 
                        style={{ 
                          background: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9', 
                          color: isDark ? '#CBD5E1' : '#475569', 
                          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E2E8F0' 
                        }} 
                        onClick={() => handleAddItem(chip)}
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-4 p-2 mb-3" style={{ maxHeight: '160px', overflowY: 'auto', background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0' }}>
                    {items.length === 0 ? (
                      <p className="text-center small my-3" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>কোনো আইটেম যোগ করা হয়নি। সাজেশন থেকে ট্যাপ করুন।</p>
                    ) : (
                      items.map((item, idx) => (
                        <div key={item.id} className={`d-flex justify-content-between align-items-center p-1.5 border-bottom ${isDark ? 'border-secondary border-opacity-25' : 'border-light-subtle'}`}>
                          <span className={`small fw-semibold ${isDark ? 'text-white' : 'text-dark'}`}>{idx + 1}. {item.name}</span>
                          <button className="btn btn-sm py-0 px-1 text-danger rounded border-0" onClick={() => handleRemoveItem(item.id)}>
                            <i className="bi bi-trash small"></i>
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="d-flex gap-2">
                    <button className="btn rounded-3 fw-bold flex-grow-1" style={{ background: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', color: isDark ? '#CBD5E1' : '#334155', border: 'none' }} onClick={() => setStep(2)}>পেছনে</button>
                    <button className="btn rounded-3 fw-bold flex-grow-2 text-white" style={{ background: sessionType === 'bazar' ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #3B82F6, #2563EB)' }} onClick={() => setStep(4)}>
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
                      <span className="small text-white-50">
                        {editingSessionId ? '🔄 পরিবর্তন/এডিট মোড' : sessionType === 'bazar' ? '🛒 বাজার চলমান' : '✈️ ট্যুর চলমান'}:
                      </span>
                      <span className="fs-5 fw-bolder">৳{totalSpent}</span>
                    </div>
                    {parsedBudget > 0 && (
                      <>
                        <div className="d-flex justify-content-between align-items-center small text-white-50 mb-1.5">
                          <div className="d-flex align-items-center gap-2">
                            <span className="fw-semibold">বাজেট: ৳{parsedBudget}</span>
                            <button
                              className="btn btn-xs rounded-pill px-2 py-0.5 fw-bold d-flex align-items-center gap-1 shadow-sm"
                              style={{ 
                                background: 'rgba(255,255,255,0.2)',
                                backdropFilter: 'blur(8px)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.3)',
                                fontSize: '0.72rem'
                              }}
                              onClick={() => setTopUpModalOpen(true)}
                              title="টাকা যোগ করুন"
                            >
                              <i className="bi bi-plus-circle-fill text-warning"></i>
                              <span>টাকা যোগ</span>
                            </button>
                          </div>
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

                  {/* Tour Sub Tabs: Expenses vs Packing Plan */}
                  {sessionType === 'tour' && (
                    <div className="d-flex p-1 rounded-pill mb-2.5 border" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0' }}>
                      <button
                        className={`btn btn-xs flex-fill rounded-pill py-1 fw-bold ${tourSubTab === 'expenses' ? 'btn-primary text-white shadow-xs' : 'border-0'}`}
                        style={tourSubTab === 'expenses' ? {} : { color: isDark ? '#94A3B8' : '#64748B' }}
                        onClick={() => setTourSubTab('expenses')}
                      >
                        💰 খরচের হিসাব ({items.filter(i => i.bought).length}/{items.length})
                      </button>
                      <button
                        className={`btn btn-xs flex-fill rounded-pill py-1 fw-bold ${tourSubTab === 'packing' ? 'btn-primary text-white shadow-xs' : 'border-0'}`}
                        style={tourSubTab === 'packing' ? {} : { color: isDark ? '#94A3B8' : '#64748B' }}
                        onClick={() => setTourSubTab('packing')}
                      >
                        🎒 ব্যাগ প্যাকিং ({packingList.filter(p => p.packed).length}/{packingList.length})
                      </button>
                    </div>
                  )}

                  {sessionType === 'tour' && tourSubTab === 'packing' ? (
                    <div>
                      {/* Packing Input & Presets */}
                      <div className="input-group input-group-sm mb-2">
                        <input
                          type="text"
                          className="form-control rounded-start-3"
                          style={{ 
                            background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', 
                            border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #CBD5E1', 
                            color: isDark ? '#fff' : '#0F172A' 
                          }}
                          placeholder="প্যাকিং আইটেম (যেমন: পাওয়ার ব্যাংক, ছাতা)..."
                          value={newPackingItem}
                          onChange={(e) => setNewPackingItem(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newPackingItem.trim()) {
                              setPackingList([...packingList, { id: 'pack_' + Date.now(), name: newPackingItem.trim(), packed: false }]);
                              setNewPackingItem('');
                            }
                          }}
                        />
                        <button
                          className="btn btn-primary rounded-end-3 px-3 fw-bold"
                          onClick={() => {
                            if (!newPackingItem.trim()) return;
                            setPackingList([...packingList, { id: 'pack_' + Date.now(), name: newPackingItem.trim(), packed: false }]);
                            setNewPackingItem('');
                          }}
                        >
                          + যোগ
                        </button>
                      </div>

                      {/* Quick Presets */}
                      <div className="d-flex flex-wrap gap-1 mb-2" style={{ maxHeight: '55px', overflowY: 'auto' }}>
                        {PACKING_PRESETS.filter(p => !packingList.some(item => item.name === p)).slice(0, 6).map(preset => (
                          <button
                            key={preset}
                            className="btn btn-xs rounded-pill py-0 px-2 small"
                            style={{ 
                              background: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9', 
                              color: isDark ? '#CBD5E1' : '#475569', 
                              border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E2E8F0' 
                            }}
                            onClick={() => setPackingList([...packingList, { id: 'pack_' + Date.now() + Math.random(), name: preset, packed: false }])}
                          >
                            + {preset}
                          </button>
                        ))}
                      </div>

                      {/* Packing items list */}
                      <div className="rounded-4 p-2 mb-3" style={{ maxHeight: '180px', overflowY: 'auto', background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0' }}>
                        {packingList.length === 0 ? (
                          <p className="text-center small my-3" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>ব্যাগ প্যাকিংয়ের কোনো আইটেম নেই। উপরের সাজেশনের চিপ চাপুন।</p>
                        ) : (
                          packingList.map(item => (
                            <div
                              key={item.id}
                              onClick={() => {
                                setPackingList(packingList.map(p => p.id === item.id ? { ...p, packed: !p.packed } : p));
                              }}
                              className="d-flex justify-content-between align-items-center p-2 rounded-3 mb-1 cursor-pointer"
                              style={{ 
                                cursor: 'pointer',
                                background: item.packed ? 'rgba(16,185,129,0.12)' : (isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF'),
                                border: item.packed ? '1px solid rgba(16,185,129,0.3)' : (isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #E2E8F0')
                              }}
                            >
                              <div className="d-flex align-items-center gap-2">
                                <input type="checkbox" className="form-check-input mt-0 fs-5" checked={item.packed} readOnly />
                                <span className={`fw-semibold small ${item.packed ? 'text-decoration-line-through text-success' : (isDark ? 'text-white' : 'text-dark')}`}>{item.name}</span>
                              </div>
                              <button
                                className="btn btn-sm btn-link text-danger p-0 border-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPackingList(packingList.filter(p => p.id !== item.id));
                                }}
                              >
                                <i className="bi bi-trash small"></i>
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="small fw-bold" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>টিক দিয়ে খরচের দাম লিখুন:</span>
                        <button 
                          className="btn btn-sm btn-link p-0 text-decoration-none fw-bold small"
                          style={{ color: sessionType === 'bazar' ? (isDark ? '#34D399' : '#059669') : (isDark ? '#60A5FA' : '#2563EB') }}
                          onClick={() => {
                            setNewKhatName('');
                            setNewKhatModalOpen(true);
                          }}
                        >
                          + নতুন খাত
                        </button>
                      </div>

                      <div className="rounded-4 p-2 mb-3" style={{ maxHeight: '180px', overflowY: 'auto', background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0' }}>
                        {items.map(item => (
                          <div 
                            key={item.id} 
                            onClick={() => handleInitiateCheck(item)}
                            className="d-flex justify-content-between align-items-center p-2 rounded-3 mb-1 cursor-pointer"
                            style={{ 
                              cursor: 'pointer',
                              background: item.bought ? 'rgba(16,185,129,0.1)' : (isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF'),
                              border: item.bought ? '1px solid rgba(16,185,129,0.25)' : (isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #E2E8F0')
                            }}
                          >
                            <div className="d-flex align-items-center gap-2">
                              <input type="checkbox" className="form-check-input mt-0 fs-5" checked={item.bought} readOnly />
                              <span className={`fw-semibold small ${item.bought ? 'text-decoration-line-through ' + (isDark ? 'text-white-50' : 'text-muted') : (isDark ? 'text-white' : 'text-dark')}`}>{item.name}</span>
                            </div>
                            <div>
                              {item.bought ? (
                                <span className="badge rounded-pill fw-bold" style={{ background: 'rgba(16,185,129,0.25)', color: isDark ? '#34D399' : '#059669' }}>৳{item.price}</span>
                              ) : (
                                <span className="small border rounded px-1.5 py-0.5" style={{ color: isDark ? '#94A3B8' : '#64748B', borderColor: isDark ? 'rgba(255,255,255,0.15)' : '#CBD5E1' }}>লিখুন</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

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
                  <h5 className={`fw-bolder mb-1 ${isDark ? 'text-white' : 'text-dark'}`}>{sessionType === 'bazar' ? 'বাজার সফলভাবে সম্পন্ন!' : 'ট্যুর সফলভাবে সম্পন্ন!'}</h5>
                  <p className="small mb-3" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>সারসংক্ষেপ দেখে ওয়ালেট নিশ্চিত করুন</p>

                  {/* Summary Card */}
                  <div className="p-3 rounded-4 text-start mb-3" style={{ background: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E2E8F0' }}>
                    <div className={`d-flex justify-content-between py-1.5 border-bottom ${isDark ? 'border-secondary border-opacity-25' : 'border-light-subtle'}`}>
                      <span className="small" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>মোট খাত:</span>
                      <span className={`fw-bold ${isDark ? 'text-white' : 'text-dark'}`}>{items.filter(i => i.bought).length} টি</span>
                    </div>
                    <div className={`d-flex justify-content-between py-1.5 border-bottom ${isDark ? 'border-secondary border-opacity-25' : 'border-light-subtle'}`}>
                      <span className="small" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>মোট ব্যয়:</span>
                      <span className="fw-bolder text-success fs-5">৳{totalSpent.toLocaleString()}</span>
                    </div>
                    {parsedBudget > 0 && (
                      <div className="d-flex justify-content-between py-1.5">
                        <span className="small" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                          {remainingBudget >= 0 ? 'সাশ্রয় হয়েছে:' : 'বাজেট ছাড়িয়েছে:'}
                        </span>
                        <span className={`fw-bold ${remainingBudget >= 0 ? 'text-success' : 'text-danger'}`}>
                          ৳{Math.abs(remainingBudget).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Finishing Time Wallet Confirmation Selector */}
                  <div className="p-3 rounded-4 text-start mb-3" style={{ background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0' }}>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className={`small fw-bold d-flex align-items-center gap-1.5 ${isDark ? 'text-white' : 'text-dark'}`}>
                        <i className="bi bi-wallet2 text-success"></i> পেমেন্ট / ওয়ালেট সিলেক্ট করুন
                      </span>
                    </div>

                    <select
                      className="form-select rounded-3 mb-2"
                      style={{ background: isDark ? '#1E293B' : '#FFFFFF', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #CBD5E1', color: isDark ? '#fff' : '#0F172A', fontSize: '0.85rem' }}
                      value={selectedAccountId}
                      onChange={(e) => {
                        setSelectedAccountId(e.target.value);
                        setSelectedDistId('');
                      }}
                    >
                      {walletData.accounts?.map(acc => {
                        const wAlloc = (acc.distributions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
                        const wUnalloc = Math.max(0, (Number(acc.amount) || 0) - wAlloc);
                        const wDistTot = (acc.distributions || []).reduce((s, d) => s + getDistBalance(acc, d.id), 0);
                        const wBal = wUnalloc + wDistTot;
                        return (
                          <option key={acc.id} value={acc.id}>
                            💼 {acc.name} (ব্যালেন্স: ৳{wBal.toLocaleString()})
                          </option>
                        );
                      })}
                    </select>

                    {currentWallet?.distributions?.length > 0 && (
                      <select
                        className="form-select rounded-3 mb-2"
                        style={{ background: isDark ? '#1E293B' : '#FFFFFF', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #CBD5E1', color: isDark ? '#fff' : '#0F172A', fontSize: '0.82rem' }}
                        value={selectedDistId}
                        onChange={(e) => setSelectedDistId(e.target.value)}
                      >
                        <option value="">🌐 পুরো অ্যাকাউন্ট থেকে কাটুন</option>
                        {currentWallet.distributions.map(d => (
                          <option key={d.id} value={d.id}>
                            🏷️ {d.name} (অবশিষ্ট: ৳{getDistBalance(currentWallet, d.id).toLocaleString()})
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="d-flex justify-content-between align-items-center small p-2 rounded-3 mt-1" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }}>
                      <span style={{ color: isDark ? '#94A3B8' : '#64748B' }}>কাটার পর নতুন ব্যালেন্স:</span>
                      <span className={`fw-bold ${((actualUsableBalance || 0) - totalSpent) < 0 ? 'text-danger' : 'text-success'}`}>
                        ৳{Math.max(0, (actualUsableBalance || 0) - totalSpent).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="d-grid gap-2">
                    <button 
                      className="btn py-2.5 rounded-3 fw-bold text-white shadow-sm"
                      style={{ background: 'linear-gradient(135deg, #10B981, #059669)', border: 'none' }}
                      disabled={isSyncing} 
                      onClick={() => handleFinishAndSave(true)}
                    >
                      {isSyncing ? 'সংরক্ষণ হচ্ছে...' : '💳 ওয়ালেট থেকে টাকা বাদ দিয়ে সেভ করুন'}
                    </button>
                    <button 
                      className="btn py-2 rounded-3 fw-bold"
                      style={{ 
                        background: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', 
                        color: isDark ? '#CBD5E1' : '#334155', 
                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #CBD5E1' 
                      }}
                      disabled={isSyncing} 
                      onClick={() => handleFinishAndSave(false)}
                    >
                      শুধু হিস্টোরিতে সেভ করুন (টাকা কাটা হবে না)
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
              <div 
                className="card p-2.5 rounded-4 border-0 shadow-sm mb-2.5" 
                style={{ 
                  background: isDark ? 'linear-gradient(135deg, #0F172A, #1E293B)' : '#FFFFFF',
                  color: isDark ? '#F8FAFC' : '#0F172A',
                  border: isDark ? 'none' : '1px solid #E2E8F0',
                  boxShadow: isDark ? 'none' : '0 4px 20px rgba(0,0,0,0.05)'
                }}
              >
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className={`small fw-semibold d-flex align-items-center gap-1 ${isDark ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.74rem' }}>
                    <i className="bi bi-pie-chart-fill text-success"></i> সার্বিক হিসাব
                  </span>
                  <span className={`badge fw-bold rounded-pill px-2 py-0.5 ${isDark ? 'bg-white text-dark' : 'bg-light text-dark border'}`} style={{ fontSize: '0.72rem' }}>
                    📊 {historyList.filter(h => h.status === 'completed').length} টি সম্পন্ন
                  </span>
                </div>
                <div className="d-flex gap-2 text-center">
                  <div className={`flex-fill p-1.5 rounded-3 border ${isDark ? 'bg-white bg-opacity-10 border-white border-opacity-10' : 'bg-light border-light-subtle'}`}>
                    <span className={`d-block ${isDark ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.65rem' }}>মোট খরচ</span>
                    <span className="fw-bolder text-success" style={{ fontSize: '0.88rem' }}>
                      ৳{historyList.filter(h => h.status === 'completed').reduce((sum, h) => sum + (h.totalSpent || 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <div className={`flex-fill p-1.5 rounded-3 border ${isDark ? 'bg-white bg-opacity-10 border-white border-opacity-10' : 'bg-light border-light-subtle'}`}>
                    <span className={`d-block ${isDark ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '0.65rem' }}>মোট সাশ্রয়</span>
                    <span className={`fw-bolder ${isDark ? 'text-warning' : 'text-primary'}`} style={{ fontSize: '0.88rem' }}>
                      ৳{historyList.filter(h => h.status === 'completed').reduce((sum, h) => sum + Math.max(0, (h.budget || 0) - (h.totalSpent || 0)), 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Filter Pills */}
            <div className="d-flex justify-content-between align-items-center mb-2.5">
              <span className="small fw-bold" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>ইভেন্ট তালিকা</span>
              <div className="d-flex p-1 rounded-pill gap-1" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)' }}>
                {['all', 'bazar', 'tour', 'trash'].map(t => (
                  <button 
                    key={t} 
                    className={`btn btn-xs rounded-pill px-2.5 py-0.5 fw-bold transition-all ${historyFilter === t ? 'bg-white text-dark shadow-sm' : (isDark ? 'border-0 text-white-50' : 'border-0 text-secondary')}`}
                    onClick={() => setHistoryFilter(t)}
                  >
                    {t === 'all' ? 'সব' : t === 'bazar' ? '🛒 বাজার' : t === 'tour' ? '✈️ ট্যুর' : `🗑️ ট্র্যাশ (${historyList.filter(h => h.status === 'trashed').length})`}
                  </button>
                ))}
              </div>
            </div>

            {loadingHistory ? (
              <div className="text-center py-5 text-muted small"><div className="spinner-border spinner-border-sm me-2"></div>লোড হচ্ছে...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="rounded-4 p-5 text-center" style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF', border: isDark ? '1px dashed rgba(255,255,255,0.1)' : '1px dashed #CBD5E1' }}>
                <i className={`bi bi-clock-history fs-2 mb-2 ${isDark ? 'text-white-50' : 'text-muted'}`}></i>
                <p className={`small mb-0 ${isDark ? 'text-white-50' : 'text-muted'}`}>কোনো পূর্ববর্তী হিস্ট্রি পাওয়া যায়নি।</p>
              </div>
            ) : (
              filteredHistory.map(session => {
                const isTour = session.type === 'tour';
                const diff = (session.budget || 0) - (session.totalSpent || 0);
                const isSaved = diff >= 0;
                const boughtItems = (session.items || []).filter(i => i.bought);
                const displayItems = boughtItems.length > 0 ? boughtItems : (session.items || []);

                return (
                  <div 
                    key={session.id} 
                    className="p-3 rounded-4 mb-3 transition-all"
                    style={{ 
                      background: isDark ? 'rgba(255, 255, 255, 0.04)' : '#FFFFFF',
                      backdropFilter: isDark ? 'blur(12px)' : 'none',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #E2E8F0',
                      boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.2)' : '0 4px 20px rgba(0,0,0,0.05)'
                    }}
                  >
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
                          <div className={`fw-bolder mb-0 lh-sm ${isDark ? 'text-white' : 'text-dark'}`} style={{ fontSize: '0.92rem' }}>{session.title}</div>
                          <span style={{ fontSize: '0.72rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                            <i className="bi bi-calendar3 me-1"></i>
                            {session.timestamp 
                              ? new Date(session.timestamp).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : 'পূর্ববর্তী রেকর্ড'}
                          </span>
                        </div>
                      </div>
                      <div className="text-end">
                        <div className={`fw-bolder fs-5 lh-sm ${isDark ? 'text-white' : 'text-dark'}`}>৳{session.totalSpent?.toLocaleString()}</div>
                        {session.budget > 0 && (
                          <span 
                            className="badge rounded-pill" 
                            style={{ 
                              fontSize: '0.68rem',
                              background: isSaved ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                              color: isSaved ? '#10B981' : '#EF4444'
                            }}
                          >
                            {isSaved ? `+৳${diff} সাশ্রয়` : `-৳${Math.abs(diff)} অতিরিক্ত`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 48-Hour Reopen Banner (Mobile-Optimized Clean Bar) */}
                    {session.status !== 'trashed' && getRemainingTimeStr(session.timestamp) && (
                      <div 
                        className="d-flex justify-content-between align-items-center rounded-3 px-2.5 py-1.5 mb-2.5 mt-1"
                        style={{ background: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)', border: isDark ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(59,130,246,0.2)' }}
                      >
                        <span className="small fw-bold d-flex align-items-center gap-1.5" style={{ fontSize: '0.74rem', color: isDark ? '#60A5FA' : '#2563EB' }}>
                          <span className="spinner-grow spinner-grow-sm text-primary" style={{ width: '7px', height: '7px' }}></span>
                          এডিট সুযোগ: {getRemainingTimeStr(session.timestamp)}
                        </span>
                        <button 
                          className="btn btn-xs rounded-pill px-2.5 py-0.5 fw-bold text-white shadow-sm"
                          style={{ fontSize: '0.74rem', background: '#2563EB', border: 'none' }}
                          onClick={() => handleReopenSession(session)}
                        >
                          🔓 রি-ওপেন
                        </button>
                      </div>
                    )}

                    {/* Quick Preview Tag Chips */}
                    {displayItems.length > 0 && (
                      <div className="d-flex flex-wrap gap-1 my-2">
                        {displayItems.slice(0, 4).map((it, idx) => (
                          <span key={idx} className="badge rounded-pill px-2 py-1" style={{ fontSize: '0.72rem', background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', color: isDark ? '#CBD5E1' : '#475569', border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0' }}>
                            {it.name} <strong className={isDark ? 'text-white' : 'text-dark'}>৳{it.price || 0}</strong>
                          </span>
                        ))}
                        {displayItems.length > 4 && (
                          <span className="badge rounded-pill px-2 py-1" style={{ fontSize: '0.72rem', background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', color: isDark ? '#94A3B8' : '#64748B' }}>
                            +{displayItems.length - 4}টি আরো...
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bottom Action Bar */}
                    <div className="d-flex justify-content-between align-items-center pt-2.5 mt-1" style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #F1F5F9' }}>
                      <button 
                        className="btn btn-xs rounded-pill px-2.5 py-1 fw-bold d-flex align-items-center gap-1"
                        style={{ background: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.1)', color: isDark ? '#34D399' : '#059669', border: '1px solid rgba(16,185,129,0.3)' }}
                        onClick={() => handleShareSessionWhatsApp(session)}
                        title="WhatsApp শেয়ার"
                      >
                        <i className="bi bi-whatsapp"></i>
                        <span>শেয়ার</span>
                      </button>

                      <div className="d-flex align-items-center gap-1">
                        <button 
                          className="btn btn-xs rounded-pill px-2 py-1 fw-semibold"
                          style={{ 
                            background: expandedHistoryId === session.id ? (isDark ? 'rgba(255,255,255,0.2)' : '#E2E8F0') : (isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9'),
                            color: isDark ? '#E2E8F0' : '#334155', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #CBD5E1'
                          }}
                          onClick={() => setExpandedHistoryId(expandedHistoryId === session.id ? null : session.id)}
                        >
                          <i className="bi bi-receipt me-1"></i>ভাউচার
                        </button>
                        
                        {session.status === 'trashed' ? (
                          <>
                            <button 
                              className="btn btn-xs btn-outline-success rounded-pill px-2 py-1 fw-semibold"
                              onClick={() => handleRestoreFromTrash(session.id)}
                              title="পুনরুদ্ধার করুন"
                            >
                              ♻️ রিস্টোর
                            </button>
                            <button 
                              className="btn btn-xs btn-danger text-white rounded-circle p-1 d-flex align-items-center justify-content-center"
                              style={{ width: '28px', height: '28px' }}
                              onClick={() => setDeleteConfirmId(session.id)}
                              title="চিরতরে মুছুন"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              className="btn btn-xs rounded-pill px-2 py-1 fw-semibold"
                              style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#EFF6FF', color: isDark ? '#60A5FA' : '#2563EB', border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #BFDBFE' }}
                              onClick={() => handleCloneHistory(session)}
                              title="পুনরায় ব্যবহার"
                            >
                              <i className="bi bi-arrow-repeat me-1"></i>রি-ইউজ
                            </button>
                            <button 
                              className="btn btn-xs rounded-circle p-1 d-flex align-items-center justify-content-center"
                              style={{ width: '28px', height: '28px', background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}
                              onClick={() => handleMoveToTrash(session.id)}
                              title="ট্র্যাশে পাঠান"
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          </>
                        )}
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

      {/* Top-Up / Add Money Modal (Modern Bottom Sheet / Centered Card on Mobile) */}
      {topUpModalOpen && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3 animate-fade-in" 
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1200, backdropFilter: 'blur(8px)' }}
          onClick={() => setTopUpModalOpen(false)}
        >
          <div 
            className="p-3.5 rounded-4 shadow-lg w-100 animate-slide-up" 
            style={{ 
              maxWidth: '340px',
              background: isDark ? '#0F172A' : '#FFFFFF',
              border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #E2E8F0',
              color: isDark ? '#F8FAFC' : '#0F172A'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-2.5">
              <div className="d-flex align-items-center gap-2">
                <span className="badge rounded-circle p-2 bg-success bg-opacity-25 text-success d-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px' }}>
                  <i className="bi bi-cash-stack fs-6"></i>
                </span>
                <h6 className={`fw-bold mb-0 ${isDark ? 'text-white' : 'text-dark'}`} style={{ fontSize: '0.96rem' }}>
                  বাজেট / টাকা যোগ করুন
                </h6>
              </div>
              <button 
                className={`btn btn-sm btn-link p-0 border-0 ${isDark ? 'text-white-50' : 'text-muted'}`} 
                onClick={() => setTopUpModalOpen(false)}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            
            <p className="small mb-2" style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: '0.78rem' }}>
              চলমান সেশনের মূল বাজেটের সাথে অতিরিক্ত টাকা যোগ করুন:
            </p>

            {/* If funded via wallet, display real available balance & wallet tag */}
            {fundingSource === 'wallet' && (
              <div 
                className="p-2 rounded-3 mb-2.5 d-flex justify-content-between align-items-center"
                style={{ background: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
              >
                <div>
                  <span className="d-block" style={{ fontSize: '0.7rem', color: isDark ? '#94A3B8' : '#64748B' }}>
                    {selectedDistId ? 'নির্বাচিত ফান্ডে অবশিষ্ট' : 'ওয়ালেটে খরচযোগ্য নগদ'}
                  </span>
                  <span className="fw-bolder fs-6 text-success">৳{(actualUsableBalance || 0).toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-xs rounded-pill px-2 py-0.5 fw-bold"
                  style={{ background: 'rgba(16,185,129,0.25)', color: isDark ? '#34D399' : '#059669', border: 'none', fontSize: '0.72rem' }}
                  onClick={() => setTopUpAmount(Math.min(actualUsableBalance || 0, 1000).toString())}
                >
                  সর্বোচ্চ নিন
                </button>
              </div>
            )}

            {/* Big Amount Input */}
            <div className="input-group mb-2.5" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderRadius: '14px', border: isDark ? '1px solid rgba(255,255,255,0.15)' : '1px solid #CBD5E1', overflow: 'hidden' }}>
              <span className="input-group-text bg-transparent border-0 fw-bold fs-4 text-success ps-3">৳</span>
              <input
                type="number"
                className={`form-control form-control-lg bg-transparent border-0 fw-bolder fs-3 pe-3 ${isDark ? 'text-white' : 'text-dark'}`}
                placeholder="৫০০"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                autoFocus
              />
            </div>

            {/* Quick Increment Chips */}
            <div className="d-flex gap-1.5 mb-3.5">
              {[200, 500, 1000, 2000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  className="btn btn-xs flex-fill rounded-pill py-1.5 fw-bold"
                  style={{ 
                    background: topUpAmount === amt.toString() ? '#10B981' : (isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9'),
                    color: topUpAmount === amt.toString() ? '#fff' : (isDark ? '#CBD5E1' : '#334155'),
                    border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #E2E8F0',
                    fontSize: '0.75rem'
                  }}
                  onClick={() => setTopUpAmount(amt.toString())}
                >
                  +৳{amt}
                </button>
              ))}
            </div>

            <div className="d-flex gap-2">
              <button 
                className="btn flex-fill rounded-3 fw-bold py-2" 
                style={{ background: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', color: isDark ? '#94A3B8' : '#475569', border: 'none' }}
                onClick={() => setTopUpModalOpen(false)}
              >
                বাতিল
              </button>
              <button 
                className="btn flex-fill rounded-3 fw-bold text-white py-2 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)', border: 'none' }}
                onClick={handleAddTopUpMoney}
              >
                টাকা যোগ করুন
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
            <h6 className="fw-bold text-dark mb-1">স্থায়ীভাবে মুছে ফেলতে চান?</h6>
            <p className="text-muted small mb-3">এই রেকর্ডটি ট্র্যাশ থেকে চিরতরে মুছে যাবে।</p>
            <div className="d-flex gap-2">
              <button className="btn btn-light rounded-3 fw-bold flex-grow-1" onClick={() => setDeleteConfirmId(null)}>বাতিল</button>
              <button className="btn btn-danger rounded-3 fw-bold flex-grow-1" onClick={handleDeletePermanent}>মুছে ফেলুন</button>
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
