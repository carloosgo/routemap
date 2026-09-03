/* global fetch, process, console, URLSearchParams, setTimeout, Math */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V4_BACKEND_FUNCTION_NAMES,
  V4_BACKEND_FUNCTION_REGIONS,
  V4_EVENTARC_DESTINATION_FUNCTION,
  V4_EVENTARC_REGION,
  V4_EVENTARC_TRIGGERS,
  V4_SERVICE_REGION,
} from '../functions/v4BackendManifest.js';
import { resolveCliCommand, runCliProcess } from './crossPlatformCli.mjs';

export const DEV_STAGE_VERIFY_PROJECT = 'atlasmap-dev';
export const DEV_STAGE_VERIFY_PRODUCTION_PROJECT = 'atlasmap-prod';
export const DEV_STAGE_VERIFY_REGIONS = Object.freeze([
  ...new Set(Object.values(V4_BACKEND_FUNCTION_REGIONS)),
]);
export const DEV_STAGE_VERIFY_RELEASE = `projects/${DEV_STAGE_VERIFY_PROJECT}/releases/cloud.firestore`;
export const DEV_STAGE_VERIFY_EVENT_TYPE = 'google.cloud.firestore.document.v1.written';
export const DEV_STAGE_VERIFY_DATABASE = '(default)';
export const DEV_STAGE_VERIFY_EVENT_CONTENT_TYPE = 'application/protobuf';
export const DEV_STAGE_VERIFY_TRANSIENT_HTTP_STATUSES = Object.freeze([500, 502, 503, 504]);
export const DEV_STAGE_VERIFY_HTTP_MAX_ATTEMPTS = 5;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const rulesEndpoint = 'https://firebaserules.googleapis.com/v1';
const transientHttpStatuses = new Set(DEV_STAGE_VERIFY_TRANSIENT_HTTP_STATUSES);

function functionsEndpoint(region) {
  return `https://cloudfunctions.googleapis.com/v2/projects/${DEV_STAGE_VERIFY_PROJECT}/locations/${region}/functions`;
}

function eventarcEndpoint() {
  return `https://eventarc.googleapis.com/v1/projects/${DEV_STAGE_VERIFY_PROJECT}/locations/${V4_EVENTARC_REGION}/triggers`;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function resolveGcloud() {
  return resolveCliCommand('gcloud');
}

function accessTokenFromGcloud(gcloud = resolveGcloud()) {
  if (!gcloud) throw new Error('No se encontró gcloud disponible en PATH o Google Cloud SDK.');
  const result = runCliProcess(gcloud, ['auth', 'print-access-token']);
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`gcloud auth print-access-token falló con código ${result.status ?? 1}.`);
  }
  const token = String(result.stdout || '').trim();
  if (!token) throw new Error('gcloud no devolvió access token.');
  return token;
}

function authHeaders(token) {
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('token es obligatorio.');
  return {
    Authorization: `Bearer ${token}`,
    'x-goog-user-project': DEV_STAGE_VERIFY_PROJECT,
  };
}

function defaultSleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function retryAfterMilliseconds(response) {
  const raw = response?.headers?.get?.('retry-after');
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.ceil(seconds * 1000);
}

function transientRetryDelayMs(response, attempt, randomFn) {
  const retryAfter = retryAfterMilliseconds(response);
  if (retryAfter !== null) return retryAfter;
  const exponential = Math.min(1000 * (2 ** (attempt - 1)), 10000);
  const jitter = Math.floor(randomFn() * 250);
  return exponential + jitter;
}

