import { useEffect, useMemo, useState } from 'react';
import { requestGooglePlaceRoute } from '../routes/googleRouteClient.js';
import {
  SAVED_PLACE_ROUTE_MODES,
  consecutiveSavedPlaceRoutePairs,
  savedPlaceRoutePairKey,
  savedPlaceRouteTotals,
} from '../routes/routeModel.js';

const MODE_LABEL_KEYS = Object.freeze({
  drive: 'routeModeDrive',
  transit: 'routeModeTransit',
  train: 'routeModeTrain',
  bus: 'routeModeBus',
  bicycle: 'routeModeBicycle',
  walk: 'routeModeWalk',
});

function placeLabel(place, t) {
  return place?.name || place?.userLabel || t('place');
}

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

function formatTransitTime(value, locale) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function transitStepLabel(step, locale) {
  if (!step) return '';
  const line = step.lineShortName || step.lineName || step.tripShortText || '';
  const agency = step.agencies?.[0] || '';
  const departure = formatTransitTime(step.departureTime, locale);
  const arrival = formatTransitTime(step.arrivalTime, locale);
  const time = departure && arrival ? `${departure}–${arrival}` : '';
  return [line, agency, time].filter(Boolean).join(' · ');
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
  const [mode, setMode] = useState('transit');
  const [loadingKey, setLoadingKey] = useState('');
  const [connectingAll, setConnectingAll] = useState(false);
  const [connectAllProgress, setConnectAllProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState('');

  const placeById = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places]
  );
  const routeByPair = useMemo(
    () => new Map(routes.map((route) => [savedPlaceRoutePairKey(route), route])),
    [routes]
  );
  const consecutivePairs = useMemo(
    () => consecutiveSavedPlaceRoutePairs(places),
    [places]
  );
  const unresolvedConsecutiveCount = useMemo(
    () => consecutivePairs.filter((pair) => {
      const route = routeByPair.get(savedPlaceRoutePairKey(pair));
      return !route?.geometry;
    }).length,
    [consecutivePairs, routeByPair]
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
    reportError = true,
  }) {
    const origin = placeById.get(fromId);
    const destination = placeById.get(toId);
    if (!origin || !destination || fromId === toId) return false;

    if (reportError) setError('');
    setLoadingKey(loadingId || id || 'new');
    try {
      const calculated = await requestGooglePlaceRoute(origin, destination, routeMode);
      upsertRoute({
        id,
        fromPlaceId: fromId,
        toPlaceId: toId,
        visible,
        ...calculated,
      });
      return true;
    } catch {
      if (reportError) setError(t('routeCalculationError'));
      return false;
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

  async function handleConnectAll() {
    if (connectingAll || consecutivePairs.length === 0) return;
    setError('');
    setConnectingAll(true);
    setConnectAllProgress({ current: 0, total: consecutivePairs.length });
    let failures = 0;

    try {
      for (let index = 0; index < consecutivePairs.length; index += 1) {
        const pair = consecutivePairs[index];
        const pairKey = savedPlaceRoutePairKey(pair);
        const existing = routeByPair.get(pairKey);
        setConnectAllProgress({ current: index + 1, total: consecutivePairs.length });

        if (existing?.geometry) {
          if (existing.visible === false) setRouteVisibility(existing.id, true);
          continue;
        }

        const calculated = await calculateRoute({
          id: existing?.id,
          fromId: pair.fromPlaceId,
          toId: pair.toPlaceId,
          routeMode: existing?.mode || 'transit',
          visible: existing?.visible !== false,
          loadingId: `all:${pairKey}`,
          reportError: false,
        });
        if (!calculated) failures += 1;
      }
    } finally {
      setConnectingAll(false);
      setConnectAllProgress({ current: 0, total: 0 });
    }

    if (failures > 0) {
      setError(
        failures === consecutivePairs.length
          ? t('routeCalculationError')
          : t('routeConnectAllPartialError')
      );
    }
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

  const resolvedRoutes = routes.filter((route) => route.geometry);

  return (
    <section className="trip-routes" aria-label={t('routeConnections')}>
      <div className="trip-routes__head">
        <strong>{t('routeConnections')}</strong>
        <div className="trip-routes__head-actions">
          <button
            type="button"
            className="trip-routes__connect-all"
            onClick={handleConnectAll}
            disabled={connectingAll || Boolean(loadingKey) || unresolvedConsecutiveCount === 0}
          >
            {connectingAll
              ? t('connectingAllRoutes', connectAllProgress)
              : t('connectAllRoutes')}
          </button>
          {routes.length > 0 && (
            <button
              type="button"
              className="trip-routes__visibility-all"
              onClick={() => setAllRouteVisibility(visibleTotals.count !== resolvedRoutes.length)}
              disabled={connectingAll}
            >
              {visibleTotals.count === resolvedRoutes.length
                ? t('hideAllRoutes')
                : t('showAllRoutes')}
            </button>
          )}
        </div>
      </div>

      <form className="trip-routes__builder" onSubmit={handleCreateRoute}>
        <select
          value={fromPlaceId}
          onChange={(event) => setFromPlaceId(event.target.value)}
          aria-label={t('routeFrom')}
          disabled={connectingAll}
        >
          {places.map((place) => (
            <option value={place.id} key={place.id}>{placeLabel(place, t)}</option>
          ))}
        </select>
        <span aria-hidden="true">→</span>
        <select
          value={toPlaceId}
          onChange={(event) => setToPlaceId(event.target.value)}
          aria-label={t('routeTo')}
          disabled={connectingAll}
        >
          {places.map((place) => (
            <option value={place.id} key={place.id}>{placeLabel(place, t)}</option>
          ))}
        </select>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value)}
          aria-label={t('routeMode')}
          disabled={connectingAll}
        >
          {SAVED_PLACE_ROUTE_MODES.map((routeMode) => (
            <option value={routeMode} key={routeMode}>{t(MODE_LABEL_KEYS[routeMode])}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!fromPlaceId || !toPlaceId || fromPlaceId === toPlaceId || Boolean(loadingKey) || connectingAll}
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
            const firstTransitStep = route.transitSteps?.[0] || null;
            const transitLabel = transitStepLabel(firstTransitStep, intlLocale);
            return (
              <div className="trip-route" key={route.id}>
                <label className="trip-route__visibility">
                  <input
                    type="checkbox"
                    checked={route.visible !== false}
                    disabled={connectingAll || !route.geometry}
                    onChange={(event) => setRouteVisibility(route.id, event.target.checked)}
                    aria-label={t('showRoute')}
                  />
                </label>
                <div className="trip-route__body">
                  <strong>{placeLabel(origin, t)} → {placeLabel(destination, t)}</strong>
                  <div className="trip-route__meta">
                    <select
                      value={route.mode}
                      disabled={loading || connectingAll}
                      onChange={(event) => handleModeChange(route, event.target.value)}
                      aria-label={t('routeMode')}
                    >
                      {SAVED_PLACE_ROUTE_MODES.map((routeMode) => (
                        <option value={routeMode} key={routeMode}>{t(MODE_LABEL_KEYS[routeMode])}</option>
                      ))}
                    </select>
                    {route.geometry ? (
                      <>
                        <span>{loading ? t('calculatingRoute') : formatDuration(route.duration)}</span>
                        <span>{formatDistance(route.distance, intlLocale)}</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="trip-route__recalculate"
                        disabled={loading || connectingAll}
                        onClick={() => handleModeChange(route, route.mode)}
                      >
                        {loading ? t('calculatingRoute') : t('recalculateRoute')}
                      </button>
                    )}
                  </div>
                  {transitLabel && (
                    <div className="trip-route__transit">
                      <strong>{transitLabel}</strong>
                      {(firstTransitStep.departureStop || firstTransitStep.arrivalStop) && (
                        <span>
                          {[firstTransitStep.departureStop, firstTransitStep.arrivalStop]
                            .filter(Boolean)
                            .join(' → ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="trip-route__remove"
                  disabled={connectingAll}
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
