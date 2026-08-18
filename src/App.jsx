import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from './i18n/index.jsx';
import { useTrip } from './modules/trips/useTrip.js';
import { useSavedTrips } from './modules/trips/useSavedTrips.js';
import { useTripAutoPersistence } from './modules/trips/useTripAutoPersistence.js';
import { savedTripErrorTranslationKey } from './modules/trips/savedTripOperations.js';
import { useFirebaseAuth } from './infrastructure/firebase/useFirebaseAuth.js';
import { isTripSavable, segmentTotal } from './modules/trips/tripModel.js';
import { AppTopbar } from './app/AppTopbar.jsx';
import { AppEditorModule } from './app/AppEditorModule.jsx';
import { AppMapPane } from './app/AppMapPane.jsx';
import { AppWorkspace } from './app/AppWorkspace.jsx';
import { TripDeleteDialog } from './app/TripDeleteDialog.jsx';
import { useAppEditorState } from './app/useAppEditorState.js';
import {
  useOutsideClick,
  useOutsideClickSelector,
  useSaveShortcut,
} from './app/useAppInteractions.js';
import './App.css';
import './app/FloatingEditor.css';
import './app/ItinerarySidebar.css';

function isBlankRecoveredSegment(segment) {
  return Boolean(
    segment
      && !segment.origin
      && !segment.destination
      && !segment.startDate
      && !segment.endDate
      && !String(segment.note || '').trim()
      && segmentTotal(segment) === 0
  );
}

function normalizeRecoveredDraft(draft) {
  const segments = Array.isArray(draft?.segments) ? draft.segments : [];
  if (segments.length <= 1) return draft;

  const hasNamedTrip = Boolean(String(draft?.name || '').trim());
  const hasPlaces = Array.isArray(draft?.places) && draft.places.length > 0;
  const hasRoutes = Array.isArray(draft?.routeConnections) && draft.routeConnections.length > 0;
  const hasChecklist = Array.isArray(draft?.checklist) && draft.checklist.length > 0;
  const hasNotes = Array.isArray(draft?.notes) && draft.notes.some((note) =>
    String(note?.title || '').trim() || String(note?.text || '').trim()
  );
  const isPristine = !hasNamedTrip
    && !hasPlaces
    && !hasRoutes
    && !hasChecklist
    && !hasNotes
    && segments.every(isBlankRecoveredSegment);

  if (!isPristine) return draft;

  // Older local drafts could retain several generated blank rows. They contain
  // no user data, so collapse only this pristine recovery case to the single
  // starter segment used by the current editor. Saved/real trips are untouched.
  return {
    ...draft,
    segments: [segments[0]],
  };
}

