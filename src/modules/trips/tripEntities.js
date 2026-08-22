import { sanitizeText, uid } from '../../shared/utils.js';
import {
  createExpenses,
  normalizeExpenses,
} from '../expenses/expenseModel.js';
import { normalizeSavedPlaceRoutes } from '../routes/routeModel.js';
import { groupPlacesByCountry } from './placeOrdering.js';

export const TRIP_LIMITS = Object.freeze({
  segments: 500,
  places: 500,
  routeConnections: 200,
  placesPerSegment: 200,
  notes: 50,
  checklist: 500,
  tripName: 120,
  segmentNote: 500,
  originNote: 500,
  noteTitle: 60,
  noteText: 2000,
  checklistText: 120,
});

export const PLACE_ORDER_VERSION = 1;

const LEGACY_SYSTEM_NOTE_TITLES = new Set([
  'Notas generales',
  'General notes',
  'Nueva nota',
  'New note',
]);

function nowISO() {
  return new Date().toISOString();
}

function parseCoordinate(value, min, max) {
  if (value === '' || value == null) return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

function normalizeId(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 128)
    : uid();
}

function normalizeExternalId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 256) : '';
}

function normalizeCountryCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(code) ? code : '';
}

function normalizeCurrency(value) {
  const currency =
    typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(currency) ? currency : 'USD';
}

function normalizeDate(value) {
  if (typeof value !== 'string') return '';
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
    ? ''
    : date;
}

function normalizeNoteTitle(value) {
  const title = sanitizeText(value || '', TRIP_LIMITS.noteTitle);
  return LEGACY_SYSTEM_NOTE_TITLES.has(title) ? '' : title;
}

function normalizePlaceProvider(partial) {
  return partial?.provider === 'google' || partial?.googlePlaceId
    ? 'google'
    : 'geoapify';
}

export function isPlaced(point) {
  return Boolean(
    point &&
      Number.isFinite(point.lat) &&
      Math.abs(point.lat) <= 90 &&
      Number.isFinite(point.lon) &&
      Math.abs(point.lon) <= 180
  );
}

export function isGooglePlaceReference(place) {
  return Boolean(
    place
      && place.provider === 'google'
      && typeof place.googlePlaceId === 'string'
      && place.googlePlaceId.trim()
  );
}

export function createCity(partial) {
  if (!partial) return null;
  return {
    id: normalizeExternalId(partial.id || partial.placeId),
    name: sanitizeText(partial.name || '', 120),
    displayName: sanitizeText(
      partial.displayName || partial.name || '',
      200
    ),
    country: sanitizeText(partial.country || '', 100),
    countryCode: normalizeCountryCode(partial.countryCode),
    lat: parseCoordinate(partial.lat, -90, 90),
    lon: parseCoordinate(partial.lon, -180, 180),
  };
}

export function createPlace(partial = {}) {
  const provider = normalizePlaceProvider(partial);
  const googlePlaceId = provider === 'google'
    ? normalizeExternalId(partial.googlePlaceId || partial.id)
    : '';
  return {
    id: normalizeId(partial.id || googlePlaceId),
    provider,
    googlePlaceId,
    userLabel: sanitizeText(partial.userLabel || '', 160),
    name: sanitizeText(partial.name || '', 160),
    address: sanitizeText(partial.address || '', 260),
    city: sanitizeText(partial.city || '', 120),
    country: sanitizeText(partial.country || '', 100),
    category: sanitizeText(partial.category || '', 80),
    countryCode: normalizeCountryCode(partial.countryCode),
    lat: parseCoordinate(partial.lat, -90, 90),
    lon: parseCoordinate(partial.lon, -180, 180),
    savedAt:
      typeof partial.savedAt === 'string' ? partial.savedAt : nowISO(),
  };
}

export function placeForPersistence(rawPlace) {
  const place = createPlace(rawPlace);
  if (!isGooglePlaceReference(place)) return place;
  return {
    ...place,
    name: '',
    address: '',
    city: '',
    country: '',
    category: '',
    countryCode: '',
    lat: null,
    lon: null,
  };
}

