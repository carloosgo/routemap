// Estaciones intermedias de cada tramo de transporte público.
//
// Google Routes solo da la estación de subida y la de bajada (más el número de
// paradas). Las intermedias salen de OpenStreetMap (Overpass, gratis): las
// paradas de la relación de la línea (ref = número/letra de la línea) dentro
// del área del tramo, y solo las que quedan pegadas al trazo. Si Overpass falla
// o tarda, el tramo se queda con subida y bajada; nunca rompe la ruta.

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_TIMEOUT_MS = 7000;
const MAX_TRANSIT_SEGMENTS = 6;
const MAX_STOPS = 60;
const NEAR_LINE_METERS = 70;
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

export function stopPoint(name, latLng) {
  const lat = Number(latLng?.latitude);
  const lng = Number(latLng?.longitude);
  if (!validLatLng(lat, lng)) return null;
  return { name: cleanName(name), lat, lng };
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
export function intermediateStops(elements, segment) {
  const coordinates = segment?.geometry?.coordinates || [];
  const first = segment?.departure;
  const last = segment?.arrival;
  const candidates = [];
  (Array.isArray(elements) ? elements : []).forEach((element) => {
    if (element?.type !== 'node' || !isStopNode(element)) return;
    const point = { lat: Number(element.lat), lng: Number(element.lon) };
    if (!validLatLng(point.lat, point.lng)) return;
    const located = locateOnLine(point, coordinates);
    if (!located || located.distance > NEAR_LINE_METERS) return;
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
          'User-Agent': 'atlas-route-planner/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const payload = await response.json();
      if (Array.isArray(payload?.elements)) return payload.elements;
    } catch {
      // Siguiente espejo; si ninguno responde, el tramo queda sin intermedias.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Completa `stops` de cada tramo de transporte: subida, intermedias y bajada.
 * Quita los campos internos (departure, arrival, stopCount).
 */
export async function addTransitStops(segments, { fetchImpl = globalThis.fetch } = {}) {
  const list = Array.isArray(segments) ? segments : [];
  const transit = list.filter((segment) => segment?.kind === 'transit').slice(0, MAX_TRANSIT_SEGMENTS);
  await Promise.all(transit.map(async (segment) => {
    const query = typeof fetchImpl === 'function' ? overpassQuery(segment) : '';
    let elements = query ? await fetchOverpass(query, fetchImpl) : null;
    // Sin resultados con la línea (ref distinto en OSM): estaciones junto al trazo.
    if (query && segment.label && (!elements || !intermediateStops(elements, segment).length)) {
      const fallback = await fetchOverpass(overpassQuery({ ...segment, label: '' }), fetchImpl);
      if (fallback) elements = fallback;
    }
    segment.stops = [
      segment.departure,
      ...(elements ? intermediateStops(elements, segment) : []),
      segment.arrival,
    ].filter(Boolean).slice(0, MAX_STOPS);
  }));
  list.forEach((segment) => {
    if (segment?.kind === 'transit' && !Array.isArray(segment.stops)) {
      segment.stops = [segment.departure, segment.arrival].filter(Boolean);
    }
    delete segment.departure;
    delete segment.arrival;
    delete segment.stopCount;
    delete segment.vehicle;
  });
  return list;
}
