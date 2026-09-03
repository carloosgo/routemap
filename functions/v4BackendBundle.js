import { db } from './geoapifyRuntime.js';
import { createV4FirestoreEventIngressFunction } from './v4FirestoreEventIngressFunction.js';
import { createV4TripLifecycleFunction } from './v4TripLifecycleFunction.js';
import { createV4TripPurgeScheduledFunction } from './v4TripPurgeScheduler.js';
import {
  V4_BACKEND_FUNCTION_NAMES,
  V4_EVENTARC_REGION,
  V4_EVENTARC_TRIGGERS,
  V4_SERVICE_REGION,
} from './v4BackendManifest.js';

export {
  V4_BACKEND_FUNCTION_NAMES,
  V4_EVENTARC_REGION,
  V4_EVENTARC_TRIGGERS,
  V4_SERVICE_REGION,
} from './v4BackendManifest.js';

/**
 * Canonical Firebase Functions composition for Storage v4.
 *
 * Firestore is hosted in northamerica-south1, which is not a supported Firebase
 * Functions runtime region. Firestore writes therefore reach a private HTTPS
 * ingress in us-central1 through Eventarc triggers colocated with the database.
 * Lifecycle and purge remain ordinary Firebase Functions in us-central1.
 */
export function createV4BackendBundle({
  adminDb = db,
  serviceRegion = V4_SERVICE_REGION,
  ingressFactory = createV4FirestoreEventIngressFunction,
  lifecycleFactory = createV4TripLifecycleFunction,
  purgeFactory = createV4TripPurgeScheduledFunction,
} = {}) {
  if (!adminDb) throw new TypeError('Se requiere Firestore Admin para Storage v4.');
  if (typeof ingressFactory !== 'function') throw new TypeError('ingressFactory debe ser función.');
  if (typeof lifecycleFactory !== 'function') throw new TypeError('lifecycleFactory debe ser función.');
  if (typeof purgeFactory !== 'function') throw new TypeError('purgeFactory debe ser función.');

  const bundle = {
    v4FirestoreEventIngress: ingressFactory({ adminDb, region: serviceRegion }),
    v4TripLifecycle: lifecycleFactory({ adminDb, region: serviceRegion }),
    v4TripPurge: purgeFactory({ db: adminDb, region: serviceRegion }),
  };

  for (const name of V4_BACKEND_FUNCTION_NAMES) {
    if (!bundle[name]) throw new TypeError(`El backend v4 no produjo ${name}.`);
  }
  return Object.freeze(bundle);
}
