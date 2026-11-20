import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { queryLocalAI, getLocalAIKnowledge, saveLocalAIKnowledge } from '../utils/localAIEngine';
import { executeShiftAIAction } from '../utils/shiftAIAccess';
import { BOT_COMMANDS, formatAllCommandsHelp } from '../utils/aiCommandRegistry';

export default function LocalAIPage({ onBack, currentUser, onOpenShiftTracker }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('local_ai_chat_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [topicCount, setTopicCount] = useState(0);
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0);
  const inputRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingText, setTypingText] = useState('');
  const typingRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [viewportHeight, setViewportHeight] = useState('100%');
  const [viewportTop, setViewportTop] = useState(0);

  useEffect(() => {
    // Prevent background window scrolling completely while LocalAIPage is open
    const prevOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPosition = document.body.style.position;
    const prevBodyHeight = document.body.style.height;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    // Track visualViewport for on-screen mobile keyboard (WhatsApp / Chrome exact positioning)
    if (!window.visualViewport) return;
    const updateViewport = () => {
      setViewportHeight(`${window.visualViewport.height}px`);
      setViewportTop(window.visualViewport.offsetTop || 0);
      window.scrollTo(0, 0);
    };

    window.visualViewport.addEventListener('resize', updateViewport);
    window.visualViewport.addEventListener('scroll', updateViewport);
    updateViewport();

    return () => {
      document.documentElement.style.overflow = prevOverflow;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.position = prevBodyPosition;
      document.body.style.width = '';
      document.body.style.height = prevBodyHeight;
      window.visualViewport.removeEventListener('resize', updateViewport);
      window.visualViewport.removeEventListener('scroll', updateViewport);
    };
  }, []);

  useEffect(() => {
    // 1. Initial count from local
    setTopicCount(getLocalAIKnowledge().length);

    // 2. Fetch latest synced knowledge from Cloud Firestore
    const syncCloudKnowledge = async () => {
      try {
        const snap = await getDoc(doc(db, 'aiKnowledgeBase', 'dataset'));
        if (snap.exists() && Array.isArray(snap.data()?.items)) {
          const cloudItems = snap.data().items;
          saveLocalAIKnowledge(cloudItems);
          setTopicCount(cloudItems.length);
        }
      } catch (e) {
        // Offline or permissions, silent fallback to local knowledge
      }
    };
    syncCloudKnowledge();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('local_ai_chat_history', JSON.stringify(messages));
    } catch {}
    // Scroll to bottom only when a new message is added, not continuously
    if (messages.length > 0 && !isTyping) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isTyping]);

  useEffect(() => {
    if (typingRef.current) clearInterval(typingRef.current);
  }, []);

  // Filter matching slash commands
  const filteredCommands = input.startsWith('/')
    ? BOT_COMMANDS.filter(c => c.cmd.toLowerCase().startsWith(input.toLowerCase().trim()) || input.trim() === '/' || (c.aliases && c.aliases.some(a => a.toLowerCase().startsWith(input.toLowerCase().trim()))))
    : [];

  useEffect(() => {
    setSelectedCmdIdx(0);
  }, [input]);

  const handleKeyDown = (e) => {
    // If slash suggestions are open
    if (filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCmdIdx(prev => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCmdIdx(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredCommands[selectedCmdIdx] || filteredCommands[0];
        if (selected) {
          setInput(selected.cmd);
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        // If a command is selected from the dropdown
        const selected = filteredCommands[selectedCmdIdx];
        if (selected && input !== selected.cmd && !selected.cmd.endsWith(' ')) {
          e.preventDefault();
          handleSend(selected.cmd);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput('');
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = (textToSend) => {
    const q = (textToSend || input).trim();
    if (!q || isTyping) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = { id: Date.now(), sender: 'user', text: q, time: now };
    const aiId = Date.now() + 1;
    
    // Check for clear command
    if (q.toLowerCase() === '/clear' || q.toLowerCase() === '/cls') {
      handleClearChat();
      return;
    }

    // Check for /command run or /help
    if (q.toLowerCase() === '/command run' || q.toLowerCase() === '/commands' || q.toLowerCase() === '/help') {
      const helpText = formatAllCommandsHelp();
      setMessages(prev => [...prev, userMsg, { id: aiId, sender: 'ai', text: helpText, time: now }]);
      setInput('');
      return;
    }

    // Check if user is asking for Shift Tracker action or slash commands
    const shiftAction = executeShiftAIAction(q, currentUser?.uid);
    if (shiftAction.action === 'open_shift' && onOpenShiftTracker) {
      setTimeout(() => onOpenShiftTracker(), 1200);
    }
    const answer = shiftAction.handled ? shiftAction.text : queryLocalAI(q);

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTypingText('');

    // Word-by-word typing animation
    const words = answer.split(' ');
    let i = 0;
    typingRef.current = setInterval(() => {
      i++;
      setTypingText(words.slice(0, i).join(' '));
      if (i >= words.length) {
        clearInterval(typingRef.current);
        typingRef.current = null;
        setIsTyping(false);
        setTypingText('');
        setMessages(prev => [...prev, { id: aiId, sender: 'ai', text: answer, time: now }]);
      }
    }, 40);
  };

  const handleClearChat = () => {
    setMessages([]);
    localStorage.removeItem('local_ai_chat_history');
  };

  return (
    <div style={{ position: 'fixed', top: viewportTop, left: 0, right: 0, height: viewportHeight, background: '#090D16', color: '#F8FAFC', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 99999, overscrollBehavior: 'none' }}>
      {/* Top Header */}
      <header style={{ flexShrink: 0, zIndex: 100, background: 'rgba(9, 13, 22, 0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} type="button" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#F8FAFC', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <i className="bi bi-chevron-left" style={{ fontSize: 16 }} />
          </button>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,0.35)' }}>
            <i className="bi bi-robot text-white" style={{ fontSize: 18 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.3px' }}>MHR BOT</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399', fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} /> ONLINE
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>Always active • Instant answers</div>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClearChat} type="button" style={{ background: 'transparent', border: 'none', color: '#94A3B8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <i className="bi bi-trash3" /> Clear
          </button>
        )}
      </header>

      {/* WhatsApp-style Scrollable Messages Area */}
      <main style={{ flex: '1 1 0%', minHeight: 0, height: '100%', overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain', padding: '16px 14px', maxWidth: 840, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 22, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 30px rgba(99,102,241,0.35)' }}>
              <i className="bi bi-robot text-white" style={{ fontSize: 30 }} />
            </div>
            <h4 style={{ fontWeight: 800, marginBottom: 8, fontSize: 20, letterSpacing: '-0.3px' }}>How can I help you today?</h4>
            <p style={{ color: '#94A3B8', fontSize: 13, maxWidth: 400, lineHeight: 1.5, marginBottom: 12 }}>
              যেকোনো প্রশ্ন লিখে মেসেজ পাঠান। শিফট সংক্রান্ত কাজ করতে <span style={{ color: '#818CF8', fontFamily: 'monospace', fontWeight: 600 }}>/shift</span> লিখে কমান্ড ড্রপডাউন ব্যবহার করুন।
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 10 }}>
            {messages.map(m => (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                {m.sender === 'ai' && (
                  <div style={{ width: 28, height: 28, borderRadius: 10, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <i className="bi bi-robot" style={{ fontSize: 13, color: '#fff' }} />
                  </div>
                )}
                <div>
                  <div style={{ padding: '10px 14px', borderRadius: m.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: m.sender === 'user' ? '#4F46E5' : 'rgba(255,255,255,0.06)', border: m.sender === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)', color: '#F8FAFC', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-line', boxShadow: m.sender === 'user' ? '0 4px 15px rgba(79,70,229,0.25)' : 'none' }}>
                    {m.text}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748B', marginTop: 3, textAlign: m.sender === 'user' ? 'right' : 'left' }}>
                    {m.time}
                  </div>
                </div>
              </div>
            ))}
            {/* Typing animation bubble */}
            {isTyping && (
              <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start', maxWidth: '85%' }}>
                <div style={{ width: 28, height: 28, borderRadius: 10, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <i className="bi bi-robot" style={{ fontSize: 13, color: '#fff' }} />
                </div>
                <div>
                  <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#F8FAFC', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {typingText || <span style={{ display: 'inline-flex', gap: 4 }}><span className="typing-dot" /><span className="typing-dot" style={{ animationDelay: '0.2s' }} /><span className="typing-dot" style={{ animationDelay: '0.4s' }} /></span>}
                    <span style={{ display: 'inline-block', width: 2, height: 16, background: '#818CF8', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 0.6s infinite' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* WhatsApp-style Fixed Bottom Typing Bar */}
      <footer style={{ position: 'relative', flexShrink: 0, zIndex: 100, background: 'rgba(9, 13, 22, 0.98)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px max(8px, env(safe-area-inset-bottom))' }}>
        {/* Termux / Desktop style Auto Suggestion Popup with Keyboard Navigation */}
        {filteredCommands.length > 0 && (
          <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#0F172A', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 -10px 25px rgba(0,0,0,0.5)', maxHeight: 240, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain', touchAction: 'pan-y', padding: '6px 8px' }}>
            <div style={{ padding: '4px 8px', fontSize: 10, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Available Commands</span>
              <span>Use ↑ ↓ to navigate • Tab to fill • Enter to run</span>
            </div>
            {filteredCommands.map((c, idx) => {
              const isSelected = idx === selectedCmdIdx;
              return (
                <button
                  key={c.cmd}
                  type="button"
                  onClick={() => {
                    if (c.cmd.endsWith(' ')) {
                      setInput(c.cmd);
                      inputRef.current?.focus();
                    } else {
                      handleSend(c.cmd);
                    }
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: isSelected ? 'rgba(99,102,241,0.22)' : 'transparent',
                    border: isSelected ? '1px solid rgba(99,102,241,0.4)' : '1px solid transparent',
                    borderRadius: 8,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease'
                  }}
                  onMouseEnter={() => setSelectedCmdIdx(idx)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="bi bi-terminal" style={{ color: isSelected ? '#A5B4FC' : '#818CF8', fontSize: 13 }} />
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: isSelected ? '#67E8F9' : '#38BDF8' }}>{c.cmd}</span>
                  </div>
                  <span style={{ fontSize: 11, color: isSelected ? '#E2E8F0' : '#94A3B8' }}>{c.desc}</span>
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); handleSend(); }} style={{ maxWidth: 840, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isTyping ? 'MHR BOT লিখছে...' : 'মেসেজ লিখুন অথবা / টাইপ করুন...'}
            disabled={isTyping}
            style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 24, padding: '10px 16px', fontSize: 14, outline: 'none' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            style={{ width: 42, height: 42, borderRadius: '50%', background: input.trim() && !isTyping ? 'linear-gradient(135deg, #6366F1, #8B5CF6)' : 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !isTyping ? 'pointer' : 'default', flexShrink: 0, opacity: input.trim() && !isTyping ? 1 : 0.5, transition: 'all 0.2s ease' }}
          >
            <i className="bi bi-send-fill" style={{ fontSize: 15 }} />
          </button>
        </form>
      </footer>
    </div>
  );
}
