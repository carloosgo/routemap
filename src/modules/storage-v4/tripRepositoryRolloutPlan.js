import {
  STORAGE_V4_ROLLOUT_MODE,
  evaluateStorageV4Rollout,
} from './rolloutPolicy.js';

export const TRIP_REPOSITORY_ROLLOUT_MODE = Object.freeze({
  V3: 'v3',
  HYBRID_READ: 'hybrid-read',
  V4_PILOT: 'v4-pilot',
});

const PILOT_READINESS = Object.freeze([
  ['readRulesReady', 'read-rules-not-ready'],
  ['writeRulesReady', 'write-rules-not-ready'],
  ['syncReady', 'sync-not-ready'],
  ['aggregateReady', 'aggregate-not-ready'],
  ['lifecycleReady', 'lifecycle-not-ready'],
  ['purgeReady', 'purge-not-ready'],
]);

function basePlan(decision, repositoryMode, rolloutMode, reason) {
  return {
    repositoryMode,
    rolloutMode,
    bucket: decision.bucket,
    cohortPercent: decision.cohortPercent,
    reason,
  };
}

/**
 * Repository rollout remains fail-closed. READ only requires read rules. PILOT
 * additionally requires every write-side dependency because the app repository
 * exposes save() and remove() as one product contract; partial activation would
 * create a mode where some normal user actions silently lack a backend path.
 */
export function planTripRepositoryRollout({ uid, rolloutConfig } = {}) {
  const decision = evaluateStorageV4Rollout({ uid, config: rolloutConfig });

  if (!decision.enabled) {
    return basePlan(
      decision,
      TRIP_REPOSITORY_ROLLOUT_MODE.V3,
      STORAGE_V4_ROLLOUT_MODE.OFF,
      decision.reason
    );
  }

  if (decision.mode === STORAGE_V4_ROLLOUT_MODE.READ) {
    if (rolloutConfig?.readRulesReady !== true) {
      return basePlan(
        decision,
        TRIP_REPOSITORY_ROLLOUT_MODE.V3,
        STORAGE_V4_ROLLOUT_MODE.READ,
        'read-rules-not-ready'
      );
    }
    return basePlan(
      decision,
      TRIP_REPOSITORY_ROLLOUT_MODE.HYBRID_READ,
      STORAGE_V4_ROLLOUT_MODE.READ,
      'read-cohort'
    );
  }

  if (decision.mode === STORAGE_V4_ROLLOUT_MODE.PILOT) {
    for (const [field, reason] of PILOT_READINESS) {
      if (rolloutConfig?.[field] !== true) {
        return basePlan(
          decision,
          TRIP_REPOSITORY_ROLLOUT_MODE.V3,
          STORAGE_V4_ROLLOUT_MODE.PILOT,
          reason
        );
      }
    }
    return basePlan(
      decision,
      TRIP_REPOSITORY_ROLLOUT_MODE.V4_PILOT,
      STORAGE_V4_ROLLOUT_MODE.PILOT,
      'pilot-cohort'
    );
  }

  return basePlan(
    decision,
    TRIP_REPOSITORY_ROLLOUT_MODE.V3,
    STORAGE_V4_ROLLOUT_MODE.OFF,
    'unsupported-mode'
  );
}
