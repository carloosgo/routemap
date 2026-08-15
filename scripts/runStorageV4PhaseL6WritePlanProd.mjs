/* global process, console */

const PROJECT = 'atlasmap-prod';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parsePercent(raw) {
  if (!raw) fail('Falta --cohort-percent. L6 no tiene porcentaje default deliberadamente.', 2);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    fail('--cohort-percent debe ser > 0 y <= 100.', 2);
  }
  return value;
}

function parseArgs(args = []) {
  let cohortRaw = '';
  for (const arg of args) {
    if (arg === '--apply' || arg.startsWith('--confirm=')) {
      fail('Este runner es plan-only y nunca admite --apply/--confirm.', 2);
    }
    if (arg.startsWith('--cohort-percent=')) {
      cohortRaw = arg.slice('--cohort-percent='.length).trim();
      continue;
    }
    fail(`Argumento desconocido: ${arg}`, 2);
  }
  return { cohortPercent: parsePercent(cohortRaw) };
}

function main() {
  const { cohortPercent } = parseArgs(process.argv.slice(2));

  console.log(JSON.stringify({
    phase: 'L6',
    operation: 'production-write-rollout-plan',
    mode: 'plan',
    project: PROJECT,
    requestedCohortPercent: cohortPercent,
    mutatesCloud: false,
    deploysFunctions: false,
    deploysRules: false,
    publishesRemoteConfig: false,
    enablesStorageV4Write: false,
    changesCanonicalSource: false,
    requiredPrerequisites: [
      'L5 materialization/verificación PASS',
      'production v4 write Rules generated and tested',
      'sync/aggregate/lifecycle/purge backend deployed and independently verified',
      'Remote Config kill-switch realtime verified',
      'telemetry/alerts operational',
      'multi-device conflict behavior sampled with real clients or explicitly waived',
      'rollback to read/v3 path documented and executable',
    ],
    targetRemoteConfig: {
      storage_v4_enabled: true,
      storage_v4_kill_switch: false,
      storage_v4_mode: 'pilot',
      storage_v4_cohort_percent: cohortPercent,
      storage_v4_read_rules_ready: true,
      storage_v4_write_rules_ready: true,
      storage_v4_sync_ready: true,
      storage_v4_aggregate_ready: true,
      storage_v4_touch_ready: true,
      storage_v4_lifecycle_ready: true,
      storage_v4_purge_ready: true,
    },
    rollbackRemoteConfig: {
      storage_v4_enabled: true,
      storage_v4_kill_switch: false,
      storage_v4_mode: 'read',
      storage_v4_cohort_percent: cohortPercent,
      storage_v4_read_rules_ready: true,
      storage_v4_write_rules_ready: false,
      storage_v4_sync_ready: false,
      storage_v4_aggregate_ready: false,
      storage_v4_touch_ready: false,
      storage_v4_lifecycle_ready: false,
      storage_v4_purge_ready: false,
    },
    emergencyKillSwitch: {
      storage_v4_enabled: false,
      storage_v4_kill_switch: true,
      storage_v4_mode: 'off',
      storage_v4_cohort_percent: 0,
    },
    writeAcceptance: {
      cloudMutationWithin30sTarget: 0.995,
      repositoryUnexpectedErrorFreeTarget: 0.995,
      silentDataLossAllowed: 0,
      protectedDirectClientV4WritesAllowed: 0,
      telemetryPiiAllowed: 0,
    },
    stopConditions: [
      'silent data loss or divergent canonical state',
      'conflict resolution violates entity-level contract',
      'unexpected direct client write outside allowed Rules path',
      'lifecycle/purge inconsistency',
      'material write latency/error regression',
      'rollback channel unavailable',
      'PII or trip content in telemetry',
    ],
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = error?.exitCode || 1;
}
