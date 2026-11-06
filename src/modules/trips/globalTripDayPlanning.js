import { createPlace } from './tripEntities.js';
import { segmentDateRanges } from './tripDayPlanning.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function civilDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizedOffset(value) {
  if (value === '' || value == null) return null;
  const offset = Number(value);
  return Number.isInteger(offset) && offset >= 0 && offset <= 36600 ? offset : null;
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function validDatedSegments(segments) {
  const safeSegments = Array.isArray(segments) ? segments : [];
  const ranges = segmentDateRanges(safeSegments);
  return safeSegments
    .map((segment, segmentIndex) => ({
      segment,
      segmentIndex,
      start: ranges[segmentIndex].start,
      end: ranges[segmentIndex].end,
    }))
    .filter(({ start, end }) => start != null && end != null && end >= start);
}

/**
 * Calendario corrido del viaje. Itinerario es su única fuente: Mis rutas, PDF y
 * mapa leen este calendario y no guardan fechas propias.
 */
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
  const dated = validDatedSegments(segments);
  if (!dated.length) return new Map();
  const tripStart = Math.min(...dated.map((entry) => entry.start));
  const calendar = itineraryCalendarDays(segments);
  const assignments = new Map(calendar.map((day) => [day.tripDayOffset, []]));
  dated.forEach(({ segment, segmentIndex, start, end }) => {
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

/**
 * Día del viaje de un lugar, derivado solo de su estancia (segmentId) y su día
 * dentro de esa estancia (dayOffset). Devuelve null si el lugar no tiene un día
 * válido en el Itinerario actual: ese lugar va a "Por organizar".
 */
export function placeTripDayOffset(place, segments) {
  const dated = validDatedSegments(segments);
  if (!dated.length) return null;
  const entry = dated.find(({ segment }) => segment?.id === place?.segmentId);
  const localOffset = normalizedOffset(place?.dayOffset);
  if (!entry || localOffset == null) return null;
  const timestamp = entry.start + localOffset * DAY_MS;
  if (timestamp > entry.end) return null;
  const tripStart = Math.min(...dated.map(({ start }) => start));
  return Math.floor((timestamp - tripStart) / DAY_MS);
}

export function groupPlacesByItineraryDay(places, segments) {
  const groups = itineraryCalendarDays(segments).map((day) => ({ ...day, places: [] }));
  const unassigned = [];
  (Array.isArray(places) ? places : []).forEach((place) => {
    const offset = placeTripDayOffset(place, segments);
    if (offset != null && groups[offset]) groups[offset].places.push(place);
    else unassigned.push(place);
  });
  return { groups, unassigned };
}

export function sameItineraryDay(left, right, segments) {
  const leftOffset = placeTripDayOffset(left, segments);
  const rightOffset = placeTripDayOffset(right, segments);
  return leftOffset != null && leftOffset === rightOffset;
}

function placeMatchesDestination(place, destination) {
  const city = normalizedText(place?.city);
  if (!city || city !== normalizedText(destination?.name)) return false;
  const placeCountry = String(place?.countryCode || '').trim().toUpperCase();
  const destinationCountry = String(destination?.countryCode || '').trim().toUpperCase();
  return !placeCountry || !destinationCountry || placeCountry === destinationCountry;
}

/**
 * Estancia y día local que corresponden a un día del viaje. En un día de
 * traslado hay dos estancias: gana la ciudad del lugar, luego la estancia que el
 * lugar ya tenía y, si no, la ciudad a la que se llega ese día.
 */
export function planningTargetForTripDay(place, segments, tripDayOffset) {
  const offset = normalizedOffset(tripDayOffset);
  if (offset == null) return null;
  const assignments = itineraryAssignmentsByDay(segments).get(offset) || [];
  if (!assignments.length) return null;
  const chosen = assignments.find(({ destination }) => placeMatchesDestination(place, destination))
    || assignments.find(({ segmentId }) => segmentId === place?.segmentId)
    || assignments.at(-1);
  return { segmentId: chosen.segmentId, dayOffset: chosen.dayOffset };
}

/**
 * Migra lugares guardados con el antiguo `tripDayOffset` (día del viaje guardado
 * aparte de la estancia) a una sola referencia: estancia + día local.
 */
export function migrateLegacyTripDayOffset(place, segments) {
  if (normalizedOffset(place?.tripDayOffset) == null) return place;
  const target = planningTargetForTripDay(place, segments, place.tripDayOffset);
  return createPlace({
    ...place,
    ...(target || {}),
    tripDayOffset: null,
  });
}
