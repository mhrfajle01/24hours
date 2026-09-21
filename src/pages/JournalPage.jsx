import React, { useState, useEffect, useRef } from 'react';
import { useJournals } from '../hooks/useJournals';
import { getTodayDateString } from '../utils/helpers';

// Emojis and descriptions for moods
const MOODS = [
  { value: 'excited', label: 'Excited', emoji: '🤩', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.15)' },
  { value: 'happy', label: 'Happy', emoji: '😊', color: '#4CAF50', bg: 'rgba(76, 175, 80, 0.15)' },
  { value: 'calm', label: 'Calm', emoji: '😌', color: '#2196F3', bg: 'rgba(33, 150, 243, 0.15)' },
  { value: 'tired', label: 'Tired', emoji: '🥱', color: '#9E9E9E', bg: 'rgba(158, 158, 158, 0.15)' },
  { value: 'anxious', label: 'Anxious', emoji: '😰', color: '#FF9800', bg: 'rgba(255, 152, 0, 0.15)' },
  { value: 'sad', label: 'Sad', emoji: '😔', color: '#9C27B0', bg: 'rgba(156, 39, 176, 0.15)' },
  { value: 'angry', label: 'Angry', emoji: '😤', color: '#F44336', bg: 'rgba(244, 67, 54, 0.15)' },
];

const PRESETS_TAGS = ['reflection', 'gratitude', 'productivity', 'health', 'career', 'mindfulness', 'creative'];

const WRITING_PROMPTS = [
  "What is the best thing that happened today, and what did you learn from it?",
  "List three things you are grateful for today and why.",
  "What was the main challenge today? How did you handle it?",
  "What goals did you achieve today? What is the main goal for tomorrow?",
  "How are you feeling right now? Describe the physical sensations of your emotion.",
  "Write about a person who made a positive impact on your day today.",
  "If today was a chapter in a book, what would its title be and why?"
];

const STYLES_AND_THEMES = {
  midnight: {
    name: 'Midnight Sky',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%)',
    textColor: '#f8fafc',
    cardBg: 'rgba(30, 41, 59, 0.7)',
    borderColor: 'rgba(255,255,255,0.08)',
    accent: '#818cf8',
    inputBg: 'rgba(0, 0, 0, 0.25)',
    secondaryText: 'rgba(248, 250, 252, 0.6)'
  },
  emerald: {
    name: 'Forest Emerald',
    background: 'linear-gradient(135deg, #022c22 0%, #064e3b 50%, #115e59 100%)',
    textColor: '#f0fdf4',
    cardBg: 'rgba(6, 78, 59, 0.7)',
    borderColor: 'rgba(255,255,255,0.08)',
    accent: '#34d399',
    inputBg: 'rgba(0, 0, 0, 0.25)',
    secondaryText: 'rgba(240, 253, 244, 0.6)'
  },
  peach: {
    name: 'Sunset Peach',
    background: 'linear-gradient(135deg, #2e1009 0%, #431407 50%, #78350f 100%)',
    textColor: '#fff7ed',
    cardBg: 'rgba(67, 20, 7, 0.7)',
    borderColor: 'rgba(255,255,255,0.08)',
    accent: '#fb923c',
    inputBg: 'rgba(0, 0, 0, 0.25)',
    secondaryText: 'rgba(255, 247, 237, 0.6)'
  },
  classic: {
    name: 'Paper Classic',
    background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 50%, #dee2e6 100%)',
    textColor: '#212529',
    cardBg: 'rgba(255, 255, 255, 0.85)',
    borderColor: 'rgba(0, 0, 0, 0.1)',
    accent: '#6c757d',
    inputBg: 'rgba(255, 255, 255, 0.5)',
    secondaryText: 'rgba(33, 37, 41, 0.7)'
  }
};

