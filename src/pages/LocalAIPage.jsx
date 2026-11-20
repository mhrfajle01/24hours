import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { queryLocalAI, getLocalAIKnowledge, saveLocalAIKnowledge } from '../utils/localAIEngine';

export default function LocalAIPage({ onBack }) {
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
  const [isTyping, setIsTyping] = useState(false);
  const [typingText, setTypingText] = useState('');
  const typingRef = useRef(null);
  const messagesEndRef = useRef(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingText]);

  // Cleanup typing interval on unmount
  useEffect(() => () => { if (typingRef.current) clearInterval(typingRef.current); }, []);

  const handleSend = (textToSend) => {
    const q = (textToSend || input).trim();
    if (!q || isTyping) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = { id: Date.now(), sender: 'user', text: q, time: now };
    const answer = queryLocalAI(q);
    const aiId = Date.now() + 1;

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
    <div style={{ height: '100dvh', maxHeight: '100dvh', background: '#090D16', color: '#F8FAFC', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
      <main style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 14px', maxWidth: 840, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ width: 64, height: 64, borderRadius: 22, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 30px rgba(99,102,241,0.35)' }}>
              <i className="bi bi-robot text-white" style={{ fontSize: 30 }} />
            </div>
            <h4 style={{ fontWeight: 800, marginBottom: 8, fontSize: 20, letterSpacing: '-0.3px' }}>How can I help you today?</h4>
            <p style={{ color: '#94A3B8', fontSize: 13, maxWidth: 400, lineHeight: 1.5, marginBottom: 12 }}>
              নিচে আপনার প্রশ্ন বা বিষয় লিখে মেসেজ পাঠান।
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
      <footer style={{ flexShrink: 0, background: 'rgba(9, 13, 22, 0.98)', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '8px 12px max(8px, env(safe-area-inset-bottom))' }}>
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} style={{ maxWidth: 840, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 250)}
            placeholder={isTyping ? 'MHR BOT লিখছে...' : 'মেসেজ লিখুন...'}
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
