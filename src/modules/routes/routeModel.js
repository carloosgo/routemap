import { uid } from '../../shared/utils.js';

export const SAVED_PLACE_ROUTE_MODES = Object.freeze([
  'drive',
  'bus',
  'bicycle',
  'walk',
  'transit',
  'approximated_transit',
]);

const ROUTE_MODE_SET = new Set(SAVED_PLACE_ROUTE_MODES);
const MAX_LINE_POINTS = 30000;
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
  return typeof value === 'string' ? value.trim().slice(0, 40) : '';
}

function normalizeMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizePosition(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return [lon, lat];
}

function normalizeLine(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_LINE_POINTS)
    .map(normalizePosition)
    .filter(Boolean);
}

export function normalizeRouteGeometry(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'LineString') {
    const coordinates = normalizeLine(value.coordinates);
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : null;
  }
  if (value.type === 'MultiLineString') {
    const coordinates = (Array.isArray(value.coordinates) ? value.coordinates : [])
      .slice(0, MAX_MULTI_LINES)
      .map(normalizeLine)
      .filter((line) => line.length >= 2);
    return coordinates.length ? { type: 'MultiLineString', coordinates } : null;
  }
  return null;
}

export function normalizeSavedPlaceRouteMode(value) {
  return ROUTE_MODE_SET.has(value) ? value : 'drive';
}

export function createSavedPlaceRoute(partial = {}) {
  return {
    id: normalizeId(partial.id),
    fromPlaceId: normalizePlaceId(partial.fromPlaceId),
    toPlaceId: normalizePlaceId(partial.toPlaceId),
    mode: normalizeSavedPlaceRouteMode(partial.mode),
    visible: partial.visible !== false,
    distance: normalizeMetric(partial.distance),
    duration: normalizeMetric(partial.duration),
    geometry: normalizeRouteGeometry(partial.geometry),
    calculatedAt: normalizeTimestamp(partial.calculatedAt),
  };
}

export function savedPlaceRoutePairKey(route) {
  return `${normalizePlaceId(route?.fromPlaceId)}\u0000${normalizePlaceId(route?.toPlaceId)}`;
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
      || !route.geometry
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
      totals.distance += normalizeMetric(route.distance);
      totals.duration += normalizeMetric(route.duration);
      totals.count += 1;
      return totals;
    },
    { distance: 0, duration: 0, count: 0 }
  );
}
