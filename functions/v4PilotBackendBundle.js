import { db } from './geoapifyRuntime.js';
import { createV4AggregateTriggers } from './v4AggregateTriggers.js';
import { createV4TripLifecycleFunction } from './v4TripLifecycleFunction.js';
import { createV4TripPurgeScheduledFunction } from './v4TripPurgeScheduler.js';
import { createV4TripTouchTriggers } from './v4TripTouchTriggers.js';

export const V4_PILOT_BACKEND_REGION = 'us-central1';
export const V4_PILOT_BACKEND_FUNCTION_NAMES = Object.freeze([
  'v4SegmentAggregate',
  'v4PlaceAggregate',
  'v4ConnectionTouch',
  'v4NoteTouch',
  'v4ChecklistTouch',
  'v4TripLifecycle',
  'v4TripPurge',
]);

/**
 * Composes the backend dependencies required by Storage v4 write pilot.
 *
 * This module is intentionally NOT exported from functions/index.js. Creating
 * the bundle is code preparation only; Firebase will not deploy these functions
 * until the rollout gate is explicitly authorized and index.js is changed.
 */
export function createV4PilotBackendBundle({
  adminDb = db,
  region = V4_PILOT_BACKEND_REGION,
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

  const aggregates = aggregateFactory({ db: adminDb, region });
  const touches = touchFactory({ db: adminDb, region });
  const lifecycle = lifecycleFactory({ adminDb });
  const purge = purgeFactory({ db: adminDb, region });
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
