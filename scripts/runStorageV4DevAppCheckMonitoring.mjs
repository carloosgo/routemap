/* global process, console, fetch */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_APP_CHECK_MONITORING_PROJECT = 'atlasmap-dev';
export const DEV_APP_CHECK_MONITORING_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_APP_CHECK_MONITORING_CONFIRMATION = 'ENABLE-ATLAS-DEV-APP-CHECK-MONITORING';
export const DEV_APP_CHECK_MONITORING_SERVICES = Object.freeze([
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
]);

const APP_CHECK_API = 'https://firebaseappcheck.googleapis.com/v1';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevAppCheckMonitoringArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  let apply = false;
  let confirm = '';
  for (const arg of args) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length).trim();
    else fail(`Argumento desconocido: ${arg}`, 2);
  }
  if (!apply && confirm) fail('--confirm solo se admite junto con --apply.', 2);
  if (apply && confirm !== DEV_APP_CHECK_MONITORING_CONFIRMATION) {
    fail(`--apply exige --confirm=${DEV_APP_CHECK_MONITORING_CONFIRMATION}.`, 2);
  }
  return Object.freeze({ apply });
}

function commandCandidates() {
  return process.platform === 'win32'
    ? ['gcloud.cmd', 'gcloud.exe', 'gcloud']
    : ['gcloud'];
}

function runProcess(executable, args) {
  const base = {
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
    cwd: process.cwd(),
    env: process.env,
  };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return spawnSync('cmd.exe', ['/d', '/c', executable, ...args], base);
  }
  return spawnSync(executable, args, base);
}