export async function requestJson(url, {
  token,
  fetchFn = fetch,
  label,
  maxAttempts = DEV_STAGE_VERIFY_HTTP_MAX_ATTEMPTS,
  sleepFn = defaultSleep,
  randomFn = Math.random,
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError('maxAttempts debe ser un entero positivo.');
  }
  if (typeof sleepFn !== 'function') throw new TypeError('sleepFn debe ser una función.');
  if (typeof randomFn !== 'function') throw new TypeError('randomFn debe ser una función.');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
    if (!response.ok) {
      const retryable = transientHttpStatuses.has(response.status) && attempt < maxAttempts;
      if (retryable) {
        await sleepFn(transientRetryDelayMs(response, attempt, randomFn));
        continue;
      }
      throw new Error(`${label || 'GET'} HTTP ${response.status}`);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(`${label || 'GET'} devolvió JSON inválido.`);
    }
    return payload;
  }

  throw new Error(`${label || 'GET'} agotó los reintentos HTTP.`);
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

export async function listV4Functions({ token, fetchFn = fetch } = {}) {
  const inventories = await Promise.all(DEV_STAGE_VERIFY_REGIONS.map((region) => (
    listFunctionsInRegion({ region, token, fetchFn })
  )));
  return inventories.flat();
}

export async function listV4EventarcTriggers({ token, fetchFn = fetch } = {}) {
  const triggers = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const payload = await requestJson(`${eventarcEndpoint()}?${query}`, {
      token,
      fetchFn,
      label: `Eventarc list ${V4_EVENTARC_REGION}`,
    });
    if (Array.isArray(payload.unreachable) && payload.unreachable.length > 0) {
      throw new Error('Eventarc reportó locations no alcanzables.');
    }
    triggers.push(...(Array.isArray(payload.triggers) ? payload.triggers : []));
    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
  } while (pageToken);
  return triggers;
}

export async function getActiveFirestoreRuleset({ token, fetchFn = fetch } = {}) {
  const release = await requestJson(`${rulesEndpoint}/${DEV_STAGE_VERIFY_RELEASE}`, {
    token,
    fetchFn,
    label: 'Firebase Rules release',
  });
  if (release.name !== DEV_STAGE_VERIFY_RELEASE) {
    throw new Error('Firebase Rules devolvió una release inesperada.');
  }
  if (typeof release.rulesetName !== 'string'
    || !release.rulesetName.startsWith(`projects/${DEV_STAGE_VERIFY_PROJECT}/rulesets/`)) {
    throw new Error('La release Firestore no apunta a un Ruleset válido del proyecto dev.');
  }
  const ruleset = await requestJson(`${rulesEndpoint}/${release.rulesetName}`, {
    token,
    fetchFn,
    label: 'Firebase Rules ruleset',
  });
  return Object.freeze({ release, ruleset });
}

function resourceId(resource) {
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
    name: resourceId(resource),
    region: functionRegion(resource),
    state: resource?.state || null,
    runtime: resource?.buildConfig?.runtime || null,
    cloudRunService: resource?.serviceConfig?.service || null,
  });
}

function deployedRulesContent(ruleset) {
  const files = ruleset?.source?.files;
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.content !== 'string') {
    throw new Error('El Ruleset activo debe contener exactamente un archivo fuente verificable.');
  }
  return files[0].content;
}

function eventFilter(trigger, attribute) {
  return (Array.isArray(trigger?.eventFilters) ? trigger.eventFilters : [])
    .find((filter) => filter?.attribute === attribute) || null;
}

function hasFailedEventarcCondition(trigger) {
  return Object.values(trigger?.conditions || {}).some((condition) => (
    typeof condition?.code === 'string'
    && condition.code
    && condition.code !== 'CONDITION_SUCCEEDED'
  ));
}

function expectedCloudRunService(ingressFunction) {
  const fullName = ingressFunction?.serviceConfig?.service;
  return typeof fullName === 'string' ? (fullName.split('/').pop() || '') : '';
}

