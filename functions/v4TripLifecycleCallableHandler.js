import { HttpsError } from 'firebase-functions/v2/https';
import { error as logError } from 'firebase-functions/logger';
import { requireAuthenticated } from './callablePolicy.js';
import {
  V4_TRIP_LIFECYCLE_ACTION,
  V4TripLifecycleError,
  applyV4TripLifecycleOperation,
} from './v4TripLifecycleStore.js';

export const V4_TRIP_LIFECYCLE_QUOTA = Object.freeze({
  scope: 'v4-trip-lifecycle',
  maxRequests: 30,
  windowMs: 60_000,
});

function timestampMillis(value) {
  return typeof value?.toMillis === 'function' ? value.toMillis() : null;
}

function publicLifecycleResult(result) {
  return {
    operationId: result.operationId,
    action: result.action,
    tripId: result.tripId,
    version: result.version,
    status: result.status,
    deletedAtMs: timestampMillis(result.deletedAt),
    purgeAfterMs: timestampMillis(result.purgeAfter),
    idempotentReplay: Boolean(result.idempotentReplay),
  };
}

function requireDeleteAction(value) {
  if (value !== V4_TRIP_LIFECYCLE_ACTION.DELETE) {
    throw new TypeError('action de lifecycle v4 solo admite delete.');
  }
  return value;
}

function mappedLifecycleError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof TypeError) {
    return new HttpsError('invalid-argument', error.message);
  }
  if (error instanceof V4TripLifecycleError) {
    if (error.code === 'not-found') {
      return new HttpsError('not-found', error.message);
    }
    if (error.code === 'version-conflict') {
      return new HttpsError('aborted', error.message);
    }
    if (
      error.code === 'failed-precondition'
      || error.code === 'operation-id-reused'
      || error.code === 'purge-in-progress'
    ) {
      return new HttpsError('failed-precondition', error.message);
    }
  }
  return null;
}

export function createV4TripLifecycleCallableHandler({
  db,
  applyOperation = applyV4TripLifecycleOperation,
  authenticate = requireAuthenticated,
  enforceRateLimit = async () => {},
  reportError = logError,
} = {}) {
  if (!db) throw new TypeError('Se requiere Firestore Admin.');
  if (typeof applyOperation !== 'function') throw new TypeError('applyOperation debe ser función.');
  if (typeof authenticate !== 'function') throw new TypeError('authenticate debe ser función.');
  if (typeof enforceRateLimit !== 'function') throw new TypeError('enforceRateLimit debe ser función.');
  if (typeof reportError !== 'function') throw new TypeError('reportError debe ser función.');

  return async function handleV4TripLifecycle(request) {
    try {
      const userId = authenticate(request);
      await enforceRateLimit(request, V4_TRIP_LIFECYCLE_QUOTA);
      const action = requireDeleteAction(request?.data?.action);
      const result = await applyOperation({
        db,
        userId,
        tripId: request?.data?.tripId,
        operationId: request?.data?.operationId,
        action,
        baseVersion: request?.data?.baseVersion,
      });
      return publicLifecycleResult(result);
    } catch (error) {
      const mapped = mappedLifecycleError(error);
      if (mapped) throw mapped;
      reportError('V4 trip lifecycle callable failed.', {
        errorName: error?.name || 'Error',
        errorCode: error?.code || '',
      });
      throw new HttpsError(
        'internal',
        'No fue posible eliminar el viaje.'
      );
    }
  };
}
