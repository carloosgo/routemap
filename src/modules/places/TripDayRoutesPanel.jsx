import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconExternalLink,
  IconGripVertical,
  IconMapPin,
  IconNote,
  IconReceipt2,
  IconX,
} from '@tabler/icons-react';
import { CalendarDateInput } from '../../components/CalendarDateInput.jsx';
import { countryColorForIndex } from '../../config.js';
import { flagImageUrl } from '../flags/flags.js';
import { savedPlaceRoutePairKey } from '../routes/routeModel.js';
import { formatSegmentAmount } from '../trips/segmentFormModel.js';
import {
  groupPlacesByTripDay,
  placeTripDayOffset,
  tripCalendarDays,
  tripPlanningDays,
} from '../trips/tripDayPlanning.js';
import { isPlaced, segmentTotal } from '../trips/tripModel.js';
import { fetchGeoapifyPlaceEnrichment } from './geoapifyPlaceEnrichmentClient.js';
import { TripRouteConnections } from './TripRouteConnections.jsx';
import './TripPlacesPanel.css';

const DAY_LABELS = Object.freeze({
  es: { Mo: 'Lun', Tu: 'Mar', We: 'Mié', Th: 'Jue', Fr: 'Vie', Sa: 'Sáb', Su: 'Dom', PH: 'Festivos' },
  en: { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun', PH: 'Holidays' },
});

const PERSISTENCE_LABEL_KEYS = Object.freeze({
  saved: 'persistenceSaved', pending: 'persistencePending', local: 'persistenceLocal',
  syncing: 'persistenceSyncing', conflict: 'persistenceConflict', error: 'persistenceError',
});

function persistenceLabelKey(state) {
  return PERSISTENCE_LABEL_KEYS[state] || PERSISTENCE_LABEL_KEYS.pending;
}

function CountryFlag({ city }) {
  if (!city?.countryCode) {
    return <span className="trip-place__flag-fallback" aria-hidden="true"><IconMapPin size={15} /></span>;
  }
  return (
    <img
      className="trip-places__flag"
      src={flagImageUrl(city.countryCode, 24)}
      alt={city.country || city.countryCode}
      width={24}
      height={16}
      loading="lazy"
    />
  );
}

function placeLabel(place, t) {
  return place?.name || place?.userLabel || t('place');
}

function formattedOpeningHours(value, intlLocale) {
  let text = String(value || '').trim();
  if (!text) return '';
  const language = String(intlLocale || '').toLowerCase().startsWith('en') ? 'en' : 'es';
  Object.entries(DAY_LABELS[language]).forEach(([token, label]) => {
    text = text.replace(new RegExp(`\\b${token}\\b`, 'g'), label);
  });
  return text.replace(/\s*;\s*/g, ' · ').replace(/\boff\b/gi, language === 'en' ? 'closed' : 'cerrado').replace(/\s+/g, ' ');
}

function formatDayDate(value, intlLocale) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale || 'es-MX', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(date);
}

function cityLabel(city, t) {
  return [city?.name || t('city'), city?.country].filter(Boolean).join(', ');
}

function countryKey(destination) {
  return String(destination?.countryCode || '').trim().toUpperCase()
    || String(destination?.country || '').trim().toLowerCase()
    || 'unknown';
}

function countryColorMap(segments) {
  const colors = new Map();
  (segments || []).forEach((segment) => {
    const key = countryKey(segment?.destination);
    if (key === 'unknown' || colors.has(key)) return;
    colors.set(key, countryColorForIndex(colors.size));
  });
  return colors;
}

function uniqueAssignments(assignments) {
  const seen = new Set();
  return assignments.filter((assignment) => {
    if (!assignment?.segmentId || seen.has(assignment.segmentId)) return false;
    seen.add(assignment.segmentId);
    return true;
  });
}

