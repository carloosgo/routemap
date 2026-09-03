/* global process, console, fetch */
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEV_TTL_COLLECTION_GROUPS } from './storageV4DevTtlManifest.mjs';

export const DEV_PLATFORM_PROJECT = 'atlasmap-dev';
export const DEV_PLATFORM_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS = DEV_TTL_COLLECTION_GROUPS;

const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';
const IDENTITY_API = 'https://identitytoolkit.googleapis.com/admin/v2';
const APP_CHECK_API = 'https://firebaseappcheck.googleapis.com/v1';
const HOSTING_API = 'https://firebasehosting.googleapis.com/v1beta1';

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevPlatformParityArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  if (args.length > 0) {
    throw new TypeError('Este inventario es read-only y no admite argumentos, --apply ni --confirm.');
  }
  return Object.freeze({});
}

function commandCandidates(name) {
  if (process.platform !== 'win32') return [name];
  const candidates = [`${name}.cmd`, `${name}.exe`, name];
  if (name === 'gcloud' && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    const hasPath = executable.includes('\\') || executable.includes('/');
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', hasPath ? basename(executable) : executable, ...args], {
      ...options,
      ...(hasPath ? { cwd: dirname(executable) } : {}),
    });
  }
  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  for (const candidate of commandCandidates('gcloud')) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

function runChecked(gcloud, args, label) {
  const result = runProcess(gcloud, args);
  if (result.error) fail(`${label}: ${result.error.message}`);
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  if (result.status !== 0) fail(`${label}: ${stderr || stdout || `exit ${result.status}`}`);
  return stdout;
}

function runJsonProbe(gcloud, args) {
  const result = runProcess(gcloud, [...args, '--format=json']);
  const stdout = String(result.stdout || '').trim();
  if (result.error || result.status !== 0) {
    return Object.freeze({ status: 'unavailable', data: null });
  }
  try {
    return Object.freeze({ status: 'ok', data: stdout ? JSON.parse(stdout) : [] });
  } catch {
    return Object.freeze({ status: 'invalid-json', data: null });
  }
}

function serviceEnabled(gcloud, service) {
  const value = runChecked(gcloud, [
    'services', 'list', '--enabled', `--project=${DEV_PLATFORM_PROJECT}`,
    `--filter=config.name:${service}`, '--format=value(config.name)',
  ], `No se pudo consultar ${service}`);
  return value.split(/\r?\n/).map((item) => item.trim()).includes(service);
}

async function requestProbe(url, token) {
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': DEV_PLATFORM_PROJECT,
      },
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = { raw: text.slice(0, 300) }; }
    }
    return Object.freeze({
      status: response.ok ? 'ok' : 'unavailable',
      httpStatus: response.status,
      payload: response.ok ? payload : null,
    });
  } catch {
    return Object.freeze({ status: 'unavailable', httpStatus: null, payload: null });
  }
}

function resourceId(name) {
  return String(name || '').split('/').pop() || '';
}

export function summarizeTtlPolicies(rawPolicies = []) {
  const policies = Array.isArray(rawPolicies) ? rawPolicies : [];
  return policies.map((policy) => {
    const name = String(policy?.name || '');
    const match = name.match(/\/collectionGroups\/([^/]+)\/fields\/([^/]+)$/);
    return Object.freeze({
      collectionGroup: match?.[1] || null,
      field: match?.[2] || null,
      state: policy?.ttlConfig?.state || null,
    });
  }).filter((policy) => policy.collectionGroup && policy.field);
}

