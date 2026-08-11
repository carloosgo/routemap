import { isVersionedTripSummary } from './tripStorageSchema.js';

export const STORED_TRIP_KIND = Object.freeze({
  V2: 'v2',
  V3: 'v3',
  V4: 'v4',
  LEGACY: 'legacy',
  UNKNOWN: 'unknown',
});

export function storedTripKind(data) {
  if (!data || typeof data !== 'object') return STORED_TRIP_KIND.UNKNOWN;

  if (Object.hasOwn(data, 'schemaVersion')) {
    return Number(data.schemaVersion) === 4
      ? STORED_TRIP_KIND.V4
      : STORED_TRIP_KIND.UNKNOWN;
  }

  if (Object.hasOwn(data, 'storageVersion')) {
    if (!isVersionedTripSummary(data)) return STORED_TRIP_KIND.UNKNOWN;
    if (Number(data.storageVersion) === 2) return STORED_TRIP_KIND.V2;
    if (Number(data.storageVersion) === 3) return STORED_TRIP_KIND.V3;
    return STORED_TRIP_KIND.UNKNOWN;
  }

  if (typeof data.id === 'string' || typeof data.name === 'string') {
    return STORED_TRIP_KIND.LEGACY;
  }
  return STORED_TRIP_KIND.UNKNOWN;
}
