import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from './i18n/index.jsx';
import { useTrip } from './modules/trips/useTrip.js';
import { useSavedTrips } from './modules/trips/useSavedTrips.js';
import { useTripAutoPersistence } from './modules/trips/useTripAutoPersistence.js';
import { savedTripErrorTranslationKey } from './modules/trips/savedTripOperations.js';
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
import './app/ItinerarySidebar.css';

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
  } = savedTrips;
  const [activeTab, setActiveTab] = useState('segments');
  const [openMenu, setOpenMenu] = useState(null);
  const [editorOpen, setEditorOpen] = useState(true);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [tripToDelete, setTripToDelete] = useState(null);
  const [openNoteSegmentId, setOpenNoteSegmentId] = useState(null);
  const editorMenuRef = useRef(null);
  const placeSelectionRef = useRef(null);

  useTripAutoPersistence({
    trip,
    authUser: auth.user,
    persistenceState: getTripPersistenceState(trip.id),
    stageTrip,
  });

  useOutsideClick(editorMenuRef, () => setOpenMenu(null));
  useOutsideClickSelector('.topbar__right', () => setOpenMenu(null));
  useSaveShortcut(() => {
    if (auth.user && isTripSavable(trip)) saveTrip(trip);
  });

  useEffect(() => {
    if (activeTab === 'places') {
      setEditorOpen(true);
      setPanelCollapsed(false);
    }
  }, [activeTab]);

  const handleOpenSavedTrip = useCallback(async (tripId) => {
    setOpenMenu(null);
    try {
      const savedTrip = await getTrip(tripId);
      if (!savedTrip) {
        window.dispatchEvent(new CustomEvent('atlas:toast', {
          detail: { message: t('savedTripMissing'), duration: 3000 },
        }));
        return;
      }
      loadTrip(savedTrip);
    } catch (error) {
      console.error(error);
      window.dispatchEvent(new CustomEvent('atlas:toast', {
        detail: { message: t('openTripError'), duration: 3000 },
      }));
    }
  }, [getTrip, loadTrip, t]);

  const handleTripDelete = useCallback(async () => {
    if (!tripToDelete) return;
    await deleteTrip(tripToDelete.id);
    if (tripToDelete.id === trip.id) {
      const draft = await getActiveTripDraft();
      if (draft) loadTrip(draft);
    }
    setTripToDelete(null);
  }, [deleteTrip, getActiveTripDraft, loadTrip, trip.id, tripToDelete]);

  const handleMapPlaceSelected = useCallback((place) => {
    placeSelectionRef.current = place;
    addPlace(place);
  }, [addPlace]);

  const handleMapSegmentSelected = useCallback((segmentId) => {
    editorState.expandSegment(segmentId);
    setActiveTab('segments');
    setEditorOpen(true);
    setPanelCollapsed(false);
  }, [editorState]);

  const editorModule = (
    <AppEditorModule
      tripStore={tripStore}
      savedTrips={savedTrips.trips}
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
      activeTab={activeTab}
      intlLocale={intlLocale}
      onPlaceSelected={handleMapPlaceSelected}
      onSegmentSelected={handleMapSegmentSelected}
    />
  );

  return (
    <div className="app-shell">
      <AppTopbar
        trip={trip}
        renameTrip={renameTrip}
        auth={auth}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        t={t}
      />

      <AppWorkspace
        mapPane={mapPane}
        editorModule={editorModule}
        editorOpen={editorOpen}
        setEditorOpen={setEditorOpen}
        panelCollapsed={panelCollapsed}
        setPanelCollapsed={setPanelCollapsed}
        t={t}
      />

      <TripDeleteDialog
        trip={tripToDelete}
        onConfirm={handleTripDelete}
        onCancel={() => setTripToDelete(null)}
        t={t}
      />

      {openNoteSegmentId && (
        <div className="modal-shell" role="presentation">
          <button
            type="button"
            className="modal-shell__backdrop"
            aria-label={t('close')}
            onClick={() => setOpenNoteSegmentId(null)}
          />
          <section className="modal-shell__panel" role="dialog" aria-modal="true">
            <button
              type="button"
              className="modal-shell__close"
              aria-label={t('close')}
              onClick={() => setOpenNoteSegmentId(null)}
            >
              ×
            </button>
            <textarea
              className="input"
              value={trip.segments.find((segment) => segment.id === openNoteSegmentId)?.note || ''}
              onChange={(event) => updateSegment(openNoteSegmentId, { note: event.target.value })}
              placeholder={t('segmentNotePlaceholder')}
            />
          </section>
        </div>
      )}
    </div>
  );
}
