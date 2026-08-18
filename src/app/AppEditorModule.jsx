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
    <div className="editor-module editor-module--sidebar" ref={editorMenuRef}>
      <nav className="editor-sidebar" aria-label={t('itinerary')}>
        <button
          type="button"
          className={'editor-sidebar__item' +
            (activeTab === 'segments' ? ' is-active' : '')}
          onClick={() => setActiveTab('segments')}
          aria-current={activeTab === 'segments' ? 'page' : undefined}
        >
          <span className="editor-sidebar__icon" aria-hidden="true">
            <img src="/icons/tramos.svg" alt="" />
          </span>
          <span className="editor-sidebar__label">{t('itinerary')}</span>
        </button>

        <button
          type="button"
          className={'editor-sidebar__item' +
            (activeTab === 'places' ? ' is-active' : '')}
          onClick={() => setActiveTab('places')}
          aria-current={activeTab === 'places' ? 'page' : undefined}
        >
          <span className="editor-sidebar__icon" aria-hidden="true">
            <img src={lugaresIcon} alt="" />
          </span>
          <span className="editor-sidebar__label">{t('myRoutes')}</span>
          {places.length > 0 && (
            <span className="editor-sidebar__badge">{places.length}</span>
          )}
        </button>

        <button
          type="button"
          className={'editor-sidebar__item' +
            (activeTab === 'notes' ? ' is-active' : '')}
          onClick={() => setActiveTab('notes')}
          aria-current={activeTab === 'notes' ? 'page' : undefined}
        >
          <span className="editor-sidebar__icon" aria-hidden="true">
            <img src="/icons/notas.svg" alt="" />
          </span>
          <span className="editor-sidebar__label">{t('notes')}</span>
          {checklist.length > 0 && (
            <span className="editor-sidebar__badge">
              {doneCount}/{checklist.length}
            </span>
          )}
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
      </nav>

      <div className="editor-module__content">{editorPane}</div>
    </div>
  );
}
