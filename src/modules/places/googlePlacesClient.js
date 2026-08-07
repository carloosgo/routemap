import { config } from '../../config.js';
import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';
import { isPlaced } from '../trips/tripModel.js';

const memoryCache = new Map();
const pendingRequests = new Map();

function now() {
  return Date.now();
}

function cacheKey(kind, value, token = '') {
  return `${kind}:${token}:${String(value || '').trim().toLowerCase()}`;
}

function getCached(key) {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (now() - cached.timestamp > config.googleMaps.memoryCacheTtlMs) {
    memoryCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCached(key, value) {
  if (memoryCache.size >= 120) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { timestamp: now(), value });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

async function sharedRequest(key, loader) {
  if (pendingRequests.has(key)) return pendingRequests.get(key);
  const pending = loader();
  pendingRequests.set(key, pending);
  try {
    return await pending;
  } finally {
    pendingRequests.delete(key);
  }
}

async function requestPlaceDetails(
  placeId,
  { name = '', sessionToken = '', includeDisplayName = false, signal } = {}
) {
  const cleanPlaceId = String(placeId || '').trim();
  if (!cleanPlaceId) throw new TypeError('Falta el identificador de Google Places.');
  const key = sessionToken
    ? `details-session:${sessionToken}:${cleanPlaceId}`
    : cacheKey(includeDisplayName ? 'refresh' : 'details', cleanPlaceId);
  if (!sessionToken) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  throwIfAborted(signal);
  const place = await sharedRequest(key, async () => {
    const request = firebaseCallable('googlePlaceDetails');
    const response = await request({
      placeId: cleanPlaceId,
      name: String(name || '').trim(),
      ...(sessionToken ? { sessionToken } : {}),
      ...(includeDisplayName ? { includeDisplayName: true } : {}),
      language: config.defaultLocale,
    });
    const resolved = response.data?.place || null;
    if (!isPlaced(resolved)) throw new Error('Google Places no devolvió coordenadas válidas.');
    return resolved;
  });
  throwIfAborted(signal);
  if (!sessionToken) setCached(key, place);
  return place;
}

export function createGooglePlacesSessionToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 96);
}

export async function autocompleteGooglePlaces(input, sessionToken, { signal } = {}) {
  const cleanInput = String(input || '').trim();
  if (cleanInput.length < config.googleMaps.searchMinChars || !sessionToken) return [];
  const key = cacheKey('autocomplete', cleanInput, sessionToken);
  const cached = getCached(key);
  if (cached) return cached;

  throwIfAborted(signal);
  const suggestions = await sharedRequest(key, async () => {
    const request = firebaseCallable('googlePlaceAutocomplete');
    const response = await request({
      input: cleanInput,
      sessionToken,
      language: config.defaultLocale,
    });
    return Array.isArray(response.data?.suggestions) ? response.data.suggestions : [];
  });
  throwIfAborted(signal);
  setCached(key, suggestions);
  return suggestions;
}

export async function resolveGooglePlace(prediction, sessionToken, { signal } = {}) {
  const placeId = String(prediction?.id || '').trim();
  if (!placeId || !sessionToken) throw new TypeError('Falta el lugar o la sesión de Google Places.');
  return requestPlaceDetails(placeId, {
    name: String(prediction?.name || '').trim(),
    sessionToken,
    signal,
  });
}

export async function refreshGooglePlace(placeId, { signal } = {}) {
  return requestPlaceDetails(placeId, { includeDisplayName: true, signal });
}

export async function searchGooglePlaces(query, { signal } = {}) {
  const cleanQuery = String(query || '').trim();
  if (cleanQuery.length < config.googleMaps.searchMinChars) return [];
  const key = cacheKey('search', cleanQuery);
  const cached = getCached(key);
  if (cached) return cached;

  throwIfAborted(signal);
  const results = await sharedRequest(key, async () => {
    const request = firebaseCallable('googlePlaceSearch');
    const response = await request({ query: cleanQuery, language: config.defaultLocale });
    return (Array.isArray(response.data?.results) ? response.data.results : [])
      .filter(isPlaced)
      .slice(0, config.googleMaps.searchLimit);
  });
  throwIfAborted(signal);
  setCached(key, results);
  return results;
}

export async function loadGooglePlaceLocations(placeIds, { signal } = {}) {
  const ids = [...new Set(
    (Array.isArray(placeIds) ? placeIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];
  if (!ids.length) return [];

  const locations = [];
  for (let index = 0; index < ids.length; index += 20) {
    throwIfAborted(signal);
    const batch = ids.slice(index, index + 20);
    const key = cacheKey('locations', [...batch].sort().join('|'));
    let resolved = getCached(key);
    if (!resolved) {
      resolved = await sharedRequest(key, async () => {
        const request = firebaseCallable('googlePlaceLocations');
        const response = await request({ placeIds: batch });
        return Array.isArray(response.data?.locations) ? response.data.locations : [];
      });
      setCached(key, resolved);
    }
    throwIfAborted(signal);
    locations.push(...resolved);
  }
  return locations;
}
