import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { getStreakDays } from '../hooks/useStreaks';

export default function AdminPage({
  currentUser, reports = [], pointsData, streakData, onBack, onExportData,
  onRunSecurityScan, onOpenStreaks, onOpenRewards, onUpdateUserRole,
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
  const refreshRef = useRef(0);

  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  };

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

  useEffect(() => { loadUsers(); }, []);

  useEffect(() => {
    getDocs(query(collection(db, 'adminAudit'), limit(20))).then((snapshot) => {
      setAuditEntries(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }).catch((error) => {
      console.error('Admin audit lookup failed:', error);
      notify('Unable to load recent admin activity.');
    });
  }, []);

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
          const streakData = item.data();
          streakData.currentDays = getStreakDays(streakData);
          return { id: item.id, ...streakData };
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

  const confirm = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action.type === 'status') return changeStatus();
    if (action.type === 'streak') return adjustStreak();
    if (action.type === 'role') return changeRole();
    return adjustPoints(action.mode);
  };

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
          <div className="admin-kpi kpi-red"><i className="bi bi-slash-circle-fill" /><strong>{suspendedUsers}</strong><span>Suspended</span></div>
          <div className="admin-kpi kpi-gold"><i className="bi bi-lightning-charge-fill" /><strong>{(pointsData?.points || 0).toLocaleString()}</strong><span>Points</span></div>
        </section>
        <section className="admin-section-card"><div className="admin-section-heading"><div><small>DIRECTORY</small><h2>User management</h2></div><button className="admin-icon-button light" onClick={loadUsers} aria-label="Refresh"><i className="bi bi-arrow-clockwise" /></button></div>
          <div className="admin-search"><i className="bi bi-search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, or UID" /></div>
          <div className="admin-filter-row">{[['all', 'All'], ['active', 'Active'], ['suspended', 'Suspended']].map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value} className={`admin-filter ${statusFilter === value ? 'active' : ''}`} onClick={() => setStatusFilter(value)}>{label}</button>)}</div>
          {loading ? <div className="admin-empty"><span className="spinner-border spinner-border-sm" /> Loading users...</div> : filteredUsers.length ? <div className="admin-user-list animated-list">{filteredUsers.map((user, index) => <button style={{ animationDelay: `${index * 0.05}s` }} type="button" className={`admin-user-row animated-row ${selectedUser?.id === user.id ? 'selected' : ''}`} key={user.id} onClick={() => { setSelectedUser(user); setDetails(null); setForm({ points: '', streak: '', reason: '', role: user.role || 'user' }); }}><span className="admin-avatar">{(user.displayName || user.email || '?').charAt(0).toUpperCase()}</span><span className="admin-user-main"><strong>{user.displayName || 'Unnamed user'}</strong><small>{user.email || user.id}</small><span className="admin-user-meta"><b className={user.accountStatus === 'suspended' ? 'danger' : 'success'}>{user.accountStatus || 'active'}</b><em>{user.role || 'user'}</em></span></span><i className="bi bi-chevron-right admin-chevron" /></button>)}</div> : <div className="admin-empty"><i className="bi bi-person-x" />No matching users</div>}
        </section>
        <section className="admin-section-card"><div className="admin-section-heading"><div><small>ACTIVITY</small><h2>Recent audit log</h2></div><span className="admin-count">{auditEntries.length}</span></div><div className="animated-list">{auditEntries.slice(0, 5).map((entry, index) => <div style={{ animationDelay: `${index * 0.05}s` }} className="admin-audit-item animated-row" key={entry.id}><span className="admin-audit-icon"><i className="bi bi-check2" /></span><div><strong>{entry.action || 'Admin action'}</strong><small>{entry.targetEmail || entry.targetUserId}</small></div></div>)}</div></section>
        <div className="admin-quick-actions"><button type="button" onClick={onExportData}><i className="bi bi-download" />Export</button><button type="button" onClick={onRunSecurityScan}><i className="bi bi-shield-check" />Security</button><button type="button" onClick={onOpenStreaks}><i className="bi bi-fire" />Streaks</button><button type="button" onClick={onOpenRewards}><i className="bi bi-gift" />Rewards</button></div>
      </main>
      {selectedUser && <div className="admin-sheet-backdrop" onClick={() => setSelectedUser(null)}><section className="admin-user-sheet" onClick={(event) => event.stopPropagation()}><div className="admin-sheet-handle" /><div className="admin-sheet-title"><div><small>USER PROFILE</small><h2>{selectedUser.displayName || 'Unnamed user'}</h2><p>{selectedUser.email || selectedUser.id}</p></div><button className="admin-icon-button light" onClick={() => setSelectedUser(null)} aria-label="Close"><i className="bi bi-x-lg" /></button></div>{details ? <><div className="admin-detail-grid"><div><strong>{(details.points.points || 0).toLocaleString()}</strong><small>Points</small></div><div><strong>{details.mainStreak}</strong><small>Main streak</small></div><div><strong>{details.reports}</strong><small>Plans</small></div><div><strong>{details.journals}</strong><small>Journals</small></div></div>{details.streaks.length > 0 && <div className="admin-form-grid" style={{ marginBottom: '1rem' }}><div className="wide"><small style={{ color: '#00d2ff', fontSize: '0.65rem', fontWeight: 'bold' }}>USER HABITS</small></div>{details.streaks.map(s => <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', color: '#fff', fontSize: '0.75rem' }}><span>{s.name || 'Habit'} <em style={{ color: '#cbd5e1', fontSize: '0.65rem' }}>({s.type === 'breaker' ? 'Breaker' : 'Builder'})</em></span><strong>{s.currentDays}d</strong></div>)}</div>}<div className="admin-form-grid"><input type="number" min="0" value={form.points} onChange={(event) => setForm((value) => ({ ...value, points: event.target.value }))} placeholder="Points amount" /><input type="number" min="0" value={form.streak} onChange={(event) => setForm((value) => ({ ...value, streak: event.target.value }))} placeholder="Streak days" /><input className="wide" value={form.reason} onChange={(event) => setForm((value) => ({ ...value, reason: event.target.value }))} placeholder="Reason required for every change" /></div><div className="admin-role-row"><select value={form.role} onChange={(event) => setForm((value) => ({ ...value, role: event.target.value }))}><option value="user">User role</option><option value="admin">Administrator role</option></select><button className="role" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'role' })}>Update role</button></div><div className="admin-sheet-actions"><button className="green" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'points', mode: 'add' })}>+ Add points</button><button className="red" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'points', mode: 'remove' })}>- Remove</button><button className="gold" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'points', mode: 'set' })}>Set balance</button><button className="blue" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'streak' })}>Set main streak</button><button className="dark" disabled={actionLoading} onClick={() => setConfirmAction({ type: 'status' })}>{selectedUser.accountStatus === 'suspended' ? 'Reactivate account' : 'Suspend account'}</button></div></> : <div className="admin-empty"><span className="spinner-border spinner-border-sm" /> Loading profile...</div>}</section></div>}
      {confirmAction && <div className="admin-confirm-backdrop"><div className="admin-confirm-card"><span className="admin-confirm-badge"><i className="bi bi-shield-lock-fill" /></span><small>SECURITY CONFIRMATION</small><h2>Confirm this action?</h2><p>This change for <strong>{selectedUser?.displayName || selectedUser?.email}</strong> will be recorded in the audit log.</p><div className="d-flex gap-2"><button className="admin-cancel-button" onClick={() => setConfirmAction(null)}>Cancel</button><button className="admin-confirm-button" onClick={confirm}>Confirm action</button></div></div></div>}
    </div>
  );
}
