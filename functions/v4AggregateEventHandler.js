import { applyV4AggregateEvent } from './v4AggregateStore.js';

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

export function createV4AggregateEventHandler({ db, entityType } = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  if (entityType !== 'segment' && entityType !== 'place') {
    throw new TypeError('entityType de agregado v4 inválido.');
  }

  return async function handleV4AggregateEvent(event) {
    const userId = requiredText(event?.params?.userId, 'event.params.userId');
    const tripId = requiredText(event?.params?.tripId, 'event.params.tripId');
    const entityId = requiredText(event?.params?.entityId, 'event.params.entityId');
    const before = snapshotData(event?.data?.before);
    const after = snapshotData(event?.data?.after);
    if (!before && !after) {
      throw new TypeError('El evento de agregado v4 no contiene before ni after.');
    }

    return applyV4AggregateEvent({
      db,
      userId,
      tripId,
      entityId,
      entityType,
      before,
      after,
    });
  };
}
