/* global process, console */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILOT_EVENTARC_IAM_PROJECT,
  PILOT_EVENTARC_SERVICE_ACCOUNT,
  PILOT_EVENTARC_SERVICE_ACCOUNT_ID,
  PILOT_EVENTARC_RECEIVER_ROLE,
  PILOT_EVENTARC_INVOKER_ROLE,
  runStorageV4PilotEventarcIamPreflightDev,
} from './runStorageV4PilotEventarcIamPreflightDev.mjs';
import { resolveGcloud } from './storageV4RemoteConfigRestDev.mjs';

export const PILOT_EVENTARC_IAM_BOOTSTRAP_CONFIRM = 'APPLY-ATLAS-V4-EVENTARC-IAM-DEV';
export const PILOT_EVENTARC_INGRESS_SERVICE = 'v4firestoreeventingress';
export const PILOT_EVENTARC_INGRESS_REGION = 'us-central1';

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable?.toLowerCase().endsWith('.cmd')) {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', executable, ...args], options);
  }
  return spawnSync(executable, args, options);
}

function runGcloud(gcloud, args, label) {
  const result = runProcess(gcloud, args);
  if (result.error || result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    throw new Error(`${label} falló${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : '.'}`);
  }
  return String(result.stdout || '').trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const apply = argv.includes('--apply');
  const confirmationArg = argv.find((value) => value.startsWith('--confirm='));
  const confirmation = confirmationArg ? confirmationArg.slice('--confirm='.length) : '';
  return { apply, confirmation };
}

function assertActiveProject(gcloud) {
  const project = runGcloud(gcloud, ['config', 'get-value', 'project'], 'gcloud project');
  if (project !== PILOT_EVENTARC_IAM_PROJECT) {
    throw new Error(`gcloud apunta a ${project || '(vacío)'}, se requiere ${PILOT_EVENTARC_IAM_PROJECT}.`);
  }
}

function bootstrapPlan(preflight, applyRequested) {
  return Object.freeze({
    project: PILOT_EVENTARC_IAM_PROJECT,
    mode: 'eventarc-iam-bootstrap-plan',
    serviceAccount: PILOT_EVENTARC_SERVICE_ACCOUNT,
    serviceAccountExists: preflight.serviceAccount.exists,
    baseStageReady: preflight.baseStageReady,
    collidingTriggers: [...preflight.triggers.collidingNames],
    exactLeastPrivilegeReady: preflight.serviceAccount.exactLeastPrivilegeReady,
    mutations: Object.freeze({
      createServiceAccountIfMissing: true,
      grantEventReceiverOnProjectIfMissing: true,
      grantRunInvokerOnIngressIfMissing: true,
      grantCallerActAsAutomatically: false,
      createEventarcTriggers: false,
      changeRemoteConfig: false,
      changeFirestoreRules: false,
      mutateApplicationData: false,
      touchProduction: false,
    }),
    applyRequested,
    confirmationRequired: PILOT_EVENTARC_IAM_BOOTSTRAP_CONFIRM,
  });
}

export async function runStorageV4PilotEventarcIamBootstrapDev({
  argv = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
} = {}) {
  if (!gcloud) throw new Error('No se encontró una instalación utilizable de gcloud.');
  assertActiveProject(gcloud);
  const { apply, confirmation } = parseArgs(argv);
  const before = await runStorageV4PilotEventarcIamPreflightDev({ gcloud, log: () => {} });
  const plan = bootstrapPlan(before, apply);
  log(JSON.stringify(plan, null, 2));

  if (!before.baseStageReady) {
    throw new Error('El stage base dejó de estar listo; no se permite modificar IAM.');
  }
  if (before.triggers.collidingNames.length > 0) {
    throw new Error('Existen triggers Eventarc con nombres reservados; no se permite modificar IAM.');
  }
  if (!apply) {
    log('Dry-run: IAM no fue modificado.');
    return plan;
  }
  if (confirmation !== PILOT_EVENTARC_IAM_BOOTSTRAP_CONFIRM) {
    throw new Error(`Confirmación inválida. Usa --confirm=${PILOT_EVENTARC_IAM_BOOTSTRAP_CONFIRM}.`);
  }

  const member = `serviceAccount:${PILOT_EVENTARC_SERVICE_ACCOUNT}`;
  if (!before.serviceAccount.exists) {
    runGcloud(gcloud, [
      'iam', 'service-accounts', 'create', PILOT_EVENTARC_SERVICE_ACCOUNT_ID,
      '--project', PILOT_EVENTARC_IAM_PROJECT,
      '--display-name', 'Atlas v4 Eventarc',
      '--description', 'Least-privilege identity for Atlas Storage v4 Firestore Eventarc triggers',
      '--quiet',
    ], 'Crear service account Eventarc');
  }

  if (!before.serviceAccount.eventReceiverReady) {
    runGcloud(gcloud, [
      'projects', 'add-iam-policy-binding', PILOT_EVENTARC_IAM_PROJECT,
      '--member', member,
      '--role', PILOT_EVENTARC_RECEIVER_ROLE,
      '--condition=None',
      '--quiet',
    ], 'Conceder Eventarc Event Receiver');
  }

  if (!before.serviceAccount.runInvokerAtService) {
    runGcloud(gcloud, [
      'run', 'services', 'add-iam-policy-binding', PILOT_EVENTARC_INGRESS_SERVICE,
      '--project', PILOT_EVENTARC_IAM_PROJECT,
      '--region', PILOT_EVENTARC_INGRESS_REGION,
      '--member', member,
      '--role', PILOT_EVENTARC_INVOKER_ROLE,
      '--condition=None',
      '--quiet',
    ], 'Conceder Cloud Run Invoker en ingress');
  }

  const after = await runStorageV4PilotEventarcIamPreflightDev({ gcloud, log: () => {} });
  const result = Object.freeze({
    project: PILOT_EVENTARC_IAM_PROJECT,
    mode: 'eventarc-iam-bootstrap-applied',
    serviceAccount: PILOT_EVENTARC_SERVICE_ACCOUNT,
    serviceAccountExists: after.serviceAccount.exists,
    eventReceiverReady: after.serviceAccount.eventReceiverReady,
    runInvokerAtService: after.serviceAccount.runInvokerAtService,
    callerCanActAs: after.serviceAccount.callerCanActAs,
    exactLeastPrivilegeReady: after.serviceAccount.exactLeastPrivilegeReady,
    eventarcCreationReady: after.eventarcCreationReady,
    callerActAsGrantNeeded: !after.serviceAccount.callerCanActAs,
    callerActAsGrantedAutomatically: false,
    createdEventarcTriggers: false,
    changedRemoteConfig: false,
    changedFirestoreRules: false,
    mutatedApplicationData: false,
    touchedProduction: false,
  });
  log(JSON.stringify(result, null, 2));
  if (!after.serviceAccount.eventReceiverReady || !after.serviceAccount.runInvokerAtService) {
    process.exitCode = 2;
  }
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4PilotEventarcIamBootstrapDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
