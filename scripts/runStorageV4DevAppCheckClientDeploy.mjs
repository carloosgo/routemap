/* global process, console, fetch, setTimeout */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import {
  DEV_APP_CHECK_HOST,
  DEV_APP_CHECK_KEY_DISPLAY_NAME,
  DEV_APP_CHECK_PRODUCTION_PROJECT,
  DEV_APP_CHECK_PROJECT,
  DEV_APP_CHECK_TOKEN_TTL,
  DEV_APP_CHECK_WEB_APP_DISPLAY_NAME,
  assessDevRecaptchaKey,
} from './runStorageV4DevAppCheckBootstrap.mjs';

export const DEV_APP_CHECK_CLIENT_CONFIRMATION = 'DEPLOY-ATLAS-DEV-APP-CHECK-CLIENT';
export const DEV_APP_CHECK_HOSTING_SITE = 'atlasmap-dev';
export const DEV_APP_CHECK_HOSTING_URL = 'https://atlasmap-dev.web.app';

const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';
const APP_CHECK_API = 'https://firebaseappcheck.googleapis.com/v1';
const RECAPTCHA_API = 'https://recaptchaenterprise.googleapis.com/v1';
const REQUIRED_PUBLIC_CLIENT_SETTINGS = Object.freeze([
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_MAP_ID',
]);

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevAppCheckClientArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  let apply = false;
  let confirm = '';
  for (const arg of args) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length).trim();
    else fail(`Argumento desconocido: ${arg}`, 2);
  }
  if (!apply && confirm) fail('--confirm solo se admite junto con --apply.', 2);
  if (apply && confirm !== DEV_APP_CHECK_CLIENT_CONFIRMATION) {
    fail(`--apply exige --confirm=${DEV_APP_CHECK_CLIENT_CONFIRMATION}.`, 2);
  }
  return Object.freeze({ apply });
}

function commandCandidates() {
  return process.platform === 'win32'
    ? ['gcloud.cmd', 'gcloud.exe', 'gcloud']
    : ['gcloud'];
}

function runProcess(executable, args, options = {}) {
  const base = {
    encoding: 'utf8',
    windowsHide: true,
    stdio: options.inherit ? 'inherit' : 'pipe',
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
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

function runChecked(executable, args, label, options = {}) {
  const result = runProcess(executable, args, options);
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

async function requestJson(url, token, { allow404 = false } = {}) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': DEV_APP_CHECK_PROJECT,
    },
  });
  if (allow404 && response.status === 404) return null;
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
  if (configuredProject && configuredProject !== '(unset)' && configuredProject !== DEV_APP_CHECK_PROJECT) {
    fail(`gcloud apunta a ${configuredProject}; este runner exige ${DEV_APP_CHECK_PROJECT}.`);
  }
}

async function resolveWebApp(token) {
  const payload = await requestJson(
    `${FIREBASE_API}/projects/${DEV_APP_CHECK_PROJECT}/webApps?pageSize=100`,
    token
  );
  const apps = (Array.isArray(payload?.apps) ? payload.apps : [])
    .filter((app) => app?.state !== 'DELETED');
  const expected = apps.filter((app) => app?.displayName === DEV_APP_CHECK_WEB_APP_DISPLAY_NAME);
  if (apps.length !== 1 || expected.length !== 1 || !expected[0]?.appId) {
    fail(`Web App dev inesperada: total=${apps.length}, esperadas=${expected.length}.`);
  }
  return expected[0];
}

async function getWebSdkConfig(token, appId) {
  const config = await requestJson(
    `${FIREBASE_API}/projects/${DEV_APP_CHECK_PROJECT}/webApps/${encodeURIComponent(appId)}/config`,
    token
  );
  const required = ['apiKey', 'authDomain', 'projectId', 'messagingSenderId', 'appId'];
  const missing = required.filter((field) => !String(config?.[field] || '').trim());
  if (missing.length > 0) fail(`Firebase Web SDK config incompleto: ${missing.join(', ')}.`);
  if (config.projectId !== DEV_APP_CHECK_PROJECT || config.appId !== appId) {
    fail('Firebase Web SDK config no pertenece a la Web App dev esperada.');
  }
  return config;
}

