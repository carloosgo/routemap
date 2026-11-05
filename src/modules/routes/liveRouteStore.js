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
  live.set(liveRouteKey(fromPlaceId, toPlaceId, mode), route);
  emit();
}

/** Pide la ruta una sola vez por par y modo aunque varios componentes la necesiten. */
export function ensureLiveRoute(fromPlaceId, toPlaceId, mode, loader) {
  const key = liveRouteKey(fromPlaceId, toPlaceId, mode);
  if (live.has(key)) return Promise.resolve(live.get(key));
  if (pending.has(key)) return pending.get(key);
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

export function clearLiveRoutesForTests() {
  live.clear();
  pending.clear();
  failures.clear();
  emit();
}
