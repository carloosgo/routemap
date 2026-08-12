import { createFirestoreHybridTripRepository } from './firestoreHybridTripRepository.js';
import { createFirestoreTripRepository } from './firestoreTripRepository.js';
import { createFirestoreV4PilotTripWriter } from './firestoreV4PilotTripWriter.js';
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
 * Storage v4 repository factory. Policy remains fail-closed by default:
 * - v3: legacy repository only;
 * - hybrid-read: v4 can be hydrated but writes remain disabled;
 * - v4-pilot: only selected after every write-side readiness flag is true.
 */
export function createGateGTripRepository({
  db,
  uid,
  rolloutConfig,
  emitTelemetry = null,
  now = () => Date.now(),
  v3Factory = createFirestoreTripRepository,
  hybridFactory = createFirestoreHybridTripRepository,
  pilotWriterFactory = createFirestoreV4PilotTripWriter,
} = {}) {
  if (!db) throw new TypeError('Se requiere una instancia de Firestore.');
  const ownerId = requiredText(uid, 'uid');
  if (
    typeof v3Factory !== 'function'
    || typeof hybridFactory !== 'function'
    || typeof pilotWriterFactory !== 'function'
  ) {
    throw new TypeError('Los factories de repositorio deben ser funciones.');
  }
  if (emitTelemetry !== null && typeof emitTelemetry !== 'function') {
    throw new TypeError('emitTelemetry debe ser función o null.');
  }

  const rollout = planTripRepositoryRollout({ uid: ownerId, rolloutConfig });
  let baseRepository;
  if (rollout.repositoryMode === TRIP_REPOSITORY_ROLLOUT_MODE.V4_PILOT) {
    const writer = pilotWriterFactory({
      db,
      uid: ownerId,
      telemetryEnabled: rolloutConfig?.telemetryEnabled === true,
      lifecycleReady: rolloutConfig?.lifecycleReady === true,
      now,
    });
    baseRepository = hybridFactory({ db, uid: ownerId, v4Writer: writer });
  } else if (rollout.repositoryMode === TRIP_REPOSITORY_ROLLOUT_MODE.HYBRID_READ) {
    baseRepository = hybridFactory({ db, uid: ownerId });
  } else {
    baseRepository = v3Factory({ db, uid: ownerId });
  }

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
