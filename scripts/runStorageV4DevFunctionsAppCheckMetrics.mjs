/* global process, console */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CALLABLE_FUNCTION_NAMES,
  CALLABLE_FUNCTIONS_REGION,
} from '../functions/callableManifest.js';

export const DEV_FUNCTIONS_APP_CHECK_PROJECT = 'atlasmap-dev';
export const DEV_FUNCTIONS_APP_CHECK_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_FUNCTIONS_APP_CHECK_DEFAULT_MINUTES = 60;
export const DEV_FUNCTIONS_APP_CHECK_MAX_MINUTES = 1440;
export const DEV_FUNCTIONS_APP_CHECK_DEFAULT_LIMIT = 10000;
export const DEV_FUNCTIONS_APP_CHECK_MAX_LIMIT = 10000;
export const DEV_FUNCTIONS_APP_CHECK_LOG_TYPE = 'callable-request-verification';

const APP_CHECK_STATES = Object.freeze(['VALID', 'INVALID', 'MISSING']);

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevFunctionsAppCheckMetricsArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  let minutes = DEV_FUNCTIONS_APP_CHECK_DEFAULT_MINUTES;
  let limit = DEV_FUNCTIONS_APP_CHECK_DEFAULT_LIMIT;

  for (const arg of args) {
    if (arg.startsWith('--minutes=')) {
      const raw = arg.slice('--minutes='.length).trim();
      if (!/^\d+$/.test(raw)) fail('--minutes debe ser un entero positivo.', 2);
      minutes = Number(raw);
      if (minutes < 1 || minutes > DEV_FUNCTIONS_APP_CHECK_MAX_MINUTES) {
        fail(`--minutes debe estar entre 1 y ${DEV_FUNCTIONS_APP_CHECK_MAX_MINUTES}.`, 2);
      }
    } else if (arg.startsWith('--limit=')) {
      const raw = arg.slice('--limit='.length).trim();
      if (!/^\d+$/.test(raw)) fail('--limit debe ser un entero positivo.', 2);
      limit = Number(raw);
      if (limit < 1 || limit > DEV_FUNCTIONS_APP_CHECK_MAX_LIMIT) {
        fail(`--limit debe estar entre 1 y ${DEV_FUNCTIONS_APP_CHECK_MAX_LIMIT}.`, 2);
      }
    } else {
      fail(`Argumento desconocido: ${arg}`, 2);
    }
  }

  return Object.freeze({ minutes, limit });
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
  try { return JSON.parse(raw || '[]'); }
  catch { fail(`${label}: respuesta JSON inválida.`); }
}

function assertDevTarget(gcloud) {
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer la cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const configuredProject = runChecked(gcloud, ['config', 'get-value', 'project'], 'No se pudo leer el proyecto gcloud activo');
  if (configuredProject && configuredProject !== '(unset)' && configuredProject !== DEV_FUNCTIONS_APP_CHECK_PROJECT) {
    fail(`gcloud apunta a ${configuredProject}; este runner exige ${DEV_FUNCTIONS_APP_CHECK_PROJECT}.`);
  }
}

function verificationState(entry) {
  const raw = String(
    entry?.jsonPayload?.verifications?.appCheck
    ?? entry?.jsonPayload?.verifications?.app
    ?? 'UNKNOWN'
  ).trim().toUpperCase();
  return APP_CHECK_STATES.includes(raw) ? raw : 'UNKNOWN';
}

function observedFunctionName(entry) {
  const labels = entry?.resource?.labels || {};
  return String(
    labels.function_name
    || labels.service_name
    || entry?.labels?.['firebase-functions-codebase']
    || 'unknown'
  ).trim() || 'unknown';
}

function canonicalCallableName(observedName) {
  const normalized = String(observedName || '').trim().toLowerCase();
  return CALLABLE_FUNCTION_NAMES.find((name) => name.toLowerCase() === normalized) || observedName;
}

function emptyCounts() {
  return { VALID: 0, INVALID: 0, MISSING: 0, UNKNOWN: 0 };
}