function resolveGcloud() {
  for (const candidate of commandCandidates()) {
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runChecked(executable, args, label) {
  const result = runProcess(executable, args);
  if (result.error) fail(`${label}: ${result.error.message}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.status !== 0) fail(`${label}: ${stderr || stdout || `exit ${result.status}`}`);
  return stdout;
}

function parseJson(raw, label) {
  try { return JSON.parse(raw || '{}'); }
  catch { fail(`${label}: respuesta JSON inválida.`); }
}

async function requestJson(url, token, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': DEV_APP_CHECK_MONITORING_PROJECT,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`;
    fail(`Google API HTTP ${response.status}: ${detail}`);
  }
  return payload;
}

function assertDevTarget(gcloud) {
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer la cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const configuredProject = runChecked(gcloud, ['config', 'get-value', 'project'], 'No se pudo leer el proyecto gcloud activo');
  if (configuredProject && configuredProject !== '(unset)' && configuredProject !== DEV_APP_CHECK_MONITORING_PROJECT) {
    fail(`gcloud apunta a ${configuredProject}; este runner exige ${DEV_APP_CHECK_MONITORING_PROJECT}.`);
  }
}

async function getService(token, projectNumber, serviceId) {
  const name = `projects/${projectNumber}/services/${serviceId}`;
  const response = await fetch(`${APP_CHECK_API}/${name}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': DEV_APP_CHECK_MONITORING_PROJECT,
    },
  });
  if (response.status === 404) {
    return Object.freeze({
      name,
      serviceId,
      configured: false,
      enforcementMode: 'OFF',
      replayProtection: 'OFF',
      etag: '',
    });
  }
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`;
    fail(`Google API HTTP ${response.status}: ${detail}`);
  }
  return Object.freeze({
    name,
    serviceId,
    configured: true,
    enforcementMode: payload?.enforcementMode || 'OFF',
    replayProtection: payload?.replayProtection || 'OFF',
    etag: String(payload?.etag || ''),
  });
}

function summarizeServices(services = []) {
  return services.map((service) => Object.freeze({
    serviceId: service.serviceId,
    configured: service.configured,
    enforcementMode: service.enforcementMode,
    replayProtection: service.replayProtection,
  }));
}

function assessMonitoringPlan(services = []) {
  const conflicts = [];
  const toEnableMonitoring = [];
  const alreadyMonitoring = [];
  for (const service of services) {
    if (service.enforcementMode === 'ENFORCED') {
      conflicts.push(`${service.serviceId}: baseline ya está ENFORCED`);
      continue;
    }
    if (service.replayProtection && service.replayProtection !== 'OFF') {
      conflicts.push(`${service.serviceId}: replayProtection inesperado=${service.replayProtection}`);
      continue;
    }
    if (service.enforcementMode === 'UNENFORCED') alreadyMonitoring.push(service.serviceId);
    else if (service.enforcementMode === 'OFF') toEnableMonitoring.push(service.serviceId);
    else conflicts.push(`${service.serviceId}: enforcementMode inesperado=${service.enforcementMode}`);
  }
  return Object.freeze({
    conflicts: Object.freeze(conflicts),
    toEnableMonitoring: Object.freeze(toEnableMonitoring),
    alreadyMonitoring: Object.freeze(alreadyMonitoring),
    canApply: conflicts.length === 0,
  });
}

async function enableMonitoring(token, service) {
  const query = new URLSearchParams({ updateMask: 'enforcementMode' });
  const body = {
    name: service.name,
    enforcementMode: 'UNENFORCED',
  };
  if (service.etag) body.etag = service.etag;
  return requestJson(`${APP_CHECK_API}/${service.name}?${query}`, token, {
    method: 'PATCH',
    body,
  });
}

export async function runStorageV4DevAppCheckMonitoring({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
} = {}) {
  const { apply } = parseDevAppCheckMonitoringArgs(args);

  log(JSON.stringify({
    project: DEV_APP_CHECK_MONITORING_PROJECT,
    productionProject: DEV_APP_CHECK_MONITORING_PRODUCTION_PROJECT,
    mode: apply ? 'apply' : 'dry-run',
    operation: 'development-app-check-monitoring-only',
    targetServices: DEV_APP_CHECK_MONITORING_SERVICES,
    targetMode: 'UNENFORCED',
    collectsAppCheckMetrics: apply,
    rejectsInvalidOrMissingAppCheckTraffic: false,
    changesBaselineEnforcementToEnforced: false,
    changesReplayProtection: false,
    changesRecaptchaKey: false,
    changesAppRegistration: false,
    deploysClient: false,
    deploysFunctions: false,
    changesFirestoreRules: false,
    changesAuthProviders: false,
    touchesProduction: false,
    mutatesCloud: apply,
    confirmationRequiredForApply: DEV_APP_CHECK_MONITORING_CONFIRMATION,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  assertDevTarget(gcloud);

  const project = parseJson(runChecked(gcloud, [
    'projects', 'describe', DEV_APP_CHECK_MONITORING_PROJECT, '--format=json',
  ], 'No se pudo describir atlasmap-dev'), 'Proyecto dev');
  const projectNumber = String(project?.projectNumber || '').trim();
  if (!/^\d+$/.test(projectNumber)) fail('No se pudo resolver projectNumber de atlasmap-dev.');
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');

  const services = [];
  for (const serviceId of DEV_APP_CHECK_MONITORING_SERVICES) {
    services.push(await getService(token, projectNumber, serviceId));
  }
  const plan = assessMonitoringPlan(services);

  log(JSON.stringify({
    stage: 'precheck',
    project: DEV_APP_CHECK_MONITORING_PROJECT,
    services: summarizeServices(services),
    conflicts: plan.conflicts,
    servicesAlreadyMonitoring: plan.alreadyMonitoring,
    servicesToEnableMonitoring: plan.toEnableMonitoring,
    canApply: plan.canApply,
  }, null, 2));

  if (!plan.canApply) fail('App Check monitoring dev bloqueado por conflictos de estado.');

  if (!apply) {
    log(JSON.stringify({
      pass: true,
      mode: 'dry-run',
      cloudChanged: false,
      monitoringWouldEnableFor: plan.toEnableMonitoring,
      alreadyMonitoring: plan.alreadyMonitoring,
      enforcementWouldRemainDisabled: true,
      replayProtectionWouldRemainOff: true,
      touchesProduction: false,
    }, null, 2));
    return;
  }

  for (const service of services) {
    if (!plan.toEnableMonitoring.includes(service.serviceId)) continue;
    await enableMonitoring(token, service);
    log(JSON.stringify({
      stage: 'monitoring-enabled',
      serviceId: service.serviceId,
      enforcementMode: 'UNENFORCED',
      rejectsTraffic: false,
    }, null, 2));
  }

  const postServices = [];
  for (const serviceId of DEV_APP_CHECK_MONITORING_SERVICES) {
    postServices.push(await getService(token, projectNumber, serviceId));
  }
  const postReady = postServices.every((service) => (
    service.enforcementMode === 'UNENFORCED'
    && service.replayProtection === 'OFF'
  ));
  if (!postReady) fail('Post-check: no todos los servicios quedaron UNENFORCED con replayProtection OFF.');

  log(JSON.stringify({
    project: DEV_APP_CHECK_MONITORING_PROJECT,
    pass: true,
    monitoringOnlyReady: true,
    services: summarizeServices(postServices),
    appCheckMetricsCollectionEnabled: true,
    appCheckEnforcementEnabled: false,
    replayProtectionEnabled: false,
    clientDeployed: false,
    productionMutated: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevAppCheckMonitoring().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}
