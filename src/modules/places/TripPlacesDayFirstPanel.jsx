import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconGripVertical,
  IconMapPin,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { countryColorForIndex } from '../../config.js';
import {
  groupPlacesByItineraryDay,
  itineraryAssignmentsByDay,
  itineraryCalendarDays,
  placeTripDayOffset,
} from '../trips/globalTripDayPlanning.js';
import { savedPlaceRoutePairKey } from '../routes/routeModel.js';
import { TripRouteConnections } from './TripRouteConnections.jsx';
import './TripPlacesPanel.css';

const PERSISTENCE_LABEL_KEYS = Object.freeze({
  saved: 'persistenceSaved',
  pending: 'persistencePending',
  local: 'persistenceLocal',
  syncing: 'persistenceSyncing',
  conflict: 'persistenceConflict',
  error: 'persistenceError',
});

const DAY_FIRST_STYLES = `
.trip-day-first{padding-top:8px}.trip-day-first__days{display:flex;flex-direction:column}.trip-day-first__day{position:relative;border-bottom:1px solid #eef1f4}.trip-day-first__day.is-day-dragging{z-index:20;background:rgba(255,255,255,.96);border-radius:8px;box-shadow:0 8px 22px rgba(15,23,42,.11)}.trip-day-first__day.is-day-drop-before:before,.trip-day-first__day.is-day-drop-after:after{content:'';position:absolute;z-index:30;right:8px;left:8px;height:2px;border-radius:999px;background:var(--atlas-accent)}.trip-day-first__day.is-day-drop-before:before{top:-1px}.trip-day-first__day.is-day-drop-after:after{bottom:-1px}.trip-day-first__header{display:grid;min-height:46px;grid-template-columns:24px auto minmax(0,1fr) 28px 28px;align-items:center;column-gap:6px;padding:4px 5px 4px 1px;background:#fff}.trip-day-first__header>strong{color:#263445;font-size:12.5px;font-weight:760;white-space:nowrap}.trip-day-first__date{overflow:hidden;color:#5f6875;font-size:12px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.trip-day-first__drag,.trip-day-first__note,.trip-day-first__toggle{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;padding:0;border:0;border-radius:6px;background:transparent;color:#9ca3af}.trip-day-first__drag{cursor:grab;touch-action:none}.trip-day-first__drag:active{cursor:grabbing}.trip-day-first__drag:hover,.trip-day-first__drag:focus-visible,.trip-day-first__note:hover,.trip-day-first__note:focus-visible,.trip-day-first__toggle:hover,.trip-day-first__toggle:focus-visible{background:#eef2f6;color:#475569;outline:none}.trip-day-first__note.has-note{color:#23647a}.trip-day-first__note:disabled{opacity:.35;cursor:default}.trip-day-first__places{--trip-timeline-x:12px;position:relative;display:flex;flex-direction:column;padding-bottom:4px}.trip-day-first__rail{position:absolute;z-index:0;top:24px;bottom:28px;left:var(--trip-timeline-x);width:2px;transform:translateX(-50%);background:var(--trip-day-rail-color,#64748b);pointer-events:none}.trip-day-first__empty{padding-left:35px;font-style:normal}.trip-day-first-place-block{--trip-day-color:var(--trip-place-country-color,#64748b);position:relative}.trip-day-first-place{--trip-day-color:var(--trip-place-country-color,#64748b)}.trip-day-first-place:before,.trip-day-first-place:after{content:none}.trip-day-first-place .trip-place__timeline-dot{background:var(--trip-place-country-color,#64748b);box-shadow:0 0 0 1px var(--trip-place-country-color,#64748b)}.trip-day-first-place__info strong{font-weight:650}.trip-day-first-place__location{color:#475569;font-weight:500}.trip-day-first-connection{--trip-day-color:var(--trip-place-country-color,#64748b);position:relative}.trip-day-first-connection .trip-connection{position:relative}.trip-day-first-connection .trip-connection__rail{display:none}@media(max-width:560px){.trip-day-first__header{grid-template-columns:24px auto minmax(0,1fr) 28px 28px;column-gap:4px}.trip-day-first__header>strong{font-size:12px}.trip-day-first__date{font-size:11px}}
`;