async function listRecaptchaKeys(token) {
  const payload = await requestJson(
    `${RECAPTCHA_API}/projects/${DEV_APP_CHECK_PROJECT}/keys?pageSize=1000`,
    token
  );
  return Array.isArray(payload?.keys) ? payload.keys : [];
}

async function getEnterpriseConfig(token, projectNumber, appId) {
  return requestJson(
    `${APP_CHECK_API}/projects/${projectNumber}/apps/${encodeURIComponent(appId)}/recaptchaEnterpriseConfig`,
    token,
    { allow404: true }
  );
}

async function listAppCheckServices(token, projectNumber) {
  const payload = await requestJson(
    `${APP_CHECK_API}/projects/${projectNumber}/services?pageSize=100`,
    token
  );
  return Array.isArray(payload?.services) ? payload.services : [];
}

function summarizeEnforcement(services = []) {
  return (Array.isArray(services) ? services : []).map((service) => Object.freeze({
    name: String(service?.name || ''),
    enforcementMode: service?.enforcementMode || 'OFF',
    replayProtection: service?.replayProtection || 'OFF',
  }));
}

function sameEnforcement(before = [], after = []) {
  const normalize = (items) => [...items]
    .map(({ name, enforcementMode, replayProtection }) => `${name}|${enforcementMode}|${replayProtection}`)
    .sort();
  return JSON.stringify(normalize(before)) === JSON.stringify(normalize(after));
}

function readLocalEnvPresence(repoRoot) {
  const path = join(repoRoot, '.env.local');
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const has = (name) => Boolean(
    String(process.env[name] || '').trim()
    || new RegExp(`^\\s*${name}\\s*=\\s*.+$`, 'm').test(raw)
  );
  return Object.freeze({
    filePresent: existsSync(path),
    settings: Object.freeze(Object.fromEntries(
      REQUIRED_PUBLIC_CLIENT_SETTINGS.map((name) => [name, has(name)])
    )),
  });
}

function listFilesRecursive(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const full = join(root, entry);
    return statSync(full).isDirectory() ? listFilesRecursive(full) : [full];
  });
}

export function inspectBuiltClient(distDir, { siteKey } = {}) {
  const files = listFilesRecursive(distDir);
  if (files.length === 0) return Object.freeze({ valid: false, reason: 'dist vacío o ausente.' });
  let siteKeyFound = false;
  let devProjectFound = false;
  let productionProjectFound = false;
  for (const file of files) {
    if (!/\.(?:html|js|css|json|map|txt)$/i.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (siteKey && text.includes(siteKey)) siteKeyFound = true;
    if (text.includes(DEV_APP_CHECK_PROJECT)) devProjectFound = true;
    if (text.includes(DEV_APP_CHECK_PRODUCTION_PROJECT)) productionProjectFound = true;
  }
  return Object.freeze({
    valid: siteKeyFound && devProjectFound && !productionProjectFound,
    siteKeyFound,
    devProjectFound,
    productionProjectFound,
    fileCount: files.length,
  });
}

function buildFirebaseClientEnv(sdkConfig, siteKey) {
  return {
    ...process.env,
    VITE_FIREBASE_API_KEY: String(sdkConfig.apiKey),
    VITE_FIREBASE_AUTH_DOMAIN: String(sdkConfig.authDomain),
    VITE_FIREBASE_PROJECT_ID: DEV_APP_CHECK_PROJECT,
    VITE_FIREBASE_STORAGE_BUCKET: String(sdkConfig.storageBucket || ''),
    VITE_FIREBASE_MESSAGING_SENDER_ID: String(sdkConfig.messagingSenderId),
    VITE_FIREBASE_APP_ID: String(sdkConfig.appId),
    VITE_FIREBASE_APPCHECK_SITE_KEY: String(siteKey),
    VITE_FIREBASE_USE_EMULATORS: 'false',
    VITE_FIREBASE_FUNCTIONS_REGION: 'us-central1',
  };
}

function hostingConfig() {
  return {
    hosting: {
      site: DEV_APP_CHECK_HOSTING_SITE,
      public: 'dist',
      ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
      rewrites: [{ source: '**', destination: '/index.html' }],
    },
  };
}

async function verifyHostedClient(siteKey) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(`${DEV_APP_CHECK_HOSTING_URL}/`, { cache: 'no-store' });
      if (response.ok) {
        const html = await response.text();
        const assetPaths = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|mjs))["']/g)]
          .map((match) => match[1]);
        for (const assetPath of assetPaths) {
          const url = new URL(assetPath, `${DEV_APP_CHECK_HOSTING_URL}/`).toString();
          const asset = await fetch(url, { cache: 'no-store' });
          if (!asset.ok) continue;
          const text = await asset.text();
          if (
            text.includes(siteKey)
            && text.includes(DEV_APP_CHECK_PROJECT)
            && !text.includes(DEV_APP_CHECK_PRODUCTION_PROJECT)
          ) {
            return true;
          }
        }
      }
    } catch {
      // Hosting/CDN puede tardar brevemente en reflejar un release nuevo.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  return false;
}

