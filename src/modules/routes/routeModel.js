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

function normalizeTransitSteps(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 24)
    .map((step) => ({
      departureStop: normalizeShortText(step?.departureStop),
      arrivalStop: normalizeShortText(step?.arrivalStop),
      departureTime: normalizeTimestamp(step?.departureTime),
      arrivalTime: normalizeTimestamp(step?.arrivalTime),
      lineName: normalizeShortText(step?.lineName, 120),
      lineShortName: normalizeShortText(step?.lineShortName, 60),
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
