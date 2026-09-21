import React, { useState } from 'react';
import { useSurveys } from '../hooks/useSurveys';
import { useSound } from '../contexts/SoundContext';

const EMOJIS = ['📋','✅','❌','🌟','💪','🤲','📖','🎯','💡','🔥'];
const Q_TYPES = [
  { value: 'yes_no', label: 'হ্যাঁ/না', icon: 'bi-toggle-on' },
  { value: 'rating', label: 'রেটিং ১-৫', icon: 'bi-star-half' },
  { value: 'text', label: 'লেখা', icon: 'bi-pencil-square' }
];

const getTodayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

export default function SurveyPage({ currentUser, onBack }) {
  const { surveys, results, loading, createSurvey, updateSurvey, deleteSurvey, submitResult } = useSurveys(currentUser?.uid);
  const { playSound } = useSound();

  const [view, setView] = useState('home');
  // Create
  const [newSurvey, setNewSurvey] = useState({ title: '', emoji: '📋', questions: [] });
  const [editingSurveyId, setEditingSurveyId] = useState(null);
  const [newQText, setNewQText] = useState('');
  const [newQType, setNewQType] = useState('yes_no');
  // Run
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [animDir, setAnimDir] = useState('in');
  // Result
  const [viewingResult, setViewingResult] = useState(null);

  // ── Create Helpers ──
  const addQuestion = () => {
    if (!newQText.trim()) return;
    setNewSurvey(prev => ({
      ...prev,
      questions: [...prev.questions, { id: `q_${Date.now()}`, text: newQText.trim(), type: newQType }]
    }));
    setNewQText('');
  };

  const removeQuestion = (qId) => {
    setNewSurvey(prev => ({ ...prev, questions: prev.questions.filter(q => q.id !== qId) }));
  };

  const saveSurvey = async () => {
    if (!newSurvey.title.trim() || newSurvey.questions.length === 0) return;
    if (editingSurveyId) {
      await updateSurvey(editingSurveyId, { title: newSurvey.title, emoji: newSurvey.emoji, questions: newSurvey.questions });
    } else {
      await createSurvey({ title: newSurvey.title, emoji: newSurvey.emoji, questions: newSurvey.questions });
    }
    setNewSurvey({ title: '', emoji: '📋', questions: [] });
    setEditingSurveyId(null);
    setView('home');
  };

  const startEdit = (survey) => {
    setNewSurvey({ title: survey.title, emoji: survey.emoji || '📋', questions: survey.questions || [] });
    setEditingSurveyId(survey.id);
    setView('create');
  };

  // ── Run Helpers ──
  const startSurvey = (survey) => {
    setActiveSurvey(survey);
    setCurrentQIndex(0);
    setAnswers([]);
    setAnimDir('in');
    setView('run');
  };

  const answerQuestion = async (answer) => {
    playSound('points');
    const q = activeSurvey.questions[currentQIndex];
    const newAnswers = [...answers, { questionId: q.id, questionText: q.text, answer }];
    setAnswers(newAnswers);

    if (currentQIndex < activeSurvey.questions.length - 1) {
      setAnimDir('out');
      setTimeout(() => {
        setCurrentQIndex(prev => prev + 1);
        setAnimDir('in');
      }, 300);
    } else {
      // Submit
      const resultData = {
        surveyId: activeSurvey.id,
        surveyTitle: activeSurvey.title,
        surveyEmoji: activeSurvey.emoji || '📋',
        date: getTodayDate(),
        answers: newAnswers
      };
      await submitResult(resultData);
      playSound('success');
      setViewingResult(resultData);
      setView('result');
    }
  };

  const handleDeleteSurvey = async (id, title) => {
    if (window.confirm(`"${title}" সার্ভে মুছে ফেলবেন?`)) {
      playSound('trash');
      await deleteSurvey(id);
    }
  };

  // ── Group results by date ──
  // Filter out any orphaned results from surveys that were deleted before the backend fix
  const validResults = results.filter(r => surveys.some(s => s.id === r.surveyId));
  
  const resultsByDate = validResults.reduce((acc, r) => {
    const date = r.date || 'Unknown';
    if (!acc[date]) acc[date] = [];
    acc[date].push(r);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: '100dvh', background: '#ECE5DD', fontFamily: "'Noto Sans Bengali', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap');
        @keyframes surveySlideIn { from { opacity: 0; transform: translateX(100px) scale(0.9); } to { opacity: 1; transform: translateX(0) scale(1); } }
        @keyframes surveySlideOut { from { opacity: 1; transform: translateX(0) scale(1); } to { opacity: 0; transform: translateX(-100px) scale(0.9); } }
        @keyframes surveyBounceIn { 0% { opacity:0; transform: scale(0.1); } 40% { transform: scale(1.15); } 60% { transform: scale(0.85); } 80% { transform: scale(1.05); } 100% { opacity:1; transform: scale(1); } }
        @keyframes surveyFadeUp { from { opacity: 0; transform: translateY(40px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes surveyPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
        @keyframes surveyCheckmark { 0% { transform: scale(0) rotate(-90deg); opacity:0; } 60% { transform: scale(1.4) rotate(15deg); } 100% { transform: scale(1) rotate(0deg); opacity:1; } }
        @keyframes confettiBurst { 0% { transform: scale(0); opacity:1; } 100% { transform: scale(2); opacity:0; } }
        @keyframes starPop { 0% { transform: scale(0); } 70% { transform: scale(1.3); } 100% { transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .survey-card-hover:active { transform: scale(0.97); }
        .survey-card-hover { transition: transform 0.15s ease; }
        .survey-answer-btn { transition: all 0.2s ease; border: 2px solid transparent !important; }
        .survey-answer-btn:active { transform: scale(0.92); }
        .survey-star { transition: all 0.15s ease; cursor: pointer; }
        .survey-star:active { transform: scale(1.4); }
        .survey-progress-bar { transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>

      <div className="container-fluid max-width-container py-3 px-3">

        {/* Header */}
        <div className="d-flex align-items-center justify-content-between mb-3" style={{ animation: 'surveyFadeUp 0.4s ease' }}>
          <div>
            <div className="text-success fw-bold small text-uppercase">সার্ভে / Survey</div>
            <h2 className="fw-bold text-dark mb-0" style={{ fontSize: '1.5rem' }}>আমার সার্ভে</h2>
            <div className="text-secondary small">নিজের অভ্যাস ট্র্যাক করুন প্রতিদিন</div>
          </div>
          <button className="btn btn-outline-secondary rounded-pill fw-bold" onClick={onBack}>
            <i className="bi bi-arrow-left me-1" /> ফিরুন
          </button>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-success" />
            <div className="text-secondary mt-2 small">লোড হচ্ছে...</div>
          </div>
        ) : (
          <>
            {/* ═══ HOME VIEW ═══ */}
            {view === 'home' && (
              <div style={{ animation: 'surveyFadeUp 0.4s ease' }}>
                {/* Action Cards */}
                <div className="row g-3 mb-4">
                  <div className="col-6">
                    <button
                      className="card border-0 shadow-sm rounded-4 p-3 text-start w-100 h-100 survey-card-hover text-white"
                      style={{ background: 'linear-gradient(135deg, #6f42c1, #9b59b6)', minHeight: 120 }}
                      onClick={() => { setNewSurvey({ title: '', emoji: '📋', questions: [] }); setEditingSurveyId(null); setView('create'); }}
                    >
                      <i className="bi bi-plus-circle fs-2 d-block mb-2" />
                      <strong className="d-block" style={{ fontSize: '1rem' }}>নতুন সার্ভে তৈরি</strong>
                      <small style={{ opacity: 0.8 }}>Create New Survey</small>
                    </button>
                  </div>
                  <div className="col-6">
                    <button
                      className="card border-0 shadow-sm rounded-4 p-3 text-start w-100 h-100 survey-card-hover text-white"
                      style={{ background: 'linear-gradient(135deg, #075E54, #198754)', minHeight: 120 }}
                      onClick={() => {
                        if (surveys.length > 0) { startSurvey(surveys[0]); }
                      }}
                      disabled={surveys.length === 0}
                    >
                      <i className="bi bi-play-circle fs-2 d-block mb-2" />
                      <strong className="d-block" style={{ fontSize: '1rem' }}>সার্ভে চালান</strong>
                      <small style={{ opacity: 0.8 }}>Run Survey</small>
                    </button>
                  </div>
                </div>

                {/* My Surveys */}
                <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-collection text-success" /> আমার সার্ভে সমূহ
                  {surveys.length > 0 && <span className="badge bg-success-subtle text-success rounded-pill">{surveys.length}</span>}
                </h6>
                {surveys.length === 0 ? (
                  <div className="card border-0 shadow-sm rounded-4 p-4 text-center" style={{ animation: 'surveyBounceIn 0.5s ease' }}>
                    <div className="fs-1 mb-2">📝</div>
                    <p className="text-secondary mb-0">এখনো কোনো সার্ভে তৈরি হয়নি।<br /><strong>নতুন সার্ভে তৈরি</strong> বাটনে ক্লিক করুন!</p>
                  </div>
                ) : (
                  <div className="vstack gap-2 mb-4">
                    {surveys.map((s, i) => (
                      <div
                        key={s.id}
                        className="card border-0 shadow-sm rounded-4 p-3 survey-card-hover"
                        style={{ animation: `surveyFadeUp ${0.3 + i * 0.08}s ease` }}
                      >
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-2">
                            <span className="fs-3">{s.emoji || '📋'}</span>
                            <div>
                              <strong className="d-block text-dark">{s.title}</strong>
                              <small className="text-secondary">{(s.questions || []).length} টি প্রশ্ন</small>
                            </div>
                          </div>
                          <div className="d-flex gap-1">
                            <button className="btn btn-sm btn-success rounded-pill" onClick={() => startSurvey(s)} title="চালান">
                              <i className="bi bi-play-fill" />
                            </button>
                            <button className="btn btn-sm btn-outline-secondary rounded-pill" onClick={() => startEdit(s)} title="এডিট">
                              <i className="bi bi-pencil" />
                            </button>
                            <button className="btn btn-sm btn-outline-danger rounded-pill" onClick={() => handleDeleteSurvey(s.id, s.title)} title="মুছুন">
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Previous Results */}
                {Object.keys(resultsByDate).length > 0 && (
                  <>
                    <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                      <i className="bi bi-clock-history text-warning" /> আগের ফলাফল
                    </h6>
                    {Object.entries(resultsByDate).slice(0, 7).map(([date, items]) => (
                      <div key={date} className="mb-3">
                        <div className="text-secondary small fw-bold mb-2">
                          <i className="bi bi-calendar3 me-1" />
                          {date === getTodayDate() ? 'আজ' : new Date(date + 'T00:00:00').toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        {items.map(r => (
                          <button
                            key={r.id}
                            className="card border-0 shadow-sm rounded-4 p-3 mb-2 w-100 text-start survey-card-hover"
                            onClick={() => { setViewingResult(r); setView('result'); }}
                          >
                            <div className="d-flex align-items-center justify-content-between">
                              <div className="d-flex align-items-center gap-2">
                                <span>{r.surveyEmoji || '📋'}</span>
                                <div>
                                  <strong className="small text-dark">{r.surveyTitle}</strong>
                                  <small className="text-secondary d-block">{(r.answers || []).length} টি উত্তর</small>
                                </div>
                              </div>
                              <i className="bi bi-chevron-right text-secondary" />
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ═══ CREATE VIEW ═══ */}
            {view === 'create' && (
              <div style={{ animation: 'surveySlideIn 0.35s ease' }}>
                <div className="card border-0 shadow-sm rounded-4 p-3 mb-3">
                  <h6 className="fw-bold text-dark mb-3">
                    <i className="bi bi-pencil-square text-primary me-2" />
                    {editingSurveyId ? 'সার্ভে এডিট করুন' : 'নতুন সার্ভে তৈরি করুন'}
                  </h6>

                  {/* Title */}
                  <input
                    className="form-control rounded-3 mb-3 fw-bold"
                    placeholder="সার্ভের নাম লিখুন..."
                    value={newSurvey.title}
                    onChange={e => setNewSurvey(prev => ({ ...prev, title: e.target.value }))}
                    style={{ fontSize: '1.1rem' }}
                  />

                  {/* Emoji Picker */}
                  <div className="mb-3">
                    <small className="text-secondary fw-bold d-block mb-2">ইমোজি বাছুন:</small>
                    <div className="d-flex gap-2 flex-wrap">
                      {EMOJIS.map(e => (
                        <button
                          key={e}
                          className={`btn btn-sm rounded-3 ${newSurvey.emoji === e ? 'btn-success shadow' : 'btn-light border'}`}
                          style={{ fontSize: '1.3rem', width: 44, height: 44, transition: 'all 0.15s' }}
                          onClick={() => setNewSurvey(prev => ({ ...prev, emoji: e }))}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question Type */}
                  <div className="mb-3">
                    <small className="text-secondary fw-bold d-block mb-2">প্রশ্নের ধরন:</small>
                    <div className="d-flex gap-2">
                      {Q_TYPES.map(t => (
                        <button
                          key={t.value}
                          className={`btn btn-sm rounded-pill fw-bold ${newQType === t.value ? 'btn-success' : 'btn-outline-secondary'}`}
                          onClick={() => setNewQType(t.value)}
                        >
                          <i className={`bi ${t.icon} me-1`} />{t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Add Question */}
                  <div className="d-flex gap-2 mb-3">
                    <input
                      className="form-control rounded-3"
                      placeholder="প্রশ্ন লিখুন..."
                      value={newQText}
                      onChange={e => setNewQText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addQuestion()}
                    />
                    <button className="btn btn-success rounded-pill fw-bold px-3" onClick={addQuestion} disabled={!newQText.trim()}>
                      <i className="bi bi-plus-lg" />
                    </button>
                  </div>

                  {/* Questions List */}
                  {newSurvey.questions.length > 0 && (
                    <div className="vstack gap-2 mb-3">
                      {newSurvey.questions.map((q, i) => (
                        <div
                          key={q.id}
                          className="d-flex align-items-center gap-2 bg-light rounded-3 p-2 ps-3"
                          style={{ animation: `surveyFadeUp ${0.2 + i * 0.05}s ease` }}
                        >
                          <span className="badge bg-success rounded-pill">{i + 1}</span>
                          <span className="flex-grow-1 small fw-semibold text-dark">{q.text}</span>
                          <span className="badge bg-secondary-subtle text-secondary rounded-pill">{Q_TYPES.find(t => t.value === q.type)?.label}</span>
                          <button className="btn btn-sm btn-outline-danger rounded-circle" onClick={() => removeQuestion(q.id)} style={{ width: 28, height: 28, padding: 0, fontSize: '0.7rem' }}>
                            <i className="bi bi-x" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="d-flex gap-2">
                  <button className="btn btn-outline-secondary rounded-pill fw-bold flex-grow-1" onClick={() => { setView('home'); setEditingSurveyId(null); }}>
                    <i className="bi bi-x-lg me-1" /> বাতিল
                  </button>
                  <button
                    className="btn btn-success rounded-pill fw-bold flex-grow-1"
                    disabled={!newSurvey.title.trim() || newSurvey.questions.length === 0}
                    onClick={saveSurvey}
                  >
                    <i className="bi bi-check-lg me-1" /> {editingSurveyId ? 'আপডেট করুন' : 'সেভ করুন'}
                  </button>
                </div>
              </div>
            )}

            {/* ═══ RUN VIEW ═══ */}
            {view === 'run' && (
              <div>
                {!activeSurvey ? (
                  /* Survey Picker */
                  <div style={{ animation: 'surveyFadeUp 0.4s ease' }}>
                    <h6 className="fw-bold text-dark mb-3"><i className="bi bi-list-task text-success me-2" />কোন সার্ভে চালাবেন?</h6>
                    {surveys.length === 0 ? (
                      <div className="card border-0 shadow-sm rounded-4 p-4 text-center">
                        <div className="fs-1 mb-2">😶</div>
                        <p className="text-secondary">কোনো সার্ভে নেই। আগে একটি তৈরি করুন!</p>
                        <button className="btn btn-success rounded-pill fw-bold" onClick={() => setView('home')}>
                          <i className="bi bi-arrow-left me-1" /> ফিরুন
                        </button>
                      </div>
                    ) : (
                      <div className="vstack gap-2">
                        {surveys.map(s => (
                          <button key={s.id} className="card border-0 shadow-sm rounded-4 p-3 text-start w-100 survey-card-hover" onClick={() => startSurvey(s)}>
                            <div className="d-flex align-items-center gap-3">
                              <span className="fs-2">{s.emoji || '📋'}</span>
                              <div>
                                <strong className="text-dark">{s.title}</strong>
                                <small className="text-secondary d-block">{(s.questions || []).length} টি প্রশ্ন</small>
                              </div>
                              <i className="bi bi-play-circle-fill text-success fs-4 ms-auto" />
                            </div>
                          </button>
                        ))}
                        <button className="btn btn-outline-secondary rounded-pill fw-bold mt-2" onClick={() => setView('home')}>
                          <i className="bi bi-arrow-left me-1" /> ফিরুন
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Running Survey */
                  <div>
                    {/* Progress */}
                    <div className="mb-3" style={{ animation: 'surveyFadeUp 0.3s ease' }}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-success-subtle text-success rounded-pill fw-bold">
                          {activeSurvey.emoji} {activeSurvey.title}
                        </span>
                        <span className="small text-secondary fw-bold">
                          প্রশ্ন {currentQIndex + 1} / {activeSurvey.questions.length}
                        </span>
                      </div>
                      <div className="progress rounded-pill" style={{ height: 8 }}>
                        <div
                          className="progress-bar bg-success survey-progress-bar rounded-pill"
                          style={{ width: `${((currentQIndex + 1) / activeSurvey.questions.length) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Question Card */}
                    <div
                      key={currentQIndex}
                      className="card border-0 shadow-sm rounded-4 p-4 mb-3"
                      style={{
                        animation: animDir === 'in' ? 'surveySlideIn 0.4s ease' : 'surveySlideOut 0.3s ease',
                        minHeight: 250
                      }}
                    >
                      <div className="text-center mb-4">
                        <div
                          className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle text-success mb-3"
                          style={{ width: 56, height: 56, animation: 'surveyBounceIn 0.5s ease' }}
                        >
                          <span className="fw-bold fs-4">{currentQIndex + 1}</span>
                        </div>
                        <h4 className="fw-bold text-dark" style={{ fontSize: '1.25rem', lineHeight: 1.5 }}>
                          {activeSurvey.questions[currentQIndex].text}
                        </h4>
                      </div>

                      {/* Answer: Yes/No */}
                      {activeSurvey.questions[currentQIndex].type === 'yes_no' && (
                        <div className="d-flex gap-3 justify-content-center" style={{ animation: 'surveyFadeUp 0.5s ease' }}>
                          <button
                            className="btn btn-lg rounded-4 fw-bold text-white survey-answer-btn px-4 py-3"
                            style={{ background: 'linear-gradient(135deg, #198754, #20c997)', minWidth: 130 }}
                            onClick={() => answerQuestion('হ্যাঁ')}
                          >
                            <i className="bi bi-check-circle-fill me-2 fs-4" />
                            <span className="fs-5">হ্যাঁ</span>
                          </button>
                          <button
                            className="btn btn-lg rounded-4 fw-bold text-white survey-answer-btn px-4 py-3"
                            style={{ background: 'linear-gradient(135deg, #dc3545, #e74c3c)', minWidth: 130 }}
                            onClick={() => answerQuestion('না')}
                          >
                            <i className="bi bi-x-circle-fill me-2 fs-4" />
                            <span className="fs-5">না</span>
                          </button>
                        </div>
                      )}

                      {/* Answer: Rating */}
                      {activeSurvey.questions[currentQIndex].type === 'rating' && (
                        <div className="text-center" style={{ animation: 'surveyFadeUp 0.5s ease' }}>
                          <div className="d-flex gap-3 justify-content-center mb-3">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n}
                                className="btn rounded-circle survey-star d-flex align-items-center justify-content-center"
                                style={{
                                  width: 56, height: 56,
                                  background: 'linear-gradient(135deg, #f39c12, #fd7e14)',
                                  color: '#fff', fontSize: '1.4rem', fontWeight: 700,
                                  border: 'none', boxShadow: '0 3px 10px rgba(253,126,20,0.3)',
                                  animation: `starPop ${0.3 + n * 0.08}s ease`
                                }}
                                onClick={() => answerQuestion(n)}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                          <div className="d-flex justify-content-between text-secondary small px-2">
                            <span>খুব কম</span>
                            <span>খুব ভালো</span>
                          </div>
                        </div>
                      )}

                      {/* Answer: Text */}
                      {activeSurvey.questions[currentQIndex].type === 'text' && (
                        <TextAnswer onSubmit={(text) => answerQuestion(text)} />
                      )}
                    </div>

                    <button className="btn btn-outline-secondary rounded-pill fw-bold w-100" onClick={() => { setActiveSurvey(null); setView('home'); }}>
                      <i className="bi bi-x-lg me-1" /> বাতিল করুন
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ═══ RESULT VIEW ═══ */}
            {view === 'result' && viewingResult && (
              <div style={{ animation: 'surveyBounceIn 0.6s ease' }}>
                {/* Celebration Header */}
                <div className="text-center mb-4">
                  <div style={{ animation: 'surveyCheckmark 0.8s ease', fontSize: '4rem' }}>
                    ✅
                  </div>
                  <h3 className="fw-bold text-dark mt-2" style={{ animation: 'surveyFadeUp 0.5s ease 0.3s both' }}>
                    সার্ভে সম্পন্ন! 🎉
                  </h3>
                  <div className="text-secondary" style={{ animation: 'surveyFadeUp 0.5s ease 0.5s both' }}>
                    <span className="fs-5 me-2">{viewingResult.surveyEmoji || '📋'}</span>
                    <strong>{viewingResult.surveyTitle}</strong>
                    <div className="small mt-1">
                      <i className="bi bi-calendar3 me-1" />
                      {viewingResult.date === getTodayDate() ? 'আজ' : viewingResult.date}
                    </div>
                  </div>
                </div>

                {/* Summary Stats */}
                {(() => {
                  const a = viewingResult.answers || [];
                  const yesCount = a.filter(x => x.answer === 'হ্যাঁ').length;
                  const noCount = a.filter(x => x.answer === 'না').length;
                  const ratings = a.filter(x => typeof x.answer === 'number');
                  const avgRating = ratings.length > 0 ? (ratings.reduce((s, x) => s + x.answer, 0) / ratings.length).toFixed(1) : null;
                  return (
                    <div className="row g-2 mb-3" style={{ animation: 'surveyFadeUp 0.5s ease 0.6s both' }}>
                      <div className="col-4">
                        <div className="card border-0 shadow-sm rounded-4 p-2 text-center">
                          <div className="text-secondary small">মোট</div>
                          <div className="fw-bold text-dark fs-4">{a.length}</div>
                        </div>
                      </div>
                      {(yesCount > 0 || noCount > 0) && (
                        <>
                          <div className="col-4">
                            <div className="card border-0 shadow-sm rounded-4 p-2 text-center">
                              <div className="text-secondary small">হ্যাঁ ✅</div>
                              <div className="fw-bold text-success fs-4">{yesCount}</div>
                            </div>
                          </div>
                          <div className="col-4">
                            <div className="card border-0 shadow-sm rounded-4 p-2 text-center">
                              <div className="text-secondary small">না ❌</div>
                              <div className="fw-bold text-danger fs-4">{noCount}</div>
                            </div>
                          </div>
                        </>
                      )}
                      {avgRating && (
                        <div className="col-4">
                          <div className="card border-0 shadow-sm rounded-4 p-2 text-center">
                            <div className="text-secondary small">গড় রেটিং</div>
                            <div className="fw-bold text-warning fs-4">⭐ {avgRating}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Individual Answers */}
                <div className="vstack gap-2 mb-4">
                  {(viewingResult.answers || []).map((a, i) => (
                    <div
                      key={i}
                      className="card border-0 shadow-sm rounded-4 p-3"
                      style={{ animation: `surveyFadeUp ${0.4 + i * 0.1}s ease` }}
                    >
                      <div className="d-flex align-items-start gap-2">
                        <span className="badge bg-success rounded-pill mt-1">{i + 1}</span>
                        <div className="flex-grow-1">
                          <div className="small fw-bold text-dark mb-1">{a.questionText}</div>
                          <div className={`fw-bold ${a.answer === 'হ্যাঁ' ? 'text-success' : a.answer === 'না' ? 'text-danger' : 'text-dark'}`}>
                            {a.answer === 'হ্যাঁ' ? '✅ হ্যাঁ' : a.answer === 'না' ? '❌ না' : typeof a.answer === 'number' ? '⭐'.repeat(a.answer) : `"${a.answer}"`}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-outline-secondary rounded-pill fw-bold flex-grow-1"
                    onClick={() => { setViewingResult(null); setView('home'); }}
                  >
                    <i className="bi bi-house me-1" /> হোমে ফিরুন
                  </button>
                  {activeSurvey && (
                    <button
                      className="btn btn-success rounded-pill fw-bold flex-grow-1"
                      onClick={() => startSurvey(activeSurvey)}
                    >
                      <i className="bi bi-arrow-repeat me-1" /> আবার চালান
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Small sub-component for text answers */
function TextAnswer({ onSubmit }) {
  const [text, setText] = useState('');
  return (
    <div style={{ animation: 'surveyFadeUp 0.5s ease' }}>
      <textarea
        className="form-control rounded-3 mb-3"
        rows={3}
        placeholder="আপনার উত্তর লিখুন..."
        value={text}
        onChange={e => setText(e.target.value)}
        autoFocus
      />
      <button
        className="btn btn-success rounded-pill fw-bold w-100"
        disabled={!text.trim()}
        onClick={() => onSubmit(text.trim())}
      >
        <i className="bi bi-check-lg me-1" /> জমা দিন
      </button>
    </div>
  );
}
