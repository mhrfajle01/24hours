import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/firebase';
import { 
  doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, deleteDoc, updateDoc 
} from 'firebase/firestore';
import { useSound } from '../contexts/SoundContext';

// Accurate Bangladesh Standard Time (BST: UTC+6) date string (YYYY-MM-DD)
const getBDDateString = (dateObj = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dateObj);
};

export default function ShopFinancePage({ currentUser, onBack }) {
  const { playSound } = useSound();
  const [activeTab, setActiveTab] = useState('register'); // 'register' | 'due_ledger' | 'reports' | 'analytics'
  const [selectedDate, setSelectedDate] = useState(() => getBDDateString());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Daily Ledger State
  const [openingCash, setOpeningCash] = useState(0);
  const [cashSales, setCashSales] = useState(0);
  const [creditSales, setCreditSales] = useState(0);
  const [dueCollected, setDueCollected] = useState(0);
  const [actualCash, setActualCash] = useState(0);
  const [notes, setNotes] = useState('');

  // Cash Denomination Calculator
  const [showDenomModal, setShowDenomModal] = useState(false);
  const [denoms, setDenoms] = useState({
    1000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0
  });

  // Profit/Loss Formula settings
  const [profitCalculationBasis, setProfitCalculationBasis] = useState('margin_based');
  const [grossMarginPct, setGrossMarginPct] = useState(12);
  const [deductShopExpense, setDeductShopExpense] = useState(true);
  const [deductPersonalDrawings, setDeductPersonalDrawings] = useState(false);
  const [deductStockPurchases, setDeductStockPurchases] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState([]);
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCategory, setTxCategory] = useState('দোকানের খরচ');
  const [txType, setTxType] = useState('shop_expense');

  // Customer Due State
  const [customers, setCustomers] = useState([]);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isEditingCust, setIsEditingCust] = useState(false);
  const [editCustName, setEditCustName] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [dueActionType, setDueActionType] = useState('add_due');
  const [dueAmount, setDueAmount] = useState('');
  const [dueNote, setDueNote] = useState('');
  const [dueRecords, setDueRecords] = useState([]);
  const [bakiAlert, setBakiAlert] = useState(null); // { type: 'success' | 'error' | 'warning', title: '', message: '', onConfirm?: fn }
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const [custFilterTab, setCustFilterTab] = useState('all'); // 'all' | 'due' | 'clear'

  // Reports & Analytics State
  const [allEntries, setAllEntries] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);
  const [reportViewMode, setReportViewMode] = useState('daily'); // 'daily' | 'itemized'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [discrepancyFilter, setDiscrepancyFilter] = useState('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Wizard Mode State (Interactive Step-by-Step Closing)
  const [wizardStep, setWizardStep] = useState(0); // 0 = welcome card, 1 = sales, 2 = expenses, 3 = count cash, 4 = summary
  const [showClassicForm, setShowClassicForm] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState('single'); // 'single' | '7days' | '30days' | 'thisMonth' | 'custom'
  const [exportType, setExportType] = useState('full'); // 'full' | 'itemized' | 'due'
  const [selectedReportSections, setSelectedReportSections] = useState({
    summary: true,
    expenses: true,
    due: true
  });
  const [customExportFrom, setCustomExportFrom] = useState(() => getBDDateString());
  const [customExportTo, setCustomExportTo] = useState(() => getBDDateString());
  const [successAlert, setSuccessAlert] = useState(null); // { title, msg, link }

  const categories = [
    'দোকানের খরচ',
    'সিগারেট',
    'পান সুপারি',
    'রুটি / বেকারি',
    'মুদি / পণ্য স্টক',
    'বিদ্যুৎ / ভাড়া / দোকান',
    'ব্যক্তিগত / পরিবার',
    'আব্বু / আম্মা',
    'অন্যান্য'
  ];

  // Derived calculations for current selected date
  const totalShopExpenses = transactions
    .filter(t => t.type === 'shop_expense')
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const totalStockPurchases = transactions
    .filter(t => t.type === 'stock_purchase')
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const totalPersonalDrawings = transactions
    .filter(t => t.type === 'personal_drawing')
    .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const totalSales = (Number(cashSales) || 0) + (Number(creditSales) || 0);

  const expectedClosingCash = 
    (Number(openingCash) || 0) + 
    (Number(cashSales) || 0) + 
    (Number(dueCollected) || 0) - 
    totalShopExpenses - 
    totalStockPurchases - 
    totalPersonalDrawings;

  const discrepancy = (Number(actualCash) || 0) - expectedClosingCash;
  const totalMarketDue = customers.reduce((sum, c) => sum + (Number(c.totalDue) || 0), 0);

  const calculateDayProfit = (sales, shopExp, drawings, stock) => {
    let baseRevenue = profitCalculationBasis === 'margin_based' ? Math.round(sales * (grossMarginPct / 100)) : sales;
    let deductions = 0;
    if (deductShopExpense) deductions += shopExp;
    if (deductPersonalDrawings) deductions += drawings;
    if (deductStockPurchases) deductions += stock;
    return baseRevenue - deductions;
  };

  const currentDayProfit = calculateDayProfit(
    totalSales, 
    totalShopExpenses, 
    totalPersonalDrawings, 
    totalStockPurchases
  );

  const denomTotal = useMemo(() => {
    return Object.entries(denoms).reduce((sum, [note, count]) => sum + (Number(note) * (Number(count) || 0)), 0);
  }, [denoms]);

  // Load Daily Data & Customers
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!currentUser?.uid) return;
      setLoading(true);
      try {
        const entryRef = doc(db, 'shopFinance', currentUser.uid, 'dailyEntries', selectedDate);
        const entrySnap = await getDoc(entryRef);
        if (entrySnap.exists() && isMounted) {
          const d = entrySnap.data();
          setOpeningCash(d.openingCash ?? 0);
          setCashSales(d.cashSales ?? 0);
          setCreditSales(d.creditSales ?? 0);
          setDueCollected(d.dueCollected ?? 0);
          setActualCash(d.actualCash ?? 0);
          setNotes(d.notes || '');
          if (d.grossMarginPct) setGrossMarginPct(d.grossMarginPct);
        } else if (isMounted) {
          const prevDateObj = new Date(selectedDate);
          prevDateObj.setDate(prevDateObj.getDate() - 1);
          const prevStr = getBDDateString(prevDateObj);
          const prevSnap = await getDoc(doc(db, 'shopFinance', currentUser.uid, 'dailyEntries', prevStr));
          const prevCash = prevSnap.exists() ? (prevSnap.data().actualCash ?? prevSnap.data().expectedClosingCash ?? prevSnap.data().expectedCash ?? 0) : 0;
          setOpeningCash(prevCash);
          setCashSales(0);
          setCreditSales(0);
          setDueCollected(0);
          setActualCash(prevCash);
          setNotes('');
        }

        const txQuery = query(
          collection(db, 'shopFinance', currentUser.uid, 'transactions'),
          where('date', '==', selectedDate)
        );
        const txSnap = await getDocs(txQuery);
        if (isMounted) {
          setTransactions(txSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }

        const custSnap = await getDocs(collection(db, 'shopFinance', currentUser.uid, 'customers'));
        if (isMounted) {
          setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('Error loading shop data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [selectedDate, currentUser]);

  // Load All Entries & All Transactions for Reports
  useEffect(() => {
    let isMounted = true;
    async function loadAllEntries() {
      if (!currentUser?.uid || (activeTab !== 'reports' && activeTab !== 'analytics')) return;
      try {
        const snap = await getDocs(collection(db, 'shopFinance', currentUser.uid, 'dailyEntries'));
        const txSnap = await getDocs(collection(db, 'shopFinance', currentUser.uid, 'transactions'));
        if (isMounted) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          setAllEntries(list);

          const txList = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          txList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          setAllTransactions(txList);
        }
      } catch (err) {
        console.error('Reports load error:', err);
      }
    }
    loadAllEntries();
    return () => { isMounted = false; };
  }, [activeTab, currentUser]);

  // Load Selected Customer History
  useEffect(() => {
    let isMounted = true;
    async function loadCustHistory() {
      if (!currentUser?.uid || !selectedCustomer) {
        setDueRecords([]);
        return;
      }
      try {
        const rQuery = query(
          collection(db, 'shopFinance', currentUser.uid, 'dueRecords'),
          where('customerId', '==', selectedCustomer.id)
        );
        const rSnap = await getDocs(rQuery);
        if (isMounted) {
          const list = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          setDueRecords(list);
        }
      } catch (e) {
        console.error('Cust history error:', e);
      }
    }
    loadCustHistory();
    return () => { isMounted = false; };
  }, [selectedCustomer, currentUser]);

  const handleSaveDay = async () => {
    if (!currentUser?.uid) return;
    setSaving(true);
    try {
      const entryRef = doc(db, 'shopFinance', currentUser.uid, 'dailyEntries', selectedDate);
      await setDoc(entryRef, {
        date: selectedDate,
        openingCash: Number(openingCash) || 0,
        cashSales: Number(cashSales) || 0,
        creditSales: Number(creditSales) || 0,
        dueCollected: Number(dueCollected) || 0,
        totalShopExpenses,
        totalStockPurchases,
        totalPersonalDrawings,
        totalSales,
        estimatedNetProfit: currentDayProfit,
        grossMarginPct,
        expectedClosingCash,
        actualCash: Number(actualCash) || 0,
        discrepancy,
        notes,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      if (discrepancy === 0) {
        setShowCelebration(true);
        try { playSound?.('success'); } catch {}
        setTimeout(() => setShowCelebration(false), 3500);
      } else {
        try { playSound?.('points'); } catch {}
      }
      alert('হিসাব সফলভাবে সংরক্ষণ হয়েছে!');
    } catch (err) {
      console.error('Save failed:', err);
      alert('সংরক্ষণে সমস্যা: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!txAmount || !currentUser?.uid) return;
    try {
      const newTx = {
        date: selectedDate,
        description: txDesc.trim() || txCategory,
        category: txCategory,
        amount: Number(txAmount),
        type: txType,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'shopFinance', currentUser.uid, 'transactions'), newTx);
      setTransactions(prev => [{ id: docRef.id, ...newTx }, ...prev]);
      setAllTransactions(prev => [{ id: docRef.id, ...newTx }, ...prev]);
      try { playSound?.('points'); } catch {}
      setTxDesc('');
      setTxAmount('');
    } catch (err) {
      console.error('Add tx failed:', err);
      alert('খরচ যোগ করতে সমস্যা: ' + err.message);
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!currentUser?.uid) return;
    try {
      await deleteDoc(doc(db, 'shopFinance', currentUser.uid, 'transactions', id));
      setTransactions(prev => prev.filter(t => t.id !== id));
      setAllTransactions(prev => prev.filter(t => t.id !== id));
      try { playSound?.('trash'); } catch {}
    } catch (err) {
      console.error('Delete tx failed:', err);
    }
  };

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    if (!custName.trim() || !currentUser?.uid) return;
    try {
      const newCust = {
        name: custName.trim(),
        phone: custPhone.trim(),
        totalDue: 0,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'shopFinance', currentUser.uid, 'customers'), newCust);
      const created = { id: docRef.id, ...newCust };
      setCustomers(prev => [...prev, created]);
      setSelectedCustomer(created);
      try { playSound?.('points'); } catch {}
      setCustName('');
      setCustPhone('');
      setBakiAlert({
        type: 'success',
        title: 'কাস্টমার যোগ সম্পন্ন',
        message: `"${created.name}" কাস্টমার সফলভাবে তালিকায় যোগ করা হয়েছে।`
      });
    } catch (err) {
      console.error('Add customer error:', err);
      setBakiAlert({
        type: 'error',
        title: 'যোগ করতে ব্যর্থ',
        message: err.message
      });
    }
  };

  const handleDueTransaction = async (e) => {
    e.preventDefault();
    if (!dueAmount || !selectedCustomer || !currentUser?.uid) return;
    const amt = Number(dueAmount);
    if (isNaN(amt) || amt <= 0) {
      setBakiAlert({
        type: 'warning',
        title: 'সঠিক টাকার পরিমাণ দিন',
        message: 'টাকার পরিমাণ ০ এর বেশি হতে হবে।'
      });
      return;
    }

    const currentDue = Number(selectedCustomer.totalDue) || 0;
    const isCollect = dueActionType === 'collect_due';

    if (isCollect) {
      if (currentDue <= 0) {
        setBakiAlert({
          type: 'warning',
          title: 'বকেয়া নেই',
          message: `${selectedCustomer.name}-এর কোনো বকেয়া বাকি নেই (বাকি ৳০), তাই আদায় নেওয়া সম্ভব নয়।`
        });
        return;
      }
      if (amt > currentDue) {
        setBakiAlert({
          type: 'warning',
          title: 'অতিরিক্ত আদায় প্রযোজ্য নয়',
          message: `কাস্টমারের মোট বাকি ৳${currentDue}। আপনি ৳${amt} আদায় করতে পারবেন না (ব্যালেন্স মাইনাস হবে না)। প্রয়োজনে সর্বোচ্চ ৳${currentDue} আদায় করুন।`
        });
        return;
      }
    }

    const updatedDue = isCollect ? currentDue - amt : currentDue + amt;

    try {
      await updateDoc(doc(db, 'shopFinance', currentUser.uid, 'customers', selectedCustomer.id), {
        totalDue: updatedDue
      });

      const newRec = {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        type: dueActionType,
        amount: amt,
        date: selectedDate,
        notes: dueNote.trim(),
        createdAt: new Date().toISOString()
      };
      const recDoc = await addDoc(collection(db, 'shopFinance', currentUser.uid, 'dueRecords'), newRec);

      if (isCollect) {
        setDueCollected(prev => Number(prev || 0) + amt);
        try { playSound?.('success'); } catch {}
      } else {
        setCreditSales(prev => Number(prev || 0) + amt);
        try { playSound?.('points'); } catch {}
      }

      setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, totalDue: updatedDue } : c));
      setSelectedCustomer(prev => ({ ...prev, totalDue: updatedDue }));
      setDueRecords(prev => [{ id: recDoc.id, ...newRec }, ...prev]);
      setDueAmount('');
      setDueNote('');
    } catch (err) {
      console.error('Due transaction error:', err);
      setBakiAlert({
        type: 'error',
        title: 'লেনদেনে সমস্যা',
        message: err.message
      });
    }
  };

  const sendCustomerWhatsAppSlip = (cust) => {
    if (!cust) return;
    let phone = (cust.phone || '').replace(/[^0-9]/g, '');
    if (!phone) {
      setBakiAlert({
        type: 'warning',
        title: 'মোবাইল নম্বর নেই',
        message: 'এই কাস্টমারের কোনো মোবাইল নম্বর সংরক্ষণ করা নেই। অনুগ্রহ করে এডিট করে মোবাইল নম্বর যুক্ত করুন।'
      });
      return;
    }

    if (phone.startsWith('0')) {
      phone = '88' + phone;
    } else if (phone.length === 10 && phone.startsWith('1')) {
      phone = '880' + phone;
    }

    const dueAmountVal = Number(cust.totalDue) || 0;
    const msg = `আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহ, ${cust.name}।\n\n` +
      `দোকানের হিসাব অনুযায়ী আপনার পূর্বের বকেয়া বাকি রয়েছে:\n` +
      `💰 *বকেয়া টাকার পরিমাণ:* ৳${dueAmountVal}/-\n\n` +
      `অনুগ্রহ করে আপনার সুবিধাজনক সময়ে বকেয়া পরিশোধ করার জন্য বিনীত অনুরোধ জানাচ্ছি।\n` +
      `জাযাকাল্লাহু খাইরান।`;

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    if (!editCustName.trim() || !selectedCustomer || !currentUser?.uid) return;
    try {
      const updated = {
        name: editCustName.trim(),
        phone: editCustPhone.trim()
      };
      await updateDoc(doc(db, 'shopFinance', currentUser.uid, 'customers', selectedCustomer.id), updated);
      setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, ...updated } : c));
      setSelectedCustomer(prev => ({ ...prev, ...updated }));
      setIsEditingCust(false);
      try { playSound?.('points'); } catch {}
      setBakiAlert({
        type: 'success',
        title: 'আপডেট সফল',
        message: 'কাস্টমার তথ্য সফলভাবে আপডেট করা হয়েছে।'
      });
    } catch (err) {
      console.error('Update customer error:', err);
      setBakiAlert({
        type: 'error',
        title: 'আপডেট ব্যর্থ',
        message: err.message
      });
    }
  };

  const handleDeleteCustomer = () => {
    if (!selectedCustomer || !currentUser?.uid) return;
    if (Number(selectedCustomer.totalDue || 0) > 0) {
      setBakiAlert({
        type: 'warning',
        title: 'বকেয়া বাকি রয়েছে',
        message: `এই কাস্টমারের এখনও ৳${selectedCustomer.totalDue} বকেয়া বাকি আছে! বকেয়া সম্পূর্ণ আদায় বা শূন্য না করে কাস্টমার মোছা যাবে না।`
      });
      return;
    }

    setBakiAlert({
      type: 'warning',
      title: 'কাস্টমার মুছে ফেলবেন?',
      message: `আপনি কি নিশ্চিত যে "${selectedCustomer.name}"-কে তালিকা থেকে মুছে ফেলতে চান?`,
      confirmText: 'হ্যাঁ, মুছুন',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'shopFinance', currentUser.uid, 'customers', selectedCustomer.id));
          setCustomers(prev => prev.filter(c => c.id !== selectedCustomer.id));
          setSelectedCustomer(null);
          setIsEditingCust(false);
          try { playSound?.('trash'); } catch {}
        } catch (err) {
          console.error('Delete customer error:', err);
          setBakiAlert({
            type: 'error',
            title: 'মুছতে ব্যর্থ',
            message: err.message
          });
        }
      }
    });
  };

  const handleParseNoteLine = async (line) => {
    if (!currentUser?.uid || !line) return;
    const numbers = line.match(/\d+/g);
    if (!numbers) return;
    const amount = Number(numbers[numbers.length - 1]);
    const desc = line.replace(/[0-9০-৯]/g, '').replace(/[-–—*৳/]/g, '').trim() || 'নোট খরচ';
    const isPersonal = /আব্বু|আম্মা|মা|বাজার|ব্যক্তিগত|উত্তোলন/i.test(line);

    try {
      const newTx = {
        date: selectedDate,
        description: desc,
        category: isPersonal ? 'ব্যক্তিগত / পরিবার' : 'দোকানের খরচ',
        amount,
        type: isPersonal ? 'personal_drawing' : 'shop_expense',
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'shopFinance', currentUser.uid, 'transactions'), newTx);
      setTransactions(prev => [{ id: docRef.id, ...newTx }, ...prev]);
      setAllTransactions(prev => [{ id: docRef.id, ...newTx }, ...prev]);
    } catch (e) {
      console.error('Note parse failed:', e);
    }
  };

  const applyDenomTotal = () => {
    setActualCash(denomTotal);
    setShowDenomModal(false);
    try { playSound?.('points'); } catch {}
  };

  // Quick Date Range Presets in BD Time
  const setQuickRange = (type) => {
    const todayStr = getBDDateString();
    if (type === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (type === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFromDate(getBDDateString(d));
      setToDate(todayStr);
    } else if (type === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setFromDate(getBDDateString(d));
      setToDate(todayStr);
    } else if (type === 'thisMonth') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(getBDDateString(startOfMonth));
      setToDate(todayStr);
    } else {
      setFromDate('');
      setToDate('');
    }
  };

  // Filtered & Sorted Entries
  const filteredAndSortedEntries = useMemo(() => {
    let list = [...allEntries];
    if (fromDate) list = list.filter(e => e.date >= fromDate);
    if (toDate) list = list.filter(e => e.date <= toDate);

    if (discrepancyFilter === 'mismatch') {
      list = list.filter(e => Number(e.discrepancy || 0) !== 0);
    } else if (discrepancyFilter === 'perfect') {
      list = list.filter(e => Number(e.discrepancy || 0) === 0);
    }

    list = list.map(e => {
      const sales = Number(e.totalSales || 0);
      const shopExp = Number(e.totalShopExpenses || 0);
      const drawings = Number(e.totalPersonalDrawings || 0);
      const stock = Number(e.totalStockPurchases || 0);
      return {
        ...e,
        recalculatedProfit: calculateDayProfit(sales, shopExp, drawings, stock)
      };
    });

    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'recalculatedProfit' || sortField === 'estimatedNetProfit') {
        valA = a.recalculatedProfit;
        valB = b.recalculatedProfit;
      } else if (sortField === 'date') {
        valA = new Date(a.date || 0);
        valB = new Date(b.date || 0);
      } else {
        valA = Number(valA || 0);
        valB = Number(valB || 0);
      }
      return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    return list;
  }, [allEntries, fromDate, toDate, discrepancyFilter, sortField, sortAsc, profitCalculationBasis, grossMarginPct, deductShopExpense, deductPersonalDrawings, deductStockPurchases]);

  // Filtered Transactions for Itemized view
  const filteredTransactions = useMemo(() => {
    let list = [...allTransactions];
    if (fromDate) list = list.filter(t => t.date >= fromDate);
    if (toDate) list = list.filter(t => t.date <= toDate);
    return list;
  }, [allTransactions, fromDate, toDate]);

  // Analytics Totals & Breakdown
  const analyticsTotals = useMemo(() => {
    return filteredAndSortedEntries.reduce((acc, curr) => ({
      sales: acc.sales + (Number(curr.totalSales) || 0),
      expenses: acc.expenses + (Number(curr.totalShopExpenses) || 0),
      drawings: acc.drawings + (Number(curr.totalPersonalDrawings) || 0),
      stock: acc.stock + (Number(curr.totalStockPurchases) || 0),
      profit: acc.profit + (Number(curr.recalculatedProfit) || 0)
    }), { sales: 0, expenses: 0, drawings: 0, stock: 0, profit: 0 });
  }, [filteredAndSortedEntries]);

  // Category-wise totals in the filtered range
  const categoryBreakdown = useMemo(() => {
    const res = {};
    filteredTransactions.forEach(t => {
      const cat = t.category || 'অন্যান্য';
      res[cat] = (res[cat] || 0) + Number(t.amount || 0);
    });
    return Object.entries(res).sort((a, b) => b[1] - a[1]);
  }, [filteredTransactions]);

  // Chart Data
  const chartData = useMemo(() => {
    const sortedChrono = [...filteredAndSortedEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const maxVal = Math.max(...sortedChrono.map(d => Math.max(Number(d.totalSales || 0), Number(d.recalculatedProfit || 0), Number(d.totalShopExpenses || 0))), 100);
    return {
      points: sortedChrono,
      maxVal
    };
  }, [filteredAndSortedEntries]);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Helper to get entries for requested scope
  const getScopeData = () => {
    let start = '';
    let end = '';
    const todayStr = getBDDateString();

    if (exportScope === 'single') {
      start = selectedDate;
      end = selectedDate;
    } else if (exportScope === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      start = getBDDateString(d);
      end = todayStr;
    } else if (exportScope === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      start = getBDDateString(d);
      end = todayStr;
    } else if (exportScope === 'thisMonth') {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      start = getBDDateString(startOfMonth);
      end = todayStr;
    } else if (exportScope === 'custom') {
      start = customExportFrom || '1970-01-01';
      end = customExportTo || todayStr;
    }

    let entries = allEntries.filter(e => e.date >= start && e.date <= end);
    let txs = allTransactions.filter(t => t.date >= start && t.date <= end);

    // Current unsaved state of selected date
    const currentDayEntry = {
      date: selectedDate,
      openingCash,
      cashSales,
      creditSales,
      totalSales,
      dueCollected,
      totalShopExpenses,
      totalStockPurchases,
      totalPersonalDrawings,
      expectedClosingCash,
      actualCash,
      discrepancy,
      recalculatedProfit: currentDayProfit,
      notes
    };

    if (selectedDate >= start && selectedDate <= end) {
      const idx = entries.findIndex(e => e.date === selectedDate);
      if (idx !== -1) {
        entries[idx] = { ...entries[idx], ...currentDayEntry };
      } else {
        entries.push(currentDayEntry);
        entries.sort((a, b) => b.date.localeCompare(a.date));
      }

      // Merge current unsaved transactions if selectedDate is in range
      const existingTxIds = new Set(txs.map(t => t.id));
      transactions.forEach(t => {
        if (!existingTxIds.has(t.id)) {
          txs.push(t);
        }
      });
      txs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    return { start, end, entries, txs };
  };

  const handleGenerateExport = (mode = 'whatsapp') => {
    const { start, end, entries, txs } = getScopeData();

    if (mode === 'csv') {
      // 1. Download CSV
      if (exportType === 'due') {
        let csv = 'দোকানের কাস্টমার বাকি খাতার তালিকা\n';
        csv += `তারিখ:,${getBDDateString()},মোট কাস্টমার:,${customers.length}\n\n`;
        csv += 'কাস্টমারের নাম,মোবাইল নম্বর,মোট বাকি (৳)\n';
        customers.forEach(c => {
          csv += `"${(c.name || '').replace(/"/g, '""')}","${c.phone || ''}",${c.totalDue || 0}\n`;
        });
        csv += `\nসর্বমোট বাজার বাকি,,,${totalMarketDue}\n`;
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Shop_Customer_Due_List_${getBDDateString()}.csv`;
        link.click();
        setShowExportModal(false);
        setSuccessAlert({
          title: 'CSV ডাউনলোড সম্পন্ন হয়েছে!',
          msg: 'কাস্টমারদের বাকি তালিকার এক্সেল ফাইল আপনার ডিভাইসে সেভ হয়েছে।'
        });
        return;
      }

      if (exportType === 'itemized') {
        if (txs.length === 0) return alert('এই সময়কালে কোনো খরচের লেনদেন পাওয়া যায়নি!');
        let csv = 'দোকানের খরচের বিস্তারিত অডিট রিপোর্ট\n';
        csv += `সময়কাল:,${start} হতে ${end},মোট খরচ আইটেম:,${txs.length} টি\n\n`;
        csv += 'তারিখ,বিবরণ,ক্যাটাগরি,ধরন,টাকার পরিমাণ (৳)\n';
        txs.forEach(t => {
          const typeStr = t.type === 'shop_expense' ? 'দোকান পরিচালন খরচ' : t.type === 'stock_purchase' ? 'পণ্য স্টক ক্রয়' : 'মালিকের ব্যক্তিগত উত্তোলন';
          csv += `${t.date},"${(t.description || '').replace(/"/g, '""')}","${t.category || ''}","${typeStr}",${t.amount || 0}\n`;
        });
        const totalAmt = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
        csv += `\nসর্বমোট খরচ ও উত্তোলন,,,,,${totalAmt}\n`;
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Shop_Expenses_${start}_to_${end}.csv`;
        link.click();
        setShowExportModal(false);
        setSuccessAlert({
          title: 'CSV ডাউনলোড সম্পন্ন হয়েছে!',
          msg: 'বিস্তারিত খরচের হিসাব এক্সেল ফাইল আপনার ডিভাইসে সেভ হয়েছে।'
        });
        return;
      }

      // Full daily audit CSV formatted cleanly for Excel / Mobile Sheets
      if (entries.length === 0) return alert('এই সময়কালে কোনো হিসাব পাওয়া যায়নি!');
      let csv = 'দোকানের ক্যাশ ও আর্থিক হিসাব অডিট রিপোর্ট\n';
      csv += `রিপোর্ট সময়কাল:,${start} হতে ${end},মোট দিন:,${entries.length},উৎপন্ন:,${getBDDateString()}\n`;
      csv += `লাভের হিসাব ভিত্তি:,${profitCalculationBasis === 'margin_based' ? `মার্জিন লাভ (${grossMarginPct}%)` : 'সরাসরি ক্যাশফ্লো (বিক্রয় - খরচ)'}\n\n`;
      csv += 'তারিখ,আগের ক্যাশ (৳),নগদ বিক্রয় (৳),বাকি বিক্রয় (৳),মোট বিক্রয় (৳),বাকি আদায় (৳),দোকান খরচ (৳),স্টক ক্রয় (৳),উত্তোলন (৳),মোট খরচ (৳),হিসাবকৃত লাভ (৳),শেষ ক্যাশ (৳),হাতে ক্যাশ (৳),গরমিল (৳),দৈনিক নোট\n';
      entries.forEach(e => {
        const totalOut = (Number(e.totalShopExpenses) || 0) + (Number(e.totalStockPurchases) || 0) + (Number(e.totalPersonalDrawings) || 0);
        csv += `${e.date},${e.openingCash || 0},${e.cashSales || 0},${e.creditSales || 0},${e.totalSales || 0},${e.dueCollected || 0},${e.totalShopExpenses || 0},${e.totalStockPurchases || 0},${e.totalPersonalDrawings || 0},${totalOut},${e.recalculatedProfit || e.estimatedNetProfit || 0},${e.expectedClosingCash || 0},${e.actualCash || 0},${e.discrepancy || 0},"${(e.notes || '').replace(/"/g, '""')}"\n`;
      });
      const totSales = entries.reduce((s, e) => s + (Number(e.totalSales) || 0), 0);
      const totCash = entries.reduce((s, e) => s + (Number(e.cashSales) || 0), 0);
      const totCredit = entries.reduce((s, e) => s + (Number(e.creditSales) || 0), 0);
      const totDueCol = entries.reduce((s, e) => s + (Number(e.dueCollected) || 0), 0);
      const totExp = entries.reduce((s, e) => s + (Number(e.totalShopExpenses) || 0), 0);
      const totStock = entries.reduce((s, e) => s + (Number(e.totalStockPurchases) || 0), 0);
      const totDraw = entries.reduce((s, e) => s + (Number(e.totalPersonalDrawings) || 0), 0);
      const totProfit = entries.reduce((s, e) => s + (Number(e.recalculatedProfit || e.estimatedNetProfit) || 0), 0);
      csv += `\nসর্বমোট হিসাব,,${totCash},${totCredit},${totSales},${totDueCol},${totExp},${totStock},${totDraw},${totExp + totStock + totDraw},${totProfit},,,,\n`;
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Shop_Audit_${start}_to_${end}.csv`;
      link.click();
      setShowExportModal(false);
      setSuccessAlert({
        title: 'CSV ডাউনলোড সম্পন্ন হয়েছে!',
        msg: 'দৈনিক পূর্ণাঙ্গ হিসাব অডিট ফাইল আপনার ডিভাইসে সেভ হয়েছে।'
      });
      return;
    }

    // 2. Generate WhatsApp Text
    // 2. WhatsApp Text Format with Multi-Option Section Selection
    let sections = [];

    // Section 1: Summary / Cash Register
    if (selectedReportSections.summary) {
      if (exportScope === 'single') {
        const e = entries[0] || {};
        const totalDayOut = (Number(e.totalShopExpenses) || 0) + (Number(e.totalStockPurchases) || 0) + (Number(e.totalPersonalDrawings) || 0);
        const calcProfit = profitCalculationBasis === 'margin_based'
          ? Math.round(((Number(e.totalSales) || 0) * grossMarginPct / 100) - (Number(e.totalShopExpenses) || 0))
          : ((Number(e.totalSales) || 0) - (Number(e.totalShopExpenses) || 0));

        sections.push(
          `🏪 *দোকানের দৈনিক ক্যাশ ও আর্থিক হিসাব*\n📅 তারিখ: ${e.date || selectedDate}\n━━━━━━━━━━━━━━━━━━━━\n` +
          `💰 *ক্যাশ ড্রয়ার (Cash In):*\n• আগের ক্যাশ: ৳${e.openingCash || 0}\n• নগদ বিক্রয়: ৳${e.cashSales || 0}\n• বাকি বিক্রয়: ৳${e.creditSales || 0}\n• মোট বিক্রয়: ৳${e.totalSales || 0}\n• বাকি আদায়: ৳${e.dueCollected || 0}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📉 *খরচ ও উত্তোলন (Out):*\n• পরিচালন খরচ: ৳${e.totalShopExpenses || 0}\n• স্টক ক্রয়: ৳${e.totalStockPurchases || 0}\n• মালিকের উত্তোলন: ৳${e.totalPersonalDrawings || 0}\n(মোট আউট-ফ্লো: ৳${totalDayOut})\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚖️ *সমাপনী ক্যাশ ব্যালেন্স:*\n• হিসাবকৃত ক্যাশ: ৳${e.expectedClosingCash || 0}\n• ড্রয়ারে আসল ক্যাশ: ৳${e.actualCash || 0}\n• ক্যাশ গরমিল: ৳${e.discrepancy || 0} ${Number(e.discrepancy) === 0 ? '(✓ নিখুঁত)' : Number(e.discrepancy) < 0 ? '(⚠️ ক্যাশ শর্ট)' : '(অতিরিক্ত ক্যাশ)'}\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📊 হিসাবকৃত লাভ (${profitCalculationBasis === 'margin_based' ? `মার্জিন ${grossMarginPct}%` : 'ক্যাশফ্লো'}): ৳${calcProfit}` +
          (e.notes ? `\n📝 নোট: ${e.notes}` : '')
        );
      } else {
        const totSales = entries.reduce((s, e) => s + (Number(e.totalSales) || 0), 0);
        const totCash = entries.reduce((s, e) => s + (Number(e.cashSales) || 0), 0);
        const totCredit = entries.reduce((s, e) => s + (Number(e.creditSales) || 0), 0);
        const totDueCol = entries.reduce((s, e) => s + (Number(e.dueCollected) || 0), 0);
        const totExp = entries.reduce((s, e) => s + (Number(e.totalShopExpenses) || 0), 0);
        const totStock = entries.reduce((s, e) => s + (Number(e.totalStockPurchases) || 0), 0);
        const totDraw = entries.reduce((s, e) => s + (Number(e.totalPersonalDrawings) || 0), 0);
        const totProfit = profitCalculationBasis === 'margin_based'
          ? Math.round((totSales * grossMarginPct / 100) - totExp)
          : (totSales - totExp);

        sections.push(
          `📊 *দোকানের হিসাব ও আর্থিক সারাংশ*\n📅 সময়কাল: ${start} ➔ ${end} (${entries.length} দিন)\n━━━━━━━━━━━━━━━━━━━━\n` +
          `💵 মোট বিক্রয়: ৳${totSales} (নগদ: ৳${totCash}, বাকি: ৳${totCredit})\n• বাকি আদায়: ৳${totDueCol}\n` +
          `📉 মোট ব্যয়: ৳${totExp + totStock + totDraw} (খরচ: ৳${totExp}, স্টক: ৳${totStock}, উত্তোলন: ৳${totDraw})\n` +
          `📈 হিসাবকৃত নিট লাভ: ৳${totProfit}`
        );
      }
    }

    // Section 2: Itemized Expense Breakdown
    if (selectedReportSections.expenses && txs.length > 0) {
      const totalAmt = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const itemsList = txs.slice(0, 15).map((t, i) => {
        const typeBadge = t.type === 'shop_expense' ? 'দোকান' : t.type === 'stock_purchase' ? 'স্টক' : 'উত্তোলন';
        return `${i + 1}. ${t.description || 'খরচ'}: ৳${t.amount} [${typeBadge}]`;
      }).join('\n');

      sections.push(
        `🛒 *বিস্তারিত খরচের বিবরণী (${txs.length} টি)*\n` +
        `মোট আউট-ফ্লো: ৳${totalAmt}\n` +
        `────────────────────\n` +
        `${itemsList}${txs.length > 15 ? `\n...আরও ${txs.length - 15}টি খরচ আছে` : ''}`
      );
    }

    // Section 3: Due Customers Ledger
    if (selectedReportSections.due && customers.length > 0) {
      const dueList = customers.filter(c => Number(c.totalDue) > 0);
      const topDueCusts = dueList.slice(0, 10).map((c, i) => `${i + 1}. ${c.name}: ৳${c.totalDue}`).join('\n');
      sections.push(
        `👥 *বাকি খাতা*\n` +
        `বাজারে মোট বকেয়া: ৳${totalMarketDue} (${dueList.length} জন কাস্টমার)\n` +
        (topDueCusts ? `────────────────────\nশীর্ষ বাকিদার:\n${topDueCusts}` : '')
      );
    }

    let reportText = sections.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
    if (!reportText) {
      reportText = `🏪 *দোকানের হিসাব*\nতারিখ: ${getBDDateString()}\nবাজারে মোট বাকি: ৳${totalMarketDue}`;
    }

    navigator.clipboard.writeText(reportText);
    try { playSound?.('points'); } catch {}
    setShowExportModal(false);
    setSuccessAlert({
      title: 'WhatsApp রিপোর্ট কপি হয়েছে! 🎉',
      msg: 'রিপোর্টের সারসংক্ষেপ সফলভাবে ক্লিপবোর্ডে কপি হয়েছে। এখন সরাসরি WhatsApp-এ পেস্ট করে পাঠিয়ে দিন।',
      link: `https://wa.me/?text=${encodeURIComponent(reportText)}`
    });
  };

  return (
    <div className="container-fluid px-2 px-md-3 py-2 py-md-3 position-relative pb-5 mb-4" style={{ maxWidth: '980px' }}>
      
      {/* 0-Discrepancy Celebration Overlay Banner */}
      {showCelebration && (
        <div 
          className="alert alert-success d-flex align-items-center shadow-lg border-0 rounded-4 p-3 mb-2 animate__animated animate__bounceIn"
          style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: '#fff' }}
        >
          <i className="bi bi-patch-check-fill fs-3 me-2 flex-shrink-0"></i>
          <div>
            <h6 className="fw-bold mb-0">অসাধারণ! আজকের ক্যাশ নিখুঁত মিলেছে! 🎉</h6>
            <small style={{ fontSize: '0.8rem' }}>হিসাব অনুযায়ী ক্যাশ ও হাতে গোনা ক্যাশে কোনো গরমিল নেই (৳০)।</small>
          </div>
        </div>
      )}

      {/* Top Mobile-First App Bar with Stylish Colorful Gradient Header */}
      <div 
        className="card border-0 shadow-sm rounded-4 p-3 mb-2 text-white position-relative overflow-hidden"
        style={{ 
          background: 'linear-gradient(135deg, #065f46 0%, #059669 45%, #10b981 100%)',
          boxShadow: '0 8px 24px rgba(5, 150, 105, 0.22)'
        }}
      >
        {/* Subtle decorative circles */}
        <div style={{ position: 'absolute', right: '-25px', top: '-25px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: '40px', bottom: '-35px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

        <div className="d-flex align-items-center justify-content-between gap-2 position-relative" style={{ zIndex: 1 }}>
          <div className="d-flex align-items-center gap-2">
            <button 
              className="btn btn-sm btn-white text-white border border-white border-opacity-25 rounded-circle d-flex align-items-center justify-content-center shadow-sm"
              style={{ width: '38px', height: '38px', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
              onClick={onBack}
            >
              <i className="bi bi-chevron-left fs-5"></i>
            </button>
            <div>
              <div className="d-flex align-items-center gap-2">
                <h5 className="mb-0 fw-bold tracking-tight text-white d-flex align-items-center gap-1" style={{ letterSpacing: '0.3px', textShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
                  <i className="bi bi-shop-window fs-5 text-warning"></i>
                  <span>দোকানের ক্যাশ হিসাব</span>
                </h5>
                <span className="badge rounded-pill bg-warning text-dark fw-bold px-2 py-0" style={{ fontSize: '0.65rem' }}>PRO</span>
              </div>
              <small className="text-white text-opacity-75 d-block mt-0" style={{ fontSize: '0.72rem' }}>
                <i className="bi bi-shield-check me-1"></i>স্মার্ট ক্যাশ খাতা ও লাভ-ক্ষতি ড্যাশবোর্ড
              </small>
            </div>
          </div>

          <div className="d-flex align-items-center gap-1">
            <input
              type="date"
              className="form-control form-control-sm border-0 rounded-pill px-2 py-1 text-center fw-bold text-dark shadow-sm"
              style={{ fontSize: '0.78rem', maxWidth: '130px', background: 'rgba(255,255,255,0.92)' }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button 
              className="btn btn-sm btn-warning text-dark fw-bold rounded-circle shadow d-flex align-items-center justify-content-center" 
              style={{ width: '36px', height: '36px' }}
              onClick={() => setShowExportModal(true)} 
              title="রিপোর্ট তৈরি ও শেয়ার"
            >
              <i className="bi bi-share-fill" style={{ fontSize: '0.85rem' }}></i>
            </button>
          </div>
        </div>

        {/* Touch-Friendly Glassmorphic Segmented Tabs */}
        <div 
          className="d-flex p-1 rounded-pill mt-3 gap-1 overflow-auto position-relative"
          style={{ background: 'rgba(0, 0, 0, 0.22)', backdropFilter: 'blur(8px)', zIndex: 1 }}
        >
          {[
            { id: 'register', label: 'ক্যাশ খাতা', icon: 'bi-journal-check' },
            { id: 'due_ledger', label: `বাকি (${customers.length})`, icon: 'bi-person-lines-fill' },
            { id: 'analytics', label: 'লাভ-ক্ষতি ও গ্রাফ', icon: 'bi-graph-up-arrow' },
            { id: 'reports', label: 'রিপোর্ট ও বিবরণ', icon: 'bi-table' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm flex-fill rounded-pill py-1 px-2 border-0 fw-bold transition-all text-nowrap d-flex align-items-center justify-content-center gap-1 ${
                activeTab === tab.id ? 'bg-white text-success shadow' : 'text-white text-opacity-80'
              }`}
              style={{ fontSize: '0.78rem', minHeight: '32px' }}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={tab.icon}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Shared From - To Date Filter Bar */}
      {(activeTab === 'analytics' || activeTab === 'reports') && (
        <div className="card border-0 shadow-sm p-2 rounded-4 bg-white mb-2">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div className="d-flex flex-wrap gap-1">
              <button className="btn btn-sm btn-light border py-0 px-2 small" onClick={() => setQuickRange('today')}>আজ</button>
              <button className="btn btn-sm btn-light border py-0 px-2 small" onClick={() => setQuickRange('7days')}>৭ দিন</button>
              <button className="btn btn-sm btn-light border py-0 px-2 small" onClick={() => setQuickRange('30days')}>৩০ দিন</button>
              <button className="btn btn-sm btn-light border py-0 px-2 small" onClick={() => setQuickRange('thisMonth')}>চলতি মাস</button>
              <button className="btn btn-sm btn-light border py-0 px-2 small" onClick={() => setQuickRange('all')}>সব</button>
            </div>

            {(fromDate || toDate) && (
              <span className="badge bg-success-subtle text-success py-1 px-2 rounded-pill small">
                {fromDate || 'শুরু'} ➔ {toDate || 'আজ'}
              </span>
            )}
          </div>

          <div className="d-flex align-items-center gap-2 mt-2 pt-2 border-top">
            <div className="d-flex align-items-center gap-1 flex-fill">
              <small className="text-muted" style={{ fontSize: '0.75rem' }}>হতে:</small>
              <input
                type="date"
                className="form-control form-control-sm py-0 rounded-3"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={{ fontSize: '0.78rem' }}
              />
            </div>
            <div className="d-flex align-items-center gap-1 flex-fill">
              <small className="text-muted" style={{ fontSize: '0.75rem' }}>পর্যন্ত:</small>
              <input
                type="date"
                className="form-control form-control-sm py-0 rounded-3"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={{ fontSize: '0.78rem' }}
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-success" role="status"></div>
          <div className="text-muted small mt-2">তথ্য লোড হচ্ছে...</div>
        </div>
      ) : activeTab === 'register' ? (
        <div className="row g-2">
          
          {/* Mobile Optimized 2x2 Metric Grid */}
          <div className="col-12">
            <div className="row g-2">
              <div className="col-6 col-sm-3">
                <div className="card border-0 shadow-sm p-2 rounded-4 bg-white h-100">
                  <span className="text-muted small fw-semibold" style={{ fontSize: '0.75rem' }}>মোট বিক্রয়</span>
                  <div className="fs-5 fw-bold text-primary">৳{totalSales}</div>
                  <div className="d-flex justify-content-between text-muted" style={{ fontSize: '0.68rem' }}>
                    <span>নগদ: ৳{cashSales}</span>
                    <span>বাকি: ৳{creditSales}</span>
                  </div>
                </div>
              </div>

              <div className="col-6 col-sm-3">
                <div className="card border-0 shadow-sm p-2 rounded-4 bg-white h-100">
                  <span className="text-muted small fw-semibold" style={{ fontSize: '0.75rem' }}>হিসাবকৃত লাভ</span>
                  <div className={`fs-5 fw-bold ${currentDayProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                    ৳{currentDayProfit}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                    {profitCalculationBasis === 'margin_based' ? `${grossMarginPct}% মার্জিনে` : 'মোট বিক্রয় - খরচ'}
                  </div>
                </div>
              </div>

              <div className="col-6 col-sm-3">
                <div className="card border-0 shadow-sm p-2 rounded-4 bg-white h-100">
                  <span className="text-muted small fw-semibold" style={{ fontSize: '0.75rem' }}>দোকান খরচ ও উত্তোলন</span>
                  <div className="fs-5 fw-bold text-danger">৳{totalShopExpenses + totalPersonalDrawings}</div>
                  <div className="d-flex justify-content-between text-muted" style={{ fontSize: '0.68rem' }}>
                    <span>দোকান: ৳{totalShopExpenses}</span>
                    <span>উত্তোলন: ৳{totalPersonalDrawings}</span>
                  </div>
                </div>
              </div>

              <div className="col-6 col-sm-3">
                <div className={`card border-0 shadow-sm p-2 rounded-4 h-100 ${discrepancy === 0 ? 'bg-success bg-opacity-10 text-success' : 'bg-danger bg-opacity-10 text-danger'}`}>
                  <span className="small fw-semibold" style={{ fontSize: '0.75rem' }}>ক্যাশ গরমিল</span>
                  <div className="fs-5 fw-bold">
                    {discrepancy > 0 ? `+৳${discrepancy}` : `৳${discrepancy}`}
                  </div>
                  <div style={{ fontSize: '0.68rem' }}>
                    {discrepancy === 0 ? '✓ নিখুঁত মিলেছে' : discrepancy < 0 ? '⚠️ ক্যাশ শর্ট' : 'অতিরিক্ত ক্যাশ'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Step-by-Step Cash Drawer Closing Wizard (Animated & Integrated) */}
          <div className="col-12">
            {wizardStep === 0 ? (
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white mb-2 border-start border-4 border-success">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div>
                    <h6 className="fw-bolder text-dark mb-1 d-flex align-items-center gap-1.5" style={{ fontSize: '0.95rem' }}>
                      <i className="bi bi-stars text-warning fs-5"></i> ক্যাশ ড্রয়ার হিসাব শুরু করতে চান?
                    </h6>
                    <span className="text-secondary fw-semibold d-block" style={{ fontSize: '0.8rem' }}>
                      সহজ ৪টি ধাপে সেলস, খরচ ও ড্রয়ার ক্যাশ এক জায়গায় মিলিয়ে সংরক্ষণ করুন।
                    </span>
                  </div>
                  <div className="d-flex align-items-center gap-2 flex-shrink-0">
                    <button 
                      type="button" 
                      className="btn btn-success rounded-pill px-3 py-1.5 fw-bold shadow-sm hover-scale text-white"
                      style={{ fontSize: '0.85rem' }}
                      onClick={() => setWizardStep(1)}
                    >
                      🚀 হিসাব শুরু
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1 fw-medium"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => setShowClassicForm(!showClassicForm)}
                      title="সরাসরি ফর্ম দেখুন"
                    >
                      {showClassicForm ? 'ফর্ম লুকান' : 'ফর্ম দেখুন'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card border-0 shadow-sm rounded-4 p-3 bg-white mb-3 border-start border-4 border-success animate-slide-up" style={{ animationDuration: '0.25s' }}>
                {/* Wizard Header & Progress */}
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-success rounded-pill px-2.5 py-1 fw-bold">ধাপ {wizardStep}/৪</span>
                    <strong className="text-dark small">
                      {wizardStep === 1 && '১. প্রারম্ভিক ক্যাশ ও বিক্রয় এন্ট্রি'}
                      {wizardStep === 2 && '২. খরচ ও উত্তোলন যোগ করুন'}
                      {wizardStep === 3 && '৩. ড্রয়ারের আসল ক্যাশ গণনা'}
                      {wizardStep === 4 && '৪. ক্যাশ গরমিল অডিট ও সংরক্ষণ'}
                    </strong>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-sm btn-link text-muted p-0 text-decoration-none"
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => setWizardStep(0)}
                  >
                    বন্ধ করুন ✕
                  </button>
                </div>

                {/* Progress bar */}
                <div className="progress rounded-pill mb-3" style={{ height: '6px' }}>
                  <div 
                    className="progress-bar bg-success progress-bar-striped progress-bar-animated" 
                    style={{ width: `${(wizardStep / 4) * 100}%` }}
                  ></div>
                </div>

                {/* Wizard Step 1: Opening & Sales */}
                {wizardStep === 1 && (
                  <div className="animate-fade-in">
                    <p className="text-dark fw-semibold small mb-2" style={{ fontSize: '0.78rem' }}>
                      সকালের আগের ক্যাশ (Opening) এবং আজকের মোট নগদ ও বাকি বিক্রয়ের পরিমাণ লিখুন:
                    </p>
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '0.74rem' }}>সকালের আগের ক্যাশ</label>
                        <input
                          type="number"
                          className="form-control form-control-sm rounded-3 py-1 fw-bold text-dark border-secondary-subtle"
                          value={openingCash}
                          onChange={(e) => setOpeningCash(e.target.value)}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '0.74rem' }}>নগদ বিক্রয় (Cash)</label>
                        <input
                          type="number"
                          className="form-control form-control-sm rounded-3 py-1 fw-bold text-success border-success-subtle"
                          value={cashSales}
                          onChange={(e) => setCashSales(e.target.value)}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '0.74rem' }}>বাকি বিক্রয় (Credit)</label>
                        <input
                          type="number"
                          className="form-control form-control-sm rounded-3 py-1 fw-bold text-danger border-danger-subtle"
                          value={creditSales}
                          onChange={(e) => setCreditSales(e.target.value)}
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label text-dark fw-bold small mb-1" style={{ fontSize: '0.74rem' }}>আজকের বাকি আদায়</label>
                        <input
                          type="number"
                          className="form-control form-control-sm rounded-3 py-1 fw-bold text-primary border-primary-subtle"
                          value={dueCollected}
                          onChange={(e) => setDueCollected(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="d-flex justify-content-end">
                      <button 
                        type="button" 
                        className="btn btn-sm btn-success rounded-pill px-4 py-1.5 fw-bold shadow-xs"
                        onClick={() => setWizardStep(2)}
                      >
                        পরবর্তী ধাপ: খরচ ও উত্তোলন ➔
                      </button>
                    </div>
                  </div>
                )}

                {/* Wizard Step 2: Integrated Expense Logger directly inside the wizard */}
                {wizardStep === 2 && (
                  <div className="animate-fade-in">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <p className="text-dark fw-semibold small mb-0" style={{ fontSize: '0.78rem' }}>
                        আজকের খরচগুলো এখান থেকেই যোগ করুন:
                      </p>
                      <div className="d-flex gap-1" style={{ fontSize: '0.7rem' }}>
                        <span className="badge bg-danger text-white rounded-pill px-2 py-1 fw-bold">দোকান: ৳{totalShopExpenses || 0}</span>
                        <span className="badge bg-primary text-white rounded-pill px-2 py-1 fw-bold">স্টক: ৳{totalStockPurchases || 0}</span>
                        <span className="badge bg-warning text-dark rounded-pill px-2 py-1 fw-bold">উত্তোলন: ৳{totalPersonalDrawings || 0}</span>
                      </div>
                    </div>

                    {/* Mode Selector */}
                    <div className="d-flex p-1 bg-light rounded-pill mb-2 gap-1 border">
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${txType === 'shop_expense' ? 'bg-danger text-white shadow-xs' : 'text-dark'}`}
                        style={{ fontSize: '0.74rem' }}
                        onClick={() => { setTxType('shop_expense'); setTxCategory('দোকানের খরচ'); }}
                      >
                        দোকান খরচ
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${txType === 'stock_purchase' ? 'bg-primary text-white shadow-xs' : 'text-dark'}`}
                        style={{ fontSize: '0.74rem' }}
                        onClick={() => { setTxType('stock_purchase'); setTxCategory('পণ্য ক্রয় / স্টক'); }}
                      >
                        স্টক ক্রয়
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${txType === 'personal_drawing' ? 'bg-warning text-dark shadow-xs' : 'text-dark'}`}
                        style={{ fontSize: '0.74rem' }}
                        onClick={() => { setTxType('personal_drawing'); setTxCategory('ব্যক্তিগত / পরিবার'); }}
                      >
                        ব্যক্তিগত উত্তোলন
                      </button>
                    </div>

                    {/* Quick Preset Chips */}
                    <div className="d-flex gap-1 overflow-auto pb-1 mb-2 scrollbar-none" style={{ whiteSpace: 'nowrap' }}>
                      {(txType === 'personal_drawing' ? [
                        { label: 'বাজার খরচ', cat: 'ব্যক্তিগত / পরিবার' },
                        { label: 'আম্মা/আব্বু', cat: 'ব্যক্তিগত / পরিবার' },
                        { label: 'ব্যক্তিগত খরচ', cat: 'ব্যক্তিগত / পরিবার' }
                      ] : txType === 'stock_purchase' ? [
                        { label: 'সিগারেট স্টক', cat: 'পণ্য ক্রয় / স্টক' },
                        { label: 'কোল্ড ড্রিংকস', cat: 'পণ্য ক্রয় / স্টক' },
                        { label: 'বিস্কুট ও চিপস', cat: 'পণ্য ক্রয় / স্টক' }
                      ] : [
                        { label: 'চা ও নাস্তা', cat: 'চা ও আপ্যায়ন' },
                        { label: 'কলা ও পাউরুটি', cat: 'চা ও আপ্যায়ন' },
                        { label: 'পলিথিন ব্যাগ', cat: 'দোকানের খরচ' },
                        { label: 'যাতায়াত', cat: 'পরিবহন / যাতায়াত' }
                      ]).map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="btn btn-xs btn-white bg-white border rounded-pill px-2.5 py-1 text-dark fw-bold shadow-2xs"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => {
                            setTxDesc(chip.label);
                            setTxCategory(chip.cat);
                          }}
                        >
                          + {chip.label}
                        </button>
                      ))}
                    </div>

                    {/* Mini Inline Form */}
                    <form onSubmit={handleAddTransaction} className="p-2 bg-light rounded-3 mb-2 border">
                      <div className="row g-1">
                        <div className="col-5">
                          <input
                            type="text"
                            className="form-control form-control-sm rounded-3 py-1 text-dark fw-semibold"
                            placeholder="বিবরণ"
                            value={txDesc}
                            onChange={(e) => setTxDesc(e.target.value)}
                          />
                        </div>
                        <div className="col-4">
                          <input
                            type="number"
                            required
                            className="form-control form-control-sm rounded-3 py-1 fw-bold text-end text-dark"
                            placeholder="৳ টাকা"
                            value={txAmount}
                            onChange={(e) => setTxAmount(e.target.value)}
                          />
                        </div>
                        <div className="col-3">
                          <button type="submit" className="btn btn-sm btn-dark w-100 rounded-3 py-1 fw-bold text-white shadow-xs">
                            + যোগ
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Today's Transactions Quick Ledger */}
                    <div className="overflow-auto mb-3" style={{ maxHeight: '110px' }}>
                      {transactions.length === 0 ? (
                        <div className="text-secondary small text-center py-2 fw-semibold">আজকের কোনো খরচ নেই</div>
                      ) : (
                        <div className="d-flex flex-column gap-1">
                          {transactions.map(tx => (
                            <div key={tx.id} className="p-1.5 px-2 rounded-2 bg-light d-flex justify-content-between align-items-center border" style={{ fontSize: '0.75rem' }}>
                              <span>
                                <span className={`badge me-1 ${tx.type === 'shop_expense' ? 'bg-danger text-white' : tx.type === 'stock_purchase' ? 'bg-primary text-white' : 'bg-warning text-dark'}`} style={{ fontSize: '0.62rem' }}>
                                  {tx.type === 'shop_expense' ? 'দোকান' : tx.type === 'stock_purchase' ? 'স্টক' : 'উত্তোলন'}
                                </span>
                                <strong className="text-dark">{tx.description}</strong>
                              </span>
                              <div className="d-flex align-items-center gap-1.5">
                                <span className="fw-bold text-danger">-৳{tx.amount}</span>
                                <button type="button" className="btn btn-link text-danger p-0 border-0" onClick={() => handleDeleteTransaction(tx.id)}>
                                  <i className="bi bi-x-circle-fill"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="d-flex justify-content-between">
                      <button 
                        type="button" 
                        className="btn btn-sm btn-light border rounded-pill px-3 py-1 text-dark fw-bold"
                        onClick={() => setWizardStep(1)}
                      >
                        ← পেছনে যান
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-sm btn-success rounded-pill px-4 py-1.5 fw-bold shadow-xs"
                        onClick={() => setWizardStep(3)}
                      >
                        পরবর্তী ধাপ: ক্যাশ গণনা ➔
                      </button>
                    </div>
                  </div>
                )}

                {/* Wizard Step 3: Actual Cash Drawer Count */}
                {wizardStep === 3 && (
                  <div className="animate-fade-in">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <p className="text-dark fw-semibold small mb-0" style={{ fontSize: '0.78rem' }}>
                        দিন শেষে ক্যাশ ড্রয়ারে গুনে মোট কত টাকা পেলেন?
                      </p>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline-success rounded-pill px-2.5 py-1 fw-bold"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => setShowDenomModal(true)}
                      >
                        <i className="bi bi-calculator me-1"></i>নোট কাউন্টার
                      </button>
                    </div>
                    <div className="p-3 bg-light rounded-4 text-center mb-3 border">
                      <label className="text-dark fw-bold small d-block mb-1">ড্রয়ারে হাতে গোনা আসল ক্যাশ (৳)</label>
                      <input
                        type="number"
                        className="form-control form-control-lg rounded-pill text-center fw-bold text-success border-2 shadow-xs bg-white"
                        style={{ fontSize: '1.4rem' }}
                        placeholder="৳ ০"
                        value={actualCash}
                        onChange={(e) => setActualCash(e.target.value)}
                        autoFocus
                      />
                      <div className="mt-1 d-block text-dark small" style={{ fontSize: '0.74rem' }}>
                        হিসাব অনুযায়ী থাকার কথা: <strong className="text-primary fs-6">৳{expectedClosingCash}</strong>
                      </div>
                    </div>
                    <div className="d-flex justify-content-between">
                      <button 
                        type="button" 
                        className="btn btn-sm btn-light border rounded-pill px-3 py-1 text-dark fw-bold"
                        onClick={() => setWizardStep(2)}
                      >
                        ← পেছনে যান
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-sm btn-success rounded-pill px-4 py-1.5 fw-bold shadow-xs"
                        onClick={() => setWizardStep(4)}
                      >
                        ফলাফল ও গরমিল দেখুন ➔
                      </button>
                    </div>
                  </div>
                )}

                {/* Wizard Step 4: Summary, Discrepancy & Final Save */}
                {wizardStep === 4 && (
                  <div className="animate-fade-in">
                    <div className={`p-3 rounded-4 text-center mb-3 border shadow-2xs ${discrepancy === 0 ? 'bg-success-subtle border-success' : discrepancy < 0 ? 'bg-danger-subtle border-danger' : 'bg-primary-subtle border-primary'}`}>
                      <div className="small fw-bold mb-1 text-dark">
                        {discrepancy === 0 ? '🎉 আলহামদুলিল্লাহ! ক্যাশ ড্রয়ার নিখুঁত মিলেছে!' : discrepancy < 0 ? '⚠️ সতর্কবার্তা: ক্যাশ ড্রয়ারে টাকা শর্ট রয়েছে!' : 'ℹ️ ড্রয়ারে অতিরিক্ত ক্যাশ রয়েছে!'}
                      </div>
                      <div className={`fs-3 fw-bold my-1 ${discrepancy === 0 ? 'text-success' : discrepancy < 0 ? 'text-danger' : 'text-primary'}`}>
                        গরমিল: {discrepancy > 0 ? `+৳${discrepancy}` : `৳${discrepancy}`}
                      </div>
                      <div className="text-dark fw-semibold small" style={{ fontSize: '0.75rem' }}>
                        হিসাবকৃত ক্যাশ: <strong className="text-dark">৳{expectedClosingCash}</strong> | ড্রয়ারে আসল ক্যাশ: <strong className="text-success">৳{actualCash}</strong> | নিট লাভ: <strong className="text-primary">৳{currentDayProfit}</strong>
                      </div>
                    </div>

                    <div className="d-flex justify-content-between align-items-center">
                      <button 
                        type="button" 
                        className="btn btn-sm btn-light border rounded-pill px-3 py-1 text-dark fw-bold"
                        onClick={() => setWizardStep(3)}
                      >
                        ← আবার গণনা
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-sm btn-dark rounded-pill px-4 py-2 fw-bold shadow-sm d-flex align-items-center gap-1.5 text-white"
                        onClick={(e) => {
                          handleSaveDailyEntry(e);
                          setWizardStep(0);
                        }}
                      >
                        <i className="bi bi-cloud-check-fill text-success"></i> আজকের হিসাব সংরক্ষণ করুন
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Classic Manual Form Section (Only shown if toggled) */}
          {showClassicForm && (
            <>
              {/* Daily Cash Entry Section */}
              <div className="col-12 col-md-6 animate-fade-in">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white h-100">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="fw-bold mb-0 text-dark small d-flex align-items-center gap-1">
                  <i className="bi bi-wallet2 text-success"></i> ক্যাশ ড্রয়ার হিসাব
                </h6>
                <button 
                  type="button" 
                  className="btn btn-sm btn-outline-success rounded-pill px-2 py-0"
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => setShowDenomModal(true)}
                >
                  <i className="bi bi-calculator me-1"></i>নোট গণনা
                </button>
              </div>

              <div className="row g-2 mb-2">
                <div className="col-6">
                  <label className="form-label text-muted mb-0" style={{ fontSize: '0.72rem' }}>আগের ক্যাশ (Opening)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm rounded-3 py-1"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label text-muted mb-0" style={{ fontSize: '0.72rem' }}>নগদ বিক্রয় (Cash Sales)</label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      className="form-control rounded-start-3 py-1"
                      value={cashSales}
                      onChange={(e) => setCashSales(e.target.value)}
                    />
                    <button 
                      className="btn btn-light border dropdown-toggle py-0 px-2" 
                      type="button" 
                      data-bs-toggle="dropdown"
                    >+</button>
                    <ul className="dropdown-menu dropdown-menu-end shadow-sm">
                      {[50, 100, 200, 500, 1000].map(amt => (
                        <li key={amt}>
                          <button 
                            className="dropdown-item small" 
                            type="button"
                            onClick={() => setCashSales(prev => Number(prev || 0) + amt)}
                          >
                            +৳{amt} যোগ
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="col-6">
                  <label className="form-label text-muted mb-0" style={{ fontSize: '0.72rem' }}>বাকি বিক্রয় (Credit Sales)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm rounded-3 py-1"
                    value={creditSales}
                    onChange={(e) => setCreditSales(e.target.value)}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label text-muted mb-0" style={{ fontSize: '0.72rem' }}>বাকি আদায় (Due Collected)</label>
                  <input
                    type="number"
                    className="form-control form-control-sm rounded-3 py-1"
                    value={dueCollected}
                    onChange={(e) => setDueCollected(e.target.value)}
                  />
                </div>
              </div>

              {/* End of day cash count strip */}
              <div className="p-2 rounded-3 bg-light mb-2">
                <div className="d-flex justify-content-between text-muted" style={{ fontSize: '0.78rem' }}>
                  <span>হিসাব অনুযায়ী ড্রয়ারে থাকা উচিত:</span>
                  <span className="fw-bold text-dark">৳{expectedClosingCash}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center mt-1">
                  <span className="fw-bold text-dark" style={{ fontSize: '0.8rem' }}>হাতে গোনা ক্যাশ:</span>
                  <div className="input-group input-group-sm" style={{ maxWidth: '135px' }}>
                    <input
                      type="number"
                      className="form-control form-control-sm text-end fw-bold text-success rounded-start-3"
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                    />
                    <button 
                      className="btn btn-outline-secondary py-0 px-2" 
                      type="button" 
                      onClick={() => setShowDenomModal(true)}
                    >
                      <i className="bi bi-123"></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* Sticky Note Pad */}
              <div>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label className="form-label text-muted mb-0" style={{ fontSize: '0.72rem' }}>দৈনিক নোট (Rough Pad)</label>
                  {notes && (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none text-success fw-bold"
                      style={{ fontSize: '0.72rem' }}
                      onClick={() => {
                        const lines = notes.split('\n').filter(l => l.trim() && /\d+/.test(l));
                        lines.forEach(handleParseNoteLine);
                        alert(`${lines.length}টি নোট খরচে যোগ হয়েছে!`);
                      }}
                    >
                      খরচ বানাও ⚡
                    </button>
                  )}
                </div>
                <textarea
                  rows="2"
                  className="form-control form-control-sm rounded-3"
                  placeholder="যেমন: আব্বু নিছে ২০০, কলা পাউরুটি ১৫০..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ fontSize: '0.8rem' }}
                />
              </div>
            </div>
          </div>

          {/* Quick Expense Logger (Modernized Mobile & Desktop UI) */}
          <div className="col-12 col-md-6">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white h-100">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="fw-bold text-dark small mb-0 d-flex align-items-center gap-1.5">
                  <i className="bi bi-wallet2 text-danger"></i> খরচ ও উত্তোলন
                </h6>
                <div className="d-flex gap-1" style={{ fontSize: '0.7rem' }}>
                  <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill">
                    দোকান: ৳{totalShopExpenses || 0}
                  </span>
                  <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill">
                    স্টক: ৳{totalStockPurchases || 0}
                  </span>
                  <span className="badge bg-warning-subtle text-dark border border-warning-subtle rounded-pill">
                    উত্তোলন: ৳{totalPersonalDrawings || 0}
                  </span>
                </div>
              </div>

              {/* Fast Visual Mode Selector */}
              <div className="d-flex p-1 bg-light rounded-pill mb-2 gap-1 border">
                <button
                  type="button"
                  className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold transition-all d-flex align-items-center justify-content-center gap-1 ${txType === 'shop_expense' ? 'bg-danger text-white shadow-sm' : 'text-muted'}`}
                  style={{ fontSize: '0.74rem' }}
                  onClick={() => { setTxType('shop_expense'); setTxCategory('দোকানের খরচ'); }}
                >
                  <i className="bi bi-shop"></i> দোকান খরচ
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold transition-all d-flex align-items-center justify-content-center gap-1 ${txType === 'stock_purchase' ? 'bg-primary text-white shadow-sm' : 'text-muted'}`}
                  style={{ fontSize: '0.74rem' }}
                  onClick={() => { setTxType('stock_purchase'); setTxCategory('পণ্য ক্রয় / স্টক'); }}
                >
                  <i className="bi bi-box-seam"></i> স্টক ক্রয়
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold transition-all d-flex align-items-center justify-content-center gap-1 ${txType === 'personal_drawing' ? 'bg-warning text-dark shadow-sm' : 'text-muted'}`}
                  style={{ fontSize: '0.74rem' }}
                  onClick={() => { setTxType('personal_drawing'); setTxCategory('ব্যক্তিগত / পরিবার'); }}
                >
                  <i className="bi bi-person-circle"></i> উত্তোলন
                </button>
              </div>

              {/* Quick Preset Expense Chips */}
              <div className="d-flex gap-1 overflow-auto pb-1 mb-2 scrollbar-none" style={{ whiteSpace: 'nowrap' }}>
                {(txType === 'personal_drawing' ? [
                  { label: 'বাজার খরচ', cat: 'ব্যক্তিগত / পরিবার' },
                  { label: 'আম্মা/আব্বু', cat: 'ব্যক্তিগত / পরিবার' },
                  { label: 'ব্যক্তিগত খরচ', cat: 'ব্যক্তিগত / পরিবার' },
                  { label: 'বাচ্চাদের খরচ', cat: 'ব্যক্তিগত / পরিবার' }
                ] : txType === 'stock_purchase' ? [
                  { label: 'সিগারেট স্টক', cat: 'পণ্য ক্রয় / স্টক' },
                  { label: 'কোল্ড ড্রিংকস', cat: 'পণ্য ক্রয় / স্টক' },
                  { label: 'বিস্কুট ও চিপস', cat: 'পণ্য ক্রয় / স্টক' },
                  { label: 'বেকারি পণ্য', cat: 'পণ্য ক্রয় / স্টক' }
                ] : [
                  { label: 'চা ও নাস্তা', cat: 'চা ও আপ্যায়ন' },
                  { label: 'কলা ও পাউরুটি', cat: 'চা ও আপ্যায়ন' },
                  { label: 'পলিথিন ব্যাগ', cat: 'দোকানের খরচ' },
                  { label: 'যাতায়াত ভাড়া', cat: 'পরিবহন / যাতায়াত' },
                  { label: 'কারেন্ট বিল', cat: 'দোকানের খরচ' }
                ]).map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn btn-xs btn-light border rounded-pill px-2.5 py-1 text-secondary fw-semibold transition-all hover-scale"
                    style={{ fontSize: '0.7rem' }}
                    onClick={() => {
                      setTxDesc(chip.label);
                      setTxCategory(chip.cat);
                    }}
                  >
                    + {chip.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAddTransaction} className="p-2.5 bg-light rounded-4 mb-2 border">
                <div className="row g-1.5 align-items-center">
                  <div className="col-7">
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-3 py-1 bg-white"
                      placeholder="বিবরণ (e.g. কলা রুটি / বাজার)"
                      value={txDesc}
                      onChange={(e) => setTxDesc(e.target.value)}
                      style={{ fontSize: '0.82rem' }}
                    />
                  </div>
                  <div className="col-5">
                    <input
                      type="number"
                      required
                      className="form-control form-control-sm rounded-3 py-1 fw-bold text-end bg-white"
                      placeholder="৳ ০"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      style={{ fontSize: '0.85rem' }}
                    />
                  </div>

                  {/* Quick Amount Badges */}
                  <div className="col-12 d-flex gap-1 flex-wrap my-1">
                    {[20, 50, 100, 200, 500, 1000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        className="btn btn-xs btn-white bg-white border rounded-pill px-2 py-0 text-muted fw-bold"
                        style={{ fontSize: '0.68rem' }}
                        onClick={() => setTxAmount(String((Number(txAmount) || 0) + amt))}
                      >
                        +৳{amt}
                      </button>
                    ))}
                    {txAmount && (
                      <button
                        type="button"
                        className="btn btn-xs btn-link text-danger p-0 ms-auto text-decoration-none"
                        style={{ fontSize: '0.68rem' }}
                        onClick={() => setTxAmount('')}
                      >
                        মুছুন
                      </button>
                    )}
                  </div>

                  <div className="col-7">
                    <select
                      className="form-select form-select-sm rounded-3 py-1 bg-white"
                      value={txCategory}
                      onChange={(e) => setTxCategory(e.target.value)}
                      style={{ fontSize: '0.78rem' }}
                    >
                      {categories.map((cat, idx) => (
                        <option key={idx} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-5">
                    <button type="submit" className={`btn btn-sm w-100 rounded-3 py-1 fw-bold shadow-xs text-white ${txType === 'shop_expense' ? 'btn-danger' : txType === 'stock_purchase' ? 'btn-primary' : 'btn-dark'}`} style={{ fontSize: '0.8rem' }}>
                      <i className="bi bi-check2 me-1"></i>যোগ করুন
                    </button>
                  </div>
                </div>
              </form>

              {/* Transactions List with Timeline Cards */}
              <div className="flex-grow-1 overflow-auto px-1" style={{ maxHeight: '185px' }}>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="text-muted fw-bold" style={{ fontSize: '0.7rem' }}>
                    আজকের লেনদেন তালিকা ({transactions.length})
                  </span>
                  {transactions.length > 0 && (
                    <span className="text-muted" style={{ fontSize: '0.68rem' }}>
                      মোট: ৳{transactions.reduce((s, t) => s + (Number(t.amount) || 0), 0)}
                    </span>
                  )}
                </div>
                {transactions.length === 0 ? (
                  <div className="text-center text-muted small py-3" style={{ fontSize: '0.75rem' }}>
                    <i className="bi bi-inbox d-block fs-3 opacity-25 mb-1"></i>
                    আজকে কোনো খরচ বা উত্তোলন যোগ করা হয়নি
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-1.5">
                    {transactions.map((tx) => {
                      const isShop = tx.type === 'shop_expense';
                      const isStock = tx.type === 'stock_purchase';
                      return (
                        <div 
                          key={tx.id} 
                          className="p-2 rounded-3 bg-light d-flex justify-content-between align-items-center border-start border-3 transition-all"
                          style={{ borderColor: isShop ? '#dc3545' : isStock ? '#0d6efd' : '#ffc107', minHeight: '40px' }}
                        >
                          <div className="text-truncate me-2" style={{ maxWidth: '75%' }}>
                            <div className="d-flex align-items-center gap-1">
                              <span className={`badge rounded-pill ${
                                isShop ? 'bg-danger text-white' : 
                                isStock ? 'bg-primary text-white' : 
                                'bg-warning text-dark'
                              }`} style={{ fontSize: '0.62rem' }}>
                                {isShop ? 'দোকান' : isStock ? 'স্টক' : 'উত্তোলন'}
                              </span>
                              <span className="small fw-bold text-dark text-truncate">{tx.description}</span>
                            </div>
                            <small className="text-muted ms-1" style={{ fontSize: '0.68rem' }}>{tx.category}</small>
                          </div>
                          <div className="d-flex align-items-center gap-2 flex-shrink-0">
                            <span className="fw-bold small text-danger">
                              -৳{tx.amount}
                            </span>
                            <button
                              type="button"
                              className="btn btn-sm btn-white bg-white border-0 text-muted p-1 rounded-circle d-flex align-items-center justify-content-center hover-text-danger"
                              style={{ width: '26px', height: '26px' }}
                              onClick={() => handleDeleteTransaction(tx.id)}
                              title="মুছুন"
                            >
                              <i className="bi bi-trash3 text-danger" style={{ fontSize: '0.78rem' }}></i>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      ) : activeTab === 'due_ledger' ? (
        /* Customer Due Ledger */
        <div className="row g-2">
          {/* Top Summary Header Banner */}
          <div className="col-12">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white">
              <div className="row g-2 text-center">
                <div className="col-4 border-end">
                  <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>মোট বকেয়া বাকি</small>
                  <span className="fs-5 fw-bold text-danger">৳{totalMarketDue}</span>
                </div>
                <div className="col-4 border-end">
                  <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>বাকিদার কাস্টমার</small>
                  <span className="fs-5 fw-bold text-dark">
                    {customers.filter(c => Number(c.totalDue) > 0).length} <span className="small fw-normal text-muted" style={{ fontSize: '0.7rem' }}>জন</span>
                  </span>
                </div>
                <div className="col-4">
                  <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>আজকের আদায়</small>
                  <span className="fs-5 fw-bold text-success">৳{dueCollected || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-5">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white">
              {/* Add Customer Form */}
              <form onSubmit={handleAddCustomer} className="mb-2">
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    required
                    className="form-control rounded-start-3"
                    placeholder="নতুন কাস্টমার নাম"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                  />
                  <input
                    type="tel"
                    className="form-control"
                    placeholder="মোবাইল"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                  />
                  <button className="btn btn-dark rounded-end-3 px-3 fw-bold" type="submit">
                    + যোগ
                  </button>
                </div>
              </form>

              {/* Live Search & Filter Bar */}
              <div className="mb-2">
                <div className="position-relative mb-2">
                  <i className="bi bi-search position-absolute text-muted" style={{ left: '10px', top: '7px', fontSize: '0.75rem' }}></i>
                  <input
                    type="text"
                    className="form-control form-control-sm rounded-pill ps-4 py-1"
                    placeholder="নাম বা মোবাইল দিয়ে খুঁজুন..."
                    value={custSearchQuery}
                    onChange={(e) => setCustSearchQuery(e.target.value)}
                    style={{ fontSize: '0.78rem' }}
                  />
                  {custSearchQuery && (
                    <button 
                      type="button" 
                      className="btn btn-sm btn-link text-muted position-absolute end-0 top-0 text-decoration-none py-1 pe-2"
                      onClick={() => setCustSearchQuery('')}
                    >
                      <i className="bi bi-x"></i>
                    </button>
                  )}
                </div>

                <div className="d-flex p-1 bg-light rounded-pill gap-1">
                  <button
                    type="button"
                    className={`btn btn-sm flex-fill rounded-pill py-0 border-0 fw-bold ${custFilterTab === 'all' ? 'bg-white text-dark shadow-sm' : 'text-muted'}`}
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => setCustFilterTab('all')}
                  >
                    সব ({customers.length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm flex-fill rounded-pill py-0 border-0 fw-bold ${custFilterTab === 'due' ? 'bg-danger text-white shadow-sm' : 'text-muted'}`}
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => setCustFilterTab('due')}
                  >
                    বাকি আছে ({customers.filter(c => Number(c.totalDue) > 0).length})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm flex-fill rounded-pill py-0 border-0 fw-bold ${custFilterTab === 'clear' ? 'bg-success text-white shadow-sm' : 'text-muted'}`}
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => setCustFilterTab('clear')}
                  >
                    পরিশোধিত ({customers.filter(c => Number(c.totalDue) <= 0).length})
                  </button>
                </div>
              </div>

              {/* Filtered Customer List */}
              <div className="overflow-auto" style={{ maxHeight: '340px' }}>
                {(() => {
                  const query = custSearchQuery.trim().toLowerCase();
                  const filtered = customers.filter(c => {
                    const matchesQuery = !query || 
                      (c.name && c.name.toLowerCase().includes(query)) || 
                      (c.phone && c.phone.includes(query));
                    if (!matchesQuery) return false;
                    const due = Number(c.totalDue) || 0;
                    if (custFilterTab === 'due') return due > 0;
                    if (custFilterTab === 'clear') return due <= 0;
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="text-muted small text-center py-4">
                        <i className="bi bi-people d-block fs-3 opacity-50 mb-1"></i>
                        কোনো কাস্টমার পাওয়া যায়নি
                      </div>
                    );
                  }

                  return (
                    <div className="list-group list-group-flush gap-1">
                      {filtered.map((c) => {
                        const isSelected = selectedCustomer?.id === c.id;
                        const due = Number(c.totalDue) || 0;
                        const firstChar = (c.name || 'ক').trim().charAt(0);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center rounded-3 border-0 p-2 transition-all ${
                              isSelected ? 'bg-dark text-white shadow-sm' : 'bg-light text-dark'
                            }`}
                          >
                            <div className="d-flex align-items-center gap-2 text-start text-truncate">
                              <div 
                                className={`rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0 ${
                                  isSelected ? 'bg-white text-dark' : due > 0 ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'
                                }`}
                                style={{ width: '32px', height: '32px', fontSize: '0.85rem' }}
                              >
                                {firstChar}
                              </div>
                              <div className="text-truncate">
                                <div className="fw-bold small text-truncate" style={{ maxWidth: '140px' }}>{c.name}</div>
                                <div className="small opacity-75" style={{ fontSize: '0.7rem' }}>
                                  {c.phone ? c.phone : 'মোবাইল নেই'}
                                </div>
                              </div>
                            </div>
                            <span className={`badge rounded-pill px-2 py-1 ${
                              isSelected ? 'bg-white text-dark' : due > 0 ? 'bg-danger text-white' : 'bg-success-subtle text-success'
                            }`} style={{ fontSize: '0.75rem' }}>
                              ৳{due}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="col-12 col-md-7">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white h-100">
              {selectedCustomer ? (
                <>
                  {/* Customer Profile & Balance Banner */}
                  <div className={`p-3 rounded-4 mb-3 border ${Number(selectedCustomer.totalDue) > 0 ? 'bg-danger-subtle border-danger-subtle' : 'bg-success-subtle border-success-subtle'}`}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <h5 className="fw-bold mb-0 text-dark">{selectedCustomer.name}</h5>
                        <div className="text-muted small mt-1">
                          <i className="bi bi-telephone me-1"></i>
                          {selectedCustomer.phone || 'মোবাইল নম্বর নেই'}
                        </div>
                      </div>
                      <div className="text-end">
                        <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>বর্তমান বকেয়া</small>
                        <span className={`fs-4 fw-bold ${Number(selectedCustomer.totalDue) > 0 ? 'text-danger' : 'text-success'}`}>
                          ৳{selectedCustomer.totalDue || 0}
                        </span>
                      </div>
                    </div>

                    {/* Quick Action Toolbar */}
                    <div className="d-flex align-items-center gap-1 mt-2 pt-2 border-top border-black-subtle">
                      {selectedCustomer.phone && (
                        <a 
                          href={`tel:${selectedCustomer.phone}`}
                          className="btn btn-sm btn-white bg-white text-dark shadow-xs rounded-pill px-2 py-1 text-decoration-none"
                          style={{ fontSize: '0.72rem' }}
                        >
                          <i className="bi bi-telephone-fill text-primary me-1"></i>কল
                        </a>
                      )}
                      <button 
                        type="button"
                        className="btn btn-sm btn-white bg-white text-dark shadow-xs rounded-pill px-2 py-1"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => sendCustomerWhatsAppSlip(selectedCustomer)}
                      >
                        <i className="bi bi-whatsapp text-success me-1"></i>WhatsApp
                      </button>
                      <button 
                        type="button"
                        className="btn btn-sm btn-white bg-white text-dark shadow-xs rounded-pill px-2 py-1"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => {
                          setEditCustName(selectedCustomer.name || '');
                          setEditCustPhone(selectedCustomer.phone || '');
                          setIsEditingCust(!isEditingCust);
                        }}
                      >
                        <i className={`bi ${isEditingCust ? 'bi-x' : 'bi-pencil'} me-1`}></i>
                        {isEditingCust ? 'বাতিল' : 'এডিট'}
                      </button>
                      <button 
                        type="button"
                        className="btn btn-sm btn-white bg-white text-danger shadow-xs rounded-pill px-2 py-1 ms-auto"
                        style={{ fontSize: '0.72rem' }}
                        onClick={handleDeleteCustomer}
                      >
                        <i className="bi bi-trash3 me-1"></i>মুছুন
                      </button>
                    </div>
                  </div>

                  {isEditingCust && (
                    <form onSubmit={handleUpdateCustomer} className="p-2 bg-light rounded-3 mb-2 border">
                      <div className="row g-1">
                        <div className="col-6">
                          <input
                            type="text"
                            required
                            className="form-control form-control-sm rounded-3 py-1"
                            placeholder="নাম"
                            value={editCustName}
                            onChange={(e) => setEditCustName(e.target.value)}
                          />
                        </div>
                        <div className="col-6">
                          <input
                            type="tel"
                            className="form-control form-control-sm rounded-3 py-1"
                            placeholder="মোবাইল"
                            value={editCustPhone}
                            onChange={(e) => setEditCustPhone(e.target.value)}
                          />
                        </div>
                        <div className="col-12 mt-1 d-flex gap-1">
                          <button type="submit" className="btn btn-sm btn-primary flex-fill rounded-3 py-1 fw-bold">
                            সেভ করুন
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-sm btn-outline-secondary rounded-3 py-1"
                            onClick={() => setIsEditingCust(false)}
                          >
                            বাতিল
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  <form onSubmit={handleDueTransaction} className="p-2 bg-light rounded-4 mb-3 border">
                    <div className="d-flex p-1 bg-white rounded-pill mb-2 gap-1 border">
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${dueActionType === 'add_due' ? 'bg-danger text-white shadow-sm' : 'text-muted'}`}
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setDueActionType('add_due')}
                      >
                        + নতুন বাকি দিন
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border-0 fw-bold ${dueActionType === 'collect_due' ? 'bg-success text-white shadow-sm' : 'text-muted'}`}
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setDueActionType('collect_due')}
                      >
                        ✓ বাকি আদায় করুন
                      </button>
                    </div>

                    <div className="row g-1">
                      <div className="col-6">
                        <input
                          type="number"
                          required
                          className="form-control form-control-sm rounded-3 py-1 fw-bold text-end"
                          placeholder="টাকা (৳)"
                          value={dueAmount}
                          onChange={(e) => setDueAmount(e.target.value)}
                        />
                      </div>
                      <div className="col-6">
                        <input
                          type="text"
                          className="form-control form-control-sm rounded-3 py-1"
                          placeholder="পণ্য / বিবরণ"
                          value={dueNote}
                          onChange={(e) => setDueNote(e.target.value)}
                        />
                      </div>

                      {/* Quick Amount Chips */}
                      <div className="col-12 my-1 d-flex gap-1 flex-wrap">
                        {dueActionType === 'collect_due' && Number(selectedCustomer.totalDue) > 0 && (
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-success rounded-pill px-2 py-0 fw-bold"
                            style={{ fontSize: '0.68rem' }}
                            onClick={() => setDueAmount(String(selectedCustomer.totalDue))}
                          >
                            সব বাকি (৳{selectedCustomer.totalDue})
                          </button>
                        )}
                        {[50, 100, 200, 500, 1000].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0"
                            style={{ fontSize: '0.68rem' }}
                            onClick={() => setDueAmount(String(amt))}
                          >
                            +৳{amt}
                          </button>
                        ))}
                      </div>

                      <div className="col-12 mt-1">
                        <button type="submit" className={`btn btn-sm w-100 rounded-pill py-1 fw-bold ${dueActionType === 'add_due' ? 'btn-danger' : 'btn-success'}`}>
                          {dueActionType === 'add_due' ? 'বাকি লিপিবদ্ধ করুন' : 'আদায় সম্পন্ন করুন'}
                        </button>
                      </div>
                    </div>
                  </form>

                  {/* Passbook Style Ledger History */}
                  <div className="flex-grow-1 overflow-auto" style={{ maxHeight: '220px' }}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="text-muted fw-bold" style={{ fontSize: '0.72rem' }}>
                        <i className="bi bi-clock-history me-1"></i>লেজার পাসবুক হিসাব
                      </span>
                      <span className="text-muted" style={{ fontSize: '0.7rem' }}>মোট লেনদেন: {dueRecords.length}</span>
                    </div>
                    {dueRecords.length === 0 ? (
                      <div className="text-muted small text-center py-4 bg-light rounded-3">কোনো লেনদেনের রেকর্ড নেই</div>
                    ) : (
                      <div className="list-group list-group-flush gap-1">
                        {dueRecords.map(r => (
                          <div key={r.id} className="p-2 rounded-3 bg-light d-flex justify-content-between align-items-center border-start border-3" style={{ borderColor: r.type === 'add_due' ? '#dc3545' : '#198754' }}>
                            <div>
                              <div className="d-flex align-items-center gap-1">
                                <span className={`badge ${r.type === 'add_due' ? 'bg-danger text-white' : 'bg-success text-white'}`} style={{ fontSize: '0.62rem' }}>
                                  {r.type === 'add_due' ? 'বাকি দিল' : 'আদায় নিল'}
                                </span>
                                <span className="small fw-semibold text-dark">{r.notes || (r.type === 'add_due' ? 'বাকি ক্রয়' : 'বাকি পরিশোধ')}</span>
                              </div>
                              <small className="text-muted d-block mt-1" style={{ fontSize: '0.68rem' }}>
                                <i className="bi bi-calendar3 me-1"></i>{r.date}
                              </small>
                            </div>
                            <span className={`fw-bold ${r.type === 'add_due' ? 'text-danger' : 'text-success'}`}>
                              {r.type === 'add_due' ? `+৳${r.amount}` : `-৳${r.amount}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center text-muted py-5 small">
                  <i className="bi bi-person-bounding-box d-block fs-1 opacity-25 mb-2"></i>
                  বাম পাশের তালিকা থেকে কাস্টমার নির্বাচন করুন
                </div>
              )}
            </div>
          </div>

          {/* Custom Baki Khata Modal Alert */}
          {bakiAlert && (
            <div 
              className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
              style={{ background: 'rgba(0, 0, 0, 0.45)', zIndex: 1060 }}
              onClick={() => { if (!bakiAlert.onConfirm) setBakiAlert(null); }}
            >
              <div 
                className="card border-0 shadow-lg rounded-4 p-3 bg-white"
                style={{ maxWidth: '360px', width: '100%', animation: 'fadeIn 0.15s ease-out' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="d-flex align-items-center gap-2 mb-2">
                  <div className={`rounded-circle d-flex align-items-center justify-content-center ${
                    bakiAlert.type === 'success' ? 'bg-success-subtle text-success' :
                    bakiAlert.type === 'error' ? 'bg-danger-subtle text-danger' :
                    'bg-warning-subtle text-warning'
                  }`} style={{ width: '38px', height: '38px' }}>
                    <i className={`bi ${
                      bakiAlert.type === 'success' ? 'bi-check-circle-fill' :
                      bakiAlert.type === 'error' ? 'bi-exclamation-triangle-fill' :
                      'bi-info-circle-fill'
                    } fs-5`}></i>
                  </div>
                  <h6 className="fw-bold mb-0 text-dark">{bakiAlert.title}</h6>
                </div>
                <p className="text-muted small mb-3" style={{ lineHeight: '1.45', whiteSpace: 'pre-line' }}>
                  {bakiAlert.message}
                </p>
                <div className="d-flex justify-content-end gap-2">
                  {bakiAlert.onConfirm ? (
                    <>
                      <button 
                        type="button" 
                        className="btn btn-sm btn-light rounded-pill px-3 py-1 text-muted"
                        onClick={() => setBakiAlert(null)}
                      >
                        বাতিল
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-sm btn-danger rounded-pill px-3 py-1 fw-bold"
                        onClick={async () => {
                          const action = bakiAlert.onConfirm;
                          setBakiAlert(null);
                          if (action) await action();
                        }}
                      >
                        {bakiAlert.confirmText || 'নিশ্চিত করুন'}
                      </button>
                    </>
                  ) : (
                    <button 
                      type="button" 
                      className="btn btn-sm btn-dark rounded-pill px-4 py-1 fw-bold"
                      onClick={() => setBakiAlert(null)}
                    >
                      ঠিক আছে
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'analytics' ? (
        /* Analytics View with Configurable Profit Model */
        <div className="row g-2">
          
          {/* User Profit Customization Configuration Panel */}
          <div className="col-12">
            <div className="card border-0 shadow-sm p-3 rounded-4 bg-white">
              <h6 className="fw-bold mb-2 small d-flex align-items-center gap-1">
                <i className="bi bi-sliders text-success"></i> আপনি যেভাবে লাভ-ক্ষতি দেখতে চান:
              </h6>

              <div className="d-flex gap-2 mb-2">
                <button
                  type="button"
                  className={`btn btn-sm flex-fill rounded-pill py-1 px-2 ${profitCalculationBasis === 'margin_based' ? 'btn-success text-white' : 'btn-light border text-muted'}`}
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => setProfitCalculationBasis('margin_based')}
                >
                  মার্জিন অনুযায়ী লাভ ({grossMarginPct}%)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill rounded-pill py-1 px-2 ${profitCalculationBasis === 'cashflow' ? 'btn-success text-white' : 'btn-light border text-muted'}`}
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => setProfitCalculationBasis('cashflow')}
                >
                  সরাসরি ক্যাশফ্লো (বিক্রয় - খরচ)
                </button>
              </div>

              {profitCalculationBasis === 'margin_based' && (
                <div className="d-flex align-items-center gap-2 mb-2 pb-2 border-bottom">
                  <small className="text-muted" style={{ fontSize: '0.75rem' }}>দোকানের গড় লাভ মার্জিন:</small>
                  <select 
                    className="form-select form-select-sm py-0 px-2 rounded-pill"
                    style={{ width: '85px', fontSize: '0.78rem' }}
                    value={grossMarginPct}
                    onChange={(e) => setGrossMarginPct(Number(e.target.value))}
                  >
                    {[8, 10, 12, 15, 18, 20, 25].map(m => (
                      <option key={m} value={m}>{m}%</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="d-flex flex-wrap gap-3">
                <label className="d-flex align-items-center gap-1 small text-dark user-select-none" style={{ fontSize: '0.78rem' }}>
                  <input
                    type="checkbox"
                    className="form-check-input mt-0"
                    checked={deductShopExpense}
                    onChange={(e) => setDeductShopExpense(e.target.checked)}
                  />
                  <span>দোকানের খরচ বাদ দিন</span>
                </label>

                <label className="d-flex align-items-center gap-1 small text-dark user-select-none" style={{ fontSize: '0.78rem' }}>
                  <input
                    type="checkbox"
                    className="form-check-input mt-0"
                    checked={deductPersonalDrawings}
                    onChange={(e) => setDeductPersonalDrawings(e.target.checked)}
                  />
                  <span>মালিকের উত্তোলন বাদ দিন</span>
                </label>

                <label className="d-flex align-items-center gap-1 small text-dark user-select-none" style={{ fontSize: '0.78rem' }}>
                  <input
                    type="checkbox"
                    className="form-check-input mt-0"
                    checked={deductStockPurchases}
                    onChange={(e) => setDeductStockPurchases(e.target.checked)}
                  />
                  <span>পণ্য স্টক ক্রয় বাদ দিন</span>
                </label>
              </div>
            </div>
          </div>

          {/* Metric Overview */}
          <div className="col-6 col-sm-3">
            <div className="card border-0 shadow-sm p-2 rounded-4 bg-white">
              <span className="text-muted fw-bold" style={{ fontSize: '0.72rem' }}>ফিল্টার করা মোট বিক্রয়</span>
              <span className="fs-5 fw-bold text-primary">৳{analyticsTotals.sales}</span>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="card border-0 shadow-sm p-2 rounded-4 bg-white">
              <span className="text-muted fw-bold" style={{ fontSize: '0.72rem' }}>দোকান খরচ</span>
              <span className="fs-5 fw-bold text-danger">৳{analyticsTotals.expenses}</span>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="card border-0 shadow-sm p-2 rounded-4 bg-white">
              <span className="text-muted fw-bold" style={{ fontSize: '0.72rem' }}>মালিকের উত্তোলন</span>
              <span className="fs-5 fw-bold text-warning">৳{analyticsTotals.drawings}</span>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <div className="card border-0 shadow-sm p-2 rounded-4 bg-white">
              <span className="text-muted fw-bold" style={{ fontSize: '0.72rem' }}>আপনার হিসেবে মোট লাভ</span>
              <span className={`fs-5 fw-bold ${analyticsTotals.profit >= 0 ? 'text-success' : 'text-danger'}`}>
                ৳{analyticsTotals.profit}
              </span>
            </div>
          </div>

          {/* Lightweight Native SVG Trend Graph */}
          <div className="col-12">
            <div className="card border-0 shadow-sm p-3 rounded-4 bg-white">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="fw-bold mb-0 small">
                  <i className="bi bi-graph-up text-success me-1"></i> বিক্রয় ও লাভ ট্রেন্ড
                </h6>
                <div className="d-flex gap-2" style={{ fontSize: '0.72rem' }}>
                  <span className="d-flex align-items-center"><span className="badge rounded-circle p-1 me-1" style={{ backgroundColor: '#0d6efd' }}> </span>বিক্রয়</span>
                  <span className="d-flex align-items-center"><span className="badge rounded-circle p-1 me-1" style={{ backgroundColor: '#198754' }}> </span>নিট লাভ</span>
                  <span className="d-flex align-items-center"><span className="badge rounded-circle p-1 me-1" style={{ backgroundColor: '#dc3545' }}> </span>খরচ</span>
                </div>
              </div>

              {chartData.points.length <= 1 ? (
                <div className="text-center text-muted py-4 small">ট্রেন্ড গ্রাফ দেখতে অন্তত ২টি দিনের হিসাব সংরক্ষণ করুন</div>
              ) : (
                <div className="position-relative pt-2">
                  <svg viewBox="0 0 500 160" className="w-100" style={{ overflow: 'visible', maxHeight: '180px' }}>
                    <line x1="0" y1="30" x2="500" y2="30" stroke="#f0f0f0" strokeDasharray="3,3" />
                    <line x1="0" y1="80" x2="500" y2="80" stroke="#f0f0f0" strokeDasharray="3,3" />
                    <line x1="0" y1="130" x2="500" y2="130" stroke="#f0f0f0" strokeDasharray="3,3" />

                    <polyline
                      fill="none"
                      stroke="#0d6efd"
                      strokeWidth="2.5"
                      points={chartData.points.map((pt, i) => {
                        const x = (i / (chartData.points.length - 1)) * 480 + 10;
                        const y = 140 - ((Number(pt.totalSales || 0) / chartData.maxVal) * 120);
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    <polyline
                      fill="none"
                      stroke="#198754"
                      strokeWidth="2"
                      points={chartData.points.map((pt, i) => {
                        const x = (i / (chartData.points.length - 1)) * 480 + 10;
                        const y = 140 - ((Math.max(0, Number(pt.recalculatedProfit || 0)) / chartData.maxVal) * 120);
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    <polyline
                      fill="none"
                      stroke="#dc3545"
                      strokeWidth="1.5"
                      strokeDasharray="4,2"
                      points={chartData.points.map((pt, i) => {
                        const x = (i / (chartData.points.length - 1)) * 480 + 10;
                        const y = 140 - ((Number(pt.totalShopExpenses || 0) / chartData.maxVal) * 120);
                        return `${x},${y}`;
                      }).join(' ')}
                    />

                    {chartData.points.map((pt, i) => {
                      const x = (i / (chartData.points.length - 1)) * 480 + 10;
                      const y = 140 - ((Number(pt.totalSales || 0) / chartData.maxVal) * 120);
                      return (
                        <circle
                          key={pt.id || i}
                          cx={x}
                          cy={y}
                          r={hoveredPoint?.id === pt.id ? "5" : "3.5"}
                          fill="#0d6efd"
                          stroke="#fff"
                          strokeWidth="1.5"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredPoint(pt)}
                          onClick={() => { setSelectedDate(pt.date); setActiveTab('register'); }}
                        />
                      );
                    })}
                  </svg>

                  {hoveredPoint && (
                    <div className="p-2 bg-dark text-white rounded-3 small mt-2 shadow-sm d-flex justify-content-between align-items-center">
                      <div>
                        <strong>{hoveredPoint.date}</strong>: বিক্রয় ৳{hoveredPoint.totalSales || 0} | খরচ ৳{hoveredPoint.totalShopExpenses || 0} | লাভ ৳{hoveredPoint.recalculatedProfit || 0}
                      </div>
                      <button 
                        className="btn btn-sm btn-outline-light py-0 px-2"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => { setSelectedDate(hoveredPoint.date); setActiveTab('register'); }}
                      >
                        খাতায় যান
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* History & Reports with Extended Expense & Drawing Drilldown */
        <div className="row g-2">

          {/* Extended Expense & Drawing Summary Header Card */}
          <div className="col-12">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <div className="d-flex p-1 bg-light rounded-pill gap-1 flex-fill flex-sm-grow-0">
                  <button
                    type="button"
                    className={`btn btn-sm rounded-pill py-1 px-3 border-0 fw-bold transition-all flex-fill ${reportViewMode === 'daily' ? 'bg-white text-success shadow-sm' : 'text-muted'}`}
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => setReportViewMode('daily')}
                  >
                    দৈনিক সারাংশ
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm rounded-pill py-1 px-3 border-0 fw-bold transition-all flex-fill ${reportViewMode === 'itemized' ? 'bg-white text-success shadow-sm' : 'text-muted'}`}
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => setReportViewMode('itemized')}
                  >
                    খরচের খাতা ({filteredTransactions.length})
                  </button>
                </div>

                <div className="d-flex align-items-center gap-2 ms-auto position-relative">
                  {reportViewMode === 'daily' && (
                    <div className="position-relative">
                      <button 
                        className="btn btn-sm btn-light border rounded-pill px-2 py-1 text-secondary fw-semibold d-flex align-items-center gap-1 shadow-sm"
                        type="button" 
                        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                        style={{ fontSize: '0.75rem' }}
                      >
                        <i className="bi bi-funnel"></i>
                        <span>
                          {discrepancyFilter === 'all' ? 'সব রেকর্ড' : discrepancyFilter === 'mismatch' ? 'গরমিল' : 'নিখুঁত'}
                        </span>
                        <i className="bi bi-chevron-down" style={{ fontSize: '0.65rem' }}></i>
                      </button>

                      {showFilterDropdown && (
                        <>
                          {/* Invisible backdrop to dismiss on click outside */}
                          <div 
                            className="position-fixed top-0 start-0 w-100 h-100" 
                            style={{ zIndex: 1040 }} 
                            onClick={() => setShowFilterDropdown(false)}
                          />
                          <div 
                            className="card border-0 shadow-lg rounded-3 py-1 position-absolute end-0 mt-1 bg-white"
                            style={{ zIndex: 1050, minWidth: '160px' }}
                          >
                            <button 
                              className={`dropdown-item small px-3 py-2 text-start border-0 bg-transparent ${discrepancyFilter === 'all' ? 'text-success fw-bold bg-light' : 'text-dark'}`}
                              type="button" 
                              onClick={() => {
                                setDiscrepancyFilter('all');
                                setShowFilterDropdown(false);
                              }}
                            >
                              <i className="bi bi-list-ul me-2"></i>সব রেকর্ড
                            </button>
                            <button 
                              className={`dropdown-item small px-3 py-2 text-start border-0 bg-transparent ${discrepancyFilter === 'mismatch' ? 'text-danger fw-bold bg-light' : 'text-dark'}`}
                              type="button" 
                              onClick={() => {
                                setDiscrepancyFilter('mismatch');
                                setShowFilterDropdown(false);
                              }}
                            >
                              <i className="bi bi-exclamation-triangle-fill text-danger me-2"></i>শুধুমাত্র গরমিল
                            </button>
                            <button 
                              className={`dropdown-item small px-3 py-2 text-start border-0 bg-transparent ${discrepancyFilter === 'perfect' ? 'text-success fw-bold bg-light' : 'text-dark'}`}
                              type="button" 
                              onClick={() => {
                                setDiscrepancyFilter('perfect');
                                setShowFilterDropdown(false);
                              }}
                            >
                              <i className="bi bi-check-circle-fill text-success me-2"></i>নিখুঁত ক্যাশ (০ গরমিল)
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <button 
                    className="btn btn-sm btn-outline-success rounded-pill px-3 py-1 shadow-sm fw-semibold d-flex align-items-center gap-1" 
                    style={{ fontSize: '0.75rem' }} 
                    onClick={() => {
                      setExportScope('custom');
                      setCustomExportFrom(fromDate || getBDDateString());
                      setCustomExportTo(toDate || getBDDateString());
                      setShowExportModal(true);
                    }}
                    title="রিপোর্ট জেনারেট ও শেয়ার"
                  >
                    <i className="bi bi-box-arrow-up-right text-success"></i>
                    <span>রিপোর্ট শেয়ার</span>
                  </button>
                </div>
              </div>

              {/* Expense & Drawing Split Progress Bar */}
              <div className="row g-2 mt-1">
                <div className="col-6 col-md-3">
                  <div className="p-2 bg-light rounded-3">
                    <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>মোট দোকান খরচ</small>
                    <span className="fw-bold text-danger">৳{analyticsTotals.expenses}</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="p-2 bg-light rounded-3">
                    <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>মোট মালিকের উত্তোলন</small>
                    <span className="fw-bold text-warning">৳{analyticsTotals.drawings}</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="p-2 bg-light rounded-3">
                    <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>পণ্য স্টক ক্রয়</small>
                    <span className="fw-bold text-primary">৳{analyticsTotals.stock}</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="p-2 bg-light rounded-3">
                    <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>মোট খরচ ও উত্তোলন</small>
                    <span className="fw-bold text-dark">৳{analyticsTotals.expenses + analyticsTotals.drawings + analyticsTotals.stock}</span>
                  </div>
                </div>
              </div>

              {/* Top Categories Tags */}
              {categoryBreakdown.length > 0 && (
                <div className="d-flex flex-wrap gap-1 mt-2 pt-2 border-top">
                  <span className="small text-muted me-1" style={{ fontSize: '0.72rem' }}>শীর্ষ খাত:</span>
                  {categoryBreakdown.slice(0, 5).map(([cat, amt]) => (
                    <span key={cat} className="badge bg-light text-secondary border px-2 py-1 rounded-pill" style={{ fontSize: '0.7rem' }}>
                      {cat}: <strong>৳{amt}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Table View */}
          <div className="col-12">
            <div className="card shadow-sm border-0 rounded-4 p-2 p-md-3 bg-white">
              {reportViewMode === 'daily' ? (
                /* Daily Entries with Expandable Rows */
                <div className="table-responsive" style={{ maxHeight: '420px' }}>
                  <table className="table table-hover table-sm align-middle text-center small mb-0">
                    <thead className="table-light sticky-top">
                      <tr style={{ cursor: 'pointer', userSelect: 'none' }}>
                        <th style={{ width: '30px' }}></th>
                        <th onClick={() => toggleSort('date')}>
                          তারিখ {sortField === 'date' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th onClick={() => toggleSort('totalSales')}>
                          বিক্রয় {sortField === 'totalSales' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th onClick={() => toggleSort('totalShopExpenses')}>
                          দোকান খরচ {sortField === 'totalShopExpenses' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th onClick={() => toggleSort('totalPersonalDrawings')}>
                          উত্তোলন {sortField === 'totalPersonalDrawings' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th onClick={() => toggleSort('recalculatedProfit')}>
                          লাভ {sortField === 'recalculatedProfit' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th onClick={() => toggleSort('actualCash')}>
                          হাতে ক্যাশ {sortField === 'actualCash' && (sortAsc ? '▲' : '▼')}
                        </th>
                        <th onClick={() => toggleSort('discrepancy')}>
                          গরমিল {sortField === 'discrepancy' && (sortAsc ? '▲' : '▼')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedEntries.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="py-4 text-muted">কোনো রেকর্ড পাওয়া যায়নি</td>
                        </tr>
                      ) : (
                        filteredAndSortedEntries.map((e) => {
                          const isExpanded = expandedDate === e.date;
                          const dayTx = allTransactions.filter(t => t.date === e.date);
                          return (
                            <React.Fragment key={e.id}>
                              <tr role="button" onClick={() => setExpandedDate(isExpanded ? null : e.date)}>
                                <td>
                                  <i className={`bi ${isExpanded ? 'bi-chevron-down text-success' : 'bi-chevron-right text-muted'}`}></i>
                                </td>
                                <td className="fw-bold text-start">{e.date}</td>
                                <td className="text-primary fw-semibold">৳{e.totalSales || 0}</td>
                                <td className="text-danger">৳{e.totalShopExpenses || 0}</td>
                                <td className="text-warning">৳{e.totalPersonalDrawings || 0}</td>
                                <td className={`fw-bold ${e.recalculatedProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                                  ৳{e.recalculatedProfit || 0}
                                </td>
                                <td className="fw-bold">৳{e.actualCash || 0}</td>
                                <td>
                                  <span className={`badge ${Number(e.discrepancy) === 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}>
                                    ৳{e.discrepancy || 0}
                                  </span>
                                </td>
                              </tr>

                              {/* Accordion Row Drilldown */}
                              {isExpanded && (
                                <tr className="bg-light">
                                  <td colSpan="8" className="p-2 text-start">
                                    <div className="card border-0 bg-white shadow-sm rounded-3 p-2">
                                      <div className="d-flex justify-content-between align-items-center mb-1">
                                        <span className="fw-bold text-dark small">
                                          <i className="bi bi-list-nested me-1 text-success"></i> {e.date} তারিখের বিস্তারিত খরচ ও উত্তোলন
                                        </span>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-success py-0 px-2 rounded-pill"
                                          style={{ fontSize: '0.72rem' }}
                                          onClick={(ev) => {
                                            ev.stopPropagation();
                                            setSelectedDate(e.date);
                                            setActiveTab('register');
                                          }}
                                        >
                                          খাতা এডিট করুন
                                        </button>
                                      </div>

                                      {dayTx.length === 0 ? (
                                        <div className="text-muted small py-1">এই দিনের কোনো বিস্তারিত খরচের এন্ট্রি নেই</div>
                                      ) : (
                                        <div className="table-responsive">
                                          <table className="table table-sm table-borderless small mb-0" style={{ fontSize: '0.78rem' }}>
                                            <tbody>
                                              {dayTx.map((t, idx) => (
                                                <tr key={t.id || idx} className="border-bottom">
                                                  <td style={{ width: '80px' }}>
                                                    <span className={`badge ${t.type === 'shop_expense' ? 'bg-danger-subtle text-danger' : t.type === 'stock_purchase' ? 'bg-primary-subtle text-primary' : 'bg-warning-subtle text-dark'}`}>
                                                      {t.type === 'shop_expense' ? 'দোকান' : t.type === 'stock_purchase' ? 'স্টক' : 'উত্তোলন'}
                                                    </span>
                                                  </td>
                                                  <td className="fw-semibold">{t.description}</td>
                                                  <td className="text-muted">({t.category})</td>
                                                  <td className="text-end fw-bold">৳{t.amount}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}

                                      {e.notes && (
                                        <div className="mt-2 pt-1 border-top text-muted small" style={{ fontSize: '0.75rem' }}>
                                          <strong>নোট:</strong> {e.notes}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Full Itemized Audit List across Filtered Range (Mobile Friendly Cards/List) */
                <div className="overflow-auto" style={{ maxHeight: '420px' }}>
                  {filteredTransactions.length === 0 ? (
                    <div className="py-4 text-center text-muted small">কোনো খরচের লেনদেন পাওয়া যায়নি</div>
                  ) : (
                    <div className="d-flex flex-column gap-1">
                      {filteredTransactions.map((t) => (
                        <div key={t.id} className="p-2 bg-light rounded-3 d-flex justify-content-between align-items-center">
                          <div className="text-truncate me-2" style={{ maxWidth: '75%' }}>
                            <div className="d-flex align-items-center gap-1 mb-1">
                              <span className="badge bg-secondary-subtle text-secondary py-0 px-1" style={{ fontSize: '0.65rem' }}>{t.date}</span>
                              <span className={`badge py-0 px-1 ${t.type === 'shop_expense' ? 'bg-danger-subtle text-danger' : t.type === 'stock_purchase' ? 'bg-primary-subtle text-primary' : 'bg-warning-subtle text-dark'}`} style={{ fontSize: '0.65rem' }}>
                                {t.type === 'shop_expense' ? 'দোকান' : t.type === 'stock_purchase' ? 'স্টক' : 'উত্তোলন'}
                              </span>
                            </div>
                            <span className="fw-semibold small text-dark d-block text-truncate">{t.description}</span>
                            <small className="text-muted" style={{ fontSize: '0.68rem' }}>{t.category}</small>
                          </div>
                          <span className="text-end fw-bold fs-6 text-dark flex-shrink-0">৳{t.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Action Bar */}
      <div 
        className="position-fixed bottom-0 start-50 translate-middle-x w-100 bg-white border-top shadow-lg px-3 py-2 d-flex justify-content-between align-items-center"
        style={{ maxWidth: '980px', zIndex: 1030 }}
      >
        <div className="d-flex align-items-center gap-2">
          <div>
            <small className="text-muted d-block" style={{ fontSize: '0.68rem', lineHeight: '1' }}>হাতে ক্যাশ</small>
            <span className="fw-bold text-success fs-6">৳{actualCash}</span>
          </div>
          <span className={`badge rounded-pill ${discrepancy === 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`} style={{ fontSize: '0.72rem' }}>
            গরমিল: ৳{discrepancy}
          </span>
        </div>

        <button
          className="btn btn-success btn-sm rounded-pill px-4 py-2 fw-bold shadow d-flex align-items-center gap-1"
          onClick={handleSaveDay}
          disabled={saving}
        >
          {saving ? (
            <span className="spinner-border spinner-border-sm"></span>
          ) : (
            <i className="bi bi-cloud-check-fill"></i>
          )}
          <span>{saving ? 'সংরক্ষণ হচ্ছে...' : 'হিসাব সংরক্ষণ'}</span>
        </button>
      </div>

      {/* Cash Denominations Bottom-Sheet Modal */}
      {showDenomModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content border-0 shadow-lg rounded-4">
              <div className="modal-header border-0 pb-1">
                <h6 className="modal-title fw-bold small">
                  <i className="bi bi-calculator text-success me-1"></i> ক্যাশ নোট গণনা
                </h6>
                <button type="button" className="btn-close" onClick={() => setShowDenomModal(false)}></button>
              </div>
              <div className="modal-body py-2">
                <div className="p-2 rounded-3 bg-light text-center mb-2">
                  <small className="text-muted d-block" style={{ fontSize: '0.72rem' }}>মোট গণনাকৃত ক্যাশ</small>
                  <span className="fs-4 fw-bold text-success">৳{denomTotal}</span>
                </div>
                <div className="overflow-auto px-1" style={{ maxHeight: '260px' }}>
                  {[1000, 500, 200, 100, 50, 20, 10, 5, 2, 1].map((note) => (
                    <div key={note} className="d-flex align-items-center justify-content-between mb-1">
                      <span className="small fw-semibold" style={{ width: '60px' }}>৳{note} ×</span>
                      <input
                        type="number"
                        min="0"
                        className="form-control form-control-sm text-center py-1 rounded-3"
                        style={{ width: '75px' }}
                        value={denoms[note] || ''}
                        onChange={(e) => setDenoms({ ...denoms, [note]: Number(e.target.value) || 0 })}
                      />
                      <span className="small text-muted text-end" style={{ width: '65px' }}>
                        ৳{(denoms[note] || 0) * note}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button type="button" className="btn btn-sm btn-light rounded-pill w-100 mb-1" onClick={() => setDenoms({})}>
                  রিসেট
                </button>
                <button type="button" className="btn btn-sm btn-success rounded-pill w-100 fw-bold" onClick={applyDenomTotal}>
                  হাতে ক্যাশে বসান (৳{denomTotal})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Interactive Report Generator Modal */}
      {showExportModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-sm" style={{ maxWidth: '420px' }}>
            <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden bg-white">
              <div className="modal-header border-0 pb-1 pt-3 px-3">
                <div className="d-flex align-items-center gap-2">
                  <span className="p-2 rounded-3 bg-success bg-opacity-10 text-success">
                    <i className="bi bi-file-earmark-bar-graph-fill fs-5"></i>
                  </span>
                  <div>
                    <h6 className="modal-title fw-bold text-dark mb-0">রিপোর্ট জেনারেটর</h6>
                    <small className="text-muted" style={{ fontSize: '0.72rem' }}>কাস্টমাইজড রিপোর্ট ও শেয়ারিং</small>
                  </div>
                </div>
                <button type="button" className="btn-close" onClick={() => setShowExportModal(false)}></button>
              </div>

              <div className="modal-body p-3">
                {/* 1. Select Scope */}
                <label className="text-dark fw-bold d-block mb-1" style={{ fontSize: '0.75rem' }}>
                  ১. সময়কাল বা তারিখ নির্বাচন করুন:
                </label>
                <div className="d-flex flex-wrap gap-1 mb-2">
                  {[
                    { id: 'single', label: `আজকের দিন (${selectedDate})` },
                    { id: '7days', label: 'গত ৭ দিন' },
                    { id: '30days', label: 'গত ৩০ দিন' },
                    { id: 'thisMonth', label: 'চলতি মাস' },
                    { id: 'custom', label: 'কাস্টম রেঞ্জ' }
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn btn-sm py-1 px-2 rounded-pill border small ${exportScope === s.id ? 'btn-success text-white' : 'btn-light text-secondary'}`}
                      style={{ fontSize: '0.72rem' }}
                      onClick={() => setExportScope(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Inputs if 'custom' selected */}
                {exportScope === 'custom' && (
                  <div className="p-2 bg-light rounded-3 mb-3 border">
                    <div className="row g-1">
                      <div className="col-6">
                        <small className="text-muted d-block" style={{ fontSize: '0.68rem' }}>হতে (From):</small>
                        <input
                          type="date"
                          className="form-control form-control-sm py-1 rounded-2"
                          style={{ fontSize: '0.78rem' }}
                          value={customExportFrom}
                          onChange={(e) => setCustomExportFrom(e.target.value)}
                        />
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block" style={{ fontSize: '0.68rem' }}>পর্যন্ত (To):</small>
                        <input
                          type="date"
                          className="form-control form-control-sm py-1 rounded-2"
                          style={{ fontSize: '0.78rem' }}
                          value={customExportTo}
                          onChange={(e) => setCustomExportTo(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Select Report Type & WhatsApp Included Sections */}
                <label className="text-dark fw-bold d-block mb-1 mt-2" style={{ fontSize: '0.75rem' }}>
                  ২. রিপোর্টে যা যা পাঠাতে চান (একাধিক টিক দিন):
                </label>
                <div className="d-flex flex-column gap-1 mb-2">
                  <label className={`p-2 rounded-3 border d-flex align-items-center gap-2 user-select-none cursor-pointer ${selectedReportSections.summary ? 'border-success bg-success bg-opacity-10' : 'bg-light'}`} style={{ cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedReportSections.summary} 
                      onChange={(e) => setSelectedReportSections(prev => ({ ...prev, summary: e.target.checked }))}
                      className="form-check-input mt-0"
                    />
                    <div>
                      <strong className="d-block small text-dark">ক্যাশ ড্রয়ার ও সারসংক্ষেপ হিসাব</strong>
                      <small className="text-muted" style={{ fontSize: '0.68rem' }}>বিক্রয়, ড্রয়ার ব্যালেন্স, নিট লাভ ও গরমিল</small>
                    </div>
                  </label>

                  <label className={`p-2 rounded-3 border d-flex align-items-center gap-2 user-select-none cursor-pointer ${selectedReportSections.expenses ? 'border-success bg-success bg-opacity-10' : 'bg-light'}`} style={{ cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedReportSections.expenses} 
                      onChange={(e) => setSelectedReportSections(prev => ({ ...prev, expenses: e.target.checked }))}
                      className="form-check-input mt-0"
                    />
                    <div>
                      <strong className="d-block small text-dark">বিস্তারিত খরচের খাতা (আইটেম তালিকা)</strong>
                      <small className="text-muted" style={{ fontSize: '0.68rem' }}>দোকান পরিচালন, স্টক ক্রয় ও ব্যক্তিগত খরচসমূহ</small>
                    </div>
                  </label>

                  <label className={`p-2 rounded-3 border d-flex align-items-center gap-2 user-select-none cursor-pointer ${selectedReportSections.due ? 'border-success bg-success bg-opacity-10' : 'bg-light'}`} style={{ cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedReportSections.due} 
                      onChange={(e) => setSelectedReportSections(prev => ({ ...prev, due: e.target.checked }))}
                      className="form-check-input mt-0"
                    />
                    <div>
                      <strong className="d-block small text-dark">কাস্টমার বাকি খাতার সারসংক্ষেপ</strong>
                      <small className="text-muted" style={{ fontSize: '0.68rem' }}>মোট বাজার বাকি ও শীর্ষ বাকিদারদের তালিকা</small>
                    </div>
                  </label>
                </div>

                {/* 3. Choose Profit Calculation Mode */}
                {selectedReportSections.summary && (
                  <div className="p-2 bg-light rounded-3 mb-3 border">
                    <label className="text-dark fw-bold d-block mb-1" style={{ fontSize: '0.73rem' }}>
                      ৩. লাভ হিসাবের নিয়ম নির্বাচন করুন:
                    </label>
                    <div className="d-flex gap-1 mb-2">
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border small ${profitCalculationBasis === 'margin_based' ? 'btn-success text-white' : 'btn-white bg-white text-secondary'}`}
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => setProfitCalculationBasis('margin_based')}
                      >
                        মার্জিন লাভ ({grossMarginPct}%)
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm flex-fill rounded-pill py-1 border small ${profitCalculationBasis === 'cashflow' ? 'btn-success text-white' : 'btn-white bg-white text-secondary'}`}
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => setProfitCalculationBasis('cashflow')}
                      >
                        ক্যাশফ্লো (বিক্রয় - খরচ)
                      </button>
                    </div>

                    {profitCalculationBasis === 'margin_based' && (
                      <div className="d-flex align-items-center justify-content-between pt-1 border-top">
                        <small className="text-muted" style={{ fontSize: '0.7rem' }}>মার্জিন শতাংশ (%):</small>
                        <select
                          className="form-select form-select-sm py-0 px-2 rounded-pill"
                          style={{ width: '85px', fontSize: '0.75rem' }}
                          value={grossMarginPct}
                          onChange={(e) => setGrossMarginPct(Number(e.target.value))}
                        >
                          {[8, 10, 12, 15, 18, 20, 25].map(m => (
                            <option key={m} value={m}>{m}%</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Action Buttons */}
                <div className="row g-2">
                  <div className="col-6">
                    <button
                      type="button"
                      className="btn btn-sm btn-success w-100 py-2 rounded-3 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-1"
                      onClick={() => handleGenerateExport('whatsapp')}
                    >
                      <i className="bi bi-whatsapp"></i>
                      <span>WhatsApp কপি</span>
                    </button>
                  </div>
                  <div className="col-6">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-dark w-100 py-2 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-1"
                      onClick={() => handleGenerateExport('csv')}
                    >
                      <i className="bi bi-file-earmark-spreadsheet-fill text-success"></i>
                      <span>Excel / CSV</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Modern Success Alert Modal */}
      {successAlert && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1070 }}>
          <div className="modal-dialog modal-dialog-centered modal-sm" style={{ maxWidth: '360px' }}>
            <div className="modal-content border-0 shadow-lg rounded-4 text-center p-3 bg-white">
              <div className="my-2">
                <span className="p-3 bg-success bg-opacity-10 text-success rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '64px', height: '64px' }}>
                  <i className="bi bi-check-lg fs-1 fw-bold"></i>
                </span>
              </div>
              <h6 className="fw-bold text-dark mt-2 mb-1">{successAlert.title}</h6>
              <p className="text-muted small mb-3" style={{ fontSize: '0.78rem' }}>{successAlert.msg}</p>

              <div className="d-flex flex-column gap-2">
                {successAlert.link && (
                  <a
                    href={successAlert.link}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm btn-success rounded-pill py-2 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
                  >
                    <i className="bi bi-whatsapp fs-6"></i>
                    <span>সরাসরি WhatsApp খুলুন</span>
                  </a>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-light border rounded-pill py-2 text-secondary fw-semibold"
                  onClick={() => setSuccessAlert(null)}
                >
                  ঠিক আছে (বন্ধ করুন)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
