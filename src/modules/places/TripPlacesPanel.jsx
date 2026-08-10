import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconClock,
  IconExternalLink,
  IconGripVertical,
  IconMapPin,
  IconTrash,
} from '@tabler/icons-react';
import { flagImageUrl } from '../flags/flags.js';
import { savedPlaceRoutePairKey } from '../routes/routeModel.js';
import {
  fetchGeoapifyPlaceEnrichment,
  placeEnrichmentIsFresh,
} from './geoapifyPlaceEnrichmentClient.js';
import { TripRouteConnections } from './TripRouteConnections.jsx';
import './TripPlacesPanel.css';

const DAY_LABELS = Object.freeze({
  es: { Mo: 'Lun', Tu: 'Mar', We: 'Mié', Th: 'Jue', Fr: 'Vie', Sa: 'Sáb', Su: 'Dom', PH: 'Festivos' },
  en: { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun', PH: 'Holidays' },
});

function CountryFlag({ place }) {
  if (!place?.countryCode) {
    return (
      <span className="trip-place__flag-fallback" aria-hidden="true">
        <IconMapPin size={15} />
      </span>
    );
  }
  return (
    <img
      className="trip-places__flag"
      src={flagImageUrl(place.countryCode, 24)}
      alt={place.country || place.countryCode}
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
  text = text
    .replace(/\s*;\s*/g, ' · ')
    .replace(/\boff\b/gi, language === 'en' ? 'closed' : 'cerrado')
    .replace(/\s+/g, ' ');
  return text;
}

export function TripPlacesPanel({
  places,
  routes = [],
  updatePlaceDetails,
  removePlace,
  reorderPlace,
  upsertRoute,
  setRouteVisibility,
  setAllRouteVisibility,
  t,
  intlLocale,
}) {
  const [placeToDelete, setPlaceToDelete] = useState(null);
  const [dragState, setDragState] = useState(null);
  const panelRef = useRef(null);
  const dragStateRef = useRef(null);
  const enrichmentInFlightRef = useRef(new Set());
  const draggedPlaceId = dragState?.placeId || '';

  const routeByPair = useMemo(
    () => new Map(routes.map((route) => [savedPlaceRoutePairKey(route), route])),
    [routes]
  );

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
      const samePane = candidates.filter(
        ({ bounds }) => event.clientX >= bounds.left && event.clientX <= bounds.right
      );
      const available = samePane.length > 0 ? samePane : candidates;
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
    if (!panel || typeof updatePlaceDetails !== 'function') return undefined;
    const placesById = new Map(places.map((place) => [place.id, place]));
    const candidates = Array.from(panel.querySelectorAll('[data-place-id]'))
      .filter((element) => {
        const place = placesById.get(element.dataset.placeId);
        return place && !placeEnrichmentIsFresh(place);
      });
    if (!candidates.length) return undefined;

    const loadDetails = async (element) => {
      const placeId = element.dataset.placeId;
      const place = placesById.get(placeId);
      if (!place || placeEnrichmentIsFresh(place) || enrichmentInFlightRef.current.has(placeId)) {
        return;
      }
      enrichmentInFlightRef.current.add(placeId);
      try {
        const details = await fetchGeoapifyPlaceEnrichment(place);
        updatePlaceDetails(placeId, details);
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
  }, [places, updatePlaceDetails]);

  function confirmRemovePlace() {
    if (!placeToDelete) return;
    removePlace(placeToDelete.id);
    setPlaceToDelete(null);
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

  function handleMoveKeyDown(event, placeId) {
    const placeIndex = places.findIndex((place) => place.id === placeId);
    if (event.key === 'ArrowUp' && placeIndex > 0) {
      event.preventDefault();
      reorderPlace?.(placeId, places[placeIndex - 1].id, 'before');
    }
    if (event.key === 'ArrowDown' && placeIndex < places.length - 1) {
      event.preventDefault();
      reorderPlace?.(placeId, places[placeIndex + 1].id, 'after');
    }
  }

  if (!places.length) {
    return (
      <div className="trip-places trip-places--empty">
        <IconMapPin size={22} aria-hidden="true" />
        <strong>{t('noSavedPlaces')}</strong>
        <span>{t('savedPlacesHint')}</span>
      </div>
    );
  }

  return (
    <>
      <div className="trip-places" ref={panelRef}>
        <div className="trip-places__sequence">
          {places.map((place, index) => {
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
            const hours = formattedOpeningHours(place.openingHours, intlLocale);
            const nextPlace = places[index + 1] || null;
            const pairKey = nextPlace ? `${place.id}\u0000${nextPlace.id}` : '';
            const route = pairKey ? routeByPair.get(pairKey) : null;

            return (
              <div className="trip-place-block" key={place.id}>
                <article
                  className={className}
                  data-place-id={place.id}
                  style={dragging
                    ? { '--trip-place-drag-y': `${dragState.offsetY}px` }
                    : undefined}
                >
                  <button
                    type="button"
                    className="trip-place__drag"
                    onPointerDown={(event) => startPlaceDrag(event, place.id)}
                    onKeyDown={(event) => handleMoveKeyDown(event, place.id)}
                    aria-label={t('movePlace')}
                    title={t('movePlace')}
                  >
                    <IconGripVertical size={15} aria-hidden="true" />
                  </button>
                  <span className="trip-place__flag-wrap">
                    <CountryFlag place={place} />
                  </span>
                  <span className="trip-place__info">
                    <strong>{label}</strong>
                    <small>{place.city || (place.provider === 'google' ? t('googlePlaceReference') : t('noCity'))}</small>
                    {(hours || place.website) && (
                      <span className="trip-place__details">
                        {hours && (
                          <span className="trip-place__hours" title={t('openingHours')}>
                            <IconClock size={11} stroke={1.8} aria-hidden="true" />
                            <span>{hours}</span>
                          </span>
                        )}
                        {place.website && (
                          <a
                            className="trip-place__website"
                            href={place.website}
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
                    className="trip-place__delete"
                    onClick={() => setPlaceToDelete(place)}
                    aria-label={t('delete')}
                  >
                    <IconTrash size={14} aria-hidden="true" />
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
      </div>

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
