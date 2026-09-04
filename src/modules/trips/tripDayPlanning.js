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
  ) {
    return null;
  }
  return timestamp;
}

function civilDateFromTimestamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizedOptionalId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 128) : '';
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

export function tripPlanningDays(segments) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  const validSegments = safeSegments
    .map((segment, segmentIndex) => ({
      segment,
      segmentIndex,
      start: parseCivilDate(segment?.startDate),
      dayCount: segmentPlanningDayCount(segment),
    }))
    .filter(({ start, dayCount }) => start != null && dayCount > 0);

  if (!validSegments.length) return [];
  const tripStart = Math.min(...validSegments.map(({ start }) => start));
  const days = [];

  validSegments.forEach(({ segment, segmentIndex, start, dayCount }) => {
    for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
      const timestamp = start + dayOffset * DAY_MS;
      days.push({
        key: planningGroupKey(segment.id, dayOffset),
        segmentId: segment.id,
        segmentIndex,
        dayOffset,
        date: civilDateFromTimestamp(timestamp),
        globalDayNumber: Math.floor((timestamp - tripStart) / DAY_MS) + 1,
        destination: segment.destination,
      });
    }
  });

  return days;
}

export function planningDayForPlace(place, segments) {
  const key = placePlanningGroupKey(place);
  if (!key) return null;
  return tripPlanningDays(segments).find((day) => day.key === key) || null;
}

export function groupPlacesByPlanningDay(places, segments) {
  const days = tripPlanningDays(segments);
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
