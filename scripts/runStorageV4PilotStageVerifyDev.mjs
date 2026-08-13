/* global fetch, process, console, URLSearchParams */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V4_PILOT_BACKEND_FUNCTION_NAMES,
  V4_PILOT_BACKEND_FUNCTION_REGIONS,
} from '../functions/v4PilotBackendManifest.js';
import { composePilotWriteRules } from './firestorePilotWriteRules.mjs';
import {
  accessTokenFromGcloud,
  getRemoteConfigTemplate,
  resolveGcloud,
} from './storageV4RemoteConfigRestDev.mjs';
import { summarizeStorageV4RemoteConfig } from './storageV4PilotRemoteConfigModel.mjs';

export const PILOT_VERIFY_PROJECT = 'atlasmap-dev';
export const PILOT_VERIFY_REGIONS = Object.freeze([
  ...new Set(Object.values(V4_PILOT_BACKEND_FUNCTION_REGIONS)),
]);
export const PILOT_VERIFY_RELEASE = `projects/${PILOT_VERIFY_PROJECT}/releases/cloud.firestore`;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const rulesEndpoint = 'https://firebaserules.googleapis.com/v1';

function functionsEndpoint(region) {
  return `https://cloudfunctions.googleapis.com/v2/projects/${PILOT_VERIFY_PROJECT}/locations/${region}/functions`;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function authHeaders(token) {
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('token es obligatorio.');
  return {
    Authorization: `Bearer ${token}`,
    'x-goog-user-project': PILOT_VERIFY_PROJECT,
  };
}

async function requestJson(url, { token, fetchFn = fetch, label } = {}) {
  const response = await fetchFn(url, { method: 'GET', headers: authHeaders(token) });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) throw new Error(`${label || 'GET'} HTTP ${response.status}`);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label || 'GET'} devolvió JSON inválido.`);
  }
  return payload;
}

async function listFunctionsInRegion({ region, token, fetchFn = fetch } = {}) {
  const functions = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const payload = await requestJson(`${functionsEndpoint(region)}?${query}`, {
      token,
      fetchFn,
      label: `Cloud Functions list ${region}`,
    });
    if (Array.isArray(payload.unreachable) && payload.unreachable.length > 0) {
      throw new Error(`Cloud Functions reportó locations no alcanzables para ${region}.`);
    }
    functions.push(...(Array.isArray(payload.functions) ? payload.functions : []));
    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
  } while (pageToken);
  return functions;
}

export async function listPilotFunctions({ token, fetchFn = fetch } = {}) {
  const inventories = await Promise.all(PILOT_VERIFY_REGIONS.map((region) => (
    listFunctionsInRegion({ region, token, fetchFn })
  )));
  return inventories.flat();
}

export async function getActiveFirestoreRuleset({ token, fetchFn = fetch } = {}) {
  const release = await requestJson(`${rulesEndpoint}/${PILOT_VERIFY_RELEASE}`, {
    token,
    fetchFn,
    label: 'Firebase Rules release',
  });
  if (release.name !== PILOT_VERIFY_RELEASE) {
    throw new Error('Firebase Rules devolvió una release inesperada.');
  }
  if (typeof release.rulesetName !== 'string' || !release.rulesetName.startsWith(`projects/${PILOT_VERIFY_PROJECT}/rulesets/`)) {
    throw new Error('La release Firestore no apunta a un Ruleset válido del proyecto.');
  }
  const ruleset = await requestJson(`${rulesEndpoint}/${release.rulesetName}`, {
    token,
    fetchFn,
    label: 'Firebase Rules ruleset',
  });
  return Object.freeze({ release, ruleset });
}

function functionName(resource) {
  const name = typeof resource?.name === 'string' ? resource.name : '';
  return name.split('/').pop() || '';
}

function functionRegion(resource) {
  const parts = typeof resource?.name === 'string' ? resource.name.split('/') : [];
  const locationIndex = parts.indexOf('locations');
  return locationIndex >= 0 ? (parts[locationIndex + 1] || '') : '';
}

function summarizeFunction(resource) {
  return Object.freeze({
    name: functionName(resource),
    region: functionRegion(resource),
    state: resource?.state || null,
    runtime: resource?.buildConfig?.runtime || null,
  });
}

function deployedRulesContent(ruleset) {
  const files = ruleset?.source?.files;
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.content !== 'string') {
    throw new Error('El Ruleset activo debe contener exactamente un archivo fuente verificable.');
  }
  return files[0].content;
}

function remoteConfigIsSafelyOff(summary) {
  return summary.enabled === 'false'
    && summary.killSwitch === 'true'
    && summary.mode === 'off'
    && summary.cohortPercent === '0';
}

export function buildPilotStageVerification({
  candidateRules,
  cloudFunctions,
  release,
  ruleset,
  remoteConfigSummary,
} = {}) {
  if (typeof candidateRules !== 'string' || !candidateRules.trim()) {
    throw new TypeError('candidateRules es obligatorio.');
  }
  if (!Array.isArray(cloudFunctions)) throw new TypeError('cloudFunctions debe ser un arreglo.');
  if (!release || !ruleset) throw new TypeError('release y ruleset son obligatorios.');
  if (!remoteConfigSummary || typeof remoteConfigSummary !== 'object') {
    throw new TypeError('remoteConfigSummary es obligatorio.');
  }

  const expectedByName = new Map(V4_PILOT_BACKEND_FUNCTION_NAMES.map((name) => [
    name,
    V4_PILOT_BACKEND_FUNCTION_REGIONS[name],
  ]));
  const byLocationAndName = new Map(cloudFunctions.map((resource) => [
    `${functionRegion(resource)}:${functionName(resource)}`,
    resource,
  ]));
  const expectedFunctions = V4_PILOT_BACKEND_FUNCTION_NAMES.map((name) => (
    byLocationAndName.get(`${expectedByName.get(name)}:${name}`) || null
  ));
  const missingFunctions = V4_PILOT_BACKEND_FUNCTION_NAMES.filter((name, index) => !expectedFunctions[index]);
  const nonActiveFunctions = expectedFunctions
    .filter(Boolean)
    .filter((resource) => resource.state !== 'ACTIVE')
    .map(functionName);
  const wrongRuntimeFunctions = expectedFunctions
    .filter(Boolean)
    .filter((resource) => resource?.buildConfig?.runtime !== 'nodejs22')
    .map(functionName);
  const unexpectedRegionFunctions = cloudFunctions
    .filter((resource) => expectedByName.has(functionName(resource)))
    .filter((resource) => functionRegion(resource) !== expectedByName.get(functionName(resource)))
    .map((resource) => `${functionName(resource)}@${functionRegion(resource)}`)
    .sort();

  const expectedRulesSha256 = sha256(candidateRules);
  const activeRulesSha256 = sha256(deployedRulesContent(ruleset));
  const rulesReleaseMatches = release.name === PILOT_VERIFY_RELEASE
    && release.rulesetName === ruleset.name
    && activeRulesSha256 === expectedRulesSha256;
  const remoteConfigSafe = remoteConfigIsSafelyOff(remoteConfigSummary);
  const backendReady = missingFunctions.length === 0
    && nonActiveFunctions.length === 0
    && wrongRuntimeFunctions.length === 0
    && unexpectedRegionFunctions.length === 0;
  const staged = backendReady && rulesReleaseMatches && remoteConfigSafe;

  return Object.freeze({
    project: PILOT_VERIFY_PROJECT,
    regions: Object.freeze({ ...V4_PILOT_BACKEND_FUNCTION_REGIONS }),
    mode: 'stage-verify',
    expectedFunctionCount: V4_PILOT_BACKEND_FUNCTION_NAMES.length,
    functions: Object.freeze(expectedFunctions.filter(Boolean).map(summarizeFunction)),
    missingFunctions: Object.freeze(missingFunctions),
    nonActiveFunctions: Object.freeze(nonActiveFunctions),
    wrongRuntimeFunctions: Object.freeze(wrongRuntimeFunctions),
    unexpectedRegionFunctions: Object.freeze(unexpectedRegionFunctions),
    backendReady,
    rules: Object.freeze({
      releaseName: release.name || null,
      rulesetName: ruleset.name || null,
      expectedSha256: expectedRulesSha256,
      activeSha256: activeRulesSha256,
      matchesCandidate: rulesReleaseMatches,
    }),
    remoteConfig: Object.freeze({
      enabled: remoteConfigSummary.enabled ?? null,
      killSwitch: remoteConfigSummary.killSwitch ?? null,
      mode: remoteConfigSummary.mode ?? null,
      cohortPercent: remoteConfigSummary.cohortPercent ?? null,
      pilotTrafficActivated: !remoteConfigSafe,
      safeForStage: remoteConfigSafe,
    }),
    readinessCandidates: Object.freeze({
      writeRulesReady: rulesReleaseMatches,
      aggregateReady: backendReady,
      touchReady: backendReady,
      lifecycleReady: backendReady,
      purgeReady: backendReady,
    }),
    staged,
    mutatesCloud: false,
    mutatesApplicationData: false,
    changesRemoteConfig: false,
    activatesClientPilotTraffic: false,
    touchesProduction: false,
  });
}

export async function runPilotStageVerifyDev({
  token,
  fetchFn = fetch,
  gcloud = resolveGcloud(),
  v3Rules = readFileSync(join(repoRoot, 'firestore.rules'), 'utf8'),
  v4Rules = readFileSync(join(repoRoot, 'firestore-v4.rules'), 'utf8'),
  log = (value) => console.log(value),
} = {}) {
  const accessToken = token || accessTokenFromGcloud(gcloud);
  const candidateRules = composePilotWriteRules(v3Rules, v4Rules);
  const [cloudFunctions, activeRules, remoteConfig] = await Promise.all([
    listPilotFunctions({ token: accessToken, fetchFn }),
    getActiveFirestoreRuleset({ token: accessToken, fetchFn }),
    getRemoteConfigTemplate({ token: accessToken, fetchFn }),
  ]);
  const remoteConfigSummary = summarizeStorageV4RemoteConfig(remoteConfig.template);
  const result = buildPilotStageVerification({
    candidateRules,
    cloudFunctions,
    release: activeRules.release,
    ruleset: activeRules.ruleset,
    remoteConfigSummary,
  });
  log(JSON.stringify(result, null, 2));
  if (!result.staged) process.exitCode = 2;
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runPilotStageVerifyDev().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
