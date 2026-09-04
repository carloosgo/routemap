import { applyV4TripTouch } from './v4TripTouchStore.js';

const TOUCHABLE_ENTITY_TYPES = new Set(['connection', 'note', 'checklist']);

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function snapshotData(snapshot) {
  if (!snapshot || snapshot.exists === false) return null;
  if (typeof snapshot.data !== 'function') return null;
  return snapshot.data() || null;
}

export function createV4TripTouchEventHandler({
  db,
  entityType,
  applyTouch = applyV4TripTouch,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  if (!TOUCHABLE_ENTITY_TYPES.has(entityType)) {
    throw new TypeError('entityType de touch v4 inválido.');
  }
  if (typeof applyTouch !== 'function') {
    throw new TypeError('applyTouch debe ser función.');
  }

  return async function handleV4TripTouchEvent(event) {
    const userId = requiredText(event?.params?.userId, 'event.params.userId');
    const tripId = requiredText(event?.params?.tripId, 'event.params.tripId');
    const entityId = requiredText(event?.params?.entityId, 'event.params.entityId');
    const before = snapshotData(event?.data?.before);
    const after = snapshotData(event?.data?.after);
    if (!before && !after) {
      throw new TypeError('El evento touch v4 no contiene before ni after.');
    }

    return applyTouch({
      db,
      userId,
      tripId,
      entityId,
      entityType,
      after,
    });
  };
}