export function summarizeCallableVerificationEntries(entries = []) {
  const byFunction = new Map();
  const resourceTypes = new Set();

  for (const entry of entries) {
    const label = String(entry?.labels?.['firebase-log-type'] || '');
    if (label && label !== DEV_FUNCTIONS_APP_CHECK_LOG_TYPE) continue;
    const functionName = canonicalCallableName(observedFunctionName(entry));
    const state = verificationState(entry);
    const summary = byFunction.get(functionName) || {
      functionName,
      counts: emptyCounts(),
      total: 0,
    };
    summary.counts[state] += 1;
    summary.total += 1;
    byFunction.set(functionName, summary);
    if (entry?.resource?.type) resourceTypes.add(String(entry.resource.type));
  }

  const functions = [...byFunction.values()]
    .map((summary) => Object.freeze({
      functionName: summary.functionName,
      expectedCallable: CALLABLE_FUNCTION_NAMES.includes(summary.functionName),
      total: summary.total,
      counts: Object.freeze({ ...summary.counts }),
      validPercent: summary.total > 0
        ? Number(((summary.counts.VALID / summary.total) * 100).toFixed(3))
        : null,
    }))
    .sort((a, b) => a.functionName.localeCompare(b.functionName));

  const totals = functions.reduce((accumulator, summary) => {
    for (const state of [...APP_CHECK_STATES, 'UNKNOWN']) {
      accumulator[state] += summary.counts[state];
    }
    accumulator.total += summary.total;
    return accumulator;
  }, { ...emptyCounts(), total: 0 });

  return Object.freeze({
    functions: Object.freeze(functions),
    totals: Object.freeze(totals),
    resourceTypes: Object.freeze([...resourceTypes].sort()),
  });
}

export async function runStorageV4DevFunctionsAppCheckMetrics({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
  now = new Date(),
} = {}) {
  const { minutes, limit } = parseDevFunctionsAppCheckMetricsArgs(args);
  const end = new Date(now);
  if (Number.isNaN(end.getTime())) fail('now inválido.');
  const start = new Date(end.getTime() - (minutes * 60 * 1000));

  log(JSON.stringify({
    project: DEV_FUNCTIONS_APP_CHECK_PROJECT,
    productionProject: DEV_FUNCTIONS_APP_CHECK_PRODUCTION_PROJECT,
    mode: 'read-only-callable-app-check-logs',
    region: CALLABLE_FUNCTIONS_REGION,
    expectedCallableCount: CALLABLE_FUNCTION_NAMES.length,
    observationWindowMinutes: minutes,
    logEntryLimit: limit,
    logType: DEV_FUNCTIONS_APP_CHECK_LOG_TYPE,
    automaticEnforcementDecision: false,
    mutatesCloud: false,
    deploysFunctions: false,
    changesAppCheckEnforcement: false,
    touchesProduction: false,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  assertDevTarget(gcloud);

  const filter = [
    `timestamp>="${start.toISOString()}"`,
    `timestamp<="${end.toISOString()}"`,
    `labels.firebase-log-type="${DEV_FUNCTIONS_APP_CHECK_LOG_TYPE}"`,
  ].join(' AND ');
  const raw = runChecked(gcloud, [
    'logging', 'read', filter,
    '--project', DEV_FUNCTIONS_APP_CHECK_PROJECT,
    `--limit=${limit}`,
    '--order=asc',
    '--format=json',
  ], 'No se pudieron leer logs de verificación callable');
  const entries = parseJson(raw, 'Logs de verificación callable');
  if (!Array.isArray(entries)) fail('Logging read no devolvió un arreglo JSON.');

  const summary = summarizeCallableVerificationEntries(entries);
  const observedExpectedCallables = summary.functions
    .filter((item) => item.expectedCallable)
    .map((item) => item.functionName);
  const expectedWithoutTraffic = CALLABLE_FUNCTION_NAMES
    .filter((name) => !observedExpectedCallables.includes(name));

  log(JSON.stringify({
    project: DEV_FUNCTIONS_APP_CHECK_PROJECT,
    pass: true,
    window: {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      minutes,
    },
    entriesRead: entries.length,
    entryLimit: limit,
    truncationPossible: entries.length >= limit,
    resourceTypesObserved: summary.resourceTypes,
    functions: summary.functions,
    totals: summary.totals,
    expectedCallableCount: CALLABLE_FUNCTION_NAMES.length,
    expectedCallablesObserved: observedExpectedCallables,
    expectedCallablesWithoutTraffic: expectedWithoutTraffic,
    trafficObserved: summary.totals.total > 0,
    automaticEnforcementDecision: false,
    manualReviewRequiredBeforeFunctionsEnforcement: true,
    cloudChanged: false,
    productionMutated: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevFunctionsAppCheckMetrics().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}
