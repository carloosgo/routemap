import { uid, sanitizeText } from '../../shared/utils.js';
import { createExpenses, expensesTotal, normalizeExpenses } from '../expenses/expenseModel.js';

export const TRIP_LIMITS = Object.freeze({
  segments: 500,
  notes: 50,
  checklist: 500,
  tripName: 120,
  segmentNote: 500,
  noteTitle: 60,
  noteText: 2000,
  checklistText: 120,
});

function parseCoordinate(value, min, max) {
  if (value === '' || value === null || value === undefined) return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizeId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : uid();
}

function normalizeCountryCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function normalizeCurrency(value) {
  const currency = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
}

function normalizeDate(value) {
  if (typeof value !== 'string') return '';
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? '' : date;
}

export function createCity(partial) {
  if (!partial) return null;
  return {
    name: sanitizeText(partial.name || '', 120),
    displayName: sanitizeText(partial.displayName || partial.name || '', 200),
    country: sanitizeText(partial.country || '', 100),
    countryCode: normalizeCountryCode(partial.countryCode),
    lat: parseCoordinate(partial.lat, -90, 90),
    lon: parseCoordinate(partial.lon, -180, 180),
  };
}

export function createSegment(overrides = {}) {
  return {
    id: normalizeId(overrides.id),
    origin: overrides.origin ? createCity(overrides.origin) : null,
    destination: overrides.destination ? createCity(overrides.destination) : null,
    startDate: normalizeDate(overrides.startDate),
    endDate: normalizeDate(overrides.endDate),
    expenses: overrides.expenses ? normalizeExpenses(overrides.expenses) : createExpenses(),
    note: sanitizeText(overrides.note || '', TRIP_LIMITS.segmentNote),
  };
}

export function createNote(text = '', title = 'Notas generales') {
  return {
    id: uid(),
    title: sanitizeText(title, TRIP_LIMITS.noteTitle),
    text: sanitizeText(text, TRIP_LIMITS.noteText),
  };
}

export function createChecklistItem(text = '') {
  return { id: uid(), text: sanitizeText(text, TRIP_LIMITS.checklistText), done: false };
}

export function createTrip(name = '') {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: sanitizeText(name, TRIP_LIMITS.tripName),
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
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  if (segments.length >= TRIP_LIMITS.segments) return trip;
  const defaults = nextSegmentDefaults(trip);
  const segment = createSegment(defaults);
  return { ...trip, segments: [...segments, segment], updatedAt: nowISO() };
}

export function reorderSegments(trip, sourceId, targetId, placement = 'before') {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  if (!sourceId || !targetId || sourceId === targetId) return trip;

  const sourceIndex = segments.findIndex((segment) => segment.id === sourceId);
  const targetIndex = segments.findIndex((segment) => segment.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return trip;

  const reordered = [...segments];
  const [moved] = reordered.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = reordered.findIndex((segment) => segment.id === targetId);
  const insertAt = targetIndexAfterRemoval + (placement === 'after' ? 1 : 0);
  reordered.splice(insertAt, 0, moved);

  if (reordered.every((segment, index) => segment === segments[index])) return trip;
  return { ...trip, segments: reordered, updatedAt: nowISO() };
}

export function moveSegmentByOffset(trip, segmentId, offset) {
  const segments = Array.isArray(trip?.segments) ? trip.segments : [];
  const sourceIndex = segments.findIndex((segment) => segment.id === segmentId);
  const numericOffset = Number.isFinite(Number(offset)) ? Math.trunc(Number(offset)) : 0;
  if (sourceIndex < 0 || numericOffset === 0) return trip;

  const targetIndex = Math.max(0, Math.min(segments.length - 1, sourceIndex + numericOffset));
  if (targetIndex === sourceIndex) return trip;

  const reordered = [...segments];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  return { ...trip, segments: reordered, updatedAt: nowISO() };
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
  const rawSegments = Array.isArray(raw.segments) ? raw.segments.slice(0, TRIP_LIMITS.segments) : [];
  const rawNotes = Array.isArray(raw.notes) ? raw.notes.slice(0, TRIP_LIMITS.notes) : null;
  const rawChecklist = Array.isArray(raw.checklist)
    ? raw.checklist.slice(0, TRIP_LIMITS.checklist)
    : [];

  return {
    id: normalizeId(raw.id),
    name: sanitizeText(raw.name || '', TRIP_LIMITS.tripName),
    currency: normalizeCurrency(raw.currency),
    segments: rawSegments.map((segment) => createSegment(segment)),
    notes:
      rawNotes && rawNotes.length > 0
        ? rawNotes.map((note) => ({
            id: normalizeId(note?.id),
            title: sanitizeText(note?.title || 'Notas generales', TRIP_LIMITS.noteTitle),
            text: sanitizeText(note?.text || '', TRIP_LIMITS.noteText),
          }))
        : typeof raw.notes === 'string'
          ? [createNote(raw.notes)]
          : [createNote()],
    checklist: rawChecklist.map((item) => ({
      id: normalizeId(item?.id),
      text: sanitizeText(item?.text || '', TRIP_LIMITS.checklistText),
      done: Boolean(item?.done),
    })),
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : nowISO(),
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : nowISO(),
  };
}

function nowISO() {
  return new Date().toISOString();
}
