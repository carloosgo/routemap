import { useCallback, useRef, useState } from 'react';
import { IconMap, IconNotes } from '@tabler/icons-react';
import { useTranslation } from './i18n/index.jsx';
import { useTrip } from './modules/trips/useTrip.js';
import { useSavedTrips } from './modules/trips/useSavedTrips.js';
import { ResizablePanes } from './components/ResizableSplit.jsx';
import { isTripSavable, routeStops, tripTotal } from './modules/trips/tripModel.js';
import { tripBreakdown } from './modules/expenses/expenseModel.js';
import { AppTopbar } from './app/AppTopbar.jsx';
import { AppEditorPane } from './app/AppEditorPane.jsx';
import { AppMapPane } from './app/AppMapPane.jsx';
import {
  useCollapseSegmentsOnTripChange,
  useOutsideClick,
  useSaveShortcut,
} from './app/useAppInteractions.js';
import './App.css';

export default function App() {
  const { t, locale, setLocale, availableLocales } = useTranslation();
  const {
    trip,
    resetTrip,
    loadTrip,
    renameTrip,
    setCurrency,
    addNote,
    updateNote,
    removeNote,
    addChecklistItem,
    toggleChecklistItem,
    removeChecklistItem,
    addSegment,
    removeSegment,
    reorderSegment,
    moveSegment,
    updateSegment,
    updateExpenses,
  } = useTrip();

  const { trips, loading, saveTrip, deleteTrip } = useSavedTrips();
  const [toast, setToast] = useState('');
  const [mobileView, setMobileView] = useState('form');
  const [activeTab, setActiveTab] = useState('segments');
  const [expandedSegments, setExpandedSegments] = useState({});
  const [newItemText, setNewItemText] = useState('');
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [openNoteSegmentId, setOpenNoteSegmentId] = useState(null);
  const newItemRef = useRef(null);
  const menuWrapRef = useRef(null);
  const segmentNoteRef = useRef(null);

  const intlLocale = locale === 'es' ? 'es-MX' : 'en-US';
  const canSave = isTripSavable(trip);
  const total = tripTotal(trip);
  const hasCosts = total > 0;
  const breakdown = tripBreakdown(trip.segments);
  const stops = routeStops(trip.segments, { dedupeCountry: true });
  const checklist = trip.checklist || [];
  const doneCount = checklist.filter((item) => item.done).length;
  const notes = trip.notes || [];

  const handleSave = useCallback(async () => {
    if (!isTripSavable(trip)) {
      setToast(t('saveValidationError'));
      setTimeout(() => setToast(''), 2500);
      return;
    }
    await saveTrip(trip);
    setToast(t('saved'));
    setTimeout(() => setToast(''), 2000);
  }, [saveTrip, trip, t]);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const closeSegmentNote = useCallback(() => setOpenNoteSegmentId(null), []);

  useSaveShortcut(handleSave);
  useOutsideClick(menuWrapRef, Boolean(openMenu), closeMenu);
  useOutsideClick(segmentNoteRef, Boolean(openNoteSegmentId), closeSegmentNote);
  useCollapseSegmentsOnTripChange(trip.id, trip.segments, setExpandedSegments);

  function isExpanded(id) {
    return expandedSegments[id] !== false;
  }

  function toggleSegment(id) {
    setExpandedSegments((previous) => ({
      ...previous,
      [id]: previous[id] === false,
    }));
  }

  function handleAddItem(event) {
    event.preventDefault();
    const text = newItemText.trim();
    if (!text) return;
    addChecklistItem(text);
    setNewItemText('');
    newItemRef.current?.focus();
  }

  const topbar = (
    <AppTopbar
      menuWrapRef={menuWrapRef}
      t={t}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      checklist={checklist}
      doneCount={doneCount}
      trip={trip}
      renameTrip={renameTrip}
      resetTrip={resetTrip}
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      trips={trips}
      loading={loading}
      loadTrip={loadTrip}
      deleteTrip={deleteTrip}
      intlLocale={intlLocale}
      setCurrency={setCurrency}
      locale={locale}
      availableLocales={availableLocales}
      setLocale={setLocale}
      handleSave={handleSave}
      canSave={canSave}
    />
  );

  const editorPane = (
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
      moveSegment={moveSegment}
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

  const mapPane = (
    <AppMapPane
      trip={trip}
      openNoteSegmentId={openNoteSegmentId}
      setOpenNoteSegmentId={setOpenNoteSegmentId}
      segmentNoteRef={segmentNoteRef}
      updateSegment={updateSegment}
      stops={stops}
      toast={toast}
      t={t}
    />
  );

  return (
    <div className="app">
      {topbar}
      <main className="workspace">
        <div className="workspace__desktop">
          <ResizablePanes left={editorPane} right={mapPane} />
        </div>
        <div className="workspace__mobile">
          <div className={'mobilepane' + (mobileView === 'form' ? ' is-active' : '')}>
            {editorPane}
          </div>
          <div className={'mobilepane' + (mobileView === 'map' ? ' is-active' : '')}>
            {mapPane}
          </div>
          <nav className="mobiletabs">
            <button
              type="button"
              className={'mobiletabs__btn' + (mobileView === 'form' ? ' is-active' : '')}
              onClick={() => setMobileView('form')}
            >
              <IconNotes size={16} aria-hidden="true" /> {t('segments')}
            </button>
            <button
              type="button"
              className={'mobiletabs__btn' + (mobileView === 'map' ? ' is-active' : '')}
              onClick={() => setMobileView('map')}
            >
              <IconMap size={16} aria-hidden="true" /> {t('map')}
            </button>
          </nav>
        </div>
      </main>
    </div>
  );
}
