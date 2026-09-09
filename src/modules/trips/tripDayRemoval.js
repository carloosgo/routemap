import {
  placeTripDayOffset,
  tripPlanningDays,
} from './tripDayPlanning.js';

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

function shiftCivilDate(value, amount) {
  const timestamp = parseCivilDate(value);
  if (timestamp == null) return value || '';
  return new Date(timestamp + amount * DAY_MS).toISOString().slice(0, 10);
}

export function planTripDayRemoval(trip, dateToRemove) {
  const tripStart = parseCivilDate(trip?.startDate);
  const tripEnd = parseCivilDate(trip?.endDate);
  const target = parseCivilDate(dateToRemove);
  if (
    tripStart == null
    || tripEnd == null
    || target == null
    || target < tripStart
    || target > tripEnd
  ) return null;

  const targetOffset = Math.floor((target - tripStart) / DAY_MS);
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  const places = Array.isArray(trip?.places) ? trip.places : [];
  const removePlaceIds = [];
  const movePlaces = [];
  const segmentPatches = [];

  places.forEach((place) => {
    const offset = placeTripDayOffset(place, trip);
    if (offset == null) return;
    if (offset === targetOffset) {
      removePlaceIds.push(place.id);
    } else if (offset > targetOffset) {
      movePlaces.push({ placeId: place.id, tripDayOffset: offset - 1 });
    }
  });

  const assignmentsBySegment = new Map();
  tripPlanningDays(trip).forEach((assignment) => {
    if (!assignmentsBySegment.has(assignment.segmentId)) {
      assignmentsBySegment.set(assignment.segmentId, []);
    }
    assignmentsBySegment.get(assignment.segmentId).push(assignment);
  });

  segments.forEach((segment) => {
    const assignments = assignmentsBySegment.get(segment.id) || [];
    if (!assignments.length) return;
    const removed = assignments.some((assignment) => assignment.tripDayOffset === targetOffset);
    const moved = assignments.some((assignment) => assignment.tripDayOffset > targetOffset);
    if (!removed && !moved) return;

    const tripDayOffsets = [...assignments]
      .sort((left, right) => left.dayOffset - right.dayOffset)
      .filter((assignment) => assignment.tripDayOffset !== targetOffset)
      .map((assignment) => (
        assignment.tripDayOffset > targetOffset
          ? assignment.tripDayOffset - 1
          : assignment.tripDayOffset
      ));

    segmentPatches.push({
      segmentId: segment.id,
      patch: tripDayOffsets.length
        ? { tripDayOffsets }
        : { tripDayOffsets: [], startDate: '', endDate: '' },
    });
  });

  return {
    removePlaceIds,
    movePlaces,
    segmentPatches,
    tripDatePatch: tripStart === tripEnd
      ? { startDate: '', endDate: '' }
      : { endDate: shiftCivilDate(trip.endDate, -1) },
  };
}
