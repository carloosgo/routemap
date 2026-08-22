/* global process, console */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPilotStageVerifyDev } from './runStorageV4PilotStageVerifyDev.mjs';

export const DEV_STEADY_STATE_PROJECT = 'atlasmap-dev';
export const DEV_STEADY_STATE_PRODUCTION_PROJECT = 'atlasmap-prod';

const here = dirname(fileURLToPath(import.meta.url));
const phaseKCheckpoint = join(here, 'runStorageV4PhaseKCloudCheckpoint.mjs');

export function parseDevSteadyStateArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  if (args.length > 0) {
    throw new TypeError('Este preflight es read-only y no admite argumentos, --apply ni --confirm.');
  }
  return Object.freeze({});
}

export function assessDevStage(stage) {
  if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
    throw new TypeError('stage es obligatorio.');
  }

  const projectIsDev = stage.project === DEV_STEADY_STATE_PROJECT;
  const productionUntouched = stage.touchesProduction === false;
  const readOnly = stage.mutatesCloud === false
    && stage.mutatesApplicationData === false
    && stage.changesRemoteConfig === false
    && stage.activatesClientPilotTraffic === false;
  const backendReady = stage.backendReady === true;
  const rulesReady = stage?.rules?.matchesCandidate === true;
  const eventarcReady = stage?.eventarc?.ready === true;
  const remoteConfigSafeOff = stage?.remoteConfig?.safeForStage === true
    && stage?.remoteConfig?.pilotTrafficActivated === false;
  const staged = stage.staged === true;

  return Object.freeze({
    projectIsDev,
    productionUntouched,
    readOnly,
    backendReady,
    rulesReady,
    eventarcReady,
    remoteConfigSafeOff,
    staged,
    pass: projectIsDev
      && productionUntouched
      && readOnly
      && backendReady
      && rulesReady
      && eventarcReady
      && remoteConfigSafeOff
      && staged,
  });
}

function runPhaseKCheckpoint() {
  const result = spawnSync(process.execPath, [phaseKCheckpoint], {
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Phase K cloud checkpoint falló con código ${result.status ?? 1}.`);
  }
  return true;
}

export async function runStorageV4DevSteadyState({
  args = process.argv.slice(2),
  verifyStage = runPilotStageVerifyDev,
  runCloudCheckpoint = runPhaseKCheckpoint,
  log = (value) => console.log(value),
} = {}) {
  parseDevSteadyStateArgs(args);

  log(JSON.stringify({
    project: DEV_STEADY_STATE_PROJECT,
    mode: 'development-steady-state-preflight',
    purpose: 'verify real dev infrastructure before continued feature development',
    productionProject: DEV_STEADY_STATE_PRODUCTION_PROJECT,
    productionRolloutFrozen: true,
    productionStorageV4ReadWriteFrozen: true,
    checks: [
      'dev Functions + Eventarc active and correctly staged',
      'dev Firestore Rules match the approved v4 pilot candidate',
      'dev Remote Config is fail-closed before a new development block',
      'Phase K recovery/billing/telemetry/SLO/monitoring/restore-readiness checkpoint',
    ],
    mutatesCloud: false,
    mutatesApplicationData: false,
    changesRemoteConfig: false,
    activatesClientPilotTraffic: false,
    touchesProduction: false,
  }, null, 2));

  const stage = await verifyStage();
  const assessment = assessDevStage(stage);
  log(JSON.stringify({ stageAssessment: assessment }, null, 2));
  if (!assessment.pass) {
    throw new Error('Dev steady-state bloqueado: el stage real de atlasmap-dev no cumple el baseline seguro esperado.');
  }

  await runCloudCheckpoint();

  const result = Object.freeze({
    project: DEV_STEADY_STATE_PROJECT,
    pass: true,
    realCloudDevInfrastructureReady: true,
    remoteConfigSafeOff: true,
    productionRolloutFrozen: true,
    productionMutated: false,
    storageV4ProductionReadWriteChanged: false,
    next: 'continue feature development and integration against atlasmap-dev',
  });
  log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevSteadyState().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
