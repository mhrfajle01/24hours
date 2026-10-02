import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export default function StoriesPage({ currentUser, onBack }) {
  const [stories, setStories] = useState([]);
  const [unlockedChapters, setUnlockedChapters] = useState({});
  const [storyTokens, setStoryTokens] = useState(0);
  const [timeBlocksProgress, setTimeBlocksProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState(null);
  const [recentUnlock, setRecentUnlock] = useState(() => JSON.parse(localStorage.getItem('recentUnlock') || 'null'));

  useEffect(() => {
    // Clean up expired unlock windows every minute
    const interval = setInterval(() => {
      if (recentUnlock && Date.now() - recentUnlock.time > 2 * 60 * 1000) {
        setRecentUnlock(null);
        localStorage.removeItem('recentUnlock');
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [recentUnlock]);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const fetchStories = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'stories'));
        const snapshot = await getDocs(q);
        const allStories = [];
        const now = new Date().toISOString();
        
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data.validUntil || data.validUntil > now) {
            allStories.push({ id: docSnap.id, ...data });
          }
        });
        setStories(allStories);

        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUnlockedChapters(userDocSnap.data().unlockedChapters || {});
        } else {
          setUnlockedChapters({});
        }

        const pointsDocRef = doc(db, 'points', currentUser.uid);
        const pointsDocSnap = await getDoc(pointsDocRef);
        if (pointsDocSnap.exists()) {
          setStoryTokens(pointsDocSnap.data().storyTokens || 0);
          setTimeBlocksProgress(pointsDocSnap.data().timeBlocksForStory || 0);
        } else {
          setStoryTokens(0);
          setTimeBlocksProgress(0);
        }

      } catch (err) {
        console.error('Error fetching stories:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStories();
  }, [currentUser]);

  const handleUnlockChapter = async (storyId, chapterIndex) => {
    if (storyTokens < 1) {
      alert('Not enough Story Tokens. You need 1 Story Token to unlock a chapter. You can earn Story Tokens by completing your tasks or journaling!');
      return;
    }

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const updatedUnlocked = { ...unlockedChapters };
      
      // Convert legacy array to object if necessary
      if (Array.isArray(updatedUnlocked[storyId])) {
        const newDict = {};
        updatedUnlocked[storyId].forEach(idx => { newDict[idx] = Infinity; });
        updatedUnlocked[storyId] = newDict;
      } else if (!updatedUnlocked[storyId]) {
        updatedUnlocked[storyId] = {};
      }
      
      // 5 minutes unlock time
      updatedUnlocked[storyId][chapterIndex] = Date.now() + 5 * 60 * 1000;
      
      await setDoc(userDocRef, { unlockedChapters: updatedUnlocked }, { merge: true });
      setUnlockedChapters(updatedUnlocked);

      const pointsDocRef = doc(db, 'points', currentUser.uid);
      await setDoc(pointsDocRef, { storyTokens: storyTokens - 1 }, { merge: true });
      setStoryTokens(storyTokens - 1);

      const unlockData = { storyId, chapterIndex, time: Date.now() };
      setRecentUnlock(unlockData);
      localStorage.setItem('recentUnlock', JSON.stringify(unlockData));
    } catch (err) {
      console.error('Failed to unlock chapter', err);
      alert('Failed to unlock chapter');
    }
  };

  const handleUndoUnlock = async (storyId, chapterIndex) => {
    if (!recentUnlock || recentUnlock.storyId !== storyId || recentUnlock.chapterIndex !== chapterIndex) return;
    if (Date.now() - recentUnlock.time > 2 * 60 * 1000) {
      alert("Undo window expired (2 minutes max).");
      setRecentUnlock(null);
      localStorage.removeItem('recentUnlock');
      return;
    }

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const updatedUnlocked = { ...unlockedChapters };
      if (updatedUnlocked[storyId]) {
        delete updatedUnlocked[storyId][chapterIndex];
      }
      
      await setDoc(userDocRef, { unlockedChapters: updatedUnlocked }, { merge: true });
      setUnlockedChapters(updatedUnlocked);

      const pointsDocRef = doc(db, 'points', currentUser.uid);
      await setDoc(pointsDocRef, { storyTokens: storyTokens + 1 }, { merge: true });
      setStoryTokens(storyTokens + 1);

      setRecentUnlock(null);
      localStorage.removeItem('recentUnlock');
    } catch (err) {
      console.error('Failed to undo unlock', err);
      alert('Failed to undo unlock');
    }
  };

  const isChapterUnlocked = (storyId, index) => {
    const unlocks = unlockedChapters[storyId];
    if (!unlocks || Array.isArray(unlocks)) return false;
    
    if (unlocks[index] && unlocks[index] !== Infinity) {
      return unlocks[index] > now;
    }
    return false;
  };

  const getChapterTimeLeft = (storyId, index) => {
    const unlocks = unlockedChapters[storyId];
    if (!unlocks || Array.isArray(unlocks) || !unlocks[index] || unlocks[index] === Infinity) return null;
    const remaining = unlocks[index] - now;
    if (remaining <= 0) return "Locked";
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ background: '#111827', color: '#fff' }}>
        <div className="spinner-border text-light" />
      </div>
    );
  }

  return (
    <div className="stories-page w-100 position-fixed top-0 start-0 bottom-0" style={{ zIndex: 1050, overflowY: 'auto', background: '#111827', color: '#e5e7eb', padding: '1rem' }}>
      <div className="container-fluid max-width-container">
        <div className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between mb-4 mt-3 gap-3">
          <div>
            <h2 className="fw-bold mb-0" style={{ color: '#fbbf24' }}><i className="bi bi-book me-2" />Story Books</h2>
            <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '10px' }}>Tokens available: <strong style={{ color: '#fbbf24' }}>{storyTokens}</strong></div>
            
            <div className="d-flex gap-3 flex-wrap mb-4">
              <div className="p-3 rounded-4 shadow-sm flex-fill" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(251, 191, 36, 0.2)', minWidth: '250px' }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span style={{ color: '#e5e7eb', fontSize: '0.85rem' }}><i className="bi bi-stopwatch text-warning me-1"></i> Time Block Quest</span>
                  <span style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 'bold' }}>1 Token</span>
                </div>
                <small className="d-block mt-1" style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Complete a deep focus Time Block to instantly earn a token.</small>
              </div>

              <div className="p-3 rounded-4 shadow-sm flex-fill" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(251, 191, 36, 0.2)', minWidth: '250px' }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span style={{ color: '#e5e7eb', fontSize: '0.85rem' }}><i className="bi bi-journal-text text-warning me-1"></i> Journal Quest</span>
                  <span style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 'bold' }}>1 Token</span>
                </div>
                <small className="d-block mt-1" style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Write a reflective journal entry today to instantly earn a token.</small>
              </div>
            </div>
          </div>
          <button className="btn btn-outline-light rounded-pill fw-bold w-100 w-sm-auto" onClick={onBack}>
            <i className="bi bi-arrow-left me-1" /> Back
          </button>
        </div>

        {!selectedStory ? (
          <div>
            {stories.length === 0 ? (
              <div className="text-center mt-5" style={{ color: '#9ca3af' }}>No stories available right now. Check back later!</div>
            ) : (
              <div className="row g-3">
                {stories.map(story => (
                  <div className="col-12 col-md-6 col-lg-4" key={story.id}>
                    <div 
                      className="card border-0 rounded-4 p-4 shadow-lg h-100 position-relative overflow-hidden" 
                      style={{ 
                        background: story.coverImage ? `linear-gradient(145deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95)), url(${story.coverImage}) center/cover` : 'linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))', 
                        backdropFilter: 'blur(12px)', 
                        cursor: 'pointer', 
                        transition: 'all 0.3s ease', 
                        border: '1px solid rgba(251, 191, 36, 0.3)' 
                      }}
                      onClick={() => setSelectedStory(story)}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-5px)';
                        e.currentTarget.style.boxShadow = '0 10px 25px rgba(251, 191, 36, 0.2)';
                        e.currentTarget.style.border = '1px solid rgba(251, 191, 36, 0.6)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 0.5rem 1rem rgba(0,0,0,0.15)';
                        e.currentTarget.style.border = '1px solid rgba(251, 191, 36, 0.3)';
                      }}
                    >
                      <div className="position-absolute top-0 end-0 p-3">
                         <i className="bi bi-star-fill" style={{ color: '#fbbf24', fontSize: '1.2rem', filter: 'drop-shadow(0 0 5px rgba(251,191,36,0.5))' }}></i>
                      </div>
                      <h4 className="fw-bold mb-3 pe-4" style={{ color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{story.title}</h4>
                      <p style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.5' }}>{story.description}</p>
                      <div className="mt-auto pt-3 border-top d-flex justify-content-between align-items-center" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                        <span className="badge bg-dark border" style={{ borderColor: '#fbbf24', color: '#fbbf24' }}>
                          <i className="bi bi-journal-richtext me-1"></i>
                          {story.chapters ? story.chapters.length : 0} Chapters
                        </span>
                        {story.validUntil && <small style={{ color: '#ef4444', fontWeight: 'bold' }}><i className="bi bi-clock-history me-1"></i>Expires Soon</small>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <button className="btn btn-sm btn-outline-light mb-4 rounded-pill" onClick={() => setSelectedStory(null)}>
              <i className="bi bi-chevron-left me-1" /> All Stories
            </button>
            
            {selectedStory.coverImage && (
              <div 
                className="mb-4 rounded-4 shadow-lg position-relative overflow-hidden" 
                style={{ 
                  height: '250px', 
                  backgroundImage: `url(${selectedStory.coverImage})`, 
                  backgroundSize: 'cover', 
                  backgroundPosition: 'center', 
                  border: '1px solid rgba(251,191,36,0.3)' 
                }}
              >
                <div className="position-absolute top-0 start-0 w-100 h-100" style={{ background: 'linear-gradient(to top, #111827 0%, transparent 100%)' }}></div>
              </div>
            )}
            
            <h3 className="fw-bold mb-2" style={{ color: '#fbbf24' }}>{selectedStory.title}</h3>
            <p style={{ color: '#d1d5db', marginBottom: '2rem' }}>{selectedStory.description}</p>
            
            <div className="chapters-list d-flex flexDirection-column" style={{ gap: '1.5rem', display: 'flex', flexDirection: 'column' }}>
              {(selectedStory.chapters || []).map((chapter, index) => {
                const unlocked = isChapterUnlocked(selectedStory.id, index);
                return (
                  <div key={index} className="card border-0 rounded-4 p-4 shadow" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <h5 className="fw-bold d-flex justify-content-between align-items-center" style={{ color: '#fff', marginBottom: '1rem' }}>
                      <span>Chapter {index + 1}</span>
                      {unlocked && getChapterTimeLeft(selectedStory.id, index) && (
                        <span className="badge bg-danger rounded-pill px-3 shadow" style={{ fontSize: '0.85rem', animation: 'pulse 2s infinite' }}>
                          <i className="bi bi-clock me-1"></i> Locks in {getChapterTimeLeft(selectedStory.id, index)}
                        </span>
                      )}
                    </h5>
                    {unlocked ? (
                      <div>
                        <p style={{ whiteSpace: 'pre-wrap', color: '#e5e7eb', lineHeight: '1.6' }}>{chapter}</p>
                        {recentUnlock && recentUnlock.storyId === selectedStory.id && recentUnlock.chapterIndex === index && Date.now() - recentUnlock.time <= 2 * 60 * 1000 && (
                          <div className="mt-4 pt-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.1) !important', textAlign: 'center' }}>
                            <small className="text-muted d-block mb-2">Unlocked by mistake?</small>
                            <button 
                              className="btn btn-sm btn-outline-danger rounded-pill px-3"
                              onClick={() => handleUndoUnlock(selectedStory.id, index)}
                            >
                              <i className="bi bi-arrow-counterclockwise me-1"></i> Undo Unlock (Refund 1 Token)
                            </button>
                            <small className="d-block mt-1" style={{ color: '#ef4444', fontSize: '0.75rem' }}>Available for 2 minutes</small>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-5 rounded-4" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                        <i className="bi bi-lock-fill d-block mb-3" style={{ color: '#fbbf24', fontSize: '2.5rem', filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.5))' }} />
                        <h4 className="fw-bold mb-3" style={{ color: '#fff' }}>Premium Chapter Locked</h4>
                        <p style={{ color: '#9ca3af', maxWidth: '450px', margin: '0 auto 1.5rem auto' }}>
                          Unlock this chapter with your focus. Earn tokens through your daily productivity:
                        </p>
                        <div className="d-flex justify-content-center gap-2 mb-4 flex-wrap px-3">
                            <div className="badge bg-dark border p-2" style={{ borderColor: '#fbbf24', color: '#fbbf24' }}><i className="bi bi-stopwatch me-1"></i> Time Block</div>
                            <div className="badge bg-dark border p-2" style={{ borderColor: '#fbbf24', color: '#fbbf24' }}><i className="bi bi-journal-text me-1"></i> Journal Entry</div>
                            <div className="badge bg-dark border p-2" style={{ borderColor: '#fbbf24', color: '#fbbf24' }}><i className="bi bi-fire me-1"></i> Daily Streak</div>
                        </div>
                        <button 
                          className="btn btn-warning rounded-pill fw-bold px-4 py-2 shadow-lg"
                          onClick={() => handleUnlockChapter(selectedStory.id, index)}
                          style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', border: 'none', color: '#111827', fontSize: '1.1rem', transition: 'transform 0.2s' }}
                          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <i className="bi bi-unlock-fill me-2"></i> Unlock (1 Token)
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
