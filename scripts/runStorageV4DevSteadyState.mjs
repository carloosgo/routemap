/* global process, console */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStorageV4DevStageVerify } from './runStorageV4DevStageVerify.mjs';

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
  const readOnly = stage.mutatesCloud === false && stage.mutatesApplicationData === false;
  const backendReady = stage.backendReady === true;
  const rulesReady = stage?.rules?.matchesCandidate === true;
  const eventarcReady = stage?.eventarc?.ready === true;
  const staged = stage.staged === true;

  return Object.freeze({
    projectIsDev,
    productionUntouched,
    readOnly,
    backendReady,
    rulesReady,
    eventarcReady,
    staged,
    pass: projectIsDev
      && productionUntouched
      && readOnly
      && backendReady
      && rulesReady
      && eventarcReady
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
  verifyStage = runStorageV4DevStageVerify,
  runCloudCheckpoint = runPhaseKCheckpoint,
  log = (value) => console.log(value),
} = {}) {
  parseDevSteadyStateArgs(args);

  log(JSON.stringify({
    project: DEV_STEADY_STATE_PROJECT,
    mode: 'development-steady-state-preflight',
    purpose: 'verify canonical v4 dev infrastructure before continued feature development',
    productionProject: DEV_STEADY_STATE_PRODUCTION_PROJECT,
    checks: [
      'dev Functions active in canonical regions',
      'dev Eventarc triggers target the canonical v4 ingress',
      'dev Firestore Rules match firestore.rules exactly',
      'Phase K recovery/billing/telemetry/SLO/monitoring/restore-readiness checkpoint',
    ],
    mutatesCloud: false,
    mutatesApplicationData: false,
    touchesProduction: false,
  }, null, 2));

  const stage = await verifyStage();
  const assessment = assessDevStage(stage);
  log(JSON.stringify({ stageAssessment: assessment }, null, 2));
  if (!assessment.pass) {
    throw new Error('Dev steady-state bloqueado: el stage real de atlasmap-dev no cumple el baseline v4 canónico esperado.');
  }

  await runCloudCheckpoint();

  const result = Object.freeze({
    project: DEV_STEADY_STATE_PROJECT,
    pass: true,
    realCloudDevInfrastructureReady: true,
    canonicalV4StageReady: true,
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
