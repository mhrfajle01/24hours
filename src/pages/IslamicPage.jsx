import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getPrayerTimes } from '../utils/prayerTimesCalc';

/* ─────────────────────────────────────────────
   PRAYER DATA — names, icons, Arabic, durations
───────────────────────────────────────────── */
const PRAYER_META = {
  Fajr:    { name: 'ফজর',    arabic: 'الفجر',   icon: '🌅', rak: 2,  sunnahBefore: 2, guide: "সূর্যোদয়ের আগে ফজর নামাজ আদায় করা হয়। ১ম রাকাতে সূরা আল-কাফিরুন পড়া উত্তম।" },
  Dhuhr:   { name: 'জোহর',   arabic: 'الظهر',  icon: '☀️', rak: 4,  sunnahBefore: 4, sunnahAfter: 2, guide: "দুপুরের পর সূর্য পশ্চিমে ঢলে পড়লে জোহর সময় হয়। আল-ফাতিহার পর যেকোনো সূরা পড়া যাবে।" },
  Asr:     { name: 'আসর',    arabic: 'العصر',  icon: '🌤️', rak: 4,  sunnahBefore: 4, guide: "বিকালে আসর নামাজ আদায় করতে হয়। নবী (সাঃ) একে 'সালাতুল উসতা' বা মধ্যবর্তী নামাজ বলেছেন।" },
  Maghrib: { name: 'মাগরিব', arabic: 'المغرب', icon: '🌇', rak: 3,  sunnahAfter: 2, guide: "সূর্যাস্তের পরপরই মাগরিব পড়া হয়। সুন্নতে সূরা আল-কাফিরুন ও আল-ইখলাস পড়া সুন্দর।" },
  Isha:    { name: 'এশা',    arabic: 'العشاء', icon: '🌙', rak: 4,  sunnahAfter: 2, witr: true, guide: "রাতের নামাজ এশা — শেষে ২ রাকাত সুন্নত ও কমপক্ষে ১ রাকাত বিতর নামাজ পড়া আবশ্যক।" },
};

const ADHKAR = [
  { arabic: 'سُبْحَانَ اللّهِ', transliteration: 'সুবহানাল্লাহ', meaning: 'আল্লাহ পবিত্র — "Glory be to Allah"', count: 33 },
  { arabic: 'الْحَمْدُ لِلّهِ', transliteration: 'আলহামদুলিল্লাহ', meaning: 'সকল প্রশংসা আল্লাহর — "All praise to Allah"', count: 33 },
  { arabic: 'اللّهُ أَكْبَر', transliteration: 'আল্লাহু আকবার', meaning: 'আল্লাহ সর্বশ্রেষ্ঠ — "Allah is the Greatest"', count: 33 },
  { arabic: 'لَا إِلَٰهَ إِلَّا اللّهُ', transliteration: 'লা ইলাহা ইল্লাল্লাহ', meaning: 'আল্লাহ ছাড়া কোনো ইলাহ নেই — "No god but Allah"', count: 1 },
];

const DAILY_TIPS = [
  { icon: '📿', tip: 'প্রতিটি নামাজের পর ৩৩ বার সুবহানাল্লাহ, ৩৩ বার আলহামদুলিল্লাহ ও ৩৩ বার আল্লাহু আকবার বলুন।' },
  { icon: '🕌', tip: 'ফজর সময়মতো পড়ার চেষ্টা করুন — ফেরেশতারা এই নামাজের সাক্ষী থাকেন।' },
  { icon: '📖', tip: 'প্রতিদিন কমপক্ষে ১ পৃষ্ঠা কুরআন তিলাওয়াত করুন — ধারাবাহিকতায়ই বরকত রয়েছে।' },
  { icon: '🤲', tip: "নামাজের পর দোয়া করুন — এই সময় দোয়া কবুল হওয়ার সেরা সুযোগ।" },
  { icon: '🌙', tip: 'রাতের শেষ তৃতীয়াংশে তাহাজ্জুদ পড়ার অভ্যাস করুন — এটি অত্যন্ত সওয়াবের ইবাদত।' },
  { icon: '💧', tip: 'সুন্দর ও মনোযোগ সহকারে অজু করুন — শরীর ও মন উভয়ই পবিত্র হয়।' },
];

/* ─────────────────────────────────────────────
   UTILITY HELPERS
───────────────────────────────────────────── */
function parseDateString(dateStr) {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }
  return new Date();
}

