import { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconMap2,
  IconX,
  IconDeviceFloppy,
  IconArrowRight,
  IconNotes,
  IconMap,
  IconChecklist,
  IconPlus,
  IconTrash,
  IconBookmark,
  IconChevronDown,
  IconCoin,
  IconLanguage,
} from '@tabler/icons-react';
import { useTranslation } from './i18n/index.jsx';
import { useTrip } from './modules/trips/useTrip.js';
import { useSavedTrips } from './modules/trips/useSavedTrips.js';
import { SegmentForm } from './modules/trips/SegmentForm.jsx';
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
  const [mobileView, setMobileView] = useState('form');
  const [activeTab, setActiveTab] = useState('segments');
  const [expandedSegments, setExpandedSegments] = useState({});
  const [newItemText, setNewItemText] = useState('');
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(null);
  // Dropdown abierto en la barra superior: 'trips' | 'currency' | 'language' | null
  const [openMenu, setOpenMenu] = useState(null);
  const newItemRef = useRef(null);
  const menuWrapRef = useRef(null);

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

  // Cierra cualquier dropdown de la barra superior al hacer clic afuera.
  useEffect(() => {
    function onClickOutside(e) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    }
    if (openMenu) {
      document.addEventListener('mousedown', onClickOutside);
      return () => document.removeEventListener('mousedown', onClickOutside);
    }
  }, [openMenu]);

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

  // ===== Barra superior (marca + acciones + config) =====
  const topbar = (
    <header className="topbar" ref={menuWrapRef}>
      <div className="topbar__brand">
        <div className="topbar__brand-icon">
          <IconMap2 size={17} aria-hidden="true" />
        </div>
        <span className="topbar__brand-name">{t('appName')}</span>
      </div>

      <span className="topbar__sep" />

      <input
        type="text"
        className="topbar__title"
        value={trip.name}
        placeholder={t('tripNamePlaceholder')}
        onChange={(e) => renameTrip(e.target.value)}
        aria-label={t('tripName')}
      />

      <span className="topbar__sep" />

      <div className="topbar__tabs">
        <button
          type="button"
          className={'topbar__tab' + (activeTab === 'segments' ? ' is-active' : '')}
          onClick={() => setActiveTab('segments')}
        >
          <IconMap size={15} aria-hidden="true" /> Tramos
        </button>
        <button
          type="button"
          className={'topbar__tab' + (activeTab === 'notes' ? ' is-active' : '')}
          onClick={() => setActiveTab('notes')}
        >
          <IconNotes size={15} aria-hidden="true" /> Notas
          {checklist.length > 0 && (
            <span className="tabbar__badge">
              {doneCount}/{checklist.length}
            </span>
          )}
        </button>
      </div>

      <button type="button" className="topbar__save" onClick={handleSave} disabled={!canSave}>
        <IconDeviceFloppy size={15} aria-hidden="true" /> {t('saveTrip')}
      </button>

      <div className="topbar__spacer" />

      <button
        type="button"
        className="topitem topitem--accent"
        onClick={() => {
          resetTrip();
          setOpenMenu(null);
        }}
      >
        <IconPlus size={17} aria-hidden="true" /> {t('newTrip')}
      </button>

      <div className="topmenu">
        <button
          type="button"
          className="topitem"
          onClick={() => setOpenMenu(openMenu === 'trips' ? null : 'trips')}
        >
          <IconBookmark size={17} aria-hidden="true" /> Viajes guardados
          <IconChevronDown size={13} className="topitem__chev" aria-hidden="true" />
        </button>
        {openMenu === 'trips' && (
          <div className="dropdown dropdown--trips">
            <div className="dropdown__label">Viajes guardados</div>
            {loading ? (
              <div className="dropdown__empty">…</div>
            ) : trips.length === 0 ? (
              <div className="dropdown__empty">Sin viajes guardados</div>
            ) : (
              trips.map((tr) => (
                <div
                  key={tr.id}
                  className={'dropdown__trip' + (tr.id === trip.id ? ' is-current' : '')}
                >
                  <button
                    type="button"
                    className="dropdown__trip-open"
                    onClick={() => {
                      loadTrip(tr);
                      setOpenMenu(null);
                    }}
                  >
                    <span className="dropdown__trip-name">{tr.name || 'Sin nombre'}</span>
                    <span className="dropdown__trip-meta">
                      {tr.segments?.length || 0}{' '}
                      {tr.segments?.length === 1 ? 'tramo' : 'tramos'}
                      {' · '}
                      {formatMoney(tripTotal(tr), tr.currency, intlLocale)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="dropdown__trip-del"
                    aria-label="Eliminar viaje"
                    onClick={() => deleteTrip(tr.id)}
                  >
                    <IconTrash size={15} aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="topmenu">
        <button
          type="button"
          className="topitem"
          onClick={() => setOpenMenu(openMenu === 'currency' ? null : 'currency')}
        >
          <IconCoin size={17} aria-hidden="true" />
          <span className="topitem__val">{trip.currency}</span>
          <IconChevronDown size={13} className="topitem__chev" aria-hidden="true" />
        </button>
        {openMenu === 'currency' && (
          <div className="dropdown dropdown--mini">
            {CURRENCIES.map((c) => (
              <button
                type="button"
                key={c}
                className={'dropdown__opt' + (c === trip.currency ? ' is-active' : '')}
                onClick={() => {
                  setCurrency(c);
                  setOpenMenu(null);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="topmenu">
        <button
          type="button"
          className="topitem"
          onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
        >
          <IconLanguage size={17} aria-hidden="true" />
          <span className="topitem__val">{locale.toUpperCase()}</span>
          <IconChevronDown size={13} className="topitem__chev" aria-hidden="true" />
        </button>
        {openMenu === 'language' && (
          <div className="dropdown dropdown--mini">
            {availableLocales.map((l) => (
              <button
                type="button"
                key={l}
                className={'dropdown__opt' + (l === locale ? ' is-active' : '')}
                onClick={() => {
                  setLocale(l);
                  setOpenMenu(null);
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );

  // ===== Panel editor (tramos / notas) =====
  const editorPane = (
    <section className="editor">
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

  // ===== Panel mapa =====
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
              <IconMap size={16} aria-hidden="true" /> Mapa
            </button>
          </nav>
        </div>
      </main>
    </div>
  );
}
