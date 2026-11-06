import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { createV4TripTouchEventHandler } from './v4TripTouchEventHandler.js';

const CONNECTION_PATH = 'users/{userId}/trips/{tripId}/connections/{entityId}';
const NOTE_PATH = 'users/{userId}/trips/{tripId}/notes/{entityId}';
const CHECKLIST_PATH = 'users/{userId}/trips/{tripId}/checklist/{entityId}';

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

export function createV4TripTouchTriggers({
  db,
  region,
  triggerFactory = onDocumentWritten,
  handlerFactory = createV4TripTouchEventHandler,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const safeRegion = requiredText(region, 'region');
  if (typeof triggerFactory !== 'function') throw new TypeError('triggerFactory debe ser función.');
  if (typeof handlerFactory !== 'function') throw new TypeError('handlerFactory debe ser función.');

  return {
    v4ConnectionTouch: triggerFactory(
      triggerOptions(safeRegion, CONNECTION_PATH),
      handlerFactory({ db, entityType: 'connection' })
    ),
    v4NoteTouch: triggerFactory(
      triggerOptions(safeRegion, NOTE_PATH),
      handlerFactory({ db, entityType: 'note' })
    ),
    v4ChecklistTouch: triggerFactory(
      triggerOptions(safeRegion, CHECKLIST_PATH),
      handlerFactory({ db, entityType: 'checklist' })
    ),
  };
}
