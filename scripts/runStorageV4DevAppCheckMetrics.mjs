/* global process, console, fetch, URLSearchParams */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_APP_CHECK_METRICS_PROJECT = 'atlasmap-dev';
export const DEV_APP_CHECK_METRICS_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_APP_CHECK_METRIC_TYPE = 'firebaseappcheck.googleapis.com/services/verification_count';
export const DEV_APP_CHECK_METRICS_SERVICES = Object.freeze([
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'maps-backend.googleapis.com',
]);
export const DEV_APP_CHECK_METRICS_DEFAULT_MINUTES = 60;
export const DEV_APP_CHECK_METRICS_MAX_MINUTES = 1440;

const APP_CHECK_API = 'https://firebaseappcheck.googleapis.com/v1';
const MONITORING_API = 'https://monitoring.googleapis.com/v3';
const SECURITY_CATEGORIES = Object.freeze([
  'VALID',
  'CONSUMED',
  'INVALID',
  'MISSING_OUTDATED_CLIENT',
  'MISSING_UNKNOWN_ORIGIN',
]);

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevAppCheckMetricsArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  let minutes = DEV_APP_CHECK_METRICS_DEFAULT_MINUTES;
  for (const arg of args) {
    if (arg.startsWith('--minutes=')) {
      const raw = arg.slice('--minutes='.length).trim();
      if (!/^\d+$/.test(raw)) fail('--minutes debe ser un entero positivo.', 2);
      minutes = Number(raw);
      if (minutes < 1 || minutes > DEV_APP_CHECK_METRICS_MAX_MINUTES) {
        fail(`--minutes debe estar entre 1 y ${DEV_APP_CHECK_METRICS_MAX_MINUTES}.`, 2);
      }
    } else {
      fail(`Argumento desconocido: ${arg}`, 2);
    }
  }
  return Object.freeze({ minutes });
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
  if (configuredProject && configuredProject !== '(unset)' && configuredProject !== DEV_APP_CHECK_METRICS_PROJECT) {
    fail(`gcloud apunta a ${configuredProject}; este runner exige ${DEV_APP_CHECK_METRICS_PROJECT}.`);
  }
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': DEV_APP_CHECK_METRICS_PROJECT,
    },
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

async function getServiceMode(token, projectNumber, serviceId) {
  const name = `projects/${projectNumber}/services/${serviceId}`;
  const response = await fetch(`${APP_CHECK_API}/${name}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': DEV_APP_CHECK_METRICS_PROJECT,
    },
  });
  if (response.status === 404) {
    return Object.freeze({ serviceId, enforcementMode: 'OFF', replayProtection: 'OFF' });
  }
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`;
    fail(`App Check service ${serviceId}: HTTP ${response.status}: ${detail}`);
  }
  return Object.freeze({
    serviceId,
    enforcementMode: payload?.enforcementMode || 'OFF',
    replayProtection: payload?.replayProtection || 'OFF',
  });
}

async function listVerificationTimeSeries(token, startTime, endTime) {
  const filter = [
    `metric.type = "${DEV_APP_CHECK_METRIC_TYPE}"`,
    'resource.type = "firebaseappcheck.googleapis.com/Service"',
  ].join(' AND ');
  const baseParams = new URLSearchParams({
    filter,
    'interval.startTime': startTime,
    'interval.endTime': endTime,
    view: 'FULL',
    pageSize: '100000',
  });

  const timeSeries = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams(baseParams);
    if (pageToken) params.set('pageToken', pageToken);
    const payload = await fetchJson(
      `${MONITORING_API}/projects/${DEV_APP_CHECK_METRICS_PROJECT}/timeSeries?${params}`,
      token
    );
    timeSeries.push(...(Array.isArray(payload?.timeSeries) ? payload.timeSeries : []));
    pageToken = String(payload?.nextPageToken || '');
  } while (pageToken);

  return timeSeries;
}

