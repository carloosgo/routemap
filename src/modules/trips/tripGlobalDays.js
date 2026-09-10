import { tripBoundaryDates } from './tripDateRules.js';
import { placePlanningGroupKey, tripPlanningDays } from './tripDayPlanning.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function civilTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null;
}

function dateFromTimestamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function normalizeTripDayOffset(value) {
  if (value === '' || value == null) return null;
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= 0 && offset <= 36600
    ? offset
    : null;
}

export function tripCalendarDays(trip) {
  const { startDate, endDate } = tripBoundaryDates(trip);
  const start = civilTimestamp(startDate);
  const end = civilTimestamp(endDate);
  if (start == null || end == null || end < start) return [];

  const count = Math.floor((end - start) / DAY_MS) + 1;
  return Array.from({ length: count }, (_, tripDayOffset) => ({
    key: `trip-day:${tripDayOffset}`,
    tripDayOffset,
    globalDayNumber: tripDayOffset + 1,
    date: dateFromTimestamp(start + tripDayOffset * DAY_MS),
  }));
}

export function legacyPlaceTripDayOffset(place, trip) {
  const key = placePlanningGroupKey(place);
  if (!key) return null;

  const { startDate } = tripBoundaryDates(trip);
  const tripStart = civilTimestamp(startDate);
  if (tripStart == null) return null;

  const planningDay = tripPlanningDays(trip?.segments).find((day) => day.key === key);
  const planningTimestamp = civilTimestamp(planningDay?.date);
  if (planningTimestamp == null || planningTimestamp < tripStart) return null;

  return Math.floor((planningTimestamp - tripStart) / DAY_MS);
}

export function placeTripDayOffset(place, trip) {
  const explicit = normalizeTripDayOffset(place?.tripDayOffset);
  if (explicit != null) return explicit;
  return legacyPlaceTripDayOffset(place, trip);
}

export function resolvedPlaceTripDayOffset(place, trip) {
  const days = tripCalendarDays(trip);
  if (!days.length) return null;
  const offset = placeTripDayOffset(place, trip);
  if (offset == null) return 0;
  return Math.min(offset, days.length - 1);
}

export function groupPlacesByTripDay(trip, places) {
  const groups = tripCalendarDays(trip).map((day) => ({ ...day, places: [] }));
  if (!groups.length) return groups;

  (Array.isArray(places) ? places : []).forEach((place) => {
    const offset = resolvedPlaceTripDayOffset(place, trip);
    if (offset != null && groups[offset]) groups[offset].places.push(place);
  });

  return groups;
}

export function segmentIdsForTripDay(trip, tripDayOffset) {
  const offset = normalizeTripDayOffset(tripDayOffset);
  const day = offset == null ? null : tripCalendarDays(trip)[offset];
  if (!day) return [];

  const seen = new Set();
  return tripPlanningDays(trip?.segments)
    .filter((planningDay) => planningDay.date === day.date)
    .map((planningDay) => planningDay.segmentId)
    .filter((segmentId) => {
      if (!segmentId || seen.has(segmentId)) return false;
      seen.add(segmentId);
      return true;
    });
}

export function reconcilePlacesToTripCalendar(trip) {
  const days = tripCalendarDays(trip);
  if (!days.length || !Array.isArray(trip?.places) || !trip.places.length) return trip;

  let changed = false;
  const places = trip.places.map((place) => {
    const nextOffset = resolvedPlaceTripDayOffset(place, trip);
    if (nextOffset == null || place.tripDayOffset === nextOffset) return place;
    changed = true;
    return { ...place, tripDayOffset: nextOffset };
  });

  return changed ? { ...trip, places } : trip;
}
