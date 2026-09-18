import { createPlace } from './tripEntities.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return timestamp;
}

function civilDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizedOffset(value) {
  if (value === '' || value == null) return null;
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= 0 && offset <= 36600 ? offset : null;
}

function validDatedSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment, segmentIndex) => ({
      segment,
      segmentIndex,
      start: parseCivilDate(segment?.startDate),
      end: parseCivilDate(segment?.endDate),
    }))
    .filter(({ start, end }) => start != null && end != null && end >= start);
}

export function itineraryCalendarDays(segments) {
  const dated = validDatedSegments(segments);
  if (!dated.length) return [];
  const start = Math.min(...dated.map((entry) => entry.start));
  const end = Math.max(...dated.map((entry) => entry.end));
  const count = Math.floor((end - start) / DAY_MS) + 1;
  return Array.from({ length: count }, (_, tripDayOffset) => ({
    tripDayOffset,
    globalDayNumber: tripDayOffset + 1,
    date: civilDate(start + tripDayOffset * DAY_MS),
  }));
}

export function itineraryAssignmentsByDay(segments) {
  const calendar = itineraryCalendarDays(segments);
  if (!calendar.length) return new Map();
  const tripStart = parseCivilDate(calendar[0].date);
  const assignments = new Map(calendar.map((day) => [day.tripDayOffset, []]));
  validDatedSegments(segments).forEach(({ segment, segmentIndex, start, end }) => {
    for (let timestamp = start; timestamp <= end; timestamp += DAY_MS) {
      const tripDayOffset = Math.floor((timestamp - tripStart) / DAY_MS);
      const list = assignments.get(tripDayOffset);
      if (!list) continue;
      list.push({
        segment,
        segmentId: segment.id,
        segmentIndex,
        destination: segment.destination,
        date: civilDate(timestamp),
        tripDayOffset,
        dayOffset: Math.floor((timestamp - start) / DAY_MS),
      });
    }
  });
  return assignments;
}

export function placeTripDayOffset(place, segments) {
  const calendar = itineraryCalendarDays(segments);
  if (!calendar.length) return null;

  const explicit = normalizedOffset(place?.tripDayOffset);
  if (explicit != null && explicit < calendar.length) return explicit;

  const tripStart = parseCivilDate(calendar[0].date);
  const segment = (Array.isArray(segments) ? segments : []).find(
    (candidate) => candidate?.id === place?.segmentId
  );
  const segmentStart = parseCivilDate(segment?.startDate);
  const localOffset = normalizedOffset(place?.dayOffset);
  if (segmentStart != null) {
    const timestamp = segmentStart + (localOffset ?? 0) * DAY_MS;
    const offset = Math.floor((timestamp - tripStart) / DAY_MS);
    if (offset >= 0 && offset < calendar.length) return offset;
  }

  return 0;
}

export function groupPlacesByItineraryDay(places, segments) {
  const groups = itineraryCalendarDays(segments).map((day) => ({ ...day, places: [] }));
  if (!groups.length) return { groups, unassigned: Array.isArray(places) ? places : [] };
  (Array.isArray(places) ? places : []).forEach((place) => {
    const offset = placeTripDayOffset(place, segments);
    if (offset != null && groups[offset]) groups[offset].places.push(place);
  });
  return { groups, unassigned: [] };
}

export function sameItineraryDay(left, right, segments) {
  const leftOffset = placeTripDayOffset(left, segments);
  const rightOffset = placeTripDayOffset(right, segments);
  return leftOffset != null && leftOffset === rightOffset;
}

function reorderedOffsets(dayCount, sourceOffset, targetOffset, placement) {
  const source = normalizedOffset(sourceOffset);
  const target = normalizedOffset(targetOffset);
  if (
    source == null
    || target == null
    || source >= dayCount
    || target >= dayCount
    || source === target
  ) return null;

  const order = Array.from({ length: dayCount }, (_, index) => index);
  const [moved] = order.splice(source, 1);
  const targetIndex = order.indexOf(target);
  if (targetIndex < 0) return null;
  order.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved);
  return new Map(order.map((oldOffset, newOffset) => [oldOffset, newOffset]));
}

/**
 * Reorders a day's scheduled contents while the chronological date slots from
 * Itinerario remain fixed. City ownership never changes.
 */
export function reorderItineraryDayContents(places, segments, sourceOffset, targetOffset, placement = 'before') {
  const calendar = itineraryCalendarDays(segments);
  const mapping = reorderedOffsets(calendar.length, sourceOffset, targetOffset, placement);
  if (!mapping) return null;
  return (Array.isArray(places) ? places : []).map((place) => {
    const currentOffset = placeTripDayOffset(place, segments);
    if (currentOffset == null || !mapping.has(currentOffset)) return place;
    return createPlace({ ...place, tripDayOffset: mapping.get(currentOffset) });
  });
}
