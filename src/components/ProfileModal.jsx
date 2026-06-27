import React, { useState, useEffect } from 'react';

/**
 * ProfileModal — handles user profile editing, avatar display, and account logout.
 * Completely separated from SettingsModal.
 * Uses custom in-modal popup alerts instead of native window.alert/confirm.
 */
export default function ProfileModal({
  isOpen,
  onClose,
  currentUser,
  onUpdateProfile,
  onLogout,
}) {
  const [name, setName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Custom alert state
  const [alertBox, setAlertBox] = useState({ show: false, type: 'success', message: '' });

  // Confirm logout popup
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (currentUser && isOpen) {
      setName(currentUser.displayName || '');
      setPhotoURL(currentUser.photoURL || '');
      setAlertBox({ show: false, type: 'success', message: '' });
      setShowLogoutConfirm(false);
    }
  }, [currentUser, isOpen]);

  if (!isOpen) return null;

  const showAlert = (message, type = 'success') => {
    setAlertBox({ show: true, type, message });
    setTimeout(() => setAlertBox((a) => ({ ...a, show: false })), 4000);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showAlert('Name cannot be empty.', 'danger');
      return;
    }
    setSavingProfile(true);
    try {
      await onUpdateProfile({ displayName: name.trim(), photoURL: photoURL.trim() });
      showAlert('Profile updated successfully!', 'success');
    } catch (err) {
      console.error(err);
      showAlert('Failed to update profile: ' + err.message, 'danger');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogoutConfirmed = async () => {
    setShowLogoutConfirm(false);
    try {
      await onLogout();
    } catch (err) {
      showAlert('Failed to log out.', 'danger');
    }
  };

  const avatarInitial = (currentUser?.displayName || currentUser?.email || '?')
    .charAt(0)
    .toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop fade show animate-fade-in"
        style={{ zIndex: 1050 }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="modal fade show d-block animate-slide-up"
        style={{ zIndex: 1060 }}
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content border-0 rounded-4 shadow-lg overflow-hidden">

            {/* Header */}
            <div className="modal-header border-0 text-white pb-3" style={{ backgroundColor: '#075E54' }}>
              <h5 className="modal-title fw-bold d-flex align-items-center gap-2">
                <i className="bi bi-person-circle" />
                My Profile
              </h5>
              <button
                type="button"
                className="btn-close btn-close-white shadow-none"
                onClick={onClose}
                aria-label="Close"
              />
            </div>

            {/* Body */}
            <div className="modal-body p-4 bg-light overflow-y-auto" style={{ maxHeight: '78vh' }}>

              {/* Custom Alert */}
              {alertBox.show && (
                <div
                  className={`alert alert-${alertBox.type} border-0 rounded-3 py-2 px-3 small d-flex align-items-center gap-2 mb-3 animate-fade-in`}
                >
                  <i className={`bi ${alertBox.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'}`} />
                  <span>{alertBox.message}</span>
                </div>
              )}

              {/* Avatar + Info Card */}
              <div className="bg-white rounded-4 shadow-sm border p-3 mb-3">
                <div className="d-flex align-items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="rounded-circle overflow-hidden d-flex align-items-center justify-content-center border border-3 flex-shrink-0"
                    style={{
                      width: '68px',
                      height: '68px',
                      borderColor: '#25D366',
                      backgroundColor: '#075E54',
                    }}
                  >
                    {currentUser?.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Avatar"
                        className="w-100 h-100 object-fit-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-white fw-bold fs-3">{avatarInitial}</span>
                    )}
                  </div>

                  {/* User Info */}
                  <div className="flex-grow-1 overflow-hidden">
                    <div className="fw-bold text-dark text-truncate fs-6">
                      {currentUser?.displayName || 'New User'}
                    </div>
                    <div className="text-secondary small text-truncate">
                      <i className="bi bi-envelope-fill me-1" style={{ color: '#075E54' }} />
                      {currentUser?.email}
                    </div>
                    <span
                      className="badge rounded-pill mt-1"
                      style={{ backgroundColor: '#DCF8C6', color: '#075E54', fontSize: '0.7rem' }}
                    >
                      <i className="bi bi-shield-check-fill me-1" />
                      Authenticated
                    </span>
                  </div>
                </div>
              </div>

              {/* Edit Profile Form */}
              <div className="bg-white rounded-4 shadow-sm border p-3 mb-3">
                <h6 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
                  <i className="bi bi-pencil-square" style={{ color: '#075E54' }} />
                  Edit Profile
                </h6>

                <form onSubmit={handleSaveProfile}>
                  {/* Display Name */}
                  <div className="mb-3">
                    <label className="form-label text-secondary small fw-bold mb-1">
                      Display Name <span className="text-danger">*</span>
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-0">
                        <i className="bi bi-person-fill text-secondary" />
                      </span>
                      <input
                        type="text"
                        className="form-control bg-light border-0 shadow-none"
                        placeholder="Your display name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Avatar URL */}
                  <div className="mb-3">
                    <label className="form-label text-secondary small fw-bold mb-1">
                      Avatar Image URL
                    </label>
                    <div className="input-group">
                      <span className="input-group-text bg-light border-0">
                        <i className="bi bi-image-fill text-secondary" />
                      </span>
                      <input
                        type="url"
                        className="form-control bg-light border-0 shadow-none"
                        placeholder="https://example.com/photo.jpg"
                        value={photoURL}
                        onChange={(e) => setPhotoURL(e.target.value)}
                      />
                    </div>
                    {photoURL && (
                      <div className="mt-2 d-flex align-items-center gap-2">
                        <span className="text-secondary small">Preview:</span>
                        <img
                          src={photoURL}
                          alt="Preview"
                          className="rounded-circle border"
                          style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="btn text-white rounded-pill px-4 py-2 fw-bold shadow-sm hover-scale w-100"
                    style={{ backgroundColor: '#25D366', border: 'none' }}
                    disabled={savingProfile}
                  >
                    {savingProfile ? (
                      <span className="spinner-border spinner-border-sm me-2" role="status" />
                    ) : (
                      <i className="bi bi-check-circle-fill me-2" />
                    )}
                    Save Profile
                  </button>
                </form>
              </div>

              {/* Logout Section */}
              <div className="bg-white rounded-4 shadow-sm border p-3 mb-3 text-center">
                <p className="text-secondary small mb-3">
                  Signed in as <strong>{currentUser?.email}</strong>
                </p>
                {!showLogoutConfirm ? (
                  <button
                    type="button"
                    className="btn btn-outline-danger rounded-pill px-5 py-2 fw-bold shadow-none"
                    onClick={() => setShowLogoutConfirm(true)}
                  >
                    <i className="bi bi-box-arrow-left me-2" />
                    Log Out
                  </button>
                ) : (
                  <div className="border border-danger rounded-3 p-3 bg-danger bg-opacity-10 animate-fade-in">
                    <p className="text-danger fw-bold small mb-2">
                      <i className="bi bi-exclamation-triangle-fill me-1" />
                      Are you sure you want to log out?
                    </p>
                    <div className="d-flex justify-content-center gap-2">
                      <button
                        type="button"
                        className="btn btn-danger rounded-pill px-4 py-1 fw-bold small shadow-none"
                        onClick={handleLogoutConfirmed}
                      >
                        Yes, Log Out
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary rounded-pill px-4 py-1 fw-bold small shadow-none"
                        onClick={() => setShowLogoutConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="modal-footer border-0 bg-light pt-0 pb-3 px-4 d-flex justify-content-center">
              <button
                type="button"
                className="btn text-white rounded-pill px-5 py-2 fw-bold shadow-sm hover-scale"
                style={{ backgroundColor: '#075E54' }}
                onClick={onClose}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
