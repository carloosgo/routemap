import { isVersionedTripSummary } from './tripStorageSchema.js';

export const STORED_TRIP_KIND = Object.freeze({
  V3: 'v3',
  V4: 'v4',
  LEGACY: 'legacy',
  UNKNOWN: 'unknown',
});

export function storedTripKind(data) {
  if (!data || typeof data !== 'object') return STORED_TRIP_KIND.UNKNOWN;
  if (Number(data.schemaVersion) === 4) return STORED_TRIP_KIND.V4;
  if (isVersionedTripSummary(data)) return STORED_TRIP_KIND.V3;
  if (typeof data.id === 'string' || typeof data.name === 'string') {
    return STORED_TRIP_KIND.LEGACY;
  }
  return STORED_TRIP_KIND.UNKNOWN;
}
