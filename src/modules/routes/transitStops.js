import { useSyncExternalStore } from 'react';

// Estaciones intermedias de cada tramo de transporte público.
//
// Google Routes solo da la estación de subida y la de bajada (más el número de
// paradas). Después de dibujar la ruta, el navegador pide a la función
// `googleTransitStops` las estaciones del tipo de la línea (metro, tranvía,
// tren o bus) a lo largo del trazo, y se queda solo con las que quedan pegadas
// a la línea. Si falla, el tramo se queda con subida y bajada.

const MAX_STOPS = 60;
// El trazo de Google viene simplificado y la ubicación de cada estación es su
// centro, no el andén: se aceptan estaciones hasta ~130 m de la línea.
const NEAR_LINE_METERS = 130;
const MAX_LINE_POINTS = 400;
const SAME_STOP_METERS = 160;

const STOP_TAGS = new Set(['stop_position', 'station', 'platform']);
const STOP_RAILWAY = new Set(['station', 'halt', 'tram_stop', 'stop']);

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function validLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

// Metros aproximados en un plano local (suficiente para una ciudad).
function project(point, origin) {
  const k = Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * 111320 * k,
    y: (point.lat - origin.lat) * 110540,
  };
}

function distanceMeters(a, b) {
  const p = project(b, a);
  return Math.hypot(p.x, p.y);
}

/** Distancia del punto al trazo y cuánto se avanza sobre él hasta ahí. */
export function locateOnLine(point, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const origin = { lat: point.lat, lng: point.lng };
  let best = null;
  let travelled = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    const a = project({ lng: coordinates[i - 1][0], lat: coordinates[i - 1][1] }, origin);
    const b = project({ lng: coordinates[i][0], lat: coordinates[i][1] }, origin);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const t = length > 0 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (length * length))) : 0;
    const distance = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (!best || distance < best.distance) best = { distance, along: travelled + t * length };
    travelled += length;
  }
  return best;
}

function isStopNode(element) {
  const tags = element?.tags || {};
  return Boolean(cleanName(tags.name))
    && (STOP_TAGS.has(tags.public_transport) || STOP_RAILWAY.has(tags.railway) || tags.highway === 'bus_stop');
}

/**
 * Elige las paradas intermedias entre subida y bajada: pegadas al trazo, en
 * orden de recorrido, una por nombre y, si se sabe, no más de las que Google
 * cuenta (stopCount incluye la de bajada).
 */
export function intermediateStops(elements, segment, { maxDistance = NEAR_LINE_METERS } = {}) {
  const coordinates = segment?.geometry?.coordinates || [];
  const ends = Array.isArray(segment?.stops) ? segment.stops : [];
  const first = ends[0] || null;
  const last = ends.length > 1 ? ends[ends.length - 1] : null;
  const candidates = [];
  (Array.isArray(elements) ? elements : []).forEach((element) => {
    if (element?.type !== 'node' || !isStopNode(element)) return;
    const point = { lat: Number(element.lat), lng: Number(element.lon) };
    if (!validLatLng(point.lat, point.lng)) return;
    const located = locateOnLine(point, coordinates);
    if (!located || located.distance > maxDistance) return;
    const name = cleanName(element.tags.name);
    if (first && (distanceMeters(point, first) < SAME_STOP_METERS || name === first.name)) return;
    if (last && (distanceMeters(point, last) < SAME_STOP_METERS || name === last.name)) return;
    candidates.push({ name, lat: point.lat, lng: point.lng, along: located.along, distance: located.distance });
  });

  // Una por estación: la más pegada al trazo entre las que se llaman igual y
  // están juntas (andenes, entradas y posiciones de parada de cada sentido).
  const unique = [];
  candidates
    .sort((a, b) => a.distance - b.distance)
    .forEach((stop) => {
      if (unique.some((kept) => kept.name === stop.name && distanceMeters(kept, stop) < SAME_STOP_METERS * 2)) return;
      unique.push(stop);
    });

  const limit = Number(segment?.stopCount) > 0 ? Math.max(0, Number(segment.stopCount) - 1) : MAX_STOPS;
  return unique
    .slice(0, limit)
    .sort((a, b) => a.along - b.along)
    .map(({ name, lat, lng }) => ({ name, lat, lng }));
}

