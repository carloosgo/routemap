/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';

const PROJECT = 'atlasmap-prod';
const LOCATION = 'us-central1';
const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';
const FIRESTORE_API = 'https://firestore.googleapis.com/v1';
const BILLING_ID_PATTERN = /\b[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}\b/gi;
const BILLING_RESOURCE_PATTERN = /billingAccounts\/[A-Z0-9-]+/gi;

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function sanitize(value) {
  return String(value || '')
    .replace(BILLING_RESOURCE_PATTERN, 'billingAccounts/[REDACTED]')
    .replace(BILLING_ID_PATTERN, '[REDACTED-BILLING-ID]');
}

function parseArgs(args = []) {
  for (const value of args) {
    if (value === '--check-cloud') continue;
    fail(`Argumento desconocido: ${value}`, 2);
  }
  return { checkCloud: args.includes('--check-cloud') };
}

function gcloudCandidates() {
  if (process.platform !== 'win32') return ['gcloud'];
  const candidates = ['gcloud.cmd', 'gcloud.exe', 'gcloud'];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    const command = hasPath ? basename(executable) : executable;
    const cmdOptions = hasPath ? { ...options, cwd: dirname(executable) } : options;
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', command, ...args], cmdOptions);
  }
  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  for (const candidate of gcloudCandidates()) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runGcloud(gcloud, args) {
  const result = runProcess(gcloud, args);
  if (result.error) fail(`No se pudo ejecutar gcloud: ${sanitize(result.error.message)}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.status !== 0) {
    fail(`gcloud falló en preflight L1: ${sanitize(stderr || stdout || args.join(' '))}`);
  }
  return stdout;
}

function jsonGcloud(gcloud, args, label) {
  const text = runGcloud(gcloud, [...args, '--format=json']);
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} no devolvió JSON válido.`);
  }
}

async function requestJson(url, token, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`;
    fail(`Google API HTTP ${response.status}: ${sanitize(detail)}`);
  }
  return payload;
}

function plan(checkCloud) {
  return {
    phase: 'L1',
    mode: checkCloud ? 'read-only-cloud-check' : 'local-plan',
    project: PROJECT,
    location: LOCATION,
    checksProjectActive: true,
    checksBillingEnabled: true,
    checksFirestoreLocation: true,
    checksDeleteProtection: true,
    checksTopLevelCollectionsEmpty: true,
    checksFirebaseWebAppsAbsent: true,
    mutatesCloud: false,
    changesIam: false,
    changesRules: false,
    createsWebApp: false,
    changesAuth: false,
    deploysFunctions: false,
    enablesStorageV4Write: false,
    mutatesApplicationData: false,
  };
}

async function main() {
  const { checkCloud } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(plan(checkCloud), null, 2));
  if (!checkCloud) return;

  const gcloud = resolveGcloud();
  if (!gcloud) fail('No se encontró una instalación utilizable de gcloud.');

  const account = runGcloud(gcloud, ['config', 'get-value', 'account']);
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');

  const project = jsonGcloud(gcloud, ['projects', 'describe', PROJECT], 'projects describe');
  if (project?.projectId !== PROJECT) fail('El Project ID observado no coincide con atlasmap-prod.');
  if (project?.lifecycleState && project.lifecycleState !== 'ACTIVE') {
    fail(`atlasmap-prod no está ACTIVE: ${project.lifecycleState}.`);
  }

  const billing = jsonGcloud(gcloud, ['billing', 'projects', 'describe', PROJECT], 'billing describe');
  if (billing?.billingEnabled !== true) fail('Billing no está habilitado en atlasmap-prod.');

  const database = jsonGcloud(
    gcloud,
    ['firestore', 'databases', 'describe', '--database=(default)', `--project=${PROJECT}`],
    'firestore databases describe'
  );
  if (database?.locationId !== LOCATION) {
    fail(`Firestore location mismatch: esperado ${LOCATION}, observado ${database?.locationId || '[vacío]'}.`);
  }
  if (database?.deleteProtectionState !== 'DELETE_PROTECTION_ENABLED') {
    fail('Firestore (default) no tiene delete protection habilitada.');
  }
  if (database?.type && database.type !== 'FIRESTORE_NATIVE') {
    fail(`Firestore (default) no está en Native mode: ${database.type}.`);
  }
  if (database?.edition && database.edition !== 'STANDARD') {
    fail(`Firestore (default) no está en Standard edition: ${database.edition}.`);
  }

  const token = runGcloud(gcloud, ['auth', 'print-access-token']);
  if (!token) fail('gcloud no devolvió access token.');

  const [webApps, collections] = await Promise.all([
    requestJson(`${FIREBASE_API}/projects/${PROJECT}/webApps?pageSize=100`, token),
    requestJson(
      `${FIRESTORE_API}/projects/${PROJECT}/databases/(default)/documents:listCollectionIds`,
      token,
      { method: 'POST', body: { pageSize: 1 } }
    ),
  ]);

  const activeWebApps = Array.isArray(webApps?.apps) ? webApps.apps : [];
  if (activeWebApps.length !== 0) {
    fail(`L1 esperaba 0 Firebase Web Apps y observó ${activeWebApps.length}. Se requiere revisión antes de continuar.`);
  }

  const collectionIds = Array.isArray(collections?.collectionIds) ? collections.collectionIds : [];
  if (collectionIds.length !== 0) {
    fail('La base productiva ya contiene al menos una colección top-level. Se aborta L1 para revisar datos inesperados.');
  }

  console.log(JSON.stringify({
    phase: 'L1',
    pass: true,
    project: PROJECT,
    projectActive: true,
    billingEnabled: true,
    billingAccountIdExposed: false,
    firestoreDefaultDatabasePresent: true,
    firestoreLocation: LOCATION,
    firestoreMode: 'native',
    firestoreEdition: 'standard',
    firestoreDeleteProtectionEnabled: true,
    topLevelCollectionCountObserved: 0,
    firebaseWebAppCountObserved: 0,
    quotaProjectHeaderApplied: true,
    mutatesCloud: false,
    rulesChanged: false,
    authChanged: false,
    applicationDataMutated: false,
    storageV4WriteEnabled: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(sanitize(error?.stack || error?.message || error));
  process.exitCode = error?.exitCode || 1;
});
