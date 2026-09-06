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
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { countryColorForIndex } from '../../config.js';
import {
  groupPlacesByPlanningDay,
  tripPlanningDays,
} from '../trips/tripDayPlanning.js';
import { flagImageUrl } from '../flags/flags.js';
import { savedPlaceRoutePairKey } from '../routes/routeModel.js';
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

function formatPlanningDate(value, intlLocale) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale || 'es-MX', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function destinationLabel(day, intlLocale, t) {
  const city = day?.destination;
  const place = [city?.name || t('city'), city?.country].filter(Boolean).join(', ');
  return `${place} · ${t('day')} ${day.globalDayNumber} · ${formatPlanningDate(day.date, intlLocale)}`;
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

function groupPlanningDaysByVisit(groups) {
  const visits = [];
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    let visit = visits.at(-1);
    if (!visit || visit.segmentId !== group.segmentId) {
      visit = {
        segmentId: group.segmentId,
        destination: group.destination,
        countryKey: countryKey(group.destination),
        days: [],
      };
      visits.push(visit);
    }
    visit.days.push(group);
  });
  return visits;
}

export function TripPlacesPanel({
  segments = [],
  places,
  routes = [],
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
  const [dragState, setDragState] = useState(null);
  const [placeDetails, setPlaceDetails] = useState({});
  const [moveMenuPlaceId, setMoveMenuPlaceId] = useState('');
  const [notePlaceId, setNotePlaceId] = useState('');
  const [collapsedVisits, setCollapsedVisits] = useState(() => new Set());
  const panelRef = useRef(null);
  const dragStateRef = useRef(null);
  const enrichmentInFlightRef = useRef(new Set());
  const enrichmentLoadedRef = useRef(new Set());
  const draggedPlaceId = dragState?.placeId || '';

  const planningDays = useMemo(() => tripPlanningDays(segments), [segments]);
  const planned = useMemo(
    () => groupPlacesByPlanningDay(places, segments),
    [places, segments]
  );
  const visits = useMemo(() => groupPlanningDaysByVisit(planned.groups), [planned.groups]);
  const colors = useMemo(() => countryColorMap(segments), [segments]);
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
    if (!draggedPlaceId) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    function visibleDropCandidates() {
      return Array.from(panel.querySelectorAll('[data-place-id]'))
        .map((element) => ({
          element,
          id: element.dataset.placeId,
          bounds: element.getBoundingClientRect(),
        }))
        .filter(({ id, bounds }) =>
          id
          && id !== draggedPlaceId
          && bounds.width > 0
          && bounds.height > 0
        )
        .sort((left, right) => left.bounds.top - right.bounds.top);
    }

    function resolveDropTarget(event) {
      const candidates = visibleDropCandidates();
      if (candidates.length === 0) return { targetId: null, placement: null };
      const samePaneCandidates = candidates.filter(
        ({ bounds }) => event.clientX >= bounds.left && event.clientX <= bounds.right
      );
      const available = samePaneCandidates.length > 0 ? samePaneCandidates : candidates;
      const first = available[0];
      const last = available[available.length - 1];

      if (event.clientY <= first.bounds.top + first.bounds.height / 2) {
        return { targetId: first.id, placement: 'before' };
      }
      if (event.clientY >= last.bounds.top + last.bounds.height / 2) {
        return { targetId: last.id, placement: 'after' };
      }

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
      const { targetId, placement } = resolveDropTarget(event);
      setDragState((current) => {
        if (!current) return current;
        const next = {
          ...current,
          offsetY: event.clientY - current.startY,
          targetId,
          placement,
        };
        dragStateRef.current = next;
        return next;
      });
    }

    function finishDrag(commit) {
      const current = dragStateRef.current;
      if (commit && current?.targetId && current.placement) {
        reorderPlace?.(current.placeId, current.targetId, current.placement);
      }
      dragStateRef.current = null;
      setDragState(null);
    }

    const handlePointerUp = () => finishDrag(true);
    const handlePointerCancel = () => finishDrag(false);
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [draggedPlaceId, reorderPlace]);

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

    const observer = new Observer(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          loadDetails(entry.target);
        });
      },
      { root: panel, rootMargin: '180px 0px', threshold: 0.01 }
    );
    candidates.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [places]);

  function confirmRemovePlace() {
    if (!placeToDelete) return;
    removePlace(placeToDelete.id);
    setPlaceToDelete(null);
  }

  function toggleVisit(segmentId) {
    setCollapsedVisits((current) => {
      const next = new Set(current);
      if (next.has(segmentId)) next.delete(segmentId);
      else next.add(segmentId);
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
    dragStateRef.current = next;
    setDragState(next);
  }

  function handleMoveKeyDown(event, placeId, groupPlaces) {
    const placeIndex = groupPlaces.findIndex((place) => place.id === placeId);
    if (event.key === 'ArrowUp' && placeIndex > 0) {
      event.preventDefault();
      reorderPlace?.(placeId, groupPlaces[placeIndex - 1].id, 'before');
    }
    if (event.key === 'ArrowDown' && placeIndex < groupPlaces.length - 1) {
      event.preventDefault();
      reorderPlace?.(placeId, groupPlaces[placeIndex + 1].id, 'after');
    }
  }

  function renderPlace(place, groupKey, groupPlaces, nextPlace = null) {
    const dragging = dragState?.placeId === place.id;
    const dropPlacement = dragState?.targetId === place.id
      ? dragState.placement
      : null;
    const className = [
      'trip-place',
      dragging ? 'is-dragging' : '',
      dropPlacement === 'before' ? 'is-drop-before' : '',
      dropPlacement === 'after' ? 'is-drop-after' : '',
    ].filter(Boolean).join(' ');
    const label = placeLabel(place, t);
    const details = placeDetails[place.id] || {};
    const hours = formattedOpeningHours(details.openingHours, intlLocale);
    const pairKey = nextPlace ? `${place.id}\u0000${nextPlace.id}` : '';
    const route = pairKey ? routeByPair.get(pairKey) : null;

    return (
      <div className="trip-place-block" key={place.id}>
        <article
          className={className}
          data-place-id={place.id}
          data-planning-group={groupKey}
          style={dragging
            ? { '--trip-place-drag-y': `${dragState.offsetY}px` }
            : undefined}
        >
          <span className="trip-place__timeline-dot" aria-hidden="true" />
          <div className="trip-place__surface">
            <span className="trip-place__move-wrap" data-place-move-menu>
              <button
                type="button"
                className="trip-place__drag"
                onPointerDown={(event) => startPlaceDrag(event, place.id)}
                onKeyDown={(event) => handleMoveKeyDown(event, place.id, groupPlaces)}
                onClick={() => setMoveMenuPlaceId((current) => current === place.id ? '' : place.id)}
                aria-label={t('movePlace')}
                title={t('movePlace')}
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
              <strong>{label}</strong>
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
              title={t('placeNote')}
            >
              <IconNote size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="trip-place__delete"
              onClick={() => setPlaceToDelete(place)}
              aria-label={t('delete')}
            >
              <IconTrash size={14} aria-hidden="true" />
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

  const hasAnyPlaces = places.length > 0;
  const hasPlanningDays = planningDays.length > 0;

  return (
    <>
      <div
        className={'trip-places' + (!hasAnyPlaces && !hasPlanningDays ? ' trip-places--empty' : '')}
        ref={panelRef}
      >
        {!hasPlanningDays && !hasAnyPlaces && (
          <>
            <IconMapPin size={22} aria-hidden="true" />
            <strong>{t('noPlanningDaysTitle')}</strong>
            <span>{t('noPlanningDaysHint')}</span>
          </>
        )}

        {hasPlanningDays && (
          <div className="trip-places__cities">
            {visits.map((visit, visitIndex) => {
              const city = visit.destination;
              const color = colorForDestination(city, colors);
              const collapsed = collapsedVisits.has(visit.segmentId);
              const beginsCountry = visitIndex > 0
                && visits[visitIndex - 1].countryKey !== visit.countryKey;
              return (
                <section
                  className={'trip-city' + (beginsCountry ? ' is-country-start' : '')}
                  style={{ '--trip-day-color': color }}
                  key={visit.segmentId}
                >
                  <button
                    type="button"
                    className="trip-city__toggle"
                    aria-expanded={!collapsed}
                    onClick={() => toggleVisit(visit.segmentId)}
                  >
                    <CountryFlag city={city} />
                    <span className="trip-city__heading">
                      <strong>{[city?.name || t('city'), city?.country].filter(Boolean).join(', ')}</strong>
                    </span>
                    {collapsed
                      ? <IconChevronRight size={15} aria-hidden="true" />
                      : <IconChevronDown size={15} aria-hidden="true" />}
                  </button>

                  {!collapsed && (
                    <div className="trip-city__days">
                      {visit.days.map((group) => (
                        <section className="trip-day" key={group.key}>
                          <header className="trip-day__header">
                            <span className="trip-day__node" aria-hidden="true" />
                            <span className="trip-day__heading">
                              <strong>{t('day')} {group.globalDayNumber} · {formatPlanningDate(group.date, intlLocale)}</strong>
                            </span>
                          </header>
                          <div className="trip-day__rail" aria-hidden="true" />
                          <div className="trip-places__sequence">
                            {group.places.length > 0
                              ? group.places.map((place, index) => renderPlace(
                                  place,
                                  group.key,
                                  group.places,
                                  group.places[index + 1] || null
                                ))
                              : <div className="trip-day__empty-row">{t('dayNoPlaces')}</div>}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {planned.unassigned.length > 0 && (
          <section className="trip-city trip-city--unassigned">
            <div className="trip-city__unassigned-header">
              <span className="trip-place__flag-fallback" aria-hidden="true"><IconMapPin size={15} /></span>
              <span className="trip-city__heading">
                <strong>{t('unassignedPlaces')}</strong>
                <small>{t('unassignedPlacesHint')}</small>
              </span>
            </div>
            <div className="trip-places__sequence trip-places__sequence--unassigned">
              {planned.unassigned.map((place) => renderPlace(
                place,
                'unassigned',
                planned.unassigned,
                null
              ))}
            </div>
          </section>
        )}
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
