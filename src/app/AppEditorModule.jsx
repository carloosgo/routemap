import { IconMap, IconNotes } from '@tabler/icons-react';
import { TripPlacesPanel } from '../modules/places/TripPlacesPanel.jsx';
import { AppEditorPane } from './AppEditorPane.jsx';
import { AppWorkspaceMenu } from './AppWorkspaceMenu.jsx';
import lugaresIcon from '../assets/lugares-storefront-v2.svg';
import './ItineraryTimeline.css';

export function AppEditorModule({
  tripStore,
  savedTrips,
  editorState,
  activeTab,
  setActiveTab,
  openMenu,
  setOpenMenu,
  editorMenuRef,
  setOpenNoteSegmentId,
  setTripToDelete,
  handleOpenSavedTrip,
  t,
  locale,
  setLocale,
  availableLocales,
  intlLocale,
}) {
  const {
    trip,
    addNote,
    updateNote,
    removeNote,
    toggleChecklistItem,
    removeChecklistItem,
    addSegment,
    removeSegment,
    reorderSegment,
    updateSegment,
    updateSegmentDestination,
    updateExpenses,
    removePlace,
    reorderPlace,
    upsertRouteConnection,
    removeRouteConnection,
    setRouteConnectionVisibility,
    setAllRouteConnectionsVisibility,
  } = tripStore;
  const {
    total,
    hasCosts,
    breakdown,
    checklist,
    doneCount,
    notes,
    places,
    confirmDeleteNote,
    setConfirmDeleteNote,
    showBreakdown,
    setShowBreakdown,
    isExpanded,
    toggleSegment,
    handleAddItem,
    newItemRef,
    newItemText,
    setNewItemText,
  } = editorState;

  const editorPane = activeTab === 'places' ? (
    <TripPlacesPanel
      places={places}
      routes={trip.routeConnections || []}
      removePlace={removePlace}
      reorderPlace={reorderPlace}
      upsertRoute={upsertRouteConnection}
      removeRoute={removeRouteConnection}
      setRouteVisibility={setRouteConnectionVisibility}
      setAllRouteVisibility={setAllRouteConnectionsVisibility}
      t={t}
      intlLocale={intlLocale}
    />
  ) : (
    <AppEditorPane
      activeTab={activeTab}
      trip={trip}
      intlLocale={intlLocale}
      isExpanded={isExpanded}
      toggleSegment={toggleSegment}
      updateSegment={updateSegment}
      updateSegmentDestination={updateSegmentDestination}
      updateExpenses={updateExpenses}
      removeSegment={removeSegment}
      reorderSegment={reorderSegment}
      setOpenNoteSegmentId={setOpenNoteSegmentId}
      addSegment={addSegment}
      t={t}
      total={total}
      hasCosts={hasCosts}
      showBreakdown={showBreakdown}
      setShowBreakdown={setShowBreakdown}
      breakdown={breakdown}
      notes={notes}
      confirmDeleteNote={confirmDeleteNote}
      setConfirmDeleteNote={setConfirmDeleteNote}
      updateNote={updateNote}
      removeNote={removeNote}
      addNote={addNote}
      checklist={checklist}
      doneCount={doneCount}
      toggleChecklistItem={toggleChecklistItem}
      removeChecklistItem={removeChecklistItem}
      handleAddItem={handleAddItem}
      newItemRef={newItemRef}
      newItemText={newItemText}
      setNewItemText={setNewItemText}
    />
  );

  return (
    <div className="editor-module editor-module--rail" ref={editorMenuRef}>
      <nav className="editor-rail" aria-label={t('itinerary')}>
        <div className="editor-rail__primary">
          <button
            type="button"
            className={'editor-rail__item editor-module__nav-tab' +
              (activeTab === 'segments' ? ' is-active' : '')}
            onClick={() => setActiveTab('segments')}
          >
            <span className="editor-rail__icon editor-rail__icon--itinerary" aria-hidden="true">
              <IconMap />
            </span>
            <span className="editor-rail__label">{t('itinerary')}</span>
          </button>
          <button
            type="button"
            className={'editor-rail__item editor-module__nav-tab' +
              (activeTab === 'places' ? ' is-active' : '')}
            onClick={() => setActiveTab('places')}
            data-tab-icon="places-map-pin"
          >
            <span className="editor-rail__icon" aria-hidden="true">
              <img src={lugaresIcon} alt="" />
            </span>
            <span className="editor-rail__label">{t('myRoutes')}</span>
            {places.length > 0 && <span className="editor-rail__badge">{places.length}</span>}
          </button>
          <button
            type="button"
            className={'editor-rail__item editor-module__nav-tab' +
              (activeTab === 'notes' ? ' is-active' : '')}
            onClick={() => setActiveTab('notes')}
            data-tab-icon="notes"
          >
            <span className="editor-rail__icon editor-rail__icon--notes" aria-hidden="true">
              <IconNotes />
            </span>
            <span className="editor-rail__label">{t('notes')}</span>
            {checklist.length > 0 && (
              <span className="editor-rail__badge">
                {doneCount}/{checklist.length}
              </span>
            )}
          </button>
        </div>

        <AppWorkspaceMenu
          tripStore={tripStore}
          savedTrips={savedTrips}
          openMenu={openMenu}
          setOpenMenu={setOpenMenu}
          handleOpenSavedTrip={handleOpenSavedTrip}
          setTripToDelete={setTripToDelete}
          intlLocale={intlLocale}
          locale={locale}
          setLocale={setLocale}
          availableLocales={availableLocales}
          t={t}
          rail
        />
      </nav>

      <div className="editor-module__content">{editorPane}</div>
    </div>
  );
}
