import { TripPlacesPanel } from '../modules/places/TripPlacesPanel.jsx';
import { AppEditorPane } from './AppEditorPane.jsx';
import { AppWorkspaceMenu } from './AppWorkspaceMenu.jsx';

export function AppEditorModule({
  tripStore,
  savedTrips,
  editorState,
  itineraryPanels,
  activeTab,
  openMenu,
  setOpenMenu,
  editorMenuRef,
  setTripToDelete,
  handleOpenSavedTrip,
  persistenceState = 'saved',
  t,
  intlLocale,
}) {
  const {
    trip,
    addNote,
    updateNote,
    removeNote,
    toggleChecklistItem,
    removeChecklistItem,
    removeSegment,
    reorderSegment,
    updatePlace,
    removePlace,
    reorderPlace,
    movePlaceToDay,
    upsertRouteConnection,
    setRouteConnectionVisibility,
    setAllRouteConnectionsVisibility,
  } = tripStore;
  const {
    checklist,
    doneCount,
    notes,
    places,
    confirmDeleteNote,
    setConfirmDeleteNote,
    handleAddItem,
    newItemRef,
    newItemText,
    setNewItemText,
  } = editorState;

  const hasRouteContent = Boolean(
    places?.length
    || trip.segments?.some((segment) => segment?.destination?.name)
  );

  const routesPane = hasRouteContent ? (
    <TripPlacesPanel
      trip={trip}
      segments={trip.segments}
      places={places}
      routes={trip.routeConnections || []}
      removeSegment={removeSegment}
      reorderSegment={reorderSegment}
      toggleSegmentNote={itineraryPanels.toggleNote}
      toggleSegmentDetails={itineraryPanels.toggleDetails}
      updatePlace={updatePlace}
      removePlace={removePlace}
      reorderPlace={reorderPlace}
      movePlaceToDay={movePlaceToDay}
      upsertRoute={upsertRouteConnection}
      setRouteVisibility={setRouteConnectionVisibility}
      setAllRouteVisibility={setAllRouteConnectionsVisibility}
      persistenceState={persistenceState}
      t={t}
      intlLocale={intlLocale}
    />
  ) : (
    <div
      className="trip-places trip-places--unified trip-places--empty-trip"
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '300px',
          color: '#596579',
          fontSize: '20px',
          fontWeight: 650,
          lineHeight: 1.35,
        }}
      >
        {t('emptyRoutesPrompt')}
      </div>
    </div>
  );

  const notesPane = (
    <AppEditorPane
      t={t}
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
    <div className="editor-module" ref={editorMenuRef}>
      <style>{`
        .editor-module .trip-city__pending-hint { display: none; }
        .editor-module .trip-place__delete svg { display: none; }
        .editor-module .trip-place__delete::before {
          content: '×';
          display: block;
          font-size: 18px;
          font-weight: 400;
          line-height: 1;
        }
      `}</style>
      <AppWorkspaceMenu
        tripStore={tripStore}
        savedTrips={savedTrips}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        handleOpenSavedTrip={handleOpenSavedTrip}
        setTripToDelete={setTripToDelete}
        intlLocale={intlLocale}
        t={t}
      />
      <div style={{ display: activeTab !== 'notes' ? 'contents' : 'none' }}>
        {routesPane}
      </div>
      <div style={{ display: activeTab === 'notes' ? 'contents' : 'none' }}>
        {notesPane}
      </div>
    </div>
  );
}
