import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import RequestRateLimiter from '@geoapify/request-rate-limiter';

initializeApp();
const db = getFirestore();
const GEOAPIFY_API_KEY = defineSecret('GEOAPIFY_API_KEY');
const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const ALLOWED_MODES = new Set(['drive', 'walk', 'bicycle', 'transit']);

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function cacheId(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function validPoint(point) {
  return point
    && validCoordinate(point.lat, -90, 90)
    && validCoordinate(point.lon, -180, 180);
}

async function limitedFetch(url, options) {
  const [result] = await RequestRateLimiter.rateLimitedRequests([
    async () => {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`Geoapify respondió ${response.status}`);
      return response.json();
    },
  ], 5, 1000, { maxConcurrentRequests: 2 });

  if (result instanceof Error) throw result;
  return result;
}

async function cached(collection, key, loader) {
  const ref = db.collection(collection).doc(cacheId(key));
  const snapshot = await ref.get();
  const data = snapshot.data();
  const timestamp = data?.timestamp?.toMillis?.() || 0;

  if (data?.result && Date.now() - timestamp < CACHE_TTL_MS) {
    return { result: data.result, cacheHit: true };
  }

  const result = await loader();
  await ref.set({ queryKey: key, result, timestamp: FieldValue.serverTimestamp() });
  return { result, cacheHit: false };
}

function requireKey() {
  const key = GEOAPIFY_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Falta el secreto GEOAPIFY_API_KEY.');
  return key;
}

function mapPlace(item) {
  return {
    id: item.place_id || `${item.lon}:${item.lat}`,
    name: item.name || item.formatted || 'Lugar',
    formatted: item.formatted || '',
    address: item.address_line2 || item.address_line1 || item.formatted || '',
    city: item.city || item.county || '',
    country: item.country || '',
    countryCode: String(item.country_code || '').toUpperCase(),
    category: item.category || item.result_type || '',
    lat: item.lat,
    lon: item.lon,
  };
}

// Búsqueda de lugares dentro del mapa: hospedajes, restaurantes, estaciones, etc.
export const geoapifyPlaceSearch = onCall({ secrets: [GEOAPIFY_API_KEY] }, async (request) => {
  const query = String(request.data?.query || '').trim();
  const queryKey = normalized(query);

  if (queryKey.length < 3) {
    throw new HttpsError('invalid-argument', 'La búsqueda requiere al menos 3 caracteres.');
  }

  const limit = Math.min(Math.max(Number(request.data?.limit) || 5, 1), 5);
  const key = `place:${queryKey}:limit=${limit}`;
  const cachedResult = await cached('placeSearchCache', key, async () => {
    const params = new URLSearchParams({
      text: query,
      format: 'json',
      limit: String(limit),
      apiKey: requireKey(),
    });
    const payload = await limitedFetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?${params}`
    );
    return (payload.results || []).map(mapPlace);
  });

  return { results: cachedResult.result, cacheHit: cachedResult.cacheHit };
});

// Función general de autocompletado Geoapify. Se conserva como capacidad backend,
// pero no sustituye el flujo actual de selección de ciudades del itinerario.
export const geoapifyAutocomplete = onCall({ secrets: [GEOAPIFY_API_KEY] }, async (request) => {
  const query = String(request.data?.query || '').trim();
  const queryKey = normalized(query);

  if (queryKey.length < 3) {
    throw new HttpsError('invalid-argument', 'La búsqueda requiere al menos 3 caracteres.');
  }

  const limit = Math.min(Math.max(Number(request.data?.limit) || 5, 1), 5);
  const key = `autocomplete:${queryKey}:limit=${limit}`;
  const cachedResult = await cached('geocodeCache', key, async () => {
    const params = new URLSearchParams({
      text: query,
      format: 'json',
      limit: String(limit),
      apiKey: requireKey(),
    });
    const payload = await limitedFetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?${params}`
    );
    return (payload.results || []).map(mapPlace);
  });

  return { results: cachedResult.result, cacheHit: cachedResult.cacheHit };
});

