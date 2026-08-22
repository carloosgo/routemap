export const STORAGE_V4_ROLLOUT_MODE = Object.freeze({
  OFF: 'off',
  READ: 'read',
  PILOT: 'pilot',
});

export const DEFAULT_STORAGE_V4_ROLLOUT = Object.freeze({
  enabled: false,
  killSwitch: true,
  mode: STORAGE_V4_ROLLOUT_MODE.OFF,
  cohortPercent: 0,
  salt: 'atlas-storage-v4',
});

const VALID_MODES = new Set(Object.values(STORAGE_V4_ROLLOUT_MODE));

function normalizedUid(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedSalt(value) {
  const salt = typeof value === 'string' ? value.trim() : '';
  return salt || DEFAULT_STORAGE_V4_ROLLOUT.salt;
}

function validPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100
    ? number
    : null;
}

// FNV-1a 32-bit is intentionally used only for stable cohort assignment.
// It is not a security primitive and never grants backend authorization.
export function stableRolloutBucket(uid, salt = DEFAULT_STORAGE_V4_ROLLOUT.salt) {
  const userId = normalizedUid(uid);
  if (!userId) return null;
  const input = `${normalizedSalt(salt)}\u0000${userId}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 10_000;
}

export function normalizeStorageV4Rollout(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return { ...DEFAULT_STORAGE_V4_ROLLOUT };
  }

  const mode = VALID_MODES.has(rawConfig.mode)
    ? rawConfig.mode
    : STORAGE_V4_ROLLOUT_MODE.OFF;
  const cohortPercent = validPercent(rawConfig.cohortPercent);
  const enabled = rawConfig.enabled === true;
  const killSwitch = rawConfig.killSwitch !== false;

  if (!enabled || killSwitch || mode === STORAGE_V4_ROLLOUT_MODE.OFF || cohortPercent === null) {
    return {
      ...DEFAULT_STORAGE_V4_ROLLOUT,
      salt: normalizedSalt(rawConfig.salt),
    };
  }

  return {
    enabled: true,
    killSwitch: false,
    mode,
    cohortPercent,
    salt: normalizedSalt(rawConfig.salt),
  };
}

export function evaluateStorageV4Rollout({ uid, config } = {}) {
  const policy = normalizeStorageV4Rollout(config);
  const bucket = stableRolloutBucket(uid, policy.salt);
  if (bucket === null || !policy.enabled || policy.killSwitch) {
    return {
      enabled: false,
      mode: STORAGE_V4_ROLLOUT_MODE.OFF,
      bucket,
      cohortPercent: policy.cohortPercent,
      reason: bucket === null ? 'missing-uid' : 'disabled',
    };
  }

  const threshold = Math.floor(policy.cohortPercent * 100);
  const inCohort = bucket < threshold;
  return {
    enabled: inCohort,
    mode: inCohort ? policy.mode : STORAGE_V4_ROLLOUT_MODE.OFF,
    bucket,
    cohortPercent: policy.cohortPercent,
    reason: inCohort ? 'cohort' : 'outside-cohort',
  };
}
