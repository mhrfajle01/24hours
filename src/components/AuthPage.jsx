import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase/firebase';

/**
 * Reusable password input with show/hide eye toggle.
 * Defined at MODULE LEVEL (outside AuthPage) so React never remounts
 * it on re-render — prevents keyboard dismissal on mobile.
 */
function PasswordInput({ id, value, onChange, placeholder, show, onToggle, required = true }) {
  return (
    <div className="input-group">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="form-control bg-light border-0 border-end-0 shadow-none"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete="current-password"
      />
      <button
        type="button"
        className="input-group-text bg-light border-0 shadow-none"
        onClick={onToggle}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{ cursor: 'pointer' }}
      >
        <i className={`bi ${show ? 'bi-eye-slash-fill' : 'bi-eye-fill'} text-secondary`} />
      </button>
    </div>
  );
}

/**
 * AuthPage — Sign In, Sign Up, and Password Reset screens.
 * Features: show/hide password toggle, custom inline alerts.
 */
export default function AuthPage() {
  const [view, setView] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  // Show/hide password toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const clearMessages = () => {
    setErrorMsg('');
    setInfoMsg('');
  };

  const switchView = (newView) => {
    setView(newView);
    clearMessages();
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const getFriendlyErrorMessage = (code) => {
    switch (code) {
      case 'auth/invalid-email':
        return 'Invalid email address format.';
      case 'auth/user-disabled':
        return 'This user account has been disabled.';
      case 'auth/user-not-found':
        return 'No account registered under this email.';
      case 'auth/wrong-password':
        return 'Incorrect password. Try again.';
      case 'auth/email-already-in-use':
        return 'This email address is already in use.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters long.';
      case 'auth/invalid-credential':
        return 'Incorrect email or password.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      default:
        return 'Authentication failed. Please verify your credentials.';
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setErrorMsg(getFriendlyErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    clearMessages();

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please try again.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName.trim()) {
        await updateProfile(userCredential.user, { displayName: displayName.trim() });
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(getFriendlyErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setInfoMsg('A password reset link has been sent! Check your inbox.');
      setEmail('');
    } catch (err) {
      console.error(err);
      setErrorMsg(getFriendlyErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center px-3 py-5"
      style={{ backgroundColor: '#ECE5DD' }}
    >
      <div
        className="card border-0 shadow-lg w-100 animate-slide-up overflow-hidden"
        style={{ maxWidth: '420px', borderRadius: '20px' }}
      >
        {/* Header Branding */}
        <div className="text-white text-center py-4 px-3" style={{ backgroundColor: '#075E54' }}>
          <div
            className="rounded-circle d-inline-flex align-items-center justify-content-center mb-2"
            style={{ width: '56px', height: '56px', backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <i className="bi bi-chat-quote-fill fs-3" style={{ color: '#25D366' }} />
          </div>
          <h2 className="fw-bold mb-1 h3">HourLog</h2>
          <p className="m-0 opacity-75 small text-uppercase fw-bold" style={{ letterSpacing: '1.5px' }}>
            Hourly Tracker
          </p>
        </div>

        {/* Card Body */}
        <div className="card-body p-4 bg-white">

          {/* Error Alert */}
          {errorMsg && (
            <div className="alert border-0 rounded-3 py-2 px-3 small d-flex align-items-center gap-2 mb-3 animate-fade-in"
              style={{ backgroundColor: '#fdecea', color: '#b71c1c' }}
            >
              <i className="bi bi-exclamation-circle-fill flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success / Info Alert */}
          {infoMsg && (
            <div className="alert border-0 rounded-3 py-2 px-3 small d-flex align-items-center gap-2 mb-3 animate-fade-in"
              style={{ backgroundColor: '#DCF8C6', color: '#075E54' }}
            >
              <i className="bi bi-check-circle-fill flex-shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* ── SIGN IN ── */}
          {view === 'signin' && (
            <form onSubmit={handleSignIn}>
              <h3 className="h5 fw-bold mb-3 text-dark border-bottom pb-2">Sign In</h3>

              <div className="mb-3">
                <label htmlFor="signin-email" className="form-label text-secondary small fw-bold">
                  Email Address
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-0">
                    <i className="bi bi-envelope-fill text-secondary" />
                  </span>
                  <input
                    id="signin-email"
                    type="email"
                    className="form-control bg-light border-0 shadow-none"
                    placeholder="example@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label htmlFor="signin-password" className="form-label text-secondary small fw-bold mb-0">
                    Password
                  </label>
                  <button
                    type="button"
                    className="btn btn-link text-decoration-none p-0 small fw-bold shadow-none"
                    style={{ color: '#25D366' }}
                    onClick={() => switchView('forgot')}
                  >
                    Forgot Password?
                  </button>
                </div>
                <PasswordInput
                  id="signin-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  show={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                />
              </div>

              <button
                type="submit"
                className="btn w-100 text-white fw-bold py-2 rounded-pill shadow-sm hover-scale"
                style={{ backgroundColor: '#075E54' }}
                disabled={loading}
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                ) : (
                  <i className="bi bi-box-arrow-in-right me-1" />
                )}
                Sign In
              </button>

              <div className="text-center mt-4">
                <span className="text-muted small">Don't have an account? </span>
                <button
                  type="button"
                  className="btn btn-link text-decoration-none p-0 small fw-bold shadow-none"
                  style={{ color: '#25D366' }}
                  onClick={() => switchView('signup')}
                >
                  Sign Up
                </button>
              </div>
            </form>
          )}

          {/* ── SIGN UP ── */}
          {view === 'signup' && (
            <form onSubmit={handleSignUp}>
              <h3 className="h5 fw-bold mb-3 text-dark border-bottom pb-2">Create Account</h3>

              <div className="mb-3">
                <label htmlFor="signup-name" className="form-label text-secondary small fw-bold">
                  Display Name
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-0">
                    <i className="bi bi-person-fill text-secondary" />
                  </span>
                  <input
                    id="signup-name"
                    type="text"
                    className="form-control bg-light border-0 shadow-none"
                    placeholder="Your full name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="signup-email" className="form-label text-secondary small fw-bold">
                  Email Address
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-0">
                    <i className="bi bi-envelope-fill text-secondary" />
                  </span>
                  <input
                    id="signup-email"
                    type="email"
                    className="form-control bg-light border-0 shadow-none"
                    placeholder="name@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="signup-password" className="form-label text-secondary small fw-bold">
                  Password
                </label>
                <PasswordInput
                  id="signup-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  show={showPassword}
                  onToggle={() => setShowPassword((s) => !s)}
                />
              </div>

              <div className="mb-4">
                <label htmlFor="signup-confirm" className="form-label text-secondary small fw-bold">
                  Confirm Password
                </label>
                <PasswordInput
                  id="signup-confirm"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  show={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((s) => !s)}
                />
                {/* Inline match indicator */}
                {confirmPassword.length > 0 && (
                  <div className={`small mt-1 ${password === confirmPassword ? 'text-success' : 'text-danger'}`}>
                    <i className={`bi ${password === confirmPassword ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-1`} />
                    {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn w-100 text-white fw-bold py-2 rounded-pill shadow-sm hover-scale"
                style={{ backgroundColor: '#25D366' }}
                disabled={loading}
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                ) : (
                  <i className="bi bi-person-plus-fill me-1" />
                )}
                Create Account
              </button>

              <div className="text-center mt-4">
                <span className="text-muted small">Already have an account? </span>
                <button
                  type="button"
                  className="btn btn-link text-decoration-none p-0 small fw-bold shadow-none"
                  style={{ color: '#075E54' }}
                  onClick={() => switchView('signin')}
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {view === 'forgot' && (
            <form onSubmit={handleForgotPassword}>
              <h3 className="h5 fw-bold mb-1 text-dark border-bottom pb-2">Reset Password</h3>
              <p className="text-secondary small mb-3">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <div className="mb-4">
                <label htmlFor="forgot-email" className="form-label text-secondary small fw-bold">
                  Email Address
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-0">
                    <i className="bi bi-envelope-fill text-secondary" />
                  </span>
                  <input
                    id="forgot-email"
                    type="email"
                    className="form-control bg-light border-0 shadow-none"
                    placeholder="name@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn w-100 text-white fw-bold py-2 rounded-pill shadow-sm hover-scale"
                style={{ backgroundColor: '#075E54' }}
                disabled={loading}
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                ) : (
                  <i className="bi bi-envelope-check-fill me-1" />
                )}
                Send Reset Link
              </button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  className="btn btn-link text-decoration-none p-0 small fw-bold shadow-none"
                  style={{ color: '#075E54' }}
                  onClick={() => switchView('signin')}
                >
                  <i className="bi bi-arrow-left me-1" />Back to Sign In
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