export default function App() {
  const { t, locale, intlLocale, setLocale, availableLocales } = useTranslation();
  const auth = useFirebaseAuth();
  const tripStore = useTrip();
  const savedTrips = useSavedTrips(auth.user);
  const editorState = useAppEditorState(tripStore);
  const { trip, loadTrip, renameTrip, updateSegment, addPlace } = tripStore;
  const {
    getTrip,
    getActiveTripDraft,
    stageTrip,
    getTripPersistenceState,
    saveTrip,
    deleteTrip,
    importLocalTrips,
    getLocalTripCount,
  } = savedTrips;

  const [toast, setToast] = useState('');
  const [mobileView, setMobileView] = useState('form');
  const [activeTab, setActiveTab] = useState('segments');
  const [tripToDelete, setTripToDelete] = useState(null);
  const [deletePending, setDeletePending] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [openNoteSegmentId, setOpenNoteSegmentId] = useState(null);
  const [desktopPanelCollapsed, setDesktopPanelCollapsed] = useState(false);
  const menuWrapRef = useRef(null);
  const editorMenuRef = useRef(null);
  const deleteInFlightRef = useRef(false);
  const initialTripRef = useRef(trip);
  const currentTripRef = useRef(trip);
  const recoveredDraftScopeRef = useRef(null);
  currentTripRef.current = trip;

  const canSave = isTripSavable(trip);
  const persistence = useTripAutoPersistence({
    trip,
    stageTrip,
    getTripPersistenceState,
    canRemoteSync: canSave,
  });

  useEffect(() => {
    if (auth.loading) return undefined;
    const scope = auth.user?.uid || 'anonymous';
    if (recoveredDraftScopeRef.current === scope) return undefined;
    recoveredDraftScopeRef.current = scope;
    let cancelled = false;

    Promise.resolve(getActiveTripDraft()).then((draft) => {
      if (cancelled || !draft) return;
      // Never replace work the user already started during auth/draft startup.
      if (currentTripRef.current !== initialTripRef.current) return;
      loadTrip(normalizeRecoveredDraft(draft));
    }).catch(() => {
      // Recovery is best-effort here. A later editor write surfaces durability
      // failure through the persistence state instead of silently claiming saved.
    });

    return () => {
      cancelled = true;
    };
  }, [auth.loading, auth.user?.uid, getActiveTripDraft, loadTrip]);

  const showToast = useCallback((message, duration = 2200) => {
    setToast(message);
    setTimeout(() => setToast(''), duration);
  }, []);

  const handleSave = useCallback(async () => {
    if (!isTripSavable(trip)) {
      showToast(t('saveValidationError'), 2500);
      return;
    }
    // Durable local write is best-effort here: an IndexedDB problem must not
    // prevent an explicit user-requested remote save from being attempted.
    await persistence.persistLocalNow().catch(() => {});
    persistence.markSaving();
    try {
      await saveTrip(trip);
      persistence.markSaved();
      showToast(t('saved'));
    } catch (error) {
      persistence.markSaveError(error);
      showToast(t(savedTripErrorTranslationKey(error, 'savePersistenceError')), 3500);
    }
  }, [persistence, saveTrip, showToast, trip, t]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      await auth.signInWithGoogle();
      setOpenMenu(null);
      showToast(t('signedIn'));
    } catch {
      showToast(t('signInError'), 3000);
    }
  }, [auth, showToast, t]);

  const handleSignOut = useCallback(async () => {
    await auth.signOutUser();
    setOpenMenu(null);
    showToast(t('signedOut'));
  }, [auth, showToast, t]);

  const handleImportLocalTrips = useCallback(async () => {
    const count = await getLocalTripCount();
    if (count === 0) {
      showToast(t('noLocalTrips'));
      return;
    }
    if (!globalThis.confirm(t('confirmImportLocalTrips'))) return;
    const imported = await importLocalTrips();
    setOpenMenu(null);
    showToast(`${t('importedTrips')}: ${imported}`);
  }, [getLocalTripCount, importLocalTrips, showToast, t]);

  const handleOpenSavedTrip = useCallback(async (savedTrip) => {
    try {
      const storedTrip = await getTrip(savedTrip.id);
      if (!storedTrip) {
        showToast(t('savedTripMissing'), 3000);
        return;
      }
      loadTrip(storedTrip);
      setOpenMenu(null);
    } catch {
      showToast(t('openTripError'), 3000);
    }
  }, [getTrip, loadTrip, showToast, t]);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const closeSegmentNote = useCallback(() => setOpenNoteSegmentId(null), []);

  useSaveShortcut(handleSave);
  useOutsideClick(menuWrapRef, openMenu === 'account', closeMenu);
  useOutsideClick(
    editorMenuRef,
    openMenu === 'currency' || openMenu === 'workspace',
    closeMenu
  );
  useOutsideClickSelector('.segnote', Boolean(openNoteSegmentId), closeSegmentNote);

  async function confirmRemoveTrip() {
    if (!tripToDelete || deleteInFlightRef.current) return;
    deleteInFlightRef.current = true;
    setDeletePending(true);
    try {
      await deleteTrip(tripToDelete.id);
      setTripToDelete(null);
    } catch (error) {
      showToast(t(savedTripErrorTranslationKey(error, 'deletePersistenceError')), 3500);
    } finally {
      deleteInFlightRef.current = false;
      setDeletePending(false);
    }
  }

  const topbar = (
    <AppTopbar
      menuWrapRef={menuWrapRef}
      t={t}
      trip={trip}
      renameTrip={renameTrip}
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      handleSave={handleSave}
      canSave={canSave}
      authUser={auth.user}
      authLoading={auth.loading}
      onGoogleSignIn={handleGoogleSignIn}
      onSignOut={handleSignOut}
      onImportLocalTrips={handleImportLocalTrips}
      desktopPanelCollapsed={desktopPanelCollapsed}
    />
  );

  const editorModule = (
    <AppEditorModule
      tripStore={tripStore}
      savedTrips={savedTrips}
      editorState={editorState}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      editorMenuRef={editorMenuRef}
      setOpenNoteSegmentId={setOpenNoteSegmentId}
      setTripToDelete={setTripToDelete}
      handleOpenSavedTrip={handleOpenSavedTrip}
      t={t}
      locale={locale}
      setLocale={setLocale}
      availableLocales={availableLocales}
      intlLocale={intlLocale}
    />
  );

  const mapPane = (
    <AppMapPane
      trip={trip}
      mapView={activeTab === 'places' ? 'places' : 'segments'}
      openNoteSegmentId={openNoteSegmentId}
      setOpenNoteSegmentId={setOpenNoteSegmentId}
      updateSegment={updateSegment}
      addPlace={addPlace}
      persistenceState={persistence.state}
      toast={toast}
      t={t}
    />
  );

  return (
    <div className="app">
      {topbar}
      <AppWorkspace
        editorModule={editorModule}
        mapPane={mapPane}
        mobileView={mobileView}
        setMobileView={setMobileView}
        desktopPanelCollapsed={desktopPanelCollapsed}
        setDesktopPanelCollapsed={setDesktopPanelCollapsed}
        t={t}
      />
      <TripDeleteDialog
        tripToDelete={tripToDelete}
        setTripToDelete={setTripToDelete}
        onConfirm={confirmRemoveTrip}
        isDeleting={deletePending}
        t={t}
      />
    </div>
  );
}