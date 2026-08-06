import { expensesTotal } from '../expenses/expenseModel.js';
import {
  TRIP_LIMITS,
  createSegment,
  isPlaced,
} from './tripEntities.js';

function nowISO() {
  return new Date().toISOString();
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

  const reordered = [...segments];
  const [moved] = reordered.splice(sourceIndex, 1);
  const targetIndex = reordered.findIndex(
    (segment) => segment.id === targetId
  );
  reordered.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved);

  return {
    ...trip,
    segments: reordered,
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