export async function runStorageV4DevAppCheckClientDeploy({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  repoRoot = resolve(process.cwd()),
  log = (value) => console.log(value),
} = {}) {
  const { apply } = parseDevAppCheckClientArgs(args);
  log(JSON.stringify({
    project: DEV_APP_CHECK_PROJECT,
    productionProject: DEV_APP_CHECK_PRODUCTION_PROJECT,
    mode: apply ? 'apply' : 'dry-run',
    operation: 'development-app-check-client-hosting-deploy',
    hostingSite: DEV_APP_CHECK_HOSTING_SITE,
    hostingUrl: DEV_APP_CHECK_HOSTING_URL,
    appCheckProvider: 'recaptcha-enterprise',
    readsFirebaseSdkConfigFromManagementApi: true,
    injectsFirebaseConfigOnlyIntoBuildProcess: true,
    writesSiteKeyToEnvironmentFile: false,
    preservesLocalNonFirebaseViteSettings: true,
    forcesFirebaseProjectToDev: true,
    forcesFirebaseEmulatorsOff: true,
    deploysHosting: apply,
    changesAppCheckEnforcement: false,
    deploysFunctions: false,
    changesFirestoreRules: false,
    changesAuthProviders: false,
    touchesProduction: false,
    mutatesCloud: apply,
    confirmationRequiredForApply: DEV_APP_CHECK_CLIENT_CONFIRMATION,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  assertDevTarget(gcloud);

  const project = parseJson(runChecked(gcloud, [
    'projects', 'describe', DEV_APP_CHECK_PROJECT, '--format=json',
  ], 'No se pudo describir atlasmap-dev'), 'Proyecto dev');
  const projectNumber = String(project?.projectNumber || '').trim();
  if (!/^\d+$/.test(projectNumber)) fail('No se pudo resolver projectNumber de atlasmap-dev.');
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');
  const webApp = await resolveWebApp(token);
  const sdkConfig = await getWebSdkConfig(token, webApp.appId);
  const recaptchaAssessment = assessDevRecaptchaKey(await listRecaptchaKeys(token));
  if (!recaptchaAssessment.valid || !recaptchaAssessment.existing || !recaptchaAssessment.siteKey) {
    fail(recaptchaAssessment.conflict || `No existe la clave ${DEV_APP_CHECK_KEY_DISPLAY_NAME} esperada.`);
  }
  const enterpriseConfig = await getEnterpriseConfig(token, projectNumber, webApp.appId);
  if (enterpriseConfig?.siteKey !== recaptchaAssessment.siteKey) {
    fail('App Check dev no apunta a la clave reCAPTCHA Enterprise esperada.');
  }
  if (enterpriseConfig?.tokenTtl !== DEV_APP_CHECK_TOKEN_TTL) {
    fail(`App Check token TTL inesperado: ${enterpriseConfig?.tokenTtl || 'ausente'}.`);
  }

  const enforcementBefore = summarizeEnforcement(await listAppCheckServices(token, projectNumber));
  if (enforcementBefore.some((item) => item.enforcementMode === 'ENFORCED')) {
    fail('Safety check: ya existe App Check ENFORCED en dev; client deploy abortado para revisión.');
  }

  const viteScript = join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const firebaseCli = join(repoRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const localEnv = readLocalEnvPresence(repoRoot);
  const missingPublicClientSettings = REQUIRED_PUBLIC_CLIENT_SETTINGS
    .filter((name) => localEnv.settings[name] !== true);
  const canApply = existsSync(viteScript)
    && existsSync(firebaseCli)
    && missingPublicClientSettings.length === 0;

  log(JSON.stringify({
    stage: 'precheck',
    project: DEV_APP_CHECK_PROJECT,
    webAppDisplayName: webApp.displayName,
    firebaseSdkConfigObserved: true,
    firebaseSdkConfigPrinted: false,
    appCheckEnterpriseRegistrationReady: true,
    appCheckTokenTtl: enterpriseConfig.tokenTtl,
    recaptchaKeyReady: true,
    recaptchaAllowedDomain: DEV_APP_CHECK_HOST,
    siteKeyObserved: true,
    siteKeyPrinted: false,
    enforcementConfigurationsObserved: enforcementBefore.length,
    enforcedServicesObserved: 0,
    localEnvFilePresent: localEnv.filePresent,
    requiredPublicClientSettingPresence: localEnv.settings,
    missingPublicClientSettings,
    localViteCliReady: existsSync(viteScript),
    localFirebaseCliReady: existsSync(firebaseCli),
    canApply,
  }, null, 2));

  if (!canApply) fail('Client deploy dev bloqueado: faltan dependencias locales o configuración pública no-Firebase.');
  if (!apply) {
    log(JSON.stringify({
      pass: true,
      mode: 'dry-run',
      cloudChanged: false,
      buildWouldRun: true,
      hostingDeployWouldRun: true,
      siteKeyWouldBeInjectedEphemerally: true,
      environmentFilesWouldChange: false,
      enforcementWouldChange: false,
      touchesProduction: false,
    }, null, 2));
    return;
  }

  const buildEnv = buildFirebaseClientEnv(sdkConfig, recaptchaAssessment.siteKey);
  runChecked(process.execPath, [viteScript, 'build'], 'Vite build dev con App Check falló', {
    cwd: repoRoot,
    env: buildEnv,
    inherit: true,
  });

  const distDir = join(repoRoot, 'dist');
  const built = inspectBuiltClient(distDir, { siteKey: recaptchaAssessment.siteKey });
  if (!built.valid) {
    fail(`Bundle dev inválido: siteKey=${built.siteKeyFound}, dev=${built.devProjectFound}, prod=${built.productionProjectFound}.`);
  }
  log(JSON.stringify({
    stage: 'client-bundle-verified',
    siteKeyEmbedded: true,
    firebaseDevProjectEmbedded: true,
    productionProjectEmbedded: false,
    siteKeyPrinted: false,
    bundleFileCount: built.fileCount,
  }, null, 2));

  const tempConfig = join(repoRoot, `.firebase.appcheck.dev.hosting.${process.pid}.json`);
  try {
    writeFileSync(tempConfig, `${JSON.stringify(hostingConfig(), null, 2)}\n`, 'utf8');
    runChecked(process.execPath, [
      firebaseCli,
      'deploy',
      '--only', 'hosting',
      '--project', DEV_APP_CHECK_PROJECT,
      '--config', tempConfig,
      '--non-interactive',
    ], 'Firebase Hosting deploy dev falló', {
      cwd: repoRoot,
      inherit: true,
    });
  } finally {
    if (existsSync(tempConfig)) unlinkSync(tempConfig);
  }

  const hostedClientVerified = await verifyHostedClient(recaptchaAssessment.siteKey);
  if (!hostedClientVerified) {
    fail('Post-check: Hosting no expone todavía el bundle dev con App Check esperado.');
  }

  const enforcementAfter = summarizeEnforcement(await listAppCheckServices(token, projectNumber));
  if (!sameEnforcement(enforcementBefore, enforcementAfter)) {
    fail('Post-check: App Check enforcement cambió durante el client deploy.');
  }

  log(JSON.stringify({
    project: DEV_APP_CHECK_PROJECT,
    pass: true,
    clientBuiltWithAppCheck: true,
    firebaseProjectPinnedToDev: true,
    firebaseEmulatorsDisabledInBuild: true,
    hostingDeployed: true,
    hostingUrl: DEV_APP_CHECK_HOSTING_URL,
    hostedBundleVerified: true,
    siteKeyValuePrinted: false,
    environmentFileMutated: false,
    appCheckEnforcementChanged: false,
    appCheckEnforcementEnabled: false,
    functionsDeployed: false,
    firestoreRulesChanged: false,
    productionMutated: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevAppCheckClientDeploy().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}