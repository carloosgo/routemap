/* global process, console, fetch, URL, URLSearchParams */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEV_APP_CHECK_MONITORING_HOSTING_URL,
  DEV_APP_CHECK_MONITORING_SERVICES,
} from './runStorageV4DevAppCheckMonitoring.mjs';

export const DEV_APP_CHECK_ENFORCEMENT_PROJECT = 'atlasmap-dev';
export const DEV_APP_CHECK_ENFORCEMENT_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_APP_CHECK_ENFORCEMENT_CONFIRMATION = 'ENFORCE-ATLAS-DEV-APP-CHECK';
export const DEV_APP_CHECK_ROLLBACK_CONFIRMATION = 'ROLLBACK-ATLAS-DEV-APP-CHECK';
export const DEV_APP_CHECK_ENFORCEMENT_SERVICES = DEV_APP_CHECK_MONITORING_SERVICES;

const APP_CHECK_API = 'https://firebaseappcheck.googleapis.com/v1';
const MAPS_SERVICE_ID = 'maps-backend.googleapis.com';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevAppCheckEnforcementArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  let apply = false;
  let rollback = false;
  let metricsReviewed = false;
  let confirm = '';

  for (const arg of args) {
    if (arg === '--apply') apply = true;
    else if (arg === '--rollback') rollback = true;
    else if (arg === '--ack-metrics-reviewed') metricsReviewed = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length).trim();
    else fail(`Argumento desconocido: ${arg}`, 2);
  }

  if (!apply && confirm) fail('--confirm solo se admite junto con --apply.', 2);
  if (!apply && metricsReviewed) fail('--ack-metrics-reviewed solo se admite junto con --apply.', 2);

  if (apply) {
    const expected = rollback
      ? DEV_APP_CHECK_ROLLBACK_CONFIRMATION
      : DEV_APP_CHECK_ENFORCEMENT_CONFIRMATION;
    if (confirm !== expected) fail(`--apply exige --confirm=${expected}.`, 2);
    if (!rollback && !metricsReviewed) {
      fail('Enforcement exige --ack-metrics-reviewed además de la confirmación exacta.', 2);
    }
    if (rollback && metricsReviewed) {
      fail('--ack-metrics-reviewed no aplica al rollback.', 2);
    }
  }

  return Object.freeze({ apply, rollback, metricsReviewed });
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

function assertDevTarget(gcloud) {
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer la cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const configuredProject = runChecked(gcloud, ['config', 'get-value', 'project'], 'No se pudo leer el proyecto gcloud activo');
  if (configuredProject && configuredProject !== '(unset)' && configuredProject !== DEV_APP_CHECK_ENFORCEMENT_PROJECT) {
    fail(`gcloud apunta a ${configuredProject}; este runner exige ${DEV_APP_CHECK_ENFORCEMENT_PROJECT}.`);
  }
}

async function getService(token, projectNumber, serviceId) {
  const name = `projects/${projectNumber}/services/${serviceId}`;
  const response = await fetch(`${APP_CHECK_API}/${name}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': DEV_APP_CHECK_ENFORCEMENT_PROJECT,
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
    fail(`App Check ${serviceId}: HTTP ${response.status}: ${detail}`);
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

async function patchEnforcementMode(token, service, enforcementMode) {
  const query = new URLSearchParams({ updateMask: 'enforcementMode' });
  const body = {
    name: service.name,
    enforcementMode,
  };
  if (service.etag) body.etag = service.etag;
  const response = await fetch(`${APP_CHECK_API}/${service.name}?${query}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': DEV_APP_CHECK_ENFORCEMENT_PROJECT,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`;
    fail(`PATCH App Check ${service.serviceId}: HTTP ${response.status}: ${detail}`);
  }
  return payload;
}

async function probeHostedMapsAppCheckWiring() {
  const cacheBust = new URL(DEV_APP_CHECK_MONITORING_HOSTING_URL);
  cacheBust.searchParams.set('appCheckEnforcementProbe', String(Date.now()));
  const response = await fetch(cacheBust, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) return false;
  const html = await response.text();
  const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  for (const source of scriptSources) {
    const url = new URL(source, DEV_APP_CHECK_MONITORING_HOSTING_URL);
    if (url.origin !== cacheBust.origin) continue;
    const scriptResponse = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!scriptResponse.ok) continue;
    const script = await scriptResponse.text();
    if (script.includes('fetchAppCheckToken')) return true;
  }
  return false;
}

