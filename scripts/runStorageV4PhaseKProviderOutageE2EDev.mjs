/* global process, console */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PROJECT = 'atlasmap-dev';
const REGION = 'us-central1';
const FUNCTION = 'storageV4ProviderOutageProbe';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const apply = process.argv.slice(2).includes('--apply');

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
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
    candidates.unshift(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
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
    fail(`gcloud fallo: ${detail || args.join(' ')}`);
  }
  return String(result.stdout || '').trim();
}

function runGcloudJson(gcloud, args) {
  const text = runGcloud(gcloud, [...args, '--format=json']);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    fail(`gcloud devolvio JSON invalido para: ${args.join(' ')}`);
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function hasPublicRunInvoker(policy) {
  return asArray(policy?.bindings).some((binding) => (
    binding?.role === 'roles/run.invoker'
    && asArray(binding?.members).includes('allUsers')
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

function readProbeMetricLogs(gcloud, serviceName, startedAtUtc) {
  const filter = [
    'resource.type="cloud_run_revision"',
    `resource.labels.service_name="${serviceName}"`,
    'jsonPayload.message="storage_v4_provider_request_metric"',
    'jsonPayload.provider="geoapify"',
    'jsonPayload.operation="geocode-search"',
    'jsonPayload.outcome="network-error"',
    `timestamp>="${startedAtUtc}"`,
  ].join(' AND ');

  function poll(attempt) {
    const entries = runGcloudJson(gcloud, [
      'logging', 'read', filter,
      `--project=${PROJECT}`,
      '--limit=20',
      '--order=asc',
    ]);
    const matches = matchingProviderMetricLogs(entries);
    if (matches.length > 0 || attempt >= 7) return Promise.resolve(matches);
    return delay(1500).then(() => poll(attempt + 1));
  }

  return poll(0);
}

const plan = {
  project: PROJECT,
  region: REGION,
  applyRequested: apply,
  function: FUNCTION,
  probeKind: 'synthetic-network-outage',
  usesProductionProviderEndpoint: false,
  usesProviderApiKey: false,
  deploysExactlyOnePrivateProbeFunction: Boolean(apply),
  invokesProbeExactlyOnce: Boolean(apply),
  verifiesCloudLoggingMetric: Boolean(apply),
  mutatesApplicationData: false,
  mutatesBudgets: false,
  changesAlertPolicies: false,
  enablesStorageV4Write: false,
  touchesProduction: false,
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log('Dry-run: no se desplego ni invoco el provider outage probe.');
  process.exit(0);
}

const firebaseCliScript = resolveFirebaseCliScript();
if (!firebaseCliScript) {
  fail('No se encontro Firebase CLI local. Ejecuta npm install en la raiz del proyecto.');
}

const gcloud = resolveGcloud();
if (!gcloud) fail('No se encontro una instalacion utilizable de gcloud.');

const activeAccount = runGcloud(gcloud, ['config', 'get-value', 'account']);
if (!activeAccount || activeAccount === '(unset)') {
  fail('gcloud no tiene una cuenta autenticada activa.');
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

const description = runGcloudJson(gcloud, [
  'functions', 'describe', FUNCTION,
  '--v2',
  `--region=${REGION}`,
  `--project=${PROJECT}`,
]);
if (description?.state !== 'ACTIVE') {
  fail(`El provider outage probe no quedo ACTIVE; estado observado: ${description?.state || 'unknown'}.`);
}

const serviceResource = String(description?.serviceConfig?.service || '');
const serviceName = serviceResource.split('/').filter(Boolean).at(-1) || '';
if (!serviceName) fail('No se pudo resolver el Cloud Run service del provider outage probe.');

const iamPolicy = runGcloudJson(gcloud, [
  'run', 'services', 'get-iam-policy', serviceName,
  `--region=${REGION}`,
  `--project=${PROJECT}`,
]);
if (hasPublicRunInvoker(iamPolicy)) {
  fail('Safety check: el provider outage probe quedo publicamente invocable; se aborta la prueba.');
}

const startedAtUtc = new Date(Date.now() - 1000).toISOString();
const callPayload = runGcloudJson(gcloud, [
  'functions', 'call', FUNCTION,
  `--region=${REGION}`,
  `--project=${PROJECT}`,
  '--data={}',
]);
if (!callShowsExpectedOutage(callPayload)) {
  fail('La invocacion del probe no reporto el network-error sintetico esperado.');
}

const matchingLogs = await readProbeMetricLogs(gcloud, serviceName, startedAtUtc);
if (matchingLogs.length < 1) {
  fail('No aparecio en Cloud Logging el provider request metric network-error esperado.');
}

console.log(JSON.stringify({
  project: PROJECT,
  applied: true,
  providerOutageE2EPassed: true,
  synthetic: true,
  probeFunction: FUNCTION,
  probeFunctionState: 'ACTIVE',
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
