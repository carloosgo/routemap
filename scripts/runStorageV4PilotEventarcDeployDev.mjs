/* global process, console */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V4_PILOT_EVENTARC_REGION,
  V4_PILOT_EVENTARC_TRIGGERS,
  V4_PILOT_SERVICE_REGION,
} from '../functions/v4PilotBackendManifest.js';
import {
  PILOT_EVENTARC_IAM_PROJECT,
  PILOT_EVENTARC_SERVICE_ACCOUNT,
  runStorageV4PilotEventarcIamPreflightDev,
} from './runStorageV4PilotEventarcIamPreflightDev.mjs';
import { resolveGcloud } from './storageV4RemoteConfigRestDev.mjs';

export const PILOT_EVENTARC_DEPLOY_CONFIRM = 'CREATE-ATLAS-V4-EVENTARC-TRIGGERS-DEV';
export const PILOT_EVENTARC_DESTINATION_SERVICE = 'v4firestoreeventingress';
export const PILOT_EVENTARC_EVENT_TYPE = 'google.cloud.firestore.document.v1.written';
export const PILOT_EVENTARC_DATABASE = '(default)';
export const PILOT_EVENTARC_CONTENT_TYPE = 'application/protobuf';

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
  return {
    apply,
    confirmation: confirmationArg ? confirmationArg.slice('--confirm='.length) : '',
  };
}

function assertActiveProject(gcloud) {
  const project = runGcloud(gcloud, ['config', 'get-value', 'project'], 'gcloud project');
  if (project !== PILOT_EVENTARC_IAM_PROJECT) {
    throw new Error(`gcloud apunta a ${project || '(vacío)'}, se requiere ${PILOT_EVENTARC_IAM_PROJECT}.`);
  }
}

function triggerCreateArgs(trigger) {
  return [
    'eventarc', 'triggers', 'create', trigger.name,
    '--project', PILOT_EVENTARC_IAM_PROJECT,
    '--location', V4_PILOT_EVENTARC_REGION,
    '--destination-run-service', PILOT_EVENTARC_DESTINATION_SERVICE,
    '--destination-run-region', V4_PILOT_SERVICE_REGION,
    '--event-filters', `type=${PILOT_EVENTARC_EVENT_TYPE}`,
    '--event-filters', `database=${PILOT_EVENTARC_DATABASE}`,
    '--event-filters-path-pattern', `document=${trigger.document}`,
    '--event-data-content-type', PILOT_EVENTARC_CONTENT_TYPE,
    '--service-account', PILOT_EVENTARC_SERVICE_ACCOUNT,
    '--quiet',
  ];
}

function filterValue(trigger, attribute) {
  return (Array.isArray(trigger?.eventFilters) ? trigger.eventFilters : [])
    .find((filter) => filter?.attribute === attribute) || null;
}

function resourceId(value) {
  return typeof value === 'string' ? (value.split('/').pop() || '') : '';
}

function validateDeployedTrigger(resource, expected) {
  const type = filterValue(resource, 'type');
  const database = filterValue(resource, 'database');
  const document = filterValue(resource, 'document');
  const destination = resource?.destination?.cloudRun;
  const valid = resourceId(resource?.name) === expected.name
    && type?.value === PILOT_EVENTARC_EVENT_TYPE
    && database?.value === PILOT_EVENTARC_DATABASE
    && document?.value === expected.document
    && ['match-path-pattern', 'path_pattern'].includes(document?.operator || '')
    && resource?.eventDataContentType === PILOT_EVENTARC_CONTENT_TYPE
    && resource?.serviceAccount === PILOT_EVENTARC_SERVICE_ACCOUNT
    && resourceId(destination?.service) === PILOT_EVENTARC_DESTINATION_SERVICE
    && destination?.region === V4_PILOT_SERVICE_REGION;
  return Object.freeze({
    name: expected.name,
    valid,
    type: type?.value || null,
    database: database?.value || null,
    document: document?.value || null,
    documentOperator: document?.operator || null,
    eventDataContentType: resource?.eventDataContentType || null,
    serviceAccount: resource?.serviceAccount || null,
    destinationService: resourceId(destination?.service) || null,
    destinationRegion: destination?.region || null,
  });
}

