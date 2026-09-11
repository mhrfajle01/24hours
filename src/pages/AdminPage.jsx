import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { getStreakDays } from '../hooks/useStreaks';
import CustomFeatureManager from '../components/CustomFeatureManager';

const MOOD_MAP = {
  excited: { emoji: '🤩', color: '#f59e0b' },
  happy: { emoji: '😊', color: '#22c55e' },
  calm: { emoji: '😌', color: '#3b82f6' },
  tired: { emoji: '🥱', color: '#a78bfa' },
  anxious: { emoji: '😰', color: '#ef4444' },
  sad: { emoji: '😔', color: '#64748b' },
  angry: { emoji: '😤', color: '#dc2626' },
};

export default function AdminPage({
  currentUser, reports = [], pointsData, streakData, onBack, onExportData,
  onRunSecurityScan, onUpdateUserRole, sendMessage, updateMyAdminProfile, adminProfiles
}) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [details, setDetails] = useState(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [form, setForm] = useState({ points: '', streak: '', reason: '', role: 'user' });
  const [totalAllPoints, setTotalAllPoints] = useState(0);
  const [sheetView, setSheetView] = useState('profile'); // 'profile' | 'journals' | 'streaks'
  const [userJournals, setUserJournals] = useState([]);
  const [journalsLoading, setJournalsLoading] = useState(false);
  const [userStreaks, setUserStreaks] = useState([]);
  const [streaksLoading, setStreaksLoading] = useState(false);
  const [expandedJournal, setExpandedJournal] = useState(null);
  const [expandedStreak, setExpandedStreak] = useState(null);
  const [editingJournal, setEditingJournal] = useState(null);
  const [journalForm, setJournalForm] = useState({ title: '', content: '', mood: 'calm' });
  const [streakForm, setStreakForm] = useState({ startDate: '', bestStreak: '' });
  const [editingStreak, setEditingStreak] = useState(null);
  const [directMessage, setDirectMessage] = useState('');
  
  // Creator Profile State
  const [adminTab, setAdminTab] = useState('users'); // 'users' or 'creator'
  const myAdminProfile = adminProfiles?.find(p => p.id === currentUser?.uid) || {};
  const [creatorForm, setCreatorForm] = useState({
    displayName: myAdminProfile.displayName || currentUser?.displayName || '',
    photoUrl: myAdminProfile.photoUrl || currentUser?.photoURL || '',
    roleTitle: myAdminProfile.roleTitle || 'Creator',
    introduction: myAdminProfile.introduction || '',
    socialLinks: myAdminProfile.socialLinks || []
  });

  const refreshRef = useRef(0);

  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  };

  // Load all users
  const loadUsers = () => {
    const requestId = ++refreshRef.current;
    setLoading(true);
    getDocs(collection(db, 'users')).then((snapshot) => {
      if (requestId !== refreshRef.current) return;
      setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }).catch((error) => {
      console.error('Admin user lookup failed:', error);
      notify('Unable to load the user directory.');
    }).finally(() => setLoading(false));
  };

  // Load total points across ALL users
  const loadTotalPoints = () => {
    getDocs(collection(db, 'points')).then((snapshot) => {
      let total = 0;
      snapshot.docs.forEach((d) => {
        total += Number(d.data().points) || 0;
      });
      setTotalAllPoints(total);
    }).catch((error) => {
      console.error('Admin total points lookup failed:', error);
    });
  };

  useEffect(() => { loadUsers(); loadTotalPoints(); }, []);

  useEffect(() => {
    getDocs(query(collection(db, 'adminAudit'), limit(20))).then((snapshot) => {
      setAuditEntries(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }).catch((error) => {
      console.error('Admin audit lookup failed:', error);
      notify('Unable to load recent admin activity.');
    });
  }, []);

  // Load selected user details
  useEffect(() => {
    if (!selectedUser?.id) {
      setDetails(null);
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      getDoc(doc(db, 'points', selectedUser.id)),
      getDocs(query(collection(db, 'streaks'), where('uid', '==', selectedUser.id), limit(20))),
      getDocs(query(collection(db, 'reports'), where('uid', '==', selectedUser.id), limit(200))),
      getDocs(query(collection(db, 'journals'), where('uid', '==', selectedUser.id), limit(200))),
      getDoc(doc(db, 'streaks', selectedUser.id)),
    ]).then(([pointsSnap, streakSnap, reportsSnap, journalsSnap, mainStreakSnap]) => {
      if (!cancelled) setDetails({
        points: pointsSnap.exists() ? pointsSnap.data() : { points: 0, history: [] },
        mainStreak: mainStreakSnap.exists() ? (mainStreakSnap.data().currentStreak || 0) : 0,
        streaks: streakSnap.docs.map((item) => {
          const sd = item.data();
          sd.currentDays = getStreakDays(sd);
          return { id: item.id, ...sd };
        }).sort((a, b) => b.currentDays - a.currentDays),
        reports: reportsSnap.size,
        journals: journalsSnap.size,
      });
    }).catch((error) => {
      console.error('Admin details lookup failed:', error);
      if (!cancelled) notify('Unable to load this user profile.');
    });
    return () => { cancelled = true; };
  }, [selectedUser]);

  // Load user journals when switching to journals view
  useEffect(() => {
    if (sheetView !== 'journals' || !selectedUser?.id) return;
    setJournalsLoading(true);
    getDocs(query(collection(db, 'journals'), where('uid', '==', selectedUser.id))).then((snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setUserJournals(items);
    }).catch((error) => {
      console.error('Admin journal lookup failed:', error);
      notify('Unable to load journals.');
    }).finally(() => setJournalsLoading(false));
  }, [sheetView, selectedUser]);

  // Load user streaks when switching to streaks view
  useEffect(() => {
    if (sheetView !== 'streaks' || !selectedUser?.id) return;
    setStreaksLoading(true);
    getDocs(query(collection(db, 'streaks'), where('uid', '==', selectedUser.id))).then((snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        data.currentDays = getStreakDays(data);
        return { id: d.id, ...data };
      });
      items.sort((a, b) => b.currentDays - a.currentDays);
      setUserStreaks(items);
    }).catch((error) => {
      console.error('Admin streak lookup failed:', error);
      notify('Unable to load streaks.');
    }).finally(() => setStreaksLoading(false));
  }, [sheetView, selectedUser]);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const value = [user.displayName, user.email, user.id].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = value.includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || (user.accountStatus || 'active') === statusFilter;
    return matchesSearch && matchesStatus;
  }), [users, search, statusFilter]);

  const activeUsers = users.filter((user) => (user.accountStatus || 'active') !== 'suspended').length;
  const suspendedUsers = users.filter((user) => (user.accountStatus || 'active') === 'suspended').length;

  const audit = async (action, target, data = {}) => {
    await addDoc(collection(db, 'adminAudit'), {
      action, targetUserId: target.id, targetEmail: target.email || '',
      adminUid: currentUser.uid, createdAt: serverTimestamp(), ...data,
    });
  };

  const adjustPoints = async (mode) => {
    const amount = Number(form.points);
    if (!Number.isFinite(amount) || amount < 0 || !form.reason.trim()) {
      notify('Enter a valid amount and a reason first.');
      return;
    }
    setActionLoading(true);
    try {
      const ref = doc(db, 'points', selectedUser.id);
      let before = 0;
      let after = 0;
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        const data = snap.exists() ? snap.data() : { points: 0, history: [] };
        before = Number(data.points) || 0;
        after = mode === 'set' ? amount : Math.max(0, before + (mode === 'add' ? amount : -amount));
        const entry = { id: `admin_${Date.now()}`, title: `Admin points ${mode}: ${form.reason.trim()}`, amount: after - before, date: new Date().toISOString(), type: after >= before ? 'earn' : 'spend', adminUid: currentUser.uid };
        transaction.set(ref, { points: after, history: [entry, ...(data.history || [])].slice(0, 50), updatedAt: serverTimestamp() }, { merge: true });
      });
      await audit('points_adjusted', selectedUser, { mode, before, after, reason: form.reason.trim() });
      setAuditEntries((entries) => [{ id: `local_${Date.now()}`, action: 'points_adjusted', targetEmail: selectedUser.email, targetUserId: selectedUser.id }, ...entries].slice(0, 20));
      setDetails((value) => ({ ...value, points: { ...value.points, points: after } }));
      setForm((value) => ({ ...value, points: '', reason: '' }));
      loadTotalPoints();
      notify(`Points updated to ${after.toLocaleString()}.`);
    } catch (error) {
      console.error('Admin points adjustment failed:', error);
      notify('Points adjustment failed.');
    } finally { setActionLoading(false); }
  };

  const adjustStreak = async () => {
    const days = Number(form.streak);
    const target = details?.streaks?.[0];
    if (!target || !Number.isInteger(days) || days < 0 || !form.reason.trim()) {
      notify('Enter a whole-number streak and a reason.');
      return;
    }
    setActionLoading(true);
    try {
      const start = new Date();
      start.setDate(start.getDate() - days + 1);
      await updateDoc(doc(db, 'streaks', target.id), { startDate: start.toISOString().slice(0, 10), currentDays: days, adminAdjustedBy: currentUser.uid, adminAdjustedAt: serverTimestamp() });
      await audit('streak_adjusted', selectedUser, { before: target.currentDays || 0, after: days, reason: form.reason.trim() });
      setAuditEntries((entries) => [{ id: `local_${Date.now()}`, action: 'streak_adjusted', targetEmail: selectedUser.email, targetUserId: selectedUser.id }, ...entries].slice(0, 20));
      setDetails((value) => ({ ...value, streaks: value.streaks.map((item) => item.id === target.id ? { ...item, currentDays: days } : item) }));
      setForm((value) => ({ ...value, streak: '', reason: '' }));
      notify(`Streak updated to ${days} days.`);
    } catch (error) {
      console.error('Admin streak adjustment failed:', error);
      notify('Streak adjustment failed.');
    } finally { setActionLoading(false); }
  };

  const handleSendDirectMessage = async () => {
    if (!directMessage.trim()) return;
    setActionLoading(true);
    try {
      await sendMessage({
        type: 'direct_notice',
        content: directMessage,
        receiverId: selectedUser.id,
      });
      await audit('message_sent', selectedUser, { length: directMessage.length });
      setDirectMessage('');
      notify('Message sent to user.');
    } catch (error) {
      console.error('Admin send message failed:', error);
      notify('Failed to send message.');
    } finally { setActionLoading(false); }
  };

  const handleAddSocialLink = () => {
    setCreatorForm(v => ({ ...v, socialLinks: [...(v.socialLinks || []), { platform: 'Website', url: '', label: '', icon: 'bi-link-45deg' }] }));
  };
  const handleUpdateSocialLink = (index, field, value) => {
    setCreatorForm(v => {
      const newLinks = [...(v.socialLinks || [])];
      newLinks[index] = { ...newLinks[index], [field]: value };
      if (field === 'label' || field === 'platform') {
        const lowerValue = (newLinks[index].label || '').toLowerCase();
        if (lowerValue.includes('twitter') || lowerValue.includes('x')) newLinks[index].icon = 'bi-twitter-x';
        else if (lowerValue.includes('github')) newLinks[index].icon = 'bi-github';
        else if (lowerValue.includes('linkedin')) newLinks[index].icon = 'bi-linkedin';
        else if (lowerValue.includes('instagram')) newLinks[index].icon = 'bi-instagram';
        else if (lowerValue.includes('youtube')) newLinks[index].icon = 'bi-youtube';
        else newLinks[index].icon = 'bi-link-45deg';
      }
      return { ...v, socialLinks: newLinks };
    });
  };
  const handleRemoveSocialLink = (index) => {
    setCreatorForm(v => {
      const newLinks = [...(v.socialLinks || [])];
      newLinks.splice(index, 1);
      return { ...v, socialLinks: newLinks };
    });
  };

  const handleSaveCreatorProfile = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await updateMyAdminProfile(creatorForm);
      notify('Creator profile updated successfully.');
    } catch (err) {
      console.error(err);
      notify('Failed to save creator profile.');
    } finally {
      setActionLoading(false);
    }
  };

  const changeStatus = async () => {
    const next = selectedUser.accountStatus === 'suspended' ? 'active' : 'suspended';
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'users', selectedUser.id), { accountStatus: next, statusUpdatedBy: currentUser.uid, statusUpdatedAt: serverTimestamp() });
      await audit('account_status_changed', selectedUser, { status: next });
      setAuditEntries((entries) => [{ id: `local_${Date.now()}`, action: 'account_status_changed', targetEmail: selectedUser.email, targetUserId: selectedUser.id }, ...entries].slice(0, 20));
      setUsers((items) => items.map((item) => item.id === selectedUser.id ? { ...item, accountStatus: next } : item));
      setSelectedUser((value) => ({ ...value, accountStatus: next }));
      notify(`Account is now ${next}.`);
    } catch (error) {
      console.error('Admin status update failed:', error);
      notify('Account status update failed.');
    } finally { setActionLoading(false); }
  };

  const changeRole = async () => {
    const role = form.role === 'admin' ? 'admin' : 'user';
    if (role === (selectedUser.role || 'user')) {
      notify('Choose a different role first.');
      return;
    }
    setActionLoading(true);
    try {
      await onUpdateUserRole(selectedUser, role);
      setUsers((items) => items.map((item) => item.id === selectedUser.id ? { ...item, role } : item));
      setSelectedUser((value) => ({ ...value, role }));
      setAuditEntries((entries) => [{ id: `local_${Date.now()}`, action: 'role_changed', targetEmail: selectedUser.email, targetUserId: selectedUser.id }, ...entries].slice(0, 20));
      notify(`Role updated to ${role}.`);
    } catch (error) {
      console.error('Admin role update failed:', error);
      notify('Role update failed.');
    } finally { setActionLoading(false); }
  };

  // Journal admin actions
  const handleEditJournal = (journal) => {
    setEditingJournal(journal.id);
    setJournalForm({ title: journal.title || '', content: journal.content || '', mood: journal.mood || 'calm' });
  };

  const handleSaveJournal = async (journalId) => {
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'journals', journalId), {
        title: journalForm.title,
        content: journalForm.content,
        mood: journalForm.mood,
        adminEditedBy: currentUser.uid,
        adminEditedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await audit('journal_edited', selectedUser, { journalId });
      setUserJournals((items) => items.map((j) => j.id === journalId ? { ...j, ...journalForm } : j));
      setEditingJournal(null);
      notify('Journal entry updated.');
    } catch (error) {
      console.error('Admin journal edit failed:', error);
      notify('Journal update failed.');
    } finally { setActionLoading(false); }
  };

  const handleDeleteJournal = async (journalId) => {
    if (!window.confirm('Delete this journal entry? This cannot be undone.')) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'journals', journalId));
      await audit('journal_deleted', selectedUser, { journalId });
      setUserJournals((items) => items.filter((j) => j.id !== journalId));
      setDetails((prev) => prev ? { ...prev, journals: Math.max(0, prev.journals - 1) } : prev);
      notify('Journal entry deleted.');
    } catch (error) {
      console.error('Admin journal delete failed:', error);
      notify('Journal deletion failed.');
    } finally { setActionLoading(false); }
  };

  // Streak admin actions
  const handleEditStreak = (streak) => {
    setEditingStreak(streak.id);
    setStreakForm({
      startDate: streak.startDate || '',
      bestStreak: streak.bestStreak?.toString() || '0',
    });
  };

  const handleSaveStreak = async (streakId) => {
    setActionLoading(true);
    try {
      const updates = {
        adminEditedBy: currentUser.uid,
        adminEditedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (streakForm.startDate) updates.startDate = streakForm.startDate;
      if (streakForm.bestStreak !== '') updates.bestStreak = Number(streakForm.bestStreak) || 0;
      await updateDoc(doc(db, 'streaks', streakId), updates);
      await audit('streak_edited', selectedUser, { streakId });
      setUserStreaks((items) => items.map((s) => {
        if (s.id !== streakId) return s;
        const updated = { ...s, ...updates };
        updated.currentDays = getStreakDays(updated);
        return updated;
      }));
      setEditingStreak(null);
      notify('Streak updated.');
    } catch (error) {
      console.error('Admin streak edit failed:', error);
      notify('Streak update failed.');
    } finally { setActionLoading(false); }
  };

  const handleDeleteStreak = async (streakId) => {
    if (!window.confirm('Delete this streak? This cannot be undone.')) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'streaks', streakId));
      await audit('streak_deleted', selectedUser, { streakId });
      setUserStreaks((items) => items.filter((s) => s.id !== streakId));
      notify('Streak deleted.');
    } catch (error) {
      console.error('Admin streak delete failed:', error);
      notify('Streak deletion failed.');
    } finally { setActionLoading(false); }
  };

  const handleResetStreak = async (streak) => {
    if (!window.confirm(`Reset "${streak.name}" streak to 0 days?`)) return;
    setActionLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await updateDoc(doc(db, 'streaks', streak.id), {
        startDate: today,
        totalRelapses: (streak.totalRelapses || 0) + 1,
        bestStreak: Math.max(streak.bestStreak || 0, streak.currentDays || 0),
        adminResetBy: currentUser.uid,
        adminResetAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await audit('streak_reset', selectedUser, { streakId: streak.id, previousDays: streak.currentDays });
      setUserStreaks((items) => items.map((s) => s.id === streak.id ? { ...s, startDate: today, currentDays: 0, totalRelapses: (s.totalRelapses || 0) + 1 } : s));
      notify(`"${streak.name}" reset to 0 days.`);
    } catch (error) {
      console.error('Admin streak reset failed:', error);
      notify('Streak reset failed.');
    } finally { setActionLoading(false); }
  };

  const confirm = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action.type === 'status') return changeStatus();
    if (action.type === 'streak') return adjustStreak();
    if (action.type === 'role') return changeRole();
    return adjustPoints(action.mode);
  };

  // ── Sheet tab views ─────────────────────────────────────────────
  const renderSheetTabs = () => (
    <div className="admin-sheet-tabs">
      {[['profile', 'bi-person-fill', 'Profile'], ['journals', 'bi-journal-text', 'Journals'], ['streaks', 'bi-fire', 'Streaks']].map(([key, icon, label]) => (
        <button key={key} type="button" className={`admin-sheet-tab ${sheetView === key ? 'active' : ''}`}
          onClick={() => setSheetView(key)}>
          <i className={`bi ${icon}`} />{label}
        </button>
      ))}
    </div>
  );

  const renderJournalsView = () => (
    <div className="admin-journals-view">
      <div className="admin-section-heading" style={{ marginBottom: '.5rem' }}>
        <div><small>JOURNAL ENTRIES</small><h2>{selectedUser?.displayName}'s Journals</h2></div>
        <span className="admin-count">{userJournals.length}</span>
      </div>
      {journalsLoading ? (
        <div className="admin-empty"><span className="spinner-border spinner-border-sm" /> Loading journals...</div>
      ) : userJournals.length === 0 ? (
        <div className="admin-empty"><i className="bi bi-journal-x" />No journal entries found</div>
      ) : (
        <div className="admin-journal-list animated-list">
          {userJournals.map((journal, index) => (
            <div key={journal.id} className="admin-journal-card animated-row" style={{ animationDelay: `${index * 0.04}s` }}>
              {editingJournal === journal.id ? (
                <div className="admin-journal-edit-form">
                  <input value={journalForm.title} onChange={(e) => setJournalForm((v) => ({ ...v, title: e.target.value }))} placeholder="Title" />
                  <textarea value={journalForm.content} onChange={(e) => setJournalForm((v) => ({ ...v, content: e.target.value }))} placeholder="Content" rows={4} />
                  <div className="admin-journal-mood-row">
                    {Object.entries(MOOD_MAP).map(([mood, { emoji }]) => (
                      <button key={mood} type="button" className={journalForm.mood === mood ? 'active' : ''}
                        onClick={() => setJournalForm((v) => ({ ...v, mood }))}>{emoji}</button>
                    ))}
                  </div>
                  <div className="admin-journal-edit-actions">
                    <button className="green" disabled={actionLoading} onClick={() => handleSaveJournal(journal.id)}>Save</button>
                    <button className="dark" onClick={() => setEditingJournal(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="admin-journal-header" onClick={() => setExpandedJournal(expandedJournal === journal.id ? null : journal.id)}>
                    <div className="admin-journal-meta">
                      {journal.mood && MOOD_MAP[journal.mood] && (
                        <span className="admin-journal-mood" style={{ background: MOOD_MAP[journal.mood].color + '22', color: MOOD_MAP[journal.mood].color }}>
                          {MOOD_MAP[journal.mood].emoji} {journal.mood}
                        </span>
                      )}
                      <span className="admin-journal-date">{journal.date || 'No date'}</span>
                    </div>
                    <strong className="admin-journal-title">{journal.title || 'Untitled'}</strong>
                    <i className={`bi ${expandedJournal === journal.id ? 'bi-chevron-up' : 'bi-chevron-down'} admin-chevron`} />
                  </div>
                  {expandedJournal === journal.id && (
                    <div className="admin-journal-body">
                      <pre className="admin-journal-content">{journal.content || 'No content'}</pre>
                      {journal.tags?.length > 0 && (
                        <div className="admin-journal-tags">
                          {journal.tags.map((tag) => <span key={tag} className="admin-journal-tag">#{tag}</span>)}
                        </div>
                      )}
                      <div className="admin-journal-actions">
                        <button onClick={() => handleEditJournal(journal)}><i className="bi bi-pencil" /> Edit</button>
                        <button className="danger" onClick={() => handleDeleteJournal(journal.id)}><i className="bi bi-trash3" /> Delete</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderStreaksView = () => (
    <div className="admin-streaks-view">
      <div className="admin-section-heading" style={{ marginBottom: '.5rem' }}>
        <div><small>HABIT STREAKS</small><h2>{selectedUser?.displayName}'s Streaks</h2></div>
        <span className="admin-count">{userStreaks.length}</span>
      </div>
      {streaksLoading ? (
        <div className="admin-empty"><span className="spinner-border spinner-border-sm" /> Loading streaks...</div>
      ) : userStreaks.length === 0 ? (
        <div className="admin-empty"><i className="bi bi-fire" />No streaks found</div>
      ) : (
        <div className="admin-streak-list animated-list">
          {userStreaks.map((streak, index) => (
            <div key={streak.id} className="admin-streak-card animated-row" style={{ animationDelay: `${index * 0.04}s` }}>
              {editingStreak === streak.id ? (
                <div className="admin-streak-edit-form">
                  <label>Start Date
                    <input type="date" value={streakForm.startDate} onChange={(e) => setStreakForm((v) => ({ ...v, startDate: e.target.value }))} />
                  </label>
                  <label>Best Streak (days)
                    <input type="number" min="0" value={streakForm.bestStreak} onChange={(e) => setStreakForm((v) => ({ ...v, bestStreak: e.target.value }))} />
                  </label>
                  <div className="admin-journal-edit-actions">
                    <button className="green" disabled={actionLoading} onClick={() => handleSaveStreak(streak.id)}>Save</button>
                    <button className="dark" onClick={() => setEditingStreak(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="admin-streak-header" onClick={() => setExpandedStreak(expandedStreak === streak.id ? null : streak.id)}>
                    <div className="admin-streak-top">
                      <span className="admin-streak-emoji">{streak.emoji || '🎯'}</span>
                      <div className="admin-streak-info">
                        <strong>{streak.name || 'Unnamed habit'}</strong>
                        <span className={`admin-streak-type ${streak.category === 'Breaking' ? 'breaker' : 'builder'}`}>
                          {streak.category === 'Breaking' ? '🚫 Breaking' : '🔨 Building'}
                        </span>
                      </div>
                      <div className="admin-streak-days">
                        <strong>{streak.currentDays || 0}</strong>
                        <small>days</small>
                      </div>
                    </div>
                    <i className={`bi ${expandedStreak === streak.id ? 'bi-chevron-up' : 'bi-chevron-down'} admin-chevron`} />
                  </div>
                  {expandedStreak === streak.id && (
                    <div className="admin-streak-detail">
                      <div className="admin-streak-stats">
                        <div><strong>{streak.bestStreak || 0}</strong><small>Best streak</small></div>
                        <div><strong>{streak.totalRelapses || 0}</strong><small>Relapses</small></div>
                        <div><strong>{streak.startDate || '—'}</strong><small>Start date</small></div>
                      </div>
                      {streak.relapseHistory?.length > 0 && (
                        <div className="admin-streak-relapses">
                          <small style={{ color: '#f87171', fontWeight: 700, fontSize: '.65rem' }}>RELAPSE HISTORY</small>
                          {streak.relapseHistory.slice(-5).reverse().map((r, i) => (
                            <div key={i} className="admin-relapse-item">
                              <span>{r.date}</span>
                              <span>{r.streakLength || r.length || 0}d lost</span>
                              {r.trigger && <span className="admin-relapse-trigger">{r.trigger}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="admin-streak-actions">
                        <button onClick={() => handleEditStreak(streak)}><i className="bi bi-pencil" /> Edit</button>
                        <button className="warning" onClick={() => handleResetStreak(streak)}><i className="bi bi-arrow-counterclockwise" /> Reset</button>
                        <button className="danger" onClick={() => handleDeleteStreak(streak.id)}><i className="bi bi-trash3" /> Delete</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderProfileView = () => (
    details ? <>
      <div className="admin-detail-grid">
        <div><strong>{(details.points.points || 0).toLocaleString()}</strong><small>Points</small></div>
        <div><strong>{details.mainStreak}</strong><small>Main streak</small></div>
        <div><strong>{details.reports}</strong><small>Plans</small></div>
        <div><strong>{details.journals}</strong><small>Journals</small></div>
      </div>
      {details.streaks.length > 0 && <div className="admin-form-grid" style={{ marginBottom: '1rem' }}>
        <div className="wide"><small style={{ color: '#00d2ff', fontSize: '0.65rem', fontWeight: 'bold' }}>USER HABITS</small></div>
        {details.streaks.map(s => <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', color: '#fff', fontSize: '0.75rem' }}>
          <span>{s.name || 'Habit'} <em style={{ color: '#cbd5e1', fontSize: '0.65rem' }}>({s.type === 'breaker' ? 'Breaker' : 'Builder'})</em></span>
          <strong>{s.currentDays}d</strong>
        </div>)}
      </div>}
      <div className="admin-form-grid">
        <input type="number" min="0" value={form.points} onChange={(event) => setForm((value) => ({ ...value, points: event.target.value }))} placeholder="Points amount" />
        <input type="number" min="0" value={form.streak} onChange={(event) => setForm((value) => ({ ...value, streak: event.target.value }))} placeholder="Streak days" />
        <input className="wide" value={form.reason} onChange={(event) => setForm((value) => ({ ...value, reason: event.target.value }))} placeholder="Reason required for every change" />
      </div>
      <div className="admin-role-row">
        <select value={form.role} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value }))}>
          <option value="user">User role</option>
          <option value="admin">Administrator role</option>
        </select>
        <button className="role" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'role' })}>Update role</button>
      </div>

      <div className="admin-form-grid" style={{ marginTop: '.5rem', marginBottom: '.5rem' }}>
        <div className="wide"><small style={{ color: '#00d2ff', fontSize: '0.65rem', fontWeight: 'bold' }}>DIRECT MESSAGE</small></div>
        <textarea 
          className="wide" 
          style={{ width:'100%', padding:'.7rem', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'.7rem', outline:0, fontSize:'.75rem', background:'rgba(0,0,0,0.2)', color:'#fff' }}
          rows="3"
          placeholder="Send a direct notification to this user..."
          value={directMessage}
          onChange={(e) => setDirectMessage(e.target.value)}
        />
        <button 
          className="wide green" 
          style={{ padding:'.6rem', border:0, borderRadius:'.6rem', fontWeight:800, color:'#fff', background:'#16a34a' }}
          disabled={actionLoading || !directMessage.trim()} 
          onClick={handleSendDirectMessage}
        >
          <i className="bi bi-send-fill me-2" /> Send Message
        </button>
      </div>

      <div className="admin-sheet-actions">
        <button className="green" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'points', mode: 'add' })}>+ Add points</button>
        <button className="red" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'points', mode: 'remove' })}>- Remove</button>
        <button className="gold" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'points', mode: 'set' })}>Set balance</button>
        <button className="blue" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'streak' })}>Set main streak</button>
        <button className="dark" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'status' })}>{selectedUser.accountStatus === 'suspended' ? 'Reactivate account' : 'Suspend account'}</button>
      </div>
    </> : <div className="admin-empty"><span className="spinner-border spinner-border-sm" /> Loading profile...</div>
  );

  return (
    <div className="admin-mobile-shell">
      <header className="admin-mobile-header">
        <button className="admin-icon-button" onClick={onBack} aria-label="Back"><i className="bi bi-arrow-left" /></button>
        <div className="admin-brand"><span className="admin-brand-mark"><i className="bi bi-shield-check" /></span><div><strong>Admin workspace</strong><small>{currentUser?.email}</small></div></div>
        <span className="admin-status-pill"><span className="admin-status-dot" />Live</span>
      </header>
      <main className="admin-mobile-content">
        <section className="admin-welcome-card">
          <div className="admin-welcome-copy">
            <small>CONTROL CENTER</small>
            <h1>Manage your community</h1>
            <p>Everything important, in one secure workspace.</p>
            <div className="admin-badges">
              <span><i className="bi bi-signal" /> Live sync</span>
              <span><i className="bi bi-clock-history" /> {auditEntries.length} actions</span>
            </div>
          </div>
          <div className="admin-hero-visual">
            <i className="bi bi-grid-1x2-fill admin-welcome-icon" />
            <span className="admin-orb orb-one" />
            <span className="admin-orb orb-two" />
          </div>
        </section>
        {notice && <div className="admin-inline-notice"><i className="bi bi-info-circle-fill" />{notice}</div>}
        <section className="admin-kpi-grid">
          <div className="admin-kpi kpi-blue"><i className="bi bi-people-fill" /><strong>{users.length}</strong><span>Users</span></div>
          <div className="admin-kpi kpi-green"><i className="bi bi-check-circle-fill" /><strong>{activeUsers}</strong><span>Active</span></div>
        </section>

        <div className="admin-main-tabs" style={{ display: 'flex', gap: '1rem', padding: '0 1rem', marginBottom: '1rem', marginTop: '1rem' }}>
          <button 
            className={`admin-main-tab ${adminTab === 'users' ? 'active' : ''}`}
            onClick={() => setAdminTab('users')}
            style={{ flex: 1, padding: '0.8rem', borderRadius: '0.5rem', border: 'none', background: adminTab === 'users' ? '#8a2be2' : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Users Directory
          </button>
          <button 
            className={`admin-main-tab ${adminTab === 'creator' ? 'active' : ''}`}
            onClick={() => setAdminTab('creator')}
            style={{ flex: 1, padding: '0.8rem', borderRadius: '0.5rem', border: 'none', background: adminTab === 'creator' ? '#8a2be2' : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
          >
            My Creator Profile
          </button>
          <button 
            className={`admin-main-tab ${adminTab === 'features' ? 'active' : ''}`}
            onClick={() => setAdminTab('features')}
            style={{ flex: 1, padding: '0.8rem', borderRadius: '0.5rem', border: 'none', background: adminTab === 'features' ? '#8a2be2' : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Features
          </button>
        </div>

        {adminTab === 'users' && (
          <>
            <section className="admin-section-card"><div className="admin-section-heading"><div><small>DIRECTORY</small><h2>User management</h2></div><button className="admin-icon-button light" onClick={loadUsers} aria-label="Refresh"><i className="bi bi-arrow-clockwise" /></button></div>
              <div className="admin-search"><i className="bi bi-search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or UID" /></div>
              <div className="admin-filter-row">{[['all', 'All'], ['active', 'Active'], ['suspended', 'Suspended']].map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value} className={`admin-filter ${statusFilter === value ? 'active' : ''}`} onClick={() => setStatusFilter(value)}>{label}</button>)}</div>
              {loading ? <div className="admin-empty"><span className="spinner-border spinner-border-sm" /> Loading users...</div> : filteredUsers.length ? <div className="admin-user-list animated-list">{filteredUsers.map((user, index) => <button style={{ animationDelay: `${index * 0.05}s` }} type="button" className={`admin-user-row animated-row ${selectedUser?.id === user.id ? 'selected' : ''}`} key={user.id} onClick={() => { setSelectedUser(user); setDetails(null); setForm({ points: '', streak: '', reason: '', role: user.role || 'user' }); }}><span className="admin-avatar">{(user.displayName || user.email || '?').charAt(0).toUpperCase()}</span><span className="admin-user-main"><strong>{user.displayName || 'Unnamed user'}</strong><small>{user.email || user.id}</small><span className="admin-user-meta"><b className={user.accountStatus === 'suspended' ? 'danger' : 'success'}>{user.accountStatus || 'active'}</b><em>{user.role || 'user'}</em></span></span><i className="bi bi-chevron-right admin-chevron" /></button>)}</div> : <div className="admin-empty"><i className="bi bi-person-x" />No matching users</div>}
            </section>
            <section className="admin-section-card"><div className="admin-section-heading"><div><small>ACTIVITY</small><h2>Recent audit log</h2></div><span className="admin-count">{auditEntries.length}</span></div><div className="animated-list">{auditEntries.slice(0, 5).map((entry, index) => <div style={{ animationDelay: `${index * 0.05}s` }} className="admin-audit-item animated-row" key={entry.id}><span className="admin-audit-icon"><i className="bi bi-check2" /></span><div><strong>{entry.action || 'Admin action'}</strong><small>{entry.targetEmail || entry.targetUserId}</small></div></div>)}</div></section>
            <div className="admin-quick-actions">
              {onExportData && <button type="button" onClick={onExportData}><i className="bi bi-download" />Export</button>}
              {onRunSecurityScan && <button type="button" onClick={onRunSecurityScan}><i className="bi bi-shield-check" />Security</button>}
            </div>
          </>
        )}

        {adminTab === 'features' && (
           <div className="px-3 pb-5">
             <CustomFeatureManager />
           </div>
        )}

        {adminTab === 'creator' && (
          <section className="admin-section-card">
            <div className="admin-section-heading">
              <div>
                <small>PUBLIC PROFILE</small>
                <h2>My Creator Profile</h2>
              </div>
            </div>
            <form onSubmit={handleSaveCreatorProfile} className="admin-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div>
                <label style={{ color: '#00d2ff', fontSize: '0.75rem', fontWeight: 'bold' }}>Display Name</label>
                <input 
                  type="text" 
                  value={creatorForm.displayName} 
                  onChange={(e) => setCreatorForm(v => ({ ...v, displayName: e.target.value }))} 
                  placeholder="Your public name" 
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ color: '#00d2ff', fontSize: '0.75rem', fontWeight: 'bold' }}>Role / Title</label>
                <input 
                  type="text" 
                  value={creatorForm.roleTitle} 
                  onChange={(e) => setCreatorForm(v => ({ ...v, roleTitle: e.target.value }))} 
                  placeholder="e.g. Lead Developer, Community Manager" 
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ color: '#00d2ff', fontSize: '0.75rem', fontWeight: 'bold' }}>Photo URL</label>
                <input 
                  type="url" 
                  value={creatorForm.photoUrl} 
                  onChange={(e) => setCreatorForm(v => ({ ...v, photoUrl: e.target.value }))} 
                  placeholder="https://..." 
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ color: '#00d2ff', fontSize: '0.75rem', fontWeight: 'bold' }}>Introduction / Bio</label>
                <textarea 
                  value={creatorForm.introduction} 
                  onChange={(e) => setCreatorForm(v => ({ ...v, introduction: e.target.value }))} 
                  placeholder="Tell the community about yourself..." 
                  rows={4}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
                />
              </div>
              
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <label style={{ color: '#00d2ff', fontSize: '0.75rem', fontWeight: 'bold', margin: 0 }}>Social Media Links</label>
                  <button type="button" onClick={handleAddSocialLink} style={{ background: 'rgba(0,210,255,0.1)', color: '#00d2ff', border: '1px solid rgba(0,210,255,0.2)', padding: '0.3rem 0.6rem', borderRadius: '0.3rem', fontSize: '0.7rem', cursor: 'pointer' }}>
                    <i className="bi bi-plus" /> Add Link
                  </button>
                </div>
                {(creatorForm.socialLinks || []).map((link, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '0.5rem' }}>
                    <input 
                      type="text" 
                      placeholder="Label (e.g. GitHub)" 
                      value={link.label}
                      onChange={(e) => {
                        handleUpdateSocialLink(idx, 'label', e.target.value);
                      }}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '0.3rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem' }}
                    />
                    <input 
                      type="url" 
                      placeholder="https://..." 
                      value={link.url}
                      onChange={(e) => handleUpdateSocialLink(idx, 'url', e.target.value)}
                      style={{ flex: 2, padding: '0.5rem', borderRadius: '0.3rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.75rem' }}
                    />
                    <button type="button" onClick={() => handleRemoveSocialLink(idx)} style={{ background: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', padding: '0 0.5rem' }}>
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                ))}
              </div>

              <button 
                type="submit" 
                className="green" 
                disabled={actionLoading}
                style={{ padding: '0.8rem', borderRadius: '0.5rem', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.5rem' }}
              >
                {actionLoading ? 'Saving...' : 'Save Creator Profile'}
              </button>
            </form>
          </section>
        )}

      </main>

      {selectedUser && <div className="admin-sheet-backdrop" onClick={() => setSelectedUser(null)}>
        <section className="admin-user-sheet" onClick={(event) => event.stopPropagation()}>
          <div className="admin-sheet-handle" />
          <div className="admin-sheet-title">
            <div>
              <small>USER PROFILE</small>
              <h2>{selectedUser.displayName || 'Unnamed user'}</h2>
              <p>{selectedUser.email || selectedUser.id}</p>
            </div>
            <button className="admin-icon-button light" onClick={() => setSelectedUser(null)} aria-label="Close"><i className="bi bi-x-lg" /></button>
          </div>
          {renderSheetTabs()}
          {sheetView === 'profile' && renderProfileView()}
          {sheetView === 'journals' && renderJournalsView()}
          {sheetView === 'streaks' && renderStreaksView()}
        </section>
      </div>}

      {confirmAction && <div className="admin-confirm-backdrop"><div className="admin-confirm-card"><span className="admin-confirm-badge"><i className="bi bi-shield-lock-fill" /></span><small>SECURITY CONFIRMATION</small><h2>Confirm this action?</h2><p>This change for <strong>{selectedUser?.displayName || selectedUser?.email}</strong> will be recorded in the audit log.</p><div className="d-flex gap-2"><button className="admin-cancel-button" onClick={() => setConfirmAction(null)}>Cancel</button><button className="admin-confirm-button" onClick={confirm}>Confirm action</button></div></div></div>}
    </div>
  );
}
