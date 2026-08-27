import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from './i18n/index.jsx';
import { useTrip } from './modules/trips/useTrip.js';
import { useSavedTrips } from './modules/trips/useSavedTrips.js';
import { useTripAutoPersistence } from './modules/trips/useTripAutoPersistence.js';
import { savedTripErrorTranslationKey } from './modules/trips/savedTripOperations.js';
import { useFirebaseAuth } from './infrastructure/firebase/useFirebaseAuth.js';
import { isTripSavable, TRIP_LIMITS } from './modules/trips/tripModel.js';
import { AppTopbar } from './app/AppTopbar.jsx';
import { AppEditorModule } from './app/AppEditorModule.jsx';
import { AppMapPane } from './app/AppMapPane.jsx';
import { AppWorkspace } from './app/AppWorkspace.jsx';
import { TripSummaryHeader } from './app/TripSummaryHeader.jsx';
import { TripDeleteDialog } from './app/TripDeleteDialog.jsx';
import { normalizeRecoveredDraft } from './app/recoveredTripDraft.js';
import { useAppEditorState } from './app/useAppEditorState.js';
import { useItineraryFloatingPanels } from './app/useItineraryFloatingPanels.js';
import { useOutsideClick, useSaveShortcut } from './app/useAppInteractions.js';
import { useTripSaveFlow } from './app/useTripSaveFlow.js';
import './App.css';
import './app/FloatingEditor.css';

export default function App() {
  const { t, locale, intlLocale, setLocale, availableLocales } = useTranslation();
  const auth = useFirebaseAuth();
  const tripStore = useTrip();
  const savedTrips = useSavedTrips(auth.user);
  const editorState = useAppEditorState(tripStore);
  const itineraryPanels = useItineraryFloatingPanels();
  const { trip, loadTrip, renameTrip, setCurrency, updateSegment, updateExpenses, updateOriginDetails, updateOriginExpenses, addPlace } = tripStore;
  const { getTrip, getActiveTripDraft, stageTrip, getTripPersistenceState, saveTrip, deleteTrip, importLocalTrips, getLocalTripCount } = savedTrips;
  const [toast, setToast] = useState('');
  const [mobileView, setMobileView] = useState('form');
  const [activeTab, setActiveTab] = useState('segments');
  const [tripToDelete, setTripToDelete] = useState(null);
  const [deletePending, setDeletePending] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [desktopPanelCollapsed, setDesktopPanelCollapsed] = useState(false);
  const menuWrapRef = useRef(null);
  const editorMenuRef = useRef(null);
  const deleteInFlightRef = useRef(false);
  const initialTripRef = useRef(trip);
  const currentTripRef = useRef(trip);
  const recoveredDraftScopeRef = useRef(null);
  currentTripRef.current = trip;

  const canSave = isTripSavable(trip);
  const persistence = useTripAutoPersistence({ trip, stageTrip, getTripPersistenceState, canRemoteSync: canSave });

  useEffect(() => {
    if (auth.loading) return undefined;
    const scope = auth.user?.uid || 'anonymous';
    if (recoveredDraftScopeRef.current === scope) return undefined;
    recoveredDraftScopeRef.current = scope;
    let cancelled = false;

    Promise.resolve(getActiveTripDraft()).then((draft) => {
      if (cancelled || !draft) return;
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

  const {
    tripNamePromptOpen,
    tripNameDraft,
    setTripNameDraft,
    closeTripNamePrompt,
    handleSave,
  } = useTripSaveFlow({
    trip,
    renameTrip,
    stageTrip,
    saveTrip,
    persistence,
    showToast,
    t,
  });

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
      itineraryPanels.close();
    } catch {
      showToast(t('openTripError'), 3000);
    }
  }, [getTrip, itineraryPanels, loadTrip, showToast, t]);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  useSaveShortcut(handleSave);
  useOutsideClick(menuWrapRef, openMenu === 'account', closeMenu);
  useOutsideClick(editorMenuRef, openMenu === 'workspace', closeMenu);

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
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      handleSave={handleSave}
      tripNamePromptOpen={tripNamePromptOpen}
      tripNameDraft={tripNameDraft}
      setTripNameDraft={setTripNameDraft}
      closeTripNamePrompt={closeTripNamePrompt}
      tripNameMaxLength={TRIP_LIMITS.tripName}
      authUser={auth.user}
      authLoading={auth.loading}
      onGoogleSignIn={handleGoogleSignIn}
      onSignOut={handleSignOut}
      onImportLocalTrips={handleImportLocalTrips}
    />
  );

  const tripHeader = (
    <TripSummaryHeader
      trip={trip}
      navigation={{ activeTab, setActiveTab, routeCount: editorState.places?.length || 0, checklistProgress: editorState.checklist?.length ? `${editorState.doneCount}/${editorState.checklist.length}` : '' }}
      setCurrency={setCurrency}
      locale={locale}
      setLocale={setLocale}
      availableLocales={availableLocales}
      total={editorState.total}
      hasCosts={editorState.hasCosts}
      breakdown={editorState.breakdown}
      showBreakdown={editorState.showBreakdown}
      setShowBreakdown={editorState.setShowBreakdown}
      t={t}
      intlLocale={intlLocale}
    />
  );

  const editorModule = (
    <AppEditorModule
      tripStore={tripStore}
      savedTrips={savedTrips}
      editorState={editorState}
      itineraryPanels={itineraryPanels}
      activeTab={activeTab}
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      editorMenuRef={editorMenuRef}
      setTripToDelete={setTripToDelete}
      handleOpenSavedTrip={handleOpenSavedTrip}
      t={t}
      intlLocale={intlLocale}
    />
  );

  const mapPane = (
    <AppMapPane
      trip={trip}
      mapView={activeTab === 'places' ? 'places' : 'segments'}
      itineraryPanels={itineraryPanels}
      updateSegment={updateSegment}
      updateExpenses={updateExpenses}
      updateOriginDetails={updateOriginDetails}
      updateOriginExpenses={updateOriginExpenses}
      addPlace={addPlace}
      intlLocale={intlLocale}
      persistenceState={persistence.state}
      toast={toast}
      t={t}
    />
  );

  return (
    <div className="app">
      {topbar}
      {tripHeader}
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
