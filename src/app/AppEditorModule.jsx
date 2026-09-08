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

  const editorPane = activeTab !== 'notes' ? (
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
      {editorPane}
    </div>
  );
}
