/* global process, console, fetch */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';

const PROJECT = 'atlasmap-prod';
const WEB_APP_DISPLAY_NAME = 'AtlasMap Web Production';
const OAUTH_BRAND_DISPLAY_NAME = 'AtlasMap';
const CONFIRMATION = 'ENABLE-ATLAS-V4-PROD-GOOGLE-AUTH';
const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';
const FIREBASE_RULES_API = 'https://firebaserules.googleapis.com/v1';
const FIRESTORE_API = 'https://firestore.googleapis.com/v1';
const IDENTITY_API = 'https://identitytoolkit.googleapis.com/admin/v2';
const LOCKED_RULES_FILE = 'firestore.l1.prod.locked.rules';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function emailLooksValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function parseArgs(args = []) {
  let apply = false;
  let confirm = '';
  let supportEmail = '';
  for (const value of args) {
    if (value === '--apply') apply = true;
    else if (value.startsWith('--confirm=')) confirm = value.slice('--confirm='.length).trim();
    else if (value.startsWith('--support-email=')) supportEmail = value.slice('--support-email='.length).trim();
    else fail(`Argumento desconocido: ${value}`, 2);
  }
  if (supportEmail && !emailLooksValid(supportEmail)) fail('--support-email no parece un correo válido.', 2);
  if (!apply && confirm) fail('--confirm solo se admite con --apply.', 2);
  if (apply && !supportEmail) fail('--apply exige --support-email=<correo-de-soporte>.', 2);
  if (apply && confirm !== CONFIRMATION) fail(`--apply exige --confirm=${CONFIRMATION}.`, 2);
  return { apply, supportEmail };
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

async function request(url, token, { allow404 = false } = {}) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
    },
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.raw || `${response.status} ${response.statusText}`;
    fail(`Google API HTTP ${response.status}: ${detail}`);
  }
  return payload;
}

function normalizeRules(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

async function assertLockedRules(token) {
  const releases = await request(`${FIREBASE_RULES_API}/projects/${PROJECT}/releases?pageSize=100`, token);
  const release = (Array.isArray(releases?.releases) ? releases.releases : [])
    .find((item) => item?.name?.endsWith('/releases/cloud.firestore'));
  if (!release?.rulesetName) fail('No se encontró el release Firestore productivo activo.');
  const ruleset = await request(`${FIREBASE_RULES_API}/${release.rulesetName}`, token);
  const deployed = (Array.isArray(ruleset?.source?.files) ? ruleset.source.files : [])
    .map((file) => file?.content || '')
    .join('\n');
  const local = readFileSync(resolve(process.cwd(), LOCKED_RULES_FILE), 'utf8');
  if (normalizeRules(deployed) !== normalizeRules(local)) {
    fail('Firestore Rules ya no coincide con el baseline L1 deny-all; Auth no será modificado.');
  }
}

async function assertWebAppAndEmptyData(token) {
  const appsPayload = await request(`${FIREBASE_API}/projects/${PROJECT}/webApps?pageSize=100`, token);
  const apps = (Array.isArray(appsPayload?.apps) ? appsPayload.apps : []).filter((app) => app?.state !== 'DELETED');
  const expected = apps.filter((app) => app?.displayName === WEB_APP_DISPLAY_NAME);
  if (apps.length !== 1 || expected.length !== 1) {
    fail(`Se esperaba exactamente 1 Web App productiva (${WEB_APP_DISPLAY_NAME}); observadas=${apps.length}.`);
  }

  const response = await fetch(
    `${FIRESTORE_API}/projects/${PROJECT}/databases/(default)/documents:listCollectionIds`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': PROJECT,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ pageSize: 1 }),
    }
  );
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = { raw: text.slice(0, 500) }; }
  }
  if (!response.ok) fail(`Firestore precheck HTTP ${response.status}: ${payload?.error?.message || payload?.raw || response.statusText}`);
  if (Array.isArray(payload?.collectionIds) && payload.collectionIds.length > 0) {
    fail('Firestore productivo ya contiene datos; Auth no será modificado hasta revisar el estado inesperado.');
  }
}

async function verifyAuth(token) {
  const [google, config] = await Promise.all([
    request(`${IDENTITY_API}/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`, token),
    request(`${IDENTITY_API}/projects/${PROJECT}/config`, token),
  ]);

  if (google?.enabled !== true) fail('Google Sign-In no quedó habilitado server-side.');
  if (!google?.clientId) fail('Google Sign-In no expone clientId server-side después del deploy.');
  if (!google?.clientSecret) fail('Google Sign-In no expone clientSecret server-side después del deploy.');
  if (config?.signIn?.email?.enabled === true) fail('Email/password quedó habilitado inesperadamente.');
  if (config?.signIn?.anonymous?.enabled === true) fail('Anonymous Auth quedó habilitado inesperadamente.');
  if (config?.signIn?.phoneNumber?.enabled === true) fail('Phone Auth quedó habilitado inesperadamente.');

  const domains = Array.isArray(config?.authorizedDomains) ? config.authorizedDomains : [];
  if (domains.some((domain) => domain === 'localhost' || domain.startsWith('localhost:'))) {
    fail('localhost quedó autorizado inesperadamente en el proyecto productivo.');
  }

  return {
    googleEnabled: true,
    googleOAuthClientPresent: true,
    googleOAuthSecretPresent: true,
    emailPasswordEnabled: false,
    anonymousEnabled: false,
    phoneEnabled: false,
    localhostAuthorized: false,
    authorizedDomainCount: domains.length,
  };
}

