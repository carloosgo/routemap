import { createFirestoreHybridTripRepository } from './firestoreHybridTripRepository.js';
import { createFirestoreTripRepository } from './firestoreTripRepository.js';
import {
  TRIP_REPOSITORY_ROLLOUT_MODE,
  planTripRepositoryRollout,
} from '../../modules/storage-v4/tripRepositoryRolloutPlan.js';

function requiredText(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${field} es obligatorio.`);
  return normalized;
}

/**
 * Candidate Gate G repository factory.
 *
 * IMPORTANT: this module is not imported by the production selector yet.
 * READ cohorts can use the hybrid repository once the coexistence ruleset is
 * ready; PILOT writes remain fail-closed in planTripRepositoryRollout().
 */
export function createGateGTripRepository({
  db,
  uid,
  rolloutConfig,
  v3Factory = createFirestoreTripRepository,
  hybridFactory = createFirestoreHybridTripRepository,
} = {}) {
  if (!db) throw new TypeError('Se requiere una instancia de Firestore.');
  const ownerId = requiredText(uid, 'uid');
  if (typeof v3Factory !== 'function' || typeof hybridFactory !== 'function') {
    throw new TypeError('Los factories de repositorio deben ser funciones.');
  }

  const rollout = planTripRepositoryRollout({ uid: ownerId, rolloutConfig });
  const repository = rollout.repositoryMode === TRIP_REPOSITORY_ROLLOUT_MODE.HYBRID_READ
    ? hybridFactory({ db, uid: ownerId })
    : v3Factory({ db, uid: ownerId });

  return { repository, rollout };
}
