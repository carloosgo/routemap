/* global process, console, fetch */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PROJECT = 'atlasmap-dev';
const REGION = 'us-central1';
const FUNCTION = 'storageV4ProviderOutageProbe';
const FUNCTION_RESOURCE = `projects/${PROJECT}/locations/${REGION}/functions/${FUNCTION}`;
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const cliArgs = process.argv.slice(2);
const apply = cliArgs.includes('--apply');
const verifyExisting = cliArgs.includes('--verify-existing');
const execute = apply || verifyExisting;

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

if (apply && verifyExisting) {
  fail('Usa solo uno de --apply o --verify-existing.');
}

function resolveFirebaseCliScript() {
  const packageJsonPath = join(repoRoot, 'node_modules', 'firebase-tools', 'package.json');
  if (!existsSync(packageJsonPath)) return null;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const binEntry = typeof packageJson.bin === 'string'
      ? packageJson.bin
      : packageJson.bin?.firebase;
    if (!binEntry) return null;
    const cliScript = join(dirname(packageJsonPath), binEntry);
    return existsSync(cliScript) ? cliScript : null;
  } catch {
    return null;
  }
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

function runProcess(executable, args, { cwd = repoRoot, inherit = false } = {}) {
  const options = {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    stdio: inherit ? 'inherit' : 'pipe',
  };
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

function runGcloud(gcloud, args) {
  const result = runProcess(gcloud, args);
  if (result.error) fail(`No se pudo ejecutar gcloud: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    fail(`gcloud fallo al ejecutar "gcloud ${args.join(' ')}": ${detail || `exit ${result.status}`}`);
  }
  return String(result.stdout || '').trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function hasPublicRunInvoker(policy) {
  return asArray(policy?.bindings).some((binding) => (
    binding?.role === 'roles/run.invoker'
    && asArray(binding?.members).some((member) => (
      member === 'allUsers' || member === 'allAuthenticatedUsers'
    ))
  ));
}

function callShowsExpectedOutage(payload) {
  const text = JSON.stringify(payload || {});
  return (
    text.includes('network-error')
    && text.includes('geoapify')
    && text.includes('geocode-search')
  );
}

function matchingProviderMetricLogs(entries) {
  return asArray(entries).filter((entry) => {
    const payload = entry?.jsonPayload || {};
    return (
      payload.message === 'storage_v4_provider_request_metric'
      && payload.provider === 'geoapify'
      && payload.operation === 'geocode-search'
      && payload.outcome === 'network-error'
    );
  });
}

async function requestJson(url, { token, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project': PROJECT,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    fail(`No se pudo contactar Google Cloud API: ${error?.message || error}`);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const apiMessage = String(payload?.error?.message || payload?.raw || '').trim();
    fail(`Google Cloud API HTTP ${response.status}: ${apiMessage || response.statusText}`);
  }
  return payload;
}

async function readProbeMetricLogs(accessToken, serviceName, startedAtUtc) {
  const filter = [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${serviceName}"`,
    'jsonPayload.message="storage_v4_provider_request_metric"',
    'jsonPayload.provider="geoapify"',
    'jsonPayload.operation="geocode-search"',
    'jsonPayload.outcome="network-error"',
    `timestamp>="${startedAtUtc}"`,
  ].join(' AND ');

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await requestJson('https://logging.googleapis.com/v2/entries:list', {
      token: accessToken,
      method: 'POST',
      body: {
        resourceNames: [`projects/${PROJECT}`],
        filter,
        orderBy: 'timestamp desc',
        pageSize: 20,
      },
    });
    const matches = matchingProviderMetricLogs(result?.entries);
    if (matches.length > 0 || attempt >= 7) return matches;
    await delay(1500);
  }
  return [];
}

const plan = {
  project: PROJECT,
  region: REGION,
  applyRequested: apply,
  verifyExistingRequested: verifyExisting,
  function: FUNCTION,
  probeKind: 'synthetic-network-outage',
  usesProductionProviderEndpoint: false,
  usesProviderApiKey: false,
  deploymentSkipped: verifyExisting,
  deploysExactlyOnePrivateProbeFunction: apply,
  invokesProbeExactlyOnce: execute,
  verifiesCloudLoggingMetric: execute,
  cloudVerificationTransport: 'google-cloud-rest',
  mutatesApplicationData: false,
  mutatesBudgets: false,
  changesAlertPolicies: false,
  enablesStorageV4Write: false,
  touchesProduction: false,
};
console.log(JSON.stringify(plan, null, 2));

