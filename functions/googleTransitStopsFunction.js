import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { GOOGLE_PLACES_API_KEY, QUOTAS, cacheDb, db } from './geoapifyRuntime.js';
import { limitedFetch, safeError } from './geoapifySupport.js';
import { createSharedCache } from './sharedCache.js';

// Estaciones a lo largo de un tramo de transporte público (Google Places,
// búsqueda cercana por tipo de estación en círculos sobre el trazo). El
// cliente se queda con las que quedan pegadas a la línea.
const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const NEARBY_FIELDS = 'places.displayName,places.location';
const STATION_CACHE_TTL_MS = 29 * 24 * 60 * 60 * 1000;
const cachedStations = createSharedCache(cacheDb, { ttlMs: STATION_CACHE_TTL_MS });

const MAX_POINTS = 400;
// Tramos largos (RER, tren) con círculos más chicos y más numerosos: cada
// búsqueda devuelve como máximo 20 estaciones ordenadas por distancia al
// centro, y en el centro de una ciudad el metro llenaba ese cupo antes que el
// tren.
const MAX_CIRCLES = 16;
const BASE_SPACING_METERS = 700;
const MAX_PLACES = 120;

const STATION_TYPES = Object.freeze({
  SUBWAY: ['subway_station'],
  METRO_RAIL: ['subway_station'],
  MONORAIL: ['subway_station', 'transit_station'],
  TRAM: ['light_rail_station', 'transit_station'],
  LIGHT_RAIL: ['light_rail_station', 'transit_station'],
  RAIL: ['train_station', 'subway_station', 'transit_station', 'light_rail_station'],
  HEAVY_RAIL: ['train_station', 'subway_station', 'transit_station', 'light_rail_station'],
  COMMUTER_TRAIN: ['train_station', 'subway_station', 'transit_station', 'light_rail_station'],
  HIGH_SPEED_TRAIN: ['train_station', 'transit_station'],
  LONG_DISTANCE_TRAIN: ['train_station', 'transit_station'],
  BUS: ['bus_stop', 'bus_station'],
  INTERCITY_BUS: ['bus_station', 'bus_stop'],
  TROLLEYBUS: ['bus_stop', 'bus_station'],
  FERRY: ['ferry_terminal'],
});
const DEFAULT_TYPES = ['subway_station', 'train_station', 'light_rail_station', 'transit_station'];

const BUS_VEHICLES = new Set(['BUS', 'INTERCITY_BUS', 'TROLLEYBUS']);

export function stationTypes(vehicle) {
  return STATION_TYPES[String(vehicle || '')] || DEFAULT_TYPES;
}

/** Para riel se descartan paradas de bus (también llevan transit_station). */
export function excludedStationTypes(vehicle) {
  return BUS_VEHICLES.has(String(vehicle || '')) ? [] : ['bus_stop', 'bus_station'];
}

function validPoint(point) {
  return Array.isArray(point)
    && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
    && Math.abs(Number(point[0])) <= 180 && Math.abs(Number(point[1])) <= 90;
}

function meters(a, b) {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * 111320 * k, (b[1] - a[1]) * 110540);
}

/** Centros de búsqueda repartidos sobre el trazo y su radio (cubren todo el tramo). */
export function searchCircles(coordinates) {
  const line = (Array.isArray(coordinates) ? coordinates : []).filter(validPoint)
    .slice(0, MAX_POINTS)
    .map(([lng, lat]) => [Number(lng), Number(lat)]);
  if (line.length < 2) return [];
  let total = 0;
  for (let i = 1; i < line.length; i += 1) total += meters(line[i - 1], line[i]);
  const spacing = Math.max(BASE_SPACING_METERS, total / MAX_CIRCLES);
  const radius = Math.round(spacing * 0.6 + 80);
  const count = Math.max(1, Math.ceil(total / spacing));
  const circles = [];
  for (let n = 0; n < count; n += 1) {
    const target = Math.min(total, (n + 0.5) * (total / count));
    let walked = 0;
    for (let i = 1; i < line.length; i += 1) {
      const step = meters(line[i - 1], line[i]);
      if (walked + step >= target || i === line.length - 1) {
        const t = step > 0 ? Math.min(1, Math.max(0, (target - walked) / step)) : 0;
        circles.push({
          lat: Number((line[i - 1][1] + t * (line[i][1] - line[i - 1][1])).toFixed(5)),
          lng: Number((line[i - 1][0] + t * (line[i][0] - line[i - 1][0])).toFixed(5)),
          radius,
        });
        break;
      }
      walked += step;
    }
  }
  return circles;
}

function requireKey() {
  const key = GOOGLE_PLACES_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Falta el secreto GOOGLE_PLACES_API_KEY.');
  return key;
}

async function nearbyStations(circle, types, excluded) {
  const payload = await limitedFetch(
    NEARBY_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': requireKey(),
        'X-Goog-FieldMask': NEARBY_FIELDS,
      },
      body: JSON.stringify({
        includedTypes: types,
        ...(excluded.length ? { excludedTypes: excluded } : {}),
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: { center: { latitude: circle.lat, longitude: circle.lng }, radius: circle.radius },
        },
      }),
    },
    'Google Places nearby stations'
  );
  return (Array.isArray(payload?.places) ? payload.places : [])
    .map((place) => ({
      name: String(place?.displayName?.text || '').trim().slice(0, 80),
      lat: Number(place?.location?.latitude),
      lng: Number(place?.location?.longitude),
    }))
    .filter((place) => place.name && Number.isFinite(place.lat) && Number.isFinite(place.lng));
}

export const googleTransitStops = onCall(
  callableOptions({
    secrets: [GOOGLE_PLACES_API_KEY],
    enforceAppCheck: false,
    maxInstances: 6,
  }),
  async (request) => {
    await enforceQuota(db, request, QUOTAS.googleTransitStops);
    const types = stationTypes(request.data?.vehicle);
    const excluded = excludedStationTypes(request.data?.vehicle);
    const circles = searchCircles(request.data?.coordinates);
    if (!circles.length) return { places: [] };
    try {
      const results = await Promise.all(circles.map(async (circle) => {
        const key = ['v2', types.join(','), excluded.join(','), circle.lat, circle.lng, circle.radius].join('|');
        const { result } = await cachedStations('googleTransitStations', key, () => nearbyStations(circle, types, excluded));
        return Array.isArray(result) ? result : [];
      }));
      const seen = new Set();
      const places = results.flat().filter((place) => {
        const key = `${place.name}|${place.lat.toFixed(4)}|${place.lng.toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, MAX_PLACES);
      return { places };
    } catch (error) {
      logError('Google transit stops failed.', safeError(error));
      throw new HttpsError('internal', 'No fue posible buscar las estaciones.');
    }
  }
);
