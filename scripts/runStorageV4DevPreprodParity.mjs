/* global process, console */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPilotStageVerifyDev } from './runStorageV4PilotStageVerifyDev.mjs';

export const DEV_PREPROD_PROJECT = 'atlasmap-dev';
export const DEV_PREPROD_PRODUCTION_PROJECT = 'atlasmap-prod';

const here = dirname(fileURLToPath(import.meta.url));
const phaseKCheckpoint = join(here, 'runStorageV4PhaseKCloudCheckpoint.mjs');

export function parseDevPreprodParityArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  if (args.length > 0) {
    throw new TypeError('Este preflight de paridad es read-only y no admite argumentos, --apply ni --confirm.');
  }
  return Object.freeze({});
}

function controlledPilot(remoteConfig = {}) {
  const cohortPercent = Number(remoteConfig.cohortPercent);
  return remoteConfig.enabled === 'true'
    && remoteConfig.killSwitch === 'false'
    && remoteConfig.mode === 'pilot'
    && Number.isFinite(cohortPercent)
    && cohortPercent > 0
    && cohortPercent <= 100;
}

function readinessCandidatesReady(readinessCandidates = {}) {
  const values = Object.values(readinessCandidates);
  return values.length > 0 && values.every((value) => value === true);
}

export function classifyDevRemoteConfig(stage = {}) {
  const remoteConfig = stage.remoteConfig || {};
  const safeOff = remoteConfig.safeForStage === true
    && remoteConfig.pilotTrafficActivated === false;
  const pilot = controlledPilot(remoteConfig);
  return Object.freeze({
    mode: safeOff ? 'fail-closed' : (pilot ? 'controlled-pilot' : 'invalid'),
    safeOff,
    controlledPilot: pilot,
    cohortPercent: pilot ? Number(remoteConfig.cohortPercent) : 0,
    acceptableForPreprod: safeOff || pilot,
  });
}

export function assessDevPreprodStage(stage) {
  if (!stage || typeof stage !== 'object' || Array.isArray(stage)) {
    throw new TypeError('stage es obligatorio.');
  }

  const remoteConfig = classifyDevRemoteConfig(stage);
  const projectIsDev = stage.project === DEV_PREPROD_PROJECT;
  const productionUntouched = stage.touchesProduction === false;
  const readOnly = stage.mutatesCloud === false
    && stage.mutatesApplicationData === false
    && stage.changesRemoteConfig === false
    && stage.activatesClientPilotTraffic === false;
  const backendReady = stage.backendReady === true;
  const rulesReady = stage?.rules?.matchesCandidate === true;
  const eventarcReady = stage?.eventarc?.ready === true;
  const readinessReady = readinessCandidatesReady(stage.readinessCandidates);
  const stageStateAcceptable = remoteConfig.safeOff ? stage.staged === true : remoteConfig.controlledPilot;

  return Object.freeze({
    projectIsDev,
    productionUntouched,
    readOnly,
    backendReady,
    rulesReady,
    eventarcReady,
    readinessReady,
    remoteConfig,
    stageStateAcceptable,
    pass: projectIsDev
      && productionUntouched
      && readOnly
      && backendReady
      && rulesReady
      && eventarcReady
      && readinessReady
      && remoteConfig.acceptableForPreprod
      && stageStateAcceptable,
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

export async function runStorageV4DevPreprodParity({
  args = process.argv.slice(2),
  verifyStage = runPilotStageVerifyDev,
  runCloudCheckpoint = runPhaseKCheckpoint,
  log = (value) => console.log(value),
} = {}) {
  parseDevPreprodParityArgs(args);

  log(JSON.stringify({
    project: DEV_PREPROD_PROJECT,
    mode: 'development-preproduction-parity-preflight',
    purpose: 'verify production-like real cloud infrastructure in atlasmap-dev while production rollout remains frozen',
    productionProject: DEV_PREPROD_PRODUCTION_PROJECT,
    acceptsRemoteConfigStates: ['fail-closed', 'controlled-pilot'],
    requiresCoreRuntimeParity: true,
    runsPhaseKOperationalCheckpoint: true,
    mutatesCloud: false,
    mutatesApplicationData: false,
    changesRemoteConfig: false,
    touchesProduction: false,
  }, null, 2));

  const stage = await verifyStage();
  const assessment = assessDevPreprodStage(stage);
  log(JSON.stringify({ stageAssessment: assessment }, null, 2));
  if (!assessment.pass) {
    throw new Error('Dev preprod parity bloqueado: atlasmap-dev presenta drift o un estado Remote Config no controlado.');
  }

  await runCloudCheckpoint();

  const result = Object.freeze({
    project: DEV_PREPROD_PROJECT,
    pass: true,
    coreRuntimeParityReady: true,
    remoteConfigMode: assessment.remoteConfig.mode,
    remoteConfigCohortPercent: assessment.remoteConfig.cohortPercent,
    phaseKOperationalCheckpointPass: true,
    productionRolloutFrozen: true,
    productionMutated: false,
    next: 'review remaining dev-to-production infrastructure parity gaps without using atlasmap-prod for feature development',
  });
  log(JSON.stringify(result, null, 2));
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevPreprodParity().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