export function derivePlatformParity({
  firestore = {},
  webApps = [],
  hostingSites = [],
  googleAuth = null,
  authConfig = null,
  services = {},
  appCheckConfigs = [],
  ttlPolicies = [],
} = {}) {
  const activeWebApps = (Array.isArray(webApps) ? webApps : []).filter((app) => app?.state !== 'DELETED');
  const sites = Array.isArray(hostingSites) ? hostingSites : [];
  const appCheck = Array.isArray(appCheckConfigs) ? appCheckConfigs : [];
  const ttl = Array.isArray(ttlPolicies) ? ttlPolicies : [];
  const expectedTtl = DEV_PLATFORM_EXPECTED_TTL_COLLECTIONS;
  const ttlOnExpiresAt = ttl.filter((policy) => policy.field === 'expiresAt');
  const activeTtlCollections = new Set(ttlOnExpiresAt
    .filter((policy) => policy.state === 'ACTIVE')
    .map((policy) => policy.collectionGroup));
  const pendingTtlCollectionsSet = new Set(ttlOnExpiresAt
    .filter((policy) => policy.state === 'CREATING')
    .map((policy) => policy.collectionGroup));
  const configuredTtlCollections = new Set([...activeTtlCollections, ...pendingTtlCollectionsSet]);
  const missingTtlCollections = expectedTtl.filter((collection) => !configuredTtlCollections.has(collection));
  const pendingTtlCollections = expectedTtl.filter((collection) => pendingTtlCollectionsSet.has(collection));
  const notActiveTtlCollections = expectedTtl.filter((collection) => !activeTtlCollections.has(collection));
  const authorizedDomains = Array.isArray(authConfig?.authorizedDomains) ? authConfig.authorizedDomains : [];

  const gaps = [];
  if (firestore?.deleteProtectionState !== 'DELETE_PROTECTION_ENABLED') gaps.push('firestore-delete-protection');
  if (firestore?.pointInTimeRecoveryEnablement !== 'POINT_IN_TIME_RECOVERY_ENABLED') gaps.push('firestore-pitr');
  if (activeWebApps.length === 0) gaps.push('firebase-web-app');
  if (googleAuth?.enabled !== true) gaps.push('google-auth');
  if (sites.length === 0) gaps.push('firebase-hosting-preprod-url');
  if (services.firebaseAppCheck !== true) gaps.push('firebase-app-check-api');
  if (services.recaptchaEnterprise !== true) gaps.push('recaptcha-enterprise-api');
  if (appCheck.length === 0 || appCheck.every((config) => !config?.siteKeyConfigured)) gaps.push('app-check-registration');
  if (notActiveTtlCollections.length > 0) gaps.push('firestore-ttl-policies');

  return Object.freeze({
    firestoreDeleteProtectionEnabled: firestore?.deleteProtectionState === 'DELETE_PROTECTION_ENABLED',
    firestorePitrEnabled: firestore?.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED',
    firebaseWebAppCount: activeWebApps.length,
    firebaseWebAppDisplayNames: Object.freeze(activeWebApps.map((app) => app?.displayName || null)),
    googleAuthEnabled: googleAuth?.enabled === true,
    emailPasswordEnabled: authConfig?.signIn?.email?.enabled === true,
    anonymousAuthEnabled: authConfig?.signIn?.anonymous?.enabled === true,
    phoneAuthEnabled: authConfig?.signIn?.phoneNumber?.enabled === true,
    authorizedDomainCount: authorizedDomains.length,
    localhostAuthorizedForAuth: authorizedDomains.some((domain) => domain === 'localhost' || domain.startsWith('localhost:')),
    hostingSiteCount: sites.length,
    hostingSites: Object.freeze(sites.map((site) => Object.freeze({
      siteId: resourceId(site?.name),
      type: site?.type || null,
      defaultUrl: site?.defaultUrl || null,
      associatedWebApp: Boolean(site?.appId),
    }))),
    services: Object.freeze({ ...services }),
    appCheckRegistrationCount: appCheck.length,
    appCheckConfigs: Object.freeze(appCheck),
    ttlPolicyCount: ttl.length,
    activeExpectedTtlCount: activeTtlCollections.size,
    configuredExpectedTtlCount: configuredTtlCollections.size,
    expectedTtlCount: expectedTtl.length,
    missingTtlCollections: Object.freeze(missingTtlCollections),
    pendingTtlCollections: Object.freeze(pendingTtlCollections),
    notActiveTtlCollections: Object.freeze(notActiveTtlCollections),
    gaps: Object.freeze(gaps),
    fullPlatformParityReady: gaps.length === 0,
  });
}

