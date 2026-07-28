import { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconMap2,
  IconMenu2,
  IconX,
  IconDeviceFloppy,
  IconArrowRight,
  IconNotes,
  IconMap,
  IconChecklist,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useTranslation } from './i18n/index.jsx';
import { useTrip } from './modules/trips/useTrip.js';
import { useSavedTrips } from './modules/trips/useSavedTrips.js';
import { SegmentForm } from './modules/trips/SegmentForm.jsx';
import { SavedTrips } from './modules/trips/SavedTrips.jsx';
import { RouteMap } from './modules/map/RouteMap.jsx';
import { ResizablePanes } from './components/ResizableSplit.jsx';
import { tripTotal, isTripSavable, routeStops } from './modules/trips/tripModel.js';
import { formatMoney } from './shared/utils.js';
import { flagImageUrl } from './modules/flags/flags.js';
import './App.css';

const CURRENCIES = ['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'];
const MAX_NOTES = 2000;

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
    updateSegment,
    updateExpenses,
  } = useTrip();

  const { trips, loading, saveTrip, deleteTrip } = useSavedTrips();
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState('form');
  const [activeTab, setActiveTab] = useState('segments');
  const [expandedSegments, setExpandedSegments] = useState({});
  const [newItemText, setNewItemText] = useState('');
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(null);
  const newItemRef = useRef(null);

  const intlLocale = locale === 'es' ? 'es-MX' : 'en-US';
  const canSave = isTripSavable(trip);

  function isExpanded(id) {
    return expandedSegments[id] !== false;
  }

  function toggleSegment(id) {
    setExpandedSegments((prev) => ({ ...prev, [id]: !isExpanded(id) }));
  }

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

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  const prevTripIdRef = useRef(trip.id);
  if (prevTripIdRef.current !== trip.id) {
    prevTripIdRef.current = trip.id;
    const collapsed = {};
    (trip.segments || []).forEach((s) => {
      collapsed[s.id] = false;
    });
    setExpandedSegments(collapsed);
  }
  function handleAddItem(e) {
    e.preventDefault();
    const text = newItemText.trim();
    if (!text) return;
    addChecklistItem(text);
    setNewItemText('');
    newItemRef.current?.focus();
  }

  const total = tripTotal(trip);
  const hasCosts = total > 0;
  const stops = routeStops(trip.segments, { dedupeCountry: true });
  const checklist = trip.checklist || [];
  const doneCount = checklist.filter((i) => i.done).length;
  const notes = trip.notes || [];

  const editorPane = (
    <section className="editor">
      <header className="editor__bar">
        <button
          type="button"
          className="btn btn--icon editor__menu"
          aria-label="Menú"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSidebarOpen(true);
          }}
        >
          <IconMenu2 size={18} aria-hidden="true" />
        </button>
        <div className="editor__title">
          <input
            type="text"
            className="editor__name"
            value={trip.name}
            placeholder={t('tripNamePlaceholder')}
            onChange={(e) => renameTrip(e.target.value)}
            aria-label={t('tripName')}
          />
        </div>
        <div className="editor__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            <IconDeviceFloppy size={15} aria-hidden="true" /> {t('saveTrip')}
          </button>
        </div>
      </header>

      <div className="editor__tabs">
        <button
          type="button"
          className={'editor__tab' + (activeTab === 'segments' ? ' is-active' : '')}
          onClick={() => setActiveTab('segments')}
        >
          <IconMap size={14} aria-hidden="true" /> Tramos
        </button>
        <button
          type="button"
          className={'editor__tab' + (activeTab === 'notes' ? ' is-active' : '')}
          onClick={() => setActiveTab('notes')}
        >
          <IconNotes size={14} aria-hidden="true" /> Notas
          {checklist.length > 0 && (
            <span className="editor__tab-badge">
              {doneCount}/{checklist.length}
            </span>
          )}
        </button>
      </div>

      <div className="editor__body">
        {activeTab === 'segments' && (
          <>
            <div className="segments">
              {trip.segments.map((segment, index) => (
                <SegmentForm
                  key={segment.id}
                  segment={segment}
                  index={index}
                  currency={trip.currency}
                  locale={intlLocale}
                  expanded={isExpanded(segment.id)}
                  onToggle={() => toggleSegment(segment.id)}
                  onUpdate={(patch) => updateSegment(segment.id, patch)}
                  onUpdateExpenses={(expenses) => updateExpenses(segment.id, expenses)}
                  onRemove={() => removeSegment(segment.id)}
                />
              ))}
            </div>

            <button type="button" className="btn btn--add" onClick={addSegment}>
              + {t('addSegment')}
            </button>

            <div className="total">
              <div className="total__info">
                <span className="total__label">{t('grandTotal')}</span>
                <span className="total__meta">
                  {trip.segments.length} {trip.segments.length === 1 ? 'tramo' : 'tramos'}
                  {!hasCosts && ' · ' + t('noResults')}
                </span>
              </div>
              <span className="total__value">
                {formatMoney(total, trip.currency, intlLocale)}
              </span>
            </div>
          </>
        )}

        {activeTab === 'notes' && (
          <div className="notes-panel">
            {notes.map((note) => (
              <div key={note.id} className="notes-section">
                <div className="notes-section__header">
                  <input
                    type="text"
                    className="notes-title-input"
                    value={note.title}
                    maxLength={60}
                    onChange={(e) => updateNote(note.id, 'title', e.target.value)}
                    aria-label="Título de la nota"
                  />
                  {notes.length > 1 &&
                    (confirmDeleteNote === note.id ? (
                      <span className="notes-confirm-delete">
                        <span className="notes-confirm-delete__text">¿Eliminar?</span>
                        <button
                          type="button"
                          className="notes-confirm-delete__yes"
                          onClick={() => {
                            removeNote(note.id);
                            setConfirmDeleteNote(null);
                          }}
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          className="notes-confirm-delete__no"
                          onClick={() => setConfirmDeleteNote(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="notes-remove-btn"
                        aria-label="Eliminar nota"
                        onClick={() => setConfirmDeleteNote(note.id)}
                      >
                        <IconTrash size={13} aria-hidden="true" />
                      </button>
                    ))}
                </div>
                <textarea
                  className="notes-textarea"
                  maxLength={MAX_NOTES}
                  placeholder="Agrega notas, ideas, recordatorios o cualquier detalle…"
                  value={note.text}
                  onChange={(e) => updateNote(note.id, 'text', e.target.value)}
                />
                <div className="notes-section__footer">
                  <span className="notes-section__count">
                    {note.text.length} / {MAX_NOTES}
                  </span>
                </div>
              </div>
            ))}

            <button type="button" className="btn btn--add" onClick={addNote}>
              + Agregar nota
            </button>

            <div className="notes-section">
              <div className="notes-section__header">
                <span className="notes-section__title">
                  <IconChecklist size={13} aria-hidden="true" /> Pendientes
                </span>
                {checklist.length > 0 && (
                  <span className="notes-section__count">
                    {doneCount} de {checklist.length} completados
                  </span>
                )}
              </div>
              {checklist.length > 0 && (
                <ul className="checklist">
                  {checklist.map((item) => (
                    <li
                      key={item.id}
                      className={'checklist__item' + (item.done ? ' is-done' : '')}
                    >
                      <button
                        type="button"
                        className={'checklist__check' + (item.done ? ' is-done' : '')}
                        aria-label={item.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
                        onClick={() => toggleChecklistItem(item.id)}
                      >
                        {item.done && <IconX size={10} aria-hidden="true" />}
                      </button>
                      <span className="checklist__text">{item.text}</span>
                      <button
                        type="button"
                        className="checklist__remove"
                        aria-label="Eliminar"
                        onClick={() => removeChecklistItem(item.id)}
                      >
                        <IconTrash size={13} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="checklist__add" onSubmit={handleAddItem}>
                <input
                  ref={newItemRef}
                  type="text"
                  className="input checklist__input"
                  placeholder="Nuevo pendiente…"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn--icon checklist__submit"
                  aria-label="Agregar"
                >
                  <IconPlus size={16} aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </section>
  );

  const mapPane = (
    <section className="mappane">
      <RouteMap segments={trip.segments} />
      {stops.length > 0 && (
        <div className="routestrip">
          {stops.map((city, i) => (
            <span className="routestrip__item" key={`${city.lat}-${city.lon}-${i}`}>
              {city.countryCode ? (
                <img
                  className="flag"
                  src={flagImageUrl(city.countryCode, 20)}
                  alt={city.countryCode}
                  width={20}
                  height={14}
                  loading="lazy"
                />
              ) : (
                <span className="flag flag--empty" />
              )}
              {i < stops.length - 1 && (
                <IconArrowRight size={12} className="routestrip__arrow" aria-hidden="true" />
              )}
            </span>
          ))}
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </section>
  );

  return (
    <div className="app">
      <aside className={'sidebar' + (sidebarOpen ? ' is-open' : '')}>
        <header className="brand">
          <div className="brand__mark">
            <IconMap2 size={18} aria-hidden="true" />
          </div>
          <div>
            <h1 className="brand__name">{t('appName')}</h1>
            <p className="brand__tag">{t('appTagline')}</p>
          </div>
          <button
            type="button"
            className="btn btn--icon sidebar__close"
            aria-label="Cerrar menú"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSidebarOpen(false);
            }}
          >
            <IconX size={18} aria-hidden="true" />
          </button>
        </header>

        <button
          type="button"
          className="btn btn--new"
          onClick={() => {
            resetTrip();
            setSidebarOpen(false);
          }}
        >
          + {t('newTrip')}
        </button>

        <SavedTrips
          trips={trips}
          loading={loading}
          currentId={trip.id}
          onOpen={(tr) => {
            loadTrip(tr);
            setSidebarOpen(false);
          }}
          onDelete={deleteTrip}
        />

        <div className="sidebar__foot">
          <label className="mini">
            <span>{t('currency')}</span>
            <select
              className="mini__select"
              value={trip.currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="mini">
            <span>{t('language')}</span>
            <select
              className="mini__select"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              {availableLocales.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="sidebar__scrim"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSidebarOpen(false);
          }}
        />
      )}

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
              <IconMap size={16} aria-hidden="true" /> Mapa
            </button>
          </nav>
        </div>
      </main>
    </div>
  );
}
