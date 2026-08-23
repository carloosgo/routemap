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
    addSegment,
    removeSegment,
    reorderSegment,
    updateSegment,
    removePlace,
    reorderPlace,
    upsertRouteConnection,
    removeRouteConnection,
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
      updateSegment={updateSegment}
      removeSegment={removeSegment}
      reorderSegment={reorderSegment}
      toggleNoteTarget={itineraryPanels.toggleNote}
      toggleDetailsTarget={itineraryPanels.toggleDetails}
      addSegment={addSegment}
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
    <div
      className={'editor-module' + (activeTab === 'segments' ? ' editor-module--itinerary' : '')}
      ref={editorMenuRef}
    >
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
