import { useCallback, useRef, useState } from 'react';
import { useTranslation } from './i18n/index.jsx';
import { useTrip } from './modules/trips/useTrip.js';
import { useSavedTrips } from './modules/trips/useSavedTrips.js';
import { useFirebaseAuth } from './infrastructure/firebase/useFirebaseAuth.js';
import { isTripSavable } from './modules/trips/tripModel.js';
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

export default function App() {
  const { t, locale, intlLocale, setLocale, availableLocales } = useTranslation();
  const auth = useFirebaseAuth();
  const tripStore = useTrip();
  const savedTrips = useSavedTrips(auth.user);
  const editorState = useAppEditorState(tripStore);
  const { trip, loadTrip, renameTrip, updateSegment, addPlace } = tripStore;
  const {
    getTrip,
    saveTrip,
    deleteTrip,
    importLocalTrips,
    getLocalTripCount,
  } = savedTrips;

  const [toast, setToast] = useState('');
  const [mobileView, setMobileView] = useState('form');
  const [activeTab, setActiveTab] = useState('segments');
  const [tripToDelete, setTripToDelete] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [openNoteSegmentId, setOpenNoteSegmentId] = useState(null);
  const menuWrapRef = useRef(null);
  const editorMenuRef = useRef(null);

  const canSave = isTripSavable(trip);

  const showToast = useCallback((message, duration = 2200) => {
    setToast(message);
    setTimeout(() => setToast(''), duration);
  }, []);

  const handleSave = useCallback(async () => {
    if (!isTripSavable(trip)) {
      showToast(t('saveValidationError'), 2500);
      return;
    }
    await saveTrip(trip);
    showToast(t('saved'));
  }, [saveTrip, showToast, trip, t]);

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
    if (!tripToDelete) return;
    await deleteTrip(tripToDelete.id);
    setTripToDelete(null);
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
        t={t}
      />
      <TripDeleteDialog
        tripToDelete={tripToDelete}
        setTripToDelete={setTripToDelete}
        onConfirm={confirmRemoveTrip}
        t={t}
      />
    </div>
  );
}
