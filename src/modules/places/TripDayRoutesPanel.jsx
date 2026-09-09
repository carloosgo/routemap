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
import { SegmentDeleteDialog } from '../trips/SegmentDeleteDialog.jsx';
import { formatSegmentAmount } from '../trips/segmentFormModel.js';
import {
  groupPlacesByPlanningDay,
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
  saved: 'persistenceSaved',
  pending: 'persistencePending',
  local: 'persistenceLocal',
  syncing: 'persistenceSyncing',
  conflict: 'persistenceConflict',
  error: 'persistenceError',
});

function persistenceLabelKey(state) {
  return PERSISTENCE_LABEL_KEYS[state] || PERSISTENCE_LABEL_KEYS.pending;
}

function CountryFlag({ city }) {
  if (!city?.countryCode) {
    return (
      <span className="trip-place__flag-fallback" aria-hidden="true">
        <IconMapPin size={15} />
      </span>
    );
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
  return text
    .replace(/\s*;\s*/g, ' · ')
    .replace(/\boff\b/gi, language === 'en' ? 'closed' : 'cerrado')
    .replace(/\s+/g, ' ');
}

function formatDayDate(value, intlLocale) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale || 'es-MX', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function destinationLabel(day, intlLocale, t) {
  const city = day?.destination;
  const place = [city?.name || t('city'), city?.country].filter(Boolean).join(', ');
  return `${t('day')} ${day.globalDayNumber} · ${formatDayDate(day.date, intlLocale)} · ${place}`;
}

function countryKey(destination) {
  const code = String(destination?.countryCode || '').trim().toUpperCase();
  const name = String(destination?.country || '').trim().toLowerCase();
  return code || name || 'unknown';
}

function countryColorMap(segments) {
  const colors = new Map();
  (Array.isArray(segments) ? segments : []).forEach((segment) => {
    const key = countryKey(segment?.destination);
    if (key === 'unknown' || colors.has(key)) return;
    colors.set(key, countryColorForIndex(colors.size));
  });
  return colors;
}

function colorForDestination(destination, colors) {
  return colors.get(countryKey(destination)) || countryColorForIndex(0);
}

function cityLabel(city, t) {
  return city?.name || t('city');
}

function dayAssignments(planningDays) {
  const byDate = new Map();
  planningDays.forEach((day) => {
    if (!byDate.has(day.date)) byDate.set(day.date, []);
    byDate.get(day.date).push(day);
  });
  return byDate;
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
  removeSegment,
  reorderSegment,
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
  const [segmentToDelete, setSegmentToDelete] = useState(null);
  const [placeDragState, setPlaceDragState] = useState(null);
  const [cityDragState, setCityDragState] = useState(null);
  const [placeDetails, setPlaceDetails] = useState({});
  const [moveMenuPlaceId, setMoveMenuPlaceId] = useState('');
  const [notePlaceId, setNotePlaceId] = useState('');
  const [collapsedDays, setCollapsedDays] = useState(() => new Set());
  const panelRef = useRef(null);
  const placeDragStateRef = useRef(null);
  const cityDragStateRef = useRef(null);
  const enrichmentInFlightRef = useRef(new Set());
  const enrichmentLoadedRef = useRef(new Set());
  const draggedPlaceId = placeDragState?.placeId || '';
  const activeCityDragId = cityDragState?.segmentId || '';

  const visibleSegments = useMemo(
    () => segments.filter((segment) => isPlaced(segment?.destination)),
    [segments]
  );
  const planningTrip = useMemo(
    () => ({ ...trip, segments: visibleSegments }),
    [trip, visibleSegments]
  );
  const calendarDays = useMemo(() => tripCalendarDays(planningTrip), [planningTrip]);
  const planningDays = useMemo(() => tripPlanningDays(planningTrip), [planningTrip]);
  const planned = useMemo(
    () => groupPlacesByPlanningDay(places, planningTrip),
    [places, planningTrip]
  );
  const groupByKey = useMemo(
    () => new Map(planned.groups.map((group) => [group.key, group])),
    [planned.groups]
  );
  const assignmentsByDate = useMemo(() => dayAssignments(planningDays), [planningDays]);
  const colors = useMemo(() => countryColorMap(visibleSegments), [visibleSegments]);
  const segmentById = useMemo(
    () => new Map(visibleSegments.map((segment) => [segment.id, segment])),
    [visibleSegments]
  );
  const routeByPair = useMemo(
    () => new Map(routes.map((route) => [savedPlaceRoutePairKey(route), route])),
    [routes]
  );
  const firstAssignmentKeyBySegment = useMemo(() => {
    const map = new Map();
    planningDays.forEach((assignment) => {
      if (!map.has(assignment.segmentId)) map.set(assignment.segmentId, assignment.key);
    });
    return map;
  }, [planningDays]);
  const notePlace = notePlaceId
    ? places.find((place) => place.id === notePlaceId) || null
    : null;
  const persistenceLabel = t(persistenceLabelKey(persistenceState));
  const persistenceHasCheck = persistenceState === 'saved' || persistenceState === 'local';
  const currency = trip.currency || 'USD';
  const hasTripDates = calendarDays.length > 0;

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
    if (!draggedPlaceId) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    function candidates() {
      return Array.from(panel.querySelectorAll('[data-place-id]'))
        .map((element) => ({
          id: element.dataset.placeId,
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ id, bounds }) => id && id !== draggedPlaceId && bounds.width > 0 && bounds.height > 0)
        .sort((left, right) => left.bounds.top - right.bounds.top);
    }

    function resolveDropTarget(event) {
      const available = candidates();
      if (!available.length) return { targetId: null, placement: null };
      const nearest = available.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { candidate, distance } : best;
      }, null).candidate;
      return {
        targetId: nearest.id,
        placement: event.clientY >= nearest.bounds.top + nearest.bounds.height / 2
          ? 'after'
          : 'before',
      };
    }

    function handlePointerMove(event) {
      event.preventDefault();
      const target = resolveDropTarget(event);
      setPlaceDragState((current) => {
        if (!current) return current;
        const next = {
          ...current,
          offsetY: event.clientY - current.startY,
          ...target,
        };
        placeDragStateRef.current = next;
        return next;
      });
    }

    function finishDrag(commit) {
      const current = placeDragStateRef.current;
      if (commit && current?.targetId && current.placement) {
        reorderPlace?.(current.placeId, current.targetId, current.placement);
      }
      placeDragStateRef.current = null;
      setPlaceDragState(null);
    }

    const up = () => finishDrag(true);
    const cancel = () => finishDrag(false);
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [draggedPlaceId, reorderPlace]);

  useEffect(() => {
    if (!activeCityDragId) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    function uniqueCandidates(sourceId) {
      const seen = new Set();
      return Array.from(panel.querySelectorAll('[data-city-order-id]'))
        .map((element) => ({
          id: element.dataset.cityOrderId,
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ id, bounds }) => {
          if (!id || id === sourceId || seen.has(id) || bounds.width <= 0 || bounds.height <= 0) return false;
          seen.add(id);
          return true;
        })
        .sort((left, right) => left.bounds.top - right.bounds.top);
    }

    function activeDrag(event) {
      const current = cityDragStateRef.current;
      if (!current || current.segmentId !== activeCityDragId || current.pointerId !== event.pointerId) return null;
      return current;
    }

    function handlePointerMove(event) {
      const current = activeDrag(event);
      if (!current) return;
      const candidates = uniqueCandidates(current.segmentId);
      if (!candidates.length) return;
      const nearest = candidates.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { candidate, distance } : best;
      }, null).candidate;
      const next = {
        ...current,
        targetId: nearest.id,
        placement: event.clientY >= nearest.bounds.top + nearest.bounds.height / 2 ? 'after' : 'before',
      };
      cityDragStateRef.current = next;
      setCityDragState(next);
    }

    function finish(event, commit) {
      const current = activeDrag(event);
      if (!current) return;
      cityDragStateRef.current = null;
      setCityDragState(null);
      if (commit && current.targetId && current.placement) {
        reorderSegment?.(current.segmentId, current.targetId, current.placement);
      }
    }

    const up = (event) => finish(event, true);
    const cancel = (event) => finish(event, false);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [activeCityDragId, reorderSegment]);

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
        if (error?.name !== 'AbortError') {
          console.warn('[Geoapify Place Details] enrichment unavailable', error);
        }
      } finally {
        enrichmentInFlightRef.current.delete(placeId);
      }
    };

    const Observer = globalThis.IntersectionObserver;
    if (typeof Observer !== 'function') {
      candidates.slice(0, 3).forEach(loadDetails);
      return undefined;
    }
    const observer = new Observer((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        loadDetails(entry.target);
      });
    }, { root: panel, rootMargin: '180px 0px', threshold: 0.01 });
    candidates.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [places]);

  function toggleDay(date) {
    setCollapsedDays((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function startPlaceDrag(event, placeId) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const next = {
      placeId,
      startY: event.clientY,
      offsetY: 0,
      targetId: null,
      placement: null,
    };
    placeDragStateRef.current = next;
    setPlaceDragState(next);
  }

  function startCityDrag(event, segmentId) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next = {
      segmentId,
      pointerId: event.pointerId,
      targetId: null,
      placement: null,
    };
    cityDragStateRef.current = next;
    setCityDragState(next);
  }

  function renderPlace(place, groupKey, nextPlace = null) {
    const dragging = placeDragState?.placeId === place.id;
    const dropPlacement = placeDragState?.targetId === place.id
      ? placeDragState.placement
      : null;
    const details = placeDetails[place.id] || {};
    const hours = formattedOpeningHours(details.openingHours, intlLocale);
    const pairKey = nextPlace ? `${place.id}\u0000${nextPlace.id}` : '';
    const route = pairKey ? routeByPair.get(pairKey) : null;

    return (
      <div className="trip-place-block" key={place.id}>
        <article
          className={[
            'trip-place',
            dragging ? 'is-dragging' : '',
            dropPlacement === 'before' ? 'is-drop-before' : '',
            dropPlacement === 'after' ? 'is-drop-after' : '',
          ].filter(Boolean).join(' ')}
          data-place-id={place.id}
          data-planning-group={groupKey}
          style={dragging ? { '--trip-place-drag-y': `${placeDragState.offsetY}px` } : undefined}
        >
          <span className="trip-place__timeline-dot" aria-hidden="true" />
          <div className="trip-place__surface">
            <span className="trip-place__move-wrap" data-place-move-menu>
              <button
                type="button"
                className="trip-place__drag"
                onPointerDown={(event) => startPlaceDrag(event, place.id)}
                onClick={() => setMoveMenuPlaceId((current) => current === place.id ? '' : place.id)}
                aria-label={t('movePlace')}
              >
                <IconGripVertical size={15} aria-hidden="true" />
              </button>
              {moveMenuPlaceId === place.id && (
                <div className="trip-place__move-menu" role="menu">
                  <strong>{t('movePlaceTo')}</strong>
                  {planningDays.map((day) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={day.key}
                      onClick={() => {
                        movePlaceToDay?.(place.id, day.segmentId, day.dayOffset);
                        setMoveMenuPlaceId('');
                      }}
                    >
                      {destinationLabel(day, intlLocale, t)}
                    </button>
                  ))}
                  {!planningDays.length && <span>{t('noPlanningDays')}</span>}
                </div>
              )}
            </span>
            <span className="trip-place__info">
              <strong>{placeLabel(place, t)}</strong>
              {(hours || details.website) && (
                <span className="trip-place__details">
                  {hours && (
                    <span className="trip-place__hours" title={t('openingHours')}>
                      <IconClock size={11} stroke={1.8} aria-hidden="true" />
                      <span>{hours}</span>
                    </span>
                  )}
                  {details.website && (
                    <a
                      className="trip-place__website"
                      href={details.website}
                      target="_blank"
                      rel="noreferrer"
                      title={t('officialWebsite')}
                    >
                      <IconExternalLink size={11} stroke={1.8} aria-hidden="true" />
                      <span>{t('officialWebsite')}</span>
                    </a>
                  )}
                </span>
              )}
            </span>
            <button
              type="button"
              className={'trip-place__note' + (place.note ? ' has-note' : '')}
              onClick={() => setNotePlaceId(place.id)}
              aria-label={t('placeNote')}
            >
              <IconNote size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="trip-place__delete"
              onClick={() => setPlaceToDelete(place)}
              aria-label={t('delete')}
            >
              <IconX size={14} aria-hidden="true" />
            </button>
          </div>
        </article>
        {nextPlace && (
          <TripRouteConnections
            origin={place}
            destination={nextPlace}
            route={route}
            upsertRoute={upsertRoute}
            setRouteVisibility={setRouteVisibility}
            setAllRouteVisibility={setAllRouteVisibility}
            t={t}
            intlLocale={intlLocale}
          />
        )}
      </div>
    );
  }

  function dayPlaceEntries(assignments) {
    const entries = [];
    assignments.forEach((assignment) => {
      const group = groupByKey.get(assignment.key);
      const groupPlaces = group?.places || [];
      groupPlaces.forEach((place, index) => {
        entries.push({
          place,
          groupKey: assignment.key,
          nextPlace: groupPlaces[index + 1] || null,
        });
      });
    });
    return entries;
  }

  function renderCityToken(assignment) {
    const segment = segmentById.get(assignment.segmentId);
    if (!segment) return null;
    const isFirstAssignment = firstAssignmentKeyBySegment.get(segment.id) === assignment.key;
    return (
      <span
        key={assignment.segmentId}
        className="trip-day__city-token"
        data-city-order-id={isFirstAssignment ? segment.id : undefined}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 }}
      >
        {isFirstAssignment && (
          <button
            type="button"
            className="trip-city__drag"
            onPointerDown={(event) => startCityDrag(event, segment.id)}
            aria-label={t('moveCity')}
            title={t('moveCity')}
            style={{ width: '14px', minWidth: '14px' }}
          >
            <IconGripVertical size={13} aria-hidden="true" />
          </button>
        )}
        <CountryFlag city={assignment.destination} />
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cityLabel(assignment.destination, t)}
        </strong>
        <button
          type="button"
          className="trip-city__action trip-city__remove"
          onClick={() => setSegmentToDelete(segment)}
          aria-label={t('removeCity')}
          title={t('removeCity')}
          style={{ width: '14px', minWidth: '14px' }}
        >
          <IconX size={12} aria-hidden="true" />
        </button>
      </span>
    );
  }

  if (!hasTripDates) {
    return (
      <div
        className="trip-places trip-places--unified trip-places--empty-trip"
        ref={panelRef}
        style={{ alignItems: 'center', justifyContent: 'center', padding: '28px' }}
      >
        <div style={{ width: 'min(100%, 340px)', textAlign: 'center' }}>
          <strong style={{ display: 'block', marginBottom: '18px', color: '#263445', fontSize: '20px', lineHeight: 1.3 }}>
            {t('chooseTripDates')}
          </strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '10px' }}>
            <CalendarDateInput
              value={trip.startDate || ''}
              max={trip.endDate || undefined}
              locale={intlLocale}
              ariaLabel={t('startDate')}
              onChange={(startDate) => updateTripDates?.({ startDate })}
            />
            <CalendarDateInput
              value={trip.endDate || ''}
              min={trip.startDate || undefined}
              referenceDate={trip.startDate || undefined}
              locale={intlLocale}
              align="end"
              ariaLabel={t('endDate')}
              onChange={(endDate) => updateTripDates?.({ endDate })}
            />
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
            const assignments = uniqueAssignments(assignmentsByDate.get(calendarDay.date) || []);
            const primaryAssignment = assignments[0] || null;
            const primarySegment = primaryAssignment
              ? segmentById.get(primaryAssignment.segmentId) || null
              : null;
            const entries = dayPlaceEntries(assignments);
            const collapsed = collapsedDays.has(calendarDay.date);
            const dayTotal = assignments.reduce((sum, assignment) => {
              const segment = segmentById.get(assignment.segmentId);
              return sum + (segment ? segmentTotal(segment) : 0);
            }, 0);
            const amount = formatSegmentAmount(dayTotal, intlLocale, currency);
            const color = primaryAssignment
              ? colorForDestination(primaryAssignment.destination, colors)
              : '#94a3b8';

            return (
              <section
                className="trip-day trip-day--flat"
                key={calendarDay.date}
                style={{ '--trip-day-color': color }}
              >
                <header
                  className="trip-day__header"
                  style={{
                    minHeight: '50px',
                    gridTemplateColumns: '20px minmax(0,1fr) 62px repeat(4,18px)',
                    columnGap: '7px',
                    borderBottom: '1px solid #eef1f4',
                    alignItems: 'center',
                  }}
                >
                  <span className="trip-day__node" aria-hidden="true" />
                  <span className="trip-day__heading" style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <strong style={{ color: '#263445', fontSize: '12.5px', fontWeight: 750, whiteSpace: 'nowrap' }}>
                      {t('day')} {calendarDay.globalDayNumber} · {formatDayDate(calendarDay.date, intlLocale)}
                    </strong>
                    {assignments.length > 0 ? (
                      <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {assignments.map(renderCityToken)}
                      </span>
                    ) : (
                      <span style={{ color: '#8a94a3', fontSize: '11px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('tripDayNoCity')}
                      </span>
                    )}
                  </span>
                  <span className="trip-city__amount" title={t('segmentTotal')}>{amount}</span>
                  <button
                    type="button"
                    className="trip-city__action trip-city__expense"
                    onClick={() => primarySegment && toggleSegmentDetails?.(primarySegment.id)}
                    aria-label={t('expenses')}
                    title={t('expenses')}
                    disabled={!primarySegment}
                  >
                    <IconReceipt2 size={15} stroke={1.8} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={'trip-city__action trip-city__note' + (primarySegment?.note ? ' has-note' : '')}
                    onClick={() => primarySegment && toggleSegmentNote?.(primarySegment.id)}
                    aria-label={t('segmentNote')}
                    title={t('segmentNote')}
                    disabled={!primarySegment}
                  >
                    <IconNote size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="trip-city__action trip-city__expand"
                    aria-expanded={!collapsed}
                    onClick={() => toggleDay(calendarDay.date)}
                    aria-label={collapsed ? t('expand') : t('collapse')}
                  >
                    {collapsed
                      ? <IconChevronRight size={15} aria-hidden="true" />
                      : <IconChevronDown size={15} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="trip-city__action trip-day__remove"
                    onClick={() => {
                      const prompt = `${t('delete')} ${t('day')} ${calendarDay.globalDayNumber}?`;
                      if (globalThis.confirm(prompt)) removeTripDay?.(calendarDay.date);
                    }}
                    aria-label={`${t('delete')} ${t('day')} ${calendarDay.globalDayNumber}`}
                    title={`${t('delete')} ${t('day')} ${calendarDay.globalDayNumber}`}
                  >
                    <IconX size={14} aria-hidden="true" />
                  </button>
                </header>

                {!collapsed && (
                  <div className="trip-places__sequence" style={{ '--trip-day-color': color }}>
                    {entries.length > 0
                      ? entries.map(({ place, groupKey, nextPlace }) => renderPlace(place, groupKey, nextPlace))
                      : <div className="trip-day__empty-row">{assignments.length ? t('dayNoPlaces') : t('tripDayNoCity')}</div>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {notePlace && (
        <div className="confirm__scrim" role="presentation" onMouseDown={() => setNotePlaceId('')}>
          <div
            className="confirm__card trip-place-note-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('placeNote')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="segnote__head">
              <span className="segnote__title">{placeLabel(notePlace, t)}</span>
              <button type="button" className="segnote__x" aria-label={t('closeNote')} onClick={() => setNotePlaceId('')}>
                <IconX size={16} aria-hidden="true" />
              </button>
            </div>
            <textarea
              className="segnote__textarea"
              value={notePlace.note || ''}
              maxLength={500}
              placeholder={t('placeNotePlaceholder')}
              onChange={(event) => updatePlace?.(notePlace.id, { note: event.target.value })}
              autoFocus
            />
            <div className="segnote__foot">
              <span className="segnote__saved" data-persistence-state={persistenceState}>
                {persistenceHasCheck && <IconCheck size={12} aria-hidden="true" />} {persistenceLabel}
              </span>
              <span className="segnote__count">{(notePlace.note || '').length} / 500</span>
            </div>
          </div>
        </div>
      )}

      <SegmentDeleteDialog
        open={Boolean(segmentToDelete)}
        onConfirm={() => {
          if (!segmentToDelete) return;
          removeSegment?.(segmentToDelete.id);
          setSegmentToDelete(null);
        }}
        onCancel={() => setSegmentToDelete(null)}
      />

      {placeToDelete && (
        <div className="confirm__scrim" role="presentation" onMouseDown={() => setPlaceToDelete(null)}>
          <div
            className="confirm__card"
            role="dialog"
            aria-modal="true"
            aria-label={t('deletePlace')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="confirm__message">
              {t('confirmDeletePlace', { name: placeLabel(placeToDelete, t) })}
            </p>
            <div className="confirm__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPlaceToDelete(null)}>
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => {
                  removePlace?.(placeToDelete.id);
                  setPlaceToDelete(null);
                }}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
