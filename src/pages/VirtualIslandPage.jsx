import React, { useEffect, useRef, useState } from 'react';
import { db } from '../firebase/firebase';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';

export default function VirtualIslandPage({ currentUser, onBack }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [treeStats, setTreeStats] = useState({ total: 0, blocks: 0, journals: 0, wallets: 0 });
  const [loading, setLoading] = useState(true);

  // Animation and state ref
  const stateRef = useRef({
    trees: [],
    particles: [],
    cameraX: window.innerWidth / 2,
    cameraY: window.innerHeight / 2 + 200,
    targetCameraX: window.innerWidth / 2,
    targetCameraY: window.innerHeight / 2 + 200,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    lastTime: 0
  });

  const themes = {
    block: { leaf: 'rgba(34, 197, 94, 0.9)', glow: '#22c55e' }, // Green for time blocks
    journal: { leaf: 'rgba(59, 130, 246, 0.9)', glow: '#3b82f6' }, // Blue for journals
    wallet: { leaf: 'rgba(234, 179, 8, 0.9)', glow: '#eab308' }, // Yellow for wallets
    streak: { leaf: 'rgba(168, 85, 247, 0.9)', glow: '#a855f7' }
  };

  useEffect(() => {
    let isMounted = true;
    
    const fetchUserData = async () => {
      if (!currentUser?.uid) return;
      try {
        setLoading(true);
        // Fetch completed time blocks
        const blocksQuery = query(collection(db, 'reports'), where('uid', '==', currentUser.uid), where('status', '==', 'Completed'), limit(50));
        const blocksSnap = await getDocs(blocksQuery);
        const blocksCount = blocksSnap.size;

        // Fetch journals
        const journalsQuery = query(collection(db, 'journals'), where('uid', '==', currentUser.uid), limit(50));
        const journalsSnap = await getDocs(journalsQuery);
        const journalsCount = journalsSnap.size;

        // Fetch wallet interactions (proxy via wallets doc)
        const walletDoc = await getDoc(doc(db, 'wallets', currentUser.uid));
        let walletsCount = 0;
        if (walletDoc.exists()) {
          const wData = walletDoc.data();
          if (wData.distributions) walletsCount += wData.distributions.length;
          if (wData.accounts) walletsCount += wData.accounts.length;
        }
        
        // Cap max trees to prevent performance issues
        walletsCount = Math.min(walletsCount, 30);
        
        if (!isMounted) return;

        setTreeStats({
          total: blocksCount + journalsCount + walletsCount,
          blocks: blocksCount,
          journals: journalsCount,
          wallets: walletsCount
        });

        // Generate the ecosystem based on actual data
        const newTrees = [];
        const generateSpirals = (count, actionType) => {
          for(let i=0; i<count; i++) {
            const angle = newTrees.length * Math.PI * 1.37508; // Golden angle
            const radius = 20 + (newTrees.length * 9);
            
            newTrees.push({
              x: Math.cos(angle) * radius + (Math.random() * 10 - 5),
              y: Math.sin(angle) * radius + (Math.random() * 10 - 5),
              size: 30 + Math.random() * 40,
              action: actionType,
              progress: 0,
              delay: Math.random() * 2 // Stagger growth animation
            });
          }
        };

        generateSpirals(blocksCount, 'block');
        generateSpirals(journalsCount, 'journal');
        generateSpirals(walletsCount, 'wallet');
        
        // Add a central anchor tree if ecosystem is empty
        if (newTrees.length === 0) {
           newTrees.push({ x: 0, y: 0, size: 70, action: 'streak', progress: 0, delay: 0 });
        }

        stateRef.current.trees = newTrees;
        setLoading(false);

      } catch (err) {
        console.error("Failed to fetch island data:", err);
        if (isMounted) setLoading(false);
      }
    };

    fetchUserData();

    return () => { isMounted = false; };
  }, [currentUser]);

  // Canvas Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const handleResize = () => {
      if (!containerRef.current) return;
      stateRef.current.width = containerRef.current.clientWidth;
      stateRef.current.height = containerRef.current.clientHeight;
      canvas.width = stateRef.current.width;
      canvas.height = stateRef.current.height;
    };

    const drawFractalTree = (x, y, len, angle, branchWidth, color1, color2, depth, progress) => {
      if (progress <= 0) return;
      const currentLen = len * Math.min(1, progress * (depth + 1));
      if (currentLen <= 0.1) return;

      ctx.beginPath();
      ctx.save();
      const trunkColor = ctx.createLinearGradient(0, 0, 0, -currentLen);
      trunkColor.addColorStop(0, '#2d1b11');
      trunkColor.addColorStop(1, '#452618');
      
      ctx.strokeStyle = depth > 2 ? color1 : trunkColor;
      ctx.fillStyle = color1;
      
      if (depth > 3) {
        ctx.shadowBlur = 10 * progress;
        ctx.shadowColor = color2;
      } else {
        ctx.shadowBlur = 0;
      }
      
      ctx.lineWidth = branchWidth * progress;
      ctx.translate(x, y);
      ctx.rotate(angle * Math.PI / 180);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -currentLen);
      ctx.stroke();

      if (depth < 6) {
        if (depth > 3) {
          ctx.beginPath();
          ctx.arc(0, -currentLen, branchWidth * 3 * progress, 0, Math.PI * 2);
          ctx.fill();
        }
        
        const sway = Math.sin(stateRef.current.lastTime * 0.001 + x * 0.01) * 2;
        const branchProgress = (progress - 0.2) * 1.25;
        drawFractalTree(0, -currentLen, len * 0.75, angle + 25 + sway, branchWidth * 0.7, color1, color2, depth + 1, branchProgress);
        drawFractalTree(0, -currentLen, len * 0.75, angle - 25 + sway, branchWidth * 0.7, color1, color2, depth + 1, branchProgress);
      }
      ctx.restore();
    };

    const updateAndDraw = (time) => {
      const dt = (time - stateRef.current.lastTime) * 0.001; // seconds
      stateRef.current.lastTime = time;
      
      const { width, height, cameraX, cameraY, targetCameraX, targetCameraY, trees, particles } = stateRef.current;
      
      if (!stateRef.current.isDragging) {
        stateRef.current.cameraX += (targetCameraX - cameraX) * 0.05;
        stateRef.current.cameraY += (targetCameraY - cameraY) * 0.05;
      }

      // Sky Background
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
      bgGradient.addColorStop(0, '#0f172a');
      bgGradient.addColorStop(0.5, '#1e293b');
      bgGradient.addColorStop(1, '#334155');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Stars/Fireflies ambient
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      const gridSize = 100;
      const offsetX = stateRef.current.cameraX % gridSize;
      const offsetY = stateRef.current.cameraY % gridSize;
      for (let i = -gridSize; i < width + gridSize; i += gridSize) {
        for (let j = -gridSize; j < height + gridSize; j += gridSize) {
          ctx.beginPath();
          ctx.arc(i + offsetX, j + offsetY, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Ecosystem
      [...trees].sort((a, b) => a.y - b.y).forEach(tree => {
        // Delayed smooth growth animation
        if (tree.delay > 0) {
          tree.delay -= dt;
        } else if (tree.progress < 1) {
          tree.progress += 0.01;
          if (tree.progress > 1) tree.progress = 1;
        }

        const screenX = tree.x + stateRef.current.cameraX;
        const screenY = tree.y + stateRef.current.cameraY;
        
        if (screenX > -150 && screenX < width + 150 && screenY > -200 && screenY < height + 150) {
          const theme = themes[tree.action];
          
          // Ground shadow
          ctx.beginPath();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.ellipse(screenX, screenY, tree.size * 0.8 * tree.progress, tree.size * 0.25 * tree.progress, 0, 0, Math.PI * 2);
          ctx.fill();

          // Tree
          drawFractalTree(screenX, screenY, tree.size, 0, tree.size / 6, theme.leaf, theme.glow, 0, tree.progress);
        }
      });

      animationFrameId = requestAnimationFrame(updateAndDraw);
    };

    // Controls
    const handleMouseDown = (e) => {
      stateRef.current.isDragging = true;
      stateRef.current.dragStartX = e.clientX - stateRef.current.cameraX;
      stateRef.current.dragStartY = e.clientY - stateRef.current.cameraY;
    };
    const handleMouseUp = () => {
      stateRef.current.isDragging = false;
      stateRef.current.targetCameraX = stateRef.current.cameraX;
      stateRef.current.targetCameraY = stateRef.current.cameraY;
    };
    const handleMouseMove = (e) => {
      if (!stateRef.current.isDragging) return;
      stateRef.current.cameraX = e.clientX - stateRef.current.dragStartX;
      stateRef.current.cameraY = e.clientY - stateRef.current.dragStartY;
      stateRef.current.targetCameraX = stateRef.current.cameraX;
      stateRef.current.targetCameraY = stateRef.current.cameraY;
    };
    const handleTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      stateRef.current.isDragging = true;
      stateRef.current.dragStartX = e.touches[0].clientX - stateRef.current.cameraX;
      stateRef.current.dragStartY = e.touches[0].clientY - stateRef.current.cameraY;
    };
    const handleTouchMove = (e) => {
      if (!stateRef.current.isDragging || e.touches.length !== 1) return;
      stateRef.current.cameraX = e.touches[0].clientX - stateRef.current.dragStartX;
      stateRef.current.cameraY = e.touches[0].clientY - stateRef.current.dragStartY;
      stateRef.current.targetCameraX = stateRef.current.cameraX;
      stateRef.current.targetCameraY = stateRef.current.cameraY;
    };

    window.addEventListener('resize', handleResize);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    handleResize();
    animationFrameId = requestAnimationFrame(updateAndDraw);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="virtual-island-page w-100 position-relative" style={{ height: '100vh', overflow: 'hidden', background: '#0f172a' }}>
      
      {/* Header */}
      <div className="p-3 d-flex justify-content-between align-items-start position-absolute top-0 w-100" style={{ zIndex: 10 }}>
        <button 
          className="btn btn-dark text-white rounded-circle shadow-lg d-flex align-items-center justify-content-center hover-scale" 
          onClick={onBack}
          style={{ width: '45px', height: '45px', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          <i className="bi bi-arrow-left fs-5" />
        </button>
      </div>

      {/* Canvas Container */}
      <div ref={containerRef} className="position-absolute top-0 start-0 w-100 h-100" style={{ cursor: 'grab' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }}></canvas>
        
        {loading && (
          <div className="position-absolute top-50 start-50 translate-middle text-white text-center">
             <div className="spinner-grow text-success mb-2" role="status" style={{ width: '3rem', height: '3rem' }}>
                <span className="visually-hidden">Growing...</span>
             </div>
             <h5 className="fw-bold">Growing your forest...</h5>
          </div>
        )}
      </div>

      {/* Forest Stay Focused App Style Info Panel */}
      {!loading && (
        <div className="position-absolute bottom-0 w-100 p-4 pb-5 d-flex flex-column align-items-center" style={{ zIndex: 10, background: 'linear-gradient(transparent, rgba(15, 23, 42, 0.9) 80%)' }}>
          
          <div className="text-center mb-3">
             <h3 className="fw-bold text-white mb-0" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
               {treeStats.total} Trees Grown
             </h3>
             <p className="text-white-50 small mb-0">Your lifetime ecosystem built from your habits</p>
          </div>

          <div className="d-flex justify-content-center gap-2 flex-wrap">
            <div className="rounded-pill px-3 py-1 shadow-sm d-flex align-items-center gap-2" style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', backdropFilter: 'blur(10px)' }}>
              <div className="rounded-circle bg-success" style={{ width: '10px', height: '10px', boxShadow: '0 0 5px #22c55e' }}></div>
              <span className="text-white fw-bold small">{treeStats.blocks} Time Blocks</span>
            </div>
            
            <div className="rounded-pill px-3 py-1 shadow-sm d-flex align-items-center gap-2" style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', backdropFilter: 'blur(10px)' }}>
              <div className="rounded-circle bg-primary" style={{ width: '10px', height: '10px', boxShadow: '0 0 5px #3b82f6' }}></div>
              <span className="text-white fw-bold small">{treeStats.journals} Journals</span>
            </div>

            <div className="rounded-pill px-3 py-1 shadow-sm d-flex align-items-center gap-2" style={{ background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)', backdropFilter: 'blur(10px)' }}>
              <div className="rounded-circle bg-warning" style={{ width: '10px', height: '10px', boxShadow: '0 0 5px #eab308' }}></div>
              <span className="text-white fw-bold small">{treeStats.wallets} Wallet Configs</span>
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}
