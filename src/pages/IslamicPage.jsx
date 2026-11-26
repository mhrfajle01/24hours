import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PRAYERS_META = [
  { id: 'fajr', key: 'Fajr', name: 'Fajr', bn: 'ফজর', defaultTime: '05:05', icon: 'bi-sunrise' },
  { id: 'dhuhr', key: 'Dhuhr', name: 'Dhuhr', bn: 'যোহর', defaultTime: '11:55', icon: 'bi-sun' },
  { id: 'asr', key: 'Asr', name: 'Asr', bn: 'আসর', defaultTime: '15:35', icon: 'bi-cloud-sun' },
  { id: 'maghrib', key: 'Maghrib', name: 'Maghrib', bn: 'মাগরিব', defaultTime: '17:15', icon: 'bi-sunset' },
  { id: 'isha', key: 'Isha', name: 'Isha', bn: 'এশা', defaultTime: '18:35', icon: 'bi-moon-stars' }
];

const BD_CITIES = [
  { name: 'Dhaka', lat: 23.8103, lon: 90.4125 },
  { name: 'Chattogram', lat: 22.3569, lon: 91.7832 },
  { name: 'Sylhet', lat: 24.8949, lon: 91.8687 },
  { name: 'Rajshahi', lat: 24.3745, lon: 88.6042 },
  { name: 'Khulna', lat: 22.8456, lon: 89.5403 },
  { name: 'Barishal', lat: 22.7010, lon: 90.3535 },
  { name: 'Rangpur', lat: 25.7439, lon: 89.2752 },
  { name: 'Mymensingh', lat: 24.7471, lon: 90.4203 }
];

