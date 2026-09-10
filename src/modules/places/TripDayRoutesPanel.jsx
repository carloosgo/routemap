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
  groupPlacesByTripDay,
  segmentIdsForTripDay,
} from '../trips/tripGlobalDays.js';
import { ORIGIN_NOTE_TARGET } from '../trips/tripNoteTargets.js';
import { savedPlaceRoutePairKey } from '../routes/routeModel.js';
import { TripRouteConnections } from './TripRouteConnections.jsx';
import './TripPlacesPanel.css';
import './TripDayRoutesPanel.css';

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

function normalizedCountryKey(countryCode, country) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return `code:${code}`;
  const name = String(country || '').trim().toLocaleLowerCase();
  return name ? `name:${name}` : 'unknown';
}

function placePresentation(place, segmentById, t) {
  const destination = segmentById.get(place?.segmentId)?.destination || null;
  return {
    title: place?.name || place?.userLabel || t('place'),
    city: place?.city || destination?.name || '',
    country: place?.country || destination?.country || '',
    countryCode: place?.countryCode || destination?.countryCode || '',
  };
}

function buildCountryColors(trip, places, segmentById) {
  const colors = new Map();
  const register = (countryCode, country) => {
    const key = normalizedCountryKey(countryCode, country);
    if (key === 'unknown' || colors.has(key)) return;
    colors.set(key, countryColorForIndex(colors.size));
  };

  (trip?.segments || []).forEach((segment) => {
    register(segment?.destination?.countryCode, segment?.destination?.country);
  });
  (places || []).forEach((place) => {
    const destination = segmentById.get(place?.segmentId)?.destination || null;
    register(
      place?.countryCode || destination?.countryCode,
      place?.country || destination?.country
    );
  });

  return colors;
}

function colorForPlace(place, segmentById, colors) {
  const destination = segmentById.get(place?.segmentId)?.destination || null;
  const key = normalizedCountryKey(
    place?.countryCode || destination?.countryCode,
    place?.country || destination?.country
  );
  return colors.get(key) || countryColorForIndex(0);
}

function dayNoteTarget(trip, day) {
  const segmentId = segmentIdsForTripDay(trip, day.tripDayOffset)[0];
  if (segmentId) return segmentId;
  if (
    day.tripDayOffset === 0
    && trip?.originDetails?.departureDate
    && trip.originDetails.departureDate === day.date
  ) {
    return ORIGIN_NOTE_TARGET;
  }
  return null;
}

function dayHasNote(trip, target) {
  if (!target) return false;
  if (target === ORIGIN_NOTE_TARGET) return Boolean(trip?.originDetails?.note);
  return Boolean((trip?.segments || []).find((segment) => segment.id === target)?.note);
}

function placeText(presentation) {
  return [presentation.title, presentation.city, presentation.country]
    .filter(Boolean)
    .join(', ');
}

