/* global process, console, fetch, setTimeout */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

const PROJECT = 'atlasmap-prod';
const DISPLAY_NAME = 'AtlasMap Web Production';
const CONFIRMATION = 'CREATE-ATLAS-V4-PROD-WEB-APP';
const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseArgs(args = []) {
  let apply = false;
  let confirm = '';
  for (const value of args) {
    if (value === '--apply') apply = true;
    else if (value.startsWith('--confirm=')) confirm = value.slice('--confirm='.length).trim();
    else fail(`Argumento desconocido: ${value}`, 2);
  }
  if (!apply && confirm) fail('--confirm solo se admite con --apply.', 2);
  if (apply && confirm !== CONFIRMATION) fail(`--apply exige --confirm=${CONFIRMATION}.`, 2);
  return { apply };
}

function commandCandidates(name) {
  if (process.platform !== 'win32') return [name];
  const candidates = [`${name}.cmd`, `${name}.exe`, name];
  const localAppData = process.env.LOCALAPPDATA;
  if (name === 'gcloud' && localAppData) {
    candidates.push(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    const command = hasPath ? basename(executable) : executable;
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', command, ...args], {
      ...options,
      ...(hasPath ? { cwd: dirname(executable) } : {}),
    });
  }
  return spawnSync(executable, args, options);
}

function resolveCommand(name) {
  for (const candidate of commandCandidates(name)) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, name === 'gcloud' ? ['version'] : ['--version']);
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

async function requestJson(pathOrUrl, token, options = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${FIREBASE_API}/${pathOrUrl}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
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
    fail(`Firebase Management API HTTP ${response.status}: ${detail}`);
  }
  return payload;
}

async function listWebApps(token) {
  const payload = await requestJson(`projects/${PROJECT}/webApps?pageSize=100`, token);
  return Array.isArray(payload?.apps) ? payload.apps.filter((app) => app?.state !== 'DELETED') : [];
}

async function waitOperation(name, token) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const operation = await requestJson(name, token);
    if (operation?.done) {
      if (operation?.error) fail(`Creación de Web App falló: ${operation.error.message || 'error desconocido'}`);
      return operation;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }
  fail('Timeout esperando la creación de la Firebase Web App.');
}

function exactExpectedApp(apps) {
  return apps.filter((app) => app?.displayName === DISPLAY_NAME);
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({
    phase: 'L1',
    operation: 'create-production-web-app',
    mode: apply ? 'apply' : 'plan',
    project: PROJECT,
    displayName: DISPLAY_NAME,
    createsExactlyOneFirebaseWebApp: apply,
    runsEmptyProductionPreflightBeforeFirstCreate: true,
    targetComesFromHardcodedProjectAndRestPath: true,
    dependsOnActiveGcloudProject: false,
    opensFirestoreRules: false,
    changesAuthProviders: false,
    changesIam: false,
    deploysFunctions: false,
    createsStorageBucket: false,
    writesEnvironmentFiles: false,
    enablesStorageV4Write: false,
    mutatesApplicationData: false,
    confirmationRequiredForApply: CONFIRMATION,
  }, null, 2));
  if (!apply) return;

  const gcloud = resolveCommand('gcloud');
  if (!gcloud) fail('No se encontró gcloud.');
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');

  let apps = await listWebApps(token);
  const expectedBefore = exactExpectedApp(apps);
  if (apps.length > 0 && (apps.length !== 1 || expectedBefore.length !== 1)) {
    fail(`Se observaron ${apps.length} Web Apps y no existe un estado idempotente único para ${DISPLAY_NAME}.`);
  }

  let state = 'already-present';
  if (apps.length === 0) {
    const preflightScript = resolve(process.cwd(), 'scripts', 'runStorageV4PhaseL1SecurityPreflightProd.mjs');
    const preflight = runProcess(process.execPath, [preflightScript, '--check-cloud']);
    if (preflight.error || preflight.status !== 0) {
      const detail = String(preflight.stderr || preflight.stdout || preflight.error?.message || '').trim();
      fail(`L1 preflight no pasó; Web App no creada: ${detail}`);
    }
    console.log(JSON.stringify({ stage: 'preflight-pass', project: PROJECT }, null, 2));

    const operation = await requestJson(`projects/${PROJECT}/webApps`, token, {
      method: 'POST',
      body: JSON.stringify({ displayName: DISPLAY_NAME }),
    });
    if (!operation?.name) fail('Firebase no devolvió operation.name al crear la Web App.');
    console.log(JSON.stringify({ stage: 'web-app-create-requested', project: PROJECT }, null, 2));
    await waitOperation(operation.name, token);
    state = 'created';
    apps = await listWebApps(token);
  }

  const expected = exactExpectedApp(apps);
  if (apps.length !== 1 || expected.length !== 1) {
    fail(`Post-check inválido: se esperaban 1 Web App total y 1 con displayName=${DISPLAY_NAME}; observadas=${apps.length}.`);
  }
  const app = expected[0];
  if (!app?.name || !app?.appId) fail('La Web App productiva no expone name/appId válidos.');

  const config = await requestJson(`${app.name}/config`, token);
  if (config?.projectId !== PROJECT || config?.appId !== app.appId) {
    fail('El sdkConfig de la Web App no corresponde a atlasmap-prod.');
  }
  for (const field of ['apiKey', 'authDomain', 'messagingSenderId']) {
    if (!config?.[field]) fail(`El sdkConfig productivo no contiene ${field}.`);
  }

  console.log(JSON.stringify({
    phase: 'L1',
    pass: true,
    project: PROJECT,
    webAppState: state,
    webAppCountObserved: apps.length,
    displayName: app.displayName,
    sdkConfigProjectMatches: true,
    sdkConfigFieldsPresent: {
      apiKey: true,
      authDomain: true,
      projectId: true,
      messagingSenderId: true,
      appId: true,
      storageBucket: Boolean(config.storageBucket),
    },
    apiKeyPrinted: false,
    environmentFileWritten: false,
    firestoreRulesOpened: false,
    authProvidersChanged: false,
    storageBucketCreated: false,
    functionsDeployed: false,
    storageV4WriteEnabled: false,
    applicationDataMutated: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = error?.exitCode || 1;
});
