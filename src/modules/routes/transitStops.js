import { useSyncExternalStore } from 'react';

// Estaciones intermedias de cada tramo de transporte público.
//
// Google Routes solo da la estación de subida y la de bajada (más el número de
// paradas). Las intermedias las busca el navegador en OpenStreetMap (Overpass,
// gratis) después de dibujar la ruta, para no hacerla esperar: las paradas de
// la relación de la línea (ref = número/letra de la línea) dentro del área del
// tramo, y solo las que quedan pegadas al trazo. Si Overpass falla o tarda, el
// tramo se queda con subida y bajada.

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_TIMEOUT_MS = 9000;
const MAX_STOPS = 60;
// El trazo de Google viene simplificado: las paradas de la propia línea se
// aceptan más lejos que las estaciones sueltas buscadas sin línea.
const NEAR_LINE_METERS = 70;
const NEAR_LINE_METERS_BY_LINE = 160;
const SAME_STOP_METERS = 160;
const BBOX_PADDING_DEG = 0.004;

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
export function intermediateStops(elements, segment, { byLine = false } = {}) {
  const maxDistance = byLine ? NEAR_LINE_METERS_BY_LINE : NEAR_LINE_METERS;
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

function bbox(coordinates) {
  let south = 90;
  let west = 180;
  let north = -90;
  let east = -180;
  coordinates.forEach(([lng, lat]) => {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  });
  return [south - BBOX_PADDING_DEG, west - BBOX_PADDING_DEG, north + BBOX_PADDING_DEG, east + BBOX_PADDING_DEG]
    .map((value) => value.toFixed(5))
    .join(',');
}

const ROUTE_TYPES = Object.freeze({
  SUBWAY: 'subway|light_rail',
  METRO_RAIL: 'subway|light_rail',
  TRAM: 'tram|light_rail',
  LIGHT_RAIL: 'light_rail|tram|subway',
  RAIL: 'train|light_rail|subway',
  HEAVY_RAIL: 'train|light_rail|subway',
  COMMUTER_TRAIN: 'train|light_rail|subway',
  HIGH_SPEED_TRAIN: 'train',
  LONG_DISTANCE_TRAIN: 'train',
  MONORAIL: 'monorail',
  BUS: 'bus|trolleybus',
  INTERCITY_BUS: 'bus|coach',
  TROLLEYBUS: 'trolleybus|bus',
  FERRY: 'ferry',
});

function overpassString(value) {
  return String(value || '').replace(/[\\"]/g, '').slice(0, 30);
}

/** Consulta de Overpass: paradas de la línea (por ref) dentro del área del tramo. */
export function overpassQuery(segment) {
  const coordinates = segment?.geometry?.coordinates || [];
  if (coordinates.length < 2) return '';
  const area = bbox(coordinates);
  const ref = overpassString(segment?.label);
  if (ref) {
    const types = ROUTE_TYPES[String(segment?.vehicle || '')];
    const type = types ? `["route"~"^(${types})$"]` : '';
    return `[out:json][timeout:6];rel["type"="route"]["ref"="${ref}"]${type}(${area});node(r)(${area});out body;`;
  }
  return `[out:json][timeout:6];(node["public_transport"="station"](${area});node["railway"~"^(station|halt|tram_stop)$"](${area}););out body;`;
}

async function fetchOverpass(query, fetchImpl) {
  for (const url of OVERPASS_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) {
        globalThis.console?.warn?.('[Atlas estaciones]', url, response.status);
        continue;
      }
      const payload = await response.json();
      if (Array.isArray(payload?.elements)) return payload.elements;
    } catch (error) {
      // Siguiente espejo; si ninguno responde, el tramo queda sin intermedias.
      globalThis.console?.warn?.('[Atlas estaciones]', url, error?.name || 'Error', error?.message || '');
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

const STORAGE_KEY = 'atlas.transitStops.v1';
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

/** Busca una sola vez por tramo las estaciones intermedias en Overpass. */
// `fetch` suelto (sin `window` como this) lanza «Illegal invocation» en el
// navegador; por eso se envuelve.
const browserFetch = (...args) => globalThis.fetch(...args);

export function ensureTransitStops(segment, { fetchImpl = browserFetch } = {}) {
  loadStored();
  const key = transitStopsKey(segment);
  if (!key || segment?.kind !== 'transit' || typeof globalThis.fetch !== 'function') return Promise.resolve([]);
  if (found.has(key)) return Promise.resolve(found.get(key));
  if (pending.has(key)) return pending.get(key);
  if (Date.now() - (failures.get(key) || 0) < RETRY_AFTER_MS) return Promise.resolve([]);
  const request = (async () => {
    let elements = await fetchOverpass(overpassQuery(segment), fetchImpl);
    let stops = elements ? intermediateStops(elements, segment, { byLine: Boolean(segment.label) }) : [];
    // La línea no aparece con ese ref en OSM: estaciones junto al trazo.
    if (!stops.length && segment.label) {
      elements = await fetchOverpass(overpassQuery({ ...segment, label: '' }), fetchImpl);
      stops = elements ? intermediateStops(elements, segment) : [];
    }
    if (!elements) failures.set(key, Date.now());
    if (elements) {
      found.set(key, stops);
      saveStored();
      if (stops.length) emit();
    }
    return stops;
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