if (!execute) {
  console.log('Dry-run: no se desplego ni invoco el provider outage probe.');
  process.exit(0);
}

const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontro una instalacion utilizable de gcloud en PATH o Google Cloud SDK.');

const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') {
  fail('gcloud no tiene una cuenta autenticada activa.');
}

if (apply) {
  const firebaseCliScript = resolveFirebaseCliScript();
  if (!firebaseCliScript) {
    fail('No se encontro Firebase CLI local. Ejecuta npm install en la raiz del proyecto.');
  }

  const deploy = runProcess(
    process.execPath,
    [
      firebaseCliScript,
      'deploy',
      '--only',
      `functions:${FUNCTION}`,
      '--project',
      PROJECT,
      '--non-interactive',
    ],
    { inherit: true }
  );
  if (deploy.error) fail(deploy.error.message);
  if (deploy.status !== 0) fail(`Firebase deploy fallo con codigo ${deploy.status}.`);
} else {
  console.log('Verify-existing: se omite deploy y se valida la funcion ya existente.');
}

const accessToken = runGcloud(gcloud, ['auth', 'print-access-token']);
if (!accessToken) fail('No se pudo obtener un access token de gcloud.');

const description = await requestJson(
  `https://cloudfunctions.googleapis.com/v2/${FUNCTION_RESOURCE}`,
  { token: accessToken }
);
if (description?.state !== 'ACTIVE') {
  fail(`El provider outage probe no esta ACTIVE; estado observado: ${description?.state || 'unknown'}.`);
}
if (description?.environment !== 'GEN_2') {
  fail(`El provider outage probe no es GEN_2; entorno observado: ${description?.environment || 'unknown'}.`);
}

const serviceResource = String(description?.serviceConfig?.service || '');
const serviceName = serviceResource.split('/').filter(Boolean).at(-1) || '';
const serviceUri = String(description?.serviceConfig?.uri || description?.url || '');
if (!serviceResource || !serviceName || !serviceUri) {
  fail('No se pudo resolver el Cloud Run service/URI del provider outage probe.');
}

const [service, iamPolicy] = await Promise.all([
  requestJson(`https://run.googleapis.com/v2/${serviceResource}`, { token: accessToken }),
  requestJson(`https://run.googleapis.com/v2/${serviceResource}:getIamPolicy`, { token: accessToken }),
]);
if (service?.invokerIamDisabled === true || hasPublicRunInvoker(iamPolicy)) {
  fail('Safety check: el provider outage probe es publicamente invocable; se aborta la prueba.');
}

const identityToken = runGcloud(gcloud, ['auth', 'print-identity-token']);
if (!identityToken) fail('No se pudo obtener un identity token de gcloud.');

const startedAtUtc = new Date(Date.now() - 1000).toISOString();
const callPayload = await requestJson(serviceUri, {
  token: identityToken,
  method: 'POST',
  body: {},
});
if (!callShowsExpectedOutage(callPayload)) {
  fail('La invocacion del probe no reporto el network-error sintetico esperado.');
}

const matchingLogs = await readProbeMetricLogs(accessToken, serviceName, startedAtUtc);
if (matchingLogs.length < 1) {
  fail('No aparecio en Cloud Logging el provider request metric network-error esperado.');
}

console.log(JSON.stringify({
  project: PROJECT,
  applied: apply,
  verifiedExisting: verifyExisting,
  providerOutageE2EPassed: true,
  synthetic: true,
  cloudVerificationTransport: 'google-cloud-rest',
  probeFunction: FUNCTION,
  probeFunctionState: 'ACTIVE',
  probeFunctionGeneration: 'GEN_2',
  probeFunctionPrivate: true,
  provider: 'geoapify',
  operation: 'geocode-search',
  observedOutcome: 'network-error',
  matchingProviderMetricLogCount: matchingLogs.length,
  providerApiKeyUntouched: true,
  applicationDataUntouched: true,
  alertPoliciesUntouched: true,
  budgetsUntouched: true,
  storageV4WriteUnchanged: true,
  productionUntouched: true,
}, null, 2));
