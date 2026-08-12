const REMOTE_MODE = Object.freeze({
  OFF: 'off',
  READ: 'read',
  PILOT: 'pilot',
});

export const GATE_G_REMOTE_KEYS = Object.freeze({
  enabled: 'storage_v4_enabled',
  killSwitch: 'storage_v4_kill_switch',
  mode: 'storage_v4_mode',
  cohortPercent: 'storage_v4_cohort_percent',
  readRulesReady: 'storage_v4_read_rules_ready',
  writeRulesReady: 'storage_v4_write_rules_ready',
  syncReady: 'storage_v4_sync_ready',
  aggregateReady: 'storage_v4_aggregate_ready',
  lifecycleReady: 'storage_v4_lifecycle_ready',
  purgeReady: 'storage_v4_purge_ready',
});

const PILOT_READY_FIELDS = Object.freeze([
  'readRulesReady',
  'writeRulesReady',
  'syncReady',
  'aggregateReady',
  'lifecycleReady',
  'purgeReady',
]);

function safeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeMode(value) {
  return value === REMOTE_MODE.READ || value === REMOTE_MODE.PILOT
    ? value
    : REMOTE_MODE.OFF;
}

function safePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

export function failClosedRolloutConfig(base = {}) {
  return {
    ...base,
    enabled: false,
    killSwitch: true,
    mode: 'off',
    cohortPercent: 0,
    readRulesReady: false,
    writeRulesReady: false,
    syncReady: false,
    aggregateReady: false,
    lifecycleReady: false,
    purgeReady: false,
  };
}

export function normalizeRemoteRolloutConfig({ base = {}, remote = {} } = {}) {
  const next = {
    ...base,
    enabled: safeBoolean(remote.enabled, false),
    killSwitch: safeBoolean(remote.killSwitch, true),
    mode: safeMode(remote.mode),
    cohortPercent: safePercent(remote.cohortPercent),
    readRulesReady: safeBoolean(remote.readRulesReady, false),
    writeRulesReady: safeBoolean(remote.writeRulesReady, false),
    syncReady: safeBoolean(remote.syncReady, false),
    aggregateReady: safeBoolean(remote.aggregateReady, false),
    lifecycleReady: safeBoolean(remote.lifecycleReady, false),
    purgeReady: safeBoolean(remote.purgeReady, false),
  };

  if (
    !next.enabled
    || next.killSwitch
    || next.mode === REMOTE_MODE.OFF
    || next.cohortPercent <= 0
    || !next.readRulesReady
  ) {
    return failClosedRolloutConfig(next);
  }

  if (
    next.mode === REMOTE_MODE.PILOT
    && PILOT_READY_FIELDS.some((field) => next[field] !== true)
  ) {
    return failClosedRolloutConfig(next);
  }

  return next;
}