function pointValue(point) {
  const raw = point?.value?.int64Value
    ?? point?.value?.doubleValue
    ?? point?.value?.distributionValue?.count
    ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function emptySecurityCounts() {
  return Object.fromEntries(SECURITY_CATEGORIES.map((category) => [category, 0]));
}

function summarizeMetrics(timeSeries, serviceModes) {
  const summaries = new Map(DEV_APP_CHECK_METRICS_SERVICES.map((serviceId) => [serviceId, {
    serviceId,
    enforcementMode: serviceModes.get(serviceId)?.enforcementMode || 'OFF',
    replayProtection: serviceModes.get(serviceId)?.replayProtection || 'OFF',
    verificationCount: 0,
    allowCount: 0,
    denyCount: 0,
    security: emptySecurityCounts(),
    otherSecurityCount: 0,
    appIdsObserved: new Set(),
    timeSeriesCount: 0,
  }]));

  for (const series of timeSeries) {
    const serviceId = String(series?.resource?.labels?.service_id || '');
    const summary = summaries.get(serviceId);
    if (!summary) continue;
    const security = String(series?.metric?.labels?.security || 'UNKNOWN');
    const result = String(series?.metric?.labels?.result || 'UNKNOWN');
    const appId = String(series?.metric?.labels?.app_id || '').trim();
    const count = (Array.isArray(series?.points) ? series.points : [])
      .reduce((total, point) => total + pointValue(point), 0);
    summary.timeSeriesCount += 1;
    summary.verificationCount += count;
    if (result === 'ALLOW') summary.allowCount += count;
    else if (result === 'DENY') summary.denyCount += count;
    if (Object.hasOwn(summary.security, security)) summary.security[security] += count;
    else summary.otherSecurityCount += count;
    if (appId) summary.appIdsObserved.add(appId);
  }

  return [...summaries.values()].map((summary) => {
    const validCount = summary.security.VALID;
    const verifiedPercent = summary.verificationCount > 0
      ? Number(((validCount / summary.verificationCount) * 100).toFixed(3))
      : null;
    return Object.freeze({
      serviceId: summary.serviceId,
      enforcementMode: summary.enforcementMode,
      replayProtection: summary.replayProtection,
      timeSeriesCount: summary.timeSeriesCount,
      verificationCount: summary.verificationCount,
      allowCount: summary.allowCount,
      denyCount: summary.denyCount,
      security: Object.freeze({ ...summary.security }),
      otherSecurityCount: summary.otherSecurityCount,
      verifiedPercent,
      appIdsObserved: Object.freeze([...summary.appIdsObserved].sort()),
      trafficObserved: summary.verificationCount > 0,
    });
  });
}

export async function runStorageV4DevAppCheckMetrics({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
  now = new Date(),
} = {}) {
  const { minutes } = parseDevAppCheckMetricsArgs(args);

  log(JSON.stringify({
    project: DEV_APP_CHECK_METRICS_PROJECT,
    productionProject: DEV_APP_CHECK_METRICS_PRODUCTION_PROJECT,
    mode: 'read-only-app-check-metrics',
    metricType: DEV_APP_CHECK_METRIC_TYPE,
    targetServices: DEV_APP_CHECK_METRICS_SERVICES,
    observationWindowMinutes: minutes,
    automaticEnforcementDecision: false,
    mutatesCloud: false,
    changesEnforcement: false,
    touchesProduction: false,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  assertDevTarget(gcloud);

  const project = parseJson(runChecked(gcloud, [
    'projects', 'describe', DEV_APP_CHECK_METRICS_PROJECT, '--format=json',
  ], 'No se pudo describir atlasmap-dev'), 'Proyecto dev');
  const projectNumber = String(project?.projectNumber || '').trim();
  if (!/^\d+$/.test(projectNumber)) fail('No se pudo resolver projectNumber de atlasmap-dev.');
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');

  const serviceModeEntries = [];
  for (const serviceId of DEV_APP_CHECK_METRICS_SERVICES) {
    serviceModeEntries.push(await getServiceMode(token, projectNumber, serviceId));
  }
  const serviceModes = new Map(serviceModeEntries.map((entry) => [entry.serviceId, entry]));

  const end = new Date(now);
  if (Number.isNaN(end.getTime())) fail('now inválido.');
  const start = new Date(end.getTime() - (minutes * 60 * 1000));
  const timeSeries = await listVerificationTimeSeries(token, start.toISOString(), end.toISOString());
  const services = summarizeMetrics(timeSeries, serviceModes);
  const totalVerificationCount = services.reduce((total, service) => total + service.verificationCount, 0);

  log(JSON.stringify({
    project: DEV_APP_CHECK_METRICS_PROJECT,
    pass: true,
    window: {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      minutes,
    },
    services,
    totalVerificationCount,
    trafficObserved: totalVerificationCount > 0,
    metricsCategories: SECURITY_CATEGORIES,
    automaticEnforcementDecision: false,
    manualReviewRequiredBeforeEnforcement: true,
    cloudChanged: false,
    productionMutated: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevAppCheckMetrics().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}
