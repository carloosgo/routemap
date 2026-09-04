import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const functionPath = new URL('../functions/v4ProviderOutageProbeFunction.js', import.meta.url);
const indexPath = new URL('../functions/index.js', import.meta.url);
const runnerPath = new URL('../scripts/runStorageV4PhaseKProviderOutageE2EDev.mjs', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);

test('provider outage probe usa limitedFetch real contra una falla sintetica local y privada', async () => {
  const source = await readFile(functionPath, 'utf8');

  assert.ok(source.includes("invoker: 'private'"));
  assert.ok(source.includes("'http://127.0.0.1:65534/v1/geocode/search?phase_k_probe=1'"));
  assert.ok(source.includes('await limitedFetch('));
  assert.ok(source.includes("'Geoapify Phase K synthetic outage probe'"));
  assert.ok(source.includes("observedOutcome: 'network-error'"));
  assert.ok(source.includes("provider: 'geoapify'"));
  assert.ok(source.includes("operation: 'geocode-search'"));
  assert.doesNotMatch(source, /GEOAPIFY_API_KEY|defineSecret|requireGeoapifyKey/);
});

test('provider outage runner es dry-run por defecto y despliega solo el probe con apply', async () => {
  const source = await readFile(runnerPath, 'utf8');

  assert.ok(source.includes("const PROJECT = 'atlasmap-dev'"));
  assert.ok(source.includes("const FUNCTION = 'storageV4ProviderOutageProbe'"));
  assert.ok(source.includes("cliArgs.includes('--apply')"));
  assert.ok(source.includes("cliArgs.includes('--verify-existing')"));
  assert.ok(source.includes('if (apply && verifyExisting)'));
  assert.ok(source.includes('Dry-run: no se desplego ni invoco el provider outage probe.'));
  assert.ok(source.includes('if (apply) {'));
  assert.ok(source.includes('`functions:${FUNCTION}`'));
  assert.ok(source.includes('Verify-existing: se omite deploy y se valida la funcion ya existente.'));
  assert.doesNotMatch(source, /functions:[A-Za-z0-9_-]+,functions:/);
});

test('provider outage runner usa gcloud exclusivamente desde PATH en Windows', async () => {
  const source = await readFile(runnerPath, 'utf8');

  assert.ok(source.includes("? ['gcloud.cmd', 'gcloud.exe', 'gcloud']"));
  assert.ok(source.includes("spawnSync('cmd.exe', ['/d', '/c', executable, ...args]"));
  assert.doesNotMatch(source, /LOCALAPPDATA|Google', 'Cloud SDK/);
  assert.ok(source.includes("['auth', 'print-access-token']"));
  assert.ok(source.includes("['auth', 'print-identity-token']"));
  assert.doesNotMatch(source, /'functions', 'describe'/);
  assert.doesNotMatch(source, /'functions', 'call'/);
  assert.doesNotMatch(source, /'logging', 'read'/);
});

test('provider outage runner comprueba funcion GEN_2, privacidad y evidencia por APIs REST', async () => {
  const source = await readFile(runnerPath, 'utf8');

  assert.ok(source.includes('https://cloudfunctions.googleapis.com/v2/${FUNCTION_RESOURCE}'));
  assert.ok(source.includes('https://run.googleapis.com/v2/${serviceResource}:getIamPolicy'));
  assert.ok(source.includes('https://logging.googleapis.com/v2/entries:list'));
  assert.ok(source.includes("description?.environment !== 'GEN_2'"));
  assert.ok(source.includes('service?.invokerIamDisabled === true'));
  assert.ok(source.includes("binding?.role === 'roles/run.invoker'"));
  assert.ok(source.includes("member === 'allUsers' || member === 'allAuthenticatedUsers'"));
  assert.ok(source.includes('jsonPayload.message="storage_v4_provider_request_metric"'));
  assert.ok(source.includes('jsonPayload.provider="geoapify"'));
  assert.ok(source.includes('jsonPayload.operation="geocode-search"'));
  assert.ok(source.includes('jsonPayload.outcome="network-error"'));
  assert.ok(source.includes("orderBy: 'timestamp desc'"));
  assert.ok(source.includes('matchingProviderMetricLogCount'));
  assert.ok(source.includes("cloudVerificationTransport: 'google-cloud-rest'"));
});

test('provider outage verify-existing omite Firebase CLI y conserva la invocacion unica', async () => {
  const source = await readFile(runnerPath, 'utf8');

  const deployGuard = source.indexOf('if (apply) {');
  const firebaseResolution = source.indexOf('const firebaseCliScript = resolveFirebaseCliScript();', deployGuard);
  const verifyMessage = source.indexOf('Verify-existing: se omite deploy', deployGuard);
  const identityToken = source.indexOf("['auth', 'print-identity-token']", verifyMessage);
  const invoke = source.indexOf('const callPayload = await requestJson(serviceUri', identityToken);

  assert.ok(deployGuard >= 0);
  assert.ok(firebaseResolution > deployGuard);
  assert.ok(verifyMessage > firebaseResolution);
  assert.ok(identityToken > verifyMessage);
  assert.ok(invoke > identityToken);
  assert.ok(source.includes('deploymentSkipped: verifyExisting'));
  assert.ok(source.includes('deploysExactlyOnePrivateProbeFunction: apply'));
  assert.ok(source.includes('invokesProbeExactlyOnce: execute'));
});

test('provider outage E2E preserva limites de Phase K', async () => {
  const [functionSource, runnerSource] = await Promise.all([
    readFile(functionPath, 'utf8'),
    readFile(runnerPath, 'utf8'),
  ]);

  assert.ok(runnerSource.includes('usesProductionProviderEndpoint: false'));
  assert.ok(runnerSource.includes('usesProviderApiKey: false'));
  assert.ok(runnerSource.includes('mutatesApplicationData: false'));
  assert.ok(runnerSource.includes('mutatesBudgets: false'));
  assert.ok(runnerSource.includes('changesAlertPolicies: false'));
  assert.ok(runnerSource.includes('enablesStorageV4Write: false'));
  assert.ok(runnerSource.includes('touchesProduction: false'));
  assert.ok(runnerSource.includes('providerApiKeyUntouched: true'));
  assert.ok(runnerSource.includes('storageV4WriteUnchanged: true'));
  assert.ok(functionSource.includes('storageV4WriteEnabled: false'));
  assert.ok(functionSource.includes('productionTouched: false'));
});

test('provider outage probe esta exportado y expuesto por npm', async () => {
  const [indexSource, packageSource] = await Promise.all([
    readFile(indexPath, 'utf8'),
    readFile(packagePath, 'utf8'),
  ]);

  assert.ok(indexSource.includes("export { storageV4ProviderOutageProbe } from './v4ProviderOutageProbeFunction.js';"));
  const packageJson = JSON.parse(packageSource);
  assert.equal(
    packageJson.scripts['phase-k:e2e:provider-outage-dev'],
    'node scripts/runStorageV4PhaseKProviderOutageE2EDev.mjs'
  );
});
