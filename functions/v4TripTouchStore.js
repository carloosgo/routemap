const TOUCHABLE_ENTITY_TYPES = new Set(['connection', 'note', 'checklist']);
const VALID_ENTITY_STATUS = new Set(['active', 'deleted']);

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') {
    const millis = Number(value.toMillis());
    return Number.isFinite(millis) ? millis : Number.NaN;
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : Number.NaN;
  }
  return Number.NaN;
}

function validateEntityAfter(after, entityId, entityType) {
  if (!TOUCHABLE_ENTITY_TYPES.has(entityType)) {
    throw new TypeError('entityType no participa en touch de viaje v4.');
  }
  if (!after) return null;
  if (requiredText(after.id, 'after.id') !== entityId) {
    throw new TypeError('after.id no coincide con la ruta del evento.');
  }
  if (!VALID_ENTITY_STATUS.has(after.status)) {
    throw new TypeError('after.status v4 inválido.');
  }
  if (!Number.isInteger(after.version) || after.version < 1) {
    throw new TypeError('after.version v4 inválida.');
  }
  const candidateMillis = timestampMillis(after.updatedAt);
  if (!Number.isFinite(candidateMillis)) {
    throw new TypeError('after.updatedAt debe ser un Timestamp válido.');
  }
  return { candidate: after.updatedAt, candidateMillis };
}

/**
 * Advances the parent trip's updatedAt when a non-aggregate child changes.
 *
 * The child timestamp, rather than trigger processing time, is authoritative.
 * This makes duplicate and out-of-order Firestore event delivery idempotent and
 * monotonic. The trip version is deliberately not incremented: entity-level
 * concurrency remains independent from list ordering metadata.
 */
export async function applyV4TripTouch({
  db,
  userId,
  tripId,
  entityId,
  entityType,
  after = null,
}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const ownerId = requiredText(userId, 'userId');
  const safeTripId = requiredText(tripId, 'tripId');
  const safeEntityId = requiredText(entityId, 'entityId');
  const validated = validateEntityAfter(after, safeEntityId, entityType);

  if (!validated) {
    return {
      applied: false,
      skipped: true,
      reason: 'physical-delete',
    };
  }

  const tripRef = db.doc(`users/${ownerId}/trips/${safeTripId}`);
  return db.runTransaction(async (transaction) => {
    const tripSnapshot = await transaction.get(tripRef);
    if (!tripSnapshot.exists || tripSnapshot.data()?.schemaVersion !== 4) {
      return {
        applied: false,
        skipped: true,
        reason: 'trip-not-v4',
      };
    }

    const trip = tripSnapshot.data();
    if (trip.status !== 'active') {
      return {
        applied: false,
        skipped: true,
        reason: 'trip-not-active',
      };
    }

    const currentMillis = timestampMillis(trip.updatedAt);
    if (Number.isFinite(currentMillis) && currentMillis >= validated.candidateMillis) {
      return {
        applied: false,
        skipped: true,
        reason: 'timestamp-not-newer',
      };
    }

    transaction.update(tripRef, { updatedAt: validated.candidate });
    return {
      applied: true,
      skipped: false,
      entityType,
      entityVersion: after.version,
    };
  });
}
