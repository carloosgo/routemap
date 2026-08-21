import { TripPlacesPanel } from '../modules/places/TripPlacesPanel.jsx';
import { AppEditorPane } from './AppEditorPane.jsx';
import { AppWorkspaceMenu } from './AppWorkspaceMenu.jsx';

export function AppEditorModule({
  tripStore,
  savedTrips,
  editorState,
  activeTab,
  openMenu,
  setOpenMenu,
  editorMenuRef,
  toggleNoteTarget,
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
    updateExpenses,
    updateOriginDetails,
    updateOriginExpenses,
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
      updateExpenses={updateExpenses}
      updateOriginDetails={updateOriginDetails}
      updateOriginExpenses={updateOriginExpenses}
      removeSegment={removeSegment}
      reorderSegment={reorderSegment}
      toggleNoteTarget={toggleNoteTarget}
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
