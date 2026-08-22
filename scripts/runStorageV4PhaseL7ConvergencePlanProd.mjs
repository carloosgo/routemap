/* global process, console */

const PROJECT = 'atlasmap-prod';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(args = []) {
  let canonicalPercentRaw = '';
  let retireV3 = false;
  for (const arg of args) {
    if (arg.startsWith('--canonical-percent=')) canonicalPercentRaw = arg.slice('--canonical-percent='.length).trim();
    else if (arg === '--retire-v3') retireV3 = true;
    else if (arg === '--apply' || arg.startsWith('--confirm=')) fail('Este runner de L7 es plan-only y no admite --apply/--confirm.', 2);
    else fail(`Argumento desconocido: ${arg}`, 2);
  }
  if (!canonicalPercentRaw) fail('Falta --canonical-percent. No existe porcentaje default deliberadamente.', 2);
  const canonicalPercent = Number(canonicalPercentRaw);
  if (!Number.isFinite(canonicalPercent) || canonicalPercent <= 0 || canonicalPercent > 100) {
    fail('--canonical-percent debe ser > 0 y <= 100.', 2);
  }
  if (retireV3 && canonicalPercent !== 100) {
    fail('--retire-v3 solo puede planearse cuando --canonical-percent=100.', 2);
  }
  return { canonicalPercent, retireV3 };
}

function main() {
  const { canonicalPercent, retireV3 } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({
    phase: 'L7',
    operation: 'plan-production-convergence',
    mode: 'plan-only',
    project: PROJECT,
    requestedCanonicalV4Percent: canonicalPercent,
    requestsV3Retirement: retireV3,
    prerequisites: {
      l2RecoveryAndCostPass: true,
      l3AppCheckObservationPass: true,
      l4ReadRolloutStable: true,
      l5MaterializationVerified: true,
      l6WriteRolloutStable: true,
      zeroSilentDataLoss: true,
      noCrossUserIsolationFailures: true,
      deleteRemainsUserIrreversible: true,
      rollbackWindowStillDefinedBeforeV3Retirement: true,
    },
    convergenceChecks: {
      noPermanentDualWrite: true,
      noUnknownSchemaReads: true,
      noUnresolvedMigrationDigests: true,
      aggregatesConsistent: true,
      lifecycleAndPurgeStable: true,
      conflictRateWithinAcceptedBaseline: true,
      latencyAndErrorSloPass: true,
      billingWithinApprovedForecast: true,
    },
    v3RetirementGate: retireV3 ? {
      requiresCanonicalV4Percent: 100,
      requiresExplicitRetirementWindow: true,
      requiresNoActiveClientsDependingOnV3: true,
      requiresFinalBackupBeforeRetirement: true,
      requiresRollbackProcedureDocumented: true,
      allowsUserTripRestore: false,
    } : null,
    mutatesCloud: false,
    mutatesApplicationData: false,
    changesRules: false,
    changesRemoteConfig: false,
    deploysFunctions: false,
    enablesStorageV4Read: false,
    enablesStorageV4Write: false,
    retiresV3: false,
  }, null, 2));
}

try { main(); }
catch (error) {
  console.error(error?.message || error);
  process.exitCode = error?.exitCode || 1;
}
