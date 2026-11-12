import { uid } from '../../shared/utils.js';

export const SAVED_PLACE_ROUTE_MODES = Object.freeze([
  'drive',
  'transit',
  'train',
  'bus',
  'bicycle',
  'walk',
]);

const ROUTE_MODE_SET = new Set(SAVED_PLACE_ROUTE_MODES);
const LEGACY_ROUTE_MODE_MAP = Object.freeze({
  approximated_transit: 'transit',
});
const MAX_GEOMETRY_POINTS = 12000;
const MAX_MULTI_LINES = 256;

function normalizeId(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 128)
    : uid();
}

function normalizePlaceId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 128) : '';
}

function normalizeTimestamp(value) {
  return typeof value === 'string' ? value.trim().slice(0, 48) : '';
}

function normalizeShortText(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeProvider(value) {
  return value === 'google' ? 'google' : 'geoapify';
}

function normalizePosition(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return [lon, lat];
}

function sampleLine(coordinates, maxPoints) {
  if (coordinates.length <= maxPoints) return coordinates;
  if (maxPoints < 2) return [];
  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (coordinates.length - 1)) / (maxPoints - 1)
    );
    return coordinates[sourceIndex];
  });
}

function normalizeLine(value, maxPoints = MAX_GEOMETRY_POINTS) {
  if (!Array.isArray(value) || maxPoints <= 0) return [];
  const coordinates = value.map(normalizePosition).filter(Boolean);
  return sampleLine(coordinates, maxPoints);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TRANSIT_ICON_HOSTS = ['gstatic.com', 'google.com', 'googleapis.com', 'googleusercontent.com'];

function hexColor(value) {
  const color = String(value || '');
  return HEX_COLOR.test(color) ? color : '';
}

/** Logo de línea de Google: solo https y dominios de Google. */
export function normalizeTransitIcon(value) {
  const raw = typeof value === 'string' ? value.trim().slice(0, 500) : '';
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    const host = url.hostname.toLowerCase();
    const trusted = TRANSIT_ICON_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
    return url.protocol === 'https:' && trusted ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeTimeZone(value) {
  const zone = typeof value === 'string' ? value.trim().slice(0, 64) : '';
  if (!zone) return '';
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return '';
  }
}

function normalizeTransitSteps(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 24)
    .map((step) => ({
      departureStop: normalizeShortText(step?.departureStop),
      arrivalStop: normalizeShortText(step?.arrivalStop),
      departureTime: normalizeTimestamp(step?.departureTime),
      arrivalTime: normalizeTimestamp(step?.arrivalTime),
      departureTimeZone: normalizeTimeZone(step?.departureTimeZone),
      arrivalTimeZone: normalizeTimeZone(step?.arrivalTimeZone),
      lineName: normalizeShortText(step?.lineName, 120),
      lineShortName: normalizeShortText(step?.lineShortName, 60),
      lineColor: hexColor(step?.lineColor),
      lineTextColor: hexColor(step?.lineTextColor),
      lineIcon: normalizeTransitIcon(step?.lineIcon),
      vehicleType: normalizeShortText(step?.vehicleType, 60),
      agencies: (Array.isArray(step?.agencies) ? step.agencies : [])
        .map((agency) => normalizeShortText(agency, 120))
        .filter(Boolean)
        .slice(0, 4),
      headsign: normalizeShortText(step?.headsign, 120),
      stopCount: Math.max(0, Number(step?.stopCount) || 0),
      tripShortText: normalizeShortText(step?.tripShortText, 80),
    }));
}

const ROUTE_SEGMENT_KINDS = new Set(['transit', 'walk', 'other']);
const MAX_ROUTE_SEGMENTS = 40;

/** Estaciones de un tramo de transporte: subida, intermedias y bajada. */
export function normalizeTransitStops(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 60)
    .map((stop) => {
      const lat = Number(stop?.lat);
      const lng = Number(stop?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return { name: normalizeShortText(stop?.name, 80), lat, lng };
    })
    .filter(Boolean);
}

