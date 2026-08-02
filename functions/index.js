import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { rateLimitedRequests } from '@geoapify/request-rate-limiter';

initializeApp();
const db = getFirestore();
const GEOAPIFY_API_KEY = defineSecret('GEOAPIFY_API_KEY');
const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const ALLOWED_MODES = new Set(['drive', 'walk', 'bicycle', 'transit']);

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function cacheId(value) {
  return createHash('sha256').update(value).digest('hex');
}
function validPoint(point) {
  return point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon))
    && Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lon)) <= 180;
}
async function limitedFetch(url, options) {
  const [result] = await rateLimitedRequests([async () => {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`Geoapify respondió ${response.status}`);
    return response.json();
  }], 5, 1000, { maxConcurrentRequests: 2 });
  if (result instanceof Error) throw result;
  return result;
}
async function cached(collection, key, loader) {
  const ref = db.collection(collection).doc(cacheId(key));
  const snapshot = await ref.get();
  const data = snapshot.data();
  const timestamp = data?.timestamp?.toMillis?.() || 0;
  if (data?.result && Date.now() - timestamp < CACHE_TTL_MS) return { result: data.result, cacheHit: true };
  const result = await loader();
  await ref.set({ queryKey: key, result, timestamp: FieldValue.serverTimestamp() });
  return { result, cacheHit: false };
}
function requireKey() {
  const key = GEOAPIFY_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Falta el secreto GEOAPIFY_API_KEY.');
  return key;
}

export const geoapifyAutocomplete = onCall({ secrets: [GEOAPIFY_API_KEY] }, async (request) => {
  const query = String(request.data?.query || '').trim();
  const queryKey = normalized(query);
  if (queryKey.length < 3) throw new HttpsError('invalid-argument', 'La búsqueda requiere al menos 3 caracteres.');
  const limit = Math.min(Math.max(Number(request.data?.limit) || 5, 1), 5);
  const key = `autocomplete:${queryKey}:limit=${limit}`;
  const cachedResult = await cached('geocodeCache', key, async () => {
    const params = new URLSearchParams({ text: query, format: 'json', limit: String(limit), apiKey: requireKey() });
    const payload = await limitedFetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`);
    return (payload.results || []).map((item) => ({
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
    }));
  });
  return { results: cachedResult.result, cacheHit: cachedResult.cacheHit };
});

export const geoapifyRoute = onCall({ secrets: [GEOAPIFY_API_KEY] }, async (request) => {
  const { origin, destination } = request.data || {};
  const mode = ALLOWED_MODES.has(request.data?.mode) ? request.data.mode : 'drive';
  if (!validPoint(origin) || !validPoint(destination)) throw new HttpsError('invalid-argument', 'Origen o destino inválido.');
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
  if (!validPoint(point)) throw new HttpsError('invalid-argument', 'Punto inválido.');
  const key = `reverse:${Number(point.lat).toFixed(6)},${Number(point.lon).toFixed(6)}`;
  const cachedResult = await cached('geocodeCache', key, async () => {
    const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), format: 'json', limit: '1', apiKey: requireKey() });
    const payload = await limitedFetch(`https://api.geoapify.com/v1/geocode/reverse?${params}`);
    return payload.results?.[0] || null;
  });
  return { result: cachedResult.result, cacheHit: cachedResult.cacheHit };
});

export const geoapifyBatchGeocode = onCall({ secrets: [GEOAPIFY_API_KEY], timeoutSeconds: 540 }, async (request) => {
  const queries = Array.isArray(request.data?.queries) ? request.data.queries.slice(0, 1000) : [];
  if (!queries.length) return { results: [] };
  const tasks = queries.map((query) => async () => {
    const text = String(query || '').trim();
    const key = `batch:${normalized(text)}`;
    if (normalized(text).length < 3) return null;
    const value = await cached('geocodeCache', key, async () => {
      const params = new URLSearchParams({ text, format: 'json', limit: '1', apiKey: requireKey() });
      const payload = await limitedFetch(`https://api.geoapify.com/v1/geocode/search?${params}`);
      return payload.results?.[0] || null;
    });
    return value.result;
  });
  const results = await rateLimitedRequests(tasks, 5, 1000, { maxConcurrentRequests: 2 });
  return { results: results.map((item) => item instanceof Error ? null : item) };
});
