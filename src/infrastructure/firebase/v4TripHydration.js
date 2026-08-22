import { PLACE_ORDER_VERSION, normalizeTrip } from '../../modules/trips/tripModel.js';

function timestampIso(value) {
  if (typeof value === 'string') return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  return '';
}

function active(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.status !== 'deleted');
}

export function v4TripListEntry(id, summary = {}) {
  return {
    id,
    name: typeof summary.name === 'string' ? summary.name : '',
    currency: typeof summary.currency === 'string' ? summary.currency : 'USD',
    schemaVersion: 4,
    status: summary.status === 'deleted' ? 'deleted' : 'active',
    version: Number(summary.version) || 0,
    createdAt: timestampIso(summary.createdAt),
    updatedAt: timestampIso(summary.updatedAt),
    segmentCount: Number(summary.segmentCount) || 0,
    placeCount: Number(summary.placeCount) || 0,
    total: Number(summary.total) || 0,
  };
}

export function hydrateV4Trip(summary = {}, collections = {}) {
  if (Number(summary.schemaVersion) !== 4) {
    throw new TypeError('El resumen no usa Storage v4.');
  }
  return normalizeTrip({
    id: summary.id,
    name: summary.name,
    currency: summary.currency,
    originDetails: summary.originDetails,
    placeOrderVersion: PLACE_ORDER_VERSION,
    createdAt: timestampIso(summary.createdAt),
    updatedAt: timestampIso(summary.updatedAt),
    segments: active(collections.segments),
    places: active(collections.places),
    routeConnections: active(collections.connections),
    notes: active(collections.notes),
    checklist: active(collections.checklist),
  });
}