function validateExpectedEventarcTrigger(trigger, expected, cloudRunService) {
  if (!trigger) return Object.freeze({ valid: false, reason: 'missing' });
  const typeFilter = eventFilter(trigger, 'type');
  const databaseFilter = eventFilter(trigger, 'database');
  const documentFilter = eventFilter(trigger, 'document');
  const destination = trigger?.destination?.cloudRun;
  const valid = typeFilter?.value === DEV_STAGE_VERIFY_EVENT_TYPE
    && databaseFilter?.value === DEV_STAGE_VERIFY_DATABASE
    && !databaseFilter?.operator
    && documentFilter?.value === expected.document
    && documentFilter?.operator === 'match-path-pattern'
    && trigger?.eventDataContentType === DEV_STAGE_VERIFY_EVENT_CONTENT_TYPE
    && destination?.service === cloudRunService
    && destination?.region === V4_SERVICE_REGION
    && typeof trigger?.serviceAccount === 'string'
    && Boolean(trigger.serviceAccount.trim())
    && !hasFailedEventarcCondition(trigger);
  return Object.freeze({
    valid,
    reason: valid ? null : 'configuration-mismatch',
    name: resourceId(trigger),
    serviceAccount: trigger?.serviceAccount || null,
    destinationService: destination?.service || null,
    destinationRegion: destination?.region || null,
    eventDataContentType: trigger?.eventDataContentType || null,
    type: typeFilter?.value || null,
    database: databaseFilter?.value || null,
    document: documentFilter?.value || null,
    documentOperator: documentFilter?.operator || null,
  });
}

