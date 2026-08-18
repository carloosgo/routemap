import { expensesTotal } from '../expenses/expenseModel.js';
import {
  PLACE_ORDER_VERSION,
  TRIP_LIMITS,
  createSegment,
  isPlaced,
} from './tripEntities.js';
import { reorderPlaceList } from './placeOrdering.js';

function nowISO() {
  return new Date().toISOString();
}

const CITY_FIELDS = [
  'id',
  'name',
  'displayName',
  'country',
  'countryCode',
  'lat',
  'lon',
];

function sameCity(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return CITY_FIELDS.every((field) => left[field] === right[field]);
}

function cloneCity(city) {
  return city ? { ...city } : null;
}

export function rechainSegmentOrigins(segments, initialOrigin = null) {
  return segments.map((segment, index) => {
    const desiredOrigin = index === 0
      ? initialOrigin
      : segments[index - 1]?.destination || null;
    if (sameCity(segment.origin, desiredOrigin)) return segment;
    return { ...segment, origin: cloneCity(desiredOrigin) };
  });
}

export function nextSegmentDefaults(trip) {
  const segments = trip?.segments || [];
  if (!segments.length) return {};
  const last = segments.at(-1);
  return {
    origin: last.destination ? { ...last.destination } : null,
    startDate: last.endDate || last.startDate || '',
  };
}

export function appendSegment(trip) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  if (segments.length >= TRIP_LIMITS.segments) return trip;
  return {
    ...trip,
    segments: [...segments, createSegment(nextSegmentDefaults(trip))],
    updatedAt: nowISO(),
  };
}

export function updateSegmentDestination(trip, segmentId, destination) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index < 0) return trip;

  const nextDestination = cloneCity(destination);
  const nextSegments = [...segments];
  nextSegments[index] = {
    ...segments[index],
    destination: nextDestination,
  };

  if (index + 1 < nextSegments.length) {
    const following = nextSegments[index + 1];
    if (!sameCity(following.origin, nextDestination)) {
      nextSegments[index + 1] = {
        ...following,
        origin: cloneCity(nextDestination),
      };
    }
  }

  return {
    ...trip,
    segments: nextSegments,
    updatedAt: nowISO(),
  };
}

export function removeSegmentFromRoute(trip, segmentId) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  const initialOrigin = segments[0]?.origin || null;
  const filtered = segments.filter((segment) => segment.id !== segmentId);
  if (filtered.length === segments.length) return trip;

  return {
    ...trip,
    segments: rechainSegmentOrigins(filtered, initialOrigin),
    updatedAt: nowISO(),
  };
}

export function reorderSegments(
  trip,
  sourceId,
  targetId,
  placement = 'before'
) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  if (!sourceId || !targetId || sourceId === targetId) return trip;

  const sourceIndex = segments.findIndex(
    (segment) => segment.id === sourceId
  );
  if (sourceIndex < 0 || !segments.some((segment) => segment.id === targetId)) {
    return trip;
  }

  const initialOrigin = segments[0]?.origin || null;
  const reordered = [...segments];
  const [moved] = reordered.splice(sourceIndex, 1);
  const targetIndex = reordered.findIndex(
    (segment) => segment.id === targetId
  );
  reordered.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved);

  return {
    ...trip,
    segments: rechainSegmentOrigins(reordered, initialOrigin),
    updatedAt: nowISO(),
  };
}

export function reorderPlaces(
  trip,
  sourceId,
  targetId,
  placement = 'before'
) {
  const places = Array.isArray(trip?.places) ? trip.places : [];
  const reordered = reorderPlaceList(places, sourceId, targetId, placement);
  if (reordered === places) return trip;

  return {
    ...trip,
    places: reordered,
    placeOrderVersion: PLACE_ORDER_VERSION,
    updatedAt: nowISO(),
  };
}

export function segmentTotal(segment) {
  return expensesTotal(segment?.expenses);
}

export function tripTotal(trip) {
  return (trip?.segments || []).reduce(
    (sum, segment) => sum + segmentTotal(segment),
    0
  );
}

export function segmentCoords(segment) {
  const points = [];
  if (isPlaced(segment?.origin)) {
    points.push([segment.origin.lat, segment.origin.lon]);
  }
  if (isPlaced(segment?.destination)) {
    points.push([segment.destination.lat, segment.destination.lon]);
  }
  return points;
}

export function routeStops(segments, { dedupeCountry = false } = {}) {
  const stops = [];
  (segments || []).forEach((segment) =>
    [segment?.origin, segment?.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const last = stops.at(-1);
      if (last && last.lat === city.lat && last.lon === city.lon) return;
      if (
        dedupeCountry &&
        last?.countryCode &&
        last.countryCode === city.countryCode
      ) {
        return;
      }
      stops.push(city);
    })
  );
  return stops;
}

export function isTripSavable(trip) {
  return Boolean(
    trip?.name?.trim() &&
      (trip.segments || []).some(
        (segment) =>
          isPlaced(segment.origin) && isPlaced(segment.destination)
      )
  );
}
