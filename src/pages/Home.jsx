import React, { useState, useEffect, useRef } from 'react';
import { useSound } from '../contexts/SoundContext';
import Header from '../components/Header';
import Summary from '../components/Summary';
import ConsistencyWidget from '../components/ConsistencyWidget';
import TodoDashboardWidget from '../components/TodoDashboardWidget';
import TodoAppModal from '../components/TodoAppModal';
import QuickAccessDashboardWidget from '../components/QuickAccessDashboardWidget';
import Timeline from '../components/Timeline';
import PlanningModal from '../components/PlanningModal';
import ReportModal from '../components/ReportModal';
import DeleteModal from '../components/DeleteModal';
import SettingsModal from '../components/SettingsModal';
import ProfileModal from '../components/ProfileModal';
import TrashModal from '../components/TrashModal';
import AuthPage from '../components/AuthPage';
import PendingReviewModal from '../components/PendingReviewModal';
import SecurityScanModal from '../components/SecurityScanModal';
import SecurityScanChoiceModal from '../components/SecurityScanChoiceModal';
import PrayerChecklist from '../components/PrayerChecklist';
import PointsModal from '../components/PointsModal';
import IslamicPage from './IslamicPage';
import JournalPage from './JournalPage';
import StreaksPage from './StreaksPage';
import FeatureHubPage from './FeatureHubPage';
import WalletPage from './WalletPage';
import AdminPage from './AdminPage';
import SurveyPage from './SurveyPage';
import NewUserTutorial from '../components/NewUserTutorial';
import GlobalSearch from '../components/GlobalSearch';
import PomodoroModal from '../components/PomodoroModal';
import InsightsModal from '../components/InsightsModal';
import MessageCenterModal from '../components/MessageCenterModal';
import AboutAdminsModal from '../components/AboutAdminsModal';
import CustomFeatureViewer from '../components/CustomFeatureViewer';
import { PointsCollectionAnimation, usePointsAnimation } from '../components/PointsAnimator';
import { useFirestore } from '../hooks/useFirestore';
import { useAppUsage } from '../hooks/useAppUsage';
import { useMessages } from '../hooks/useMessages';
import { useAdminProfiles } from '../hooks/useAdminProfiles';
import { getTodayDateString, getCurrentHourAndAMPM, getIntervalTimes, formatTime12h, timeToMinutes, isFeatureActive } from '../utils/helpers';
import { runFullUIScan, startPeriodicScan } from '../utils/scanService';
import defaultDictionary from '../constants/dictionary.json';
import { db, auth } from '../firebase/firebase';
import {
  writeBatch,
  updateDoc,
  addDoc,
  doc,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs,
  getDoc,
  onSnapshot,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';

const PRIMARY_ADMIN_EMAIL = 'mhrfazle@gmail.com';

/**
 * Home — main dashboard. Coordinates auth, modals, CRUD, undo/redo, and trash.
 *
 * Undo/Redo action types:
 *   ADD          { docId, data }
 *   UPDATE_PLAN  { docId, previousData, newData }
 *   UPDATE_REPORT{ docId, previousData, newData }
 *   DELETE       { trashId, originalData, currentDocId? }
 *   GENERATE     { docIds, date }
 *   CLEAR        { trashIds, date, restoredDocIds? }
 */
export default function Home() {
  const { playSound } = useSound();
  // ── Auth ────────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadAdminRole = async () => {
      if (!auth.currentUser) {
        setIsAdmin(false);
        return;
      }
      if (auth.currentUser.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
        setIsAdmin(true);
        return;
      }
      const configuredAdmin = import.meta.env.VITE_ADMIN_UID;
      if (configuredAdmin && auth.currentUser.uid === configuredAdmin) {
        setIsAdmin(true);
        return;
      }
      try {
        const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (!cancelled) setIsAdmin(userSnap.exists() && userSnap.data().role === 'admin');
      } catch (error) {
        console.error('Unable to verify administrator role:', error);
        if (!cancelled) setIsAdmin(false);
      }
    };
    loadAdminRole();
    return () => { cancelled = true; };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;
    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, async (snapshot) => {
      if (snapshot.exists() && snapshot.data().accountStatus === 'suspended') {
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error('Unable to sign out suspended account:', signOutError);
        }
      }
    }, (error) => {
      console.error('Unable to monitor account status:', error);
    });
    return () => unsubscribe();
  }, [currentUser?.uid]);

  // ── Date / time ─────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [currentHourData, setCurrentHourData] = useState(getCurrentHourAndAMPM());
  const [currentTime, setCurrentTime] = useState(new Date());

  // ── Firestore hook ───────────────────────────────────────────────────────
  const {
    reports,
    loading: firestoreLoading,
    error,
    trashItems,
    trashLoading,
    addReport,
    updateReport,
    moveToTrash,
    hardDeleteReport,
    restoreFromTrash,
    permanentDeleteFromTrash,
    emptyTrash,
    restoreAllFromTrash,
    generateDayReports,
    clearDayReports,
    userDictionary,
    dictionaryLoading,
    updateDictionary,
    streakData,
    streakRequirements,
    weeklyStats,
    dailyGoal,
    updateDailyGoal,
    heatmapData,
    recentPlans,
    excuseDay,
    addStreakFreeze,
    pointsData,
    updatePoints,
    reconcileBlockPoints,
    claimDailyCheckIn,
    redeemPerk,
    unlockFeature,
  } = useFirestore(selectedDate, currentUser?.uid);

  const { lastDelta, floatKey, lastSourceId } = usePointsAnimation(pointsData);

  const { messages, loading: messagesLoading, sendMessage, markAsRead, deleteMessage, editMessage, togglePin, bulkMarkAsRead, bulkDelete } = useMessages(currentUser?.uid, isAdmin, currentUser);
  const unreadMessagesCount = messages ? messages.filter(m => !m.readBy?.includes(currentUser?.uid)).length : 0;
  const [isMessageCenterOpen, setIsMessageCenterOpen] = useState(false);

  const { adminProfiles, loading: adminProfilesLoading, updateMyAdminProfile } = useAdminProfiles(isAdmin, currentUser?.uid);
  const [isAboutAdminsOpen, setIsAboutAdminsOpen] = useState(false);

  const finalDictionary = userDictionary && userDictionary.length > 0 ? userDictionary : defaultDictionary;
  const appUsage = useAppUsage(currentUser?.uid);
  const dashboardStreakRequirements = {
    ...streakRequirements,
    appUsageSeconds: appUsage.activeSeconds,
    appUsageMet: appUsage.activeSeconds >= 180,
    qualified: appUsage.activeSeconds >= 180
      && streakRequirements.journalMet
      && streakRequirements.planningMet,
  };

  // ── Modal state ──────────────────────────────────────────────────────────
  // 'planning' | 'report' | 'delete' | 'settings' | 'profile' | 'trash' | 'points' | null
  const [activeModal, setActiveModal] = useState(null);
  const [settingsSection, setSettingsSection] = useState('general');
  const [selectedReport, setSelectedReport] = useState(null);

  // ── Pomodoro Timer State ────────────────────────────────────────────────
  const [isPomodoroOpen, setIsPomodoroOpen] = useState(false);
  const [pomodoroReport, setPomodoroReport] = useState(null);
  const [isTodoOpen, setIsTodoOpen] = useState(false);

  // ── Insights Modal State ────────────────────────────────────────────────
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // ── Journal Page State ──────────────────────────────────────────────────
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [journalInitialDate, setJournalInitialDate] = useState(null);

  // ── Streaks Page State ─────────────────────────────────────────────────
  const [isStreaksOpen, setIsStreaksOpen] = useState(false);
  const [openHabitScannerOnStreaks, setOpenHabitScannerOnStreaks] = useState(false);
  const [isFeatureHubOpen, setIsFeatureHubOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [walletInitialDist, setWalletInitialDist] = useState(null);
  const [activeCustomFeature, setActiveCustomFeature] = useState(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(() => {
    try {
      return localStorage.getItem('24hours-tutorial-complete') ? -1 : 0;
    } catch {
      return 0;
    }
  });
  const tutorialBaselineRef = useRef(null);

  const navigateTo = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname.replace(/\/+$/, '') || '/';
      setIsJournalOpen(path === '/journal');
      setIsStreaksOpen(path === '/streaks');
      setIsWalletOpen(path === '/wallet');
      if (path !== '/wallet') setWalletInitialDist(null);
      setIsFeatureHubOpen(path === '/productivity-hub');
      setIsAdminOpen(path === '/admin');
      if (path === '/islamic') setTheme('islamic');
      if (path === '/settings') setActiveModal('settings');
      else if (activeModal === 'settings') setActiveModal(null);
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [activeModal]);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Refs so keyboard handler always sees latest handlers without re-registering
  const undoFnRef = useRef(null);
  const redoFnRef = useRef(null);
  const historyActionInFlightRef = useRef(false);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState({ show: false, message: '', type: 'success', id: 0 });
  const toastTimerRef = useRef(null);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // ── Pending Review States ────────────────────────────────────────────────
  const [pastPendingReports, setPastPendingReports] = useState([]);
  const [showPendingToast, setShowPendingToast] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [awayDuration, setAwayDuration] = useState(null); // { minutes, label, lastSeenTime }

  // ── Security Scan States ────────────────────────────────────────────────
  const [securityInvalidBlocks, setSecurityInvalidBlocks] = useState([]);
  const [securityScanChoiceOpen, setSecurityScanChoiceOpen] = useState(false);

  // ── Tag Filter State ─────────────────────────────────────────────────────
  const [selectedTag, setSelectedTag] = useState(null);

  // ── Theme State ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(localStorage.getItem('app-theme') || 'light');

  // ── Scroll-to-Top State ──────────────────────────────────────────────────
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // If islamic theme is set in localStorage but not unlocked, fallback to light theme
    if (theme === 'islamic' && pointsData && !isFeatureActive(pointsData, 'islamic_theme')) {
      setTheme('light');
      localStorage.setItem('app-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('app-theme', theme);
    }
  }, [theme, pointsData]);

  useEffect(() => {
    setSelectedTag(null);
  }, [selectedDate]);

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    // Start periodic 5 min scan using the utility helper
    const handleScanResult = (report) => {
      if (report && report.invalidCount > 0) {
        setSecurityInvalidBlocks(report.invalid);
      } else {
        setSecurityInvalidBlocks([]);
      }
    };

    const stopScan = startPeriodicScan(handleScanResult);

    // Setup manual trigger callable globally / from settings modal
    window.triggerManualSecurityScan = () => {
      setSecurityScanChoiceOpen(true);
    };

    return () => {
      stopScan();
      delete window.triggerManualSecurityScan;
    };
  }, []);

  const runHourlySecurityScan = () => {
    const report = runFullUIScan();
    if (report && report.invalidCount > 0) {
      setSecurityInvalidBlocks(report.invalid);
    } else {
      setSecurityInvalidBlocks([]);
      showToast('Hourly block scan complete: No issues found!', 'success');
    }
    setSecurityScanChoiceOpen(false);
  };

  const runBothSecurityScans = () => {
    runHourlySecurityScan();
    setOpenHabitScannerOnStreaks(true);
    setIsStreaksOpen(true);
    navigateTo('/streaks');
  };

  const openStreaksPage = (scan = false) => {
    setOpenHabitScannerOnStreaks(scan || localStorage.getItem('auto-streak-security-scan') === 'true');
    setIsStreaksOpen(true);
    navigateTo('/streaks');
  };

  const handleResolveSecurityBlocks = async (resolutions) => {
    try {
      const batch = writeBatch(db);
      for (const id of Object.keys(resolutions)) {
        const docRef = doc(db, 'reports', id);
        // Tag closing by updating data-timing-closed attribute logic (or report update)
        batch.update(docRef, {
          report: resolutions[id].report,
          status: resolutions[id].status, // dynamic status selection (Completed or Missed)
          tag: resolutions[id].tag // marking with the selected tag category
        });

        const reportObj = reports.find(r => r.id === id);
        if (reportObj) {
          await processReportPointsChange(
            reportObj.status,
            reportObj.report,
            resolutions[id].status,
            resolutions[id].report,
            { ...reportObj, status: resolutions[id].status, report: resolutions[id].report, tag: resolutions[id].tag },
            false
          );
        }
      }
      await batch.commit();
      playSound('points');
      showToast('Timing blocks successfully closed and saved.', 'success');
      setSecurityInvalidBlocks([]);
    } catch (err) {
      console.error(err);
      showToast('Failed to resolve timing blocks.', 'danger');
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          lastSeenAt: serverTimestamp(),
        }, { merge: true }).catch((error) => {
          console.error('Failed to sync user profile:', error);
        });
        
        // Force navigate to Home page upon login
        if (window.location.pathname !== '/') {
          window.history.replaceState({}, '', '/');
        }
        setIsAdminOpen(false);
        setIsFeatureHubOpen(false);
        setIsJournalOpen(false);
        setIsStreaksOpen(false);
        setIsWalletOpen(false);
        setIsInsightsOpen(false);
        setActiveModal(null);
      }
      setCurrentUser(
        user
          ? { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL }
          : null
      );
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(new Date());
      setCurrentHourData(getCurrentHourAndAMPM());
    }, 1000); // Central clock ticks every 1s
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      showToast('Back online! Syncing changes with the server...', 'success');
    };
    const handleOffline = () => {
      showToast('Working offline. Changes will save locally and sync later.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Scan for past pending reports — polls every 60s so newly-ended blocks are detected live
  useEffect(() => {
    const STORAGE_KEY_LAST_SEEN   = 'hourlog_last_seen';
    const STORAGE_KEY_REVIEW_DATE = 'hourlog_last_review_date';

    const checkPendingBlocks = () => {
      if (firestoreLoading || !reports.length) return;

      const today = getTodayDateString();
      const isToday = selectedDate === today;
      const isPastDay = selectedDate < today;

      if (!isToday && !isPastDay) {
        setPastPendingReports([]);
        setShowPendingToast(false);
        return;
      }

      const now = new Date();
      const nowMs = now.getTime();
      const nowMin = now.getHours() * 60 + now.getMinutes();

      const lastSeenMs     = parseInt(localStorage.getItem(STORAGE_KEY_LAST_SEEN) || '0', 10);
      const lastReviewDate = localStorage.getItem(STORAGE_KEY_REVIEW_DATE) || '';
      const isNewDay       = lastReviewDate !== today;
      const gapMs          = lastSeenMs ? nowMs - lastSeenMs : Infinity;
      const gapMinutes     = Math.floor(gapMs / 60000);

      // Always update last-seen timestamp only if today
      if (isToday) {
        localStorage.setItem(STORAGE_KEY_LAST_SEEN, String(nowMs));
        localStorage.setItem(STORAGE_KEY_REVIEW_DATE, today);
      }

      // Build human-readable away duration
      let durationLabel = '';
      if (isToday && lastSeenMs && gapMinutes < Infinity) {
        if (gapMinutes < 60) {
          durationLabel = `${gapMinutes} minute${gapMinutes !== 1 ? 's' : ''}`;
        } else {
          const hrs = Math.floor(gapMinutes / 60);
          const mins = gapMinutes % 60;
          durationLabel = mins > 0 ? `${hrs}h ${mins}m` : `${hrs} hour${hrs !== 1 ? 's' : ''}`;
        }
      }

      const lastSeenTime = (isToday && lastSeenMs)
        ? new Date(lastSeenMs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : null;

      // Find all pending blocks whose end time has already passed
      const foundPastPending = reports.filter((r) => {
        if (r.status !== 'Pending') return false;
        if (isPastDay) return true; // all pending blocks on a past day are in the past
        
        const times = getIntervalTimes(r);
        const endMin = timeToMinutes(times.endTime);
        const startMin = timeToMinutes(times.startTime);
        let adjustedEndMin = endMin;
        if (endMin < startMin) adjustedEndMin += 24 * 60;
        return adjustedEndMin <= nowMin;
      });

      if (foundPastPending.length > 0) {
        setPastPendingReports(foundPastPending);
        if (isToday) {
          setAwayDuration({ minutes: gapMinutes, label: durationLabel, lastSeenTime });

          // If modal is already open, just refresh data silently
          setIsReviewModalOpen((prev) => {
            if (prev) return prev; // already open — don't flicker
            // Show modal directly — no gap-based suppression
            setShowPendingToast(true);
            return false;
          });
        } else {
          setAwayDuration(null);
          setShowPendingToast(false);
        }
      } else {
        // All pending blocks resolved — hide toast
        setPastPendingReports([]);
        setShowPendingToast(false);
      }
    };

    // Run immediately on mount / when reports change
    checkPendingBlocks();

    // Then keep polling every 60 seconds so newly-ended blocks are caught live
    const intervalId = setInterval(checkPendingBlocks, 60_000);
    return () => clearInterval(intervalId);
  }, [reports, firestoreLoading, selectedDate]);

  // Single keyboard listener; calls via refs to avoid stale closures
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName?.toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoFnRef.current?.(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redoFnRef.current?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const showToast = (message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const id = Date.now();
    setToast({ show: true, message, type, id });
    toastTimerRef.current = setTimeout(() => {
      setToast((previous) => previous.id === id ? { ...previous, show: false } : previous);
      toastTimerRef.current = null;
    }, 3000);
  };

  const pushUndo = (action) => {
    setUndoStack((prev) => [...prev.slice(-19), action]);
    setRedoStack([]); // new action clears redo history
  };

  // ── Undo ─────────────────────────────────────────────────────────────────

  const handleUndo = async () => {
    if (!undoStack.length || historyActionInFlightRef.current) return;
    historyActionInFlightRef.current = true;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    try {
      let redoAction = { ...action };

      switch (action.type) {
        case 'ADD': {
          // Undo add → hard-delete the just-created doc
          await hardDeleteReport(action.docId);
          break;
        }
        case 'UPDATE_PLAN':
        case 'UPDATE_REPORT': {
          await updateReport(action.docId, action.previousData);
          if (action.type === 'UPDATE_REPORT' && action.previousData.status) {
            const reportObj = reports.find((report) => report.id === action.docId);
            if (reportObj) await reconcileBlockPoints({ ...reportObj, ...action.previousData }, action.previousData.status);
          } else if (action.type === 'UPDATE_PLAN') {
            const reportObj = reports.find((report) => report.id === action.docId);
            if (reportObj?.status) await reconcileBlockPoints({ ...reportObj, ...action.previousData }, reportObj.status);
          }
          break;
        }
        case 'DELETE': {
          // Undo delete → restore from trash; keep new docId for redo
          const newDocId = await restoreFromTrash(action.trashId);
          if (action.originalData?.status) {
            await reconcileBlockPoints(action.originalData, action.originalData.status);
          }
          redoAction = { ...action, currentDocId: newDocId };
          break;
        }
        case 'GENERATE': {
          // Undo generate → hard-delete all generated docs
          if (action.docIds?.length) {
            const batch = writeBatch(db);
            action.docIds.forEach((id) => batch.delete(doc(db, 'reports', id)));
            await batch.commit();
          }
          break;
        }
        case 'CLEAR': {
          // Undo clear → restore all from trash; keep new docIds for redo
          const newDocIds = await restoreAllFromTrash(action.trashIds);
          for (const pointState of action.pointStates || []) {
            if (pointState.status) await reconcileBlockPoints(pointState, pointState.status);
          }
          redoAction = { ...action, restoredDocIds: newDocIds };
          break;
        }
        default:
          break;
      }

      setRedoStack((prev) => [...prev.slice(-19), redoAction]);
      showToast('Undone ↩', 'info');
    } catch (err) {
      console.error('Undo failed:', err);
      showToast('Could not undo. Item may no longer exist.', 'danger');
    } finally {
      historyActionInFlightRef.current = false;
    }
  };

  // ── Redo ─────────────────────────────────────────────────────────────────

  const handleRedo = async () => {
    if (!redoStack.length || historyActionInFlightRef.current) return;
    historyActionInFlightRef.current = true;
    const action = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));

    try {
      let undoAction = { ...action };

      switch (action.type) {
        case 'ADD': {
          // Redo add → re-add with same data
          const newId = await addReport(action.data);
          undoAction = { ...action, docId: newId };
          break;
        }
        case 'UPDATE_PLAN':
        case 'UPDATE_REPORT': {
          await updateReport(action.docId, action.newData);
          if (action.type === 'UPDATE_REPORT' && action.newData.status) {
            const reportObj = reports.find((report) => report.id === action.docId);
            if (reportObj) await reconcileBlockPoints({ ...reportObj, ...action.newData }, action.newData.status);
          } else if (action.type === 'UPDATE_PLAN') {
            const reportObj = reports.find((report) => report.id === action.docId);
            if (reportObj?.status) await reconcileBlockPoints({ ...reportObj, ...action.newData }, reportObj.status);
          }
          break;
        }
        case 'DELETE': {
          // Redo delete → move restored doc back to trash
          const targetId = action.currentDocId || action.originalData.id;
          const result = await moveToTrash(targetId);
          if (action.originalData?.status) {
            await reconcileBlockPoints(action.originalData, 'Pending');
          }
          undoAction = { ...action, trashId: result.trashId };
          break;
        }
        case 'GENERATE': {
          // Redo generate → regenerate for the same date
          const newIds = await generateDayReports(action.date);
          undoAction = { ...action, docIds: newIds };
          break;
        }
        case 'CLEAR': {
          // Redo clear → move restored docs back to trash
          if (action.restoredDocIds?.length) {
            const batch = writeBatch(db);
            const trashCol = collection(db, 'trash');
            const newTrashIds = [];

            for (const id of action.restoredDocIds) {
              const snap = await getDoc(doc(db, 'reports', id));
              if (!snap.exists()) continue;
              const trashRef = doc(trashCol);
              batch.set(trashRef, {
                ...snap.data(),
                originalId: id,
                deletedAt: serverTimestamp(),
              });
              batch.delete(doc(db, 'reports', id));
              newTrashIds.push(trashRef.id);
            }

            await batch.commit();
            for (const pointState of action.pointStates || []) {
              if (pointState.status) await reconcileBlockPoints(pointState, 'Pending');
            }
            undoAction = { ...action, trashIds: newTrashIds };
          }
          break;
        }
        default:
          break;
      }

      setUndoStack((prev) => [...prev.slice(-19), undoAction]);
      showToast('Redone ↪', 'info');
    } catch (err) {
      console.error('Redo failed:', err);
      showToast('Could not redo. State may have changed.', 'danger');
    } finally {
      historyActionInFlightRef.current = false;
    }
  };

  // ── Workflow Validation ───────────────────────────────────────────────────
  const getHasPastPendingBefore = (targetReport) => {
    if (selectedDate !== getTodayDateString()) return false;
    let targetMin = Infinity;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    if (targetReport) {
      const times = getIntervalTimes(targetReport);
      targetMin = timeToMinutes(times.startTime);
    } else {
      targetMin = currentMin;
    }

    return reports.some((r) => {
      if (r.status !== 'Pending') return false;
      if (targetReport && r.id === targetReport.id) return false;
      const times = getIntervalTimes(r);
      const startMin = timeToMinutes(times.startTime);
      const endMin = timeToMinutes(times.endTime);
      let adjustedEndMin = endMin;
      if (endMin < startMin) adjustedEndMin += 24 * 60;
      return adjustedEndMin <= targetMin && adjustedEndMin <= currentMin;
    });
  };

  const checkWorkflowValidation = (targetReport) => {
    if (getHasPastPendingBefore(targetReport)) {
      showToast('Please resolve previous pending blocks first / পূর্ববর্তী পেন্ডিং স্লটগুলো প্রথমে সমাধান করুন।', 'danger');
      setIsReviewModalOpen(true);
      return false;
    }
    return true;
  };

  // Keep refs in sync with latest handler instances
  undoFnRef.current = handleUndo;
  redoFnRef.current = handleRedo;

  // ── Modal handlers ────────────────────────────────────────────────────────

  const handleOpenAddPlan    = () => {
    if (!checkWorkflowValidation(null)) return;
    setSelectedReport(null);
    setActiveModal('planning');
  };
  const handleOpenEditPlan   = (r) => { if (!checkWorkflowValidation(r)) return; setSelectedReport(r);   setActiveModal('planning'); };
  const handleOpenEditReport = (r) => { if (!checkWorkflowValidation(r)) return; setSelectedReport(r);   setActiveModal('report');   };
  const handleOpenDelete     = (r) => { if (!checkWorkflowValidation(r)) return; setSelectedReport(r);   setActiveModal('delete');   };
  const handleOpenSettings   = (section = 'general') => {
    if (tutorialStep === 9) setTutorialStep(10);
    setSettingsSection(section);
    navigateTo('/settings');
    setActiveModal('settings');
  };
  const handleOpenProfile    = () => setActiveModal('profile');
  const handleOpenTrash      = () => setActiveModal('trash');
  const handleOpenPoints     = () => {
    if (tutorialStep === 3) setTutorialStep(4);
    setActiveModal('points');
  };
  const handleOpenFeatureHub = () => {
    if (tutorialStep === 4) setTutorialStep(5);
    navigateTo('/productivity-hub');
    setIsFeatureHubOpen(true);
  };
  const handleOpenAdmin = () => {
    if (!isAdmin) return;
    navigateTo('/admin');
    setIsAdminOpen(true);
  };
  const handleUpdateAdminUserRole = async (user, role) => {
    if (!isAdmin || !user?.id) return;
    try {
      await updateDoc(doc(db, 'users', user.id), {
        role,
        roleUpdatedAt: serverTimestamp(),
        roleUpdatedBy: currentUser.uid,
      });
      await addDoc(collection(db, 'adminAudit'), {
        action: 'role_changed',
        targetUserId: user.id,
        targetEmail: user.email || '',
        role,
        adminUid: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      showToast(`Role updated to ${role}.`, 'success');
    } catch (error) {
      console.error('Admin role update failed:', error);
      showToast('Role update failed. Check Firebase admin rules.', 'danger');
    }
  };
  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme);
    if (nextTheme === 'islamic') navigateTo('/islamic');
    else if (window.location.pathname === '/islamic') navigateTo('/');
  };
  const handleSearchSelect = (result) => {
    setIsSearchOpen(false);
    if (result.type === 'report') {
      setSelectedReport(result.report);
      setActiveModal('report');
    } else if (result.type === 'journal') {
      setJournalInitialDate(null);
      setIsJournalOpen(true);
      navigateTo('/journal');
    } else if (result.type === 'streaks') {
      openStreaksPage();
    } else if (result.type === 'rewards') {
      setActiveModal('points');
    } else if (result.type === 'settings') {
      handleOpenSettings();
    } else if (result.type === 'settings-admin') {
      handleOpenAdmin();
    } else if (result.type.startsWith('settings-')) {
      handleOpenSettings(result.type.replace('settings-', ''));
    } else if (result.type === 'security-scan') {
      window.triggerManualSecurityScan?.();
    } else if (result.type === 'pending-review') {
      setIsReviewModalOpen(true);
    } else if (result.type === 'insights') {
      setIsInsightsOpen(true);
    } else if (result.type === 'pomodoro') {
      showToast('Open an hourly block to start the Pomodoro timer.', 'info');
    } else if (result.type === 'islamic') {
      handleThemeChange('islamic');
    } else if (result.type === 'feature-hub') {
      handleOpenFeatureHub();
    } else if (result.type === 'messages') {
      setIsMessageCenterOpen(true);
    } else if (result.type === 'about-admins') {
      setIsAboutAdminsOpen(true);
    } else if (result.type === 'profile') {
      setActiveModal('profile');
    } else if (result.type === 'trash') {
      setActiveModal('trash');
    } else if (result.type === 'wallet') {
      setIsWalletOpen(true);
      navigateTo('/wallet');
    } else if (result.type === 'custom-feature') {
      setActiveCustomFeature(result.feature);
    } else if (result.type === 'dashboard') {
      navigateTo('/');
    }
  };
  const handleReplayTutorial = () => {
    localStorage.removeItem('24hours-tutorial-complete');
    setTutorialStep(0);
    handleCloseModal();
  };

  const startTutorial = () => {
    tutorialBaselineRef.current = {
      reportCount: reports.length,
      completedCount: reports.filter((report) => report.status === 'Completed').length,
      points: pointsData?.points || 0,
    };
    setTutorialStep(1);
  };

  const exitTutorial = () => {
    localStorage.setItem('24hours-tutorial-complete', 'skipped');
    setTutorialStep(-1);
  };

  const skipTutorialStep = (stepIndex) => {
    try {
      const skipped = JSON.parse(localStorage.getItem('24hours-tutorial-skipped-steps') || '[]');
      if (!skipped.includes(stepIndex)) {
        localStorage.setItem('24hours-tutorial-skipped-steps', JSON.stringify([...skipped, stepIndex]));
      }
    } catch {
      // Continue even if browser storage is unavailable.
    }
    setTutorialStep((currentStep) => Math.min(currentStep + 1, 10));
  };

  const finishTutorial = () => {
    localStorage.setItem('24hours-tutorial-complete', 'completed');
    setTutorialStep(-1);
  };

  const handleTutorialAction = (action) => {
    if (action === 'plan') {
      handleOpenAddPlan();
    } else if (action === 'points') {
      setActiveModal('points');
      setTutorialStep(4);
    } else if (action === 'hub') {
      setIsFeatureHubOpen(true);
      setTutorialStep(5);
    } else if (action === 'journal') {
      setTutorialStep(6);
      setIsFeatureHubOpen(true);
      setIsJournalOpen(true);
      navigateTo('/journal');
    } else if (action === 'streaks') {
      setTutorialStep(7);
      setIsFeatureHubOpen(true);
      openStreaksPage();
    } else if (action === 'streaks-relapse') {
      setTutorialStep(8);
    } else if (action === 'rewards') {
      setActiveModal('points');
      setTutorialStep(9);
    } else if (action === 'settings') {
      setActiveModal('settings');
      setTutorialStep(10);
    }
  };

  useEffect(() => {
    if (tutorialStep < 1 || !tutorialBaselineRef.current) return;
    const baseline = tutorialBaselineRef.current;
    if (tutorialStep === 1 && reports.length > baseline.reportCount) setTutorialStep(2);
    if (tutorialStep === 2 && reports.filter((report) => report.status === 'Completed').length > baseline.completedCount) {
      setTutorialStep(3);
    }
    if (tutorialStep === 3 && (pointsData?.points || 0) > baseline.points) setTutorialStep(4);
  }, [reports, pointsData?.points, tutorialStep]);

  const handleCloseModal = () => {
    setActiveModal(null);
    setSelectedReport(null);
    if (window.location.pathname === '/settings') navigateTo('/');
  };

  // ── Auth operations ───────────────────────────────────────────────────────

  const handleLogout = async () => {
    try {
      await signOut(auth);
      handleCloseModal();
      setUndoStack([]);
      setRedoStack([]);
      showToast('Logged out successfully.', 'info');
    } catch (err) {
      console.error(err);
      showToast('Failed to log out.', 'danger');
    }
  };

  const handleUpdateProfile = async ({ displayName, photoURL }) => {
    try {
      if (!auth.currentUser) return;
      await updateProfile(auth.currentUser, { displayName, photoURL });
      await auth.currentUser.reload();
      const u = auth.currentUser;
      setCurrentUser({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        photoURL: u.photoURL,
      });
      showToast('Profile updated successfully.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to update profile.', 'danger');
      throw err;
    }
  };

  // ── CRUD with undo tracking ───────────────────────────────────────────────

  const handleSavePlan = async (planData) => {
    try {
      // ── Overlap Detection ──────────────────────────────────────────────
      const newStart = timeToMinutes(planData.startTime);
      let newEnd = timeToMinutes(planData.endTime);
      if (newEnd <= newStart) newEnd += 24 * 60; // overnight wrap

      const overlapping = reports.find((r) => {
        // Skip self when editing
        if (selectedReport && r.id === selectedReport.id) return false;

        const times = getIntervalTimes(r);
        let existStart = timeToMinutes(times.startTime);
        let existEnd = timeToMinutes(times.endTime);
        if (existEnd <= existStart) existEnd += 24 * 60; // overnight wrap

        // Two ranges overlap if one starts before the other ends and vice versa
        return newStart < existEnd && newEnd > existStart;
      });

      if (overlapping) {
        const oTimes = getIntervalTimes(overlapping);
        showToast(
          `Time overlaps with existing slot: ${formatTime12h(oTimes.startTime)} - ${formatTime12h(oTimes.endTime)}. Please choose a different time range.`,
          'danger'
        );
        return;
      }
      // ──────────────────────────────────────────────────────────────────

      const startHour24 = parseInt(planData.startTime.split(':')[0], 10);
      const displayHour = startHour24 % 12 || 12;
      const ampm = startHour24 >= 12 ? 'PM' : 'AM';

      if (selectedReport) {
        // Edit
        const oldTimes = getIntervalTimes(selectedReport);
        const previousData = { 
          plan: selectedReport.plan,
          startTime: oldTimes.startTime,
          endTime: oldTimes.endTime,
          hour: selectedReport.hour || parseInt(oldTimes.startTime.split(':')[0], 10) % 12 || 12,
          ampm: selectedReport.ampm || (parseInt(oldTimes.startTime.split(':')[0], 10) >= 12 ? 'PM' : 'AM')
        };
        const newData = { 
          plan: planData.plan,
          startTime: planData.startTime,
          endTime: planData.endTime,
          hour: displayHour,
          ampm: ampm
        };
        await updateReport(selectedReport.id, newData);
        if (selectedReport.status) {
          await reconcileBlockPoints({ ...selectedReport, ...newData }, selectedReport.status);
        }
        pushUndo({ type: 'UPDATE_PLAN', docId: selectedReport.id, previousData, newData });
        showToast('Updated Successfully', 'success');
      } else {
        // Create
        const data = {
          date: selectedDate,
          startTime: planData.startTime,
          endTime: planData.endTime,
          hour: displayHour,
          ampm: ampm,
          plan: planData.plan,
          report: '',
          status: 'Pending',
        };
        const docId = await addReport(data);
        pushUndo({ type: 'ADD', docId, data });
        showToast('Saved Successfully', 'success');
      }
      handleCloseModal();
    } catch (err) {
      console.error(err);
      showToast(`Failed to save plan: ${err.message || err}`, 'danger');
    }
  };

  const processReportPointsChange = async (oldStatus, oldReport, newStatus, newReport, reportObj, playFeedback = true) => {
    if (oldStatus !== newStatus) {
      if (playFeedback && newStatus === 'Completed') playSound('points');
      if (playFeedback && newStatus === 'Missed') playSound('missed');
      await reconcileBlockPoints(reportObj, newStatus);
    }
  };

  const handleSaveReport = async (reportData) => {
    try {
      if (!selectedReport) return;
      const previousData = { report: selectedReport.report, status: selectedReport.status, tag: selectedReport.tag || '' };
      const newData = { report: reportData.report, status: reportData.status, tag: reportData.tag || '' };
      await updateReport(selectedReport.id, newData);
      pushUndo({ type: 'UPDATE_REPORT', docId: selectedReport.id, previousData, newData });
      playSound('success');
      showToast(newData.status === 'Completed' ? 'Block completed · points updating' : 'Report saved', 'success');
      handleCloseModal();
      
      const fullReportObj = { ...selectedReport, ...newData };
      await processReportPointsChange(selectedReport.status, selectedReport.report, reportData.status, reportData.report, fullReportObj);

      // Check if all 24 slots completed for 50 pts bonus
      const isCompletedBlock = (r) => {
        if (r.id === selectedReport.id) {
          return reportData.status ? (reportData.status === 'Completed') : Boolean(reportData.report);
        }
        return r.status ? (r.status === 'Completed') : Boolean(r.report);
      };
      if (reports.length >= 24 && reports.every(isCompletedBlock)) {
        await updatePoints(50, `24-Hour Master Completion Bonus (${selectedDate})`, 'earn', {}, `master-completion:${selectedDate}`);
      }

    } catch (err) {
      console.error(err);
      showToast('Something went wrong.', 'danger');
    }
  };

  const handleSavePendingReview = async (updates) => {
    try {
      const batch = writeBatch(db);
      for (const update of updates) {
        const { id, status } = update;
        const docRef = doc(db, 'reports', id);
        batch.update(docRef, { status });

        const reportObj = reports.find(r => r.id === id);
        if (reportObj) {
          await processReportPointsChange(reportObj.status, reportObj.report, status, reportObj.report, { ...reportObj, status }, false);
        }
      }
      await batch.commit();

      playSound('points');
      showToast('All blocks updated successfully', 'success');
      setPastPendingReports([]);
    } catch (err) {
      console.error(err);
      showToast('Failed to update blocks.', 'danger');
    }
  };

  const handleInlineUpdatePlan = async (reportItem, newPlan) => {
    if (!checkWorkflowValidation(reportItem)) return;
    try {
      const previousData = { plan: reportItem.plan };
      const newData = { plan: newPlan };
      await updateReport(reportItem.id, newData);
      if (reportItem.status) {
        await reconcileBlockPoints({ ...reportItem, ...newData }, reportItem.status);
      }
      pushUndo({ type: 'UPDATE_PLAN', docId: reportItem.id, previousData, newData });
      showToast('Plan updated', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to update plan.', 'danger');
    }
  };

  const handleInlineUpdateReport = async (reportItem, newReportText, newStatus) => {
    if (!checkWorkflowValidation(reportItem)) return;
    try {
      const previousData = { report: reportItem.report, status: reportItem.status };
      const newData = { report: newReportText, status: newStatus };
      await updateReport(reportItem.id, newData);
      pushUndo({ type: 'UPDATE_REPORT', docId: reportItem.id, previousData, newData });

      const fullReportObj = { ...reportItem, ...newData };
      await processReportPointsChange(reportItem.status, reportItem.report, newStatus, newReportText, fullReportObj);

      showToast('Report updated', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to update report.', 'danger');
    }
  };

  const handleConfirmDelete = async () => {
    try {
      if (!selectedReport) return;
      const { trashId, originalData } = await moveToTrash(selectedReport.id);
      if (originalData.status) {
        await reconcileBlockPoints(originalData, 'Pending');
      }
      pushUndo({ type: 'DELETE', trashId, originalData });
      playSound('trash');
      showToast('Moved to Trash  •  Undo with Ctrl+Z', 'info');
      handleCloseModal();
    } catch (err) {
      console.error(err);
      showToast('Something went wrong.', 'danger');
    }
  };

  const handleGenerateToday = async () => {
    try {
      const newIds = await generateDayReports(selectedDate);
      if (newIds.length > 0) {
        pushUndo({ type: 'GENERATE', docIds: newIds, date: selectedDate });
        showToast('Hour blocks generated', 'success');
      } else {
        showToast('Hours already generated.', 'info');
      }
      if (activeModal === 'settings') handleCloseModal();
    } catch (err) {
      console.error(err);
      showToast('Something went wrong.', 'danger');
    }
  };

  const handleClearTodayData = async () => {
    // Confirm is now done inside SettingsModal via custom popup
    try {
      const trashIds = await clearDayReports(selectedDate);
      if (trashIds.length > 0) {
        for (const report of reports) {
          if (report.status) await reconcileBlockPoints(report, 'Pending');
        }
        pushUndo({
          type: 'CLEAR',
          trashIds,
          date: selectedDate,
          pointStates: reports.map(({ id, status, startTime, endTime, hour, ampm, date }) => ({
            id, status, startTime, endTime, hour, ampm, date,
          })),
        });
        showToast(`${trashIds.length} items moved to Trash  •  Undo with Ctrl+Z`, 'info');
      } else {
        showToast('No data to clear.', 'info');
      }
      handleCloseModal();
    } catch (err) {
      console.error(err);
      showToast('Something went wrong.', 'danger');
    }
  };

  // ── Import / Export ───────────────────────────────────────────────────────

  const parseBackupTimestamp = (value) => {
    if (!value) return value;
    if (value instanceof Date) return Timestamp.fromDate(value);
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return Timestamp.fromDate(parsed);
      return value;
    }
    if (typeof value === 'number') return Timestamp.fromMillis(value);
    return value;
  };

  const normalizeBackupRecord = (record) => {
    if (!record || typeof record !== 'object') return record;
    const normalized = { ...record };
    for (const key of ['createdAt', 'updatedAt', 'deletedAt', 'lastSeenAt', 'timestamp']) {
      if (key in normalized && normalized[key] !== null && normalized[key] !== undefined) {
        normalized[key] = parseBackupTimestamp(normalized[key]);
      }
    }
    return normalized;
  };

  const safeLocalStorageJson = (value) => {
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  };

  const sortExportItems = (items, selector) => {
    if (!Array.isArray(items)) return items;
    return [...items].sort((a, b) => {
      const aStr = selector(a ?? {});
      const bStr = selector(b ?? {});
      return String(aStr ?? '').localeCompare(String(bStr ?? ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  const handleImportData = async (parsedJson) => {
    try {
      if (!currentUser) return;
      const uid = currentUser.uid;

      const isV3 = parsedJson && parsedJson.version === 3;
      const isV2 = parsedJson && parsedJson.version === 2;
      const isLegacy = Array.isArray(parsedJson);

      if (isV3) {
        showToast('Restoring full backup, please wait...', 'info');
        const data = parsedJson.data || parsedJson;
        const backup = {
          reports: Array.isArray(data.reports) ? data.reports : [],
          journals: Array.isArray(data.journals) ? data.journals : [],
          habits: Array.isArray(data.habits) ? data.habits : Array.isArray(data.streaks) ? data.streaks : [],
          trash: Array.isArray(data.trash) ? data.trash : [],
          mainStreak: data.mainStreak || {},
          points: data.points || {},
          goal: data.goal || {},
          dictionary: Array.isArray(data.dictionary) ? data.dictionary : [],
          prayerChecklists: data.prayerChecklists || {},
          settings: data.settings || {},
        };

        const ops = [];

        const clearCollection = async (collectionName) => {
          const existingDocs = await getDocs(query(collection(db, collectionName), where('uid', '==', uid)));
          existingDocs.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
        };

        await clearCollection('reports');
        await clearCollection('journals');
        await clearCollection('trash');
        await clearCollection('streaks');

        const currentMainStreak = await getDoc(doc(db, 'streaks', uid));
        if (currentMainStreak.exists()) ops.push((b) => b.delete(currentMainStreak.ref));

        const currentPoints = await getDoc(doc(db, 'points', uid));
        if (currentPoints.exists()) ops.push((b) => b.delete(currentPoints.ref));

        const currentGoal = await getDoc(doc(db, 'goals', uid));
        if (currentGoal.exists()) ops.push((b) => b.delete(currentGoal.ref));

        const currentDict = await getDoc(doc(db, 'dictionaries', uid));
        if (currentDict.exists()) ops.push((b) => b.delete(currentDict.ref));

        const existingPrayers = Object.keys(localStorage).filter((key) => key.startsWith('prayer_checklist_'));
        existingPrayers.forEach((key) => localStorage.removeItem(key));

        backup.reports.forEach((r) => {
          const cleaned = normalizeBackupRecord({ ...r, uid });
          ops.push((b) => b.set(doc(collection(db, 'reports')), cleaned));
        });

        backup.journals.forEach((j) => {
          const cleaned = normalizeBackupRecord({ ...j, uid });
          ops.push((b) => b.set(doc(collection(db, 'journals')), cleaned));
        });

        backup.habits.forEach((h) => {
          const cleaned = normalizeBackupRecord({ ...h, uid });
          ops.push((b) => b.set(doc(collection(db, 'streaks')), cleaned));
        });

        backup.trash.forEach((t) => {
          const cleaned = normalizeBackupRecord({ ...t, uid });
          ops.push((b) => b.set(doc(collection(db, 'trash')), cleaned));
        });

        if (backup.mainStreak && Object.keys(backup.mainStreak).length > 0) {
          const cleaned = normalizeBackupRecord({ ...backup.mainStreak, uid });
          ops.push((b) => b.set(doc(db, 'streaks', uid), cleaned, { merge: true }));
        }

        if (backup.points && Object.keys(backup.points).length > 0) {
          const cleaned = normalizeBackupRecord(backup.points);
          ops.push((b) => b.set(doc(db, 'points', uid), { ...cleaned }, { merge: true }));
        }

        if (backup.goal && Object.keys(backup.goal).length > 0) {
          const cleaned = normalizeBackupRecord(backup.goal);
          ops.push((b) => b.set(doc(db, 'goals', uid), cleaned, { merge: true }));
        }

        if (backup.dictionary && backup.dictionary.length > 0) {
          const cleaned = normalizeBackupRecord({ items: backup.dictionary });
          ops.push((b) => b.set(doc(db, 'dictionaries', uid), cleaned, { merge: true }));
        }

        let batch = writeBatch(db);
        let count = 0;
        for (const op of ops) {
          op(batch);
          count += 1;
          if (count === 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }

        if (backup.prayerChecklists) {
          Object.entries(backup.prayerChecklists).forEach(([date, value]) => {
            localStorage.setItem(`prayer_checklist_${date}`, JSON.stringify(value));
          });
        }
        if (backup.settings) {
          if (backup.settings.theme) localStorage.setItem('app-theme', String(backup.settings.theme));
          if (backup.settings.journalTheme) localStorage.setItem('journal-theme', String(backup.settings.journalTheme));
          if (typeof backup.settings.autoStreakScan !== 'undefined') {
            localStorage.setItem('auto-streak-security-scan', String(Boolean(backup.settings.autoStreakScan === true || backup.settings.autoStreakScan === 'true')));
          }
          if (backup.settings.soundSettings !== undefined && backup.settings.soundSettings !== null) {
            const soundSettings = typeof backup.settings.soundSettings === 'string'
              ? safeLocalStorageJson(backup.settings.soundSettings)
              : backup.settings.soundSettings;
            localStorage.setItem('app-sounds', typeof soundSettings === 'string' ? soundSettings : JSON.stringify(soundSettings));
          }
        }

        showToast('Full backup restored successfully. Please refresh.', 'success');
        handleCloseModal();
        return;
      }

      // Legacy / v2 import
      const importedData = isV2 ? parsedJson.records : parsedJson;
      const targetDate = isV2 ? parsedJson.date : selectedDate;

      const q = query(
        collection(db, 'reports'),
        where('uid', '==', uid),
        where('date', '==', targetDate)
      );
      const existingSnap = await getDocs(q);
      const batch = writeBatch(db);

      existingSnap.docs.forEach((d) => batch.delete(d.ref));

      const reportsCol = collection(db, 'reports');
      importedData.forEach((item) => {
        const ref = doc(reportsCol);
        const times = getIntervalTimes(item);
        batch.set(ref, {
          uid,
          date: targetDate,
          hour: item.hour || parseInt(times.startTime.split(':')[0], 10),
          ampm: item.ampm || (parseInt(times.startTime.split(':')[0], 10) >= 12 ? 'PM' : 'AM'),
          startTime: times.startTime,
          endTime: times.endTime,
          plan: item.plan || '',
          report: item.report || '',
          status: item.status || 'Pending',
          tag: item.tag || '',
          createdAt: serverTimestamp(),
        });
      });

      await batch.commit();
      showToast('Imported Successfully', 'success');
      handleCloseModal();
    } catch (err) {
      console.error(err);
      showToast('Something went wrong.', 'danger');
    }
  };

  const handleExportData = async () => {
    try {
      if (!currentUser) return;
      showToast('Exporting data, please wait...', 'info');

      const uid = currentUser.uid;

      const toISO = (ts) => ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : ts;
      const deepConvert = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        if (typeof obj.toDate === 'function') return toISO(obj);
        if (Array.isArray(obj)) return obj.map(deepConvert);
        const res = {};
        for (const [k, v] of Object.entries(obj)) {
          res[k] = deepConvert(v);
        }
        return res;
      };

      const exportCollection = async (collectionName) => {
        const snap = await getDocs(query(collection(db, collectionName), where('uid', '==', uid)));
        return snap.docs.map((d) => deepConvert({ id: d.id, ...d.data() }));
      };

      const reportsSnap = await getDocs(query(collection(db, 'reports'), where('uid', '==', uid)));
      const exportReports = reportsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          date: data.date,
          hour: data.hour,
          ampm: data.ampm,
          startTime: data.startTime,
          endTime: data.endTime,
          plan: data.plan,
          report: data.report,
          status: data.status,
          tag: data.tag,
          uid: data.uid,
          createdAt: toISO(data.createdAt),
          updatedAt: toISO(data.updatedAt),
        };
      });

      const exportJournals = sortExportItems(await exportCollection('journals'), (item) => `${item?.date || ''} ${item?.title || ''} ${item?.id || ''}`.toLowerCase());
      const exportHabits = sortExportItems(await exportCollection('streaks'), (item) => `${item?.title || item?.name || ''} ${item?.date || ''} ${item?.id || ''}`.toLowerCase());
      const exportTrash = sortExportItems(await exportCollection('trash'), (item) => `${item?.date || ''} ${item?.title || item?.plan || item?.report || ''} ${item?.id || ''}`.toLowerCase());

      const mainStreakSnap = await getDoc(doc(db, 'streaks', uid));
      const exportMainStreak = mainStreakSnap.exists() ? deepConvert(mainStreakSnap.data()) : {};

      const pointsSnap = await getDoc(doc(db, 'points', uid));
      let exportPoints = pointsSnap.exists() ? deepConvert(pointsSnap.data()) : {};
      delete exportPoints.updatedAt;

      const goalsSnap = await getDoc(doc(db, 'goals', uid));
      const exportGoal = goalsSnap.exists() ? deepConvert(goalsSnap.data()) : {};

      const dictSnap = await getDoc(doc(db, 'dictionaries', uid));
      const exportDictionary = sortExportItems(dictSnap.exists() ? deepConvert(dictSnap.data().items || []) : [], (item) => {
        if (typeof item === 'string') return item.toLowerCase();
        if (item && typeof item === 'object') {
          const label = item.tag || item.label || item.name || item.title || item.keyword || item.key || JSON.stringify(item);
          return String(label).toLowerCase();
        }
        return String(item ?? '').toLowerCase();
      });

      const prayerChecklists = {};
      const settings = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('prayer_checklist_')) {
          try {
            const rawValue = localStorage.getItem(key);
            prayerChecklists[key.replace('prayer_checklist_', '')] = safeLocalStorageJson(rawValue) ?? rawValue;
          } catch (e) {
            // Ignore malformed storage entries
          }
        }
      }
      settings.theme = localStorage.getItem('app-theme');
      settings.journalTheme = localStorage.getItem('journal-theme');
      settings.autoStreakScan = localStorage.getItem('auto-streak-security-scan') === 'true';
      settings.soundSettings = safeLocalStorageJson(localStorage.getItem('app-sounds')) ?? localStorage.getItem('app-sounds');

      const exportPayload = {
        version: 3,
        app: '24hours-hourlog',
        exportedAt: new Date().toISOString(),
        user: { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName },
        summary: {
          reportCount: exportReports.length,
          journalCount: exportJournals.length,
          habitCount: exportHabits.length,
          trashCount: exportTrash.length,
          prayerChecklistCount: Object.keys(prayerChecklists).length,
          hasPoints: !!Object.keys(exportPoints || {}).length,
          hasMainStreak: !!Object.keys(exportMainStreak || {}).length,
          hasGoal: !!Object.keys(exportGoal || {}).length,
          dictionaryCount: exportDictionary.length,
        },
        data: {
          reports: deepConvert(sortExportItems(exportReports, (item) => `${item?.date || ''} ${item?.startTime || ''} ${item?.plan || item?.report || ''}`.toLowerCase())),
          journals: exportJournals,
          habits: exportHabits,
          trash: exportTrash,
          mainStreak: exportMainStreak,
          points: exportPoints,
          goal: exportGoal,
          dictionary: exportDictionary,
          prayerChecklists,
          settings,
        }
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const todayStr = new Date().toISOString().split('T')[0];
      link.download = `24hours-full-backup-${todayStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Exported ${exportReports.length} reports, ${exportJournals.length} journals, ${exportHabits.length} habits successfully`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to export data.', 'danger');
    }
  };

  const handleRetry = () => window.location.reload();

  // ── Trash pass-throughs (for TrashModal, no undo since trash IS the undo) ─

  const handleRestoreFromTrash = async (trashId) => {
    await restoreFromTrash(trashId);
  };

  const handlePermanentDeleteFromTrash = async (trashId) => {
    await permanentDeleteFromTrash(trashId);
  };

  const handleEmptyTrash = async () => {
    return await emptyTrash();
  };

  const handleRestoreAllFromTrash = async (ids) => {
    await restoreAllFromTrash(ids);
  };

  // ── Render guards ─────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div
        className="min-vh-100 d-flex flex-column justify-content-center align-items-center"
        style={{ backgroundColor: '#ECE5DD' }}
      >
        <div className="spinner-border mb-3" role="status" style={{ color: '#075E54' }}>
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="text-secondary small fw-bold">Authorizing connection...</span>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage />;
  }

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  if (isAdminOpen && isAdmin) {
    return (
      <AdminPage
        currentUser={currentUser}
        reports={reports}
        pointsData={pointsData}
        streakData={streakData}
        onRunSecurityScan={() => window.triggerManualSecurityScan?.()}
        onUpdateUserRole={handleUpdateAdminUserRole}
        sendMessage={sendMessage}
        updateMyAdminProfile={updateMyAdminProfile}
        adminProfiles={adminProfiles}
        onBack={() => {
          setIsAdminOpen(false);
          navigateTo('/');
        }}
        onExportData={handleExportData}
      />
    );
  }

  // ── Islamic Theme: Full separate page ────────────────────────────────────
  if (theme === 'islamic') {
    return (
      <>
        {/* Settings modal still accessible for theme switching back */}
        <SettingsModal
          isOpen={activeModal === 'settings'}
          onClose={handleCloseModal}
          reports={reports}
          selectedDate={selectedDate}
          currentUser={currentUser}
          onGenerateToday={handleGenerateToday}
          onClearData={handleClearTodayData}
          onImportData={handleImportData}
          onExportData={handleExportData}
          dictionaryData={finalDictionary}
          onUpdateDictionary={updateDictionary}
          theme={theme}
          onThemeChange={handleThemeChange}
          pointsData={pointsData}
          unlockFeature={unlockFeature}
          onOpenPoints={() => setActiveModal('points')}
          onReplayTutorial={handleReplayTutorial}
          fullPage={window.location.pathname === '/settings'}
          initialSection={settingsSection}
          onTriggerPendingReview={() => {}}
        />
        <IslamicPage
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onOpenSettings={handleOpenSettings}
          onBack={() => handleThemeChange('light')}
          onOpenSurvey={() => {
            setIsSurveyOpen(true);
            navigateTo('/survey');
          }}
        />
      </>
    );
  }

  // ── Journal Page: Full separate page ──────────────────────────────────
  if (isJournalOpen) {
    return (
      <JournalPage
        key={journalInitialDate || 'today'}
        currentUser={currentUser}
        initialDate={journalInitialDate}
        onBack={() => {
          setIsJournalOpen(false);
          setJournalInitialDate(null);
          navigateTo('/');
        }}
      />
    );
  }

  // ── Streaks Page: Full separate page ──────────────────────────────────
  if (isStreaksOpen) {
    return (
      <StreaksPage
        currentUser={currentUser}
        onDailyCheckIn={claimDailyCheckIn}
        streakRequirements={dashboardStreakRequirements}
        openHabitScanner={openHabitScannerOnStreaks}
        onBack={() => {
          setIsStreaksOpen(false);
          setOpenHabitScannerOnStreaks(false);
          navigateTo('/');
        }}
      />
    );
  }

  // ── Wallet Page: Full separate page ──────────────────────────────────
  if (isWalletOpen) {
    return (
      <WalletPage
        currentUser={currentUser}
        initialDistId={walletInitialDist}
        onBack={() => {
          setIsWalletOpen(false);
          setWalletInitialDist(null);
          navigateTo('/');
        }}
      />
    );
  }

  // ── Survey Page: Full separate page ──────────────────────────────────
  if (isSurveyOpen) {
    return (
      <SurveyPage
        currentUser={currentUser}
        onBack={() => {
          setIsSurveyOpen(false);
          navigateTo('/');
        }}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-container min-vh-100 d-flex flex-column" style={{ backgroundColor: '#ECE5DD' }}>

      {/* Sticky Header */}
      <Header
        selectedDate={selectedDate}
        reports={reports}
        onOpenSettings={handleOpenSettings}
        onOpenProfile={handleOpenProfile}
        onOpenTrash={handleOpenTrash}
        onOpenPoints={handleOpenPoints}
        onOpenInsights={() => setIsInsightsOpen(true)}
        onOpenFeatureHub={handleOpenFeatureHub}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenAdmin={handleOpenAdmin}
        isAdmin={isAdmin}
        userPoints={pointsData?.points || 0}
        isPointsInitial={pointsData?.isInitial}
        unreadMessagesCount={unreadMessagesCount}
        onOpenMessages={() => setIsMessageCenterOpen(true)}
        trashCount={trashItems.length}
        currentUser={currentUser}
      />

      {isFeatureHubOpen && (
        <FeatureHubPage
          points={pointsData?.points || 0}
          streakDays={streakData?.currentStreak || 0}
          onClose={() => {
            setIsFeatureHubOpen(false);
            navigateTo('/');
          }}
          onOpenJournal={() => {
            if (tutorialStep === 5) setTutorialStep(6);
            setIsFeatureHubOpen(true);
            setIsJournalOpen(true);
            navigateTo('/journal');
            navigateTo('/journal');
          }}
          onOpenStreaks={() => {
            if (tutorialStep === 6) setTutorialStep(7);
            setIsFeatureHubOpen(true);
            openStreaksPage();
          }}
          onOpenWallet={() => {
            setIsFeatureHubOpen(true);
            setIsWalletOpen(true);
            navigateTo('/wallet');
          }}
          onOpenRewards={() => {
            if (tutorialStep === 8) setTutorialStep(9);
            setActiveModal('points');
          }}
          onOpenInsights={() => setIsInsightsOpen(true)}
          onOpenSurvey={() => {
            setIsFeatureHubOpen(true);
            setIsSurveyOpen(true);
            navigateTo('/survey');
          }}
          fullPage={window.location.pathname === '/productivity-hub'}
        />
      )}

      {isSearchOpen && (
        <GlobalSearch
          reports={reports}
          isAdmin={isAdmin}
          onClose={() => setIsSearchOpen(false)}
          onSelect={handleSearchSelect}
        />
      )}

      {tutorialStep >= 0 && currentUser && !authLoading && !activeModal && (
        <NewUserTutorial
          stepIndex={tutorialStep}
          onStart={startTutorial}
          onSkipStep={skipTutorialStep}
          onExit={exitTutorial}
          onFinish={finishTutorial}
          onAction={handleTutorialAction}
        />
      )}

      {/* Main timeline */}
      <main className={`flex-grow-1 pb-5 ${isFeatureHubOpen ? 'd-none' : ''}`}>

        {/* Error State */}
        {error && (
          <div className="container-fluid max-width-container my-5 px-3 text-center animate-fade-in">
            <div className="alert alert-danger border-0 shadow-sm rounded-4 p-4 bg-white">
              <i className="bi bi-exclamation-octagon-fill text-danger fs-1 mb-3 d-block" />
              <h5 className="fw-bold text-dark">Something went wrong.</h5>
              <p className="text-secondary small mb-4">
                We were unable to connect to Firestore. Check your connection and click retry.
              </p>
              <button className="btn btn-danger px-4 rounded-pill fw-bold" onClick={handleRetry}>
                <i className="bi bi-arrow-clockwise me-1" />Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {!error && firestoreLoading && (
          <div className="d-flex flex-column justify-content-center align-items-center py-5">
            <div className="spinner-border mb-3" role="status" style={{ color: '#075E54' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
            <span className="text-secondary small fw-bold">Synchronizing database...</span>
          </div>
        )}

        {/* Normal View */}
        {!error && !firestoreLoading && (
          <>
            <ConsistencyWidget
              reports={reports}
              appUsage={appUsage}
              streakRequirements={dashboardStreakRequirements}
              streakData={streakData}
              weeklyStats={weeklyStats}
              dailyGoal={dailyGoal}
              onUpdateDailyGoal={updateDailyGoal}
              heatmapData={heatmapData}
              onExcuseDay={excuseDay}
              onAddStreakFreeze={addStreakFreeze}
              onOpenPoints={handleOpenPoints}
              onOpenPlan={handleOpenAddPlan}
              onOpenSettings={handleOpenSettings}
              onOpenJournal={() => {
                setJournalInitialDate(getTodayDateString());
                setIsJournalOpen(true);
                navigateTo('/journal');
              }}
              onOpenStreaks={() => openStreaksPage()}
              selectedDate={selectedDate}
              pointsData={pointsData}
              onUnlockFeature={unlockFeature}
            />
            <QuickAccessDashboardWidget
              currentUser={currentUser}
              onOpenJournal={() => {
                setJournalInitialDate(getTodayDateString());
                setIsJournalOpen(true);
                navigateTo('/journal');
              }}
              onOpenStreaks={() => openStreaksPage()}
              onOpenRewards={() => setActiveModal('points')}
              onOpenWallet={() => {
                setIsWalletOpen(true);
                navigateTo('/wallet');
              }}
              onOpenWalletDist={(distId) => {
                setWalletInitialDist(distId);
                setIsWalletOpen(true);
                navigateTo('/wallet');
              }}
              onOpenInsights={() => setIsInsightsOpen(true)}
              onOpenFeatureHub={handleOpenFeatureHub}
              onOpenSurvey={() => {
                setIsSurveyOpen(true);
                navigateTo('/survey');
              }}
            />
            <TodoDashboardWidget 
              currentUser={currentUser} 
              onOpenTodo={() => setIsTodoOpen(true)} 
            />
            {theme === 'islamic' && (
              <div className="container-fluid max-width-container px-3">
                <PrayerChecklist selectedDate={selectedDate} />
              </div>
            )}
            <Summary
              reports={reports}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onGenerateToday={handleGenerateToday}
              onOpenPDFSettings={handleOpenSettings}
              dictionaryData={finalDictionary}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
            />
            {selectedTag && (
              <div className="container-fluid max-width-container px-3 mb-3">
                <div className="alert alert-info border-0 rounded-3 shadow-sm d-flex justify-content-between align-items-center mb-0 py-2.5 bg-info-subtle border-start border-4 border-info">
                  <span className="small fw-semibold text-info-emphasis">
                    <i className="bi bi-filter-circle-fill me-1.5 fs-6 text-info"></i>
                    Filtering timeline by: <strong className="text-uppercase">#{selectedTag}</strong>
                  </span>
                  <button 
                    className="btn btn-xs btn-outline-info text-info-emphasis border-0 rounded-pill py-0 px-2 fw-bold text-dark hover-bg-info-subtle"
                    onClick={() => setSelectedTag(null)}
                  >
                    Clear Filter
                  </button>
                </div>
              </div>
            )}
            <Timeline
              reports={(() => {
                if (!selectedTag) return reports;
                return reports.filter(r => {
                  let activeTag = r.tag;
                  if (!activeTag && r.report) {
                    const matched = finalDictionary.find(d => 
                      (d.report_bn && d.report_bn === r.report) ||
                      (d.plan_bn && d.plan_bn === r.report) ||
                      (d.report_en && d.report_en === r.report) ||
                      (d.plan_en && d.plan_en === r.report)
                    );
                    if (matched) activeTag = matched.tag;
                  }
                  return activeTag === selectedTag;
                });
              })()}
              currentTime={currentTime}
              selectedDate={selectedDate}
              onEditPlan={handleOpenEditPlan}
              onEditReport={handleOpenEditReport}
              onDelete={handleOpenDelete}
              onGenerateToday={handleGenerateToday}
              onInlineUpdatePlan={handleInlineUpdatePlan}
              onInlineUpdateReport={handleInlineUpdateReport}
              dictionaryData={finalDictionary}
              onOpenPomodoro={(report) => {
                setPomodoroReport(report);
                setIsPomodoroOpen(true);
              }}
            />
          </>
        )}
      </main>

      {/* ── Floating Action Buttons ─────────────────────────────────────── */}

      {/* Add Plan FAB */}
      <button
        data-tutorial="add-plan"
        className={`btn-floating-add rounded-circle shadow-lg text-white border-0 hover-scale d-flex align-items-center justify-content-center ${isFeatureHubOpen ? 'd-none' : ''}`}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '58px',
          height: '58px',
          backgroundColor: '#25D366',
          zIndex: 1000,
        }}
        onClick={handleOpenAddPlan}
        title="Add Hourly Plan"
        aria-label="Add Hourly Plan"
      >
        <i className="bi bi-plus-lg fs-2" />
      </button>

      {/* Undo / Redo floating bar — shown only when history exists */}
      {(canUndo || canRedo) && !isFeatureHubOpen && (
        <div
          className="position-fixed d-flex gap-2 animate-slide-up"
          style={{ bottom: '24px', left: '16px', zIndex: 999 }}
        >
          <button
            className="btn btn-sm rounded-pill fw-bold shadow px-3 py-2 d-flex align-items-center gap-1"
            style={{
              backgroundColor: canUndo ? '#075E54' : '#ccc',
              color: '#fff',
              border: 'none',
              fontSize: '0.78rem',
              transition: 'all 0.2s',
              opacity: canUndo ? 1 : 0.5,
            }}
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <i className="bi bi-arrow-counterclockwise" />
            Undo
            {canUndo && (
              <span
                className="badge rounded-pill ms-1"
                style={{ backgroundColor: 'rgba(255,255,255,0.25)', fontSize: '0.65rem' }}
              >
                {undoStack.length}
              </span>
            )}
          </button>

          <button
            className="btn btn-sm rounded-pill fw-bold shadow px-3 py-2 d-flex align-items-center gap-1"
            style={{
              backgroundColor: canRedo ? '#128C7E' : '#ccc',
              color: '#fff',
              border: 'none',
              fontSize: '0.78rem',
              transition: 'all 0.2s',
              opacity: canRedo ? 1 : 0.5,
            }}
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <i className="bi bi-arrow-clockwise" />
            Redo
            {canRedo && (
              <span
                className="badge rounded-pill ms-1"
                style={{ backgroundColor: 'rgba(255,255,255,0.25)', fontSize: '0.65rem' }}
              >
                {redoStack.length}
              </span>
            )}
          </button>
        </div>
      )}

      {isMessageCenterOpen && (
        <MessageCenterModal
          isOpen={isMessageCenterOpen}
          onClose={() => setIsMessageCenterOpen(false)}
          currentUser={currentUser}
          isAdmin={isAdmin}
          messages={messages}
          sendMessage={sendMessage}
          markAsRead={markAsRead}
          deleteMessage={deleteMessage}
          editMessage={editMessage}
          togglePin={togglePin}
          bulkMarkAsRead={bulkMarkAsRead}
          bulkDelete={bulkDelete}
        />
      )}

      {isAboutAdminsOpen && (
        <AboutAdminsModal
          isOpen={isAboutAdminsOpen}
          onClose={() => setIsAboutAdminsOpen(false)}
          adminProfiles={adminProfiles}
          loading={adminProfilesLoading}
        />
      )}

      {/* ── Action Modals ──────────────────────────────────────────────── */}

      <PlanningModal
        isOpen={activeModal === 'planning'}
        onClose={handleCloseModal}
        onSave={handleSavePlan}
        report={selectedReport}
        dictionaryData={finalDictionary}
        recentPlans={recentPlans}
      />

      <ReportModal
        isOpen={activeModal === 'report'}
        onClose={handleCloseModal}
        onSave={handleSaveReport}
        report={selectedReport}
        dictionaryData={finalDictionary}
        isMandatory={true}
      />

      <DeleteModal
        isOpen={activeModal === 'delete'}
        onClose={handleCloseModal}
        onConfirm={handleConfirmDelete}
        report={selectedReport}
      />

      <SettingsModal
        isOpen={activeModal === 'settings'}
        onClose={handleCloseModal}
        reports={reports}
        selectedDate={selectedDate}
        currentUser={currentUser}
        onGenerateToday={handleGenerateToday}
        onClearData={handleClearTodayData}
        onImportData={handleImportData}
        onExportData={handleExportData}
        dictionaryData={finalDictionary}
        onUpdateDictionary={updateDictionary}
        theme={theme}
        onThemeChange={handleThemeChange}
        pointsData={pointsData}
        unlockFeature={unlockFeature}
        onOpenPoints={() => setActiveModal('points')}
        onReplayTutorial={handleReplayTutorial}
        fullPage={window.location.pathname === '/settings'}
        initialSection={settingsSection}
        onTriggerPendingReview={() => {
          if (pastPendingReports.length === 0) {
            showToast('No pending blocks to review from earlier today! / আজ আর কোনো পেন্ডিং স্লট নেই!', 'info');
          } else {
            setIsReviewModalOpen(true);
            setShowPendingToast(false);
          }
        }}
      />

      <ProfileModal
        isOpen={activeModal === 'profile'}
        onClose={handleCloseModal}
        currentUser={currentUser}
        onUpdateProfile={handleUpdateProfile}
        onLogout={handleLogout}
        onOpenMeetCreator={() => {
          handleCloseModal();
          setIsAboutAdminsOpen(true);
        }}
      />

      <TrashModal
        isOpen={activeModal === 'trash'}
        onClose={handleCloseModal}
        trashItems={trashItems}
        trashLoading={trashLoading}
        onRestore={handleRestoreFromTrash}
        onPermanentDelete={handlePermanentDeleteFromTrash}
        onEmptyTrash={handleEmptyTrash}
        onRestoreAll={handleRestoreAllFromTrash}
      />

      <PointsModal
        show={activeModal === 'points'}
        onClose={handleCloseModal}
        pointsData={pointsData}
        redeemPerk={redeemPerk}
        showToast={showToast}
      />

      <PointsCollectionAnimation
        key={floatKey}
        animationKey={floatKey}
        delta={lastDelta}
        sourceId={lastSourceId}
      />

      <PendingReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        pendingReports={pastPendingReports}
        onSave={handleSavePendingReview}
        awayDuration={awayDuration}
      />

      <SecurityScanModal
        invalidBlocks={securityInvalidBlocks}
        onResolve={handleResolveSecurityBlocks}
        dictionaryData={finalDictionary}
      />

      {securityScanChoiceOpen && (
        <SecurityScanChoiceModal
          onHourly={runHourlySecurityScan}
          onStreaks={() => openStreaksPage(true)}
          onBoth={runBothSecurityScans}
          onClose={() => setSecurityScanChoiceOpen(false)}
        />
      )}


      {/* ── Toast notification ───────────────────────────────────────────── */}
      {toast.show && (
        <div
          className="position-fixed top-0 start-50 translate-middle-x mt-3 shadow-lg animate-slide-down-toast-container toast-notification"
          style={{ zIndex: 1100, width: 'min(92vw, 480px)' }}
          role="status"
          aria-live="polite"
        >
          <div
            className={`toast show align-items-center border-0 rounded-4 text-white px-3 py-2 ${
              toast.type === 'danger' ? 'bg-danger' : toast.type === 'info' ? '' : ''
            }`}
            style={{
              backgroundColor:
                toast.type === 'success'
                  ? '#075E54'
                  : toast.type === 'info'
                  ? '#128C7E'
                  : undefined,
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
            }}
          >
            <div className="d-flex align-items-center gap-2">
              <i
                className={`bi ${
                  toast.type === 'success'
                    ? 'bi-check-circle-fill'
                    : toast.type === 'danger'
                    ? 'bi-exclamation-triangle-fill'
                    : 'bi-info-circle-fill'
                } fs-5`}
              />
              <span className="fw-bold small flex-grow-1">{toast.message}</span>
              <button
                type="button"
                className="btn btn-sm text-white opacity-75 p-0 border-0 shadow-none"
                onClick={() => setToast((previous) => ({ ...previous, show: false }))}
                aria-label="Dismiss notification"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <div className="toast-progress mt-2" key={toast.id} />
          </div>
        </div>
      )}

      {/* Floating Toast reminder for pending slots */}
      {showPendingToast && pastPendingReports.length > 0 && (
        <div
          className="position-fixed d-flex align-items-center gap-2 p-3 rounded-4 shadow-lg animate-slide-up border"
          style={{
            bottom: '96px',
            left: '24px',
            zIndex: 999,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            maxWidth: '320px',
            borderColor: '#075E54'
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <div 
              className="rounded-circle d-flex align-items-center justify-content-center text-white" 
              style={{ width: '36px', height: '36px', backgroundColor: '#FFC107' }}
            >
              <i className="bi bi-bell-fill animate-pulse"></i>
            </div>
            <div>
              <div className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>
                {pastPendingReports.length} Unchecked Blocks
              </div>
              <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                You have slots from earlier today.
              </div>
            </div>
          </div>
          <div className="d-flex flex-column gap-1 ms-auto">
            <button
              className="btn btn-xs text-white fw-bold rounded-pill px-2.5 py-1 border-0"
              style={{ backgroundColor: '#075E54', fontSize: '0.7rem' }}
              onClick={() => {
                setIsReviewModalOpen(true);
                setShowPendingToast(false);
              }}
            >
              Review
            </button>
            <button
              className="btn btn-xs btn-link text-secondary text-decoration-none p-0 fw-bold border-0"
              style={{ fontSize: '0.65rem' }}
              onClick={() => setShowPendingToast(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* ── Todo App Modal ──────────────────────────────────────────── */}
      <TodoAppModal
        isOpen={isTodoOpen}
        onClose={() => setIsTodoOpen(false)}
        currentUser={currentUser}
      />

      {/* ── Pomodoro Focus Modal ────────────────────────────────────── */}
      <PomodoroModal
        isOpen={isPomodoroOpen}
        onClose={() => {
          setIsPomodoroOpen(false);
          setPomodoroReport(null);
        }}
        activeReport={pomodoroReport}
        onAwardPoints={async (pts, reason) => {
          try {
            await updatePoints(pts, reason, 'earn');
          } catch (e) {
            console.error('Failed to award Pomodoro points:', e);
          }
        }}
        onUpdateReportText={handleInlineUpdateReport}
        pointsData={pointsData}
        onUnlockFeature={async (key, cost, name) => {
          try {
            await unlockFeature(key, cost, name);
          } catch (e) {
            console.error('Unlock error:', e);
            throw e;
          }
        }}
      />

      {/* ── Consistency Insights Fullscreen Modal ───────────────────── */}
      <InsightsModal
        isOpen={isInsightsOpen}
        onClose={() => setIsInsightsOpen(false)}
        onOpenStreaks={() => openStreaksPage()}
        reports={reports}
        streakData={streakData}
        weeklyStats={weeklyStats}
        dailyGoal={dailyGoal}
        heatmapData={heatmapData}
        selectedDate={selectedDate}
        onExcuseDay={excuseDay}
        onOpenPoints={handleOpenPoints}
        pointsData={pointsData}
        onUnlockFeature={unlockFeature}
        onOpenJournal={(date) => {
          setJournalInitialDate(date || getTodayDateString());
          setIsInsightsOpen(false);
          setIsJournalOpen(true);
          navigateTo('/journal');
        }}
      />

      {/* ── Scroll to Top Button ──────────────────────────────────────── */}
      {showScrollTop && !isFeatureHubOpen && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="btn btn-primary rounded-circle shadow-lg position-fixed d-flex align-items-center justify-content-center animate-slide-up hover-scale"
          style={{
            bottom: '96px',
            right: '24px',
            width: '45px',
            height: '45px',
            zIndex: 1050,
            backgroundColor: '#075E54',
            borderColor: '#075E54'
          }}
          title="Scroll to Top"
          aria-label="Scroll to Top"
        >
          <i className="bi bi-arrow-up text-white fs-5" />
        </button>
      )}

      {activeCustomFeature && (
        <CustomFeatureViewer
          feature={activeCustomFeature}
          onClose={() => setActiveCustomFeature(null)}
        />
      )}
    </div>
  );
}
