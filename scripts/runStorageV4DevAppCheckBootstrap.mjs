/* global process, console, fetch */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_APP_CHECK_PROJECT = 'atlasmap-dev';
export const DEV_APP_CHECK_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_APP_CHECK_WEB_APP_DISPLAY_NAME = 'atlas web dev';
export const DEV_APP_CHECK_HOST = 'atlasmap-dev.web.app';
export const DEV_APP_CHECK_KEY_DISPLAY_NAME = 'AtlasMap Dev App Check';
export const DEV_APP_CHECK_TOKEN_TTL = '3600s';
export const DEV_APP_CHECK_CONFIRMATION = 'ENABLE-ATLAS-DEV-APP-CHECK-BOOTSTRAP';

const FIREBASE_API = 'https://firebase.googleapis.com/v1beta1';
const APP_CHECK_API = 'https://firebaseappcheck.googleapis.com/v1';
const RECAPTCHA_API = 'https://recaptchaenterprise.googleapis.com/v1';
const REQUIRED_SERVICES = Object.freeze([
  'firebaseappcheck.googleapis.com',
  'recaptchaenterprise.googleapis.com',
]);

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

export function parseDevAppCheckBootstrapArgs(args = []) {
  if (!Array.isArray(args)) throw new TypeError('args debe ser un arreglo.');
  let apply = false;
  let confirm = '';
  for (const arg of args) {
    if (arg === '--apply') apply = true;
    else if (arg.startsWith('--confirm=')) confirm = arg.slice('--confirm='.length).trim();
    else fail(`Argumento desconocido: ${arg}`, 2);
  }
  if (!apply && confirm) fail('--confirm solo se admite junto con --apply.', 2);
  if (apply && confirm !== DEV_APP_CHECK_CONFIRMATION) {
    fail(`--apply exige --confirm=${DEV_APP_CHECK_CONFIRMATION}.`, 2);
  }
  return Object.freeze({ apply });
}

function commandCandidates() {
  return process.platform === 'win32'
    ? ['gcloud.cmd', 'gcloud.exe', 'gcloud']
    : ['gcloud'];
}

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return spawnSync('cmd.exe', ['/d', '/c', executable, ...args], options);
  }
  return spawnSync(executable, args, options);
}

