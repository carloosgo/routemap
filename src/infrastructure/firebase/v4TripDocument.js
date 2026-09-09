import { normalizeTrip } from '../../modules/trips/tripModel.js';
import { STORAGE_V4_VERSION, V4_ENTITY_STATUS } from '../../modules/storage-v4/storageV4Contract.js';
import { nextEntityVersion } from '../../modules/storage-v4/entityVersionModel.js';
import { V4_TRIP_MUTABLE_ROOT_FIELDS } from './v4TripSavePlan.js';

function normalizedFieldMask(fieldMask) {
  if (!Array.isArray(fieldMask)) return [...V4_TRIP_MUTABLE_ROOT_FIELDS];
  const allowed = new Set(V4_TRIP_MUTABLE_ROOT_FIELDS);
  return [...new Set(fieldMask.filter((field) => allowed.has(field)))];
}

export function v4TripCreateDocument(rawTrip, timestampValue) {
  const trip = normalizeTrip(rawTrip);
  return {
    id: trip.id,
    name: trip.name,
    currency: trip.currency,
    startDate: trip.startDate || '',
    endDate: trip.endDate || '',
    origin: trip.origin || null,
    originDetails: trip.originDetails,
    schemaVersion: STORAGE_V4_VERSION,
    status: V4_ENTITY_STATUS.ACTIVE,
    version: 1,
    createdAt: timestampValue,
    updatedAt: timestampValue,
    deletedAt: null,
    purgeAfter: null,
    segmentCount: 0,
    placeCount: 0,
    total: 0,
  };
}

export function v4TripMetadataPatch(rawTrip, baseVersion, timestampValue, fieldMask = null) {
  const trip = normalizeTrip(rawTrip);
  const source = {
    name: trip.name,
    currency: trip.currency,
    startDate: trip.startDate || '',
    endDate: trip.endDate || '',
    origin: trip.origin || null,
    originDetails: trip.originDetails,
  };
  const patch = {};
  normalizedFieldMask(fieldMask).forEach((field) => {
    patch[field] = source[field];
  });
  return {
    ...patch,
    version: nextEntityVersion(baseVersion),
    updatedAt: timestampValue,
  };
}
