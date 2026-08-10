import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconBike,
  IconBus,
  IconCar,
  IconWalk,
} from '@tabler/icons-react';
import { loadGooglePlaceLocations } from './googlePlacesClient.js';
import { requestGooglePlaceRoute } from '../routes/googleRouteClient.js';
import { requestSavedPlaceRoute } from '../routes/geoapifyRouteClient.js';
import { isGooglePlaceReference, isPlaced } from '../trips/tripModel.js';

const QUICK_MODES = Object.freeze([
  { id: 'drive', labelKey: 'routeModeDrive', Icon: IconCar },
  { id: 'transit', labelKey: 'routeModeTransit', Icon: IconBus },
  { id: 'bicycle', labelKey: 'routeModeBicycle', Icon: IconBike },
  { id: 'walk', labelKey: 'routeModeWalk', Icon: IconWalk },
]);

const estimateCache = new Map();
const pendingEstimateCache = new Map();

function formatDuration(value) {
  const minutes = Math.max(0, Math.round((Number(value) || 0) / 60));
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours < 24) return remaining ? `${hours} h ${remaining} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days} d ${remainingHours} h` : `${days} d`;
}

function formatTransitTime(value, locale) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function estimateKey(origin, destination, mode) {
  return `${origin.id}>${destination.id}:${mode}`;
}

async function cachedEstimate(origin, destination, mode) {
  const key = estimateKey(origin, destination, mode);
  if (estimateCache.has(key)) return estimateCache.get(key);
  if (pendingEstimateCache.has(key)) return pendingEstimateCache.get(key);

  const pending = requestSavedPlaceRoute(origin, destination, mode)
    .then((result) => {
      const estimate = {
        duration: Number(result.duration) || 0,
        distance: Number(result.distance) || 0,
      };
      estimateCache.set(key, estimate);
      return estimate;
    })
    .finally(() => pendingEstimateCache.delete(key));

  pendingEstimateCache.set(key, pending);
  return pending;
}

function googlePlaceId(place) {
  return isGooglePlaceReference(place) ? place.googlePlaceId : '';
}

async function resolveEstimatePair(origin, destination, signal) {
  if (isPlaced(origin) && isPlaced(destination)) return { origin, destination };

  const ids = [googlePlaceId(origin), googlePlaceId(destination)].filter(Boolean);
  if (!ids.length) throw new Error('No hay coordenadas para estimar este tramo.');

  const locations = await loadGooglePlaceLocations(ids, { signal });
  const byId = new Map(locations.map((location) => [location.placeId, location]));
  const locatedOrigin = isPlaced(origin)
    ? origin
    : { ...origin, ...byId.get(googlePlaceId(origin)) };
  const locatedDestination = isPlaced(destination)
    ? destination
    : { ...destination, ...byId.get(googlePlaceId(destination)) };

  if (!isPlaced(locatedOrigin) || !isPlaced(locatedDestination)) {
    throw new Error('No fue posible ubicar ambos lugares.');
  }
  return { origin: locatedOrigin, destination: locatedDestination };
}

function routeIsFresh(route, mode) {
  if (route?.provider !== 'google' || !route.geometry || route.mode !== mode) return false;
  const calculatedAt = new Date(route.calculatedAt || '').getTime();
  if (!Number.isFinite(calculatedAt)) return false;
  const age = Date.now() - calculatedAt;
  const ttl = mode === 'transit'
    ? 30 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000;
  return age >= 0 && age <= ttl;
}