// Cálculo de rutas disponible como servicio independiente. El mapa actual no lo
// usa para reemplazar las líneas visuales definidas por el producto.
export const geoapifyRoute = onCall({ secrets: [GEOAPIFY_API_KEY] }, async (request) => {
  const { origin, destination } = request.data || {};
  const mode = ALLOWED_MODES.has(request.data?.mode) ? request.data.mode : 'drive';

  if (!validPoint(origin) || !validPoint(destination)) {
    throw new HttpsError('invalid-argument', 'Origen o destino inválido.');
  }

  const signature = `${Number(origin.lat).toFixed(6)},${Number(origin.lon).toFixed(6)}|${Number(destination.lat).toFixed(6)},${Number(destination.lon).toFixed(6)}|${mode}`;
  const cachedResult = await cached('routeCache', signature, async () => {
    const params = new URLSearchParams({
      waypoints: `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`,
      mode,
      format: 'geojson',
      apiKey: requireKey(),
    });
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
});

export const geoapifyReverse = onCall({ secrets: [GEOAPIFY_API_KEY] }, async (request) => {
  const point = request.data?.point;
  if (!validPoint(point)) {
    throw new HttpsError('invalid-argument', 'Punto inválido.');
  }

  const key = `reverse:${Number(point.lat).toFixed(6)},${Number(point.lon).toFixed(6)}`;
  const cachedResult = await cached('geocodeCache', key, async () => {
    const params = new URLSearchParams({
      lat: String(point.lat),
      lon: String(point.lon),
      format: 'json',
      limit: '1',
      apiKey: requireKey(),
    });
    const payload = await limitedFetch(
      `https://api.geoapify.com/v1/geocode/reverse?${params}`
    );
    return payload.results?.[0] || null;
  });

  return { result: cachedResult.result, cacheHit: cachedResult.cacheHit };
});

export const geoapifyBatchGeocode = onCall({
  secrets: [GEOAPIFY_API_KEY],
  timeoutSeconds: 540,
}, async (request) => {
  const queries = Array.isArray(request.data?.queries)
    ? request.data.queries.slice(0, 1000)
    : [];

  if (!queries.length) return { results: [] };

  const tasks = queries.map((query) => async () => {
    const text = String(query || '').trim();
    const key = `batch:${normalized(text)}`;
    if (normalized(text).length < 3) return null;

    const value = await cached('geocodeCache', key, async () => {
      const params = new URLSearchParams({
        text,
        format: 'json',
        limit: '1',
        apiKey: requireKey(),
      });
      const payload = await limitedFetch(
        `https://api.geoapify.com/v1/geocode/search?${params}`
      );
      return payload.results?.[0] || null;
    });
    return value.result;
  });

  const results = await RequestRateLimiter.rateLimitedRequests(
    tasks,
    5,
    1000,
    { maxConcurrentRequests: 2 }
  );

  return {
    results: results.map((item) => (item instanceof Error ? null : item)),
  };
});

export const geoapifyCountryBoundary = onCall({ secrets: [GEOAPIFY_API_KEY] }, async (request) => {
  const lat = Number(request.data?.lat);
  const lon = Number(request.data?.lon);
  const countryCode = String(request.data?.countryCode || '').trim().toUpperCase();

  if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
    throw new HttpsError('invalid-argument', 'Coordenadas inválidas.');
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new HttpsError('invalid-argument', 'Código de país inválido.');
  }

  const key = `country-boundary:${countryCode}`;
  const cachedResult = await cached('countryBoundaryCache', key, async () => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      boundaries: 'administrative',
      geometry: 'geometry_10000',
      lang: 'en',
      apiKey: requireKey(),
    });
    const payload = await limitedFetch(
      `https://api.geoapify.com/v1/boundaries/part-of?${params}`
    );
    const features = Array.isArray(payload.features) ? payload.features : [];
    const matching = features.filter((feature) => {
      const code = String(feature?.properties?.country_code || '').toUpperCase();
      const geometryType = feature?.geometry?.type;
      return code === countryCode && ['Polygon', 'MultiPolygon'].includes(geometryType);
    });
    const countryFeature = matching.find((feature) => (
      feature?.properties?.result_type === 'country'
      || feature?.properties?.place_type === 'country'
      || feature?.properties?.rank?.address === 4
    )) || matching.at(-1) || null;

    return countryFeature;
  });

  return { feature: cachedResult.result, cacheHit: cachedResult.cacheHit };
});
