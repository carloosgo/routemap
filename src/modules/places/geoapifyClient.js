import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { config } from '../../config.js';

const CACHE_KEY = 'atlas:geoapify-search-cache:v1';
const memoryCache = new Map();
let emulatorConnected = false;

export function normalizeSearchKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function readDiskCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    Object.entries(parsed).forEach(([key, entry]) => memoryCache.set(key, entry));
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}

function persistCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(memoryCache)));
  } catch {
    // La caché es una optimización; una cuota llena no debe romper la búsqueda.
  }
}

readDiskCache();

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
  const cached = memoryCache.get(queryKey);
  if (cached && Date.now() - cached.timestamp < config.geoapify.clientCacheTtlMs) return cached.result;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const request = callable('geoapifyAutocomplete');
  const response = await request({ query, limit: config.geoapify.searchLimit });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const result = Array.isArray(response.data?.results) ? response.data.results : [];
  memoryCache.set(queryKey, { result, timestamp: Date.now() });
  persistCache();
  return result;
}

export async function requestGeoapifyRoute({ origin, destination, mode }) {
  const request = callable('geoapifyRoute');
  const response = await request({ origin, destination, mode });
  return response.data;
}

export async function reverseGeoapifyPoint(point) {
  const request = callable('geoapifyReverse');
  const response = await request({ point });
  return response.data;
}

export async function batchGeoapifyGeocode(queries) {
  const request = callable('geoapifyBatchGeocode');
  const response = await request({ queries: queries.slice(0, 1000) });
  return response.data?.results || [];
}
