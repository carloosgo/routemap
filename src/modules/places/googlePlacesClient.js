import { config } from '../../config.js';
import { firebaseCallable } from '../../infrastructure/firebase/callableFunctions.js';
import { isPlaced } from '../trips/tripModel.js';

const memoryCache = new Map();

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
  if (memoryCache.size >= 80) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { timestamp: now(), value });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
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
  const request = firebaseCallable('googlePlaceAutocomplete');
  const response = await request({ input: cleanInput, sessionToken, language: config.defaultLocale });
  throwIfAborted(signal);
  const suggestions = Array.isArray(response.data?.suggestions) ? response.data.suggestions : [];
  setCached(key, suggestions);
  return suggestions;
}

export async function resolveGooglePlace(prediction, sessionToken, { signal } = {}) {
  const placeId = String(prediction?.id || '').trim();
  if (!placeId || !sessionToken) throw new TypeError('Falta el lugar o la sesión de Google Places.');
  throwIfAborted(signal);
  const request = firebaseCallable('googlePlaceDetails');
  const response = await request({
    placeId,
    name: String(prediction?.name || '').trim(),
    sessionToken,
    language: config.defaultLocale,
  });
  throwIfAborted(signal);
  const place = response.data?.place || null;
  if (!isPlaced(place)) throw new Error('Google Places no devolvió coordenadas válidas.');
  return place;
}

export async function searchGooglePlaces(query, { signal } = {}) {
  const cleanQuery = String(query || '').trim();
  if (cleanQuery.length < config.googleMaps.searchMinChars) return [];
  throwIfAborted(signal);
  const request = firebaseCallable('googlePlaceSearch');
  const response = await request({ query: cleanQuery, language: config.defaultLocale });
  throwIfAborted(signal);
  return (Array.isArray(response.data?.results) ? response.data.results : [])
    .filter(isPlaced)
    .slice(0, config.googleMaps.searchLimit);
}
