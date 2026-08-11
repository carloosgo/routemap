import { Timestamp } from 'firebase-admin/firestore';

export const V4_TRIP_LIFECYCLE_ACTION = Object.freeze({
  DELETE: 'delete',
  RESTORE: 'restore',
});

export class V4TripLifecycleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'V4TripLifecycleError';
    this.code = code;
  }
}

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

function normalizeOperationId(value) {
  const id = requiredText(value, 'operationId');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(id)) {
    throw new TypeError('operationId tiene formato inválido.');
  }
  return id;
}

function positiveVersion(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('baseVersion debe ser un entero positivo.');
  }
  return value;
}

function lifecycleAction(value) {
  if (!Object.values(V4_TRIP_LIFECYCLE_ACTION).includes(value)) {
    throw new TypeError('action de lifecycle v4 inválida.');
  }
  return value;
}

function timestampValue(value) {
  if (value instanceof Timestamp) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return Timestamp.fromDate(value);
  }
  throw new TypeError('now() debe devolver Timestamp o Date válido.');
}

function validateRetentionMs(value) {
  if (!Number.isInteger(value) || value < 24 * 60 * 60 * 1000) {
    throw new TypeError('retentionMs debe ser al menos un día entero.');
  }
  return value;
}

function resultFromOperation(data) {
  return {
    operationId: data.operationId,
    action: data.action,
    tripId: data.tripId,
    version: data.resultVersion,
    status: data.resultStatus,
    deletedAt: data.deletedAt || null,
    purgeAfter: data.purgeAfter || null,
    idempotentReplay: true,
  };
}

function assertReplayMatches(data, { userId, tripId, operationId, action, baseVersion }) {
  const same = data.userId === userId
    && data.tripId === tripId
    && data.operationId === operationId
    && data.action === action
    && data.baseVersion === baseVersion;
  if (!same) {
    throw new V4TripLifecycleError(
      'operation-id-reused',
      'operationId ya fue utilizado con parámetros diferentes.'
    );
  }
}

export async function applyV4TripLifecycleOperation({
  db,
  userId,
  tripId,
  operationId,
  action,
  baseVersion,
  retentionMs = 30 * 24 * 60 * 60 * 1000,
  now = () => Timestamp.now(),
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  const ownerId = requiredText(userId, 'userId');
  const safeTripId = requiredText(tripId, 'tripId');
  const safeOperationId = normalizeOperationId(operationId);
  const safeAction = lifecycleAction(action);
  const expectedVersion = positiveVersion(baseVersion);
  const retention = validateRetentionMs(retentionMs);
  if (typeof now !== 'function') throw new TypeError('now debe ser función.');

  const userRef = db.doc(`users/${ownerId}`);
  const tripRef = userRef.collection('trips').doc(safeTripId);
  const operationRef = tripRef.collection('__lifecycleOperations').doc(safeOperationId);
  const purgeJobRef = userRef.collection('__tripPurgeJobs').doc(safeTripId);

  return db.runTransaction(async (transaction) => {
    const [operationSnapshot, tripSnapshot] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(tripRef),
    ]);

    if (operationSnapshot.exists) {
      const existing = operationSnapshot.data();
      assertReplayMatches(existing, {
        userId: ownerId,
        tripId: safeTripId,
        operationId: safeOperationId,
        action: safeAction,
        baseVersion: expectedVersion,
      });
      return resultFromOperation(existing);
    }

    if (!tripSnapshot.exists) {
      throw new V4TripLifecycleError('not-found', 'El viaje v4 no existe.');
    }
    const trip = tripSnapshot.data();
    if (trip.schemaVersion !== 4) {
      throw new V4TripLifecycleError(
        'failed-precondition',
        'El viaje todavía no usa Storage v4.'
      );
    }
    if (trip.version !== expectedVersion) {
      throw new V4TripLifecycleError(
        'version-conflict',
        'El viaje cambió desde la versión conocida por el cliente.'
      );
    }

    const deleting = safeAction === V4_TRIP_LIFECYCLE_ACTION.DELETE;
    if (deleting && trip.status !== 'active') {
      throw new V4TripLifecycleError(
        'failed-precondition',
        'Solo un viaje activo puede enviarse a la papelera.'
      );
    }
    if (!deleting && trip.status !== 'deleted') {
      throw new V4TripLifecycleError(
        'failed-precondition',
        'Solo un viaje eliminado puede restaurarse.'
      );
    }

    const timestamp = timestampValue(now());
    const nextVersion = expectedVersion + 1;
    const deletedAt = deleting ? timestamp : null;
    const purgeAfter = deleting
      ? Timestamp.fromMillis(timestamp.toMillis() + retention)
      : null;
    const nextStatus = deleting ? 'deleted' : 'active';

    transaction.update(tripRef, {
      status: nextStatus,
      version: nextVersion,
      updatedAt: timestamp,
      deletedAt,
      purgeAfter,
    });
    if (deleting) {
      transaction.set(purgeJobRef, {
        userId: ownerId,
        tripId: safeTripId,
        state: 'scheduled',
        dueAt: purgeAfter,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else {
      transaction.delete(purgeJobRef);
    }
    transaction.set(operationRef, {
      operationId: safeOperationId,
      userId: ownerId,
      tripId: safeTripId,
      action: safeAction,
      baseVersion: expectedVersion,
      resultVersion: nextVersion,
      resultStatus: nextStatus,
      deletedAt,
      purgeAfter,
      completedAt: timestamp,
    });

    return {
      operationId: safeOperationId,
      action: safeAction,
      tripId: safeTripId,
      version: nextVersion,
      status: nextStatus,
      deletedAt,
      purgeAfter,
      idempotentReplay: false,
    };
  });
}
