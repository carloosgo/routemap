import { createFirestoreHybridTripRepository } from './firestoreHybridTripRepository.js';
import { createFirestoreTripRepository } from './firestoreTripRepository.js';
import {
  TRIP_REPOSITORY_ROLLOUT_MODE,
  planTripRepositoryRollout,
} from '../../modules/storage-v4/tripRepositoryRolloutPlan.js';
import { createObservedTripRepository } from '../../modules/storage-v4/rolloutRepositoryTelemetry.js';

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
  emitTelemetry = null,
  now = () => Date.now(),
  v3Factory = createFirestoreTripRepository,
  hybridFactory = createFirestoreHybridTripRepository,
} = {}) {
  if (!db) throw new TypeError('Se requiere una instancia de Firestore.');
  const ownerId = requiredText(uid, 'uid');
  if (typeof v3Factory !== 'function' || typeof hybridFactory !== 'function') {
    throw new TypeError('Los factories de repositorio deben ser funciones.');
  }
  if (emitTelemetry !== null && typeof emitTelemetry !== 'function') {
    throw new TypeError('emitTelemetry debe ser función o null.');
  }

  const rollout = planTripRepositoryRollout({ uid: ownerId, rolloutConfig });
  const baseRepository = rollout.repositoryMode === TRIP_REPOSITORY_ROLLOUT_MODE.HYBRID_READ
    ? hybridFactory({ db, uid: ownerId })
    : v3Factory({ db, uid: ownerId });
  const repository = emitTelemetry
    ? createObservedTripRepository({
      repository: baseRepository,
      repositoryMode: rollout.repositoryMode,
      emit: emitTelemetry,
      now,
    })
    : baseRepository;

  return { repository, rollout };
}
