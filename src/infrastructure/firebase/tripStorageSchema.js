import {
  normalizeTrip,
  placeForPersistence,
  tripTotal,
} from '../../modules/trips/tripModel.js';

export const TRIP_STORAGE_VERSION = 3;
const SUPPORTED_TRIP_STORAGE_VERSIONS = new Set([2, TRIP_STORAGE_VERSION]);
export const TRIP_REVISION_COLLECTIONS = Object.freeze([
  'segments',
  'places',
  'routeConnections',
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
  return items.map((item, position) => ({ ...transform(item, position), position }));
}

function segmentForStorage(segment, origin) {
  const stored = {
    ...segment,
    origin: origin && typeof origin === 'object' ? origin : null,
  };
  delete stored.places;
  return stored;
}

function routeConnectionForStorage(route) {
  const isGoogleRoute = route?.provider === 'google';
  const stored = {
    ...route,
    distance: isGoogleRoute ? 0 : route.distance,
    duration: isGoogleRoute ? 0 : route.duration,
    geometryJson: isGoogleRoute ? 'null' : JSON.stringify(route.geometry),
    calculatedAt: isGoogleRoute ? '' : route.calculatedAt,
  };
  delete stored.geometry;
  delete stored.transitSteps;
  delete stored.provider;
  return stored;
}

function withoutPosition(item) {
  if (!item || typeof item !== 'object') return item;
  const stored = { ...item };
  delete stored.position;
  return stored;
}

function routeConnectionFromStorage(item) {
  const stored = withoutPosition(item);
  if (!stored || typeof stored !== 'object') return stored;
  let geometry = stored.geometry || null;
  if (!geometry && typeof stored.geometryJson === 'string') {
    try {
      geometry = JSON.parse(stored.geometryJson);
    } catch {
      geometry = null;
    }
  }
  delete stored.geometryJson;
  return { ...stored, geometry };
}

function ordered(items) {
  return [...(Array.isArray(items) ? items : [])]
    .sort((left, right) => (Number(left?.position) || 0) - (Number(right?.position) || 0))
    .map(withoutPosition);
}

function orderedRouteConnections(items) {
  return [...(Array.isArray(items) ? items : [])]
    .sort((left, right) => (Number(left?.position) || 0) - (Number(right?.position) || 0))
    .map(routeConnectionFromStorage);
}

export function isVersionedTripSummary(data) {
  return Boolean(
    data
      && SUPPORTED_TRIP_STORAGE_VERSIONS.has(Number(data.storageVersion))
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
    routeConnectionCount: trip.routeConnections.length,
    noteCount: trip.notes.length,
    checklistCount: trip.checklist.length,
  };

  return {
    trip: { ...trip, updatedAt: timestamp },
    summary: {
      id: trip.id,
      name: trip.name,
      currency: trip.currency,
      originDetails: trip.originDetails,
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
      segments: positioned(trip.segments, (segment, position) => segmentForStorage(
        segment,
        position === 0 ? trip.origin : trip.segments[position - 1]?.destination
      )),
      places: positioned(trip.places, placeForPersistence),
      routeConnections: positioned(trip.routeConnections, routeConnectionForStorage),
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
    originDetails: data.originDetails || null,
    placeOrderVersion: Number(data.placeOrderVersion) || 0,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
    storageVersion: Number(data.storageVersion) || 0,
    activeRevision: data.activeRevision,
    segmentCount: Number(data.segmentCount) || 0,
    placeCount: Number(data.placeCount) || 0,
    routeConnectionCount: Number(data.routeConnectionCount) || 0,
    noteCount: Number(data.noteCount) || 0,
    checklistCount: Number(data.checklistCount) || 0,
    total: Number(data.total) || 0,
  };
}

export function hydrateVersionedTrip(summary, collections) {
  if (!isVersionedTripSummary(summary)) {
    throw new TypeError('El resumen del viaje no usa el esquema versionado.');
  }

  const segments = ordered(collections?.segments);
  const legacyOrigin = segments[0]?.origin || null;

  return normalizeTrip({
    id: summary.id,
    name: summary.name,
    currency: summary.currency,
    origin: legacyOrigin,
    originDetails: summary.originDetails,
    placeOrderVersion: summary.placeOrderVersion,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    segments,
    places: ordered(collections?.places),
    routeConnections: orderedRouteConnections(collections?.routeConnections),
    notes: ordered(collections?.notes),
    checklist: ordered(collections?.checklist),
  });
}
