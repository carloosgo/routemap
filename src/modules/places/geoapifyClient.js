import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { config } from '../../config.js';

const PLACE_CACHE_KEY = 'atlas:geoapify-place-cache:v3';
const DETAIL_CACHE_KEY = 'atlas:geoapify-place-detail-cache:v1';
const placeCache = new Map();
const detailCache = new Map();
let emulatorConnected = false;

export function normalizeSearchKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function readCache(storageKey, target) {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(storageKey) || '{}');
    Object.entries(parsed).forEach(([key, entry]) => target.set(key, entry));
  } catch {
    try { globalThis.localStorage?.removeItem(storageKey); } catch { /* opcional */ }
  }
}

function persistCache(storageKey, target) {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(Object.fromEntries(target)));
  } catch {
    // La caché es opcional y nunca debe bloquear la aplicación.
  }
}

readCache(PLACE_CACHE_KEY, placeCache);
readCache(DETAIL_CACHE_KEY, detailCache);

function callable(name) {
  const { app } = getFirebaseServices();
  const functions = getFunctions(app, config.geoapify.functionRegion);
  if (config.firebase.useEmulators && !emulatorConnected) {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorConnected = true;
  }
  return httpsCallable(functions, name);
}

export function contextualQuery(query, context) {
  const base = String(query || '').trim();
  const normalized = normalizeSearchKey(base);
  const city = String(context?.city || '').trim();
  const country = String(context?.country || '').trim();
  const knownLocations = Array.isArray(context?.knownLocations) ? context.knownLocations : [];
  const explicitlyNamesLocation = [...knownLocations, city, country]
    .filter(Boolean)
    .some((value) => normalized.includes(normalizeSearchKey(value)));
  const isGenericSingleTerm = normalized.split(' ').filter(Boolean).length === 1;

  if (!base || explicitlyNamesLocation || !isGenericSingleTerm || (!city && !country)) return base;
  return [base, city, country].filter(Boolean).join(', ');
}

function contextKey(context) {
  return [
    normalizeSearchKey(context?.city),
    normalizeSearchKey(context?.country),
    Number.isFinite(context?.lat) ? Number(context.lat).toFixed(4) : '',
    Number.isFinite(context?.lon) ? Number(context.lon).toFixed(4) : '',
  ].join('|');
}

export async function searchGeoapifyPlaces(query, { signal, context } = {}) {
  const cleanQuery = String(query || '').trim();
  const queryKey = normalizeSearchKey(cleanQuery);
  if (queryKey.length < config.geoapify.searchMinChars) return [];

  const cacheKey = `${queryKey}|${contextKey(context)}`;
  const cached = placeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < config.geoapify.clientCacheTtlMs) {
    return cached.result;
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const request = callable('geoapifyPlaceSearch');
  const response = await request({
    query: contextualQuery(cleanQuery, context),
    context: {
      city: String(context?.city || '').trim(),
      country: String(context?.country || '').trim(),
      countryCode: String(context?.countryCode || '').trim().toUpperCase(),
      lat: Number.isFinite(context?.lat) ? Number(context.lat) : null,
      lon: Number.isFinite(context?.lon) ? Number(context.lon) : null,
    },
    limit: config.geoapify.searchLimit,
  });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const result = Array.isArray(response.data?.results) ? response.data.results : [];
  placeCache.set(cacheKey, { result, timestamp: Date.now() });
  persistCache(PLACE_CACHE_KEY, placeCache);
  return result;
}

export async function fetchGeoapifyPlaceImage(place, { signal } = {}) {
  const id = String(place?.id || '').trim();
  if (!id) return '';
  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.timestamp < config.geoapify.clientCacheTtlMs) {
    return cached.image || '';
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const request = callable('geoapifyPlaceDetails');
  const response = await request({ placeId: id });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const image = String(response.data?.image || '').trim();
  detailCache.set(id, { image, timestamp: Date.now() });
  persistCache(DETAIL_CACHE_KEY, detailCache);
  return image;
}
