import { onCall } from 'firebase-functions/v2/https';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { db } from './geoapifyRuntime.js';
import {
  V4_TRIP_LIFECYCLE_QUOTA,
  createV4TripLifecycleCallableHandler,
} from './v4TripLifecycleCallableHandler.js';

export function createV4TripLifecycleFunction({
  adminDb,
  callableFactory = onCall,
  optionsFactory = callableOptions,
  handlerFactory = createV4TripLifecycleCallableHandler,
  quotaEnforcer = enforceQuota,
} = {}) {
  if (!adminDb) throw new TypeError('Se requiere Firestore Admin.');
  if (typeof callableFactory !== 'function') throw new TypeError('callableFactory debe ser función.');
  if (typeof optionsFactory !== 'function') throw new TypeError('optionsFactory debe ser función.');
  if (typeof handlerFactory !== 'function') throw new TypeError('handlerFactory debe ser función.');
  if (typeof quotaEnforcer !== 'function') throw new TypeError('quotaEnforcer debe ser función.');

  return callableFactory(
    optionsFactory({
      timeoutSeconds: 15,
      maxInstances: 10,
      concurrency: 20,
    }),
    handlerFactory({
      db: adminDb,
      enforceRateLimit: (request) => quotaEnforcer(
        adminDb,
        request,
        V4_TRIP_LIFECYCLE_QUOTA
      ),
    })
  );
}

export const v4TripLifecycle = createV4TripLifecycleFunction({ adminDb: db });
