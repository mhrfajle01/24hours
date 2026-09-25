import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './RareEvent.css';

export default function RareEvent({ type = 'box', result = '💎', onClose }) {
  const [opened, setOpened] = useState(false);
  const [particles, setParticles] = useState([]);

  const handleInteract = () => {
    if (opened) return onClose();
    setOpened(true);
    
    // Choose particle colors based on type
    const colors = 
      type === 'streak' ? ['#ff4500', '#ff8c00', '#ffd700', '#fff'] :
      type === 'purchase' ? ['#28a745', '#20c997', '#fff', '#ffd700'] :
      type === 'freeze' ? ['#00BFFF', '#87CEFA', '#E0F7FF', '#fff'] :
      type === 'excuse' ? ['#FFD700', '#FFA500', '#FF6347', '#fff'] :
      ['#FF1493', '#00FF00', '#00FFFF', '#FFD700'];

    const newParticles = Array.from({ length: 40 }).map((_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 50 + Math.random() * 150;
      return { id: i, color: colors[Math.floor(Math.random() * 4)], tx: Math.cos(angle) * velocity, ty: Math.sin(angle) * velocity };
    });
    setParticles(newParticles);
  };

  return createPortal(
    <div className="rare-overlay" onClick={handleInteract}>
      <div className="rare-container">
        {opened && (
          <div className="particle-container">
            {particles.map(p => (
              <div key={p.id} className="particle" style={{ background: p.color, animation: `explode-${p.id} 1s ease-out forwards` }} />
            ))}
            <style>
              {particles.map(p => `@keyframes explode-${p.id} { 0% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 100% { transform: translate(calc(-50% + ${p.tx}px), calc(-50% + ${p.ty}px)) scale(0); opacity: 0; } }`).join('\n')}
            </style>
          </div>
        )}

        {!opened ? (
          type === 'box' ? <div className="rare-box">🎁</div> :
          type === 'card' ? <div className="rare-card-inner"><div className="rare-card-front">❓</div><div className="rare-card-back"></div></div> :
          type === 'streak' ? <div className="rare-streak-icon">🔥</div> :
          type === 'freeze' ? <div className="rare-freeze-icon">🧊</div> :
          type === 'excuse' ? <div className="rare-excuse-icon">🛡️</div> :
          <div className="rare-purchase-icon">🛍️</div>
        ) : (
          type === 'box' ? <div className="rare-result">{result}</div> :
          type === 'card' ? <div className="rare-card-inner flipped"><div className="rare-card-front"></div><div className="rare-card-back">{result}</div></div> :
          type === 'streak' ? <div className="rare-streak-result">{result}</div> :
          type === 'freeze' ? <div className="rare-freeze-result">{result}</div> :
          type === 'excuse' ? <div className="rare-excuse-result">{result}</div> :
          <div className="rare-purchase-result">{result}</div>
        )}
      </div>

      <div className="rare-title">
        {opened ? 'Awesome!' : 
         type === 'card' ? 'Tap to Reveal' : 
         type === 'streak' ? 'Tap to Ignite' :
         type === 'freeze' ? 'Tap to Activate Freeze' :
         type === 'excuse' ? 'Tap to Excuse Day' :
         type === 'purchase' ? 'Tap to Claim' :
         'Tap to Open Box'}
      </div>
    </div>,
    document.body
  );
}
