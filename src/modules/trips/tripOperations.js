import { expensesTotal } from '../expenses/expenseModel.js';
import {
  PLACE_ORDER_VERSION,
  TRIP_LIMITS,
  createCity,
  createSegment,
  isPlaced,
} from './tripEntities.js';
import { reorderPlaceList } from './placeOrdering.js';

function nowISO() {
  return new Date().toISOString();
}

function cityKey(city) {
  if (!city) return '';
  if (city.id) return `id:${city.id}`;
  return [
    city.name || '',
    city.countryCode || '',
    Number.isFinite(city.lat) ? Number(city.lat).toFixed(6) : '',
    Number.isFinite(city.lon) ? Number(city.lon).toFixed(6) : '',
  ].join('|');
}

function sameCity(left, right) {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  return cityKey(left) === cityKey(right);
}

function cloneCity(city) {
  return city ? createCity(city) : null;
}

export function rechainSegmentOrigins(segments, initialOrigin = segments?.[0]?.origin || null) {
  const source = Array.isArray(segments) ? segments : [];
  let previousDestination = cloneCity(initialOrigin);
  let changed = false;

  const rechained = source.map((segment) => {
    const expectedOrigin = previousDestination;
    previousDestination = cloneCity(segment.destination);
    if (sameCity(segment.origin, expectedOrigin)) return segment;
    changed = true;
    return {
      ...segment,
      origin: cloneCity(expectedOrigin),
    };
  });

  return changed ? rechained : source;
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

  const initialOrigin = cloneCity(segments[0]?.origin);
  const normalizedDestination = cloneCity(destination);
  const nextSegments = segments.map((segment, currentIndex) =>
    currentIndex === index
      ? { ...segment, destination: normalizedDestination }
      : segment
  );

  return {
    ...trip,
    segments: rechainSegmentOrigins(nextSegments, initialOrigin),
    updatedAt: nowISO(),
  };
}

export function removeSegmentFromTrip(trip, segmentId) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  const initialOrigin = cloneCity(segments[0]?.origin);
  const remaining = segments.filter((segment) => segment.id !== segmentId);
  if (remaining.length === segments.length) return trip;

  return {
    ...trip,
    segments: rechainSegmentOrigins(remaining, initialOrigin),
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

  const initialOrigin = cloneCity(segments[0]?.origin);
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
