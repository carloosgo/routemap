/* global process, console, fetch, setTimeout */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const DEV_PROJECT = 'atlasmap-dev';
const DEFAULT_DISPLAY_NAME = 'AtlasMap Production';
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const BILLING_ID_PATTERN = /\b[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{6}\b/gi;
const BILLING_RESOURCE_PATTERN = /billingAccounts\/[A-Z0-9-]+/gi;
const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';

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

function option(args, name) {
  const prefix = `${name}=`;
  const matches = args.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) fail(`${name} no puede repetirse.`, 2);
  return matches.length === 1 ? matches[0].slice(prefix.length).trim() : '';
}

function requiredText(value, field) {
  if (!value) fail(`${field} es obligatorio.`, 2);
  return value;
}

function parseArgs(args = []) {
  for (const value of args) {
    if (value === '--apply') continue;
    if (value.startsWith('--project=')) continue;
    if (value.startsWith('--location=')) continue;
    if (value.startsWith('--display-name=')) continue;
    if (value.startsWith('--confirm=')) continue;
    fail(`Argumento desconocido: ${value}`, 2);
  }

  const project = requiredText(option(args, '--project'), '--project');
  const location = requiredText(option(args, '--location'), '--location');
  const displayName = option(args, '--display-name') || DEFAULT_DISPLAY_NAME;
  const confirm = option(args, '--confirm');
  const apply = args.includes('--apply');

  if (!PROJECT_ID_PATTERN.test(project)) {
    fail('--project debe ser un Project ID válido de 6 a 30 caracteres, en minúsculas, con letras, números o guiones.', 2);
  }
  if (project === DEV_PROJECT) {
    fail(`El bootstrap de producción rechaza ${DEV_PROJECT}.`, 2);
  }
  if (!/^[a-z][a-z0-9-]+$/.test(location)) {
    fail('--location no tiene un formato de región/multirregión válido.', 2);
  }
  if (displayName.length > 30) {
    fail('--display-name no puede exceder 30 caracteres.', 2);
  }

  const expectedConfirm = `CREATE-ATLAS-V4-PROD-${project}`;
  if (apply && confirm !== expectedConfirm) {
    fail(`Para aplicar usa --confirm=${expectedConfirm}`, 2);
  }
  if (!apply && confirm) {
    fail('--confirm solo se admite junto con --apply.', 2);
  }

  return { project, location, displayName, apply, expectedConfirm };
}

