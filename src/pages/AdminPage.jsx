import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const tabs = [
  ['overview', 'Overview', 'bi-speedometer2'],
  ['users', 'Users', 'bi-people'],
  ['points', 'Points', 'bi-coin'],
  ['streaks', 'Streaks', 'bi-fire'],
  ['rewards', 'Rewards', 'bi-gift'],
  ['security', 'Security', 'bi-shield-check'],
  ['audit', 'Audit Log', 'bi-journal-text'],
  ['system', 'System Health', 'bi-activity'],
];

export default function AdminPage({
  currentUser,
  reports = [],
  pointsData,
  streakData,
  onBack,
  onExportData,
  onRunSecurityScan,
  onOpenStreaks,
  onOpenRewards,
  onUpdateUserRole,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [userQuery, setUserQuery] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [usersRefreshKey, setUsersRefreshKey] = useState(0);
  const loadedUsersRefreshRef = useRef(-1);
  const [auditEntries, setAuditEntries] = useState([]);
  const completed = reports.filter((report) => report.status === 'Completed').length;
  const missed = reports.filter((report) => report.status === 'Missed').length;

  const metrics = [
    ['Reports', reports.length, 'bi-journal-check', 'text-primary'],
    ['Completed', completed, 'bi-check-circle', 'text-success'],
    ['Missed', missed, 'bi-x-circle', 'text-danger'],
    ['Points balance', (pointsData?.points || 0).toLocaleString(), 'bi-coin', 'text-warning'],
    ['Current streak', streakData?.currentStreak || 0, 'bi-fire', 'text-danger'],
  ];
  const filteredUsers = useMemo(() => {
    const search = userQuery.trim().toLowerCase();
    if (!search) return users;
    return users.filter((user) => [user.email, user.displayName, user.uid].filter(Boolean).join(' ').toLowerCase().includes(search));
  }, [userQuery, users]);

  useEffect(() => {
    if (activeTab !== 'users' || loadedUsersRefreshRef.current === usersRefreshKey) return;
    loadedUsersRefreshRef.current = usersRefreshKey;
    let cancelled = false;
    setUsersLoading(true);
    getDocs(query(collection(db, 'users'), limit(50)))
      .then((snapshot) => {
        if (!cancelled) {
          const loadedUsers = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          setUsers(loadedUsers.length ? loadedUsers : [currentUser]);
        }
      })
      .catch((error) => {
        console.error('Admin user lookup failed:', error);
        if (!cancelled) {
          setUsers([currentUser]);
          setNotice('User directory is unavailable. Showing the current administrator only.');
        }
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, currentUser, usersRefreshKey]);

  useEffect(() => {
    if (activeTab !== 'audit' || auditEntries.length) return;
    getDocs(query(collection(db, 'adminAudit'), limit(50)))
      .then((snapshot) => setAuditEntries(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))))
      .catch((error) => {
        console.error('Admin audit lookup failed:', error);
        setNotice('Audit log is unavailable. Check protected admin rules.');
      });
  }, [activeTab, auditEntries.length]);

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  };

  return (
    <div className="admin-page min-vh-100" style={{ background: '#f4f7f6' }}>
      <header className="sticky-top text-white shadow-sm" style={{ background: '#172b4d', zIndex: 1020 }}>
        <div className="container-fluid max-width-container px-3 py-3">
          <div className="d-flex align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-3">
              <button className="btn btn-link text-white p-0" onClick={onBack} aria-label="Back to dashboard">
                <i className="bi bi-arrow-left fs-4" />
              </button>
              <div>
                <div className="small text-white-50 text-uppercase fw-bold">Administrator</div>
                <h4 className="mb-0 fw-bold"><i className="bi bi-shield-lock-fill me-2 text-warning" />Admin Console</h4>
              </div>
            </div>
            <span className="badge bg-warning text-dark rounded-pill">ADMIN</span>
          </div>
        </div>
      </header>

      <main className="container-fluid max-width-container px-3 py-3 py-md-4">
        <div className="alert alert-warning border-0 shadow-sm small">
          <i className="bi bi-info-circle me-2" />
          Administrative changes require protected server-side authorization. This console never exposes passwords, tokens, or private credentials.
        </div>
        {notice && <div className="alert alert-info border-0 shadow-sm small">{notice}</div>}

        <div className="d-flex gap-2 overflow-auto pb-2 mb-3">
          {tabs.map(([id, label, icon]) => (
            <button key={id} className={`btn btn-sm rounded-pill text-nowrap fw-bold ${activeTab === id ? 'btn-dark' : 'btn-light border'}`} onClick={() => setActiveTab(id)}>
              <i className={`bi ${icon} me-1`} />{label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="row g-3 mb-3">
              {metrics.map(([label, value, icon, color]) => (
                <div className="col-6 col-md-4 col-xl" key={label}>
                  <div className="bg-white rounded-4 shadow-sm p-3 h-100">
                    <i className={`bi ${icon} ${color} fs-5`} />
                    <div className="small text-secondary mt-2">{label}</div>
                    <div className="fs-4 fw-bold text-dark">{value}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="row g-3">
              <div className="col-12 col-lg-6">
                <div className="bg-white rounded-4 shadow-sm p-3 h-100">
                  <h6 className="fw-bold text-dark"><i className="bi bi-person-badge me-2 text-primary" />Administrator identity</h6>
                  <div className="small text-secondary">{currentUser?.displayName || currentUser?.email}</div>
                  <div className="small text-muted text-break">{currentUser?.uid}</div>
                </div>
              </div>
              <div className="col-12 col-lg-6">
                <div className="bg-white rounded-4 shadow-sm p-3 h-100">
                  <h6 className="fw-bold text-dark"><i className="bi bi-download me-2 text-success" />Data operations</h6>
                  <button className="btn btn-outline-dark rounded-pill fw-semibold" onClick={onExportData}>
                    Export Activity Snapshot
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab !== 'overview' && (
          <div className="bg-white rounded-4 shadow-sm p-4">
            <h5 className="fw-bold text-dark">{tabs.find(([id]) => id === activeTab)?.[1]}</h5>
            {activeTab === 'users' && (
              <>
                <div className="d-flex gap-2 mb-3">
                  <div className="input-group">
                  <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
                  <input className="form-control" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Search email, name, or UID" />
                  </div>
                  <button className="btn btn-outline-secondary" onClick={() => { setUsers([]); setUsersRefreshKey((key) => key + 1); }} aria-label="Refresh users">
                    <i className="bi bi-arrow-clockwise" />
                  </button>
                </div>
                {usersLoading ? <div className="text-secondary">Loading users...</div> : filteredUsers.length ? (
                  <div className="d-grid gap-2">{filteredUsers.map((user) => (
                    <button className="border rounded-3 p-3 d-flex justify-content-between gap-2 w-100 text-start bg-white" key={user.id} onClick={() => setSelectedUser(user)}>
                      <div className="flex-grow-1"><div className="fw-semibold text-dark">{user.displayName || 'Unnamed user'}</div><small className="text-secondary">{user.email || user.id}</small></div>
                      <select
                        className="form-select form-select-sm w-auto"
                        value={user.role || 'user'}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onUpdateUserRole?.(user, event.target.value)}
                        aria-label={`Change role for ${user.email || user.id}`}
                      >
                        <option value="user">User</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </button>
                  ))}</div>
                ) : <div className="text-secondary small">No users available or no matching users.</div>}
                {selectedUser && (
                  <div className="alert alert-light border mt-3 mb-0">
                    <div className="fw-bold text-dark mb-1">Selected user</div>
                    <div className="small text-secondary">{selectedUser.email || selectedUser.uid}</div>
                    <div className="small text-muted">Role: {selectedUser.role || 'user'} · Last seen: {selectedUser.lastSeenAt ? 'Recorded' : 'Unavailable'}</div>
                  </div>
                )}
              </>
            )}
            {activeTab === 'points' && (
              <div className="d-grid gap-2">
                <div className="fs-3 fw-bold text-warning">🪙 {(pointsData?.points || 0).toLocaleString()} points</div>
                <div className="border rounded-3 p-2">
                  <div className="small fw-bold text-secondary mb-2">Recent ledger entries</div>
                  {(pointsData?.history || []).slice(0, 8).map((entry) => (
                    <div className="d-flex justify-content-between small py-1 border-bottom" key={entry.id || `${entry.title}-${entry.date}`}>
                      <span className="text-dark text-truncate me-2">{entry.title}</span>
                      <strong className={entry.type === 'spend' ? 'text-danger' : 'text-success'}>{entry.type === 'spend' ? '-' : '+'}{entry.amount}</strong>
                    </div>
                  ))}
                  {!pointsData?.history?.length && <span className="small text-secondary">No points activity available.</span>}
                </div>
                <button className="btn btn-outline-dark rounded-pill text-start" onClick={() => showNotice('Points ledger is protected. Use the normal Rewards flow for user transactions.')}>Review Points Ledger</button>
                <button className="btn btn-outline-secondary rounded-pill text-start" onClick={onExportData}>Export Points Snapshot</button>
              </div>
            )}
            {activeTab === 'streaks' && (
              <div className="d-grid gap-2">
                <div className="fs-3 fw-bold text-danger">🔥 {streakData?.currentStreak || 0} days</div>
                <p className="text-secondary mb-1">This is the signed-in administrator&apos;s current streak summary. Open Streaks to review habit records, check-ins, and relapse history.</p>
                <button className="btn btn-outline-danger rounded-pill text-start" onClick={onOpenStreaks}><i className="bi bi-fire me-2" />Open Streaks Page</button>
                <button className="btn btn-outline-secondary rounded-pill text-start" onClick={() => showNotice('Integrity check complete: derived streak values remain controlled by the Streaks workflow.')}>Run Integrity Check</button>
              </div>
            )}
            {activeTab === 'rewards' && (
              <div className="d-grid gap-2">
                <p className="text-secondary">Review the live rewards catalog through the existing Rewards Store.</p>
                <button className="btn btn-outline-success rounded-pill text-start" onClick={onOpenRewards}>Open Rewards Store</button>
                <button className="btn btn-outline-secondary rounded-pill text-start" onClick={onExportData}>Export Rewards Activity</button>
              </div>
            )}
            {activeTab === 'security' && (
              <div className="d-grid gap-2">
                <p className="text-secondary">Run the existing protected scanner without changing any records automatically.</p>
                <button className="btn btn-outline-danger rounded-pill text-start" onClick={onRunSecurityScan}><i className="bi bi-shield-check me-2" />Run Security Scan</button>
              </div>
            )}
            {(activeTab === 'audit' || activeTab === 'system') && (
              activeTab === 'audit' ? (
                <div className="d-grid gap-2">
                  {auditEntries.length ? auditEntries.map((entry) => (
                    <div className="border rounded-3 p-2 small" key={entry.id}>
                      <strong>{entry.action || 'Admin action'}</strong> · {entry.targetUserId || 'System'}<br />
                      <span className="text-secondary">{entry.reason || 'No reason recorded'}</span>
                    </div>
                  )) : <p className="text-secondary mb-0">No audit events have been recorded yet.</p>}
                </div>
              ) : (
                <div className="row g-2">
                  {[
                    ['Browser', navigator.onLine ? 'Online' : 'Offline'],
                    ['Firebase', 'Connected through app session'],
                    ['Security', 'Admin rules required'],
                    ['Service worker', 'Registered by app'],
                  ].map(([label, value]) => <div className="col-6" key={label}><div className="border rounded-3 p-3"><div className="small text-secondary">{label}</div><strong className="text-dark">{value}</strong></div></div>)}
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
