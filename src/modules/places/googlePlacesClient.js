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

function validLocation(value) {
  const lat = Number(value?.lat);
  const lon = Number(value?.lon);
  return Number.isFinite(lat)
    && Math.abs(lat) <= 90
    && Number.isFinite(lon)
    && Math.abs(lon) <= 180;
}

function locationStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readLocationCache() {
  const storage = locationStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(config.googleMaps.locationCacheKey) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const current = now();
    const valid = {};
    let changed = false;
    Object.entries(parsed).forEach(([placeId, location]) => {
      if (
        placeId
        && validLocation(location)
        && Number(location?.expiresAt) > current
      ) {
        valid[placeId] = {
          lat: Number(location.lat),
          lon: Number(location.lon),
          expiresAt: Number(location.expiresAt),
        };
      } else {
        changed = true;
      }
    });
    if (changed) storage.setItem(config.googleMaps.locationCacheKey, JSON.stringify(valid));
    return valid;
  } catch {
    return {};
  }
}

function writeLocationCache(cache) {
  const storage = locationStorage();
  if (!storage) return;
  try {
    storage.setItem(config.googleMaps.locationCacheKey, JSON.stringify(cache));
  } catch {
    // Si el dispositivo no admite almacenamiento, el backend sigue funcionando.
  }
}

function rememberGoogleLocation(placeId, value) {
  const id = String(placeId || '').trim();
  if (!id || !validLocation(value)) return;
  const fetchedAt = Number(value?.fetchedAt) || now();
  const expiresAt = fetchedAt + config.googleMaps.locationCacheTtlMs;
  if (expiresAt <= now()) return;
  const cache = readLocationCache();
  cache[id] = {
    lat: Number(value.lat),
    lon: Number(value.lon),
    expiresAt,
  };
  writeLocationCache(cache);
}

function rememberPlaceLocation(place) {
  const placeId = String(place?.googlePlaceId || place?.id || '').trim();
  if (placeId && isPlaced(place)) {
    rememberGoogleLocation(placeId, {
      lat: place.lat,
      lon: place.lon,
      fetchedAt: now(),
    });
  }
}

async function requestPlaceDetails(placeId, { name = '', sessionToken = '', signal } = {}) {
  const cleanPlaceId = String(placeId || '').trim();
  if (!cleanPlaceId || !sessionToken) {
    throw new TypeError('Falta el lugar o la sesión de Google Places.');
  }
  const key = `details-session:${sessionToken}:${cleanPlaceId}`;

  throwIfAborted(signal);
  const place = await sharedRequest(key, async () => {
    const request = firebaseCallable('googlePlaceDetailsEssentials');
    const response = await request({
      placeId: cleanPlaceId,
      name: String(name || '').trim(),
      sessionToken,
      language: config.defaultLocale,
    });
    const resolved = response.data?.place || null;
    if (!isPlaced(resolved)) throw new Error('Google Places no devolvió coordenadas válidas.');
    return resolved;
  });
  throwIfAborted(signal);
  rememberPlaceLocation(place);
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
  results.forEach(rememberPlaceLocation);
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

  const persistent = readLocationCache();
  const locations = [];
  const missingIds = [];
  ids.forEach((placeId) => {
    const cached = persistent[placeId];
    if (cached && validLocation(cached)) {
      locations.push({ placeId, lat: cached.lat, lon: cached.lon, localCacheHit: true });
    } else {
      missingIds.push(placeId);
    }
  });

  for (let index = 0; index < missingIds.length; index += 20) {
    throwIfAborted(signal);
    const batch = missingIds.slice(index, index + 20);
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
    resolved.forEach((location) => {
      if (location?.placeId && validLocation(location)) {
        rememberGoogleLocation(location.placeId, location);
        locations.push(location);
      }
    });
  }
  return locations;
}