/** Estaciones de Google ({name, lat, lng}) en el formato de nodos que filtra intermediateStops. */
export function placesAsStopNodes(places) {
  return (Array.isArray(places) ? places : []).map((place, index) => ({
    type: 'node',
    id: index,
    lat: Number(place?.lat),
    lon: Number(place?.lng),
    tags: { name: place?.name, public_transport: 'station' },
  }));
}

function lineForRequest(coordinates) {
  const line = Array.isArray(coordinates) ? coordinates : [];
  if (line.length <= MAX_LINE_POINTS) return line;
  const step = (line.length - 1) / (MAX_LINE_POINTS - 1);
  return Array.from({ length: MAX_LINE_POINTS }, (_, index) => line[Math.round(index * step)]);
}

async function loadGooglePlaces(segment) {
  const { firebaseCallable } = await import('../../infrastructure/firebase/callableFunctions.js');
  const response = await firebaseCallable('googleTransitStops')({
    vehicle: segment?.vehicle || '',
    coordinates: lineForRequest(segment?.geometry?.coordinates),
  });
  return Array.isArray(response?.data?.places) ? response.data.places : [];
}

const STORAGE_KEY = 'atlas.transitStops.v2';
const STORAGE_MAX_ENTRIES = 200;
const found = new Map();
const pending = new Map();
const failures = new Map();
const RETRY_AFTER_MS = 2 * 60 * 1000;
const listeners = new Set();
let version = 0;
let loaded = false;

function loadStored() {
  if (loaded) return;
  loaded = true;
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(stored)) stored.forEach(([key, stops]) => found.set(key, stops));
  } catch {
    // Sin almacenamiento: se vuelven a buscar en la sesión.
  }
}

function saveStored() {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...found].slice(-STORAGE_MAX_ENTRIES)));
  } catch {
    // Almacenamiento lleno o bloqueado: no pasa nada.
  }
}

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function transitStopsKey(segment) {
  const ends = Array.isArray(segment?.stops) ? segment.stops : [];
  const round = (value) => Number(value || 0).toFixed(4);
  const first = ends[0];
  const last = ends[ends.length - 1];
  if (!first || !last) return '';
  return [segment?.label || '', segment?.vehicle || '', round(first.lat), round(first.lng), round(last.lat), round(last.lng)].join('|');
}

/** Subida, intermedias (si ya se encontraron) y bajada del tramo. */
export function segmentStops(segment) {
  loadStored();
  const ends = Array.isArray(segment?.stops) ? segment.stops : [];
  const middle = found.get(transitStopsKey(segment));
  if (!middle?.length || ends.length < 2) return ends;
  return [ends[0], ...middle, ends[ends.length - 1]];
}

/** Busca una sola vez por tramo las estaciones intermedias. */
export function ensureTransitStops(segment, { loadPlaces = loadGooglePlaces } = {}) {
  loadStored();
  const key = transitStopsKey(segment);
  if (!key || segment?.kind !== 'transit') return Promise.resolve([]);
  if (found.has(key)) return Promise.resolve(found.get(key));
  if (pending.has(key)) return pending.get(key);
  if (Date.now() - (failures.get(key) || 0) < RETRY_AFTER_MS) return Promise.resolve([]);
  const request = (async () => {
    try {
      const places = await loadPlaces(segment);
      const stops = intermediateStops(placesAsStopNodes(places), segment);
      found.set(key, stops);
      saveStored();
      if (stops.length) emit();
      return stops;
    } catch (error) {
      failures.set(key, Date.now());
      globalThis.console?.warn?.('[Atlas estaciones]', error?.code || error?.name || 'Error', error?.message || '');
      return [];
    }
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTransitStopsVersion() {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

/** Solo para tests. */
export function resetTransitStopsForTests() {
  found.clear();
  pending.clear();
  failures.clear();
  loaded = true;
}
