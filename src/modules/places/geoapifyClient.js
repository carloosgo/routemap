import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { config } from '../../config.js';

const PLACE_CACHE_KEY = 'atlas:geoapify-place-cache:v1';
const BOUNDARY_CACHE_KEY = 'atlas:geoapify-country-boundary-cache:v4';
const BOUNDARY_GEOMETRY_SOURCE = 'details.full_geometry';
const placeCache = new Map();
const boundaryCache = new Map();
const boundaryRequests = new Map();
let emulatorConnected = false;

export function normalizeSearchKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function isCountryBoundaryFeature(feature) {
  return feature?.type === 'Feature'
    && ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type)
    && Array.isArray(feature?.geometry?.coordinates);
}

function readCache(storageKey, target) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
    Object.entries(parsed).forEach(([key, entry]) => target.set(key, entry));
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function persistCache(storageKey, target) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(target)));
  } catch {
    // La caché es opcional y nunca debe bloquear la aplicación.
  }
}

readCache(PLACE_CACHE_KEY, placeCache);
readCache(BOUNDARY_CACHE_KEY, boundaryCache);

function callable(name) {
  const { app } = getFirebaseServices();
  const functions = getFunctions(app, config.geoapify.functionRegion);
  if (config.firebase.useEmulators && !emulatorConnected) {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorConnected = true;
  }
  return httpsCallable(functions, name);
}

export async function searchGeoapifyPlaces(query, { signal } = {}) {
  const queryKey = normalizeSearchKey(query);
  if (queryKey.length < config.geoapify.searchMinChars) return [];

  const cached = placeCache.get(queryKey);
  if (cached && Date.now() - cached.timestamp < config.geoapify.clientCacheTtlMs) {
    return cached.result;
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const request = callable('geoapifyPlaceSearch');
  const response = await request({ query, limit: config.geoapify.searchLimit });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const result = Array.isArray(response.data?.results) ? response.data.results : [];
  placeCache.set(queryKey, { result, timestamp: Date.now() });
  persistCache(PLACE_CACHE_KEY, placeCache);
  return result;
}

export async function getGeoapifyCountryBoundary({ countryCode, lat, lon }) {
  const key = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(key)) return null;

  const cached = boundaryCache.get(key);
  if (
    cached
    && cached.geometrySource === BOUNDARY_GEOMETRY_SOURCE
    && isCountryBoundaryFeature(cached.result)
    && Date.now() - cached.timestamp < config.geoapify.clientCacheTtlMs
  ) {
    return cached.result;
  }

  if (cached) {
    boundaryCache.delete(key);
    persistCache(BOUNDARY_CACHE_KEY, boundaryCache);
  }

  if (boundaryRequests.has(key)) return boundaryRequests.get(key);

  const pending = (async () => {
    const request = callable('geoapifyCountryBoundary');
    const response = await request({ countryCode: key, lat, lon });
    const result = response.data?.feature || null;
    const geometrySource = String(response.data?.geometrySource || '');

    if (!isCountryBoundaryFeature(result)) {
      throw new Error(`No se recibió una frontera válida para ${key}.`);
    }
    if (geometrySource !== BOUNDARY_GEOMETRY_SOURCE) {
      throw new Error(
        `La función de fronteras para ${key} aún no usa la geometría original.`
      );
    }

    boundaryCache.set(key, {
      result,
      geometrySource,
      timestamp: Date.now(),
    });
    persistCache(BOUNDARY_CACHE_KEY, boundaryCache);
    return result;
  })();

  boundaryRequests.set(key, pending);
  try {
    return await pending;
  } finally {
    boundaryRequests.delete(key);
  }
}
