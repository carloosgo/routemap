import { isPlaced } from './tripEntities.js';

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

function civilDateFromTimestamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizedOptionalId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 128) : '';
}

function planningInput(tripOrSegments) {
  if (Array.isArray(tripOrSegments)) {
    return { segments: tripOrSegments, startDate: '', endDate: '' };
  }
  const trip = tripOrSegments && typeof tripOrSegments === 'object' ? tripOrSegments : {};
  return {
    segments: Array.isArray(trip.segments) ? trip.segments : [],
    startDate: typeof trip.startDate === 'string' ? trip.startDate : '',
    endDate: typeof trip.endDate === 'string' ? trip.endDate : '',
  };
}

function explicitTripBounds(input) {
  const start = parseCivilDate(input.startDate);
  const end = parseCivilDate(input.endDate);
  return start != null && end != null && end >= start ? { start, end } : null;
}

export function segmentPlanningDayCount(segment) {
  if (!isPlaced(segment?.destination)) return 0;
  const start = parseCivilDate(segment?.startDate);
  const end = parseCivilDate(segment?.endDate);
  if (start == null || end == null || end < start) return 0;
  return Math.floor((end - start) / DAY_MS) + 1;
}

export function planningGroupKey(segmentId, dayOffset) {
  const safeSegmentId = normalizedOptionalId(segmentId);
  const safeOffset = Number(dayOffset);
  if (!safeSegmentId || !Number.isInteger(safeOffset) || safeOffset < 0) return '';
  return `${safeSegmentId}\u0000${safeOffset}`;
}

export function placePlanningGroupKey(place) {
  return planningGroupKey(place?.segmentId, place?.dayOffset);
}

export function tripCalendarDays(trip) {
  const input = planningInput(trip);
  const bounds = explicitTripBounds(input);
  if (!bounds) return [];
  const days = [];
  const count = Math.floor((bounds.end - bounds.start) / DAY_MS) + 1;
  for (let offset = 0; offset < count; offset += 1) {
    days.push({
      date: civilDateFromTimestamp(bounds.start + offset * DAY_MS),
      globalDayNumber: offset + 1,
    });
  }
  return days;
}

function validDatedSegments(segments) {
  return segments
    .map((segment, segmentIndex) => ({
      segment,
      segmentIndex,
      start: parseCivilDate(segment?.startDate),
      dayCount: segmentPlanningDayCount(segment),
    }))
    .filter(({ start, dayCount }) => start != null && dayCount > 0);
}

function fallbackPlanningDays(segments, bounds, occupiedDates) {
  if (!bounds) return [];
  const calendar = [];
  const count = Math.floor((bounds.end - bounds.start) / DAY_MS) + 1;
  for (let index = 0; index < count; index += 1) {
    calendar.push(bounds.start + index * DAY_MS);
  }

  const fallback = [];
  let cursor = 0;
  segments.forEach((segment, segmentIndex) => {
    if (!isPlaced(segment?.destination) || segmentPlanningDayCount(segment) > 0) return;
    while (
      cursor < calendar.length - 1
      && occupiedDates.has(civilDateFromTimestamp(calendar[cursor]))
    ) cursor += 1;
    const timestamp = calendar[Math.min(cursor, calendar.length - 1)];
    if (timestamp == null) return;
    const date = civilDateFromTimestamp(timestamp);
    occupiedDates.add(date);
    fallback.push({
      key: planningGroupKey(segment.id, 0),
      segmentId: segment.id,
      segmentIndex,
      dayOffset: 0,
      date,
      globalDayNumber: Math.floor((timestamp - bounds.start) / DAY_MS) + 1,
      destination: segment.destination,
      provisional: true,
    });
    if (cursor < calendar.length - 1) cursor += 1;
  });
  return fallback;
}

export function tripPlanningDays(tripOrSegments) {
  const input = planningInput(tripOrSegments);
  const safeSegments = input.segments;
  const validSegments = validDatedSegments(safeSegments);
  const explicitBounds = explicitTripBounds(input);

  if (!validSegments.length && !explicitBounds) return [];
  const legacyTripStart = validSegments.length
    ? Math.min(...validSegments.map(({ start }) => start))
    : null;
  const tripStart = explicitBounds?.start ?? legacyTripStart;
  if (tripStart == null) return [];

  const days = [];
  const occupiedDates = new Set();
  validSegments.forEach(({ segment, segmentIndex, start, dayCount }) => {
    for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
      const timestamp = start + dayOffset * DAY_MS;
      if (
        explicitBounds
        && (timestamp < explicitBounds.start || timestamp > explicitBounds.end)
      ) continue;
      const date = civilDateFromTimestamp(timestamp);
      occupiedDates.add(date);
      days.push({
        key: planningGroupKey(segment.id, dayOffset),
        segmentId: segment.id,
        segmentIndex,
        dayOffset,
        date,
        globalDayNumber: Math.floor((timestamp - tripStart) / DAY_MS) + 1,
        destination: segment.destination,
        provisional: false,
      });
    }
  });

  days.push(...fallbackPlanningDays(safeSegments, explicitBounds, occupiedDates));
  return days.sort((left, right) =>
    left.date.localeCompare(right.date)
    || left.segmentIndex - right.segmentIndex
    || left.dayOffset - right.dayOffset
  );
}

export function planningDayForPlace(place, tripOrSegments) {
  const key = placePlanningGroupKey(place);
  if (!key) return null;
  return tripPlanningDays(tripOrSegments).find((day) => day.key === key) || null;
}

export function groupPlacesByPlanningDay(places, tripOrSegments) {
  const days = tripPlanningDays(tripOrSegments);
  const groups = days.map((day) => ({ ...day, places: [] }));
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  const unassigned = [];

  (Array.isArray(places) ? places : []).forEach((place) => {
    const group = groupByKey.get(placePlanningGroupKey(place));
    if (group) group.places.push(place);
    else unassigned.push(place);
  });

  return { groups, unassigned };
}

export function assignedPlacesForSegment(places, segmentId) {
  const safeSegmentId = normalizedOptionalId(segmentId);
  if (!safeSegmentId) return [];
  return (Array.isArray(places) ? places : []).filter(
    (place) => normalizedOptionalId(place?.segmentId) === safeSegmentId
  );
}

export function maxAssignedDayOffset(places, segmentId) {
  return assignedPlacesForSegment(places, segmentId).reduce((max, place) => {
    const offset = Number(place?.dayOffset);
    return Number.isInteger(offset) && offset >= 0 ? Math.max(max, offset) : max;
  }, -1);
}

export function segmentCanContainAssignedPlaces(segment, places) {
  const highestOffset = maxAssignedDayOffset(places, segment?.id);
  if (highestOffset < 0) return true;
  return segmentPlanningDayCount(segment) > highestOffset;
}

export function samePlanningGroup(left, right) {
  const leftKey = placePlanningGroupKey(left);
  return Boolean(leftKey && leftKey === placePlanningGroupKey(right));
}