export function TripDayRoutesPanel({
  trip = {},
  segments = [],
  places = [],
  routes = [],
  updateTripDates,
  removeTripDay,
  reorderTripDay,
  toggleSegmentNote,
  toggleSegmentDetails,
  updatePlace,
  removePlace,
  reorderPlace,
  movePlaceToDay,
  upsertRoute,
  setRouteVisibility,
  setAllRouteVisibility,
  persistenceState = 'saved',
  t,
  intlLocale,
}) {
  const [placeToDelete, setPlaceToDelete] = useState(null);
  const [placeDragState, setPlaceDragState] = useState(null);
  const [dayDragState, setDayDragState] = useState(null);
  const [placeDetails, setPlaceDetails] = useState({});
  const [moveMenuPlaceId, setMoveMenuPlaceId] = useState('');
  const [notePlaceId, setNotePlaceId] = useState('');
  const [collapsedDays, setCollapsedDays] = useState(() => new Set());
  const panelRef = useRef(null);
  const placeDragStateRef = useRef(null);
  const dayDragStateRef = useRef(null);
  const enrichmentInFlightRef = useRef(new Set());
  const enrichmentLoadedRef = useRef(new Set());

  const visibleSegments = useMemo(
    () => segments.filter((segment) => isPlaced(segment?.destination)),
    [segments]
  );
  const planningTrip = useMemo(() => ({ ...trip, segments: visibleSegments }), [trip, visibleSegments]);
  const calendarDays = useMemo(() => tripCalendarDays(planningTrip), [planningTrip]);
  const planningDays = useMemo(() => tripPlanningDays(planningTrip), [planningTrip]);
  const placeGroups = useMemo(() => groupPlacesByTripDay(places, planningTrip), [places, planningTrip]);
  const placesByOffset = useMemo(
    () => new Map(placeGroups.groups.map((group) => [group.tripDayOffset, group.places])),
    [placeGroups.groups]
  );
  const assignmentsByOffset = useMemo(() => {
    const map = new Map();
    planningDays.forEach((assignment) => {
      if (!map.has(assignment.tripDayOffset)) map.set(assignment.tripDayOffset, []);
      map.get(assignment.tripDayOffset).push(assignment);
    });
    return map;
  }, [planningDays]);
  const colors = useMemo(() => countryColorMap(visibleSegments), [visibleSegments]);
  const segmentById = useMemo(() => new Map(visibleSegments.map((segment) => [segment.id, segment])), [visibleSegments]);
  const routeByPair = useMemo(() => new Map(routes.map((route) => [savedPlaceRoutePairKey(route), route])), [routes]);
  const notePlace = notePlaceId ? places.find((place) => place.id === notePlaceId) || null : null;
  const persistenceLabel = t(persistenceLabelKey(persistenceState));
  const persistenceHasCheck = persistenceState === 'saved' || persistenceState === 'local';
  const currency = trip.currency || 'USD';

  useEffect(() => {
    if (notePlaceId && !notePlace) setNotePlaceId('');
  }, [notePlace, notePlaceId]);

  useEffect(() => {
    if (!moveMenuPlaceId) return undefined;
    const close = (event) => {
      if (event.target?.closest?.('[data-place-move-menu]')) return;
      setMoveMenuPlaceId('');
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [moveMenuPlaceId]);

  useEffect(() => {
    const draggedPlaceId = placeDragState?.placeId;
    if (!draggedPlaceId) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    const resolveTarget = (event) => {
      const days = Array.from(panel.querySelectorAll('[data-trip-day-offset]'))
        .map((element) => ({
          offset: Number(element.dataset.tripDayOffset),
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ offset, bounds }) => Number.isInteger(offset) && bounds.height > 0);
      const day = days.find(({ bounds }) => event.clientY >= bounds.top && event.clientY <= bounds.bottom)
        || days.reduce((best, candidate) => {
          const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
          const distance = Math.abs(event.clientY - midpoint);
          return !best || distance < best.distance ? { ...candidate, distance } : best;
        }, null);
      if (!day) return { targetOffset: null, targetId: null, placement: null };
      const candidates = Array.from(panel.querySelectorAll(`[data-trip-day-offset="${day.offset}"] [data-place-id]`))
        .map((element) => ({ id: element.dataset.placeId, bounds: element.getBoundingClientRect() }))
        .filter(({ id }) => id && id !== draggedPlaceId);
      const nearest = candidates.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);
      return {
        targetOffset: day.offset,
        targetId: nearest?.id || null,
        placement: nearest ? (event.clientY >= nearest.bounds.top + nearest.bounds.height / 2 ? 'after' : 'before') : null,
      };
    };

    const move = (event) => {
      event.preventDefault();
      const current = placeDragStateRef.current;
      if (!current) return;
      const next = { ...current, offsetY: event.clientY - current.startY, ...resolveTarget(event) };
      placeDragStateRef.current = next;
      setPlaceDragState(next);
    };
    const finish = (commit) => {
      const current = placeDragStateRef.current;
      if (commit && current && Number.isInteger(current.targetOffset)) {
        const source = places.find((place) => place.id === current.placeId);
        const sourceOffset = source ? placeTripDayOffset(source, planningTrip) : null;
        if (sourceOffset !== current.targetOffset) {
          movePlaceToDay?.(current.placeId, current.targetOffset);
        } else if (current.targetId && current.placement) {
          reorderPlace?.(current.placeId, current.targetId, current.placement);
        }
      }
      placeDragStateRef.current = null;
      setPlaceDragState(null);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [placeDragState?.placeId, places, planningTrip, movePlaceToDay, reorderPlace]);

  useEffect(() => {
    const sourceOffset = dayDragState?.sourceOffset;
    if (!Number.isInteger(sourceOffset)) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    const active = (event) => {
      const current = dayDragStateRef.current;
      return current?.pointerId === event.pointerId ? current : null;
    };
    const move = (event) => {
      const current = active(event);
      if (!current) return;
      const candidates = Array.from(panel.querySelectorAll('[data-trip-day-offset]'))
        .map((element) => ({ offset: Number(element.dataset.tripDayOffset), bounds: element.getBoundingClientRect() }))
        .filter(({ offset }) => Number.isInteger(offset) && offset !== current.sourceOffset);
      if (!candidates.length) return;
      const nearest = candidates.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);
      const next = {
        ...current,
        targetOffset: nearest.offset,
        placement: event.clientY >= nearest.bounds.top + nearest.bounds.height / 2 ? 'after' : 'before',
      };
      dayDragStateRef.current = next;
      setDayDragState(next);
    };
    const finish = (event, commit) => {
      const current = active(event);
      if (!current) return;
      dayDragStateRef.current = null;
      setDayDragState(null);
      if (commit && Number.isInteger(current.targetOffset)) {
        reorderTripDay?.(current.sourceOffset, current.targetOffset, current.placement);
      }
    };
    const up = (event) => finish(event, true);
    const cancel = (event) => finish(event, false);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [dayDragState?.sourceOffset, reorderTripDay]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const placesById = new Map(places.map((place) => [place.id, place]));
    const candidates = Array.from(panel.querySelectorAll('[data-place-id]'))
      .filter((element) => !enrichmentLoadedRef.current.has(element.dataset.placeId));
    if (!candidates.length) return undefined;
    const loadDetails = async (element) => {
      const placeId = element.dataset.placeId;
      const place = placesById.get(placeId);
      if (!place || enrichmentInFlightRef.current.has(placeId)) return;
      enrichmentInFlightRef.current.add(placeId);
      try {
        const details = await fetchGeoapifyPlaceEnrichment(place);
        enrichmentLoadedRef.current.add(placeId);
        setPlaceDetails((current) => ({ ...current, [placeId]: details }));
      } catch (error) {
        if (error?.name !== 'AbortError') console.warn('[Geoapify Place Details] enrichment unavailable', error);
      } finally {
        enrichmentInFlightRef.current.delete(placeId);
      }
    };
    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer !== 'function') {
      candidates.slice(0, 3).forEach(loadDetails);
      return undefined;
    }
    const observer = new Observer((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      loadDetails(entry.target);
    }), { root: panel, rootMargin: '180px 0px', threshold: 0.01 });
    candidates.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [places]);

  function startPlaceDrag(event, placeId) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const next = { placeId, startY: event.clientY, offsetY: 0, targetOffset: null, targetId: null, placement: null };
    placeDragStateRef.current = next;
    setPlaceDragState(next);
  }

  function startDayDrag(event, sourceOffset) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next = { sourceOffset, pointerId: event.pointerId, targetOffset: null, placement: null };
    dayDragStateRef.current = next;
    setDayDragState(next);
  }

  function toggleDay(date) {
    setCollapsedDays((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  function renderPlace(place, tripDayOffset, nextPlace = null) {
    const dragging = placeDragState?.placeId === place.id;
    const details = placeDetails[place.id] || {};
    const hours = formattedOpeningHours(details.openingHours, intlLocale);
    const pairKey = nextPlace ? `${place.id}\u0000${nextPlace.id}` : '';
    const route = pairKey ? routeByPair.get(pairKey) : null;
    return (
      <div className="trip-place-block" key={place.id}>
        <article
          className={'trip-place' + (dragging ? ' is-dragging' : '')}
          data-place-id={place.id}
          style={dragging ? { '--trip-place-drag-y': `${placeDragState.offsetY}px` } : undefined}
        >
          <span className="trip-place__timeline-dot" aria-hidden="true" />
          <div className="trip-place__surface">
            <span className="trip-place__move-wrap" data-place-move-menu>
              <button type="button" className="trip-place__drag" onPointerDown={(event) => startPlaceDrag(event, place.id)} onClick={() => setMoveMenuPlaceId((current) => current === place.id ? '' : place.id)} aria-label={t('movePlace')}>
                <IconGripVertical size={15} aria-hidden="true" />
              </button>
              {moveMenuPlaceId === place.id && (
                <div className="trip-place__move-menu" role="menu">
                  <strong>{t('movePlaceTo')}</strong>
                  {calendarDays.map((day) => (
                    <button type="button" role="menuitem" key={day.date} onClick={() => { movePlaceToDay?.(place.id, day.tripDayOffset); setMoveMenuPlaceId(''); }}>
                      {`${t('day')} ${day.globalDayNumber} · ${formatDayDate(day.date, intlLocale)}`}
                    </button>
                  ))}
                </div>
              )}
            </span>
            <span className="trip-place__info">
              <strong>{placeLabel(place, t)}</strong>
              {(hours || details.website) && (
                <span className="trip-place__details">
                  {hours && <span className="trip-place__hours" title={t('openingHours')}><IconClock size={11} stroke={1.8} aria-hidden="true" /><span>{hours}</span></span>}
                  {details.website && <a className="trip-place__website" href={details.website} target="_blank" rel="noreferrer" title={t('officialWebsite')}><IconExternalLink size={11} stroke={1.8} aria-hidden="true" /><span>{t('officialWebsite')}</span></a>}
                </span>
              )}
            </span>
            <button type="button" className={'trip-place__note' + (place.note ? ' has-note' : '')} onClick={() => setNotePlaceId(place.id)} aria-label={t('placeNote')}><IconNote size={14} aria-hidden="true" /></button>
            <button type="button" className="trip-place__delete" onClick={() => setPlaceToDelete(place)} aria-label={t('delete')}><IconX size={14} aria-hidden="true" /></button>
          </div>
        </article>
        {nextPlace && (
          <TripRouteConnections origin={place} destination={nextPlace} route={route} upsertRoute={upsertRoute} setRouteVisibility={setRouteVisibility} setAllRouteVisibility={setAllRouteVisibility} t={t} intlLocale={intlLocale} />
        )}
      </div>
    );
  }

  if (!calendarDays.length) {
    return (
      <div className="trip-places trip-places--unified trip-places--empty-trip" ref={panelRef} style={{ alignItems: 'center', justifyContent: 'center', padding: '28px' }}>
        <div style={{ width: 'min(100%, 340px)', textAlign: 'center' }}>
          <strong style={{ display: 'block', marginBottom: '18px', color: '#263445', fontSize: '20px', lineHeight: 1.3 }}>{t('chooseTripDates')}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '10px' }}>
            <CalendarDateInput value={trip.startDate || ''} max={trip.endDate || undefined} locale={intlLocale} ariaLabel={t('startDate')} onChange={(startDate) => updateTripDates?.({ startDate })} />
            <CalendarDateInput value={trip.endDate || ''} min={trip.startDate || undefined} referenceDate={trip.startDate || undefined} locale={intlLocale} align="end" ariaLabel={t('endDate')} onChange={(endDate) => updateTripDates?.({ endDate })} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="trip-places trip-places--unified" ref={panelRef}>
        <div className="trip-places__cities">
          {calendarDays.map((calendarDay) => {
            const assignments = uniqueAssignments(assignmentsByOffset.get(calendarDay.tripDayOffset) || []);
            const primarySegment = assignments[0] ? segmentById.get(assignments[0].segmentId) || null : null;
            const dayPlaces = placesByOffset.get(calendarDay.tripDayOffset) || [];
            const collapsed = collapsedDays.has(calendarDay.date);
            const dayTotal = assignments.reduce((sum, assignment) => sum + segmentTotal(segmentById.get(assignment.segmentId) || {}), 0);
            const amount = formatSegmentAmount(dayTotal, intlLocale, currency);
            const color = assignments[0] ? (colors.get(countryKey(assignments[0].destination)) || countryColorForIndex(0)) : '#94a3b8';
            const dayDragging = dayDragState?.sourceOffset === calendarDay.tripDayOffset;
            const dropPlacement = dayDragState?.targetOffset === calendarDay.tripDayOffset ? dayDragState.placement : null;

            return (
              <section
                className={['trip-day', 'trip-day--flat', dayDragging ? 'is-day-dragging' : '', dropPlacement === 'before' ? 'is-day-drop-before' : '', dropPlacement === 'after' ? 'is-day-drop-after' : ''].filter(Boolean).join(' ')}
                key={calendarDay.date}
                data-trip-day-offset={calendarDay.tripDayOffset}
                style={{ '--trip-day-color': color }}
              >
                {dayPlaces.length > 1 && <span className="trip-day__rail" aria-hidden="true" />}
                <header className="trip-day__header" style={{ minHeight: '50px', gridTemplateColumns: '20px minmax(0,1fr) 62px repeat(4,18px)', columnGap: '7px', borderBottom: '1px solid #eef1f4', alignItems: 'center' }}>
                  <span className="trip-day__node" aria-hidden="true" />
                  <span className="trip-day__heading" style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button type="button" className="trip-day__drag" onPointerDown={(event) => startDayDrag(event, calendarDay.tripDayOffset)} aria-label={`${t('move')} ${t('day')} ${calendarDay.globalDayNumber}`} style={{ display: 'inline-flex', border: 0, background: 'transparent', padding: 0, color: '#a0a8b3', cursor: 'grab' }}><IconGripVertical size={13} aria-hidden="true" /></button>
                    <strong style={{ color: '#263445', fontSize: '12.5px', fontWeight: 750, whiteSpace: 'nowrap' }}>{String(t('day')).toUpperCase()} {calendarDay.globalDayNumber}</strong>
                    <span style={{ color: '#5f6875', fontSize: '12px', fontWeight: 650, whiteSpace: 'nowrap' }}>· {formatDayDate(calendarDay.date, intlLocale)}</span>
                    {assignments.length > 0 && (
                      <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {assignments.map((assignment) => (
                          <span key={assignment.segmentId} className="trip-day__city-token" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                            <CountryFlag city={assignment.destination} />
                            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cityLabel(assignment.destination, t)}</strong>
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="trip-city__amount" title={t('segmentTotal')}>{amount}</span>
                  <button type="button" className="trip-city__action trip-city__expense" onClick={() => primarySegment && toggleSegmentDetails?.(primarySegment.id)} aria-label={t('expenses')} title={t('expenses')} disabled={!primarySegment}><IconReceipt2 size={15} stroke={1.8} aria-hidden="true" /></button>
                  <button type="button" className={'trip-city__action trip-city__note' + (primarySegment?.note ? ' has-note' : '')} onClick={() => primarySegment && toggleSegmentNote?.(primarySegment.id)} aria-label={t('segmentNote')} title={t('segmentNote')} disabled={!primarySegment}><IconNote size={15} aria-hidden="true" /></button>
                  <button type="button" className="trip-city__action trip-city__expand" aria-expanded={!collapsed} onClick={() => toggleDay(calendarDay.date)} aria-label={collapsed ? t('expand') : t('collapse')}>{collapsed ? <IconChevronRight size={15} aria-hidden="true" /> : <IconChevronDown size={15} aria-hidden="true" />}</button>
                  <button type="button" className="trip-city__action trip-day__remove" onClick={() => { if (globalThis.confirm(`${t('delete')} ${t('day')} ${calendarDay.globalDayNumber}?`)) removeTripDay?.(calendarDay.date); }} aria-label={`${t('delete')} ${t('day')} ${calendarDay.globalDayNumber}`}><IconX size={14} aria-hidden="true" /></button>
                </header>
                {!collapsed && (
                  <div className="trip-places__sequence" style={{ '--trip-day-color': color }}>
                    {dayPlaces.length > 0
                      ? dayPlaces.map((place, index) => renderPlace(place, calendarDay.tripDayOffset, dayPlaces[index + 1] || null))
                      : <div className="trip-day__empty-row" style={{ fontStyle: 'normal' }}>{t('tripDayNoCity')}</div>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {notePlace && (
        <div className="confirm__scrim" role="presentation" onMouseDown={() => setNotePlaceId('')}>
          <div className="confirm__card trip-place-note-dialog" role="dialog" aria-modal="true" aria-label={t('placeNote')} onMouseDown={(event) => event.stopPropagation()}>
            <div className="segnote__head"><span className="segnote__title">{placeLabel(notePlace, t)}</span><button type="button" className="segnote__x" aria-label={t('closeNote')} onClick={() => setNotePlaceId('')}><IconX size={16} aria-hidden="true" /></button></div>
            <textarea className="segnote__textarea" value={notePlace.note || ''} maxLength={500} placeholder={t('placeNotePlaceholder')} onChange={(event) => updatePlace?.(notePlace.id, { note: event.target.value })} autoFocus />
            <div className="segnote__foot"><span className="segnote__saved" data-persistence-state={persistenceState}>{persistenceHasCheck && <IconCheck size={12} aria-hidden="true" />} {persistenceLabel}</span><span className="segnote__count">{(notePlace.note || '').length} / 500</span></div>
          </div>
        </div>
      )}

      {placeToDelete && (
        <div className="confirm__scrim" role="presentation" onMouseDown={() => setPlaceToDelete(null)}>
          <div className="confirm__card" role="dialog" aria-modal="true" aria-label={t('deletePlace')} onMouseDown={(event) => event.stopPropagation()}>
            <p className="confirm__message">{t('confirmDeletePlace', { name: placeLabel(placeToDelete, t) })}</p>
            <div className="confirm__actions"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setPlaceToDelete(null)}>{t('cancel')}</button><button type="button" className="btn btn--danger btn--sm" onClick={() => { removePlace?.(placeToDelete.id); setPlaceToDelete(null); }}>{t('delete')}</button></div>
          </div>
        </div>
      )}
    </>
  );
}