export function TripDayRoutesPanel({
  trip,
  places = [],
  routes = [],
  updatePlace,
  removePlace,
  reorderPlace,
  movePlaceToDay,
  reorderTripDay,
  toggleDayNote,
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
  const [notePlaceId, setNotePlaceId] = useState('');
  const [placeToDelete, setPlaceToDelete] = useState(null);

  const groups = useMemo(
    () => groupPlacesByTripDay(trip, places),
    [trip, places]
  );
  const segmentById = useMemo(
    () => new Map((trip?.segments || []).map((segment) => [segment.id, segment])),
    [trip?.segments]
  );
  const colors = useMemo(
    () => buildCountryColors(trip, places, segmentById),
    [trip, places, segmentById]
  );
  const routeByPair = useMemo(
    () => new Map((routes || []).map((route) => [savedPlaceRoutePairKey(route), route])),
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
    if (!placeDrag?.placeId) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    function resolveTarget(event) {
      const candidates = Array.from(panel.querySelectorAll('.trip-day-route[data-trip-day-offset]'))
        .map((element) => ({
          element,
          offset: Number(element.dataset.tripDayOffset),
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ offset, bounds }) => (
          Number.isInteger(offset) && bounds.width > 0 && bounds.height > 0
        ));
      if (!candidates.length) return null;

      const containing = candidates.find(({ bounds }) => (
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      ));
      const day = containing || candidates.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);
      if (!day) return null;

      const placeCandidates = Array.from(day.element.querySelectorAll('[data-place-id]'))
        .filter((element) => element.dataset.placeId !== placeDrag.placeId)
        .map((element) => ({
          id: element.dataset.placeId,
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ id, bounds }) => id && bounds.width > 0 && bounds.height > 0);

      if (!placeCandidates.length) {
        return {
          targetDayOffset: day.offset,
          targetPlaceId: '',
          placement: 'after',
        };
      }

      const nearest = placeCandidates.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { candidate, distance } : best;
      }, null).candidate;

      return {
        targetDayOffset: day.offset,
        targetPlaceId: nearest.id,
        placement: event.clientY >= nearest.bounds.top + nearest.bounds.height / 2
          ? 'after'
          : 'before',
      };
    }

    function handlePointerMove(event) {
      event.preventDefault();
      const target = resolveTarget(event);
      setPlaceDrag((current) => {
        if (!current) return current;
        const next = {
          ...current,
          offsetY: event.clientY - current.startY,
          ...(target || {}),
        };
        placeDragRef.current = next;
        return next;
      });
    }

    function finish(commit) {
      const current = placeDragRef.current;
      if (commit && current && Number.isInteger(current.targetDayOffset)) {
        if (current.targetDayOffset !== current.sourceTripDayOffset) {
          movePlaceToDay?.(
            current.placeId,
            current.targetDayOffset,
            current.targetPlaceId || '',
            current.placement || 'after'
          );
        } else if (current.targetPlaceId && current.targetPlaceId !== current.placeId) {
          reorderPlace?.(
            current.placeId,
            current.targetPlaceId,
            current.placement || 'before'
          );
        }
      }
      placeDragRef.current = null;
      setPlaceDrag(null);
    }

    const handlePointerUp = () => finish(true);
    const handlePointerCancel = () => finish(false);
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [movePlaceToDay, placeDrag?.placeId, reorderPlace]);

  useEffect(() => {
    if (!Number.isInteger(dayDrag?.sourceTripDayOffset)) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    function resolveTarget(event) {
      const candidates = Array.from(panel.querySelectorAll('.trip-day-route[data-trip-day-offset]'))
        .map((element) => ({
          offset: Number(element.dataset.tripDayOffset),
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ offset, bounds }) => (
          Number.isInteger(offset)
          && offset !== dayDrag.sourceTripDayOffset
          && bounds.width > 0
          && bounds.height > 0
        ));
      if (!candidates.length) return null;

      const nearest = candidates.reduce((best, candidate) => {
        const midpoint = candidate.bounds.top + candidate.bounds.height / 2;
        const distance = Math.abs(event.clientY - midpoint);
        return !best || distance < best.distance ? { candidate, distance } : best;
      }, null).candidate;
      return {
        targetTripDayOffset: nearest.offset,
        placement: event.clientY >= nearest.bounds.top + nearest.bounds.height / 2
          ? 'after'
          : 'before',
      };
    }

    function handlePointerMove(event) {
      event.preventDefault();
      const target = resolveTarget(event);
      setDayDrag((current) => {
        if (!current) return current;
        const next = {
          ...current,
          offsetY: event.clientY - current.startY,
          ...(target || {}),
        };
        dayDragRef.current = next;
        return next;
      });
    }

    function finish(commit) {
      const current = dayDragRef.current;
      if (commit && current && Number.isInteger(current.targetTripDayOffset)) {
        reorderTripDay?.(
          current.sourceTripDayOffset,
          current.targetTripDayOffset,
          current.placement || 'before'
        );
      }
      dayDragRef.current = null;
      setDayDrag(null);
    }

    const handlePointerUp = () => finish(true);
    const handlePointerCancel = () => finish(false);
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [dayDrag?.sourceTripDayOffset, reorderTripDay]);

  function toggleDay(offset) {
    setCollapsedDays((current) => {
      const next = new Set(current);
      if (next.has(offset)) next.delete(offset);
      else next.add(offset);
      return next;
    });
  }

  function startPlaceDrag(event, place, sourceTripDayOffset) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const next = {
      placeId: place.id,
      sourceTripDayOffset,
      startY: event.clientY,
      offsetY: 0,
      targetDayOffset: sourceTripDayOffset,
      targetPlaceId: '',
      placement: 'after',
    };
    placeDragRef.current = next;
    setPlaceDrag(next);
  }

  function startDayDrag(event, sourceTripDayOffset) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const next = {
      sourceTripDayOffset,
      startY: event.clientY,
      offsetY: 0,
      targetTripDayOffset: null,
      placement: null,
    };
    dayDragRef.current = next;
    setDayDrag(next);
  }

  function handlePlaceMoveKeyDown(event, place, group) {
    const index = group.places.findIndex((candidate) => candidate.id === place.id);
    if (event.altKey && event.key === 'ArrowUp' && group.tripDayOffset > 0) {
      event.preventDefault();
      movePlaceToDay?.(place.id, group.tripDayOffset - 1);
      return;
    }
    if (
      event.altKey
      && event.key === 'ArrowDown'
      && group.tripDayOffset < groups.length - 1
    ) {
      event.preventDefault();
      movePlaceToDay?.(place.id, group.tripDayOffset + 1);
      return;
    }
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      reorderPlace?.(place.id, group.places[index - 1].id, 'before');
    }
    if (event.key === 'ArrowDown' && index < group.places.length - 1) {
      event.preventDefault();
      reorderPlace?.(place.id, group.places[index + 1].id, 'after');
    }
  }

  function handleDayMoveKeyDown(event, offset) {
    if (event.key === 'ArrowUp' && offset > 0) {
      event.preventDefault();
      reorderTripDay?.(offset, offset - 1, 'before');
    }
    if (event.key === 'ArrowDown' && offset < groups.length - 1) {
      event.preventDefault();
      reorderTripDay?.(offset, offset + 1, 'after');
    }
  }

  function confirmRemovePlace() {
    if (!placeToDelete) return;
    removePlace?.(placeToDelete.id);
    setPlaceToDelete(null);
  }

  if (!groups.length) {
    return (
      <div className="trip-day-routes trip-day-routes--empty">
        <IconMapPin size={22} aria-hidden="true" />
        <strong>{t('noPlanningDaysTitle')}</strong>
        <span>{t('noPlanningDaysHint')}</span>
      </div>
    );
  }

  return (
    <>
      <div className="trip-day-routes" ref={panelRef}>
        {groups.map((group) => {
          const collapsed = collapsedDays.has(group.tripDayOffset);
          const noteTarget = dayNoteTarget(trip, group);
          const draggingDay = dayDrag?.sourceTripDayOffset === group.tripDayOffset;
          const dayDrop = dayDrag?.targetTripDayOffset === group.tripDayOffset
            ? dayDrag.placement
            : null;

          return (
            <section
              className={[
                'trip-day-route',
                draggingDay ? 'is-dragging' : '',
                dayDrop === 'before' ? 'is-drop-before' : '',
                dayDrop === 'after' ? 'is-drop-after' : '',
              ].filter(Boolean).join(' ')}
              key={group.key}
              data-trip-day-offset={group.tripDayOffset}
              style={draggingDay
                ? { '--trip-day-drag-y': `${dayDrag.offsetY}px` }
                : undefined}
            >
              <header className="trip-day-route__header">
                <button
                  type="button"
                  className="trip-day-route__drag"
                  onPointerDown={(event) => startDayDrag(event, group.tripDayOffset)}
                  onKeyDown={(event) => handleDayMoveKeyDown(event, group.tripDayOffset)}
                  aria-label={t('move')}
                  title={t('move')}
                >
                  <IconGripVertical size={16} aria-hidden="true" />
                </button>

                <strong className="trip-day-route__title">
                  {String(t('day')).toLocaleUpperCase(intlLocale || 'es-MX')} {group.globalDayNumber}
                  {' - '}
                  {formatDayDate(group.date, intlLocale)}
                </strong>

                <button
                  type="button"
                  className="trip-day-route__action"
                  onClick={() => toggleDay(group.tripDayOffset)}
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? t('expand') : t('collapse')}
                >
                  {collapsed
                    ? <IconChevronRight size={16} aria-hidden="true" />
                    : <IconChevronDown size={16} aria-hidden="true" />}
                </button>

                <button
                  type="button"
                  className={'trip-day-route__action' + (dayHasNote(trip, noteTarget) ? ' has-note' : '')}
                  onClick={() => noteTarget && toggleDayNote?.(noteTarget)}
                  disabled={!noteTarget}
                  aria-label={t('segmentNote')}
                  title={t('segmentNote')}
                >
                  <IconNote size={15} aria-hidden="true" />
                </button>
              </header>

              {!collapsed && (
                <div className="trip-day-route__places">
                  {group.places.length === 0 && (
                    <div className="trip-day-route__empty">{t('dayNoPlaces')}</div>
                  )}

                  {group.places.map((place, index) => {
                    const nextPlace = group.places[index + 1] || null;
                    const presentation = placePresentation(place, segmentById, t);
                    const color = colorForPlace(place, segmentById, colors);
                    const draggingPlace = placeDrag?.placeId === place.id;
                    const pairKey = nextPlace ? `${place.id}\u0000${nextPlace.id}` : '';
                    const route = pairKey ? routeByPair.get(pairKey) : null;

                    return (
                      <div
                        className="trip-day-place-block"
                        key={place.id}
                        style={{ '--trip-country-color': color }}
                      >
                        <article
                          className={'trip-day-place' + (draggingPlace ? ' is-dragging' : '')}
                          data-place-id={place.id}
                          style={draggingPlace
                            ? { '--trip-place-drag-y': `${placeDrag.offsetY}px` }
                            : undefined}
                        >
                          <span className="trip-day-place__node" aria-hidden="true" />
                          <button
                            type="button"
                            className="trip-day-place__drag"
                            onPointerDown={(event) => startPlaceDrag(event, place, group.tripDayOffset)}
                            onKeyDown={(event) => handlePlaceMoveKeyDown(event, place, group)}
                            aria-label={t('movePlace')}
                            title={t('movePlace')}
                          >
                            <IconGripVertical size={15} aria-hidden="true" />
                          </button>
                          <span className="trip-day-place__info" title={placeText(presentation)}>
                            <strong>{presentation.title}</strong>
                            {(presentation.city || presentation.country) && (
                              <span>
                                {presentation.city ? `, ${presentation.city}` : ''}
                                {presentation.country ? `, ${presentation.country}` : ''}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            className={'trip-day-place__action' + (place.note ? ' has-note' : '')}
                            onClick={() => setNotePlaceId(place.id)}
                            aria-label={t('placeNote')}
                            title={t('placeNote')}
                          >
                            <IconNote size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="trip-day-place__action trip-day-place__delete"
                            onClick={() => setPlaceToDelete(place)}
                            aria-label={t('delete')}
                            title={t('delete')}
                          >
                            <IconX size={14} aria-hidden="true" />
                          </button>
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
                  })}
                </div>
              )}
            </section>
          );
        })}
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
              <span className="segnote__title">
                {placeText(placePresentation(notePlace, segmentById, t))}
              </span>
              <button
                type="button"
                className="segnote__x"
                aria-label={t('closeNote')}
                onClick={() => setNotePlaceId('')}
              >
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
              {t('confirmDeletePlace', {
                name: placeText(placePresentation(placeToDelete, segmentById, t)),
              })}
            </p>
            <div className="confirm__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setPlaceToDelete(null)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={confirmRemovePlace}
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
