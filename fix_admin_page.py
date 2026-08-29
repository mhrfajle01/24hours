import re

with open('src/pages/AdminPage.jsx', 'r') as f:
    content = f.read()

missing_users_code = """
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
"""

target = """        <section className="admin-kpi-grid">
          <div className="admin-kpi kpi-blue"><i className="bi bi-people-fill" /><strong>{users.length}</strong><span>Users</span></div>
          <div className="admin-kpi kpi-green"><i className="bi bi-check-circle-fill" /><strong>{activeUsers}</strong><span>Active</span></div>
        </div>"""

new_content = content.replace(target, target + "\n" + missing_users_code)

with open('src/pages/AdminPage.jsx', 'w') as f:
    f.write(new_content)
