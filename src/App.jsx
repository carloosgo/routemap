import { useCallback, useRef, useState } from 'react';
import {
  IconBookmark,
  IconChevronDown,
  IconDotsVertical,
  IconLanguage,
  IconMap,
  IconNotes,
  IconPlus,
  IconRoute,
  IconTrash,
} from '@tabler/icons-react';
import { useTranslation } from './i18n/index.jsx';
import { useTrip } from './modules/trips/useTrip.js';
import { useSavedTrips } from './modules/trips/useSavedTrips.js';
import { useFirebaseAuth } from './infrastructure/firebase/useFirebaseAuth.js';
import { isTripSavable, tripTotal } from './modules/trips/tripModel.js';
import { tripBreakdown } from './modules/expenses/expenseModel.js';
import { formatMoney } from './shared/utils.js';
import { AppTopbar } from './app/AppTopbar.jsx';
import { AppEditorPane } from './app/AppEditorPane.jsx';
import { AppMapPane } from './app/AppMapPane.jsx';
import { TripPlacesPanel } from './modules/places/TripPlacesPanel.jsx';
import lugaresIcon from './assets/lugares-storefront-v2.svg';
import currencyCoinIcon from './assets/currency-coin-menu.svg';
import {
  useCollapseSegmentsOnTripChange,
  useOutsideClick,
  useOutsideClickSelector,
  useSaveShortcut,
} from './app/useAppInteractions.js';
import './App.css';
import './app/FloatingEditor.css';

const CURRENCIES = ['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'];

