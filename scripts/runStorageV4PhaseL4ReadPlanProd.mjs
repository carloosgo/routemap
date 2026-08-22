/* global process, console */

const PROJECT = 'atlasmap-prod';
const CONFIRMATION_FORBIDDEN = '--apply';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parsePercent(raw) {
  if (!raw) fail('Falta --cohort-percent. L4 no tiene porcentaje default deliberadamente.', 2);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    fail('--cohort-percent debe ser > 0 y <= 100.', 2);
  }
  return value;
}

function parseArgs(args = []) {
  let cohortRaw = '';
  for (const arg of args) {
    if (arg === CONFIRMATION_FORBIDDEN || arg.startsWith('--confirm=')) {
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
    phase: 'L4',
    operation: 'production-read-rollout-plan',
    mode: 'plan',
    project: PROJECT,
    mutatesCloud: false,
    deploysRules: false,
    publishesRemoteConfig: false,
    deploysFunctions: false,
    enablesStorageV4Read: false,
    enablesStorageV4Write: false,
    migratesTrips: false,
    requestedCohortPercent: cohortPercent,
    requiredPrerequisites: [
      'L2 recovery/cost PASS',
      'L3 App Check observation ready',
      'production READ rules candidate generated and tested',
      'Remote Config production fail-closed and realtime verified',
      'rollout telemetry deployed and privacy-verified',
      'rollback path verified before first cohort',
    ],
    targetRemoteConfig: {
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
    rollbackRemoteConfig: {
      storage_v4_enabled: false,
      storage_v4_kill_switch: true,
      storage_v4_mode: 'off',
      storage_v4_cohort_percent: 0,
      storage_v4_read_rules_ready: false,
    },
    stopConditions: [
      'material permission-denied increase',
      'trip list disappearance or schema mismatch',
      'unexpected direct client v4 write',
      'material latency/error regression',
      'PII or trip content in telemetry',
      'Remote Config realtime rollback channel unavailable',
    ],
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = error?.exitCode || 1;
}
