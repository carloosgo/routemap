import { useEffect, useMemo, useState } from 'react';
import { requestSavedPlaceRoute } from '../routes/geoapifyRouteClient.js';
import {
  SAVED_PLACE_ROUTE_MODES,
  savedPlaceRouteTotals,
} from '../routes/routeModel.js';

const MODE_LABEL_KEYS = Object.freeze({
  drive: 'routeModeDrive',
  bus: 'routeModeBus',
  bicycle: 'routeModeBicycle',
  walk: 'routeModeWalk',
  transit: 'routeModeTransit',
  approximated_transit: 'routeModeApproximatedTransit',
});

function formatDistance(value, locale) {
  const meters = Math.max(0, Number(value) || 0);
  if (meters < 1000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(meters)} m`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

function formatDuration(value) {
  const minutes = Math.max(0, Math.round((Number(value) || 0) / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
}

export function TripRouteConnections({
  places,
  routes,
  upsertRoute,
  removeRoute,
  setRouteVisibility,
  setAllRouteVisibility,
  t,
  intlLocale,
}) {
  const [fromPlaceId, setFromPlaceId] = useState(places[0]?.id || '');
  const [toPlaceId, setToPlaceId] = useState(places[1]?.id || '');
  const [mode, setMode] = useState('drive');
  const [loadingKey, setLoadingKey] = useState('');
  const [error, setError] = useState('');

  const placeById = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places]
  );
  const visibleTotals = useMemo(
    () => savedPlaceRouteTotals(routes, { visibleOnly: true }),
    [routes]
  );

  useEffect(() => {
    const ids = new Set(places.map((place) => place.id));
    if (!ids.has(fromPlaceId)) setFromPlaceId(places[0]?.id || '');
    if (!ids.has(toPlaceId) || toPlaceId === fromPlaceId) {
      setToPlaceId(places.find((place) => place.id !== fromPlaceId)?.id || '');
    }
  }, [places, fromPlaceId, toPlaceId]);

  async function calculateRoute({
    id,
    fromId,
    toId,
    routeMode,
    visible = true,
    loadingId,
  }) {
    const origin = placeById.get(fromId);
    const destination = placeById.get(toId);
    if (!origin || !destination || fromId === toId) return;

    setError('');
    setLoadingKey(loadingId || id || 'new');
    try {
      const calculated = await requestSavedPlaceRoute(origin, destination, routeMode);
      upsertRoute({
        id,
        fromPlaceId: fromId,
        toPlaceId: toId,
        visible,
        ...calculated,
      });
    } catch {
      setError(t('routeCalculationError'));
    } finally {
      setLoadingKey('');
    }
  }

  async function handleCreateRoute(event) {
    event.preventDefault();
    await calculateRoute({
      fromId: fromPlaceId,
      toId: toPlaceId,
      routeMode: mode,
      visible: true,
      loadingId: 'new',
    });
  }

  async function handleModeChange(route, nextMode) {
    await calculateRoute({
      id: route.id,
      fromId: route.fromPlaceId,
      toId: route.toPlaceId,
      routeMode: nextMode,
      visible: route.visible,
      loadingId: route.id,
    });
  }

  if (places.length < 2) return null;

  return (
    <section className="trip-routes" aria-label={t('routeConnections')}>
      <div className="trip-routes__head">
        <strong>{t('routeConnections')}</strong>
        {routes.length > 0 && (
          <button
            type="button"
            className="trip-routes__visibility-all"
            onClick={() => setAllRouteVisibility(visibleTotals.count !== routes.length)}
          >
            {visibleTotals.count === routes.length ? t('hideAllRoutes') : t('showAllRoutes')}
          </button>
        )}
      </div>

      <form className="trip-routes__builder" onSubmit={handleCreateRoute}>
        <select
          value={fromPlaceId}
          onChange={(event) => setFromPlaceId(event.target.value)}
          aria-label={t('routeFrom')}
        >
          {places.map((place) => (
            <option value={place.id} key={place.id}>{place.name}</option>
          ))}
        </select>
        <span aria-hidden="true">→</span>
        <select
          value={toPlaceId}
          onChange={(event) => setToPlaceId(event.target.value)}
          aria-label={t('routeTo')}
        >
          {places.map((place) => (
            <option value={place.id} key={place.id}>{place.name}</option>
          ))}
        </select>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value)}
          aria-label={t('routeMode')}
        >
          {SAVED_PLACE_ROUTE_MODES.map((routeMode) => (
            <option value={routeMode} key={routeMode}>{t(MODE_LABEL_KEYS[routeMode])}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!fromPlaceId || !toPlaceId || fromPlaceId === toPlaceId || Boolean(loadingKey)}
        >
          {loadingKey === 'new' ? t('calculatingRoute') : t('connectPlaces')}
        </button>
      </form>

      {error && <div className="trip-routes__error" role="status">{error}</div>}

      {routes.length > 0 && (
        <div className="trip-routes__list">
          {routes.map((route) => {
            const origin = placeById.get(route.fromPlaceId);
            const destination = placeById.get(route.toPlaceId);
            if (!origin || !destination) return null;
            const loading = loadingKey === route.id;
            return (
              <div className="trip-route" key={route.id}>
                <label className="trip-route__visibility">
                  <input
                    type="checkbox"
                    checked={route.visible !== false}
                    onChange={(event) => setRouteVisibility(route.id, event.target.checked)}
                    aria-label={t('showRoute')}
                  />
                </label>
                <div className="trip-route__body">
                  <strong>{origin.name} → {destination.name}</strong>
                  <div className="trip-route__meta">
                    <select
                      value={route.mode}
                      disabled={loading}
                      onChange={(event) => handleModeChange(route, event.target.value)}
                      aria-label={t('routeMode')}
                    >
                      {SAVED_PLACE_ROUTE_MODES.map((routeMode) => (
                        <option value={routeMode} key={routeMode}>{t(MODE_LABEL_KEYS[routeMode])}</option>
                      ))}
                    </select>
                    <span>{loading ? t('calculatingRoute') : formatDuration(route.duration)}</span>
                    <span>{formatDistance(route.distance, intlLocale)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="trip-route__remove"
                  onClick={() => removeRoute(route.id)}
                  aria-label={t('deleteRoute')}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {visibleTotals.count > 0 && (
        <div className="trip-routes__total">
          <span>{t('visibleRoutesTotal')}</span>
          <strong>
            {formatDuration(visibleTotals.duration)} · {formatDistance(visibleTotals.distance, intlLocale)}
          </strong>
        </div>
      )}
    </section>
  );
}
