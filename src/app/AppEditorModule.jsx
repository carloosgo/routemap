import { IconMap, IconNotes } from '@tabler/icons-react';
import { TripPlacesPanel } from '../modules/places/TripPlacesPanel.jsx';
import { AppEditorPane } from './AppEditorPane.jsx';
import { AppWorkspaceMenu } from './AppWorkspaceMenu.jsx';
import lugaresIcon from '../assets/lugares-storefront-v2.svg';

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

  const routeCount = Array.isArray(places) ? places.length : 0;
  const checklistCount = Array.isArray(checklist) ? checklist.length : 0;
  const checklistProgress = checklistCount ? `${doneCount}/${checklistCount}` : '';

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
    <div className="editor-module" ref={editorMenuRef}>
      <div className="editor-module__tabs" role="tablist" aria-orientation="vertical">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'segments'}
          className={'editor-module__tab editor-module__nav-tab' +
            (activeTab === 'segments' ? ' is-active' : '')}
          onClick={() => setActiveTab('segments')}
        >
          <span className="editor-module__tab-icon" aria-hidden="true">
            <IconMap />
          </span>
          <span className="editor-module__tab-label">{t('itinerary')}</span>
          <span className="editor-module__tab-count" aria-hidden="true" />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'places'}
          className={'editor-module__tab editor-module__nav-tab' +
            (activeTab === 'places' ? ' is-active' : '')}
          onClick={() => setActiveTab('places')}
          data-tab-icon="places-map-pin"
        >
          <span className="editor-module__tab-icon" aria-hidden="true">
            <img src={lugaresIcon} alt="" />
          </span>
          <span className="editor-module__tab-label">{t('myRoutes')}</span>
          <span className="editor-module__tab-count">
            {routeCount > 0 && (
              <span className="tabbar__badge" aria-label={String(routeCount)}>
                {routeCount}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notes'}
          className={'editor-module__tab editor-module__nav-tab' +
            (activeTab === 'notes' ? ' is-active' : '')}
          onClick={() => setActiveTab('notes')}
          data-tab-icon="notes"
        >
          <span className="editor-module__tab-icon" aria-hidden="true">
            <IconNotes />
          </span>
          <span className="editor-module__tab-label">{t('notes')}</span>
          <span className="editor-module__tab-count">
            {checklistCount > 0 && (
              <span className="tabbar__badge" aria-label={checklistProgress}>
                {checklistProgress}
              </span>
            )}
          </span>
        </button>

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
        />
      </div>
      {editorPane}
    </div>
  );
}