function getHijriDate(dateStr) {
  try {
    const d = parseDateString(dateStr);
    return new Intl.DateTimeFormat('bn-BD-u-ca-islamic-umalqura', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(d);
  } catch { return ''; }
}

function getGregorianFormatted(dateStr) {
  try {
    const d = parseDateString(dateStr);
    return new Intl.DateTimeFormat('bn-BD', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(d);
  } catch { return dateStr; }
}

function formatTime(date) {
  if (!date || isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getCountdown(targetDate) {
  if (!targetDate || isNaN(targetDate.getTime())) return null;
  const diff = targetDate.getTime() - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { h, m, s };
}

function toBnDigit(num) {
  return String(num).replace(/\d/g, d => '০১২৩৪৫۶৭৮৯'[d]);
}

/* ─────────────────────────────────────────────
   MAIN ISLAMIC PAGE COMPONENT
───────────────────────────────────────────── */
export default function IslamicPage({ selectedDate, onDateChange, onBack, onOpenSettings }) {
  const [coords, setCoords] = useState({ latitude: 23.8103, longitude: 90.4125 });
  const [cityName, setCityName] = useState('ঢাকা');
  const [prayerTimes, setPrayerTimes] = useState({});
  const [activePrayer, setActivePrayer] = useState(null);
  const [nextPrayer, setNextPrayer] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [activeTab, setActiveTab] = useState('checklist'); // checklist | reports | adhkar | guide
  const [reportTimeframe, setReportTimeframe] = useState('weekly'); // weekly | monthly

  // Checklist state
  const storageKey = `prayer_checklist_${selectedDate}`;
  const loadChecklist = () => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
  };
  const [checklist, setChecklist] = useState(loadChecklist);

  useEffect(() => {
    setChecklist(loadChecklist());
  }, [selectedDate]);

  // Adhkar counters
  const [adhkarCounts, setAdhkarCounts] = useState({ 0: 0, 1: 0, 2: 0, 3: 0 });
  const [expandedPrayer, setExpandedPrayer] = useState(null);
  const [tipIndex] = useState(() => Math.floor(Math.random() * DAILY_TIPS.length));
  const [now, setNow] = useState(new Date());

  // Geolocation
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => { setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setCityName('আমার অবস্থান'); },
      () => {}
    );
  }, []);

  // Compute prayer times
  const computeTimes = useCallback(() => {
    const d = parseDateString(selectedDate);
    const tzOff = -d.getTimezoneOffset() / 60;
    return getPrayerTimes(d, coords.latitude, coords.longitude, tzOff);
  }, [selectedDate, coords]);

  useEffect(() => {
    const times = computeTimes();
    setPrayerTimes(times);
  }, [computeTimes]);

  // Live clock + countdown + active prayer
  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date();
      setNow(n);
      const times = computeTimes();
      const order = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
      let active = null;
      let next = null;
      let nextTime = null;

      for (let i = 0; i < order.length; i++) {
        const t = times[order[i]];
        const nextT = times[order[i + 1]];
        if (!t) continue;
        if (n >= t && (!nextT || n < nextT)) { active = order[i]; }
        if (n < t && !next) { next = order[i]; nextTime = t; }
      }
      if (!next) { next = 'Fajr'; }
      setActivePrayer(active);
      setNextPrayer(next);
      setCountdown(nextTime ? getCountdown(nextTime) : null);
    }, 1000);
    return () => clearInterval(interval);
  }, [computeTimes]);

  // Persist checklist
  const updateChecklist = (updated) => {
    setChecklist(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const toggleCompleted = (prayer) => {
    updateChecklist({ ...checklist, [prayer]: { ...(checklist[prayer] || {}), completed: !checklist[prayer]?.completed } });
  };
  const toggleSub = (prayer, field) => {
    updateChecklist({ ...checklist, [prayer]: { ...(checklist[prayer] || {}), [field]: !checklist[prayer]?.[field] } });
  };

  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const completedCount = prayers.filter(p => checklist[p]?.completed).length;
  const progressPct = (completedCount / 5) * 100;

  // Date Navigation Helpers
  const shiftDate = (days) => {
    const d = parseDateString(selectedDate);
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (onDateChange) onDateChange(`${year}-${month}-${day}`);
  };

  // ─── DASHBOARD ANALYTICS (Weekly & Monthly) ─────────────────────────────
  const reportData = useMemo(() => {
    const daysCount = reportTimeframe === 'weekly' ? 7 : 30;
    const baseDate = parseDateString(selectedDate);
    const history = [];

    let totalCompleted = 0;
    let totalPossible = daysCount * 5;
    let totalSunnah = 0;
    let totalJamaah = 0;
    let totalTasbih = 0;

    const prayerStats = {
      Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0
    };

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      let dayData = {};
      try {
        dayData = JSON.parse(localStorage.getItem(`prayer_checklist_${dateStr}`)) || {};
      } catch { dayData = {}; }

      let dayCompleted = 0;
      prayers.forEach(p => {
        if (dayData[p]?.completed) {
          dayCompleted++;
          totalCompleted++;
          prayerStats[p]++;
        }
        if (dayData[p]?.sunnah) totalSunnah++;
        if (dayData[p]?.jamaah) totalJamaah++;
        if (dayData[p]?.tasbih) totalTasbih++;
      });

      const dayLabel = reportTimeframe === 'weekly'
        ? d.toLocaleDateString('bn-BD', { weekday: 'short' })
        : `${toBnDigit(d.getDate())}/${toBnDigit(d.getMonth() + 1)}`;

      history.push({
        dateStr,
        dayLabel,
        completed: dayCompleted,
        pct: (dayCompleted / 5) * 100
      });
    }

    const overallPct = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    return {
      history,
      totalCompleted,
      totalPossible,
      overallPct,
      totalSunnah,
      totalJamaah,
      totalTasbih,
      prayerStats,
      daysCount
    };
  }, [selectedDate, reportTimeframe]);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="islamic-page min-vh-100 pb-5" style={{
      background: 'linear-gradient(160deg, #011a12 0%, #022c22 40%, #064e3b 100%)',
      fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', sans-serif",
      color: '#f3f4f6',
    }}>

      {/* ── TOP DECORATIVE BAND ── */}
      <div style={{
        background: 'linear-gradient(90deg, #d97706 0%, #b45309 50%, #d97706 100%)',
        height: '3px',
      }} />

      {/* ── HEADER ── */}
      <div className="container max-width-container px-3 pt-4 pb-3">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <button
            onClick={onBack}
            className="btn btn-sm d-flex align-items-center gap-2 px-3 py-1 rounded-pill border border-warning text-warning"
            style={{ background: 'rgba(217,119,6,0.1)', fontSize: '0.85rem' }}
          >
            <i className="bi bi-arrow-left" /> ফিরে যান
          </button>
          <div className="text-center">
            <div style={{ fontSize: '1.6rem' }}>☪</div>
          </div>
          <button
            onClick={onOpenSettings}
            className="btn btn-sm d-flex align-items-center justify-content-center rounded-circle"
            style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#9ca3af' }}
            title="সেটিংস"
          >
            <i className="bi bi-gear-fill" />
          </button>
        </div>

        {/* Greeting + Hijri & Gregorian Date Selector */}
        <div className="text-center mb-4 animate-fade-in">
          <h2 className="fw-bold mb-1" style={{ color: '#d97706', fontSize: '1.6rem', letterSpacing: '0.03em' }}>
            بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
          </h2>
          <p className="text-white-50 mb-2" style={{ fontSize: '0.85rem' }}>
            পরম করুণাময় ও অসীম দয়ালু আল্লাহর নামে শুরু করছি
          </p>

          {/* Date Selector Navigation Box */}
          <div className="d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded-pill mb-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(217,119,6,0.3)' }}>
            <button className="btn btn-xs text-warning border-0 p-0" onClick={() => shiftDate(-1)} title="পূর্ববর্তী দিন">
              <i className="bi bi-chevron-left fs-6" />
            </button>

            <div className="position-relative d-flex align-items-center gap-1 cursor-pointer">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange && e.target.value && onDateChange(e.target.value)}
                className="position-absolute w-100 h-100 opacity-0 top-0 start-0 cursor-pointer"
                style={{ zIndex: 2 }}
              />
              <span className="text-warning fw-semibold" style={{ fontSize: '0.88rem' }}>
                📅 {getGregorianFormatted(selectedDate)}
              </span>
              <i className="bi bi-calendar-event text-warning ms-1" style={{ fontSize: '0.8rem' }} />
            </div>

            <button className="btn btn-xs text-warning border-0 p-0" onClick={() => shiftDate(1)} title="পরবর্তী দিন">
              <i className="bi bi-chevron-right fs-6" />
            </button>
          </div>

          <p className="text-warning fw-semibold mb-0" style={{ fontSize: '0.9rem' }}>
            🌙 হিজরি: {getHijriDate(selectedDate)}
          </p>
          <p className="text-white-50 mb-0" style={{ fontSize: '0.78rem' }}>
            {cityName} • বর্তমান সময়: {now.toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
          </p>
        </div>

        {/* ── NEXT PRAYER COUNTDOWN HERO ── */}
        {nextPrayer && (
          <div
            className="rounded-4 p-4 mb-4 text-center animate-slide-up"
            style={{
              background: 'rgba(217,119,6,0.08)',
              border: '1px solid rgba(217,119,6,0.35)',
              boxShadow: '0 0 30px rgba(217,119,6,0.12)',
            }}
          >
            <div style={{ fontSize: '2.2rem' }}>{PRAYER_META[nextPrayer]?.icon}</div>
            <p className="text-white-50 mb-0" style={{ fontSize: '0.85rem' }}>পরবর্তী নামাজ</p>
            <h3 className="fw-bold text-warning mb-0">
              {PRAYER_META[nextPrayer]?.name} <span style={{ fontSize: '1rem', color: '#e5e7eb' }}>({PRAYER_META[nextPrayer]?.arabic})</span>
            </h3>
            <div className="d-flex justify-content-center gap-3 mt-2">
              {countdown ? (
                ['h', 'm', 's'].map(unit => (
                  <div key={unit} className="text-center">
                    <div className="fw-bold text-white" style={{ fontSize: '1.8rem', lineHeight: 1 }}>
                      {toBnDigit(String(countdown[unit]).padStart(2, '0'))}
                    </div>
                    <div className="text-white-50" style={{ fontSize: '0.75rem' }}>{unit === 'h' ? 'ঘণ্টা' : unit === 'm' ? 'মিট' : 'সেকেন্ড'}</div>
                  </div>
                ))
              ) : (
                <p className="text-warning mb-0" style={{ fontSize: '0.95rem' }}>নামাজের সময় হয়েছে! প্রস্তুত হন 🕌</p>
              )}
            </div>
          </div>
        )}

        {/* ── DAILY TIP ── */}
        <div
          className="rounded-3 p-3 mb-4 d-flex gap-3 align-items-start animate-fade-in"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span style={{ fontSize: '1.4rem' }}>{DAILY_TIPS[tipIndex].icon}</span>
          <div>
            <p className="text-warning fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>আজকের রিমাইন্ডার 📌</p>
            <p className="text-white-50 mb-0" style={{ fontSize: '0.82rem' }}>{DAILY_TIPS[tipIndex].tip}</p>
          </div>
        </div>

        {/* ── PROGRESS OVERVIEW ── */}
        <div className="rounded-4 p-3 mb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="fw-semibold text-white" style={{ fontSize: '0.9rem' }}>আজকের অগ্রগতি</span>
            <span className="text-warning fw-bold" style={{ fontSize: '0.9rem' }}>{toBnDigit(completedCount)} / ৫ টি নামাজ</span>
          </div>
          <div className="rounded-pill overflow-hidden" style={{ height: '8px', background: 'rgba(255,255,255,0.1)' }}>
            <div
              className="h-100 rounded-pill"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #065f46, #d97706)',
                transition: 'width 0.6s ease',
                boxShadow: '0 0 10px rgba(217,119,6,0.4)',
              }}
            />
          </div>
          <p className="text-white-50 mt-2 mb-0" style={{ fontSize: '0.8rem' }}>
            {completedCount === 5 ? '🎉 আলহামদুলিল্লাহ! আজকের ৫ ওয়াক্ত নামাজই সম্পন্ন হয়েছে!' :
             completedCount === 0 ? 'ফজর দিয়ে দিন শুরু করুন! 🌅' :
             `চালিয়ে যান! আরও ${toBnDigit(5 - completedCount)} টি নামাজ বাকি আছে।`}
          </p>
        </div>

        {/* ── TABS ── */}
        <div className="d-flex gap-2 mb-4 overflow-x-auto pb-1">
          {[
            { id: 'checklist', label: '☑️ চেকপ্রোগ্রেস', icon: 'bi-check2-square' },
            { id: 'reports', label: '📊 সাপ্তাহিক/মাসিক রিপোর্ট', icon: 'bi-bar-chart-fill' },
            { id: 'adhkar', label: '📿 তাসবিহ গণনা', icon: 'bi-circle' },
            { id: 'guide', label: '📖 নিয়মাবলী', icon: 'bi-book' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="btn btn-sm rounded-pill py-2 px-3 fw-semibold transition-all text-nowrap"
              style={activeTab === tab.id
                ? { background: 'linear-gradient(135deg, #065f46, #d97706)', color: '#fff', border: 'none', boxShadow: '0 4px 14px rgba(217,119,6,0.3)', fontSize: '0.82rem' }
                : { background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.82rem' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════
            TAB: PRAYER CHECKLIST
        ══════════════════════════════════════ */}
        {activeTab === 'checklist' && (
          <div className="animate-fade-in">
            {prayers.map((prayer) => {
              const meta = PRAYER_META[prayer];
              const done = checklist[prayer]?.completed;
              const isActive = activePrayer === prayer;
              const timeVal = prayerTimes[prayer] ? formatTime(prayerTimes[prayer]) : '--:--';
              const isExpanded = expandedPrayer === prayer;

              return (
                <div
                  key={prayer}
                  className="mb-3 rounded-4 overflow-hidden transition-all"
                  style={{
                    border: isActive
                      ? '1.5px solid rgba(217,119,6,0.7)'
                      : done
                      ? '1px solid rgba(16,185,129,0.3)'
                      : '1px solid rgba(255,255,255,0.08)',
                    background: isActive
                      ? 'rgba(217,119,6,0.08)'
                      : done
                      ? 'rgba(6,78,59,0.5)'
                      : 'rgba(255,255,255,0.04)',
                    boxShadow: isActive ? '0 0 20px rgba(217,119,6,0.2)' : 'none',
                    animation: isActive ? 'islamicActivePulse 2.5s infinite ease-in-out' : 'none',
                  }}
                >
                  {/* Card Header Row */}
                  <div className="d-flex align-items-center p-3 gap-3" style={{ cursor: 'pointer' }} onClick={() => setExpandedPrayer(isExpanded ? null : prayer)}>
                    {/* Check Button */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); toggleCompleted(prayer); }}
                      className="btn rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{
                        width: '36px', height: '36px', padding: 0,
                        background: done ? 'linear-gradient(135deg,#065f46,#d97706)' : 'rgba(255,255,255,0.07)',
                        border: done ? 'none' : '1.5px solid rgba(255,255,255,0.25)',
                        boxShadow: done ? '0 0 12px rgba(217,119,6,0.4)' : 'none',
                        transition: 'all 0.3s ease',
                      }}
                    >
                      {done
                        ? <i className="bi bi-check-lg text-white fw-bold" />
                        : <span style={{ width: '14px', height: '14px', borderRadius: '50%', display: 'inline-block', background: 'transparent' }} />}
                    </button>

                    {/* Icon + Name */}
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ fontSize: '1.1rem' }}>{meta.icon}</span>
                        <span className={`fw-bold ${done ? 'text-white-50' : 'text-white'}`} style={{ textDecoration: done ? 'line-through' : 'none', fontSize: '1.05rem' }}>
                          {meta.name}
                        </span>
                        <span className="text-white-50" style={{ fontSize: '0.85rem', fontFamily: 'serif' }}>{meta.arabic}</span>
                        {isActive && (
                          <span className="badge rounded-pill px-2 py-1" style={{ background: 'rgba(217,119,6,0.8)', fontSize: '0.7rem', color: '#fff' }}>
                            এখন সক্রিয়
                          </span>
                        )}
                      </div>
                      <div className="text-white-50 mt-0.5" style={{ fontSize: '0.8rem' }}>
                        {timeVal} • {toBnDigit(meta.rak)} রাকাত ফরজ
                      </div>
                    </div>

                    {/* Expand chevron */}
                    <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} text-white-50`} style={{ fontSize: '0.8rem' }} />
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div
                      className="px-3 pb-3 animate-fade-in"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      {/* Guideline text */}
                      <p className="text-white-50 mt-3 mb-3" style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
                        <i className="bi bi-info-circle-fill text-warning me-1" />{meta.guide}
                      </p>

                      {/* Rak'ah breakdown */}
                      <div className="d-flex gap-2 mb-3 flex-wrap">
                        {meta.sunnahBefore && (
                          <span className="badge rounded-pill px-2 py-1.5" style={{ background: 'rgba(217,119,6,0.15)', color: '#d97706', border: '1px solid rgba(217,119,6,0.3)', fontSize: '0.75rem' }}>
                            {toBnDigit(meta.sunnahBefore)} রাকাত সুন্নত (আগে)
                          </span>
                        )}
                        <span className="badge rounded-pill px-2 py-1.5" style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)', fontSize: '0.75rem' }}>
                          {toBnDigit(meta.rak)} রাকাত ফরজ
                        </span>
                        {meta.sunnahAfter && (
                          <span className="badge rounded-pill px-2 py-1.5" style={{ background: 'rgba(217,119,6,0.15)', color: '#d97706', border: '1px solid rgba(217,119,6,0.3)', fontSize: '0.75rem' }}>
                            {toBnDigit(meta.sunnahAfter)} রাকাত সুন্নত (পরে)
                          </span>
                        )}
                        {meta.witr && (
                          <span className="badge rounded-pill px-2 py-1.5" style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)', fontSize: '0.75rem' }}>
                            বিতর (১-৩ রাকাত)
                          </span>
                        )}
                      </div>

                      {/* Sub-state toggles */}
                      <div className="d-flex gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => toggleSub(prayer, 'sunnah')}
                          className="btn btn-sm rounded-pill px-3 py-1 d-flex align-items-center gap-1 transition-all"
                          style={checklist[prayer]?.sunnah
                            ? { background: 'rgba(217,119,6,0.25)', color: '#fbbf24', border: '1px solid rgba(217,119,6,0.6)', fontSize: '0.8rem' }
                            : { background: 'transparent', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.8rem' }}
                        >
                          <i className={`bi ${checklist[prayer]?.sunnah ? 'bi-star-fill' : 'bi-star'}`} style={{ fontSize: '0.75rem' }} />
                          সুন্নত পড়া হয়েছে ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSub(prayer, 'jamaah')}
                          className="btn btn-sm rounded-pill px-3 py-1 d-flex align-items-center gap-1 transition-all"
                          style={checklist[prayer]?.jamaah
                            ? { background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.6)', fontSize: '0.8rem' }
                            : { background: 'transparent', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.8rem' }}
                        >
                          <i className={`bi ${checklist[prayer]?.jamaah ? 'bi-people-fill' : 'bi-people'}`} style={{ fontSize: '0.75rem' }} />
                          জামাআতে পড়া হয়েছে ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSub(prayer, 'tasbih')}
                          className="btn btn-sm rounded-pill px-3 py-1 d-flex align-items-center gap-1 transition-all"
                          style={checklist[prayer]?.tasbih
                            ? { background: 'rgba(16,185,129,0.25)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.6)', fontSize: '0.8rem' }
                            : { background: 'transparent', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.8rem' }}
                        >
                          📿 নামাজের পর তাসবিহ করা হয়েছে ✓
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: ISLAMIC REPORTS & DASHBOARD
        ══════════════════════════════════════ */}
        {activeTab === 'reports' && (
          <div className="animate-fade-in">
            {/* Filter Pills */}
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold text-warning mb-0" style={{ fontSize: '1rem' }}>
                📊 ইবাদত ও সালাত ড্যাশবোর্ড
              </h6>
              <div className="btn-group btn-group-sm rounded-pill p-1" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  className={`btn btn-xs rounded-pill px-3 ${reportTimeframe === 'weekly' ? 'btn-warning text-dark fw-bold' : 'text-white-50 border-0'}`}
                  onClick={() => setReportTimeframe('weekly')}
                  style={{ fontSize: '0.78rem' }}
                >
                  সাপ্তাহিক (৭ দিন)
                </button>
                <button
                  className={`btn btn-xs rounded-pill px-3 ${reportTimeframe === 'monthly' ? 'btn-warning text-dark fw-bold' : 'text-white-50 border-0'}`}
                  onClick={() => setReportTimeframe('monthly')}
                  style={{ fontSize: '0.78rem' }}
                >
                  মাসিক (৩০ দিন)
                </button>
              </div>
            </div>

            {/* Summary Stat Cards */}
            <div className="row g-2 mb-4">
              <div className="col-6 col-md-3">
                <div className="rounded-4 p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(217,119,6,0.3)' }}>
                  <div className="text-white-50" style={{ fontSize: '0.75rem' }}>ফরজ আদায়</div>
                  <div className="fw-bold text-warning" style={{ fontSize: '1.4rem' }}>
                    {toBnDigit(reportData.totalCompleted)} / {toBnDigit(reportData.totalPossible)}
                  </div>
                  <span className="badge bg-warning text-dark rounded-pill px-2 py-0.5" style={{ fontSize: '0.68rem' }}>
                    {toBnDigit(reportData.overallPct)}% সম্পন্ন
                  </span>
                </div>
              </div>

              <div className="col-6 col-md-3">
                <div className="rounded-4 p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <div className="text-white-50" style={{ fontSize: '0.75rem' }}>জামাআত প্রাপ্তি</div>
                  <div className="fw-bold text-success" style={{ fontSize: '1.4rem' }}>
                    {toBnDigit(reportData.totalJamaah)} <span style={{ fontSize: '0.8rem' }}>বার</span>
                  </div>
                  <span className="text-white-50" style={{ fontSize: '0.68rem' }}>মসজিদ/জামাআত</span>
                </div>
              </div>

              <div className="col-6 col-md-3">
                <div className="rounded-4 p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(217,119,6,0.3)' }}>
                  <div className="text-white-50" style={{ fontSize: '0.75rem' }}>সুন্নত আদায়</div>
                  <div className="fw-bold text-warning" style={{ fontSize: '1.4rem' }}>
                    {toBnDigit(reportData.totalSunnah)} <span style={{ fontSize: '0.8rem' }}>বার</span>
                  </div>
                  <span className="text-white-50" style={{ fontSize: '0.68rem' }}>সুন্নত সালাত</span>
                </div>
              </div>

              <div className="col-6 col-md-3">
                <div className="rounded-4 p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <div className="text-white-50" style={{ fontSize: '0.75rem' }}>তাসবিহ সম্পন্ন</div>
                  <div className="fw-bold text-info" style={{ fontSize: '1.4rem' }}>
                    {toBnDigit(reportData.totalTasbih)} <span style={{ fontSize: '0.8rem' }}>বার</span>
                  </div>
                  <span className="text-white-50" style={{ fontSize: '0.68rem' }}>নামাজ পরবর্তী</span>
                </div>
              </div>
            </div>

            {/* Daily History Bar Graph */}
            <div className="rounded-4 p-4 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h6 className="fw-bold text-white mb-3" style={{ fontSize: '0.92rem' }}>
                📈 {reportTimeframe === 'weekly' ? 'গত ৭ দিনের দৈনিক ধারাবাহিকতা' : 'গত ৩০ দিনের ধারাবাহিকতা'}
              </h6>
              <div className="d-flex align-items-end justify-content-between gap-1 pt-3" style={{ height: '140px' }}>
                {reportData.history.map((h, idx) => (
                  <div key={idx} className="flex-fill d-flex flex-column align-items-center h-100 justify-content-end">
                    <div className="text-warning fw-bold mb-1" style={{ fontSize: '0.65rem' }}>
                      {h.completed > 0 ? `${toBnDigit(h.completed)}/৫` : ''}
                    </div>
                    <div
                      className="w-100 rounded-top transition-all"
                      style={{
                        height: `${Math.max(8, h.pct)}%`,
                        background: h.completed === 5
                          ? 'linear-gradient(180deg, #10b981, #065f46)'
                          : h.completed > 0
                          ? 'linear-gradient(180deg, #d97706, #78350f)'
                          : 'rgba(255,255,255,0.08)',
                        minHeight: '6px',
                        maxWidth: reportTimeframe === 'weekly' ? '28px' : '8px'
                      }}
                      title={`${h.dateStr}: ${h.completed}/5`}
                    />
                    <div className="text-white-50 mt-2 text-nowrap" style={{ fontSize: reportTimeframe === 'weekly' ? '0.72rem' : '0.6rem' }}>
                      {h.dayLabel}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Individual Prayer Performance Breakdown */}
            <div className="rounded-4 p-4 mb-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h6 className="fw-bold text-white mb-3" style={{ fontSize: '0.92rem' }}>
                🕌 ওয়াক্ত ভিত্তিক পারফরম্যান্স ({toBnDigit(reportData.daysCount)} দিন)
              </h6>
              <div className="d-flex flex-column gap-3">
                {prayers.map(p => {
                  const meta = PRAYER_META[p];
                  const count = reportData.prayerStats[p] || 0;
                  const pct = Math.round((count / reportData.daysCount) * 100);
                  return (
                    <div key={p}>
                      <div className="d-flex justify-content-between align-items-center mb-1" style={{ fontSize: '0.85rem' }}>
                        <span className="text-white fw-semibold">
                          {meta.icon} {meta.name} <span className="text-white-50">({meta.arabic})</span>
                        </span>
                        <span className="text-warning fw-bold">
                          {toBnDigit(count)} / {toBnDigit(reportData.daysCount)} দিন ({toBnDigit(pct)}%)
                        </span>
                      </div>
                      <div className="rounded-pill overflow-hidden" style={{ height: '7px', background: 'rgba(255,255,255,0.08)' }}>
                        <div
                          className="h-100 rounded-pill transition-all"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 80 ? '#10b981' : pct >= 50 ? '#d97706' : '#ef4444'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: ADHKAR (Dhikr counter)
        ══════════════════════════════════════ */}
        {activeTab === 'adhkar' && (
          <div className="animate-fade-in">
            <p className="text-white-50 mb-4 text-center" style={{ fontSize: '0.85rem' }}>
              নামাজের পর বাটনে ট্যাপ করে ডিজিটাল তাসবিহ গণনা করুন। 📿
            </p>
            {ADHKAR.map((dhikr, i) => {
              const count = adhkarCounts[i] || 0;
              const isDone = count >= dhikr.count;
              return (
                <div
                  key={i}
                  className="rounded-4 p-4 mb-3 text-center transition-all"
                  style={{
                    border: isDone ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(217,119,6,0.3)',
                    background: isDone ? 'rgba(6,78,59,0.6)' : 'rgba(217,119,6,0.06)',
                    boxShadow: isDone ? '0 0 16px rgba(16,185,129,0.15)' : '0 0 10px rgba(217,119,6,0.08)',
                  }}
                >
                  {/* Arabic */}
                  <p className="fw-bold text-warning mb-1" style={{ fontSize: '1.5rem', fontFamily: 'serif', direction: 'rtl' }}>
                    {dhikr.arabic}
                  </p>
                  <p className="text-white mb-0" style={{ fontSize: '0.95rem' }}>{dhikr.transliteration}</p>
                  <p className="text-white-50 mb-3" style={{ fontSize: '0.8rem' }}>{dhikr.meaning}</p>

                  {/* Counter */}
                  <div className="d-flex align-items-center justify-content-center gap-4">
                    <button
                      onClick={() => setAdhkarCounts(prev => ({ ...prev, [i]: Math.max(0, (prev[i] || 0) - 1) }))}
                      className="btn rounded-circle d-flex align-items-center justify-content-center"
                      style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#9ca3af' }}
                    >
                      <i className="bi bi-dash-lg" />
                    </button>
                    <div>
                      <div className="fw-bold text-white" style={{ fontSize: '2rem', lineHeight: 1 }}>{toBnDigit(count)}</div>
                      <div className="text-white-50" style={{ fontSize: '0.75rem' }}>/ {toBnDigit(dhikr.count)}</div>
                    </div>
                    <button
                      onClick={() => !isDone && setAdhkarCounts(prev => ({ ...prev, [i]: (prev[i] || 0) + 1 }))}
                      className="btn rounded-circle d-flex align-items-center justify-content-center"
                      style={{
                        width: '48px', height: '48px',
                        background: isDone ? 'rgba(16,185,129,0.3)' : 'linear-gradient(135deg, #065f46, #d97706)',
                        border: 'none', color: '#fff',
                        boxShadow: isDone ? 'none' : '0 4px 14px rgba(217,119,6,0.4)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {isDone ? <i className="bi bi-check-lg" /> : <i className="bi bi-plus-lg" />}
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="rounded-pill overflow-hidden mt-3" style={{ height: '4px', background: 'rgba(255,255,255,0.08)' }}>
                    <div
                      style={{
                        width: `${Math.min(100, (count / dhikr.count) * 100)}%`,
                        height: '100%',
                        background: isDone ? '#10b981' : 'linear-gradient(90deg,#065f46,#d97706)',
                        transition: 'width 0.3s ease',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                  {isDone && <p className="text-success mt-2 mb-0 fw-semibold" style={{ fontSize: '0.85rem' }}>✅ সম্পন্ন হয়েছে! আলহামদুলিল্লাহ 🤲</p>}

                  {/* Reset */}
                  {count > 0 && (
                    <button
                      className="btn btn-link text-white-50 p-0 mt-2"
                      style={{ fontSize: '0.78rem', textDecoration: 'none' }}
                      onClick={() => setAdhkarCounts(prev => ({ ...prev, [i]: 0 }))}
                    >
                      পুনরায় নতুন করে শুরু করুন
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════════════════════════════
            TAB: PRAYER GUIDE
        ══════════════════════════════════════ */}
        {activeTab === 'guide' && (
          <div className="animate-fade-in">
            <p className="text-warning fw-semibold mb-3" style={{ fontSize: '0.9rem' }}>
              🕌 প্রতিটি নামাজের বিস্তারিত গাইড ও নিয়মাবলী
            </p>
            {prayers.map(prayer => {
              const meta = PRAYER_META[prayer];
              return (
                <div key={prayer} className="rounded-4 p-4 mb-3" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span style={{ fontSize: '1.2rem' }}>{meta.icon}</span>
                    <h6 className="fw-bold text-warning m-0" style={{ fontSize: '1.05rem' }}>{meta.name} <span style={{ fontFamily: 'serif', fontSize: '0.95rem', color: '#e5e7eb' }}>({meta.arabic})</span></h6>
                    <span className="ms-auto badge rounded-pill px-2" style={{ background: 'rgba(217,119,6,0.2)', color: '#fbbf24', fontSize: '0.75rem' }}>
                      {prayerTimes[prayer] ? formatTime(prayerTimes[prayer]) : '--:--'}
                    </span>
                  </div>
                  <p className="text-white-50 mb-2" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{meta.guide}</p>

                  {/* Rak'ah breakdown steps */}
                  <div className="d-flex flex-column gap-1">
                    {meta.sunnahBefore && (
                      <div className="d-flex align-items-center gap-2 text-white-50" style={{ fontSize: '0.8rem' }}>
                        <span className="rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '20px', height: '20px', background: 'rgba(217,119,6,0.2)', color: '#d97706', fontSize: '0.65rem', flexShrink: 0 }}>১</span>
                        {toBnDigit(meta.sunnahBefore)} রাকাত সুন্নত — ফরজের পূর্বে
                      </div>
                    )}
                    <div className="d-flex align-items-center gap-2 text-white-50" style={{ fontSize: '0.8rem' }}>
                      <span className="rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '20px', height: '20px', background: 'rgba(16,185,129,0.2)', color: '#6ee7b7', fontSize: '0.65rem', flexShrink: 0 }}>
                        {meta.sunnahBefore ? '২' : '১'}
                      </span>
                      {toBnDigit(meta.rak)} রাকাত ফরজ (আবশ্যিক)
                    </div>
                    {meta.sunnahAfter && (
                      <div className="d-flex align-items-center gap-2 text-white-50" style={{ fontSize: '0.8rem' }}>
                        <span className="rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '20px', height: '20px', background: 'rgba(217,119,6,0.2)', color: '#d97706', fontSize: '0.65rem', flexShrink: 0 }}>
                          {meta.sunnahBefore ? '৩' : '২'}
                        </span>
                        {toBnDigit(meta.sunnahAfter)} রাকাত সুন্নত — ফরজের পরে
                      </div>
                    )}
                    {meta.witr && (
                      <div className="d-flex align-items-center gap-2 text-white-50" style={{ fontSize: '0.8rem' }}>
                        <span className="rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '20px', height: '20px', background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', fontSize: '0.65rem', flexShrink: 0 }}>উ</span>
                        বিতর — রাতে ঘুমানোর পূর্বে কমপক্ষে ১ রাকাত
                      </div>
                    )}
                    <div className="d-flex align-items-center gap-2 text-white-50" style={{ fontSize: '0.8rem' }}>
                      <span className="rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '20px', height: '20px', background: 'rgba(255,255,255,0.08)', color: '#9ca3af', fontSize: '0.65rem', flexShrink: 0 }}>📿</span>
                      নামাজের পর তাসবিহ: ৩৩ বার সুবহানাল্লাহ, আলহামদুলিল্লাহ ও আল্লাহু আকবার
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Wudu reminder */}
            <div className="rounded-4 p-4 mb-3" style={{ border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)' }}>
              <h6 className="fw-bold text-white mb-2" style={{ fontSize: '1rem' }}>💧 ওজুর নিয়ম ও ধাপসমূহ</h6>
              <div className="d-flex flex-column gap-1 text-white-50" style={{ fontSize: '0.85rem' }}>
                {[
                  'নিয়ত করা (মনে মনে সংকল্প করা)',
                  'দুই হাত কবজি পর্যন্ত ৩ বার ধোয়া',
                  'কুলি করা ৩ বার',
                  'নাফে পানি দিয়ে নাক পরিষ্কার করা ৩ বার',
                  'সম্পূর্ণ মুখমণ্ডল ৩ বার ধোয়া',
                  'দুই হাত কনুই পর্যন্ত ৩ বার ধোয়া (ডান হাত আগে)',
                  'মাথা মাসাহ করা ১ বার',
                  'দুই পা টাখনু পর্যন্ত ৩ বার ধোয়া (ডান পা আগে)'
                ].map((step, idx) => (
                  <div key={idx} className="d-flex gap-2 align-items-center">
                    <i className="bi bi-droplet-fill text-primary" style={{ fontSize: '0.7rem' }} />
                    {toBnDigit(idx + 1)}. {step}
                  </div>
                ))}
              </div>
            </div>

            {/* Quran reading tip */}
            <div className="rounded-4 p-4" style={{ border: '1px solid rgba(217,119,6,0.25)', background: 'rgba(217,119,6,0.05)' }}>
              <h6 className="fw-bold text-warning mb-1" style={{ fontSize: '1rem' }}>📖 নিয়মিত কুরআন তিলাওয়াতের অভ্যাস</h6>
              <p className="text-white-50 mb-0" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                দিনে মাত্র ১ পৃষ্ঠা তিলাওয়াত করলে প্রায় ১৮ মাসে পুরো কুরআন খতম হয়।
                আর লক্ষ্য যদি আরও বড় হয়: <strong className="text-white">দিনে ৫ পৃষ্ঠা</strong> তিলাওয়াত করলে মাত্র <strong className="text-white">৩.৫ মাসে</strong> খতম সম্ভব!
                আল্লাহর কাছে অল্প হলেও নিয়মিত ইবাদত, অনিয়মিত কিন্তু বেশি ইবাদতের চেয়ে অধিক প্রিয়।
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
