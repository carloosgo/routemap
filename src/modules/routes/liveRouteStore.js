import { useSyncExternalStore } from 'react';

/**
 * Geometría viva de las rutas de Mis rutas. El viaje solo guarda el modo
 * elegido entre dos lugares; la línea, los tramos de transporte y los tiempos
 * de Google se recalculan en la sesión y viven aquí, sin tocar el autosave.
 */

const live = new Map();
const pending = new Map();
const failures = new Map();
const RETRY_AFTER_MS = 2 * 60 * 1000;
const listeners = new Set();
let version = 0;

// Copia en el teléfono de la última ruta calculada por par y modo. Con
// conexión se recalcula en cada sesión (horarios frescos); sin conexión, o si
// el cálculo falla, se muestra esta copia con su duración y sus transbordos.
const SAVED_ROUTES_KEY = 'atlas:routes:v1';
const SAVED_ROUTES_LIMIT = 150;
let savedRoutes = null;

function routeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readSavedRoutes() {
  if (savedRoutes) return savedRoutes;
  savedRoutes = new Map();
  try {
    const parsed = JSON.parse(routeStorage()?.getItem(SAVED_ROUTES_KEY) || '[]');
    if (Array.isArray(parsed)) {
      parsed.forEach((entry) => {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[1]?.geometry) {
          savedRoutes.set(entry[0], entry[1]);
        }
      });
    }
  } catch {
    // Copia dañada o sin almacenamiento: se empieza de cero.
  }
  return savedRoutes;
}

function writeSavedRoutes() {
  const storage = routeStorage();
  if (!storage || !savedRoutes) return;
  let entries = [...savedRoutes.entries()].slice(-SAVED_ROUTES_LIMIT);
  while (entries.length) {
    try {
      storage.setItem(SAVED_ROUTES_KEY, JSON.stringify(entries));
      return;
    } catch {
      // Sin espacio: se descartan las rutas más viejas.
      entries = entries.slice(Math.ceil(entries.length / 2));
      savedRoutes = new Map(entries);
    }
  }
}

function saveRoute(key, route) {
  const routes = readSavedRoutes();
  routes.delete(key);
  routes.set(key, route);
  while (routes.size > SAVED_ROUTES_LIMIT) routes.delete(routes.keys().next().value);
  writeSavedRoutes();
}

function savedRoute(key) {
  return readSavedRoutes().get(key) || null;
}

function deviceOffline() {
  return globalThis.navigator?.onLine === false;
}

export function liveRouteKey(fromPlaceId, toPlaceId, mode) {
  return `${fromPlaceId}>${toPlaceId}:${mode}`;
}

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function getLiveRoute(fromPlaceId, toPlaceId, mode) {
  return live.get(liveRouteKey(fromPlaceId, toPlaceId, mode)) || null;
}

export function setLiveRoute(fromPlaceId, toPlaceId, mode, route) {
  if (!fromPlaceId || !toPlaceId || !mode || !route?.geometry) return;
  const key = liveRouteKey(fromPlaceId, toPlaceId, mode);
  live.set(key, route);
  saveRoute(key, route);
  emit();
}

/** Pide la ruta una sola vez por par y modo aunque varios componentes la necesiten. */
export function ensureLiveRoute(fromPlaceId, toPlaceId, mode, loader) {
  const key = liveRouteKey(fromPlaceId, toPlaceId, mode);
  if (live.has(key)) return Promise.resolve(live.get(key));
  if (pending.has(key)) return pending.get(key);
  const saved = savedRoute(key);
  if (saved && deviceOffline()) {
    live.set(key, saved);
    emit();
    return Promise.resolve(saved);
  }
  // Un fallo no se reintenta en cada render: espera un par de minutos.
  if (Date.now() - (failures.get(key) || 0) < RETRY_AFTER_MS) {
    return Promise.reject(new Error('route-recently-failed'));
  }
  const request = Promise.resolve()
    .then(loader)
    .then((route) => {
      failures.delete(key);
      setLiveRoute(fromPlaceId, toPlaceId, mode, route);
      return route;
    })
    .catch((error) => {
      failures.set(key, Date.now());
      // Sin red o con el cálculo caído, se usa la última ruta conocida.
      if (saved) {
        live.set(key, saved);
        emit();
        return saved;
      }
      throw error;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/** Ruta guardada completada con la geometría viva de la sesión, si existe. */
export function withLiveGeometry(route) {
  if (!route || route.geometry) return route;
  const current = getLiveRoute(route.fromPlaceId, route.toPlaceId, route.mode);
  if (!current) return route;
  return {
    ...route,
    geometry: current.geometry,
    segments: current.segments || [],
    transitSteps: current.transitSteps || [],
    distance: Number(route.distance) || Number(current.distance) || 0,
    duration: Number(route.duration) || Number(current.duration) || 0,
  };
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return version;
}

export function useLiveRoutesVersion() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function clearLiveRoutesForTests({ keepSaved = false } = {}) {
  if (!keepSaved) {
    savedRoutes = new Map();
    try { routeStorage()?.removeItem(SAVED_ROUTES_KEY); } catch { /* sin almacenamiento */ }
  }
  live.clear();
  pending.clear();
  failures.clear();
  emit();
}
