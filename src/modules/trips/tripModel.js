import { uid, sanitizeText } from '../../shared/utils.js';
import { createExpenses, expensesTotal, normalizeExpenses } from '../expenses/expenseModel.js';

function parseCoordinate(value, min, max) {
  if (value === '' || value === null || value === undefined) return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export function createCity(partial) {
  if (!partial) return null;
  return {
    name: sanitizeText(partial.name || ''),
    displayName: sanitizeText(partial.displayName || partial.name || '', 200),
    country: sanitizeText(partial.country || '', 100),
    countryCode: (partial.countryCode || '').toUpperCase().slice(0, 2),
    lat: parseCoordinate(partial.lat, -90, 90),
    lon: parseCoordinate(partial.lon, -180, 180),
  };
}

export function createSegment(overrides = {}) {
  return {
    id: overrides.id || uid(),
    origin: overrides.origin ? createCity(overrides.origin) : null,
    destination: overrides.destination ? createCity(overrides.destination) : null,
    startDate: overrides.startDate || '',
    endDate: overrides.endDate || '',
    expenses: overrides.expenses ? normalizeExpenses(overrides.expenses) : createExpenses(),
    note: overrides.note || '',
  };
}

export function createNote(text = '', title = 'Notas generales') {
  return { id: uid(), title: sanitizeText(title), text };
}

export function createChecklistItem(text = '') {
  return { id: uid(), text: sanitizeText(text), done: false };
}

export function createTrip(name = '') {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: sanitizeText(name),
    currency: 'USD',
    segments: [],
    notes: [createNote()],
    checklist: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function nextSegmentDefaults(trip) {
  const segments = trip?.segments || [];
  if (segments.length === 0) return {};
  const last = segments[segments.length - 1];
  return {
    origin: last.destination ? { ...last.destination } : null,
    startDate: last.endDate || last.startDate || '',
  };
}

export function appendSegment(trip) {
  const defaults = nextSegmentDefaults(trip);
  const segment = createSegment(defaults);
  return { ...trip, segments: [...trip.segments, segment], updatedAt: nowISO() };
}

export function segmentTotal(segment) {
  return expensesTotal(segment?.expenses);
}

export function tripTotal(trip) {
  if (!trip?.segments) return 0;
  return trip.segments.reduce((sum, s) => sum + segmentTotal(s), 0);
}

export function segmentCoords(segment) {
  const points = [];
  if (isPlaced(segment?.origin)) points.push([segment.origin.lat, segment.origin.lon]);
  if (isPlaced(segment?.destination)) {
    points.push([segment.destination.lat, segment.destination.lon]);
  }
  return points;
}

export function isPlaced(city) {
  return Boolean(
    city &&
      Number.isFinite(city.lat) &&
      city.lat >= -90 &&
      city.lat <= 90 &&
      Number.isFinite(city.lon) &&
      city.lon >= -180 &&
      city.lon <= 180
  );
}

export function routeStops(segments, { dedupeCountry = false } = {}) {
  const stops = [];
  (segments || []).forEach((segment) => {
    [segment?.origin, segment?.destination].forEach((city) => {
      if (!isPlaced(city)) return;
      const last = stops[stops.length - 1];
      if (last && last.lat === city.lat && last.lon === city.lon) return;
      if (dedupeCountry && last && last.countryCode && last.countryCode === city.countryCode)
        return;
      stops.push(city);
    });
  });
  return stops;
}

export function isTripSavable(trip) {
  const hasName = Boolean(trip?.name && trip.name.trim());
  const hasRoute = Array.isArray(trip?.segments)
    ? trip.segments.some((s) => isPlaced(s?.origin) && isPlaced(s?.destination))
    : false;
  return hasName && hasRoute;
}

export function normalizeTrip(raw) {
  if (!raw || typeof raw !== 'object') return createTrip();
  return {
    id: raw.id || uid(),
    name: sanitizeText(raw.name || ''),
    currency: raw.currency || 'USD',
    segments: Array.isArray(raw.segments)
      ? raw.segments.map((s) =>
          createSegment({
            id: s.id,
            origin: s.origin,
            destination: s.destination,
            startDate: s.startDate,
            endDate: s.endDate,
            expenses: s.expenses,
            note: s.note,
          })
        )
      : [],
    notes:
      Array.isArray(raw.notes) && raw.notes.length > 0
        ? raw.notes.map((n) => ({
            id: n.id || uid(),
            title: sanitizeText(n.title || 'Notas generales'),
            text: n.text || '',
          }))
        : typeof raw.notes === 'string'
          ? [createNote(raw.notes)]
          : [createNote()],
    checklist: Array.isArray(raw.checklist)
      ? raw.checklist.map((item) => ({
          id: item.id || uid(),
          text: sanitizeText(item.text || ''),
          done: Boolean(item.done),
        }))
      : [],
    createdAt: raw.createdAt || nowISO(),
    updatedAt: raw.updatedAt || nowISO(),
  };
}

function nowISO() {
  return new Date().toISOString();
}
