import { expensesTotal } from '../expenses/expenseModel.js';
import {
  PLACE_ORDER_VERSION,
  TRIP_LIMITS,
  createSegment,
  isPlaced,
} from './tripEntities.js';
import { reorderPlaceList } from './placeOrdering.js';
import {
  isTripISODate,
  validateSegmentDatePatch,
} from './tripDateRules.js';

function nowISO() {
  return new Date().toISOString();
}

function nextCalendarDate(value) {
  if (!isTripISODate(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function nextSegmentDefaults(trip) {
  const segments = trip?.segments || [];
  if (!segments.length) return {};
  const last = segments.at(-1);
  return {
    startDate: nextCalendarDate(last.endDate) || last.startDate || '',
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

function withSegmentDatePatch(trip, segmentId, patch) {
  return {
    ...trip,
    segments: (trip?.segments || []).map((segment) =>
      segment.id === segmentId
        ? { ...segment, ...patch }
        : segment
    ),
  };
}

function reconcileReorderedSegmentDates(trip, segmentId) {
  const segment = (trip?.segments || []).find((item) => item.id === segmentId);
  if (!segment) return trip;

  const currentDates = {
    startDate: segment.startDate || '',
    endDate: segment.endDate || '',
  };
  if (validateSegmentDatePatch(trip, segmentId, currentDates).valid) return trip;

  // Reordering is structural: never shift dates or mutate unaffected legs silently.
  // Keep the largest valid subset of the moved leg's existing dates. When an old
  // date cannot fit between its new neighbours, clearing that constraint lets the
  // user choose a new date without leaving the calendar in an impossible min/max state.
  const candidates = [
    { startDate: '', endDate: currentDates.endDate },
    { startDate: currentDates.startDate, endDate: '' },
    { startDate: '', endDate: '' },
  ];

  const reconciledDates = candidates.find(
    (candidate) => validateSegmentDatePatch(trip, segmentId, candidate).valid
  ) || { startDate: '', endDate: '' };

  return withSegmentDatePatch(trip, segmentId, reconciledDates);
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

  const reorderedTrip = {
    ...trip,
    segments: reordered,
  };
  const reconciledTrip = reconcileReorderedSegmentDates(reorderedTrip, moved.id);

  return {
    ...reconciledTrip,
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
  const originTotal = expensesTotal(trip?.originDetails?.expenses);
  return originTotal + (trip?.segments || []).reduce(
    (sum, segment) => sum + segmentTotal(segment),
    0
  );
}

export function segmentCoords(segment, origin = null) {
  const points = [];
  if (isPlaced(origin)) {
    points.push([origin.lat, origin.lon]);
  }
  if (isPlaced(segment?.destination)) {
    points.push([segment.destination.lat, segment.destination.lon]);
  }
  return points;
}

export function routeStops(trip, { dedupeCountry = false } = {}) {
  const stops = [];
  const cities = [
    trip?.origin || null,
    ...(Array.isArray(trip?.segments)
      ? trip.segments.map((segment) => segment?.destination || null)
      : []),
  ];

  cities.forEach((city) => {
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
  });
  return stops;
}

export function hasSavableRoute(trip) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  return segments.some((segment, index) => {
    const origin = index === 0
      ? trip?.origin
      : segments[index - 1]?.destination;
    return isPlaced(origin) && isPlaced(segment?.destination);
  });
}

export function isTripSavable(trip) {
  return Boolean(trip?.name?.trim() && hasSavableRoute(trip));
}
