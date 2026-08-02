import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getFirebaseServices } from '../../infrastructure/firebase/firebaseClient.js';
import { config } from '../../config.js';

const CACHE_KEY = 'atlas:geoapify-place-cache:v1';
const memoryCache = new Map();
let emulatorConnected = false;

export function normalizeSearchKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
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
    // La caché es opcional y nunca debe bloquear la búsqueda.
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
  if (cached && Date.now() - cached.timestamp < config.geoapify.clientCacheTtlMs) {
    return cached.result;
  }

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const request = callable('geoapifyPlaceSearch');
  const response = await request({ query, limit: config.geoapify.searchLimit });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const result = Array.isArray(response.data?.results) ? response.data.results : [];
  memoryCache.set(queryKey, { result, timestamp: Date.now() });
  persistCache();
  return result;
}
