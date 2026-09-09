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
    updateTripDates,
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

  const showRoutes = activeTab !== 'notes';
  const showNotes = activeTab === 'notes';

  const routesPane = (
    <TripPlacesPanel
      trip={trip}
      segments={trip.segments}
      places={places}
      routes={trip.routeConnections || []}
      updateTripDates={updateTripDates}
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

  const paneStyle = {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  };

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
      <div style={showRoutes ? paneStyle : { display: 'none' }}>
        {routesPane}
      </div>
      <div style={showNotes ? paneStyle : { display: 'none' }}>
        {notesPane}
      </div>
    </div>
  );
}
