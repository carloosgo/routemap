/* global process, console */

const PROJECT = 'atlasmap-prod';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseCount(raw) {
  if (!raw) fail('Falta --trip-count. L5 no tiene tamaño de muestra default deliberadamente.', 2);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    fail('--trip-count debe ser un entero entre 1 y 1000.', 2);
  }
  return value;
}

function parseArgs(args = []) {
  let countRaw = '';
  for (const arg of args) {
    if (arg === '--apply' || arg.startsWith('--confirm=')) {
      fail('Este runner es plan-only y nunca admite --apply/--confirm.', 2);
    }
    if (arg.startsWith('--trip-count=')) {
      countRaw = arg.slice('--trip-count='.length).trim();
      continue;
    }
    fail(`Argumento desconocido: ${arg}`, 2);
  }
  return { tripCount: parseCount(countRaw) };
}

function main() {
  const { tripCount } = parseArgs(process.argv.slice(2));

  console.log(JSON.stringify({
    phase: 'L5',
    operation: 'production-materialization-plan',
    mode: 'plan',
    project: PROJECT,
    requestedTripCount: tripCount,
    mutatesCloud: false,
    materializesTrips: false,
    changesCanonicalSource: false,
    enablesStorageV4Write: false,
    enablesDualWrite: false,
    deletesV3Data: false,
    requiredPrerequisites: [
      'L4 READ cohort stable and rollback verified',
      'L2 recovery and restore evidence PASS',
      'selected trips have immutable preflight digest before materialization',
      'v3 remains canonical during L5',
      'verification compares materialized v4 against source v3',
      'rollback/rematerialization procedure remains available to operators',
    ],
    perTripSafetyContract: {
      preflightRequired: true,
      expectedDigestRequiredBeforeApply: true,
      targetSchemaVersion: 4,
      idempotentReplayRequired: true,
      canonicalSourceDuringPhase: 'v3',
      publicTripRestoreApiAllowed: false,
      userDeleteSemanticsChanged: false,
    },
    verificationRequirements: [
      'root summary matches materialized source contract',
      'segment/place/connection/note/checklist entity counts match',
      'digest equals approved preflight digest',
      'no unexpected schema/version observed',
      'no source v3 mutation caused by verification',
      'no user-facing canonical switch',
    ],
    stopConditions: [
      'digest mismatch',
      'entity-count mismatch',
      'unexpected overwrite of existing v4 state',
      'v3 source mutation',
      'materialization changes user-visible canonical behavior',
      'silent verification failure',
    ],
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = error?.exitCode || 1;
}
