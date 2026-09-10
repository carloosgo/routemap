import { onCall } from 'firebase-functions/v2/https';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { db } from './geoapifyRuntime.js';
import { V4_SERVICE_REGION } from './v4BackendManifest.js';
import {
  V4_TRIP_LIFECYCLE_QUOTA,
  createV4TripLifecycleCallableHandler,
} from './v4TripLifecycleCallableHandler.js';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

export function createV4TripLifecycleFunction({
  adminDb,
  region = V4_SERVICE_REGION,
  callableFactory = onCall,
  optionsFactory = callableOptions,
  handlerFactory = createV4TripLifecycleCallableHandler,
  quotaEnforcer = enforceQuota,
} = {}) {
  if (!adminDb) throw new TypeError('Se requiere Firestore Admin.');
  const safeRegion = requiredText(region, 'region');
  if (typeof callableFactory !== 'function') throw new TypeError('callableFactory debe ser función.');
  if (typeof optionsFactory !== 'function') throw new TypeError('optionsFactory debe ser función.');
  if (typeof handlerFactory !== 'function') throw new TypeError('handlerFactory debe ser función.');
  if (typeof quotaEnforcer !== 'function') throw new TypeError('quotaEnforcer debe ser función.');

  return callableFactory(
    optionsFactory({
      region: safeRegion,
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
