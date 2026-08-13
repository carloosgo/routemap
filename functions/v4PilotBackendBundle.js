import { db } from './geoapifyRuntime.js';
import { createV4AggregateTriggers } from './v4AggregateTriggers.js';
import { createV4TripLifecycleFunction } from './v4TripLifecycleFunction.js';
import { createV4TripPurgeScheduledFunction } from './v4TripPurgeScheduler.js';
import { createV4TripTouchTriggers } from './v4TripTouchTriggers.js';
import {
  V4_PILOT_BACKEND_FUNCTION_NAMES,
  V4_PILOT_FIRESTORE_EVENT_REGION,
  V4_PILOT_SERVICE_REGION,
} from './v4PilotBackendManifest.js';

export {
  V4_PILOT_BACKEND_FUNCTION_NAMES,
  V4_PILOT_FIRESTORE_EVENT_REGION,
  V4_PILOT_SERVICE_REGION,
} from './v4PilotBackendManifest.js';

/**
 * Composes the backend dependencies required by Storage v4 write pilot.
 *
 * Firestore-backed Eventarc triggers must be colocated with the Firestore
 * database. Callable/scheduled services use the service region; the scheduled
 * purge stays in a Cloud Scheduler-supported region.
 *
 * This module is intentionally NOT exported from functions/index.js. Creating
 * the bundle is code preparation only; Firebase will not deploy these functions
 * until the rollout gate is explicitly authorized and index.js is changed.
 */
export function createV4PilotBackendBundle({
  adminDb = db,
  firestoreEventRegion = V4_PILOT_FIRESTORE_EVENT_REGION,
  serviceRegion = V4_PILOT_SERVICE_REGION,
  aggregateFactory = createV4AggregateTriggers,
  touchFactory = createV4TripTouchTriggers,
  lifecycleFactory = createV4TripLifecycleFunction,
  purgeFactory = createV4TripPurgeScheduledFunction,
} = {}) {
  if (!adminDb) throw new TypeError('Se requiere Firestore Admin para Storage v4 pilot.');
  if (typeof aggregateFactory !== 'function') throw new TypeError('aggregateFactory debe ser función.');
  if (typeof touchFactory !== 'function') throw new TypeError('touchFactory debe ser función.');
  if (typeof lifecycleFactory !== 'function') throw new TypeError('lifecycleFactory debe ser función.');
  if (typeof purgeFactory !== 'function') throw new TypeError('purgeFactory debe ser función.');

  const aggregates = aggregateFactory({ db: adminDb, region: firestoreEventRegion });
  const touches = touchFactory({ db: adminDb, region: firestoreEventRegion });
  const lifecycle = lifecycleFactory({ adminDb, region: serviceRegion });
  const purge = purgeFactory({ db: adminDb, region: serviceRegion });
  const bundle = {
    v4SegmentAggregate: aggregates?.v4SegmentAggregate,
    v4PlaceAggregate: aggregates?.v4PlaceAggregate,
    v4ConnectionTouch: touches?.v4ConnectionTouch,
    v4NoteTouch: touches?.v4NoteTouch,
    v4ChecklistTouch: touches?.v4ChecklistTouch,
    v4TripLifecycle: lifecycle,
    v4TripPurge: purge,
  };

  for (const name of V4_PILOT_BACKEND_FUNCTION_NAMES) {
    if (!bundle[name]) throw new TypeError(`El backend v4 pilot no produjo ${name}.`);
  }
  return Object.freeze(bundle);
}
