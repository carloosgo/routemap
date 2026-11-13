import { TripPlacesDayFirstPanel } from '../modules/places/TripPlacesDayFirstPanel.jsx';
import { TripPlacesDayFirstPanelClassic } from '../modules/places/TripPlacesDayFirstPanelClassic.jsx';
import { useIsMobileViewport } from '../modules/trips/MobileCityList.jsx';
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
  handleSave,
  showToast,
  placesFocus,
  persistenceState = 'saved',
  t,
  intlLocale,
}) {
  const isMobileViewport = useIsMobileViewport();
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
    updateOrigin,
    updatePlace,
    removePlace,
    reorderPlace,
    movePlaceToDay,
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

  // Web conserva la lista de días por ciudad; los días en cuadros son solo móvil.
  const PlacesPanel = isMobileViewport ? TripPlacesDayFirstPanel : TripPlacesDayFirstPanelClassic;
  const editorPane = activeTab === 'places' ? (
    <PlacesPanel
      tripId={trip.id}
      segments={trip.segments}
      places={places}
      routes={trip.routeConnections || []}
      toggleSegmentNote={itineraryPanels.toggleNote}
      updatePlace={updatePlace}
      removePlace={removePlace}
      reorderPlace={reorderPlace}
      movePlaceToDay={movePlaceToDay}
      upsertRoute={upsertRouteConnection}
      removeRoute={removeRouteConnection}
      setRouteVisibility={setRouteConnectionVisibility}
      setAllRouteVisibility={setAllRouteConnectionsVisibility}
      openDay={placesFocus?.focus.day}
      setOpenDay={placesFocus?.setOpenDay}
      selectedPlaceId={placesFocus?.focus.placeId}
      selectPlace={placesFocus?.selectPlace}
      persistenceState={persistenceState}
      t={t}
      intlLocale={intlLocale}
    />
  ) : (
    <AppEditorPane
      activeTab={activeTab}
      trip={trip}
      intlLocale={intlLocale}
      updateSegment={updateSegment}
      updateOrigin={updateOrigin}
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
        handleSave={handleSave}
        showToast={showToast}
        intlLocale={intlLocale}
        t={t}
      />
      {editorPane}
    </div>
  );
}
