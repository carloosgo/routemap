import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { createV4AggregateEventHandler } from './v4AggregateEventHandler.js';

const SEGMENT_PATH = 'users/{userId}/trips/{tripId}/segments/{entityId}';
const PLACE_PATH = 'users/{userId}/trips/{tripId}/places/{entityId}';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function triggerOptions(region, document) {
  return {
    document,
    region,
    retry: true,
    timeoutSeconds: 60,
    memory: '256MiB',
    maxInstances: 10,
    concurrency: 20,
  };
}

export function createV4AggregateTriggers({
  db,
  region,
  triggerFactory = onDocumentWritten,
  handlerFactory = createV4AggregateEventHandler,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const safeRegion = requiredText(region, 'region');
  if (typeof triggerFactory !== 'function') throw new TypeError('triggerFactory debe ser función.');
  if (typeof handlerFactory !== 'function') throw new TypeError('handlerFactory debe ser función.');

  const segmentHandler = handlerFactory({ db, entityType: 'segment' });
  const placeHandler = handlerFactory({ db, entityType: 'place' });

  return {
    v4SegmentAggregate: triggerFactory(
      triggerOptions(safeRegion, SEGMENT_PATH),
      segmentHandler
    ),
    v4PlaceAggregate: triggerFactory(
      triggerOptions(safeRegion, PLACE_PATH),
      placeHandler
    ),
  };
}