async function main() {
  const { apply, supportEmail } = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify({
    phase: 'L1',
    operation: 'configure-production-google-auth',
    mode: apply ? 'apply' : 'plan',
    project: PROJECT,
    webAppDisplayName: WEB_APP_DISPLAY_NAME,
    googleSignInOnly: true,
    oAuthBrandDisplayName: OAUTH_BRAND_DISPLAY_NAME,
    supportEmailRequiredForApply: true,
    supportEmailProvided: Boolean(supportEmail),
    supportEmailPrinted: false,
    emailPasswordEnabled: false,
    anonymousEnabled: false,
    phoneEnabled: false,
    addsLocalhostAuthorizedDomain: false,
    verifiesWebAppCount: true,
    verifiesFirestoreEmpty: true,
    verifiesFirestoreRulesStillDenyAll: true,
    writesPersistentAuthConfigFile: false,
    opensFirestoreRules: false,
    changesIam: false,
    deploysFunctions: false,
    enablesStorageV4Write: false,
    mutatesApplicationData: false,
    confirmationRequiredForApply: CONFIRMATION,
  }, null, 2));
  if (!apply) return;

  const gcloud = resolveCommand('gcloud');
  if (!gcloud) fail('No se encontró gcloud.');
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer la cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');

  await Promise.all([assertWebAppAndEmptyData(token), assertLockedRules(token)]);
  console.log(JSON.stringify({ stage: 'security-precheck-pass', project: PROJECT }, null, 2));

  runChecked(gcloud, [
    'services', 'enable', 'identitytoolkit.googleapis.com',
    `--project=${PROJECT}`,
    '--quiet',
  ], 'No se pudo habilitar Identity Toolkit API');
  console.log(JSON.stringify({ stage: 'identity-api-ready', project: PROJECT }, null, 2));

  const before = await request(
    `${IDENTITY_API}/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`,
    token,
    { allow404: true }
  );
  console.log(JSON.stringify({
    stage: 'auth-before',
    project: PROJECT,
    googleProviderPresent: Boolean(before),
    googleProviderEnabled: before?.enabled === true,
    clientCredentialsPrinted: false,
  }, null, 2));

  const firebaseCli = resolve(process.cwd(), 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  if (!existsSync(firebaseCli)) fail('No se encontró Firebase CLI local; ejecuta npm install antes del apply.');

  const tempConfig = resolve(process.cwd(), `.firebase.l1.auth.prod.${process.pid}.json`);
  const authConfig = {
    auth: {
      providers: {
        anonymous: false,
        emailPassword: false,
        googleSignIn: {
          oAuthBrandDisplayName: OAUTH_BRAND_DISPLAY_NAME,
          supportEmail,
        },
      },
    },
  };

  try {
    writeFileSync(tempConfig, `${JSON.stringify(authConfig, null, 2)}\n`, 'utf8');
    runChecked(process.execPath, [
      firebaseCli,
      'deploy',
      '--only', 'auth',
      '--project', PROJECT,
      '--config', tempConfig,
      '--non-interactive',
    ], 'Firebase deploy de Authentication L1 falló');
  } finally {
    if (existsSync(tempConfig)) unlinkSync(tempConfig);
  }
  console.log(JSON.stringify({ stage: 'auth-deployed', project: PROJECT, googleSignIn: true }, null, 2));

  const verification = await verifyAuth(token);
  console.log(JSON.stringify({
    phase: 'L1',
    pass: true,
    project: PROJECT,
    googleSignInEnabled: verification.googleEnabled,
    googleOAuthClientPresent: verification.googleOAuthClientPresent,
    googleOAuthSecretPresent: verification.googleOAuthSecretPresent,
    oauthClientCredentialsPrinted: false,
    supportEmailPrinted: false,
    emailPasswordEnabled: verification.emailPasswordEnabled,
    anonymousEnabled: verification.anonymousEnabled,
    phoneEnabled: verification.phoneEnabled,
    localhostAuthorized: verification.localhostAuthorized,
    authorizedDomainCountObserved: verification.authorizedDomainCount,
    firestoreRulesOpened: false,
    functionsDeployed: false,
    storageV4WriteEnabled: false,
    applicationDataMutated: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = error?.exitCode || 1;
});