function uniquePlaces(rawPlaces) {
  const seen = new Set();
  const places = [];

  for (const rawPlace of rawPlaces) {
    const place = createPlace(rawPlace);
    if (!isPlaced(place) && !isGooglePlaceReference(place)) continue;

    const key = isGooglePlaceReference(place)
      ? `google:${place.googlePlaceId}`
      : [
          Number(place.lat).toFixed(6),
          Number(place.lon).toFixed(6),
          place.name.trim().toLowerCase(),
        ].join('|');
    if (seen.has(key)) continue;

    seen.add(key);
    places.push(place);
    if (places.length >= TRIP_LIMITS.places) break;
  }

  return places;
}

export function createOriginDetails(partial = {}) {
  const source = partial && typeof partial === 'object' ? partial : {};
  return {
    departureDate: normalizeDate(source.departureDate),
    expenses: source.expenses
      ? normalizeExpenses(source.expenses)
      : createExpenses(),
    note: sanitizeText(source.note || '', TRIP_LIMITS.originNote),
  };
}

export function createSegment(overrides = {}) {
  return {
    id: normalizeId(overrides.id),
    origin: overrides.origin ? createCity(overrides.origin) : null,
    destination: overrides.destination
      ? createCity(overrides.destination)
      : null,
    startDate: normalizeDate(overrides.startDate),
    endDate: normalizeDate(overrides.endDate),
    expenses: overrides.expenses
      ? normalizeExpenses(overrides.expenses)
      : createExpenses(),
    note: sanitizeText(overrides.note || '', TRIP_LIMITS.segmentNote),
  };
}

export function createNote(text = '', title = '') {
  return {
    id: uid(),
    title: normalizeNoteTitle(title),
    text: sanitizeText(text, TRIP_LIMITS.noteText),
  };
}

export function createChecklistItem(text = '') {
  return {
    id: uid(),
    text: sanitizeText(text, TRIP_LIMITS.checklistText),
    done: false,
  };
}

export function createTrip(name = '') {
  const now = nowISO();
  return {
    id: uid(),
    name: sanitizeText(name, TRIP_LIMITS.tripName),
    currency: 'USD',
    originDetails: createOriginDetails(),
    segments: [],
    places: [],
    routeConnections: [],
    placeOrderVersion: PLACE_ORDER_VERSION,
    notes: [createNote()],
    checklist: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeTrip(raw) {
  if (!raw || typeof raw !== 'object') return createTrip();

  const rawSegments = Array.isArray(raw.segments)
    ? raw.segments.slice(0, TRIP_LIMITS.segments)
    : [];
  const legacyPlaces = rawSegments.flatMap((segment) =>
    Array.isArray(segment?.places)
      ? segment.places.slice(0, TRIP_LIMITS.placesPerSegment)
      : []
  );
  const currentPlaces = Array.isArray(raw.places)
    ? raw.places.slice(0, TRIP_LIMITS.places)
    : [];
  const rawPlaces = [...currentPlaces, ...legacyPlaces];
  const normalizedPlaces = uniquePlaces(rawPlaces);
  const places = Number(raw.placeOrderVersion) === PLACE_ORDER_VERSION
    ? normalizedPlaces
    : groupPlacesByCountry(normalizedPlaces);
  const routeConnections = normalizeSavedPlaceRoutes(
    raw.routeConnections,
    places,
    TRIP_LIMITS.routeConnections
  );
  const rawNotes = Array.isArray(raw.notes)
    ? raw.notes.slice(0, TRIP_LIMITS.notes)
    : null;
  const rawChecklist = Array.isArray(raw.checklist)
    ? raw.checklist.slice(0, TRIP_LIMITS.checklist)
    : [];

  return {
    id: normalizeId(raw.id),
    name: sanitizeText(raw.name || '', TRIP_LIMITS.tripName),
    currency: normalizeCurrency(raw.currency),
    originDetails: createOriginDetails(raw.originDetails),
    segments: rawSegments.map(createSegment),
    places,
    routeConnections,
    placeOrderVersion: PLACE_ORDER_VERSION,
    notes: rawNotes?.length
      ? rawNotes.map((note) => ({
          id: normalizeId(note?.id),
          title: normalizeNoteTitle(note?.title),
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
    createdAt:
      typeof raw.createdAt === 'string' && raw.createdAt
        ? raw.createdAt
        : nowISO(),
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt
        ? raw.updatedAt
        : nowISO(),
  };
}