export function buildV4DevStageVerification({
  candidateRules,
  cloudFunctions,
  eventarcTriggers = [],
  release,
  ruleset,
} = {}) {
  if (typeof candidateRules !== 'string' || !candidateRules.trim()) {
    throw new TypeError('candidateRules es obligatorio.');
  }
  if (!Array.isArray(cloudFunctions)) throw new TypeError('cloudFunctions debe ser un arreglo.');
  if (!Array.isArray(eventarcTriggers)) throw new TypeError('eventarcTriggers debe ser un arreglo.');
  if (!release || !ruleset) throw new TypeError('release y ruleset son obligatorios.');

  const expectedByName = new Map(V4_BACKEND_FUNCTION_NAMES.map((name) => [
    name,
    V4_BACKEND_FUNCTION_REGIONS[name],
  ]));
  const byLocationAndName = new Map(cloudFunctions.map((resource) => [
    `${functionRegion(resource)}:${resourceId(resource)}`,
    resource,
  ]));
  const expectedFunctions = V4_BACKEND_FUNCTION_NAMES.map((name) => (
    byLocationAndName.get(`${expectedByName.get(name)}:${name}`) || null
  ));
  const missingFunctions = V4_BACKEND_FUNCTION_NAMES.filter((name, index) => !expectedFunctions[index]);
  const nonActiveFunctions = expectedFunctions
    .filter(Boolean)
    .filter((resource) => resource.state !== 'ACTIVE')
    .map(resourceId);
  const wrongRuntimeFunctions = expectedFunctions
    .filter(Boolean)
    .filter((resource) => resource?.buildConfig?.runtime !== 'nodejs22')
    .map(resourceId);
  const unexpectedRegionFunctions = cloudFunctions
    .filter((resource) => expectedByName.has(resourceId(resource)))
    .filter((resource) => functionRegion(resource) !== expectedByName.get(resourceId(resource)))
    .map((resource) => `${resourceId(resource)}@${functionRegion(resource)}`)
    .sort();
  const functionsReady = missingFunctions.length === 0
    && nonActiveFunctions.length === 0
    && wrongRuntimeFunctions.length === 0
    && unexpectedRegionFunctions.length === 0;

  const ingressIndex = V4_BACKEND_FUNCTION_NAMES.indexOf(V4_EVENTARC_DESTINATION_FUNCTION);
  const ingressFunction = ingressIndex >= 0 ? expectedFunctions[ingressIndex] : null;
  const cloudRunService = expectedCloudRunService(ingressFunction);
  const triggersByName = new Map(eventarcTriggers.map((trigger) => [resourceId(trigger), trigger]));
  const triggerResults = V4_EVENTARC_TRIGGERS.map((expected) => (
    validateExpectedEventarcTrigger(triggersByName.get(expected.name), expected, cloudRunService)
  ));
  const missingEventarcTriggers = V4_EVENTARC_TRIGGERS
    .filter((_, index) => triggerResults[index].reason === 'missing')
    .map((trigger) => trigger.name);
  const invalidEventarcTriggers = V4_EVENTARC_TRIGGERS
    .filter((_, index) => triggerResults[index].reason === 'configuration-mismatch')
    .map((trigger) => trigger.name);
  const eventarcReady = Boolean(cloudRunService)
    && missingEventarcTriggers.length === 0
    && invalidEventarcTriggers.length === 0;

  const expectedRulesSha256 = sha256(candidateRules);
  const activeRulesSha256 = sha256(deployedRulesContent(ruleset));
  const rulesReleaseMatches = release.name === DEV_STAGE_VERIFY_RELEASE
    && release.rulesetName === ruleset.name
    && activeRulesSha256 === expectedRulesSha256;
  const backendReady = functionsReady && eventarcReady;
  const staged = backendReady && rulesReleaseMatches;

  return Object.freeze({
    project: DEV_STAGE_VERIFY_PROJECT,
    regions: Object.freeze({
      functions: { ...V4_BACKEND_FUNCTION_REGIONS },
      eventarc: V4_EVENTARC_REGION,
    }),
    mode: 'v4-dev-stage-verify',
    expectedFunctionCount: V4_BACKEND_FUNCTION_NAMES.length,
    functions: Object.freeze(expectedFunctions.filter(Boolean).map(summarizeFunction)),
    missingFunctions: Object.freeze(missingFunctions),
    nonActiveFunctions: Object.freeze(nonActiveFunctions),
    wrongRuntimeFunctions: Object.freeze(wrongRuntimeFunctions),
    unexpectedRegionFunctions: Object.freeze(unexpectedRegionFunctions),
    functionsReady,
    eventarc: Object.freeze({
      destinationFunction: V4_EVENTARC_DESTINATION_FUNCTION,
      destinationCloudRunService: cloudRunService || null,
      expectedTriggerCount: V4_EVENTARC_TRIGGERS.length,
      triggers: Object.freeze(triggerResults),
      missingTriggers: Object.freeze(missingEventarcTriggers),
      invalidTriggers: Object.freeze(invalidEventarcTriggers),
      ready: eventarcReady,
    }),
    backendReady,
    rules: Object.freeze({
      releaseName: release.name || null,
      rulesetName: ruleset.name || null,
      expectedSha256: expectedRulesSha256,
      activeSha256: activeRulesSha256,
      matchesCandidate: rulesReleaseMatches,
    }),
    readinessCandidates: Object.freeze({
      writeRulesReady: rulesReleaseMatches,
      eventIngressReady: eventarcReady,
      lifecycleReady: functionsReady,
      purgeReady: functionsReady,
    }),
    staged,
    mutatesCloud: false,
    mutatesApplicationData: false,
    touchesProduction: false,
  });
}

export async function runStorageV4DevStageVerify({
  token,
  fetchFn = fetch,
  candidateRules = readFileSync(join(repoRoot, 'firestore.rules'), 'utf8'),
  log = (value) => console.log(value),
} = {}) {
  const accessToken = token || accessTokenFromGcloud();
  const [cloudFunctions, eventarcTriggers, activeRules] = await Promise.all([
    listV4Functions({ token: accessToken, fetchFn }),
    listV4EventarcTriggers({ token: accessToken, fetchFn }),
    getActiveFirestoreRuleset({ token: accessToken, fetchFn }),
  ]);
  const result = buildV4DevStageVerification({
    candidateRules,
    cloudFunctions,
    eventarcTriggers,
    release: activeRules.release,
    ruleset: activeRules.ruleset,
  });
  log(JSON.stringify(result, null, 2));
  if (!result.staged) {
    throw new Error('Storage v4 dev stage no coincide con Functions, Eventarc y Firestore Rules canónicos.');
  }
  return result;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  runStorageV4DevStageVerify().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