function resolveGcloud() {
  for (const candidate of commandCandidates()) {
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

function parseJson(raw, label) {
  try { return JSON.parse(raw || '{}'); }
  catch { fail(`${label}: respuesta JSON inválida.`); }
}

async function requestJson(url, token, {
  method = 'GET',
  body,
  allow404 = false,
} = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-goog-user-project': DEV_APP_CHECK_PROJECT,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

function enabledServices(gcloud) {
  const raw = runChecked(gcloud, [
    'services', 'list', '--enabled',
    `--project=${DEV_APP_CHECK_PROJECT}`,
    '--format=value(config.name)',
  ], 'No se pudieron listar APIs habilitadas');
  return new Set(raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean));
}

function describeProject(gcloud) {
  return parseJson(runChecked(gcloud, [
    'projects', 'describe', DEV_APP_CHECK_PROJECT, '--format=json',
  ], 'No se pudo describir atlasmap-dev'), 'Proyecto dev');
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

async function listRecaptchaKeys(token) {
  const payload = await requestJson(
    `${RECAPTCHA_API}/projects/${DEV_APP_CHECK_PROJECT}/keys?pageSize=1000`,
    token
  );
  return Array.isArray(payload?.keys) ? payload.keys : [];
}

function siteKeyFromResourceName(name) {
  return String(name || '').split('/').filter(Boolean).at(-1) || '';
}

export function assessDevRecaptchaKey(keys = []) {
  const matches = (Array.isArray(keys) ? keys : [])
    .filter((key) => key?.displayName === DEV_APP_CHECK_KEY_DISPLAY_NAME);
  if (matches.length > 1) {
    return Object.freeze({ valid: false, conflict: `Se observaron ${matches.length} claves con el display name esperado.` });
  }
  if (matches.length === 0) {
    return Object.freeze({ valid: true, existing: false, key: null, siteKey: '' });
  }
  const key = matches[0];
  const settings = key?.webSettings || {};
  const domains = Array.isArray(settings.allowedDomains) ? settings.allowedDomains : [];
  const exactDomain = domains.length === 1 && domains[0] === DEV_APP_CHECK_HOST;
  if (
    settings.integrationType !== 'SCORE'
    || settings.allowAllDomains === true
    || settings.allowAmpTraffic === true
    || !exactDomain
    || key?.testingOptions
  ) {
    return Object.freeze({
      valid: false,
      conflict: 'La clave reCAPTCHA existente no coincide con el baseline dev esperado.',
    });
  }
  const siteKey = siteKeyFromResourceName(key?.name);
  if (!siteKey) return Object.freeze({ valid: false, conflict: 'La clave reCAPTCHA existente no tiene resource name válido.' });
  return Object.freeze({ valid: true, existing: true, key, siteKey });
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

function assertNoEnforcedServices(services = []) {
  const enforced = services.filter((service) => service?.enforcementMode === 'ENFORCED');
  if (enforced.length > 0) {
    fail(`Safety check: ya existen ${enforced.length} servicios App Check ENFORCED en dev; bootstrap abortado.`);
  }
}

async function createRecaptchaKey(token) {
  return requestJson(
    `${RECAPTCHA_API}/projects/${DEV_APP_CHECK_PROJECT}/keys`,
    token,
    {
      method: 'POST',
      body: {
        displayName: DEV_APP_CHECK_KEY_DISPLAY_NAME,
        webSettings: {
          allowAllDomains: false,
          allowedDomains: [DEV_APP_CHECK_HOST],
          allowAmpTraffic: false,
          integrationType: 'SCORE',
        },
      },
    }
  );
}

async function registerEnterpriseConfig(token, projectNumber, appId, siteKey) {
  const name = `projects/${projectNumber}/apps/${appId}/recaptchaEnterpriseConfig`;
  return requestJson(
    `${APP_CHECK_API}/projects/${projectNumber}/apps/${encodeURIComponent(appId)}/recaptchaEnterpriseConfig?updateMask=siteKey,tokenTtl`,
    token,
    {
      method: 'PATCH',
      body: {
        name,
        siteKey,
        tokenTtl: DEV_APP_CHECK_TOKEN_TTL,
      },
    }
  );
}

function sameEnforcement(before = [], after = []) {
  const normalize = (items) => [...items]
    .map(({ name, enforcementMode, replayProtection }) => `${name}|${enforcementMode}|${replayProtection}`)
    .sort();
  return JSON.stringify(normalize(before)) === JSON.stringify(normalize(after));
}

export async function runStorageV4DevAppCheckBootstrap({
  args = process.argv.slice(2),
  gcloud = resolveGcloud(),
  log = (value) => console.log(value),
} = {}) {
  const { apply } = parseDevAppCheckBootstrapArgs(args);
  log(JSON.stringify({
    project: DEV_APP_CHECK_PROJECT,
    productionProject: DEV_APP_CHECK_PRODUCTION_PROJECT,
    mode: apply ? 'apply' : 'dry-run',
    operation: 'development-app-check-enterprise-bootstrap',
    hostingDomain: DEV_APP_CHECK_HOST,
    provider: 'recaptcha-enterprise',
    recaptchaIntegrationType: 'SCORE',
    recaptchaAllowedDomains: [DEV_APP_CHECK_HOST],
    allowAllRecaptchaDomains: false,
    usesRecaptchaTestingOptions: false,
    appCheckTokenTtl: DEV_APP_CHECK_TOKEN_TTL,
    riskThresholdExplicitlyChanged: false,
    defaultRiskThresholdRetained: true,
    enablesRequiredApisIfMissing: apply,
    createsRecaptchaKeyIfMissing: apply,
    registersAppCheckIfMissingOrIncomplete: apply,
    changesAppCheckEnforcement: false,
    monitoringModeChanged: false,
    deploysClient: false,
    deploysFunctions: false,
    changesFirestoreRules: false,
    changesAuthProviders: false,
    writesEnvironmentFiles: false,
    printsSiteKeyValue: false,
    registersDebugTokens: false,
    touchesProduction: false,
    mutatesCloud: apply,
    confirmationRequiredForApply: DEV_APP_CHECK_CONFIRMATION,
  }, null, 2));

  if (!gcloud) fail('No se encontró gcloud.');
  assertDevTarget(gcloud);

  const project = describeProject(gcloud);
  const projectNumber = String(project?.projectNumber || '').trim();
  if (!/^\d+$/.test(projectNumber)) fail('No se pudo resolver projectNumber de atlasmap-dev.');
  const token = runChecked(gcloud, ['auth', 'print-access-token'], 'No se pudo obtener access token');
  const webApp = await resolveWebApp(token);

  let services = enabledServices(gcloud);
  const missingApis = REQUIRED_SERVICES.filter((service) => !services.has(service));
  let recaptchaAssessment = null;
  let enterpriseConfig = null;
  let enforcementBefore = [];

  if (services.has('recaptchaenterprise.googleapis.com')) {
    recaptchaAssessment = assessDevRecaptchaKey(await listRecaptchaKeys(token));
    if (!recaptchaAssessment.valid) fail(recaptchaAssessment.conflict);
  }
  if (services.has('firebaseappcheck.googleapis.com')) {
    enterpriseConfig = await getEnterpriseConfig(token, projectNumber, webApp.appId);
    enforcementBefore = summarizeEnforcement(await listAppCheckServices(token, projectNumber));
    assertNoEnforcedServices(enforcementBefore);
  }

  const existingConfigHasSiteKey = Boolean(enterpriseConfig?.siteKey);
  const configMismatch = Boolean(
    recaptchaAssessment?.siteKey
    && enterpriseConfig?.siteKey
    && enterpriseConfig.siteKey !== recaptchaAssessment.siteKey
  );
  if (configMismatch) fail('App Check ya apunta a una site key distinta del baseline dev esperado.');

  log(JSON.stringify({
    stage: 'precheck',
    project: DEV_APP_CHECK_PROJECT,
    webAppDisplayName: webApp.displayName,
    appIdObserved: true,
    appIdPrinted: false,
    appCheckApiEnabled: services.has('firebaseappcheck.googleapis.com'),
    recaptchaEnterpriseApiEnabled: services.has('recaptchaenterprise.googleapis.com'),
    missingApis,
    recaptchaKeyProbeStatus: services.has('recaptchaenterprise.googleapis.com') ? 'ok' : 'api-disabled',
    expectedRecaptchaKeyExists: recaptchaAssessment?.existing === true,
    appCheckConfigProbeStatus: services.has('firebaseappcheck.googleapis.com') ? 'ok' : 'api-disabled',
    appCheckEnterpriseConfigObserved: Boolean(enterpriseConfig),
    appCheckEnterpriseSiteKeyConfigured: existingConfigHasSiteKey,
    configuredTokenTtl: enterpriseConfig?.tokenTtl || null,
    enforcementConfigurationsObserved: enforcementBefore.length,
    enforcedServicesObserved: enforcementBefore.filter((item) => item.enforcementMode === 'ENFORCED').length,
    canApply: true,
  }, null, 2));

  if (!apply) {
    log(JSON.stringify({
      pass: true,
      mode: 'dry-run',
      cloudChanged: false,
      apisWouldEnable: missingApis,
      recaptchaKeyWouldCreate: services.has('recaptchaenterprise.googleapis.com')
        ? recaptchaAssessment?.existing !== true
        : true,
      appCheckRegistrationWouldChange: !enterpriseConfig?.siteKey
        || enterpriseConfig?.tokenTtl !== DEV_APP_CHECK_TOKEN_TTL,
      enforcementWouldChange: false,
      clientDeploymentWouldRun: false,
      touchesProduction: false,
    }, null, 2));
    return;
  }

  if (missingApis.length > 0) {
    runChecked(gcloud, [
      'services', 'enable', ...missingApis,
      `--project=${DEV_APP_CHECK_PROJECT}`,
      '--quiet',
    ], 'No se pudieron habilitar APIs de App Check dev');
    log(JSON.stringify({ stage: 'required-apis-enabled', count: missingApis.length }, null, 2));
  }

  services = enabledServices(gcloud);
  for (const required of REQUIRED_SERVICES) {
    if (!services.has(required)) fail(`Post-check: ${required} no quedó habilitada.`);
  }

  enforcementBefore = summarizeEnforcement(await listAppCheckServices(token, projectNumber));
  assertNoEnforcedServices(enforcementBefore);

  recaptchaAssessment = assessDevRecaptchaKey(await listRecaptchaKeys(token));
  if (!recaptchaAssessment.valid) fail(recaptchaAssessment.conflict);
  if (!recaptchaAssessment.existing) {
    const created = await createRecaptchaKey(token);
    const createdAssessment = assessDevRecaptchaKey([created]);
    if (!createdAssessment.valid || !createdAssessment.existing) {
      fail('La clave reCAPTCHA dev creada no cumple el baseline esperado.');
    }
    recaptchaAssessment = createdAssessment;
    log(JSON.stringify({
      stage: 'recaptcha-enterprise-key-created',
      displayName: DEV_APP_CHECK_KEY_DISPLAY_NAME,
      allowedDomain: DEV_APP_CHECK_HOST,
      integrationType: 'SCORE',
      siteKeyPrinted: false,
    }, null, 2));
  }

  enterpriseConfig = await getEnterpriseConfig(token, projectNumber, webApp.appId);
  if (enterpriseConfig?.siteKey && enterpriseConfig.siteKey !== recaptchaAssessment.siteKey) {
    fail('App Check dev ya está registrado con otra site key; no será sobrescrito automáticamente.');
  }
  if (
    enterpriseConfig?.siteKey !== recaptchaAssessment.siteKey
    || enterpriseConfig?.tokenTtl !== DEV_APP_CHECK_TOKEN_TTL
  ) {
    await registerEnterpriseConfig(token, projectNumber, webApp.appId, recaptchaAssessment.siteKey);
    log(JSON.stringify({
      stage: 'app-check-enterprise-registered',
      tokenTtl: DEV_APP_CHECK_TOKEN_TTL,
      siteKeyPrinted: false,
      enforcementEnabled: false,
    }, null, 2));
  }

  const finalKeys = assessDevRecaptchaKey(await listRecaptchaKeys(token));
  if (!finalKeys.valid || !finalKeys.existing) fail('Post-check: clave reCAPTCHA dev ausente o inválida.');
  const finalConfig = await getEnterpriseConfig(token, projectNumber, webApp.appId);
  if (finalConfig?.siteKey !== finalKeys.siteKey) fail('Post-check: App Check no apunta a la clave reCAPTCHA esperada.');
  if (finalConfig?.tokenTtl !== DEV_APP_CHECK_TOKEN_TTL) fail('Post-check: App Check token TTL no coincide con 1 hora.');
  const enforcementAfter = summarizeEnforcement(await listAppCheckServices(token, projectNumber));
  assertNoEnforcedServices(enforcementAfter);
  if (!sameEnforcement(enforcementBefore, enforcementAfter)) {
    fail('Post-check: la configuración de enforcement cambió durante bootstrap; se aborta para revisión.');
  }

  log(JSON.stringify({
    project: DEV_APP_CHECK_PROJECT,
    pass: true,
    appCheckApiEnabled: true,
    recaptchaEnterpriseApiEnabled: true,
    expectedRecaptchaKeyReady: true,
    appCheckEnterpriseRegistrationReady: true,
    appCheckTokenTtl: DEV_APP_CHECK_TOKEN_TTL,
    recaptchaDomainRestricted: true,
    recaptchaIntegrationType: 'SCORE',
    siteKeyValuePrinted: false,
    appCheckEnforcementChanged: false,
    appCheckEnforcementEnabled: false,
    clientDeployed: false,
    debugTokenRegistered: false,
    productionMutated: false,
  }, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevAppCheckBootstrap().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = error?.exitCode || 1;
  });
}
