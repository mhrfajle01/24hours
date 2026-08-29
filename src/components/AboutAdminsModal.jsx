import React from 'react';

export default function AboutAdminsModal({ isOpen, onClose, adminProfiles, loading }) {
  if (!isOpen) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1060, background: 'rgba(0,0,0,0.8)' }} onClick={onClose}>
      <div 
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable" 
        style={{ width: '90%', maxWidth: '500px', margin: '1.5rem auto' }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0" style={{ borderRadius: '1.5rem', background: 'rgba(25, 25, 35, 0.95)', backdropFilter: 'blur(20px)', color: '#fff', boxShadow: '0 1rem 3rem rgba(0,0,0,0.6)' }}>
          
          <div className="modal-header border-0 pb-0 pt-4 px-4 d-flex justify-content-between align-items-center">
            <h5 className="modal-title fw-bold" style={{ color: '#00d2ff' }}>
              <i className="bi bi-stars me-2 text-warning" />
              Meet the Creators
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} aria-label="Close"></button>
          </div>

          <div className="modal-body px-4 py-4">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-info" role="status"></div>
                <p className="mt-2 text-secondary small">Loading profiles...</p>
              </div>
            ) : adminProfiles.length === 0 ? (
              <div className="text-center py-5 text-secondary">
                <i className="bi bi-person-slash fs-1 d-block mb-3"></i>
                <p>No creator profiles have been set up yet.</p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-4">
                {adminProfiles.map((profile) => (
                  <div key={profile.id} className="admin-creator-card p-4 rounded-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div className="d-flex align-items-center gap-3 mb-3">
                      <div className="creator-avatar rounded-circle overflow-hidden border border-2" style={{ width: '70px', height: '70px', borderColor: '#8a2be2', flexShrink: 0 }}>
                        {profile.photoUrl ? (
                          <img src={profile.photoUrl} alt={profile.displayName} className="w-100 h-100 object-fit-cover" />
                        ) : (
                          <div className="w-100 h-100 d-flex align-items-center justify-content-center fw-bold fs-3" style={{ background: '#8a2be2' }}>
                            {(profile.displayName || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className="m-0 fw-bold">{profile.displayName || 'Anonymous Admin'}</h4>
                        <span className="badge mt-1" style={{ background: 'rgba(138, 43, 226, 0.2)', color: '#d8b4fe' }}>
                          {profile.roleTitle || 'Administrator'}
                        </span>
                      </div>
                    </div>
                    
                    {profile.introduction && (
                      <div className="creator-intro mb-4 text-light" style={{ fontSize: '0.85rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', opacity: 0.9 }}>
                        {profile.introduction}
                      </div>
                    )}

                    {profile.socialLinks && profile.socialLinks.length > 0 && (
                      <div className="d-flex flex-wrap gap-2">
                        {profile.socialLinks.map((link, idx) => (
                          <a 
                            key={idx} 
                            href={link.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-sm d-flex align-items-center gap-2"
                            style={{ background: 'rgba(0, 210, 255, 0.1)', color: '#00d2ff', borderRadius: '2rem', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(0, 210, 255, 0.2)' }}
                          >
                            <i className={`bi ${link.icon || 'bi-link-45deg'}`}></i> {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
