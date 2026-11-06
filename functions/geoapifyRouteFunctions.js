import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { createSharedCache } from './sharedCache.js';
import {
  ALLOWED_MODES,
  GEOAPIFY_API_KEY,
  QUOTAS,
  cacheDb,
  cached,
  db,
} from './geoapifyRuntime.js';
import {
  limitedFetch,
  mapPlace,
  requireGeoapifyKey,
  safeError,
  validPoint,
} from './geoapifySupport.js';

const ROUTE_ESTIMATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cachedRouteEstimate = createSharedCache(cacheDb, { ttlMs: ROUTE_ESTIMATE_TTL_MS });

function cachedRouteGeometry(result) {
  if (result?.geometry && typeof result.geometry === 'object') {
    return result.geometry;
  }
  if (typeof result?.geometryJson !== 'string' || !result.geometryJson) {
    return null;
  }
  try {
    return JSON.parse(result.geometryJson);
  } catch {
    return null;
  }
}

function estimateProviderMode(mode) {
  return mode === 'transit' ? 'approximated_transit' : mode;
}

function matrixMetrics(payload) {
  const row = Array.isArray(payload?.sources_to_targets)
    ? payload.sources_to_targets[0]
    : null;
  const cell = Array.isArray(row) ? row[0] : null;
  if (!cell) return null;

  const distance = Number(cell.distance);
  const duration = Number(cell.time);
  if (!Number.isFinite(distance) || !Number.isFinite(duration)) return null;
  return {
    distance: Math.max(0, distance),
    duration: Math.max(0, duration),
  };
}

async function loadRouteEstimate(origin, destination, mode) {
  const providerMode = estimateProviderMode(mode);
  const params = new URLSearchParams({
    apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
  });
  const body = {
    mode: providerMode,
    sources: [{ location: [Number(origin.lon), Number(origin.lat)] }],
    targets: [{ location: [Number(destination.lon), Number(destination.lat)] }],
  };
  if (mode === 'drive') body.traffic = 'approximated';

  const payload = await limitedFetch(
    `https://api.geoapify.com/v1/routematrix?${params}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return matrixMetrics(payload);
}

export const geoapifyRoute = onCall(
  callableOptions({
    secrets: [GEOAPIFY_API_KEY],
    maxInstances: 6,
    enforceAppCheck: false,
  }),
  async (request) => {
    const mode = ALLOWED_MODES.has(request.data?.mode) ? request.data.mode : 'drive';
    const estimateOnly = request.data?.estimateOnly === true;
    try {
      await enforceQuota(db, request, QUOTAS.route);
      const { origin, destination } = request.data || {};

      if (!validPoint(origin) || !validPoint(destination)) {
        throw new HttpsError('invalid-argument', 'Origen o destino inválido.');
      }

      if (estimateOnly) {
        const signature = `route-estimate:v1:${Number(origin.lat).toFixed(5)},${Number(origin.lon).toFixed(5)}|${Number(destination.lat).toFixed(5)},${Number(destination.lon).toFixed(5)}|${mode}`;
        try {
          const cachedResult = await cachedRouteEstimate(
            'routeEstimateCache',
            signature,
            async () => {
              const metrics = await loadRouteEstimate(origin, destination, mode);
              return {
                signature,
                mode,
                available: Boolean(metrics),
                distance: metrics?.distance || 0,
                duration: metrics?.duration || 0,
                calculatedAt: new Date().toISOString(),
              };
            }
          );
          return {
            ...cachedResult.result,
            cacheHit: cachedResult.cacheHit,
          };
        } catch (error) {
          logError('Geoapify route estimate unavailable.', {
            mode,
            ...safeError(error),
          });
          return {
            signature,
            mode,
            available: false,
            distance: 0,
            duration: 0,
            calculatedAt: new Date().toISOString(),
            cacheHit: false,
          };
        }
      }

      const traffic = mode === 'drive' || mode === 'bus' ? 'approximated' : '';
      const signature = `route:v3:${Number(origin.lat).toFixed(6)},${Number(origin.lon).toFixed(6)}|${Number(destination.lat).toFixed(6)},${Number(destination.lon).toFixed(6)}|${mode}|${traffic}`;
      const cachedResult = await cached('routeCache', signature, async () => {
        const params = new URLSearchParams({
          waypoints: `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`,
          mode,
          format: 'geojson',
          apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
        });
        if (traffic) params.set('traffic', traffic);

        const payload = await limitedFetch(`https://api.geoapify.com/v1/routing?${params}`);
        const feature = payload.features?.[0];
        if (!feature) {
          throw new HttpsError('not-found', 'Geoapify no encontró una ruta para este modo.');
        }

        return {
          signature,
          mode,
          available: true,
          geometryJson: JSON.stringify(feature.geometry),
          distance: Number(feature.properties?.distance) || 0,
          duration: Number(feature.properties?.time) || 0,
          calculatedAt: new Date().toISOString(),
        };
      });

      const geometry = cachedRouteGeometry(cachedResult.result);
      if (!geometry) {
        throw new HttpsError('internal', 'No fue posible reconstruir la geometría de la ruta.');
      }

      return {
        signature: cachedResult.result.signature || signature,
        mode: cachedResult.result.mode || mode,
        available: true,
        geometry,
        distance: Number(cachedResult.result.distance) || 0,
        duration: Number(cachedResult.result.duration) || 0,
        calculatedAt: cachedResult.result.calculatedAt || '',
        cacheHit: cachedResult.cacheHit,
      };
    } catch (error) {
      logError('Geoapify route request failed.', {
        mode,
        ...safeError(error),
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        'unavailable',
        'Geoapify no pudo calcular temporalmente esta ruta.'
      );
    }
  }
);

export const geoapifyReverse = onCall(
  callableOptions({ secrets: [GEOAPIFY_API_KEY] }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.reverse);
    const point = request.data?.point;
    if (!validPoint(point)) {
      throw new HttpsError('invalid-argument', 'Punto inválido.');
    }

    const key = `reverse:v2:${Number(point.lat).toFixed(6)},${Number(point.lon).toFixed(6)}`;
    const cachedResult = await cached('geocodeCache', key, async () => {
      const params = new URLSearchParams({
        lat: String(point.lat),
        lon: String(point.lon),
        format: 'json',
        limit: '1',
        apiKey: requireGeoapifyKey(GEOAPIFY_API_KEY),
      });
      const payload = await limitedFetch(
        `https://api.geoapify.com/v1/geocode/reverse?${params}`
      );
      return mapPlace(payload.results?.[0]) || null;
    });

    return { result: cachedResult.result, cacheHit: cachedResult.cacheHit };
  }
);