import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import Summary from '../components/Summary';
import Timeline from '../components/Timeline';
import PlanningModal from '../components/PlanningModal';
import ReportModal from '../components/ReportModal';
import DeleteModal from '../components/DeleteModal';
import SettingsModal from '../components/SettingsModal';
import ProfileModal from '../components/ProfileModal';
import TrashModal from '../components/TrashModal';
import AuthPage from '../components/AuthPage';
import { useFirestore } from '../hooks/useFirestore';
import { getTodayDateString, getCurrentHourAndAMPM } from '../utils/helpers';
import defaultDictionary from '../constants/dictionary.json';
import { db, auth } from '../firebase/firebase';
import {
  writeBatch,
  doc,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';

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
  // ── Auth ────────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Date / time ─────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [currentHourData, setCurrentHourData] = useState(getCurrentHourAndAMPM());

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
  } = useFirestore(selectedDate, currentUser?.uid);

  const finalDictionary = userDictionary && userDictionary.length > 0 ? userDictionary : defaultDictionary;

  // ── Modal state ──────────────────────────────────────────────────────────
  // 'planning' | 'report' | 'delete' | 'settings' | 'profile' | 'trash' | null
  const [activeModal, setActiveModal] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Refs so keyboard handler always sees latest handlers without re-registering
  const undoFnRef = useRef(null);
  const redoFnRef = useRef(null);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
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
    const t = setInterval(() => setCurrentHourData(getCurrentHourAndAMPM()), 60000);
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
    setToast({ show: true, message, type });
    setTimeout(() => setToast((p) => ({ ...p, show: false })), 3000);
  };

  const pushUndo = (action) => {
    setUndoStack((prev) => [...prev.slice(-19), action]);
    setRedoStack([]); // new action clears redo history
  };

  // ── Undo ─────────────────────────────────────────────────────────────────

  const handleUndo = async () => {
    if (!undoStack.length) return;
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
          break;
        }
        case 'DELETE': {
          // Undo delete → restore from trash; keep new docId for redo
          const newDocId = await restoreFromTrash(action.trashId);
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
    }
  };

  // ── Redo ─────────────────────────────────────────────────────────────────

  const handleRedo = async () => {
    if (!redoStack.length) return;
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
          break;
        }
        case 'DELETE': {
          // Redo delete → move restored doc back to trash
          const targetId = action.currentDocId || action.originalData.id;
          const result = await moveToTrash(targetId);
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
    }
  };

  // Keep refs in sync with latest handler instances
  undoFnRef.current = handleUndo;
  redoFnRef.current = handleRedo;

  // ── Modal handlers ────────────────────────────────────────────────────────

  const handleOpenAddPlan    = () => { setSelectedReport(null); setActiveModal('planning'); };
  const handleOpenEditPlan   = (r) => { setSelectedReport(r);   setActiveModal('planning'); };
  const handleOpenEditReport = (r) => { setSelectedReport(r);   setActiveModal('report');   };
  const handleOpenDelete     = (r) => { setSelectedReport(r);   setActiveModal('delete');   };
  const handleOpenSettings   = () => setActiveModal('settings');
  const handleOpenProfile    = () => setActiveModal('profile');
  const handleOpenTrash      = () => setActiveModal('trash');

  const handleCloseModal = () => {
    setActiveModal(null);
    setSelectedReport(null);
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
      if (selectedReport) {
        // Edit
        const previousData = { plan: selectedReport.plan };
        const newData = { plan: planData.plan };
        await updateReport(selectedReport.id, newData);
        pushUndo({ type: 'UPDATE_PLAN', docId: selectedReport.id, previousData, newData });
        showToast('Updated Successfully', 'success');
      } else {
        // Create
        const isDuplicate = reports.some(
          (r) => r.hour === planData.hour && r.ampm === planData.ampm
        );
        if (isDuplicate) {
          showToast(`Hour slot ${planData.hour}:00 ${planData.ampm} already exists.`, 'danger');
          return;
        }
        const data = {
          date: selectedDate,
          hour: planData.hour,
          ampm: planData.ampm,
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
      showToast('Something went wrong.', 'danger');
    }
  };

  const handleSaveReport = async (reportData) => {
    try {
      if (!selectedReport) return;
      const previousData = { report: selectedReport.report, status: selectedReport.status };
      const newData = { report: reportData.report, status: reportData.status };
      await updateReport(selectedReport.id, newData);
      pushUndo({ type: 'UPDATE_REPORT', docId: selectedReport.id, previousData, newData });
      showToast('Saved Successfully', 'success');
      handleCloseModal();
    } catch (err) {
      console.error(err);
      showToast('Something went wrong.', 'danger');
    }
  };

  const handleInlineUpdatePlan = async (reportItem, newPlan) => {
    try {
      const previousData = { plan: reportItem.plan };
      const newData = { plan: newPlan };
      await updateReport(reportItem.id, newData);
      pushUndo({ type: 'UPDATE_PLAN', docId: reportItem.id, previousData, newData });
      showToast('Plan updated', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to update plan.', 'danger');
    }
  };

  const handleInlineUpdateReport = async (reportItem, newReportText, newStatus) => {
    try {
      const previousData = { report: reportItem.report, status: reportItem.status };
      const newData = { report: newReportText, status: newStatus };
      await updateReport(reportItem.id, newData);
      pushUndo({ type: 'UPDATE_REPORT', docId: reportItem.id, previousData, newData });
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
      pushUndo({ type: 'DELETE', trashId, originalData });
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
        pushUndo({ type: 'CLEAR', trashIds, date: selectedDate });
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

  const handleImportData = async (importedData) => {
    try {
      if (!currentUser) return;

      const q = query(
        collection(db, 'reports'),
        where('uid', '==', currentUser.uid),
        where('date', '==', selectedDate)
      );
      const existingSnap = await getDocs(q);
      const batch = writeBatch(db);

      existingSnap.docs.forEach((d) => batch.delete(d.ref));

      const reportsCol = collection(db, 'reports');
      importedData.forEach((item) => {
        const ref = doc(reportsCol);
        batch.set(ref, {
          uid: currentUser.uid,
          date: selectedDate,
          hour: item.hour,
          ampm: item.ampm,
          plan: item.plan || '',
          report: item.report || '',
          status: item.status || 'Pending',
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

  const handleExportData = () => {
    try {
      if (reports.length === 0) {
        showToast('No data to export.', 'info');
        return;
      }
      const cleanedData = reports.map(({ hour, ampm, plan, report, status }) => ({
        hour, ampm, plan, report, status,
      }));
      const blob = new Blob([JSON.stringify(cleanedData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hourlog-${selectedDate}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Exported Successfully', 'success');
    } catch (err) {
      console.error(err);
      showToast('Something went wrong.', 'danger');
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-container min-vh-100 d-flex flex-column" style={{ backgroundColor: '#ECE5DD' }}>

      {/* Sticky Header */}
      <Header
        selectedDate={selectedDate}
        onOpenSettings={handleOpenSettings}
        onOpenProfile={handleOpenProfile}
        onOpenTrash={handleOpenTrash}
        trashCount={trashItems.length}
        currentUser={currentUser}
      />

      {/* Main timeline */}
      <main className="flex-grow-1 pb-5">

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
            <Summary
              reports={reports}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onGenerateToday={handleGenerateToday}
              onOpenPDFSettings={handleOpenSettings}
            />
            <Timeline
              reports={reports}
              currentHourData={currentHourData}
              selectedDate={selectedDate}
              onEditPlan={handleOpenEditPlan}
              onEditReport={handleOpenEditReport}
              onDelete={handleOpenDelete}
              onGenerateToday={handleGenerateToday}
              onInlineUpdatePlan={handleInlineUpdatePlan}
              onInlineUpdateReport={handleInlineUpdateReport}
              dictionaryData={finalDictionary}
            />
          </>
        )}
      </main>

      {/* ── Floating Action Buttons ─────────────────────────────────────── */}

      {/* Add Plan FAB */}
      <button
        className="btn-floating-add rounded-circle shadow-lg text-white border-0 hover-scale d-flex align-items-center justify-content-center"
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
      {(canUndo || canRedo) && (
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

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      <PlanningModal
        isOpen={activeModal === 'planning'}
        onClose={handleCloseModal}
        onSave={handleSavePlan}
        report={selectedReport}
        dictionaryData={finalDictionary}
      />

      <ReportModal
        isOpen={activeModal === 'report'}
        onClose={handleCloseModal}
        onSave={handleSaveReport}
        report={selectedReport}
        dictionaryData={finalDictionary}
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
      />

      <ProfileModal
        isOpen={activeModal === 'profile'}
        onClose={handleCloseModal}
        currentUser={currentUser}
        onUpdateProfile={handleUpdateProfile}
        onLogout={handleLogout}
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

      {/* ── Toast notification ───────────────────────────────────────────── */}
      {toast.show && (
        <div
          className="position-fixed top-0 start-50 translate-middle-x mt-4 shadow-lg animate-slide-down-toast-container"
          style={{ zIndex: 1100 }}
        >
          <div
            className={`toast show align-items-center border-0 rounded-pill text-white px-4 py-2 ${
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
                }`}
              />
              <span className="fw-bold small">{toast.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