function assessPlan(services, { rollback, mapsClientReady }) {
  const conflicts = [];
  const toChange = [];
  const alreadyDesired = [];
  const desiredMode = rollback ? 'UNENFORCED' : 'ENFORCED';

  if (!rollback && !mapsClientReady) {
    conflicts.push(`${MAPS_SERVICE_ID}: Hosting dev no evidencia fetchAppCheckToken`);
  }

  for (const service of services) {
    if (service.replayProtection !== 'OFF') {
      conflicts.push(`${service.serviceId}: replayProtection inesperado=${service.replayProtection}`);
      continue;
    }

    if (rollback) {
      if (service.enforcementMode === 'ENFORCED') toChange.push(service.serviceId);
      else if (service.enforcementMode === 'UNENFORCED') alreadyDesired.push(service.serviceId);
      else conflicts.push(`${service.serviceId}: rollback exige ENFORCED o UNENFORCED, observado=${service.enforcementMode}`);
    } else {
      if (service.enforcementMode === 'UNENFORCED') toChange.push(service.serviceId);
      else if (service.enforcementMode === 'ENFORCED') alreadyDesired.push(service.serviceId);
      else conflicts.push(`${service.serviceId}: enforcement exige baseline UNENFORCED, observado=${service.enforcementMode}`);
    }
  }

  return Object.freeze({
    desiredMode,
    conflicts: Object.freeze(conflicts),
    toChange: Object.freeze(toChange),
    alreadyDesired: Object.freeze(alreadyDesired),
    canApply: conflicts.length === 0,
  });
}

export async function runStorageV4DevAppCheckEnforcement({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
} = {}) {
  const { apply, rollback, metricsReviewed } = parseDevAppCheckEnforcementArgs(args);
  const operation = rollback ? 'rollback-to-monitoring' : 'enable-enforcement';

  log(JSON.stringify({
    project: DEV_APP_CHECK_ENFORCEMENT_PROJECT,
    productionProject: DEV_APP_CHECK_ENFORCEMENT_PRODUCTION_PROJECT,
    mode: apply ? 'apply' : 'dry-run',
    operation,
    targetServices: DEV_APP_CHECK_ENFORCEMENT_SERVICES,
    targetMode: rollback ? 'UNENFORCED' : 'ENFORCED',
    metricsReviewAcknowledged: metricsReviewed,
    replayProtectionTarget: 'OFF',
    changesFunctionsEnforcement: false,
    changesFirestoreRules: false,
    changesAuthProviders: false,
    deploysClient: false,
    touchesProduction: false,
    mutatesCloud: apply,
    confirmationRequiredForApply: rollback
      ? DEV_APP_CHECK_ROLLBACK_CONFIRMATION
      : DEV_APP_CHECK_ENFORCEMENT_CONFIRMATION,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  assertDevTarget(gcloud);

  const project = parseJson(runChecked(gcloud, [
    'projects', 'describe', DEV_APP_CHECK_ENFORCEMENT_PROJECT, '--format=json',
  ], 'No se pudo describir atlasmap-dev'), 'Proyecto dev');
  const projectNumber = String(project?.projectNumber || '').trim();
  if (!/^\d+$/.test(projectNumber)) fail('No se pudo resolver projectNumber de atlasmap-dev.');
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');

  const services = [];
  for (const serviceId of DEV_APP_CHECK_ENFORCEMENT_SERVICES) {
    services.push(await getService(token, projectNumber, serviceId));
  }
  const mapsClientReady = rollback ? true : await probeHostedMapsAppCheckWiring();
  const plan = assessPlan(services, { rollback, mapsClientReady });

  log(JSON.stringify({
    stage: 'precheck',
    project: DEV_APP_CHECK_ENFORCEMENT_PROJECT,
    services: summarizeServices(services),
    hostedMapsAppCheckWiringVerified: rollback ? null : mapsClientReady,
    desiredMode: plan.desiredMode,
    servicesToChange: plan.toChange,
    servicesAlreadyDesired: plan.alreadyDesired,
    conflicts: plan.conflicts,
    canApply: plan.canApply,
  }, null, 2));

  if (!plan.canApply) fail(`App Check ${operation} bloqueado por conflictos de estado.`);

  if (!apply) {
    log(JSON.stringify({
      pass: true,
      mode: 'dry-run',
      cloudChanged: false,
      operation,
      servicesWouldChange: plan.toChange,
      targetMode: plan.desiredMode,
      replayProtectionWouldRemainOff: true,
      productionMutated: false,
    }, null, 2));
    return;
  }

  for (const service of services) {
    if (!plan.toChange.includes(service.serviceId)) continue;
    await patchEnforcementMode(token, service, plan.desiredMode);
    log(JSON.stringify({
      stage: rollback ? 'monitoring-restored' : 'enforcement-enabled',
      serviceId: service.serviceId,
      enforcementMode: plan.desiredMode,
      replayProtection: 'OFF',
    }, null, 2));
  }

  const postServices = [];
  for (const serviceId of DEV_APP_CHECK_ENFORCEMENT_SERVICES) {
    postServices.push(await getService(token, projectNumber, serviceId));
  }
  const postReady = postServices.every((service) => (
    service.enforcementMode === plan.desiredMode
    && service.replayProtection === 'OFF'
  ));
  if (!postReady) fail(`Post-check: no todos los servicios quedaron ${plan.desiredMode} con replayProtection OFF.`);

  log(JSON.stringify({
    project: DEV_APP_CHECK_ENFORCEMENT_PROJECT,
    pass: true,
    operation,
    targetModeReady: true,
    services: summarizeServices(postServices),
    appCheckEnforcementEnabled: !rollback,
    monitoringOnlyRestored: rollback,
    replayProtectionEnabled: false,
    propagationMayTakeMinutes: rollback ? null : 15,
    functionsEnforcementChanged: false,
    productionMutated: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevAppCheckEnforcement().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}
