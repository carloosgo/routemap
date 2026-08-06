import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import {
  ALLOWED_MODES,
  GEOAPIFY_API_KEY,
  QUOTAS,
  cached,
  db,
} from './geoapifyRuntime.js';
import {
  limitedFetch,
  mapPlace,
  requireGeoapifyKey,
  validPoint,
} from './geoapifySupport.js';

export const geoapifyRoute = onCall(
  callableOptions({
    secrets: [GEOAPIFY_API_KEY],
    maxInstances: 6,
    invoker: 'public',
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.route);
    const { origin, destination } = request.data || {};
    const mode = ALLOWED_MODES.has(request.data?.mode) ? request.data.mode : 'drive';

    if (!validPoint(origin) || !validPoint(destination)) {
      throw new HttpsError('invalid-argument', 'Origen o destino inválido.');
    }

    const traffic = mode === 'drive' || mode === 'bus' ? 'approximated' : '';
    const signature = `route:v2:${Number(origin.lat).toFixed(6)},${Number(origin.lon).toFixed(6)}|${Number(destination.lat).toFixed(6)},${Number(destination.lon).toFixed(6)}|${mode}|${traffic}`;
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
      if (!feature) throw new Error('Geoapify no devolvió una ruta.');

      return {
        signature,
        mode,
        geometry: feature.geometry,
        distance: Number(feature.properties?.distance) || 0,
        duration: Number(feature.properties?.time) || 0,
        calculatedAt: new Date().toISOString(),
      };
    });

    return { ...cachedResult.result, cacheHit: cachedResult.cacheHit };
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