export function normalizeRouteSegments(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, MAX_ROUTE_SEGMENTS)
    .map((segment) => {
      const coordinates = normalizeLine(segment?.geometry?.coordinates, 2000);
      if (coordinates.length < 2) return null;
      return {
        kind: ROUTE_SEGMENT_KINDS.has(segment?.kind) ? segment.kind : 'other',
        color: hexColor(segment?.color),
        textColor: hexColor(segment?.textColor),
        label: normalizeShortText(segment?.label, 60),
        icon: normalizeTransitIcon(segment?.icon),
        geometry: { type: 'LineString', coordinates },
        ...(segment?.kind === 'transit'
          ? {
            stops: normalizeTransitStops(segment?.stops),
            stopCount: Math.max(0, Math.min(200, Math.trunc(Number(segment?.stopCount) || 0))),
            vehicle: normalizeShortText(segment?.vehicle, 40),
          }
          : {}),
      };
    })
    .filter(Boolean);
}

export function normalizeRouteGeometry(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'LineString') {
    const coordinates = normalizeLine(value.coordinates);
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
  }
  if (value.type === 'MultiLineString') {
    const lines = Array.isArray(value.coordinates) ? value.coordinates : [];
    const coordinates = [];
    let remainingPoints = MAX_GEOMETRY_POINTS;
    for (const rawLine of lines.slice(0, MAX_MULTI_LINES)) {
      if (remainingPoints < 2) break;
      const line = normalizeLine(rawLine, remainingPoints);
      if (line.length < 2) continue;
      coordinates.push(line);
      remainingPoints -= line.length;
    }
    return coordinates.length ? { type: 'MultiLineString', coordinates } : null;
  }
  return null;
}

export function normalizeSavedPlaceRouteMode(value) {
  const migrated = LEGACY_ROUTE_MODE_MAP[value] || value;
  return ROUTE_MODE_SET.has(migrated) ? migrated : 'drive';
}

export function createSavedPlaceRoute(partial = {}) {
  return {
    id: normalizeId(partial.id),
    fromPlaceId: normalizePlaceId(partial.fromPlaceId),
    toPlaceId: normalizePlaceId(partial.toPlaceId),
    provider: normalizeProvider(partial.provider),
    mode: normalizeSavedPlaceRouteMode(partial.mode),
    visible: partial.visible !== false,
    distance: normalizeMetric(partial.distance),
    duration: normalizeMetric(partial.duration),
    geometry: normalizeRouteGeometry(partial.geometry),
    calculatedAt: normalizeTimestamp(partial.calculatedAt),
    transitSteps: normalizeTransitSteps(partial.transitSteps),
    segments: normalizeRouteSegments(partial.segments),
  };
}

export function savedPlaceRoutePairKey(route) {
  return `${normalizePlaceId(route?.fromPlaceId)}\u0000${normalizePlaceId(route?.toPlaceId)}`;
}

export function consecutiveSavedPlaceRoutePairs(places) {
  const list = Array.isArray(places) ? places : [];
  const pairs = [];
  for (let index = 0; index < list.length - 1; index += 1) {
    const fromPlaceId = normalizePlaceId(list[index]?.id);
    const toPlaceId = normalizePlaceId(list[index + 1]?.id);
    if (!fromPlaceId || !toPlaceId || fromPlaceId === toPlaceId) continue;
    pairs.push({ fromPlaceId, toPlaceId });
  }
  return pairs;
}

export function normalizeSavedPlaceRoutes(rawRoutes, places, limit = 200) {
  const placeIds = new Set((places || []).map((place) => place.id));
  const seenPairs = new Set();
  const routes = [];

  for (const rawRoute of Array.isArray(rawRoutes) ? rawRoutes : []) {
    const route = createSavedPlaceRoute(rawRoute);
    if (
      !route.fromPlaceId
      || !route.toPlaceId
      || route.fromPlaceId === route.toPlaceId
      || !placeIds.has(route.fromPlaceId)
      || !placeIds.has(route.toPlaceId)
    ) {
      continue;
    }
    const pairKey = savedPlaceRoutePairKey(route);
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    routes.push(route);
    if (routes.length >= limit) break;
  }

  return routes;
}

export function savedPlaceRouteTotals(routes, { visibleOnly = false } = {}) {
  return (routes || []).reduce(
    (totals, route) => {
      if (visibleOnly && route.visible === false) return totals;
      if (!route.geometry) return totals;
      totals.distance += normalizeMetric(route.distance);
      totals.duration += normalizeMetric(route.duration);
      totals.count += 1;
      return totals;
    },
    { distance: 0, duration: 0, count: 0 }
  );
}
