const REMOTE_MODE = Object.freeze({
  OFF: 'off',
  READ: 'read',
});

export const GATE_G_REMOTE_KEYS = Object.freeze({
  enabled: 'storage_v4_enabled',
  killSwitch: 'storage_v4_kill_switch',
  mode: 'storage_v4_mode',
  cohortPercent: 'storage_v4_cohort_percent',
  readRulesReady: 'storage_v4_read_rules_ready',
});

function safeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeMode(value) {
  return value === REMOTE_MODE.READ ? REMOTE_MODE.READ : REMOTE_MODE.OFF;
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
  };

  if (
    !next.enabled
    || next.killSwitch
    || next.mode !== REMOTE_MODE.READ
    || !next.readRulesReady
    || next.cohortPercent <= 0
  ) {
    return failClosedRolloutConfig(next);
  }

  return next;
}
