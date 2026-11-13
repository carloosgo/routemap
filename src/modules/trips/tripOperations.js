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

export function appendSegment(trip, initial = {}) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  if (segments.length >= TRIP_LIMITS.segments) return trip;
  return {
    ...trip,
    segments: [
      ...segments,
      createSegment({ ...nextSegmentDefaults(trip), ...(initial || {}) }),
    ],
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

const DAY_MS = 86400000;

function dateToTime(value) {
  return isTripISODate(value) ? Date.parse(`${value}T00:00:00Z`) : null;
}

function timeToDate(time) {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Fechas encadenadas tras reordenar: arranca el primer día del viaje y da a
 * cada ciudad las mismas noches que tenía. Respeta si el viaje comparte el día
 * de traslado (la siguiente ciudad empieza el día que termina la anterior) o
 * empieza al día siguiente. Devuelve null si el resultado no sería válido,
 * para usar entonces la reconciliación conservadora.
 */
export function chainReorderedSegmentDates(originalSegments, reorderedTrip) {
  const original = Array.isArray(originalSegments) ? originalSegments : [];
  const starts = original.map((segment) => dateToTime(segment?.startDate)).filter((time) => time != null);
  if (!starts.length) return null;
  const anchor = Math.min(...starts);

  let join = 0;
  for (let index = 1; index < original.length; index += 1) {
    const previousEnd = dateToTime(original[index - 1]?.endDate);
    const nextStart = dateToTime(original[index]?.startDate);
    if (previousEnd == null || nextStart == null) continue;
    join = nextStart - previousEnd === DAY_MS ? 1 : 0;
    break;
  }

  const lengthById = new Map();
  original.forEach((segment, index) => {
    const start = dateToTime(segment?.startDate);
    if (start == null) return;
    let end = dateToTime(segment?.endDate);
    // Sin fecha de salida: dura hasta que empieza la siguiente ciudad.
    if (end == null) {
      const nextStart = dateToTime(original[index + 1]?.startDate);
      if (nextStart != null) end = nextStart - join * DAY_MS;
    }
    if (end != null && end >= start) {
      lengthById.set(segment.id, { days: Math.round((end - start) / DAY_MS) });
    } else {
      lengthById.set(segment.id, null);
    }
  });

  let cursor = anchor;
  const segments = reorderedTrip.segments.map((segment) => {
    if (!lengthById.has(segment.id)) return segment;
    const length = lengthById.get(segment.id);
    const startDate = timeToDate(cursor);
    if (!length) return { ...segment, startDate, endDate: '' };
    const end = cursor + length.days * DAY_MS;
    cursor = end + join * DAY_MS;
    // Una salida inferida se escribe: al cambiar de lugar ya no hay una ciudad
    // siguiente que la marque.
    return { ...segment, startDate, endDate: timeToDate(end) };
  });

  const chained = { ...reorderedTrip, segments };
  const valid = segments.every((segment) => validateSegmentDatePatch(chained, segment.id, {
    startDate: segment.startDate || '',
    endDate: segment.endDate || '',
  }).valid);
  return valid ? chained : null;
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
  // Mover una ciudad cambia el orden del viaje, no su duración. Si las fechas
  // siguen siendo válidas en el nuevo orden no se tocan; si no, cada estancia
  // conserva sus noches y las fechas se encadenan en el nuevo orden. Así la
  // ciudad movida no pierde sus días ni sus lugares de Mis rutas.
  const keepsDates = reordered.every((segment) => validateSegmentDatePatch(reorderedTrip, segment.id, {
    startDate: segment.startDate || '',
    endDate: segment.endDate || '',
  }).valid);
  const chainedTrip = keepsDates
    ? reorderedTrip
    : chainReorderedSegmentDates(segments, reorderedTrip);
  const reconciledTrip = chainedTrip
    || reconcileReorderedSegmentDates(reorderedTrip, moved.id);

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
