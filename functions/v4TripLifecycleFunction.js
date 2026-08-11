import { onCall } from 'firebase-functions/v2/https';
import { callableOptions, enforceQuota } from './callablePolicy.js';
import { db } from './geoapifyRuntime.js';
import {
  V4_TRIP_LIFECYCLE_QUOTA,
  createV4TripLifecycleCallableHandler,
} from './v4TripLifecycleCallableHandler.js';

export const v4TripLifecycle = onCall(
  callableOptions({
    timeoutSeconds: 15,
    maxInstances: 10,
    concurrency: 20,
  }),
  createV4TripLifecycleCallableHandler({
    db,
    enforceRateLimit: (request) => enforceQuota(db, request, V4_TRIP_LIFECYCLE_QUOTA),
  })
);