export async function runStorageV4DevPlatformParityPreflight({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
} = {}) {
  parseDevPlatformParityArgs(args);
  log(JSON.stringify({
    project: DEV_PLATFORM_PROJECT,
    mode: 'read-only-platform-parity-inventory',
    productionProject: DEV_PLATFORM_PRODUCTION_PROJECT,
    checks: [
      'Firestore recovery/delete protection',
      'Firebase Web App and Google Auth',
      'Firebase Hosting site inventory',
      'App Check/reCAPTCHA Enterprise APIs and registration',
      'Secret Manager and Identity Toolkit service readiness',
      'Firestore TTL policies for internal expiring collections',
    ],
    mutatesCloud: false,
    mutatesIam: false,
    changesAuth: false,
    createsHostingSite: false,
    registersAppCheck: false,
    changesTtl: false,
    touchesProduction: false,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  const account = runChecked(gcloud, ['config', 'get-value', 'account'], 'No se pudo leer cuenta gcloud activa');
  if (!account || account === '(unset)') fail('gcloud no tiene una cuenta autenticada activa.');
  const project = JSON.parse(runChecked(gcloud, ['projects', 'describe', DEV_PLATFORM_PROJECT, '--format=json'], 'No se pudo describir atlasmap-dev'));
  if (project?.projectId !== DEV_PLATFORM_PROJECT) fail('El proyecto observado no coincide con atlasmap-dev.');

  const firestore = JSON.parse(runChecked(gcloud, [
    'firestore', 'databases', 'describe', '--database=(default)', `--project=${DEV_PLATFORM_PROJECT}`, '--format=json',
  ], 'No se pudo describir Firestore dev'));
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');

  const services = Object.freeze({
    firebaseHosting: serviceEnabled(gcloud, 'firebasehosting.googleapis.com'),
    firebaseAppCheck: serviceEnabled(gcloud, 'firebaseappcheck.googleapis.com'),
    recaptchaEnterprise: serviceEnabled(gcloud, 'recaptchaenterprise.googleapis.com'),
    secretManager: serviceEnabled(gcloud, 'secretmanager.googleapis.com'),
    identityToolkit: serviceEnabled(gcloud, 'identitytoolkit.googleapis.com'),
  });

  const [appsProbe, hostingProbe, googleProbe, authProbe] = await Promise.all([
    requestProbe(`${FIREBASE_API}/projects/${DEV_PLATFORM_PROJECT}/webApps?pageSize=100`, token),
    services.firebaseHosting
      ? requestProbe(`${HOSTING_API}/projects/${DEV_PLATFORM_PROJECT}/sites?pageSize=100`, token)
      : Promise.resolve({ status: 'service-disabled', httpStatus: null, payload: null }),
    services.identityToolkit
      ? requestProbe(`${IDENTITY_API}/projects/${DEV_PLATFORM_PROJECT}/defaultSupportedIdpConfigs/google.com`, token)
      : Promise.resolve({ status: 'service-disabled', httpStatus: null, payload: null }),
    services.identityToolkit
      ? requestProbe(`${IDENTITY_API}/projects/${DEV_PLATFORM_PROJECT}/config`, token)
      : Promise.resolve({ status: 'service-disabled', httpStatus: null, payload: null }),
  ]);

  const webApps = Array.isArray(appsProbe?.payload?.apps) ? appsProbe.payload.apps : [];
  const hostingSites = Array.isArray(hostingProbe?.payload?.sites) ? hostingProbe.payload.sites : [];
  const googleAuth = googleProbe?.payload || null;
  const authConfig = authProbe?.payload || null;

  let appCheckConfigs = [];
  if (services.firebaseAppCheck && /^\d+$/.test(String(project?.projectNumber || ''))) {
    const activeApps = webApps.filter((app) => app?.state !== 'DELETED' && app?.appId);
    const probes = await Promise.all(activeApps.map(async (app) => {
      const probe = await requestProbe(
        `${APP_CHECK_API}/projects/${project.projectNumber}/apps/${encodeURIComponent(app.appId)}/recaptchaEnterpriseConfig`,
        token
      );
      return Object.freeze({
        displayName: app.displayName || null,
        status: probe.status,
        httpStatus: probe.httpStatus,
        siteKeyConfigured: Boolean(probe?.payload?.siteKey),
        tokenTtl: probe?.payload?.tokenTtl || null,
        riskThreshold: probe?.payload?.riskAnalysis?.minValidScore ?? null,
        siteKeyPrinted: false,
      });
    }));
    appCheckConfigs = probes.filter((probe) => probe.status === 'ok');
  }

  const ttlProbe = runJsonProbe(gcloud, [
    'firestore', 'fields', 'ttls', 'list', '--database=(default)', `--project=${DEV_PLATFORM_PROJECT}`,
  ]);
  const ttlPolicies = ttlProbe.status === 'ok' ? summarizeTtlPolicies(ttlProbe.data) : [];

  const parity = derivePlatformParity({
    firestore,
    webApps,
    hostingSites,
    googleAuth,
    authConfig,
    services,
    appCheckConfigs,
    ttlPolicies,
  });

  log(JSON.stringify({
    project: DEV_PLATFORM_PROJECT,
    pass: true,
    firestoreLocation: firestore?.locationId || null,
    versionRetentionPeriod: firestore?.versionRetentionPeriod || null,
    ttlProbeStatus: ttlProbe.status,
    probes: {
      firebaseWebApps: appsProbe.status,
      hosting: hostingProbe.status,
      googleAuth: googleProbe.status,
      authConfig: authProbe.status,
    },
    ...parity,
    mutatesCloud: false,
    touchesProduction: false,
  }, null, 2));
  return parity;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevPlatformParityPreflight().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}