function persistenceLabelKey(state) {
  return PERSISTENCE_LABEL_KEYS[state] || PERSISTENCE_LABEL_KEYS.pending;
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

function countryKey(value) {
  const code = String(value?.countryCode || '').trim().toUpperCase();
  if (code) return code;
  return String(value?.country || '').trim().toLowerCase() || 'unknown';
}

function countryColors(segments, places) {
  const result = new Map();
  const register = (value) => {
    const key = countryKey(value);
    if (key === 'unknown' || result.has(key)) return;
    result.set(key, countryColorForIndex(result.size));
  };
  (segments || []).forEach((segment) => register(segment?.destination));
  (places || []).forEach(register);
  return result;
}

function placeTitle(place, t) {
  return place?.name || place?.userLabel || t('place');
}

function placeGeography(place, segmentById) {
  const destination = segmentById.get(place?.segmentId)?.destination || null;
  const city = place?.city || destination?.name || '';
  const country = place?.country || destination?.country || '';
  return [city, country].filter(Boolean).join(', ');
}

function placeCountry(place, segmentById) {
  const destination = segmentById.get(place?.segmentId)?.destination || null;
  return {
    countryCode: place?.countryCode || destination?.countryCode || '',
    country: place?.country || destination?.country || '',
  };
}

export function TripPlacesDayFirstPanel({
  segments = [],
  places = [],
  routes = [],
  toggleSegmentNote,
  updatePlace,
  removePlace,
  reorderPlace,
  reorderTripDay,
  movePlaceToDay,
  upsertRoute,
  setRouteVisibility,
  setAllRouteVisibility,
  persistenceState = 'saved',
  t,
  intlLocale,
}) {
  const panelRef = useRef(null);
  const placeDragRef = useRef(null);
  const dayDragRef = useRef(null);
  const [placeDrag, setPlaceDrag] = useState(null);
  const [dayDrag, setDayDrag] = useState(null);
  const [collapsedDays, setCollapsedDays] = useState(() => new Set());
  const [moveMenuPlaceId, setMoveMenuPlaceId] = useState('');
  const [notePlaceId, setNotePlaceId] = useState('');
  const [placeToDelete, setPlaceToDelete] = useState(null);

  const calendarDays = useMemo(() => itineraryCalendarDays(segments), [segments]);
  const grouped = useMemo(() => groupPlacesByItineraryDay(places, segments), [places, segments]);
  const assignmentsByDay = useMemo(() => itineraryAssignmentsByDay(segments), [segments]);
  const segmentById = useMemo(() => new Map(segments.map((segment) => [segment.id, segment])), [segments]);
  const colors = useMemo(() => countryColors(segments, places), [segments, places]);
  const routeByPair = useMemo(
    () => new Map(routes.map((route) => [savedPlaceRoutePairKey(route), route])),
    [routes]
  );
  const notePlace = notePlaceId
    ? places.find((place) => place.id === notePlaceId) || null
    : null;
  const persistenceLabel = t(persistenceLabelKey(persistenceState));
  const persistenceHasCheck = persistenceState === 'saved' || persistenceState === 'local';

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
    const draggedPlaceId = placeDrag?.placeId;
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
      if (!days.length) return { targetOffset: null, targetId: null, placement: null };

      const hovered = days.find(({ bounds }) =>
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      );
      const day = hovered || days.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);
      if (!day) return { targetOffset: null, targetId: null, placement: null };

      const candidates = Array.from(
        panel.querySelectorAll(`[data-trip-day-offset="${day.offset}"] [data-place-id]`)
      )
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
        placement: nearest
          ? (event.clientY >= nearest.bounds.top + nearest.bounds.height / 2 ? 'after' : 'before')
          : null,
      };
    };

    const move = (event) => {
      event.preventDefault();
      const current = placeDragRef.current;
      if (!current) return;
      const next = {
        ...current,
        offsetY: event.clientY - current.startY,
        ...resolveTarget(event),
      };
      placeDragRef.current = next;
      setPlaceDrag(next);
    };

    const finish = (commit) => {
      const current = placeDragRef.current;
      if (commit && current && Number.isInteger(current.targetOffset)) {
        const source = places.find((place) => place.id === current.placeId);
        const sourceOffset = source ? placeTripDayOffset(source, segments) : null;
        if (sourceOffset !== current.targetOffset) {
          movePlaceToDay?.(current.placeId, current.targetOffset);
        } else if (current.targetId && current.placement) {
          reorderPlace?.(current.placeId, current.targetId, current.placement);
        }
      }
      placeDragRef.current = null;
      setPlaceDrag(null);
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
  }, [placeDrag?.placeId, places, segments, movePlaceToDay, reorderPlace]);

  useEffect(() => {
    const sourceOffset = dayDrag?.sourceOffset;
    if (!Number.isInteger(sourceOffset)) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    const active = (event) => {
      const current = dayDragRef.current;
      return current?.pointerId === event.pointerId ? current : null;
    };
    const move = (event) => {
      const current = active(event);
      if (!current) return;
      event.preventDefault();
      const candidates = Array.from(panel.querySelectorAll('[data-trip-day-offset]'))
        .map((element) => ({
          offset: Number(element.dataset.tripDayOffset),
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ offset }) => Number.isInteger(offset) && offset !== current.sourceOffset);
      if (!candidates.length) return;
      const nearest = candidates.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);
      const next = {
        ...current,
        offsetY: event.clientY - current.startY,
        targetOffset: nearest.offset,
        placement: event.clientY >= nearest.bounds.top + nearest.bounds.height / 2
          ? 'after'
          : 'before',
      };
      dayDragRef.current = next;
      setDayDrag(next);
    };
    const finish = (event, commit) => {
      const current = active(event);
      if (!current) return;
      dayDragRef.current = null;
      setDayDrag(null);
      if (commit && Number.isInteger(current.targetOffset)) {
        reorderTripDay?.(current.sourceOffset, current.targetOffset, current.placement);
      }
    };
    const up = (event) => finish(event, true);
    const cancel = (event) => finish(event, false);
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
    };
  }, [dayDrag?.sourceOffset, reorderTripDay]);

  function startPlaceDrag(event, placeId) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const next = {
      placeId,
      startY: event.clientY,
      offsetY: 0,
      targetOffset: null,
      targetId: null,
      placement: null,
    };
    placeDragRef.current = next;
    setPlaceDrag(next);
  }

  function startDayDrag(event, sourceOffset) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next = {
      sourceOffset,
      pointerId: event.pointerId,
      startY: event.clientY,
      offsetY: 0,
      targetOffset: null,
      placement: null,
    };
    dayDragRef.current = next;
    setDayDrag(next);
  }

  function toggleDay(date) {
    setCollapsedDays((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function confirmRemovePlace() {
    if (!placeToDelete) return;
    removePlace?.(placeToDelete.id);
    setPlaceToDelete(null);
  }

  function renderPlace(place, nextPlace = null) {
    const dragging = placeDrag?.placeId === place.id;
    const pairKey = nextPlace ? `${place.id}\u0000${nextPlace.id}` : '';
    const route = pairKey ? routeByPair.get(pairKey) : null;
    const country = placeCountry(place, segmentById);
    const color = colors.get(countryKey(country)) || countryColorForIndex(0);
    const geography = placeGeography(place, segmentById);

    return (
      <div className="trip-day-first-place-block" key={place.id} style={{ '--trip-place-country-color': color }}>
        <article
          className={'trip-place trip-day-first-place' + (dragging ? ' is-dragging' : '')}
          data-place-id={place.id}
          style={dragging ? { '--trip-place-drag-y': `${placeDrag.offsetY}px` } : undefined}
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
                title={t('movePlace')}
              >
                <IconGripVertical size={15} aria-hidden="true" />
              </button>
              {moveMenuPlaceId === place.id && (
                <div className="trip-place__move-menu" role="menu">
                  <strong>{t('movePlaceTo')}</strong>
                  {calendarDays.map((day) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={day.date}
                      onClick={() => {
                        movePlaceToDay?.(place.id, day.tripDayOffset);
                        setMoveMenuPlaceId('');
                      }}
                    >
                      {`${String(t('day')).toUpperCase()} ${day.globalDayNumber} - ${formatDayDate(day.date, intlLocale)}`}
                    </button>
                  ))}
                </div>
              )}
            </span>

            <span className="trip-place__info trip-day-first-place__info">
              <strong>
                {placeTitle(place, t)}
                {geography && <span className="trip-day-first-place__location">, {geography}</span>}
              </strong>
            </span>

            <button
              type="button"
              className={'trip-place__note' + (place.note ? ' has-note' : '')}
              onClick={() => setNotePlaceId(place.id)}
              aria-label={t('placeNote')}
              title={t('placeNote')}
            >
              <IconNote size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="trip-place__delete"
              onClick={() => setPlaceToDelete(place)}
              aria-label={t('delete')}
              title={t('delete')}
            >
              <IconX size={14} aria-hidden="true" />
            </button>
          </div>
        </article>

        {nextPlace && (
          <div className="trip-day-first-connection" style={{ '--trip-place-country-color': color }}>
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
          </div>
        )}
      </div>
    );
  }

  if (!calendarDays.length) {
    return (
      <div className="trip-places trip-places--empty" ref={panelRef}>
        <style>{DAY_FIRST_STYLES}</style>
        <IconMapPin size={22} aria-hidden="true" />
        <strong>{t('noPlanningDaysTitle')}</strong>
        <span>{t('noPlanningDaysHint')}</span>
      </div>
    );
  }

  return (
    <>
      <style>{DAY_FIRST_STYLES}</style>
      <div className="trip-places trip-day-first" ref={panelRef}>
        <div className="trip-day-first__days">
          {grouped.groups.map((day) => {
            const collapsed = collapsedDays.has(day.date);
            const dayAssignments = assignmentsByDay.get(day.tripDayOffset) || [];
            const noteSegment = dayAssignments[0]?.segment || null;
            const dayDragging = dayDrag?.sourceOffset === day.tripDayOffset;
            const dropPlacement = dayDrag?.targetOffset === day.tripDayOffset
              ? dayDrag.placement
              : null;
            const firstPlaceCountry = day.places[0]
              ? placeCountry(day.places[0], segmentById)
              : null;
            const railColor = firstPlaceCountry
              ? colors.get(countryKey(firstPlaceCountry)) || countryColorForIndex(0)
              : countryColorForIndex(0);

            return (
              <section
                className={[
                  'trip-day-first__day',
                  dayDragging ? 'is-day-dragging' : '',
                  dropPlacement === 'before' ? 'is-day-drop-before' : '',
                  dropPlacement === 'after' ? 'is-day-drop-after' : '',
                ].filter(Boolean).join(' ')}
                key={day.date}
                data-trip-day-offset={day.tripDayOffset}
                style={dayDragging ? {
                  transform: `translateY(${dayDrag.offsetY}px)`,
                  pointerEvents: 'none',
                  zIndex: 20,
                } : undefined}
              >
                <header className="trip-day-first__header">
                  <button
                    type="button"
                    className="trip-day-first__drag"
                    onPointerDown={(event) => startDayDrag(event, day.tripDayOffset)}
                    aria-label={`${t('day')} ${day.globalDayNumber}`}
                    title={`${t('day')} ${day.globalDayNumber}`}
                  >
                    <IconGripVertical size={15} aria-hidden="true" />
                  </button>
                  <strong>{String(t('day')).toUpperCase()} {day.globalDayNumber}</strong>
                  <span className="trip-day-first__date">- {formatDayDate(day.date, intlLocale)}</span>
                  <button
                    type="button"
                    className={'trip-day-first__note' + (noteSegment?.note ? ' has-note' : '')}
                    onClick={() => noteSegment && toggleSegmentNote?.(noteSegment.id)}
                    disabled={!noteSegment}
                    aria-label={t('segmentNote')}
                    title={t('segmentNote')}
                  >
                    <IconNote size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="trip-day-first__toggle"
                    aria-expanded={!collapsed}
                    onClick={() => toggleDay(day.date)}
                    aria-label={collapsed ? t('expand') : t('collapse')}
                    title={collapsed ? t('expand') : t('collapse')}
                  >
                    {collapsed
                      ? <IconChevronRight size={15} aria-hidden="true" />
                      : <IconChevronDown size={15} aria-hidden="true" />}
                  </button>
                </header>

                {!collapsed && (
                  <div className="trip-day-first__places" style={{ '--trip-day-rail-color': railColor }}>
                    {day.places.length > 1 && (
                      <span className="trip-day-first__rail" aria-hidden="true" />
                    )}
                    {day.places.length > 0
                      ? day.places.map((place, index) => renderPlace(
                          place,
                          day.places[index + 1] || null
                        ))
                      : <div className="trip-day__empty-row trip-day-first__empty">{t('dayNoPlaces')}</div>}
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
              <span className="segnote__title">{placeTitle(notePlace, t)}</span>
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
              {t('confirmDeletePlace', { name: placeTitle(placeToDelete, t) })}
            </p>
            <div className="confirm__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPlaceToDelete(null)}>
                {t('cancel')}
              </button>
              <button type="button" className="btn btn--danger btn--sm" onClick={confirmRemovePlace}>
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