function gcloudCandidates() {
  if (process.platform !== 'win32') return ['gcloud'];
  const candidates = ['gcloud.cmd', 'gcloud.exe', 'gcloud'];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.unshift(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', executable, ...args], options);
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

function runGcloud(gcloud, args, { allowFailure = false } = {}) {
  const result = runProcess(gcloud, args);
  if (result.error) fail(`No se pudo ejecutar gcloud: ${sanitize(result.error.message)}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.status !== 0 && !allowFailure) {
    fail(`gcloud falló: ${sanitize(stderr || stdout || args.join(' '))}`);
  }
  return { status: result.status, stdout, stderr };
}

function jsonGcloud(gcloud, args, label, options) {
  const result = runGcloud(gcloud, [...args, '--format=json'], options);
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`${label} no devolvió JSON válido.`);
  }
}

function getProject(gcloud, project) {
  return jsonGcloud(gcloud, ['projects', 'describe', project], 'projects describe', { allowFailure: true });
}

function expectedLabelsPresent(project) {
  const labels = project?.labels || {};
  return labels.environment === 'production' && labels.system === 'atlas-storage-v4';
}

function ensureActiveAccount(gcloud) {
  const result = runGcloud(gcloud, ['config', 'get-value', 'account']);
  if (!result.stdout || result.stdout === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
}

function getSourceBilling(gcloud) {
  const billing = jsonGcloud(
    gcloud,
    ['billing', 'projects', 'describe', DEV_PROJECT],
    'billing projects describe'
  );
  if (billing?.billingEnabled !== true || typeof billing?.billingAccountName !== 'string') {
    fail(`${DEV_PROJECT} no tiene una cuenta de facturación activa reutilizable.`);
  }
  const billingAccountId = billing.billingAccountName.replace(/^billingAccounts\//, '');
  if (!billingAccountId) fail('No se pudo resolver de forma segura la cuenta de facturación de dev.');
  return { billingAccountId };
}

function ensureBilling(gcloud, project, billingAccountId) {
  const current = jsonGcloud(
    gcloud,
    ['billing', 'projects', 'describe', project],
    'target billing describe',
    { allowFailure: true }
  );
  const desiredResource = `billingAccounts/${billingAccountId}`;
  if (current?.billingEnabled === true) {
    if (current.billingAccountName !== desiredResource) {
      fail('El proyecto target ya está ligado a una cuenta de facturación distinta. Se aborta para no reemplazarla.');
    }
    return 'already-linked';
  }

  runGcloud(gcloud, [
    'billing', 'projects', 'link', project,
    `--billing-account=${billingAccountId}`,
    '--quiet',
  ]);
  return 'linked';
}

function getAccessToken(gcloud) {
  const result = runGcloud(gcloud, ['auth', 'print-access-token']);
  if (!result.stdout) fail('gcloud no devolvió access token.');
  return result.stdout;
}

async function firebaseRequest(gcloud, path, { method = 'GET', body, allow404 = false } = {}) {
  const token = getAccessToken(gcloud);
  const response = await fetch(`${FIREBASE_API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  if (response.status === 404 && allow404) return { status: 404, payload };
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`;
    fail(`Firebase Management API falló: ${sanitize(detail)}`);
  }
  return { status: response.status, payload };
}

async function waitFirebaseOperation(gcloud, operationName) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const result = await firebaseRequest(gcloud, operationName);
    if (result.payload?.done === true) {
      if (result.payload.error) {
        fail(`projects.addFirebase terminó con error: ${sanitize(result.payload.error.message || JSON.stringify(result.payload.error))}`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  fail('Timeout esperando projects.addFirebase después de 180 segundos. El proyecto no se borra automáticamente; vuelve a ejecutar para reanudar.');
}

async function ensureFirebase(gcloud, project) {
  const current = await firebaseRequest(gcloud, `projects/${project}`, { allow404: true });
  if (current.status !== 404) return 'already-enabled';

  const start = await firebaseRequest(gcloud, `projects/${project}:addFirebase`, {
    method: 'POST',
    body: {},
  });
  const operationName = start.payload?.name;
  if (!operationName) fail('projects.addFirebase no devolvió un operation name.');
  await waitFirebaseOperation(gcloud, operationName);
  return 'enabled';
}

function getFirestoreDatabase(gcloud, project) {
  return jsonGcloud(
    gcloud,
    ['firestore', 'databases', 'describe', '--database=(default)', `--project=${project}`],
    'firestore databases describe',
    { allowFailure: true }
  );
}

function assertFirestoreShape(database, location) {
  if (!database) fail('Firestore (default) no existe después de la creación.');
  if (database.locationId !== location) {
    fail(`Firestore location mismatch: esperado ${location}, observado ${database.locationId || '[vacío]'}.`);
  }
  if (database.type && database.type !== 'FIRESTORE_NATIVE') {
    fail(`Firestore (default) no está en Native mode: ${database.type}.`);
  }
  if (database.edition && database.edition !== 'STANDARD') {
    fail(`Firestore (default) no está en Standard edition: ${database.edition}.`);
  }
  if (database.pointInTimeRecoveryEnablement !== 'POINT_IN_TIME_RECOVERY_ENABLED') {
    fail('Firestore (default) no tiene PITR habilitado.');
  }
  if (database.deleteProtectionState !== 'DELETE_PROTECTION_ENABLED') {
    fail('Firestore (default) no tiene delete protection habilitada.');
  }
}

function ensureFirestore(gcloud, project, location) {
  const current = getFirestoreDatabase(gcloud, project);
  if (current) {
    assertFirestoreShape(current, location);
    return 'already-present';
  }

  runGcloud(gcloud, [
    'firestore', 'databases', 'create',
    '--database=(default)',
    `--project=${project}`,
    `--location=${location}`,
    '--type=firestore-native',
    '--edition=standard',
    '--enable-pitr',
    '--delete-protection',
    '--quiet',
  ]);
  const created = getFirestoreDatabase(gcloud, project);
  assertFirestoreShape(created, location);
  return 'created';
}

function plan(options) {
  return {
    phase: 'L0',
    operation: 'create-production-project',
    mode: options.apply ? 'apply' : 'plan',
    project: options.project,
    displayName: options.displayName,
    location: options.location,
    sourceBillingProject: DEV_PROJECT,
    reusesDevBillingAccountWithoutPrintingId: true,
    createsGoogleCloudProjectIfMissing: true,
    addsFirebaseIfMissing: true,
    createsDefaultFirestoreIfMissing: true,
    firestoreMode: 'native',
    firestoreEdition: 'standard',
    firestorePitrEnabled: true,
    firestoreDeleteProtectionEnabled: true,
    createsWebApp: false,
    deploysApplication: false,
    deploysFunctions: false,
    changesRemoteConfig: false,
    enablesStorageV4Write: false,
    mutatesApplicationData: false,
    productionInfrastructureMutation: options.apply,
    automaticProjectDeletionOnFailure: false,
    confirmationRequiredForApply: options.expectedConfirm,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(plan(options), null, 2));
  if (!options.apply) return;

  const gcloud = resolveGcloud();
  if (!gcloud) fail('No se encontró una instalación utilizable de gcloud.');
  ensureActiveAccount(gcloud);

  const sourceBilling = getSourceBilling(gcloud);
  let target = getProject(gcloud, options.project);
  let projectState = 'already-present';

  if (!target) {
    runGcloud(gcloud, [
      'projects', 'create', options.project,
      `--name=${options.displayName}`,
      '--labels=environment=production,system=atlas-storage-v4',
      '--quiet',
    ]);
    target = getProject(gcloud, options.project);
    if (!target) fail('El proyecto fue solicitado pero no pudo verificarse después de la creación.');
    projectState = 'created';
  } else if (!expectedLabelsPresent(target)) {
    fail('El Project ID ya existe pero no tiene las etiquetas del bootstrap Atlas v4. No se reutiliza automáticamente.');
  }

  if (target.lifecycleState && target.lifecycleState !== 'ACTIVE') {
    fail(`El proyecto target no está ACTIVE: ${target.lifecycleState}.`);
  }

  const billingState = ensureBilling(gcloud, options.project, sourceBilling.billingAccountId);

  runGcloud(gcloud, [
    'services', 'enable',
    'firebase.googleapis.com',
    'firestore.googleapis.com',
    `--project=${options.project}`,
    '--quiet',
  ]);

  const firebaseState = await ensureFirebase(gcloud, options.project);
  const firestoreState = ensureFirestore(gcloud, options.project, options.location);

  console.log(JSON.stringify({
    phase: 'L0',
    pass: true,
    project: options.project,
    location: options.location,
    projectState,
    projectActive: true,
    billingState,
    billingAccountIdExposed: false,
    firebaseState,
    firestoreState,
    firestoreDefaultDatabasePresent: true,
    firestorePitrEnabled: true,
    firestoreDeleteProtectionEnabled: true,
    webAppCreated: false,
    applicationDeployed: false,
    functionsDeployed: false,
    storageV4WriteEnabled: false,
    applicationDataMutated: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(sanitize(error?.stack || error?.message || error));
  process.exitCode = error?.exitCode || 1;
});