function describeTrigger(gcloud, name) {
  const output = runGcloud(gcloud, [
    'eventarc', 'triggers', 'describe', name,
    '--project', PILOT_EVENTARC_IAM_PROJECT,
    '--location', V4_PILOT_EVENTARC_REGION,
    '--format=json',
  ], `Describir trigger ${name}`);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Eventarc describe ${name} no devolvió JSON válido.`);
  }
}

function deleteCreatedTrigger(gcloud, name) {
  const result = runProcess(gcloud, [
    'eventarc', 'triggers', 'delete', name,
    '--project', PILOT_EVENTARC_IAM_PROJECT,
    '--location', V4_PILOT_EVENTARC_REGION,
    '--quiet',
  ]);
  return !result.error && result.status === 0;
}

export async function runStorageV4PilotEventarcDeployDev({
  argv = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
} = {}) {
  if (!gcloud) throw new Error('No se encontró una instalación utilizable de gcloud.');
  assertActiveProject(gcloud);
  const { apply, confirmation } = parseArgs(argv);
  const preflight = await runStorageV4PilotEventarcIamPreflightDev({ gcloud, log: () => {} });
  const plan = Object.freeze({
    project: PILOT_EVENTARC_IAM_PROJECT,
    mode: 'eventarc-deploy-plan',
    eventarcRegion: V4_PILOT_EVENTARC_REGION,
    destinationService: PILOT_EVENTARC_DESTINATION_SERVICE,
    destinationRegion: V4_PILOT_SERVICE_REGION,
    serviceAccount: PILOT_EVENTARC_SERVICE_ACCOUNT,
    eventType: PILOT_EVENTARC_EVENT_TYPE,
    database: PILOT_EVENTARC_DATABASE,
    eventDataContentType: PILOT_EVENTARC_CONTENT_TYPE,
    triggers: V4_PILOT_EVENTARC_TRIGGERS.map((trigger) => ({ ...trigger })),
    preflightReady: preflight.eventarcCreationReady,
    collidingTriggers: [...preflight.triggers.collidingNames],
    rollbackOnPartialCreateFailure: true,
    changesIam: false,
    changesRemoteConfig: false,
    changesFirestoreRules: false,
    mutatesApplicationData: false,
    touchesProduction: false,
    applyRequested: apply,
    confirmationRequired: PILOT_EVENTARC_DEPLOY_CONFIRM,
  });
  log(JSON.stringify(plan, null, 2));

  if (!apply) {
    log('Dry-run: no se crearon triggers Eventarc.');
    return plan;
  }
  if (confirmation !== PILOT_EVENTARC_DEPLOY_CONFIRM) {
    throw new Error(`Confirmación inválida. Usa --confirm=${PILOT_EVENTARC_DEPLOY_CONFIRM}.`);
  }
  if (!preflight.eventarcCreationReady) {
    throw new Error('El preflight IAM/Eventarc no está listo; creación abortada.');
  }

  const created = [];
  try {
    for (const trigger of V4_PILOT_EVENTARC_TRIGGERS) {
      runGcloud(gcloud, triggerCreateArgs(trigger), `Crear trigger ${trigger.name}`);
      created.push(trigger.name);
    }
  } catch (error) {
    const rollback = created.map((name) => ({
      name,
      deleted: deleteCreatedTrigger(gcloud, name),
    }));
    const rollbackFailed = rollback.filter((item) => !item.deleted).map((item) => item.name);
    const wrapped = new Error(`${error.message} Rollback parcial: ${JSON.stringify(rollback)}.`);
    wrapped.rollbackFailed = rollbackFailed;
    throw wrapped;
  }

  const verification = V4_PILOT_EVENTARC_TRIGGERS.map((trigger) => (
    validateDeployedTrigger(describeTrigger(gcloud, trigger.name), trigger)
  ));
  const invalid = verification.filter((item) => !item.valid).map((item) => item.name);
  const result = Object.freeze({
    project: PILOT_EVENTARC_IAM_PROJECT,
    mode: 'eventarc-deployed',
    createdTriggerCount: created.length,
    createdTriggers: Object.freeze([...created]),
    verification: Object.freeze(verification),
    allTriggersValid: invalid.length === 0,
    invalidTriggers: Object.freeze(invalid),
    serviceAccount: PILOT_EVENTARC_SERVICE_ACCOUNT,
    remoteConfigChanged: false,
    clientPilotTrafficActivated: false,
    firestoreRulesChanged: false,
    applicationDataMutated: false,
    touchesProduction: false,
  });
  log(JSON.stringify(result, null, 2));
  if (invalid.length > 0) process.exitCode = 2;
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4PilotEventarcDeployDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