export default function App() {
  const { t, locale, setLocale, availableLocales } = useTranslation();
  const auth = useFirebaseAuth();
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
    updateSegment,
    updateExpenses,
    addPlace,
    removePlace,
  } = useTrip();

  const {
    trips,
    loading,
    getTrip,
    saveTrip,
    deleteTrip,
    importLocalTrips,
    getLocalTripCount,
  } = useSavedTrips(auth.user);
  const [toast, setToast] = useState('');
  const [mobileView, setMobileView] = useState('form');
  const [activeTab, setActiveTab] = useState('segments');
  const [expandedSegments, setExpandedSegments] = useState({});
  const [newItemText, setNewItemText] = useState('');
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(null);
  const [tripToDelete, setTripToDelete] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [openNoteSegmentId, setOpenNoteSegmentId] = useState(null);
  const newItemRef = useRef(null);
  const menuWrapRef = useRef(null);
  const editorMenuRef = useRef(null);

  const intlLocale = locale === 'es' ? 'es-MX' : 'en-US';
  const canSave = isTripSavable(trip);
  const total = tripTotal(trip);
  const hasCosts = total > 0;
  const breakdown = tripBreakdown(trip.segments);
  const checklist = trip.checklist || [];
  const doneCount = checklist.filter((item) => item.done).length;
  const notes = trip.notes || [];
  const places = trip.places || [];

  const showToast = useCallback((message, duration = 2200) => {
    setToast(message);
    setTimeout(() => setToast(''), duration);
  }, []);

  const handleSave = useCallback(async () => {
    if (!isTripSavable(trip)) {
      showToast(t('saveValidationError'), 2500);
      return;
    }
    await saveTrip(trip);
    showToast(t('saved'));
  }, [saveTrip, showToast, trip, t]);

  const handleGoogleSignIn = useCallback(async () => {
    try {
      await auth.signInWithGoogle();
      setOpenMenu(null);
      showToast(t('signedIn'));
    } catch {
      showToast(t('signInError'), 3000);
    }
  }, [auth, showToast, t]);

  const handleSignOut = useCallback(async () => {
    await auth.signOutUser();
    setOpenMenu(null);
    showToast(t('signedOut'));
  }, [auth, showToast, t]);

  const handleImportLocalTrips = useCallback(async () => {
    const count = await getLocalTripCount();
    if (count === 0) {
      showToast(t('noLocalTrips'));
      return;
    }
    if (!globalThis.confirm(t('confirmImportLocalTrips'))) return;
    const imported = await importLocalTrips();
    setOpenMenu(null);
    showToast(`${t('importedTrips')}: ${imported}`);
  }, [getLocalTripCount, importLocalTrips, showToast, t]);

  const handleOpenSavedTrip = useCallback(async (savedTrip) => {
    try {
      const storedTrip = await getTrip(savedTrip.id);
      if (!storedTrip) {
        showToast('El viaje guardado ya no existe.', 3000);
        return;
      }
      loadTrip(storedTrip);
      setOpenMenu(null);
    } catch {
      showToast('No fue posible abrir el viaje.', 3000);
    }
  }, [getTrip, loadTrip, showToast]);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const closeSegmentNote = useCallback(() => setOpenNoteSegmentId(null), []);

  useSaveShortcut(handleSave);
  useOutsideClick(menuWrapRef, openMenu === 'account', closeMenu);
  useOutsideClick(
    editorMenuRef,
    openMenu === 'currency' || openMenu === 'workspace',
    closeMenu
  );
  useOutsideClickSelector('.segnote', Boolean(openNoteSegmentId), closeSegmentNote);
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

  async function confirmRemoveTrip() {
    if (!tripToDelete) return;
    await deleteTrip(tripToDelete.id);
    setTripToDelete(null);
  }

  const topbar = (
    <AppTopbar
      menuWrapRef={menuWrapRef}
      t={t}
      trip={trip}
      renameTrip={renameTrip}
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      handleSave={handleSave}
      canSave={canSave}
      authUser={auth.user}
      authLoading={auth.loading}
      onGoogleSignIn={handleGoogleSignIn}
      onSignOut={handleSignOut}
      onImportLocalTrips={handleImportLocalTrips}
    />
  );

  const editorPane = activeTab === 'places' ? (
    <TripPlacesPanel places={places} removePlace={removePlace} t={t} />
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

  const editorModule = (
    <div className="editor-module" ref={editorMenuRef}>
      <div className="editor-module__tabs">
        <button
          type="button"
          className={'editor-module__tab editor-module__nav-tab' +
            (activeTab === 'segments' ? ' is-active' : '')}
          onClick={() => setActiveTab('segments')}
        >
          <span className="editor-module__tab-icon" aria-hidden="true">
            <IconMap />
          </span>
          <span className="editor-module__tab-label">{t('segments')}</span>
        </button>
        <button
          type="button"
          className={'editor-module__tab editor-module__nav-tab' +
            (activeTab === 'places' ? ' is-active' : '')}
          onClick={() => setActiveTab('places')}
          data-tab-icon="places-map-pin"
        >
          <span className="editor-module__tab-icon" aria-hidden="true">
            <img src={lugaresIcon} alt="" />
          </span>
          <span className="editor-module__tab-label">{t('places')}</span>
          {places.length > 0 && <span className="tabbar__badge">{places.length}</span>}
        </button>
        <button
          type="button"
          className={'editor-module__tab editor-module__nav-tab' +
            (activeTab === 'notes' ? ' is-active' : '')}
          onClick={() => setActiveTab('notes')}
          data-tab-icon="notes"
        >
          <span className="editor-module__tab-icon" aria-hidden="true">
            <IconNotes />
          </span>
          <span className="editor-module__tab-label">{t('notes')}</span>
          {checklist.length > 0 && (
            <span className="tabbar__badge">
              {doneCount}/{checklist.length}
            </span>
          )}
        </button>

        <div className="editor-module__settings">
          <div className="editor-module__menu-anchor">
            <button
              type="button"
              className={'editor-module__tab editor-module__nav-tab' +
                (openMenu === 'currency' ? ' is-active' : '')}
              onClick={() => setOpenMenu(openMenu === 'currency' ? null : 'currency')}
            >
              <span className="editor-module__tab-icon" aria-hidden="true">
                <img className="editor-module__currency-icon" src={currencyCoinIcon} alt="" />
              </span>
              <span className="editor-module__tab-label">{trip.currency}</span>
              <IconChevronDown className="editor-module__tab-chevron" aria-hidden="true" />
            </button>
            {openMenu === 'currency' && (
              <div className="editor-module__currency-menu">
                {CURRENCIES.map((currency) => (
                  <button
                    type="button"
                    key={currency}
                    className={'editor-module__currency-option' +
                      (currency === trip.currency ? ' is-active' : '')}
                    onClick={() => {
                      setCurrency(currency);
                      setOpenMenu(null);
                    }}
                  >
                    {currency}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="editor-module__menu-anchor">
            <button
              type="button"
              className={'editor-module__more-button' +
                (openMenu === 'workspace' ? ' is-active' : '')}
              aria-label="Más opciones"
              onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}
            >
              <IconDotsVertical size={18} aria-hidden="true" />
            </button>

            {openMenu === 'workspace' && (
              <div className="editor-module__more-menu">
                <button
                  type="button"
                  className="editor-module__menu-item"
                  onClick={() => {
                    resetTrip();
                    setOpenMenu(null);
                  }}
                >
                  <IconPlus size={17} aria-hidden="true" />
                  <span>{t('newTrip')}</span>
                </button>

                <div className="editor-module__menu-separator" />

                <div className="editor-module__menu-heading">
                  <IconBookmark size={17} aria-hidden="true" />
                  <span>{t('savedTrips')}</span>
                </div>
                <div className="editor-module__saved-list">
                  {loading ? (
                    <div className="editor-module__menu-empty">…</div>
                  ) : trips.length === 0 ? (
                    <div className="editor-module__menu-empty">{t('noSavedTrips')}</div>
                  ) : (
                    trips.map((savedTrip) => {
                      const segmentCount = savedTrip.segmentCount ?? savedTrip.segments?.length ?? 0;
                      const savedTotal = savedTrip.total ?? tripTotal(savedTrip);
                      return (
                        <div
                          key={savedTrip.id}
                          className={'editor-module__saved-item' +
                            (savedTrip.id === trip.id ? ' is-current' : '')}
                        >
                          <button
                            type="button"
                            className="editor-module__saved-open"
                            onClick={() => handleOpenSavedTrip(savedTrip)}
                          >
                            <span className="editor-module__saved-name">
                              {savedTrip.name || t('unnamedTrip')}
                            </span>
                            <span className="editor-module__saved-meta">
                              {segmentCount}{' '}
                              {segmentCount === 1
                                ? t('segment').toLowerCase()
                                : t('segmentPlural')}
                              {' · '}
                              {formatMoney(savedTotal, savedTrip.currency, intlLocale)}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="editor-module__saved-delete"
                            aria-label={t('deleteTrip')}
                            onClick={() => setTripToDelete(savedTrip)}
                          >
                            <IconTrash size={14} aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="editor-module__menu-separator" />

                <div className="editor-module__menu-heading">
                  <IconLanguage size={17} aria-hidden="true" />
                  <span>{t('language')}</span>
                </div>
                <div className="editor-module__language-options">
                  {availableLocales.map((availableLocale) => (
                    <button
                      type="button"
                      key={availableLocale}
                      className={'editor-module__language-option' +
                        (availableLocale === locale ? ' is-active' : '')}
                      onClick={() => {
                        setLocale(availableLocale);
                        setOpenMenu(null);
                      }}
                    >
                      {availableLocale.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {editorPane}
    </div>
  );

  const mapPane = (
    <AppMapPane
      trip={trip}
      mapView={activeTab === 'places' ? 'places' : 'segments'}
      openNoteSegmentId={openNoteSegmentId}
      setOpenNoteSegmentId={setOpenNoteSegmentId}
      updateSegment={updateSegment}
      addPlace={addPlace}
      toast={toast}
      t={t}
    />
  );

  return (
    <div className="app">
      {topbar}
      <main className="workspace">
        <div className="workspace__desktop workspace__desktop--floating">
          {mapPane}
          <div className="floating-editor">{editorModule}</div>
        </div>
        <div className="workspace__mobile">
          <div className={'mobilepane' + (mobileView === 'form' ? ' is-active' : '')}>
            {editorModule}
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
              <IconRoute size={16} aria-hidden="true" /> {t('segments')}
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

      {tripToDelete && (
        <div className="confirm__scrim" role="presentation" onMouseDown={() => setTripToDelete(null)}>
          <div
            className="confirm__card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-trip-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 className="confirm__title" id="confirm-delete-trip-title">
              {t('deleteTrip')}
            </h3>
            <p className="confirm__message">
              {t('confirmDelete')}{' '}
              <strong>{tripToDelete.name || t('unnamedTrip')}</strong>
            </p>
            <div className="confirm__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setTripToDelete(null)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={confirmRemoveTrip}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
