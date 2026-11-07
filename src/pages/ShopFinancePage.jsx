import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase/firebase';
import { 
  doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, deleteDoc, updateDoc 
} from 'firebase/firestore';
import { useSound } from '../contexts/SoundContext';

// Helper for accurate Bangladesh Standard Time (BST: UTC+6) date string (YYYY-MM-DD)
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

  // User-Configurable Profit/Loss Formula settings
  // Mode: 'margin_based' (Default retail margin) | 'cashflow' (Total Sales - Expenses)
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
  const [dueActionType, setDueActionType] = useState('add_due');
  const [dueAmount, setDueAmount] = useState('');
  const [dueNote, setDueNote] = useState('');
  const [dueRecords, setDueRecords] = useState([]);

  // Reports & Analytics State (Shared Date Filter)
  const [allEntries, setAllEntries] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [discrepancyFilter, setDiscrepancyFilter] = useState('all'); // 'all' | 'mismatch' | 'perfect'
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);

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

  // Derived calculations for Selected Date
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

  // Dynamic User-Chosen Profit Calculation for current day
  const calculateDayProfit = (sales, shopExp, drawings, stock) => {
    let baseRevenue = 0;
    if (profitCalculationBasis === 'margin_based') {
      baseRevenue = Math.round(sales * (grossMarginPct / 100));
    } else {
      baseRevenue = sales;
    }

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
          // Fetch previous day in BD Time
          const prevDateObj = new Date(selectedDate);
          prevDateObj.setDate(prevDateObj.getDate() - 1);
          const prevStr = getBDDateString(prevDateObj);
          const prevSnap = await getDoc(doc(db, 'shopFinance', currentUser.uid, 'dailyEntries', prevStr));
          setOpeningCash(prevSnap.exists() ? (prevSnap.data().actualCash || prevSnap.data().expectedCash || 0) : 0);
          setCashSales(0);
          setCreditSales(0);
          setDueCollected(0);
          setActualCash(0);
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

  // Load All Entries for Reports
  useEffect(() => {
    let isMounted = true;
    async function loadAllEntries() {
      if (!currentUser?.uid || (activeTab !== 'reports' && activeTab !== 'analytics')) return;
      try {
        const snap = await getDocs(collection(db, 'shopFinance', currentUser.uid, 'dailyEntries'));
        if (isMounted) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          setAllEntries(list);
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
      setTransactions(prev => [newTx, ...prev]);
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
    } catch (err) {
      console.error('Add customer error:', err);
      alert('কাস্টমার যোগ করতে সমস্যা: ' + err.message);
    }
  };

  const handleDueTransaction = async (e) => {
    e.preventDefault();
    if (!dueAmount || !selectedCustomer || !currentUser?.uid) return;
    const amt = Number(dueAmount);
    const isCollect = dueActionType === 'collect_due';
    const updatedDue = isCollect
      ? (Number(selectedCustomer.totalDue) || 0) - amt
      : (Number(selectedCustomer.totalDue) || 0) + amt;

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
      alert('লেনদেনে সমস্যা: ' + err.message);
    }
  };

  const sendCustomerWhatsAppSlip = (cust) => {
    if (!cust) return;
    const msg = `সালামু আলাইকুম ${cust.name} ভাই,\nদোকানের বাকি খাতার হিসাব অনুযায়ী আপনার মোট বকেয়া ৳${cust.totalDue || 0} টাকা। সুবিধামতো সময়ে পরিশোধের অনুরোধ রইল। ধন্যবাদ!`;
    const url = `https://wa.me/${cust.phone ? cust.phone.replace(/[^0-9]/g, '') : ''}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
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
      setTransactions(prev => [newTx, ...prev]);
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

  // Filtered & Sorted Entries (Reactive to user-selected profit formula)
  const filteredAndSortedEntries = useMemo(() => {
    let list = [...allEntries];

    // From - To Date Filter
    if (fromDate) list = list.filter(e => e.date >= fromDate);
    if (toDate) list = list.filter(e => e.date <= toDate);

    // Discrepancy filter
    if (discrepancyFilter === 'mismatch') {
      list = list.filter(e => Number(e.discrepancy || 0) !== 0);
    } else if (discrepancyFilter === 'perfect') {
      list = list.filter(e => Number(e.discrepancy || 0) === 0);
    }

    // Recalculate profit per entry using user's chosen formula
    list = list.map(e => {
      const sales = Number(e.totalSales || 0);
      const shopExp = Number(e.totalShopExpenses || 0);
      const drawings = Number(e.totalPersonalDrawings || 0);
      const stock = Number(e.totalStockPurchases || 0);
      const customProfit = calculateDayProfit(sales, shopExp, drawings, stock);
      return {
        ...e,
        recalculatedProfit: customProfit
      };
    });

    // Sorting
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

  // Analytics Totals
  const analyticsTotals = useMemo(() => {
    return filteredAndSortedEntries.reduce((acc, curr) => ({
      sales: acc.sales + (Number(curr.totalSales) || 0),
      expenses: acc.expenses + (Number(curr.totalShopExpenses) || 0),
      drawings: acc.drawings + (Number(curr.totalPersonalDrawings) || 0),
      stock: acc.stock + (Number(curr.totalStockPurchases) || 0),
      profit: acc.profit + (Number(curr.recalculatedProfit) || 0)
    }), { sales: 0, expenses: 0, drawings: 0, stock: 0, profit: 0 });
  }, [filteredAndSortedEntries]);

  // Lightweight SVG Chart Data (Chronological)
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

  const exportToCSV = () => {
    if (filteredAndSortedEntries.length === 0) return alert('কোনো রেকর্ড নেই!');
    let csv = 'তারিখ,আগের ক্যাশ,নগদ বিক্রয়,বাকি বিক্রয়,বাকি আদায়,দোকান খরচ,উত্তোলন,মোট বিক্রয়,হিসাব অনুযায়ী লাভ,হাতে ক্যাশ,গরমিল\n';
    filteredAndSortedEntries.forEach(e => {
      csv += `${e.date},${e.openingCash || 0},${e.cashSales || 0},${e.creditSales || 0},${e.dueCollected || 0},${e.totalShopExpenses || 0},${e.totalPersonalDrawings || 0},${e.totalSales || 0},${e.recalculatedProfit || 0},${e.actualCash || 0},${e.discrepancy || 0}\n`;
    });
    csv += `সর্বমোট,,,,${analyticsTotals.expenses},${analyticsTotals.drawings},${analyticsTotals.sales},${analyticsTotals.profit},,\n`;
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Shop_Finance_${fromDate || 'all'}_to_${toDate || 'all'}.csv`;
    link.click();
  };

  const copyWhatsAppReport = () => {
    const report = `*দোকানের দৈনিক হিসাব (BD)*\nতারিখ: ${selectedDate}\n--------------------\nআগের ক্যাশ: ৳${openingCash}\nমোট বিক্রয়: ৳${totalSales} (নগদ: ৳${cashSales}, বাকি: ৳${creditSales})\nবাকি আদায়: ৳${dueCollected}\nদোকানের খরচ: ৳${totalShopExpenses}\nপণ্য স্টক ক্রয়: ৳${totalStockPurchases}\nমালিকের উত্তোলন: ৳${totalPersonalDrawings}\n--------------------\nহিসাবকৃত লাভ: ৳${currentDayProfit}\nহিসাব অনুযায়ী শেষ ক্যাশ: ৳${expectedClosingCash}\nহাতে গোনা ক্যাশ: ৳${actualCash}\nগরমিল: ৳${discrepancy}\nবর্তমান বাজার বাকি: ৳${totalMarketDue}\n${notes ? `\nনোট:\n${notes}` : ''}`;
    navigator.clipboard.writeText(report);
    alert('হিসাবের সারসংক্ষেপ কপি হয়েছে!');
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

      {/* Top Mobile-First App Bar */}
      <div className="card border-0 shadow-sm rounded-4 p-2 mb-2 bg-white">
        <div className="d-flex align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <button 
              className="btn btn-sm btn-light border-0 rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: '38px', height: '38px' }}
              onClick={onBack}
            >
              <i className="bi bi-chevron-left fs-5"></i>
            </button>
            <div>
              <h6 className="mb-0 fw-bold d-flex align-items-center gap-1">
                <span className="badge bg-success-subtle text-success p-1 px-2 rounded-pill">দোকানের হিসাব</span>
              </h6>
              <small className="text-muted" style={{ fontSize: '0.72rem' }}>Dhaka Timezone (BST UTC+6)</small>
            </div>
          </div>

          <div className="d-flex align-items-center gap-1">
            <input
              type="date"
              className="form-control form-control-sm border-0 bg-light rounded-pill px-2 py-1 text-center fw-semibold text-secondary"
              style={{ fontSize: '0.8rem', maxWidth: '135px' }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button 
              className="btn btn-sm btn-success rounded-circle shadow-sm d-flex align-items-center justify-content-center" 
              style={{ width: '34px', height: '34px' }}
              onClick={copyWhatsAppReport} 
              title="WhatsApp Report"
            >
              <i className="bi bi-whatsapp"></i>
            </button>
          </div>
        </div>

        {/* Touch-Friendly Segmented Tabs */}
        <div className="d-flex p-1 bg-light rounded-pill mt-2 gap-1 overflow-auto">
          {[
            { id: 'register', label: 'ক্যাশ খাতা', icon: 'bi-journal-check' },
            { id: 'due_ledger', label: `বাকি (${customers.length})`, icon: 'bi-person-lines-fill' },
            { id: 'analytics', label: 'লাভ-ক্ষতি ও গ্রাফ', icon: 'bi-graph-up-arrow' },
            { id: 'reports', label: 'রিপোর্ট ফিল্টার', icon: 'bi-table' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm flex-fill rounded-pill py-1 px-2 border-0 fw-bold transition-all text-nowrap d-flex align-items-center justify-content-center gap-1 ${
                activeTab === tab.id ? 'bg-white text-success shadow-sm' : 'text-muted'
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

      {/* Shared From - To Date Filter Bar (Shows on both Analytics and Reports tabs) */}
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

          {/* Daily Cash Entry Section */}
          <div className="col-12 col-md-6">
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

          {/* Quick Expense Logger */}
          <div className="col-12 col-md-6">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white h-100">
              <h6 className="fw-bold mb-2 text-dark small d-flex align-items-center gap-1">
                <i className="bi bi-cart-dash text-danger"></i> খরচ / উত্তোলন যোগ করুন
              </h6>

              <form onSubmit={handleAddTransaction} className="mb-2">
                <div className="btn-group w-100 mb-2">
                  <button
                    type="button"
                    className={`btn btn-sm py-1 ${txType === 'shop_expense' ? 'btn-danger' : 'btn-outline-danger'}`}
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => setTxType('shop_expense')}
                  >
                    দোকান খরচ
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm py-1 ${txType === 'stock_purchase' ? 'btn-primary' : 'btn-outline-primary'}`}
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => setTxType('stock_purchase')}
                  >
                    স্টক ক্রয়
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm py-1 ${txType === 'personal_drawing' ? 'btn-warning' : 'btn-outline-warning'}`}
                    style={{ fontSize: '0.75rem' }}
                    onClick={() => setTxType('personal_drawing')}
                  >
                    উত্তোলন
                  </button>
                </div>

                <div className="row g-1">
                  <div className="col-7">
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-3 py-1"
                      placeholder="বিবরণ (e.g. চা-নাস্তা)"
                      value={txDesc}
                      onChange={(e) => setTxDesc(e.target.value)}
                      style={{ fontSize: '0.8rem' }}
                    />
                  </div>
                  <div className="col-5">
                    <input
                      type="number"
                      required
                      className="form-control form-control-sm rounded-3 py-1"
                      placeholder="টাকা (৳)"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      style={{ fontSize: '0.8rem' }}
                    />
                  </div>
                  <div className="col-8">
                    <select
                      className="form-select form-select-sm rounded-3 py-1"
                      value={txCategory}
                      onChange={(e) => setTxCategory(e.target.value)}
                      style={{ fontSize: '0.8rem' }}
                    >
                      {categories.map((cat, idx) => (
                        <option key={idx} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-4">
                    <button type="submit" className="btn btn-sm btn-dark w-100 rounded-3 py-1 fw-bold" style={{ fontSize: '0.8rem' }}>
                      + যোগ
                    </button>
                  </div>
                </div>
              </form>

              {/* Transactions List */}
              <div className="flex-grow-1 overflow-auto" style={{ maxHeight: '180px' }}>
                <span className="text-muted fw-bold d-block mb-1" style={{ fontSize: '0.7rem' }}>
                  আজকের এন্ট্রি তালিকা ({transactions.length})
                </span>
                {transactions.length === 0 ? (
                  <div className="text-center text-muted small py-3" style={{ fontSize: '0.75rem' }}>কোনো এন্ট্রি নেই</div>
                ) : (
                  <div className="list-group list-group-flush">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="list-group-item px-1 py-1 d-flex justify-content-between align-items-center">
                        <div className="text-truncate me-2">
                          <span className={`badge me-1 ${
                            tx.type === 'shop_expense' ? 'bg-danger-subtle text-danger' : 
                            tx.type === 'stock_purchase' ? 'bg-primary-subtle text-primary' : 
                            'bg-warning-subtle text-dark'
                          }`} style={{ fontSize: '0.65rem' }}>
                            {tx.type === 'shop_expense' ? 'দোকান' : tx.type === 'stock_purchase' ? 'স্টক' : 'উত্তোলন'}
                          </span>
                          <span className="small fw-semibold">{tx.description}</span>
                        </div>
                        <div className="d-flex align-items-center gap-1 flex-shrink-0">
                          <span className="fw-bold small">৳{tx.amount}</span>
                          <button
                            type="button"
                            className="btn btn-sm text-danger p-0 border-0 ms-1"
                            onClick={() => handleDeleteTransaction(tx.id)}
                          >
                            <i className="bi bi-x fs-6"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'due_ledger' ? (
        /* Customer Due Ledger */
        <div className="row g-2">
          <div className="col-12 col-md-5">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white">
              <h6 className="fw-bold mb-2 small">কাস্টমার তালিকা ({customers.length})</h6>
              
              <form onSubmit={handleAddCustomer} className="mb-2">
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    required
                    className="form-control rounded-start-3"
                    placeholder="নাম"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="মোবাইল"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                  />
                  <button className="btn btn-success rounded-end-3" type="submit">যোগ</button>
                </div>
              </form>

              <div className="overflow-auto" style={{ maxHeight: '380px' }}>
                {customers.length === 0 ? (
                  <div className="text-muted small text-center py-3">কোনো কাস্টমার নেই</div>
                ) : (
                  <div className="list-group list-group-flush">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCustomer(c)}
                        className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center rounded-3 mb-1 border-0 p-2 ${selectedCustomer?.id === c.id ? 'bg-success text-white' : 'bg-light'}`}
                      >
                        <div className="text-start">
                          <div className="fw-bold small">{c.name}</div>
                          {c.phone && <div className="small opacity-75" style={{ fontSize: '0.72rem' }}>{c.phone}</div>}
                        </div>
                        <span className={`badge ${selectedCustomer?.id === c.id ? 'bg-white text-dark' : 'bg-danger-subtle text-danger'}`}>
                          ৳{c.totalDue || 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-12 col-md-7">
            <div className="card shadow-sm border-0 rounded-4 p-3 bg-white h-100">
              {selectedCustomer ? (
                <>
                  <div className="d-flex justify-content-between align-items-center pb-2 border-bottom mb-2">
                    <div>
                      <h6 className="fw-bold mb-0">{selectedCustomer.name}</h6>
                      <small className="text-muted" style={{ fontSize: '0.75rem' }}>{selectedCustomer.phone || 'মোবাইল নেই'}</small>
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <div className="text-end">
                        <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>মোট বাকি</small>
                        <span className="fs-5 fw-bold text-danger">৳{selectedCustomer.totalDue || 0}</span>
                      </div>
                      <button 
                        className="btn btn-sm btn-outline-success rounded-pill px-2 py-1"
                        onClick={() => sendCustomerWhatsAppSlip(selectedCustomer)}
                        title="WhatsApp তাগাদা"
                      >
                        <i className="bi bi-whatsapp"></i>
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleDueTransaction} className="p-2 bg-light rounded-3 mb-2">
                    <div className="btn-group w-100 mb-2">
                      <button
                        type="button"
                        className={`btn btn-sm py-1 ${dueActionType === 'add_due' ? 'btn-danger' : 'btn-outline-danger'}`}
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setDueActionType('add_due')}
                      >
                        + নতুন বাকি
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm py-1 ${dueActionType === 'collect_due' ? 'btn-success' : 'btn-outline-success'}`}
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setDueActionType('collect_due')}
                      >
                        ✓ বাকি আদায়
                      </button>
                    </div>

                    <div className="row g-1">
                      <div className="col-6">
                        <input
                          type="number"
                          required
                          className="form-control form-control-sm rounded-3 py-1"
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
                      <div className="col-12 mt-1">
                        <button type="submit" className="btn btn-sm btn-dark w-100 rounded-3 py-1 fw-bold">
                          {dueActionType === 'add_due' ? 'বাকি লিপিবদ্ধ করুন' : 'আদায় সম্পন্ন করুন'}
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="flex-grow-1 overflow-auto" style={{ maxHeight: '200px' }}>
                    <span className="text-muted fw-bold d-block mb-1" style={{ fontSize: '0.7rem' }}>লেনদেন ইতিহাস</span>
                    {dueRecords.length === 0 ? (
                      <div className="text-muted small text-center py-2">কোনো ইতিহাস নেই</div>
                    ) : (
                      <div className="list-group list-group-flush">
                        {dueRecords.map(r => (
                          <div key={r.id} className="list-group-item px-1 py-1 d-flex justify-content-between align-items-center">
                            <div>
                              <span className={`badge me-1 ${r.type === 'add_due' ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'}`} style={{ fontSize: '0.65rem' }}>
                                {r.type === 'add_due' ? 'বাকি' : 'আদায়'}
                              </span>
                              <span className="small">{r.notes || (r.type === 'add_due' ? 'বাকি ক্রয়' : 'বাকি পরিশোধ')}</span>
                              <small className="text-muted ms-2" style={{ fontSize: '0.7rem' }}>{r.date}</small>
                            </div>
                            <span className={`fw-bold small ${r.type === 'add_due' ? 'text-danger' : 'text-success'}`}>
                              {r.type === 'add_due' ? `+৳${r.amount}` : `-৳${r.amount}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center text-muted py-4 small">কাস্টমার নির্বাচন করুন</div>
              )}
            </div>
          </div>
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

              {/* Basis Toggle: Margin-based vs Direct Cashflow */}
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

              {/* Expense Deductions Checkboxes */}
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

                    {/* Polyline for Sales */}
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

                    {/* Polyline for Profit */}
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

                    {/* Polyline for Expenses */}
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

                    {/* Dots */}
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
        /* History & Reports with From-To Date Filtering */
        <div className="card shadow-sm border-0 rounded-4 p-2 p-md-3 bg-white">
          <div className="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-2">
            <div>
              <h6 className="fw-bold mb-0 small">
                <i className="bi bi-table me-1 text-primary"></i> সমস্ত দিনের রিপোর্ট ({filteredAndSortedEntries.length})
              </h6>
              <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                {fromDate || toDate ? `ফিল্টার: ${fromDate || 'প্রথম'} হতে ${toDate || 'আজ'}` : 'হেডিংয়ে ক্লিক করে সর্ট করুন'}
              </small>
            </div>

            <div className="d-flex align-items-center gap-1">
              <select
                className="form-select form-select-sm py-0 px-2 rounded-pill"
                style={{ fontSize: '0.75rem' }}
                value={discrepancyFilter}
                onChange={(e) => setDiscrepancyFilter(e.target.value)}
              >
                <option value="all">সব রেকর্ড</option>
                <option value="mismatch">শুধুমাত্র গরমিল</option>
                <option value="perfect">নিখুঁত ক্যাশ (০ গরমিল)</option>
              </select>

              <button className="btn btn-sm btn-outline-primary rounded-pill px-2 py-1" style={{ fontSize: '0.75rem' }} onClick={exportToCSV}>
                <i className="bi bi-file-earmark-spreadsheet me-1"></i> CSV
              </button>
            </div>
          </div>

          <div className="table-responsive" style={{ maxHeight: '420px' }}>
            <table className="table table-hover table-sm align-middle text-center small">
              <thead className="table-light sticky-top">
                <tr style={{ cursor: 'pointer', userSelect: 'none' }}>
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
                    <td colSpan="7" className="py-4 text-muted">এই তারিখ রেঞ্জে কোনো রেকর্ড পাওয়া যায়নি</td>
                  </tr>
                ) : (
                  filteredAndSortedEntries.map((e) => (
                    <tr key={e.id} role="button" onClick={() => { setSelectedDate(e.date); setActiveTab('register'); }}>
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
                  ))
                )}
              </tbody>
            </table>
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
    </div>
  );
}