function TransitDetails({ route, locale }) {
  const steps = Array.isArray(route?.transitSteps) ? route.transitSteps : [];
  if (!steps.length) return null;

  return (
    <div className="trip-connection__transit">
      {steps.slice(0, 5).map((step, index) => {
        const line = step.lineShortName || step.lineName || step.tripShortText || step.vehicleType || '';
        const departure = formatTransitTime(step.departureTime, locale);
        const arrival = formatTransitTime(step.arrivalTime, locale);
        const stops = [step.departureStop, step.arrivalStop].filter(Boolean).join(' → ');
        return (
          <div className="trip-connection__transit-step" key={`${line}:${index}`}>
            <strong>{[line, departure && arrival ? `${departure}–${arrival}` : ''].filter(Boolean).join(' · ')}</strong>
            {stops && <span>{stops}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function TripRouteConnections({
  origin,
  destination,
  route,
  upsertRoute,
  setRouteVisibility,
  setAllRouteVisibility,
  t,
  intlLocale,
}) {
  const rootRef = useRef(null);
  const [shouldEstimate, setShouldEstimate] = useState(false);
  const [estimates, setEstimates] = useState({});
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState(false);
  const [selectedMode, setSelectedMode] = useState(
    route?.visible !== false && QUICK_MODES.some((item) => item.id === route?.mode)
      ? route.mode
      : ''
  );
  const [loadingMode, setLoadingMode] = useState('');
  const [routeError, setRouteError] = useState(false);
  const [liveRoute, setLiveRoute] = useState(route || null);

  const pairKey = `${origin.id}>${destination.id}`;

  useEffect(() => {
    setLiveRoute(route || null);
    if (route?.visible !== false && QUICK_MODES.some((item) => item.id === route?.mode)) {
      setSelectedMode(route.mode);
    }
  }, [route]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || shouldEstimate) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldEstimate(true);
      return undefined;
    }

    let timer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible) {
          if (!timer) timer = globalThis.setTimeout(() => setShouldEstimate(true), 320);
        } else if (timer) {
          globalThis.clearTimeout(timer);
          timer = 0;
        }
      },
      { rootMargin: '120px 0px', threshold: 0.05 }
    );
    observer.observe(node);
    return () => {
      if (timer) globalThis.clearTimeout(timer);
      observer.disconnect();
    };
  }, [shouldEstimate, pairKey]);

  useEffect(() => {
    if (!shouldEstimate) return undefined;
    const controller = new AbortController();
    setEstimating(true);
    setEstimateError(false);

    resolveEstimatePair(origin, destination, controller.signal)
      .then(async (resolved) => {
        const results = await Promise.allSettled(
          QUICK_MODES.map(async ({ id }) => [
            id,
            await cachedEstimate(resolved.origin, resolved.destination, id),
          ])
        );
        if (controller.signal.aborted) return;
        const next = {};
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            const [mode, estimate] = result.value;
            next[mode] = estimate;
          }
        });
        setEstimates(next);
        setEstimateError(Object.keys(next).length === 0);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setEstimateError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEstimating(false);
      });

    return () => controller.abort();
  }, [destination, origin, pairKey, shouldEstimate]);

  async function selectMode(mode) {
    if (loadingMode) return;
    setSelectedMode(mode);
    setRouteError(false);
    setAllRouteVisibility?.(false);

    if (routeIsFresh(route, mode)) {
      setRouteVisibility?.(route.id, true);
      setLiveRoute(route);
      return;
    }

    setLoadingMode(mode);
    try {
      const calculated = await requestGooglePlaceRoute(
        origin,
        destination,
        mode,
        { departureTime: mode === 'transit' ? new Date().toISOString() : '' }
      );
      const nextRoute = {
        id: route?.id,
        fromPlaceId: origin.id,
        toPlaceId: destination.id,
        visible: true,
        ...calculated,
      };
      setLiveRoute(nextRoute);
      upsertRoute?.(nextRoute);
    } catch {
      setRouteError(true);
    } finally {
      setLoadingMode('');
    }
  }

  const selectedRoute = useMemo(() => {
    if (!liveRoute || liveRoute.fromPlaceId !== origin.id || liveRoute.toPlaceId !== destination.id) {
      return null;
    }
    return liveRoute;
  }, [destination.id, liveRoute, origin.id]);

  return (
    <div className="trip-connection" ref={rootRef} data-route-pair={pairKey}>
      <div className="trip-connection__rail" aria-hidden="true" />
      <div className="trip-connection__modes" aria-label={t('routeMode')}>
        {QUICK_MODES.map(({ id, labelKey, Icon }) => {
          const estimate = estimates[id];
          const active = selectedMode === id;
          const loading = loadingMode === id;
          return (
            <button
              type="button"
              className={`trip-connection__mode${active ? ' is-active' : ''}`}
              key={id}
              onClick={() => selectMode(id)}
              disabled={Boolean(loadingMode)}
              aria-pressed={active}
              aria-label={t(labelKey)}
              title={t(labelKey)}
            >
              <Icon size={16} stroke={1.8} aria-hidden="true" />
              <span>{loading ? '…' : estimating && !estimate ? '…' : formatDuration(estimate?.duration)}</span>
            </button>
          );
        })}
      </div>

      {estimateError && !estimating && (
        <span className="trip-connection__status">{t('routeCalculationError')}</span>
      )}
      {routeError && (
        <span className="trip-connection__status trip-connection__status--error">
          {t('routeCalculationError')}
        </span>
      )}
      {selectedMode === 'transit' && selectedRoute?.mode === 'transit' && (
        <TransitDetails route={selectedRoute} locale={intlLocale} />
      )}
    </div>
  );
}
