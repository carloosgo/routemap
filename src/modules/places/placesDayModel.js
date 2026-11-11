import { countryColorForIndex } from '../../config.js';
import {
  groupPlacesByItineraryDay,
  itineraryAssignmentsByDay,
} from '../trips/globalTripDayPlanning.js';

/**
 * Modelo visual de Mis rutas: un día abierto a la vez y paradas numeradas por
 * día. Cada número tiene su propio color, el mismo en la lista, el mapa y la
 * vista compartida; los lugares sin día usan el color de su país.
 */

export function countryKey(value) {
  const code = String(value?.countryCode || '').trim().toUpperCase();
  if (code) return code;
  return String(value?.country || '').trim().toLowerCase() || 'unknown';
}

export function placeCountryColors(segments, places) {
  const result = new Map();
  const register = (value) => {
    const key = countryKey(value);
    if (key === 'unknown' || result.has(key)) return;
    result.set(key, countryColorForIndex(result.size));
  };
  (segments || []).forEach((segment) => register(segment?.destination));
  (places || []).forEach(register);
  return result;
}

export function placeCountry(place, segmentById) {
  const destination = segmentById?.get(place?.segmentId)?.destination || null;
  return {
    countryCode: place?.countryCode || destination?.countryCode || '',
    country: place?.country || destination?.country || '',
  };
}

export function placeColor(place, segmentById, colors) {
  return colors.get(countryKey(placeCountry(place, segmentById))) || countryColorForIndex(0);
}

/** Color de la parada N del día (1, 2, 3…): uno distinto por número. */
export function stopColor(number) {
  const value = Math.trunc(Number(number));
  return value > 0 ? countryColorForIndex(value - 1) : '';
}

/**
 * Número de parada de cada lugar dentro de su día (1, 2, 3…), el mismo en la
 * lista y en el mapa. Los lugares "Por organizar" no tienen número.
 */
export function placeDayIndex(places, segments) {
  const { groups } = groupPlacesByItineraryDay(places, segments);
  const index = new Map();
  groups.forEach((day) => {
    day.places.forEach((place, position) => {
      index.set(place.id, { tripDayOffset: day.tripDayOffset, number: position + 1 });
    });
  });
  return index;
}

/**
 * Agrupa días consecutivos por la ciudad en la que terminan. Un día de traslado
 * queda en la ciudad de llegada y se marca como traslado.
 */
export function cityDayGroups(groups, assignmentsByDay) {
  const result = [];
  (groups || []).forEach((day) => {
    const assignments = assignmentsByDay?.get(day.tripDayOffset) || [];
    const arrival = assignments.at(-1) || null;
    const departure = assignments[0] || null;
    const transfer = Boolean(
      arrival && departure && arrival.segmentId !== departure.segmentId
    );
    const entry = { ...day, assignments, transfer, from: departure?.destination || null, to: arrival?.destination || null };
    const last = result.at(-1);
    if (last && arrival && last.segmentId === arrival.segmentId) {
      last.days.push(entry);
    } else {
      result.push({
        key: `${arrival?.segmentId || 'none'}:${day.tripDayOffset}`,
        segmentId: arrival?.segmentId || '',
        destination: arrival?.destination || null,
        days: [entry],
      });
    }
  });
  return result;
}

export function todayCivilDate(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Día que se abre al entrar: hoy si cae en el viaje, si no el primero con lugares. */
export function defaultOpenDay(groups, today = todayCivilDate()) {
  const list = Array.isArray(groups) ? groups : [];
  if (!list.length) return null;
  const current = list.find((day) => day.date === today);
  if (current) return current.tripDayOffset;
  const withPlaces = list.find((day) => day.places?.length);
  return (withPlaces || list[0]).tripDayOffset;
}

/** Suma distancia y tiempo de los tramos elegidos entre paradas consecutivas. */
export function dayRouteTotals(dayPlaces, routeForPair) {
  const list = Array.isArray(dayPlaces) ? dayPlaces : [];
  let distance = 0;
  let duration = 0;
  let legs = 0;
  for (let index = 1; index < list.length; index += 1) {
    const route = routeForPair(list[index - 1], list[index]);
    if (!route) continue;
    const legDistance = Number(route.distance) || 0;
    const legDuration = Number(route.duration) || 0;
    if (!legDistance && !legDuration) continue;
    distance += legDistance;
    duration += legDuration;
    legs += 1;
  }
  return { distance, duration, legs };
}

export function formatDistance(meters, locale) {
  const value = Number(meters) || 0;
  if (value <= 0) return '';
  if (value < 1000) return `${Math.round(value / 10) * 10} m`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10000 ? 1 : 0 }).format(value / 1000)} km`;
}

export { groupPlacesByItineraryDay, itineraryAssignmentsByDay };
