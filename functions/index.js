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

// Geoapify se utiliza únicamente para buscar lugares que el usuario puede
// guardar dentro de un tramo: hospedajes, restaurantes, estaciones, museos,
// etc. La selección de países y ciudades sigue un flujo independiente.
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