const DUAS = [
  { cat: 'hidayat', title: 'হিদায়াতের দোয়া', ar: 'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِن لَّدُنكَ رَحْمَةً', bn: 'হে আমাদের রব! সরল পথ দেখানোর পর আমাদের অন্তরকে বক্র করবেন না এবং আপনার নিকট থেকে আমাদের অনুগ্রহ দান করুন।', ref: 'সূরা আলে ইমরান: ৮' },
  { cat: 'knowledge', title: 'জ্ঞান বৃদ্ধির দোয়া', ar: 'رَبِّ زِدْنِي عِلْمًا', bn: 'হে আমার রব! আমার জ্ঞান বৃদ্ধি করে দিন।', ref: 'সূরা ত্বহা: ১১৪' },
  { cat: 'relief', title: 'পেরেশানি ও ঋণ থেকে মুক্তি', ar: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', bn: 'আল্লাহই আমাদের জন্য যথেষ্ট এবং তিনি কতই না উত্তম কর্মবিধায়ক।', ref: 'সূরা আলে ইমরান: ১৭৩' },
  { cat: 'kalyan', title: 'দুনিয়া ও আখিরাতের কল্যাণ', ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', bn: 'হে আমাদের রব! আমাদেরকে দুনিয়া ও আখিরাতে কল্যাণ দান করুন এবং জাহান্নামের শাস্তি থেকে বাঁচান।', ref: 'সূরা বাকারা: ২০১' },
  { cat: 'forgive', title: 'ক্ষমা ও মাগফিরাত', ar: 'رَبِّ إِنِّي ظَلَمْتُ نَفْسِي فَاغْفِرْ لِي', bn: 'হে আমার রব! নিশ্চয় আমি আমার নিজের ওপর অবিচার করেছি, সুতরাং আমাকে ক্ষমা করে দিন।', ref: 'সূরা কাসাস: ১৬' },
  { cat: 'parents', title: 'বাবা-মায়ের জন্য দোয়া', ar: 'رَّبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا', bn: 'হে আমার রব! তাঁদের উভয়ের প্রতি দয়া করুন, যেমন তাঁরা শৈশবে আমাকে লালন-পালন করেছেন।', ref: 'সূরা বনি ইসরাইল: ২৪' },
  { cat: 'relief', title: 'বিপদ মুক্তির দোয়া (ইউনুস আ.)', ar: 'لَّا إِلَٰهَ إِلَّا أَنتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ', bn: 'আপনি ছাড়া কোনো সত্য ইলাহ নেই, আপনি পবিত্র মহান! নিশ্চয় আমি জালিমদের অন্তর্ভুক্ত ছিলাম।', ref: 'সূরা আম্বিয়া: ৮৭' }
];

// Sound Generator using Web Audio API
const playTone = (type = 'click') => {
  try {
    const isMuted = localStorage.getItem('islamic_sound_muted') === 'true';
    if (isMuted) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'complete') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch {}
};

// Accurate Bangla Academy Revised Bangabda Date
const getBanglaDate = (d) => {
  const bdParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(d).split('-');
  const gy = parseInt(bdParts[0], 10);
  const gm = parseInt(bdParts[1], 10);
  const gd = parseInt(bdParts[2], 10);

  const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const bnMonths = ['বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন', 'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র'];
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const toBn = (n) => String(n).split('').map(c => bnDigits[c] || c).join('');

  // Month start dates in Gregorian calendar (Revised Bangla Academy)
  const starts = [
    [4, 14], [5, 15], [6, 15], [7, 16], [8, 16], [9, 16],
    [10, 17], [11, 16], [12, 16], [1, 15], [2, 14], [3, 15]
  ];
  const gDaysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let bnYear = gm > 4 || (gm === 4 && gd >= 14) ? gy - 593 : gy - 594;
  let mIdx = 0;
  for (let i = 0; i < 12; i++) {
    const [sm, sd] = starts[i];
    const [nm, nd] = starts[(i + 1) % 12];
    if ((gm === sm && gd >= sd) || (gm === nm && gd < nd) || (sm > nm && (gm > sm || gm < nm))) {
      mIdx = i;
      break;
    }
  }
  const [sm, sd] = starts[mIdx];
  let bnDay = gm === sm ? gd - sd + 1 : (gDaysInMonth[sm - 1] - sd + 1) + gd;
  return `${toBn(bnDay)} ${bnMonths[mIdx]} ${toBn(bnYear)} বঙ্গাব্দ`;
};

const fmt12h = (t24) => {
  if (!t24) return '';
  const [h, m] = t24.split(':');
  let hh = parseInt(h, 10);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${String(hh).padStart(2, '0')}:${m} ${ampm}`;
};

const getBDNow = (hijriOffset = 0) => {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
  const engDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);

  let hijriDate = '';
  try {
    const hijriTarget = new Date(now.getTime() + hijriOffset * 86400000);
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    }).formatToParts(hijriTarget);
    const day = parts.find(p => p.type === 'day')?.value;
    const monthNum = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10);
    const year = parts.find(p => p.type === 'year')?.value;
    const HIJRI_MONTHS_BN = [
      'মুহররম', 'সফর', 'রবিউল আউয়াল', 'রবিউস সানি',
      'জুমাদাল উলা', 'জুমাদাল আখিরাহ', 'রজব', 'শাবান',
      'রমজান', 'শাওয়াল', 'জিলকদ', 'জিলহজ'
    ];
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const toBn = (s) => String(s).split('').map(c => bnDigits[c] || c).join('');
    const mName = HIJRI_MONTHS_BN[(monthNum - 1 + 12) % 12] || 'মুহররম';
    hijriDate = `${toBn(day)} ${mName} ${toBn(year)} হিজরি`;
  } catch {
    hijriDate = new Intl.DateTimeFormat('en-u-ca-islamic', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  }

  const banglaDate = getBanglaDate(now);
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(now);
  return { timeStr, engDate, hijriDate, banglaDate, todayKey };
};

export default function IslamicPage({ currentUser, onBack }) {
  const [hijriOffset, setHijriOffset] = useState(() => Number(localStorage.getItem('islamic_hijri_offset')) || 0);
  const [bd, setBd] = useState(() => getBDNow(Number(localStorage.getItem('islamic_hijri_offset')) || 0));
  const [city, setCity] = useState(() => localStorage.getItem('islamic_city') || 'Dhaka');
  const [timings, setTimings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`islamic_timings_${getBDNow().todayKey}_${localStorage.getItem('islamic_city') || 'Dhaka'}`)) || null;
    } catch { return null; }
  });
  const [jamatTimes, setJamatTimes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('islamic_jamat_times')) || {}; } catch { return {}; }
  });
  const [editingJamat, setEditingJamat] = useState(null);
  const [jamatInput, setJamatInput] = useState('');

  // Salat Log: { [todayKey]: { fajr: 'jamat' | 'alone' | null, ... } }
  const [salatHistory, setSalatHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('islamic_salat_history')) || {}; } catch { return {}; }
  });

  // Daily Amol Tracker: { [todayKey]: { tahajjud, duha, quran, morningAzkar, eveningAzkar, muhasabaTongue, muhasabaEyes, sadaqah } }
  const [amolHistory, setAmolHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('islamic_amol_history')) || {}; } catch { return {}; }
  });

  // Qaza Umri: { fajr, dhuhr, asr, maghrib, isha, witr }
  const [qazaUmri, setQazaUmri] = useState(() => {
    try { return JSON.parse(localStorage.getItem('islamic_qaza_umri')) || { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 }; } catch { return { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 }; }
  });

  const [customDuas, setCustomDuas] = useState(() => {
    try { return JSON.parse(localStorage.getItem('islamic_custom_duas')) || []; } catch { return []; }
  });
  const [showAddDua, setShowAddDua] = useState(false);
  const [editingDuaId, setEditingDuaId] = useState(null);
  const [duaToDelete, setDuaToDelete] = useState(null);
  const [newDua, setNewDua] = useState({ title: '', ar: '', bn: '', ref: '', cat: 'hidayat', catLabel: '' });

  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'amol' | 'qaza' | 'tasbih' | 'report'
  const [reportRange, setReportRange] = useState('7'); // '7' | '30' | 'custom' | 'all'
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => getBDNow().todayKey);

  const changeDateBy = (days) => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + days);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const targetKey = `${y}-${m}-${d}`;
    if (targetKey > bd.todayKey) return;
    setSelectedDate(targetKey);
  };

  const [tasbihCount, setTasbihCount] = useState(0);
  const [tasbihTarget, setTasbihTarget] = useState(33);
  const [tasbihLabel, setTasbihLabel] = useState('SubhanAllah (সুবহানাল্লাহ)');
  const [duaIdx, setDuaIdx] = useState(0);
  const [duaCategory, setDuaCategory] = useState('all'); // 'all' | 'hidayat' | 'relief' | 'forgive' | 'parents'
  const [copiedDua, setCopiedDua] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('islamic_sound_muted') === 'true');
  const [tasbihAnim, setTasbihAnim] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setBd(getBDNow(hijriOffset)), 1000);
    return () => clearInterval(t);
  }, [hijriOffset]);

  // Fetch accurate location-wise prayer times from Aladhan API (Method 1 = Karachi / BD)
  useEffect(() => {
    const cObj = BD_CITIES.find(c => c.name === city) || BD_CITIES[0];
    const cacheKey = `islamic_timings_${bd.todayKey}_${city}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached) { setTimings(cached); return; }
    } catch {}

    if (!navigator.onLine) return;
    fetch(`https://api.aladhan.com/v1/timings?latitude=${cObj.lat}&longitude=${cObj.lon}&method=1`)
      .then(r => r.json())
      .then(res => {
        if (res?.data?.timings) {
          setTimings(res.data.timings);
          try { localStorage.setItem(cacheKey, JSON.stringify(res.data.timings)); } catch {}
        }
      })
      .catch(() => {});
  }, [city, bd.todayKey]);

  // Sync Jamat times, Salat history & City from Firestore on mount
  useEffect(() => {
    if (!currentUser?.uid || !navigator.onLine) return;
    getDoc(doc(db, 'islamicHub', currentUser.uid)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.city) { setCity(d.city); localStorage.setItem('islamic_city', d.city); }
      if (typeof d.hijriOffset === 'number') { setHijriOffset(d.hijriOffset); localStorage.setItem('islamic_hijri_offset', String(d.hijriOffset)); }
      if (d.jamatTimes) { setJamatTimes(d.jamatTimes); localStorage.setItem('islamic_jamat_times', JSON.stringify(d.jamatTimes)); }
      if (d.salatHistory) { setSalatHistory(d.salatHistory); localStorage.setItem('islamic_salat_history', JSON.stringify(d.salatHistory)); }
      if (d.amolHistory) { setAmolHistory(d.amolHistory); localStorage.setItem('islamic_amol_history', JSON.stringify(d.amolHistory)); }
      if (d.qazaUmri) { setQazaUmri(d.qazaUmri); localStorage.setItem('islamic_qaza_umri', JSON.stringify(d.qazaUmri)); }
      if (d.customDuas) { setCustomDuas(d.customDuas); localStorage.setItem('islamic_custom_duas', JSON.stringify(d.customDuas)); }
    }).catch(() => {});
  }, [currentUser?.uid]);

  const syncToCloud = (patch) => {
    if (!currentUser?.uid || !navigator.onLine) return;
    setDoc(doc(db, 'islamicHub', currentUser.uid), { ...patch, updatedAt: Date.now() }, { merge: true }).catch(() => {});
  };

  const todayLog = salatHistory[selectedDate] || {};
  const todayAmol = amolHistory[selectedDate] || {};

  const toggleAmol = (key) => {
    const nextVal = !todayAmol[key];
    const nextDay = { ...todayAmol, [key]: nextVal };
    const nextHist = { ...amolHistory, [selectedDate]: nextDay };
    setAmolHistory(nextHist);
    playTone(nextVal ? 'success' : 'click');
    try { localStorage.setItem('islamic_amol_history', JSON.stringify(nextHist)); } catch {}
    syncToCloud({ amolHistory: nextHist });
  };

  const updateQaza = (key, delta) => {
    const nextVal = Math.max(0, (qazaUmri[key] || 0) + delta);
    const next = { ...qazaUmri, [key]: nextVal };
    setQazaUmri(next);
    playTone(delta < 0 ? 'success' : 'click');
    try { localStorage.setItem('islamic_qaza_umri', JSON.stringify(next)); } catch {}
    syncToCloud({ qazaUmri: next });
  };

  const setPrayerStatus = (id, status) => {
    const nextVal = todayLog[id] === status ? null : status;
    const nextDay = { ...todayLog, [id]: nextVal };
    const nextHist = { ...salatHistory, [selectedDate]: nextDay };
    setSalatHistory(nextHist);
    playTone(nextVal ? 'success' : 'click');
    try { localStorage.setItem('islamic_salat_history', JSON.stringify(nextHist)); } catch {}
    syncToCloud({ salatHistory: nextHist });
  };

  const saveJamatTime = (e) => {
    e.preventDefault();
    if (!editingJamat) return;
    const next = { ...jamatTimes, [editingJamat]: jamatInput };
    setJamatTimes(next);
    try { localStorage.setItem('islamic_jamat_times', JSON.stringify(next)); } catch {}
    syncToCloud({ jamatTimes: next });
    setEditingJamat(null);
  };

  // Report Stats (Today & Last 7 Days)
  const jamatToday = PRAYERS_META.filter(p => todayLog[p.id] === 'jamat').length;
  const aloneToday = PRAYERS_META.filter(p => todayLog[p.id] === 'alone').length;
  const pendingToday = 5 - jamatToday - aloneToday;

  let weekJamat = 0, weekAlone = 0;
  Object.values(salatHistory).slice(-7).forEach(day => {
    Object.values(day || {}).forEach(st => {
      if (st === 'jamat') weekJamat++;
      else if (st === 'alone') weekAlone++;
    });
  });

  // Dynamic Filtering for Dashboard Report
  const getFilteredDates = () => {
    const allDates = Array.from(new Set([...Object.keys(salatHistory), ...Object.keys(amolHistory), bd.todayKey])).sort();
    if (reportRange === '7') return allDates.slice(-7);
    if (reportRange === '30') return allDates.slice(-30);
    if (reportRange === 'custom') {
      return allDates.filter(d => (!reportStartDate || d >= reportStartDate) && (!reportEndDate || d <= reportEndDate));
    }
    return allDates;
  };

  const filteredDates = getFilteredDates();
  let filterJamat = 0, filterAlone = 0, filterTotalSalat = filteredDates.length * 5;
  let filterTahajjud = 0, filterQuran = 0, filterAzkar = 0, filterMuhasaba = 0;

  filteredDates.forEach(dKey => {
    const sDay = salatHistory[dKey] || {};
    Object.values(sDay).forEach(st => {
      if (st === 'jamat') filterJamat++;
      else if (st === 'alone') filterAlone++;
    });
    const aDay = amolHistory[dKey] || {};
    if (aDay.tahajjud) filterTahajjud++;
    if (aDay.quran) filterQuran++;
    if (aDay.morningAzkar || aDay.eveningAzkar) filterAzkar++;
    if (aDay.muhasabaTongue && aDay.muhasabaEyes) filterMuhasaba++;
  });

  const totalPrayed = filterJamat + filterAlone;
  const salatRate = filterTotalSalat > 0 ? Math.round((totalPrayed / filterTotalSalat) * 100) : 0;
  const jamatRate = totalPrayed > 0 ? Math.round((filterJamat / totalPrayed) * 100) : 0;

  const handleTasbihTap = () => {
    if (navigator.vibrate) navigator.vibrate(18);
    setTasbihAnim(true);
    setTimeout(() => setTasbihAnim(false), 150);
    const nextCount = tasbihCount + 1 > tasbihTarget ? 1 : tasbihCount + 1;
    if (nextCount === tasbihTarget) {
      playTone('complete');
    } else {
      playTone('click');
    }
    setTasbihCount(nextCount);
  };

  const allDuas = [...DUAS, ...customDuas];
  const activeDuas = duaCategory === 'all' ? allDuas : allDuas.filter(d => d.cat === duaCategory);
  const dua = activeDuas[duaIdx % activeDuas.length] || allDuas[0];

  const handleCopyDua = () => {
    if (!navigator.clipboard || !dua) return;
    const text = `${dua.title}\n\n${dua.ar || ''}\n${dua.bn || ''}\n(${dua.ref || ''})`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedDua(true);
      playTone('success');
      setTimeout(() => setCopiedDua(false), 2000);
    }).catch(() => {});
  };

  const handleSaveCustomDua = (e) => {
    e.preventDefault();
    if (!newDua.title || !newDua.bn) return;
    const finalCat = newDua.cat === 'custom' ? (newDua.catLabel?.trim() ? newDua.catLabel.trim().toLowerCase().replace(/\s+/g, '_') : 'personal') : newDua.cat;

    if (editingDuaId) {
      const nextList = customDuas.map(d => d.id === editingDuaId ? {
        ...d,
        title: newDua.title.trim(),
        ar: newDua.ar?.trim() || '',
        bn: newDua.bn.trim(),
        ref: newDua.ref?.trim() || 'নিজস্ব দোয়া',
        cat: finalCat,
        catLabel: newDua.cat === 'custom' ? (newDua.catLabel?.trim() || 'বিশেষ দোয়া') : undefined
      } : d);
      setCustomDuas(nextList);
      try { localStorage.setItem('islamic_custom_duas', JSON.stringify(nextList)); } catch {}
      syncToCloud({ customDuas: nextList });
      setEditingDuaId(null);
    } else {
      const duaToAdd = {
        id: `dua_${Date.now()}`,
        title: newDua.title.trim(),
        ar: newDua.ar?.trim() || '',
        bn: newDua.bn.trim(),
        ref: newDua.ref?.trim() || 'নিজস্ব দোয়া',
        cat: finalCat,
        catLabel: newDua.cat === 'custom' ? (newDua.catLabel?.trim() || 'বিশেষ দোয়া') : undefined
      };
      const nextList = [duaToAdd, ...customDuas];
      setCustomDuas(nextList);
      try { localStorage.setItem('islamic_custom_duas', JSON.stringify(nextList)); } catch {}
      syncToCloud({ customDuas: nextList });
    }

    setNewDua({ title: '', ar: '', bn: '', ref: '', cat: 'hidayat', catLabel: '' });
    setShowAddDua(false);
    setDuaCategory(finalCat);
    setDuaIdx(0);
    playTone('success');
  };

  const startEditDua = (d) => {
    setEditingDuaId(d.id);
    setNewDua({
      title: d.title,
      ar: d.ar || '',
      bn: d.bn,
      ref: d.ref || '',
      cat: ['hidayat', 'relief', 'forgive', 'parents', 'kalyan'].includes(d.cat) ? d.cat : 'custom',
      catLabel: d.catLabel || ''
    });
    setShowAddDua(true);
  };

  const confirmDeleteDua = () => {
    if (!duaToDelete) return;
    const nextList = customDuas.filter(d => d.id !== duaToDelete.id);
    setCustomDuas(nextList);
    try { localStorage.setItem('islamic_custom_duas', JSON.stringify(nextList)); } catch {}
    syncToCloud({ customDuas: nextList });
    setDuaToDelete(null);
    setDuaIdx(0);
    playTone('click');
  };

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #F0FDF4 0%, #F8FAFC 100%)', color: '#0F172A', paddingBottom: 40 }}>
      {/* Light Theme Sticky Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #D1FAE5', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} type="button" style={{ border: '1px solid #D1FAE5', background: '#ECFDF5', color: '#065F46', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="bi bi-chevron-left" />
          </button>
          <div>
            <h5 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#065F46' }}>🕌 Islamic Hub</h5>
            <select
              value={city}
              onChange={e => { setCity(e.target.value); localStorage.setItem('islamic_city', e.target.value); syncToCloud({ city: e.target.value }); }}
              style={{ border: 'none', background: 'transparent', color: '#059669', fontSize: 11, fontWeight: 700, padding: 0, outline: 'none', cursor: 'pointer' }}
            >
              {BD_CITIES.map(c => <option key={c.name} value={c.name}>📍 {c.name}, BD</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ textAlign: 'right' }} className="d-none d-sm-block">
            <div style={{ fontWeight: 800, fontSize: 13, color: '#065F46', fontVariantNumeric: 'tabular-nums' }}>{bd.timeStr}</div>
            <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>GMT+6</div>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title="ইসলামিক সেটিংস"
            style={{
              border: '1px solid #D1FAE5',
              background: '#ECFDF5',
              color: '#065F46',
              borderRadius: '50%',
              width: 36,
              height: 36,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16
            }}
          >
            <i className="bi bi-gear" />
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '14px' }}>
        {/* Triple Calendar Card: English + Arabic Hijri + Bangla */}
        <div style={{ background: '#fff', border: '1px solid #D1FAE5', borderRadius: 16, padding: '14px 16px', marginBottom: 14, boxShadow: '0 4px 15px rgba(5,150,105,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>আজকের তারিখ (বাংলাদেশ)</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>📅 {bd.engDate}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 6, fontSize: 13.5, fontWeight: 700, alignItems: 'center', fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif" }}>
            <span style={{ color: '#D97706' }}>🌙 {bd.hijriDate}</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEF3C7', borderRadius: 8, padding: '2px 6px' }}>
              {[-1, 0, 1].map(off => (
                <button
                  key={off}
                  type="button"
                  onClick={() => {
                    setHijriOffset(off);
                    localStorage.setItem('islamic_hijri_offset', String(off));
                    syncToCloud({ hijriOffset: off });
                  }}
                  style={{
                    border: 'none',
                    borderRadius: 6,
                    padding: '2px 6px',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: hijriOffset === off ? '#D97706' : 'transparent',
                    color: hijriOffset === off ? '#fff' : '#B45309'
                  }}
                >
                  {off === 0 ? 'Auto' : off > 0 ? '+1d' : '-1d'}
                </button>
              ))}
            </div>
            <span style={{ color: '#059669' }}>🌿 {bd.banglaDate}</span>
          </div>
        </div>

        {/* Top Prominent Dua Section (Hero Card - Mobile Responsive) */}
        <div style={{ background: 'linear-gradient(135deg, #FFFBEB 0%, #ECFDF5 100%)', border: '1px solid #FDE68A', borderRadius: 16, padding: '14px 16px', marginBottom: 14, boxShadow: '0 4px 15px rgba(217,119,6,0.06)' }}>
          {/* Row 1: Category badge + Counter + Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#B45309', background: '#FEF3C7', padding: '3px 8px', borderRadius: 8 }}>
                🤲 {activeDuas.length > 0 ? (dua.catLabel || dua.cat.toUpperCase()) : 'দোয়া'}
              </span>
              <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>
                ({activeDuas.length > 0 ? (duaIdx % activeDuas.length) + 1 : 0}/{activeDuas.length})
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleCopyDua}
                title="দোয়া কপি করুন"
                style={{ background: '#fff', border: '1px solid #CBD5E1', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700, color: copiedDua ? '#059669' : '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <i className={`bi ${copiedDua ? 'bi-check-lg' : 'bi-clipboard'}`} />
                <span className="d-none d-sm-inline">{copiedDua ? 'কপি হয়েছে' : 'কপি'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setDuaIdx(i => i + 1); playTone('click'); }}
                style={{ background: '#059669', border: 'none', color: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span>পরের দোয়া</span>
                <i className="bi bi-arrow-right" />
              </button>
            </div>
          </div>

          {/* Row 2: Full-width Unbreakable Title */}
          <div style={{ fontSize: 15, fontWeight: 800, color: '#B45309', marginBottom: 10, lineHeight: 1.4 }}>
            {dua.title}
          </div>

          {/* Row 3: Category Filter Pills + Add Dua button */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 6, marginBottom: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowAddDua(true)}
              style={{
                border: '1px dashed #059669',
                borderRadius: 12,
                padding: '3px 8px',
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: '#ECFDF5',
                color: '#065F46',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <i className="bi bi-plus-lg" />
              <span>দোয়া যোগ</span>
            </button>
            {[
              { id: 'all', label: 'সব দোয়া' },
              { id: 'hidayat', label: '🌿 হিদায়াত' },
              { id: 'relief', label: '🛡️ পেরেশানি' },
              { id: 'forgive', label: '🤲 মাগফিরাত' },
              { id: 'parents', label: '👨‍👩‍👧 মা-বাবা' },
              { id: 'kalyan', label: '✨ কল্যাণ' },
              ...customDuas.filter(d => d.catLabel).map(d => ({ id: d.cat, label: `⭐ ${d.catLabel}` }))
            ].reduce((acc, curr) => (acc.some(x => x.id === curr.id) ? acc : [...acc, curr]), []).map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setDuaCategory(cat.id); setDuaIdx(0); playTone('click'); }}
                style={{
                  border: 'none',
                  borderRadius: 12,
                  padding: '3px 9px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: duaCategory === cat.id ? '#D97706' : '#fff',
                  color: duaCategory === cat.id ? '#fff' : '#64748B',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Dua Content */}
          {dua.ar && (
            <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'right', color: '#0F172A', marginBottom: 8, lineHeight: 1.7, direction: 'rtl', fontFamily: "'Amiri', 'Traditional Arabic', serif" }}>
              {dua.ar}
            </div>
          )}
          <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, marginBottom: 4, fontWeight: 600 }}>
            {dua.bn}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px dashed #FDE68A' }}>
            <div style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>
              📖 {dua.ref}
            </div>
            {dua.id && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => startEditDua(dua)}
                  style={{ border: 'none', background: '#FEF3C7', color: '#B45309', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <i className="bi bi-pencil" />
                  <span>এডিট</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDuaToDelete(dua)}
                  style={{ border: 'none', background: '#FEE2E2', color: '#DC2626', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <i className="bi bi-trash" />
                  <span>মুছুন</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Date Selector & Past Navigation Bar */}
        <div style={{ background: '#fff', border: '1px solid #D1FAE5', borderRadius: 14, padding: '8px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => changeDateBy(-1)}
              style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#065F46' }}
            >
              <i className="bi bi-chevron-left" />
            </button>
            <input
              type="date"
              value={selectedDate}
              max={bd.todayKey}
              onChange={e => {
                if (e.target.value && e.target.value <= bd.todayKey) {
                  setSelectedDate(e.target.value);
                }
              }}
              style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: '4px 8px', fontSize: 13, fontWeight: 700, color: '#1E293B', outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => changeDateBy(1)}
              disabled={selectedDate >= bd.todayKey}
              style={{
                border: '1px solid #E2E8F0',
                background: selectedDate >= bd.todayKey ? '#F1F5F9' : '#F8FAFC',
                borderRadius: 8,
                width: 32,
                height: 32,
                cursor: selectedDate >= bd.todayKey ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: selectedDate >= bd.todayKey ? '#94A3B8' : '#065F46',
                opacity: selectedDate >= bd.todayKey ? 0.4 : 1
              }}
            >
              <i className="bi bi-chevron-right" />
            </button>
          </div>
          {selectedDate !== bd.todayKey && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: 6, fontWeight: 700 }}>
                পূর্বের তারিখ এন্ট্রি
              </span>
              <button
                type="button"
                onClick={() => setSelectedDate(bd.todayKey)}
                style={{
                  border: 'none',
                  background: '#059669',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                আজকে ফিরে যান
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { id: 'daily', label: '🕌 সালাত ও ওয়াক্ত', icon: 'bi-clock' },
            { id: 'amol', label: '📿 আমল ও মুহাসাবা', icon: 'bi-check2-circle' },
            { id: 'qaza', label: '⏳ কাযা ট্র্যাকার', icon: 'bi-arrow-counterclockwise' },
            { id: 'tasbih', label: '🤲 তাসবিহ', icon: 'bi-fingerprint' },
            { id: 'report', label: '📊 ড্যাশবোর্ড রিপোর্ট', icon: 'bi-graph-up' }
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: '1 0 auto',
                padding: '9px 10px',
                borderRadius: 12,
                border: activeTab === t.id ? '1px solid #10B981' : '1px solid #E2E8F0',
                background: activeTab === t.id ? '#059669' : '#fff',
                color: activeTab === t.id ? '#fff' : '#475569',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
                boxShadow: activeTab === t.id ? '0 2px 8px rgba(5,150,105,0.2)' : 'none'
              }}
            >
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {activeTab === 'daily' && (
          <>
            {/* Salat Report Dashboard (Jamat vs Alone) */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '14px 16px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: '#065F46' }}>📊 সালাত রিপোর্ট ড্যাশবোর্ড</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>সাপ্তাহিক: 🕌 {weekJamat} | 🧍 {weekAlone}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{jamatToday}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#065F46' }}>🕌 জামাত</div>
                </div>
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB' }}>{aloneToday}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF' }}>🧍 একাকী</div>
                </div>
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#64748B' }}>{pendingToday}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>⏳ বাকি</div>
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 8, background: '#F1F5F9', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${(jamatToday / 5) * 100}%`, background: '#10B981', transition: 'width 0.3s' }} />
                <div style={{ width: `${(aloneToday / 5) * 100}%`, background: '#3B82F6', transition: 'width 0.3s' }} />
              </div>
            </div>

            {/* Location-wise Prayer Times + Custom Jamat Time + Jamat/Alone Tracker */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '14px 16px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#065F46', marginBottom: 10 }}>
                🕰️ নামাজের সময়সূচী ও জামাত সেটআপ ({city})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PRAYERS_META.map(p => {
                  const waqtTime = timings?.[p.key] ? timings[p.key].split(' ')[0] : p.defaultTime;
                  const jTime = jamatTimes[p.id];
                  const st = todayLog[p.id];
                  return (
                    <div key={p.id} style={{ padding: '10px 12px', borderRadius: 12, border: st ? '1px solid #10B981' : '1px solid #E2E8F0', background: st === 'jamat' ? '#ECFDF5' : st === 'alone' ? '#EFF6FF' : '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className={`bi ${p.icon}`} style={{ fontSize: 17, color: st === 'jamat' ? '#059669' : st === 'alone' ? '#2563EB' : '#64748B' }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{p.bn} <span style={{ fontSize: 12, color: '#64748B' }}>({fmt12h(waqtTime)})</span></div>
                          <button
                            type="button"
                            onClick={() => { setEditingJamat(p.id); setJamatInput(jTime || waqtTime); }}
                            style={{ background: 'transparent', border: 'none', padding: 0, fontSize: 11, color: '#D97706', fontWeight: 700, cursor: 'pointer' }}
                          >
                            {jTime ? `🕌 জামাত: ${fmt12h(jTime)} ✏️` : '+ জামাতের সময় সেট করুন'}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setPrayerStatus(p.id, 'jamat')}
                          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #A7F3D0', background: st === 'jamat' ? '#059669' : '#fff', color: st === 'jamat' ? '#fff' : '#065F46', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          🕌 জামাত
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrayerStatus(p.id, 'alone')}
                          style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #BFDBFE', background: st === 'alone' ? '#2563EB' : '#fff', color: st === 'alone' ? '#fff' : '#1E40AF', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >
                          🧍 একাকী
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'amol' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
            {/* Daily Nofol & Azkar */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: '#065F46' }}>🌟 নফল ইবাদত ও তিলাওয়াত</span>
                <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>
                  {[todayAmol.tahajjud, todayAmol.duha, todayAmol.quran, todayAmol.morningAzkar, todayAmol.eveningAzkar].filter(Boolean).length} / 5 সম্পন্ন
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'tahajjud', title: 'তাহাজ্জুদ সালাত (Qiyam-ul-layl)', icon: 'bi-moon-stars', desc: 'রাতের শেষ তৃতীয়াংশের বিশেষ নৈকট্য' },
                  { key: 'duha', title: 'ইশরাক / চাশত সালাত (Duha)', icon: 'bi-brightness-high', desc: 'সূর্যোদয়ের পর শরীরের প্রতিটি জোড়ের সদকা' },
                  { key: 'quran', title: 'কুরআন মাজিদ তিলাওয়াত ও তাদাব্বুর', icon: 'bi-book', desc: 'কমপক্ষে ১ পৃষ্ঠা অর্থসহ অনুধাবন' },
                  { key: 'morningAzkar', title: 'সকালের মাসনুন আজকার', icon: 'bi-sunrise-fill', desc: 'হেফাজত ও বরকতের দোয়া' },
                  { key: 'eveningAzkar', title: 'সন্ধ্যার মাসনুন আজকার', icon: 'bi-sunset-fill', desc: 'সন্ধ্যা ও রাত্রিকালীন জিকির' }
                ].map(item => {
                  const done = !!todayAmol[item.key];
                  return (
                    <div
                      key={item.key}
                      onClick={() => toggleAmol(item.key)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: done ? '1px solid #10B981' : '1px solid #E2E8F0',
                        background: done ? '#ECFDF5' : '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <i className={`bi ${item.icon}`} style={{ fontSize: 18, color: done ? '#059669' : '#94A3B8' }} />
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: done ? '#065F46' : '#1E293B' }}>{item.title}</div>
                          <div style={{ fontSize: 11, color: '#64748B' }}>{item.desc}</div>
                        </div>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', border: done ? 'none' : '2px solid #CBD5E1', background: done ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>
                        {done && <i className="bi bi-check-lg" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Daily Muhasaba (Self-Check for Hidayat) */}
            <div style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: 16, padding: '16px', boxShadow: '0 2px 10px rgba(217,119,6,0.05)' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#B45309', marginBottom: 12 }}>
                ⚖️ আত্মশুদ্ধি ও মুহাসাবা (Self Reflection)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'muhasabaTongue', title: 'মুখ ও জিহ্বার হেফাজত', desc: 'গীবত, মিথ্যা ও অনর্থক কথা থেকে মুক্ত ছিলাম' },
                  { key: 'muhasabaEyes', title: 'চোখ ও মনের হেফাজত', desc: 'হারাম দৃষ্টি ও অশালীন ডিজিটাল কনটেন্ট থেকে দূরে ছিলাম' },
                  { key: 'sadaqah', title: 'সদকা ও ভালো ব্যবহার', desc: 'কাউকে সাহায্য করা বা মুখে স্মিত হাসি উপহার দেওয়া' },
                  { key: 'tawbah', title: 'দিনের শেষে ইস্তিগফার ও তওবা', desc: 'খাঁটি অন্তরে আল্লাহর কাছে ক্ষমা প্রার্থনা করেছি' }
                ].map(item => {
                  const done = !!todayAmol[item.key];
                  return (
                    <div
                      key={item.key}
                      onClick={() => toggleAmol(item.key)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: done ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                        background: done ? '#FFFBEB' : '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: done ? '#B45309' : '#1E293B' }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>{item.desc}</div>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: 6, border: done ? 'none' : '2px solid #CBD5E1', background: done ? '#F59E0B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>
                        {done && <i className="bi bi-check" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'qaza' && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '16px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: '#065F46' }}>⏳ কাযা উমরি ট্র্যাকার</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444' }}>
                মোট কাযা: {Object.values(qazaUmri).reduce((a, b) => a + (Number(b) || 0), 0)} ওয়াক্ত
              </span>
            </div>
            <p style={{ fontSize: 11.5, color: '#64748B', margin: '0 0 14px', lineHeight: 1.4 }}>
              অতীতের ছুটে যাওয়া ওয়াক্ত হিসেব রাখুন এবং প্রতিবার কাযা আদায়ের পর <b>-১</b> এ ক্লিক করে কমিয়ে আনুন।
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {[
                { key: 'fajr', bn: 'ফজর' },
                { key: 'dhuhr', bn: 'যোহর' },
                { key: 'asr', bn: 'আসর' },
                { key: 'maghrib', bn: 'মাগরিব' },
                { key: 'isha', bn: 'এশা' },
                { key: 'witr', bn: 'বিতর' }
              ].map(q => {
                const count = qazaUmri[q.key] || 0;
                return (
                  <div key={q.key} style={{ padding: '10px', borderRadius: 12, border: '1px solid #E2E8F0', background: '#F8FAFC', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>{q.bn}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: count > 0 ? '#DC2626' : '#059669', marginBottom: 8 }}>{count}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => updateQaza(q.key, -1)}
                        disabled={count <= 0}
                        style={{ width: 32, height: 28, borderRadius: 6, border: '1px solid #CBD5E1', background: '#fff', color: '#10B981', fontWeight: 800, cursor: count <= 0 ? 'not-allowed' : 'pointer', opacity: count <= 0 ? 0.4 : 1 }}
                      >
                        -১
                      </button>
                      <button
                        type="button"
                        onClick={() => updateQaza(q.key, 1)}
                        style={{ width: 32, height: 28, borderRadius: 6, border: '1px solid #CBD5E1', background: '#fff', color: '#DC2626', fontWeight: 800, cursor: 'pointer' }}
                      >
                        +১
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '16px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            {/* Range Filters */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#065F46' }}>📈 আমল ও সালাত অ্যানালিটিক্স</span>
              <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', borderRadius: 8, padding: 3, overflowX: 'auto', maxWidth: '100%' }}>
                {[
                  { id: '7', label: '৭ দিন' },
                  { id: '30', label: '৩০ দিন' },
                  { id: 'custom', label: 'কাস্টম' },
                  { id: 'all', label: 'সব' }
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReportRange(r.id)}
                    style={{
                      border: 'none',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      background: reportRange === r.id ? '#059669' : 'transparent',
                      color: reportRange === r.id ? '#fff' : '#64748B'
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range Selector (Mobile Optimized Card) */}
            {reportRange === 'custom' && (
              <div style={{ marginBottom: 14, padding: '10px 12px', background: '#F8FAFC', borderRadius: 12, border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="bi bi-calendar-range" />
                  <span>তারিখ পরিসীমা নির্ধারণ করুন</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, alignItems: 'center' }}>
                  <div>
                    <label style={{ fontSize: 10, color: '#64748B', display: 'block', marginBottom: 2 }}>শুরুর তারিখ (From)</label>
                    <input
                      type="date"
                      value={reportStartDate}
                      max={reportEndDate || bd.todayKey}
                      onChange={e => setReportStartDate(e.target.value)}
                      style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '5px 8px', fontSize: 12, fontWeight: 600, color: '#1E293B', background: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#64748B', display: 'block', marginBottom: 2 }}>শেষ তারিখ (To)</label>
                    <input
                      type="date"
                      value={reportEndDate}
                      min={reportStartDate}
                      max={bd.todayKey}
                      onChange={e => setReportEndDate(e.target.value)}
                      style={{ width: '100%', border: '1px solid #CBD5E1', borderRadius: 8, padding: '5px 8px', fontSize: 12, fontWeight: 600, color: '#1E293B', background: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                {(!reportStartDate || !reportEndDate) && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#D97706', fontWeight: 600 }}>
                    💡 শুরুর এবং শেষ তারিখ নির্বাচন করুন
                  </div>
                )}
              </div>
            )}

            {/* Performance Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{salatRate}%</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#065F46' }}>সালাত পালনের হার</div>
                <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{totalPrayed}/{filterTotalSalat} ওয়াক্ত</div>
              </div>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB' }}>{jamatRate}%</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF' }}>তাকবীরে উলা/জামাত</div>
                <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{filterJamat} ওয়াক্ত জামাত</div>
              </div>
              <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#D97706' }}>{filterQuran} দিন</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309' }}>কুরআন তিলাওয়াত</div>
                <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>ধারাবাহিকতা</div>
              </div>
              <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#7C3AED' }}>{filterTahajjud} দিন</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#5B21B6' }}>তাহাজ্জুদ সালাত</div>
                <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>আল্লাহর নৈকট্য</div>
              </div>
            </div>

            {/* Daily History Heatmap / Log Table */}
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 8 }}>
                🗓️ বিগত দিনের আমল লগ ({filteredDates.length} দিন)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {filteredDates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 8px', color: '#94A3B8', fontSize: 12 }}>
                    <i className="bi bi-info-circle" style={{ fontSize: 16, display: 'block', marginBottom: 4 }} />
                    নির্বাচিত কাস্টম তারিখে কোনো আমল রেকর্ড পাওয়া যায়নি
                  </div>
                ) : (
                  filteredDates.slice().reverse().map(dKey => {
                    const s = salatHistory[dKey] || {};
                    const a = amolHistory[dKey] || {};
                    const jCount = Object.values(s).filter(v => v === 'jamat').length;
                    const aCount = Object.values(s).filter(v => v === 'alone').length;
                    const amolDone = [a.tahajjud, a.duha, a.quran, a.morningAzkar, a.eveningAzkar].filter(Boolean).length;
                    return (
                      <div key={dKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: '#1E293B', fontVariantNumeric: 'tabular-nums' }}>{dKey}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: '#059669', fontWeight: 700 }}>🕌 {jCount}</span>
                          <span style={{ color: '#2563EB', fontWeight: 700 }}>🧍 {aCount}</span>
                          <span style={{ color: '#D97706', fontWeight: 700 }}>📖 {amolDone}/5 আমল</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasbih' && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '16px', marginBottom: 14, textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#065F46', marginBottom: 8 }}>📿 ডিজিটাল তাসবিহ কাউন্টার</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { label: 'SubhanAllah (সুবহানাল্লাহ)', target: 33 },
                { label: 'Alhamdulillah (আলহামদুলিল্লাহ)', target: 33 },
                { label: 'AllahuAkbar (আল্লাহু আকবার)', target: 34 },
                { label: 'Astaghfirullah (আস্তাগফিরুল্লাহ)', target: 100 }
              ].map(z => (
                <button
                  key={z.label}
                  type="button"
                  onClick={() => { setTasbihLabel(z.label); setTasbihTarget(z.target); setTasbihCount(0); }}
                  style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid #D1FAE5', background: tasbihLabel === z.label ? '#059669' : '#ECFDF5', color: tasbihLabel === z.label ? '#fff' : '#065F46', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  {z.label.split(' ')[0]} ({z.target})
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 12 }}>{tasbihLabel}</div>
            <button
              type="button"
              onClick={handleTasbihTap}
              style={{
                width: 124,
                height: 124,
                borderRadius: '50%',
                border: '4px solid #10B981',
                background: 'linear-gradient(135deg, #ECFDF5, #D1FAE5)',
                color: '#065F46',
                fontSize: 32,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: tasbihAnim ? '0 0 35px rgba(16,185,129,0.5)' : '0 8px 25px rgba(16,185,129,0.25)',
                transform: tasbihAnim ? 'scale(0.92)' : 'scale(1)',
                transition: 'transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {tasbihCount}
              <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>/ {tasbihTarget}</div>
            </button>
            <div style={{ marginTop: 14 }}>
              <button type="button" onClick={() => setTasbihCount(0)} style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 8, color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '5px 12px' }}>
                ↺ রিসেট করুন
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Islamic Settings Modal */}
      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, maxHeight: '90dvh', overflowY: 'auto', background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #E2E8F0', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="bi bi-gear-fill" style={{ fontSize: 18, color: '#059669' }} />
                <h6 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#065F46' }}>ইসলামিক পেজ সেটিংস</h6>
              </div>
              <button type="button" onClick={() => setShowSettings(false)} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
                <i className="bi bi-x-lg" />
              </button>
            </div>

            {/* City Selection */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>📍 বর্তমান জেলা / শহর</label>
              <select
                value={city}
                onChange={e => { setCity(e.target.value); localStorage.setItem('islamic_city', e.target.value); syncToCloud({ city: e.target.value }); }}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: 13, fontWeight: 600, background: '#F8FAFC' }}
              >
                {BD_CITIES.map(c => <option key={c.name} value={c.name}>{c.name}, Bangladesh</option>)}
              </select>
            </div>

            {/* Hijri Date Offset */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>🌙 হিজরি তারিখ অ্যাডজাস্টমেন্ট</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[-2, -1, 0, 1, 2].map(off => (
                  <button
                    key={off}
                    type="button"
                    onClick={() => {
                      setHijriOffset(off);
                      localStorage.setItem('islamic_hijri_offset', String(off));
                      syncToCloud({ hijriOffset: off });
                    }}
                    style={{
                      flex: 1,
                      padding: '7px 4px',
                      borderRadius: 8,
                      border: hijriOffset === off ? '1px solid #D97706' : '1px solid #CBD5E1',
                      background: hijriOffset === off ? '#D97706' : '#fff',
                      color: hijriOffset === off ? '#fff' : '#64748B',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {off === 0 ? 'Auto' : off > 0 ? `+${off}d` : `${off}d`}
                  </button>
                ))}
              </div>
            </div>

            {/* Sound & Feedback */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>🔊 অডিও ও প্রতিক্রিয়া</label>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>ইন্টারঅ্যাক্টিভ সাউন্ড</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isMuted;
                    setIsMuted(next);
                    localStorage.setItem('islamic_sound_muted', String(next));
                    if (!next) playTone('click');
                  }}
                  style={{
                    border: 'none',
                    borderRadius: 20,
                    padding: '4px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: isMuted ? '#CBD5E1' : '#10B981',
                    color: '#fff'
                  }}
                >
                  {isMuted ? 'OFF' : 'ON'}
                </button>
              </div>
            </div>

            {/* Cloud Status Info */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: '#ECFDF5', border: '1px solid #A7F3D0', fontSize: 11.5, color: '#065F46', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <i className="bi bi-cloud-check-fill" style={{ fontSize: 16, color: '#059669' }} />
              <span>{currentUser?.uid ? 'আপনার আমল ও সালাত ডেটা ক্লাউডে সুরক্ষিত আছে।' : 'অফলাইন মোড চালু। লগইন করলে ক্লাউডে ব্যাকআপ হবে।'}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowSettings(false)}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              সম্পন্ন
            </button>
          </div>
        </div>
      )}

      {/* Add Custom Dua Modal */}
      {showAddDua && (
        <div onClick={() => setShowAddDua(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onClick={e => e.stopPropagation()} onSubmit={handleSaveCustomDua} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid #E2E8F0', paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="bi bi-plus-circle-fill" style={{ fontSize: 18, color: '#059669' }} />
                <h6 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: '#065F46' }}>নতুন দোয়া যোগ করুন</h6>
              </div>
              <button type="button" onClick={() => setShowAddDua(false)} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>দোয়ার শিরোনাম *</label>
              <input
                type="text"
                placeholder="যেমন: রিজিক বৃদ্ধির দোয়া"
                value={newDua.title}
                onChange={e => setNewDua({ ...newDua, title: e.target.value })}
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>ক্যাটাগরি নির্বাচন করুন</label>
              <select
                value={newDua.cat}
                onChange={e => setNewDua({ ...newDua, cat: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, background: '#F8FAFC', boxSizing: 'border-box' }}
              >
                <option value="hidayat">🌿 হিদায়াত ও ঈমান</option>
                <option value="relief">🛡️ পেরেশানি ও ঋণমুক্তি</option>
                <option value="forgive">🤲 মাগফিরাত ও তওবা</option>
                <option value="parents">👨‍👩‍👧 পিতা-মাতার জন্য</option>
                <option value="kalyan">✨ দুনিয়া ও আখিরাত</option>
                <option value="custom">➕ নতুন ক্যাটাগরি তৈরি করুন...</option>
              </select>
            </div>

            {newDua.cat === 'custom' && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#D97706', display: 'block', marginBottom: 4 }}>নতুন ক্যাটাগরির নাম *</label>
                <input
                  type="text"
                  placeholder="যেমন: পরীক্ষা ও ইন্টারভিউ"
                  value={newDua.catLabel}
                  onChange={e => setNewDua({ ...newDua, catLabel: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #F59E0B', background: '#FFFBEB', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>আরবি টেক্সট (ঐচ্ছিক)</label>
              <textarea
                rows={2}
                placeholder="رَبِّ زِدْنِي عِلْمًا"
                value={newDua.ar}
                onChange={e => setNewDua({ ...newDua, ar: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 14, direction: 'rtl', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>বাংলা অর্থ ও উচ্চারণ *</label>
              <textarea
                rows={2}
                placeholder="হে আমার রব! আমার জ্ঞান বৃদ্ধি করে দিন..."
                value={newDua.bn}
                onChange={e => setNewDua({ ...newDua, bn: e.target.value })}
                required
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>রেফারেন্স / সূত্র (ঐচ্ছিক)</label>
              <input
                type="text"
                placeholder="যেমন: সূরা ত্বহা: ১১৪"
                value={newDua.ref}
                onChange={e => setNewDua({ ...newDua, ref: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAddDua(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save Dua</button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {duaToDelete && (
        <div onClick={() => setDuaToDelete(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22 }}>
              <i className="bi bi-trash3" />
            </div>
            <h6 style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 16, color: '#1E293B' }}>দোয়া মুছে ফেলতে চান?</h6>
            <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px', lineHeight: 1.4 }}>
              <b>"{duaToDelete.title}"</b> দোয়াটি চিরতরে মুছে যাবে।
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setDuaToDelete(null)}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: '1px solid #CBD5E1', background: '#F8FAFC', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#475569' }}
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={confirmDeleteDua}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Jamat Time Modal */}
      {editingJamat && (
        <div onClick={() => setEditingJamat(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onClick={e => e.stopPropagation()} onSubmit={saveJamatTime} style={{ width: '100%', maxWidth: 340, background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 15px 30px rgba(0,0,0,0.2)' }}>
            <h6 style={{ margin: '0 0 12px', fontWeight: 800, color: '#065F46' }}>🕌 জামাতের সময় সেট করুন</h6>
            <input type="time" value={jamatInput} onChange={e => setJamatInput(e.target.value)} required style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 15, marginBottom: 14, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEditingJamat(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#F8FAFC', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