export default function JournalPage({ currentUser, onBack, initialDate }) {
  const { entries, loading, addJournalEntry, updateJournalEntry, deleteJournalEntry } = useJournals(currentUser?.uid);
  const [selectedTheme, setSelectedTheme] = useState(() => localStorage.getItem('journal-theme') || 'midnight');
  
  // Editor state
  const [editId, setEditId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedMood, setSelectedMood] = useState('calm');
  const [tags, setTags] = useState([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [journalDate, setJournalDate] = useState(initialDate || getTodayDateString());
  
  // Logical Improvement: Auto-load existing entry or draft
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const draftKey = editId ? `journal_draft_edit_${editId}` : `journal_draft_new_${journalDate}`;
  const [activeTab, setActiveTab] = useState('edit');
  const [entryPendingDelete, setEntryPendingDelete] = useState(null);
  
  useEffect(() => {
    if (!loading && !hasAutoLoaded) {
      if (initialDate) {
        const existingEntry = entries.find(e => e.date === initialDate);
        if (existingEntry) {
          setEditId(existingEntry.id);
          setTitle(existingEntry.title || '');
          setContent(existingEntry.content || '');
          setSelectedMood(existingEntry.mood || 'calm');
          setTags(existingEntry.tags || []);
          setActiveTab('edit');
        } else {
          // Try to load draft for new entry
          const savedDraft = localStorage.getItem(`journal_draft_new_${initialDate}`);
          if (savedDraft) {
            try {
              const draft = JSON.parse(savedDraft);
              setTitle(draft.title || '');
              setContent(draft.content || '');
              setSelectedMood(draft.mood || 'calm');
              setTags(draft.tags || []);
            } catch(e) {}
          }
        }
      } else {
        // Check for today's draft
        const savedDraft = localStorage.getItem(`journal_draft_new_${getTodayDateString()}`);
        if (savedDraft) {
          try {
            const draft = JSON.parse(savedDraft);
            setTitle(draft.title || '');
            setContent(draft.content || '');
            setSelectedMood(draft.mood || 'calm');
            setTags(draft.tags || []);
          } catch(e) {}
        }
      }
      setHasAutoLoaded(true);
    }
  }, [initialDate, entries, hasAutoLoaded, loading]);

  // Auto-save draft on changes
  useEffect(() => {
    if (activeTab === 'edit' && hasAutoLoaded) {
      const draft = { title, content, mood: selectedMood, tags };
      const plainContent = content ? content.replace(/<[^>]+>/g, '') : '';
      const hasContent = title.trim() || plainContent.trim() || tags.length > 0;
      
      const timeout = setTimeout(() => {
        if (hasContent) {
          localStorage.setItem(draftKey, JSON.stringify(draft));
        } else {
          localStorage.removeItem(draftKey);
        }
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [title, content, selectedMood, tags, activeTab, draftKey, hasAutoLoaded]);
  
  // Audio state
  const [ambientSound, setAmbientSound] = useState('off'); // off, rain, waves
  const audioContextRef = useRef(null);
  const audioNodeRef = useRef(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilterMood, setSelectedFilterMood] = useState('all');
  const [selectedFilterTag, setSelectedFilterTag] = useState('all');
  
  // Active view: 'edit' (Writing/Editing) or 'history' (Viewing entries)
  // activeTab is declared above (before auto-save useEffect)

  const themeConfig = STYLES_AND_THEMES[selectedTheme] || STYLES_AND_THEMES.midnight;

  useEffect(() => {
    localStorage.setItem('journal-theme', selectedTheme);
  }, [selectedTheme]);

  // Handle ambient noise generation using Web Audio API (offline & premium!)
  useEffect(() => {
    return () => {
      stopAmbientSound();
    };
  }, []);

  const startAmbientSound = (type) => {
    stopAmbientSound();
    
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const bufferSize = 2 * ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      // Generate brownian/white noise for relaxing sound effects
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === 'rain') {
          // Brownian noise (deeper)
          output[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = output[i];
          output[i] *= 3.5; // Amplify
        } else {
          // Pink noise filter (medium)
          output[i] = (lastOut + (0.12 * white)) / 1.12;
          lastOut = output[i];
          output[i] *= 2.2;
        }
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Filter for ambient sound
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = type === 'rain' ? 800 : 400;

      // Gain Node for volume control
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.18, ctx.currentTime);

      // Connection path
      whiteNoise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      whiteNoise.start(0);
      audioNodeRef.current = whiteNoise;
    } catch (e) {
      console.error("Web Audio API not fully supported", e);
    }
  };

  const stopAmbientSound = () => {
    if (audioNodeRef.current) {
      try {
        audioNodeRef.current.stop();
      } catch (e) {}
      audioNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
  };

  const handleAmbientChange = (type) => {
    setAmbientSound(type);
    if (type === 'off') {
      stopAmbientSound();
    } else {
      startAmbientSound(type);
    }
  };

  // Add Tag
  const handleAddTag = (tagStr) => {
    const cleaned = tagStr.trim().toLowerCase().replace(/#/g, '');
    if (cleaned && !tags.includes(cleaned)) {
      setTags([...tags, cleaned]);
    }
    setNewTagInput('');
  };

  // Remove Tag
  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  // Form Reset
  const resetForm = () => {
    setEditId(null);
    setTitle('');
    setContent('');
    setSelectedMood('calm');
    setTags([]);
    setJournalDate(getTodayDateString());
  };

  // Save Entry
  const handleSave = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    const data = {
      title: title.trim() || `Journal Entry - ${journalDate}`,
      content: content.trim(),
      mood: selectedMood,
      tags,
      date: journalDate,
    };

    try {
      if (editId) {
        await updateJournalEntry(editId, data);
      } else {
        await addJournalEntry(data);
      }
      localStorage.removeItem(draftKey); // Clear draft after save
      resetForm();
      setActiveTab('history');
    } catch (err) {
      alert("Failed to save entry: " + err.message);
    }
  };

  // Select entry for editing
  const handleEditSelect = (entry) => {
    setEditId(entry.id);
    setTitle(entry.title || '');
    setContent(entry.content || '');
    setSelectedMood(entry.mood || 'calm');
    setTags(entry.tags || []);
    setJournalDate(entry.date || getTodayDateString());
    setActiveTab('edit');
  };

  // Export entry as TXT
  const handleExportText = (entry) => {
    const fileContent = `=== ${entry.title} ===\nDate: ${entry.date}\nMood: ${entry.mood?.toUpperCase()}\nTags: ${entry.tags?.join(', ') || 'None'}\n\n${entry.content}`;
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `journal-${entry.date}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Generate random prompt
  const applyRandomPrompt = () => {
    const idx = Math.floor(Math.random() * WRITING_PROMPTS.length);
    const prompt = WRITING_PROMPTS[idx];
    setContent(prev => {
      const prefix = prev ? prev + '\n\n' : '';
      return prefix + `✍️ Prompt: ${prompt}\n`;
    });
  };

  // Calculate words count
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const readingTime = Math.ceil(wordCount / 200) || 1;

  // Filtered entries
  const filteredEntries = entries.filter(e => {
    const matchesSearch = e.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          e.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMood = selectedFilterMood === 'all' || e.mood === selectedFilterMood;
    const matchesTag = selectedFilterTag === 'all' || e.tags?.includes(selectedFilterTag);
    return matchesSearch && matchesMood && matchesTag;
  });

  // Calculate stats
  const totalEntriesCount = entries.length;

  // Most frequent mood
  const moodBreakdown = entries.reduce((acc, curr) => {
    if (curr.mood) {
      acc[curr.mood] = (acc[curr.mood] || 0) + 1;
    }
    return acc;
  }, {});

  const moodKeys = Object.keys(moodBreakdown);
  const topMood = moodKeys.length > 0
    ? moodKeys.reduce((a, b) => moodBreakdown[a] > moodBreakdown[b] ? a : b)
    : null;
  const topMoodDetails = topMood ? MOODS.find(m => m.value === topMood) : null;
  const totalMoodEntries = Object.values(moodBreakdown).reduce((a, b) => a + b, 0);
  const deletingLastTodayJournal = entryPendingDelete
    ? entries.filter(entry => entry.date === getTodayDateString()).length <= 1
    : false;

  return (
    <div 
      className="journal-container d-flex flex-column"
      style={{
        height: '100dvh', // Use 100dvh for correct mobile viewport height and scrolling
        background: themeConfig.background,
        color: themeConfig.textColor,
        fontFamily: "'Outfit', 'Inter', sans-serif",
        transition: 'all 0.4s ease',
      }}
    >
      {/* Dynamic Keyframe Animations & Theme overrides */}
      <style>{`
        .journal-container {
          --journal-text: ${themeConfig.textColor};
          --journal-text-secondary: ${themeConfig.secondaryText};
          --journal-input-bg: ${themeConfig.inputBg};
          --journal-border: ${themeConfig.borderColor};
          --journal-card-bg: ${themeConfig.cardBg};
        }
        .journal-container .text-white { color: var(--journal-text) !important; }
        .journal-container .text-white-50 { color: var(--journal-text-secondary) !important; }
        .journal-container .bg-black.bg-opacity-25 { background-color: var(--journal-input-bg) !important; }
        .journal-container .bg-dark { background-color: var(--journal-card-bg) !important; color: var(--journal-text) !important; }
        .journal-container .border-secondary { border-color: var(--journal-border) !important; }
        .journal-container .btn-outline-light { 
          border-color: var(--journal-border) !important; 
          color: var(--journal-text) !important; 
        }
        .journal-container .btn-outline-light:hover { 
          background-color: var(--journal-text) !important; 
          color: #000 !important; 
        }
        
        @keyframes pageFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-page {
          animation: pageFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .journal-theme-btn {
          width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--journal-border); cursor: pointer; transition: transform 0.2s;
        }
        .journal-theme-btn:hover { transform: scale(1.2); }
        .journal-theme-btn.active-theme {
          border: 2px solid #fff;
          transform: scale(1.15);
          box-shadow: 0 0 8px rgba(255,255,255,0.6);
        }
        .mood-card {
          cursor: pointer; border-radius: 16px; border: 1px solid var(--journal-border); transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .mood-card:hover { transform: translateY(-4px) scale(1.05); }
        .mood-card.active { border-color: ${themeConfig.accent} !important; background: var(--journal-input-bg) !important; }
        .history-card {
          border: 1px solid var(--journal-border); background: var(--journal-card-bg); border-radius: 16px; transition: all 0.25s;
        }
        .history-card:hover { transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        .journal-tag {
          font-size: 0.72rem; padding: 3px 8px; border-radius: 99px; background: var(--journal-input-bg); color: var(--journal-text); border: 1px solid var(--journal-border); cursor: pointer; transition: all 0.15s;
        }
        .journal-tag:hover { background: ${themeConfig.accent}; color: #000; }
        .ambient-eq {
          display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; margin-left: 6px;
        }
        .ambient-bar {
          width: 2px; height: 100%; background-color: ${themeConfig.accent}; border-radius: 1px; animation: eqBounce 0.8s ease-in-out infinite alternate;
        }
        .ambient-bar:nth-child(2) { animation-delay: 0.2s; }
        .ambient-bar:nth-child(3) { animation-delay: 0.4s; }
        @keyframes eqBounce {
          0% { height: 3px; }
          100% { height: 12px; }
        }
      `}</style>

      {/* ─── HEADER ─────────────────────────────────────────────────── */}
      <header 
        className="d-flex align-items-center justify-content-between px-3 py-3 border-bottom flex-shrink-0"
        style={{ borderColor: themeConfig.borderColor, backdropFilter: 'blur(10px)', background: 'rgba(0,0,0,0.2)' }}
      >
        <div className="d-flex align-items-center gap-3">
          <button 
            type="button" 
            className="btn btn-outline-light border-0 shadow-none hover-scale rounded-circle p-2 d-flex align-items-center justify-content-center"
            onClick={onBack}
            aria-label="Go Back"
            style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)' }}
          >
            <i className="bi bi-arrow-left fs-5" />
          </button>
          <div>
            <h4 className="fw-extrabold m-0 text-white d-flex align-items-center gap-2">
              📓 Professional Journal
            </h4>
            <small className="text-white-50">Create, reflect, and trace your consistency & thoughts</small>
          </div>
        </div>

        <div className="d-flex align-items-center gap-3">
          {/* Theme Selector */}
          <div className="d-flex gap-1 align-items-center bg-black bg-opacity-25 rounded-pill px-2 py-1">
            <span className="small text-white-50 me-1" style={{ fontSize: '0.72rem' }}>Theme:</span>
            <div className={`journal-theme-btn ${selectedTheme === 'midnight' ? 'active-theme' : ''}`} style={{ background: STYLES_AND_THEMES.midnight.background }} onClick={() => setSelectedTheme('midnight')} title="Midnight" />
            <div className={`journal-theme-btn ${selectedTheme === 'emerald' ? 'active-theme' : ''}`} style={{ background: STYLES_AND_THEMES.emerald.background }} onClick={() => setSelectedTheme('emerald')} title="Emerald" />
            <div className={`journal-theme-btn ${selectedTheme === 'peach' ? 'active-theme' : ''}`} style={{ background: STYLES_AND_THEMES.peach.background }} onClick={() => setSelectedTheme('peach')} title="Sunset" />
            <div className={`journal-theme-btn ${selectedTheme === 'classic' ? 'active-theme' : ''}`} style={{ background: STYLES_AND_THEMES.classic.background }} onClick={() => setSelectedTheme('classic')} title="Classic" />
          </div>
        </div>
      </header>

      {/* ─── SCROLLABLE MAIN LAYOUT ──────────────────────────────────── */}
      <main className="flex-grow-1 overflow-auto p-3 animate-page" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="mx-auto" style={{ maxWidth: '1000px' }}>
          
          {/* Quick Metrics Bar */}
          <div className="row g-2 mb-4">
            <div className="col-4">
              <div className="p-3 text-center rounded-4 h-100" style={{ background: themeConfig.cardBg, border: `1px solid var(--journal-border)` }}>
                <div className="text-white-50 fw-bold text-uppercase mb-1" style={{ fontSize: '0.68rem', letterSpacing: '0.6px' }}>📝 Total Logs</div>
                <div className="fw-extrabold fs-4 text-white">{totalEntriesCount}</div>
              </div>
            </div>
            <div className="col-8">
              <div className="p-3 rounded-4 h-100" style={{ background: themeConfig.cardBg, border: `1px solid var(--journal-border)` }}>
                <div className="text-white-50 fw-bold text-uppercase mb-1 text-center" style={{ fontSize: '0.68rem', letterSpacing: '0.6px' }}>🎭 Mood Breakdown</div>
                {totalMoodEntries > 0 ? (
                  <div className="d-flex flex-column gap-1 mt-1">
                    {MOODS.filter(m => moodBreakdown[m.value]).map(m => {
                      const count = moodBreakdown[m.value];
                      const pct = Math.round((count / totalMoodEntries) * 100);
                      return (
                        <div key={m.value} className="d-flex align-items-center gap-1" style={{ fontSize: '0.7rem' }}>
                          <span style={{ width: '20px', textAlign: 'center' }}>{m.emoji}</span>
                          <div className="flex-grow-1" style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: m.color, transition: 'width 0.5s ease' }} />
                          </div>
                          <span className="text-white-50 fw-bold" style={{ width: '30px', textAlign: 'right', fontSize: '0.65rem' }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center text-white-50" style={{ fontSize: '0.8rem', marginTop: '4px' }}>No data yet</div>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="d-flex justify-content-center mb-4">
            <div className="btn-group p-1 bg-black bg-opacity-25 rounded-pill" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <button 
                type="button"
                onClick={() => setActiveTab('edit')} 
                className={`btn btn-sm rounded-pill px-4 py-2 fw-bold text-white border-0 ${activeTab === 'edit' ? 'bg-primary' : 'bg-transparent'}`}
                style={{ backgroundColor: activeTab === 'edit' ? `${themeConfig.accent} !important` : 'transparent', color: activeTab === 'edit' ? '#000 !important' : '#fff' }}
              >
                ✏️ Write Entry
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab('history')} 
                className={`btn btn-sm rounded-pill px-4 py-2 fw-bold text-white border-0 ${activeTab === 'history' ? 'bg-primary' : 'bg-transparent'}`}
                style={{ backgroundColor: activeTab === 'history' ? `${themeConfig.accent} !important` : 'transparent', color: activeTab === 'history' ? '#000 !important' : '#fff' }}
              >
                📂 Journal History ({filteredEntries.length})
              </button>
            </div>
          </div>

          {/* ─── TAB 1: WRITE/EDIT ENTRY ──────────────────────────────── */}
          {activeTab === 'edit' && (
            <div className="row g-3">
              {/* Writer Form */}
              <div className="col-12 col-md-8">
                <form onSubmit={handleSave} className="p-4 rounded-4" style={{ background: themeConfig.cardBg, border: `1px solid ${themeConfig.borderColor}` }}>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="fw-bold m-0 text-white">{editId ? '📝 Edit Journal' : '✍️ Write Reflection'}</h5>
                    <input 
                      type="date" 
                      value={journalDate} 
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setJournalDate(newDate);
                        // Check if an entry already exists for this date
                        const existingEntry = entries.find(en => en.date === newDate);
                        if (existingEntry) {
                          setEditId(existingEntry.id);
                          setTitle(existingEntry.title || '');
                          setContent(existingEntry.content || '');
                          setSelectedMood(existingEntry.mood || 'calm');
                          setTags(existingEntry.tags || []);
                        } else {
                          // Check for a saved draft for this date
                          const draftData = localStorage.getItem(`journal_draft_new_${newDate}`);
                          if (draftData) {
                            try {
                              const draft = JSON.parse(draftData);
                              setEditId(null);
                              setTitle(draft.title || '');
                              setContent(draft.content || '');
                              setSelectedMood(draft.mood || 'calm');
                              setTags(draft.tags || []);
                            } catch(err) {
                              setEditId(null);
                              setTitle('');
                              setContent('');
                              setSelectedMood('calm');
                              setTags([]);
                            }
                          } else {
                            // No entry and no draft — fresh form
                            setEditId(null);
                            setTitle('');
                            setContent('');
                            setSelectedMood('calm');
                            setTags([]);
                          }
                        }
                      }}
                      className="form-control form-control-sm text-white border-secondary bg-black bg-opacity-25 rounded-3 w-auto border-0"
                      style={{ outline: 'none' }}
                    />
                  </div>

                  {/* Title */}
                  <div className="mb-3">
                    <input 
                      type="text" 
                      placeholder="Title of this page (Optional)..." 
                      value={title} 
                      onChange={(e) => setTitle(e.target.value)}
                      className="form-control bg-transparent text-white border-0 fs-5 px-0 fw-bold shadow-none"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  </div>

                  {/* Editor Tool buttons */}
                  <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
                    <button 
                      type="button" 
                      className="btn btn-sm btn-outline-light border-0 py-1 px-2 d-flex align-items-center gap-1 rounded-3" 
                      style={{ background: 'rgba(255,255,255,0.05)', fontSize: '0.75rem' }}
                      onClick={applyRandomPrompt}
                    >
                      💡 Random Prompt
                    </button>
                    
                    {/* Ambient Sound Controller */}
                    <div className="d-flex align-items-center gap-1 bg-black bg-opacity-25 rounded-3 px-2 py-1" style={{ fontSize: '0.75rem' }}>
                      <span>🎧 Sound:</span>
                      {['off', 'rain', 'waves'].map(type => (
                        <button
                          key={type}
                          type="button"
                          className={`btn btn-sm border-0 py-0 px-1 text-capitalize ${ambientSound === type ? 'text-info fw-bold' : 'text-white-50'}`}
                          onClick={() => handleAmbientChange(type)}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {type}
                        </button>
                      ))}
                      {ambientSound !== 'off' && (
                        <div className="ambient-eq">
                          <div className="ambient-bar" />
                          <div className="ambient-bar" />
                          <div className="ambient-bar" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Text Editor content */}
                  <div className="mb-3">
                    <textarea 
                      rows="8" 
                      placeholder="Write down your thoughts, struggles, insights or wins..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="form-control bg-transparent text-white border-0 px-0 shadow-none"
                      style={{ resize: 'none', lineHeight: '1.6', fontSize: '0.95rem' }}
                      required
                    />
                  </div>

                  {/* Editor Stats Footer */}
                  <div className="d-flex justify-content-between text-white-50 border-top pt-2 mb-3" style={{ fontSize: '0.75rem', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <span>🔠 {charCount} chars &bull; 🔤 {wordCount} words</span>
                    <span>⏱️ ~{readingTime} min read</span>
                  </div>

                  {/* Mood Selector inside Editor */}
                  <div className="mb-3">
                    <label className="text-white-50 small mb-2 fw-bold text-uppercase d-block" style={{ fontSize: '0.68rem', letterSpacing: '0.8px' }}>How do you feel today?</label>
                    <div className="row g-2">
                      {MOODS.map(m => (
                        <div key={m.value} className="col-3 col-sm-2">
                          <button
                            type="button"
                            className={`btn w-100 p-2 border-0 rounded-4 text-center d-flex flex-column align-items-center justify-content-center transition-all ${selectedMood === m.value ? 'active bg-white bg-opacity-10' : 'bg-black bg-opacity-25'}`}
                            onClick={() => setSelectedMood(m.value)}
                            style={{ 
                              outline: 'none', 
                              border: selectedMood === m.value ? `2px solid ${themeConfig.accent}` : '2px solid transparent',
                              transform: selectedMood === m.value ? 'scale(1.05)' : 'none'
                            }}
                          >
                            <span style={{ fontSize: '1.4rem' }}>{m.emoji}</span>
                            <span className="text-white mt-1" style={{ fontSize: '0.68rem' }}>{m.label}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags input inside Editor */}
                  <div className="mb-3">
                    <label className="text-white-50 small mb-2 fw-bold text-uppercase d-block" style={{ fontSize: '0.68rem', letterSpacing: '0.8px' }}>Categorize (Tags)</label>
                    <div className="d-flex flex-wrap gap-1 mb-2">
                      {tags.map(t => (
                        <span key={t} className="badge bg-danger rounded-pill d-flex align-items-center gap-1 py-1 px-2" style={{ backgroundColor: themeConfig.accent, color: '#000' }}>
                          #{t}
                          <i className="bi bi-x-circle-fill cursor-pointer" onClick={() => handleRemoveTag(t)} />
                        </span>
                      ))}
                    </div>
                    <div className="d-flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Add custom tag... (press Enter)"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag(newTagInput);
                          }
                        }}
                        className="form-control form-control-sm text-white border-secondary bg-black bg-opacity-25 rounded-3 border-0"
                      />
                      <button 
                        type="button" 
                        onClick={() => handleAddTag(newTagInput)}
                        className="btn btn-sm btn-outline-light rounded-3 px-3 border-0"
                        style={{ background: 'rgba(255,255,255,0.06)' }}
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Submit / Cancel Buttons */}
                  <div className="d-flex gap-2 pt-2">
                    <button 
                      type="submit" 
                      className="btn text-black fw-bold rounded-pill px-4"
                      style={{ background: themeConfig.accent }}
                    >
                      {editId ? '💾 Save Changes' : '💾 Save Journal'}
                    </button>
                    {editId && (
                      <button 
                        type="button" 
                        onClick={resetForm}
                        className="btn btn-outline-light rounded-pill px-4"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Sidebar Helpers / Prompts info */}
              <div className="col-12 col-md-4">
                <div className="p-4 rounded-4" style={{ background: themeConfig.cardBg, border: `1px solid ${themeConfig.borderColor}` }}>
                  <h6 className="fw-bold mb-3 text-white">💡 Writing Prompts Idea</h6>
                  <p className="text-white-50 small mb-3">Feeling stuck? Try responding to one of these prompts to start journaling:</p>
                  
                  <div className="d-flex flex-column gap-2">
                    {WRITING_PROMPTS.map((p, idx) => (
                      <div 
                        key={idx} 
                        className="p-2.5 rounded-3 cursor-pointer hover-scale transition-all"
                        onClick={() => {
                          setContent(prev => {
                            const prefix = prev ? prev + '\n\n' : '';
                            return prefix + `✍️ Prompt: ${p}\n`;
                          });
                        }}
                        style={{ background: 'rgba(255,255,255,0.04)', fontSize: '0.78rem', border: '1px solid rgba(255,255,255,0.03)' }}
                      >
                        {p}
                      </div>
                    ))}
                  </div>

                  <hr className="my-3 border-secondary" style={{ opacity: 0.3 }} />
                  <h6 className="fw-bold mb-2 text-white">🏷️ Preset Tags</h6>
                  <div className="d-flex flex-wrap gap-1">
                    {PRESETS_TAGS.map(t => (
                      <span 
                        key={t} 
                        className="badge bg-secondary rounded-pill px-2 py-1 cursor-pointer"
                        onClick={() => handleAddTag(t)}
                        style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.06)' }}
                      >
                        +{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── TAB 2: JOURNAL HISTORY ──────────────────────────────── */}
          {activeTab === 'history' && (
            <div>
              {/* Search & Filter bar */}
              <div className="p-3 rounded-4 mb-3" style={{ background: themeConfig.cardBg, border: `1px solid ${themeConfig.borderColor}` }}>
                <div className="row g-2">
                  <div className="col-12 col-sm-6">
                    <div className="input-group">
                      <span className="input-group-text bg-transparent text-white-50 border-0"><i className="bi bi-search" /></span>
                      <input 
                        type="text" 
                        placeholder="Search logs..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control bg-transparent text-white border-0 shadow-none small"
                      />
                    </div>
                  </div>
                  <div className="col-6 col-sm-3">
                    <select 
                      value={selectedFilterMood}
                      onChange={(e) => setSelectedFilterMood(e.target.value)}
                      className="form-select bg-black bg-opacity-25 text-white border-0 small rounded-3"
                    >
                      <option value="all" className="bg-dark">All Moods</option>
                      {MOODS.map(m => <option key={m.value} value={m.value} className="bg-dark">{m.emoji} {m.label}</option>)}
                    </select>
                  </div>
                  <div className="col-6 col-sm-3">
                    <select 
                      value={selectedFilterTag}
                      onChange={(e) => setSelectedFilterTag(e.target.value)}
                      className="form-select bg-black bg-opacity-25 text-white border-0 small rounded-3"
                    >
                      <option value="all" className="bg-dark">All Tags</option>
                      {/* Pull unique tags dynamically */}
                      {[...new Set(entries.flatMap(e => e.tags || []))].map(t => (
                        <option key={t} value={t} className="bg-dark">#{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Timeline list of entries */}
              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-light" role="status" />
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="text-center py-5 rounded-4" style={{ background: themeConfig.cardBg, border: `1px solid ${themeConfig.borderColor}` }}>
                  <i className="bi bi-journal-x fs-1 text-white-50 mb-2" />
                  <h6 className="text-white-50">No journal logs found matching filters.</h6>
                  <button type="button" onClick={resetForm} className="btn btn-sm btn-outline-light rounded-pill mt-2">Write First Entry</button>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {filteredEntries.map(entry => {
                    const moodObj = MOODS.find(m => m.value === entry.mood) || MOODS[2];
                    const docDate = new Date(entry.date + 'T12:00:00');
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    const isExpired = !isNaN(docDate) && docDate < thirtyDaysAgo;
                    const isToday = entry.date === getTodayDateString();
                    const isDeletable = isToday || isExpired;
                    
                    return (
                      <div key={entry.id} className="history-card p-4">
                        <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                          <div>
                            <span 
                              className="badge rounded-pill fw-bold py-1 px-2.5 me-2"
                              style={{ background: moodObj.bg, color: moodObj.color }}
                            >
                              {moodObj.emoji} {moodObj.label}
                            </span>
                            <span className="text-white-50 small">{entry.date}</span>
                          </div>
                          
                          {/* Actions */}
                          <div className="d-flex gap-1">
                            <button 
                              type="button" 
                              className="btn btn-sm text-white-50 border-0 hover-scale p-1 d-flex align-items-center justify-content-center rounded-circle"
                              onClick={() => handleEditSelect(entry)}
                              title="Edit Entry"
                              style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.04)' }}
                            >
                              <i className="bi bi-pencil" style={{ fontSize: '0.85rem' }} />
                            </button>
                            <button 
                              type="button" 
                              className="btn btn-sm text-white-50 border-0 hover-scale p-1 d-flex align-items-center justify-content-center rounded-circle"
                              onClick={() => handleExportText(entry)}
                              title="Export Text"
                              style={{ width: '32px', height: '32px', background: 'rgba(255,255,255,0.04)' }}
                            >
                              <i className="bi bi-download" style={{ fontSize: '0.85rem' }} />
                            </button>
                            <button 
                              type="button" 
                              className={`btn btn-sm border-0 p-1 d-flex align-items-center justify-content-center rounded-circle ${isDeletable ? 'text-danger hover-scale' : 'text-white-50'}`}
                              disabled={!isDeletable}
                              onClick={() => {
                                if (isDeletable) setEntryPendingDelete(entry);
                              }}
                              title={isDeletable ? (isExpired ? 'Delete Expired Entry' : 'Delete Entry') : 'Only today\'s entries or entries older than 30 days can be deleted'}
                              style={{ width: '32px', height: '32px', background: 'rgba(244,67,54,0.08)' }}
                            >
                              <i className={`bi ${isDeletable ? 'bi-trash' : 'bi-lock-fill'}`} style={{ fontSize: '0.85rem' }} />
                            </button>
                          </div>
                        </div>

                        <h5 className="fw-bold text-white mb-2">{entry.title}</h5>
                        <p className="text-white-50 small mb-3" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                          {entry.content}
                        </p>

                        {/* Tags list */}
                        {entry.tags && entry.tags.length > 0 && (
                          <div className="d-flex flex-wrap gap-1">
                            {entry.tags.map(t => (
                              <span 
                                key={t} 
                                className="badge bg-dark rounded-pill px-2.5 py-1 text-white-50 border"
                                onClick={() => setSelectedFilterTag(t)}
                                style={{ fontSize: '0.68rem', cursor: 'pointer', borderColor: 'rgba(255,255,255,0.08)' }}
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {entryPendingDelete && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ background: 'rgba(0,0,0,0.78)', zIndex: 1100, backdropFilter: 'blur(5px)' }}>
          <div className="rounded-4 p-4 shadow-lg w-100 animate-slide-up" style={{ maxWidth: '420px', background: themeConfig.cardBg, border: `1px solid ${themeConfig.borderColor}` }}>
            <div className="text-center">
              <div className="fs-1 mb-2">⚠️</div>
              <h5 className="fw-bold mb-2">Delete Journal Entry</h5>
              <p className="small mb-4" style={{ color: themeConfig.secondaryText }}>
                {entryPendingDelete?.date === getTodayDateString() 
                  ? (deletingLastTodayJournal 
                    ? 'Deleting your only journal for today will make your daily streak requirements incomplete. Your current streak may be reduced until you save a journal for today again.' 
                    : 'You have another journal entry for today, so deleting this entry will not remove the journal requirement.')
                  : 'Deleting this old journal will permanently remove it. Your current points and daily streaks will remain unaffected.'}
              </p>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-light rounded-pill flex-grow-1 fw-bold" onClick={() => setEntryPendingDelete(null)}>
                  Keep Journal
                </button>
                <button
                  className="btn btn-danger rounded-pill flex-grow-1 fw-bold"
                  onClick={async () => {
                    await deleteJournalEntry(entryPendingDelete.id);
                    setEntryPendingDelete(null);
                  }}
                >
                  Delete Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
