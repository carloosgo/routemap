import { normalizeTrip, tripTotal } from '../../modules/trips/tripModel.js';

export const TRIP_STORAGE_VERSION = 2;
export const TRIP_REVISION_COLLECTIONS = Object.freeze([
  'segments',
  'places',
  'notes',
  'checklist',
]);

function normalizedRevisionId(value) {
  const revisionId = typeof value === 'string' ? value.trim() : '';
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(revisionId)) {
    throw new TypeError('Se requiere un identificador de revisión válido.');
  }
  return revisionId;
}

function positioned(items, transform = (item) => item) {
  return items.map((item, position) => ({ ...transform(item), position }));
}

function segmentForStorage(segment) {
  const stored = { ...segment };
  delete stored.places;
  return stored;
}

function withoutPosition(item) {
  if (!item || typeof item !== 'object') return item;
  const stored = { ...item };
  delete stored.position;
  return stored;
}

function ordered(items) {
  return [...(Array.isArray(items) ? items : [])]
    .sort((left, right) => (Number(left?.position) || 0) - (Number(right?.position) || 0))
    .map(withoutPosition);
}

export function isVersionedTripSummary(data) {
  return Boolean(
    data
      && data.storageVersion === TRIP_STORAGE_VERSION
      && typeof data.activeRevision === 'string'
      && data.activeRevision.trim()
  );
}

export function createTripRevisionPayload(rawTrip, revisionId, updatedAt = new Date().toISOString()) {
  const trip = normalizeTrip(rawTrip);
  const activeRevision = normalizedRevisionId(revisionId);
  const timestamp = typeof updatedAt === 'string' && updatedAt ? updatedAt : new Date().toISOString();
  const counts = {
    segmentCount: trip.segments.length,
    placeCount: trip.places.length,
    noteCount: trip.notes.length,
    checklistCount: trip.checklist.length,
  };

  return {
    trip: { ...trip, updatedAt: timestamp },
    summary: {
      id: trip.id,
      name: trip.name,
      currency: trip.currency,
      placeOrderVersion: trip.placeOrderVersion,
      createdAt: trip.createdAt,
      updatedAt: timestamp,
      storageVersion: TRIP_STORAGE_VERSION,
      activeRevision,
      ...counts,
      total: tripTotal(trip),
    },
    revision: {
      id: activeRevision,
      createdAt: timestamp,
      complete: false,
      ...counts,
    },
    collections: {
      segments: positioned(trip.segments, segmentForStorage),
      places: positioned(trip.places),
      notes: positioned(trip.notes),
      checklist: positioned(trip.checklist),
    },
  };
}

export function createVersionedTripListEntry(id, data) {
  if (!isVersionedTripSummary(data)) return null;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    currency: typeof data.currency === 'string' ? data.currency : 'USD',
    placeOrderVersion: Number(data.placeOrderVersion) || 0,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    storageVersion: TRIP_STORAGE_VERSION,
    activeRevision: data.activeRevision,
    segmentCount: Number(data.segmentCount) || 0,
    placeCount: Number(data.placeCount) || 0,
    noteCount: Number(data.noteCount) || 0,
    checklistCount: Number(data.checklistCount) || 0,
    total: Number(data.total) || 0,
  };
}

export function hydrateVersionedTrip(summary, collections) {
  if (!isVersionedTripSummary(summary)) {
    throw new TypeError('El resumen del viaje no usa el esquema versionado.');
  }

  return normalizeTrip({
    id: summary.id,
    name: summary.name,
    currency: summary.currency,
    placeOrderVersion: summary.placeOrderVersion,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    segments: ordered(collections?.segments),
    places: ordered(collections?.places),
    notes: ordered(collections?.notes),
    checklist: ordered(collections?.checklist),
  });
}
