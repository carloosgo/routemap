import {
  STORAGE_V4_ROLLOUT_MODE,
  evaluateStorageV4Rollout,
} from './rolloutPolicy.js';

export const TRIP_REPOSITORY_ROLLOUT_MODE = Object.freeze({
  V3: 'v3',
  HYBRID_READ: 'hybrid-read',
});

/**
 * Gate G starts with read coexistence only. The decision is deliberately pure:
 * it does not create repositories, change Firestore rules or enable v4 writes.
 *
 * PILOT remains fail-closed until the write path, lifecycle Functions and
 * rollout ruleset are activated together behind a separate gate.
 */
export function planTripRepositoryRollout({ uid, rolloutConfig } = {}) {
  const decision = evaluateStorageV4Rollout({ uid, config: rolloutConfig });

  if (!decision.enabled) {
    return {
      repositoryMode: TRIP_REPOSITORY_ROLLOUT_MODE.V3,
      rolloutMode: STORAGE_V4_ROLLOUT_MODE.OFF,
      bucket: decision.bucket,
      cohortPercent: decision.cohortPercent,
      reason: decision.reason,
    };
  }

  if (decision.mode === STORAGE_V4_ROLLOUT_MODE.READ) {
    return {
      repositoryMode: TRIP_REPOSITORY_ROLLOUT_MODE.HYBRID_READ,
      rolloutMode: STORAGE_V4_ROLLOUT_MODE.READ,
      bucket: decision.bucket,
      cohortPercent: decision.cohortPercent,
      reason: 'read-cohort',
    };
  }

  return {
    repositoryMode: TRIP_REPOSITORY_ROLLOUT_MODE.V3,
    rolloutMode: decision.mode,
    bucket: decision.bucket,
    cohortPercent: decision.cohortPercent,
    reason: 'pilot-write-not-enabled',
  };
}
