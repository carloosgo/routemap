import { normalizeTrip } from '../../modules/trips/tripModel.js';
import { STORAGE_V4_VERSION, V4_ENTITY_STATUS } from '../../modules/storage-v4/storageV4Contract.js';
import { nextEntityVersion } from '../../modules/storage-v4/entityVersionModel.js';

export function v4TripCreateDocument(rawTrip, timestampValue) {
  const trip = normalizeTrip(rawTrip);
  return {
    id: trip.id,
    name: trip.name,
    currency: trip.currency,
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

export function v4TripMetadataPatch(rawTrip, baseVersion, timestampValue) {
  const trip = normalizeTrip(rawTrip);
  return {
    name: trip.name,
    currency: trip.currency,
    originDetails: trip.originDetails,
    version: nextEntityVersion(baseVersion),
    updatedAt: timestampValue,
  };
}
