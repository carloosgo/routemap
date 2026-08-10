import { useEffect, useMemo, useRef, useState } from 'react';
import { IconGripVertical, IconMapPin, IconTrash } from '@tabler/icons-react';
import { flagImageUrl } from '../flags/flags.js';
import { savedPlaceRoutePairKey } from '../routes/routeModel.js';
import { TripRouteConnections } from './TripRouteConnections.jsx';
import './TripPlacesPanel.css';

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

export function TripPlacesPanel({
  places,
  routes = [],
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
