/* global fetch, process, console, URLSearchParams, setTimeout */
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
    && trigger.serviceAccount.endsWith(`@${DEV_STAGE_VERIFY_PROJECT}.iam.gserviceaccount.com`)
    && trigger?.transport?.pubsub?.topic
    && !hasFailedEventarcCondition(trigger);
  return Object.freeze({ valid, reason: valid ? null : 'contract-mismatch' });
}

export function summarizeV4Stage({ functions, triggers, ruleset, candidateRulesContent } = {}) {
  const summarizedFunctions = Array.isArray(functions) ? functions.map(summarizeFunction) : [];
  const functionsByName = new Map(summarizedFunctions.map((item) => [item.name, item]));
  const expectedFunctions = V4_BACKEND_FUNCTION_NAMES.map((name) => ({
    name,
    expectedRegion: V4_BACKEND_FUNCTION_REGIONS[name],
    actual: functionsByName.get(name) || null,
  }));
  const invalidFunctions = expectedFunctions.filter(({ actual, expectedRegion }) => (
    !actual
    || actual.region !== expectedRegion
    || actual.state !== 'ACTIVE'
    || actual.runtime !== 'nodejs22'
  ));
  const functionsReady = invalidFunctions.length === 0;

  const ingressFunction = functionsByName.get(V4_EVENTARC_DESTINATION_FUNCTION) || null;
  const cloudRunService = expectedCloudRunService(
    functions.find((item) => resourceId(item) === V4_EVENTARC_DESTINATION_FUNCTION)
  );
  const triggersByName = new Map((Array.isArray(triggers) ? triggers : []).map((trigger) => (
    [resourceId(trigger), trigger]
  )));
  const expectedTriggers = V4_EVENTARC_TRIGGERS.map((expected) => {
    const actual = triggersByName.get(expected.name) || null;
    const validation = validateExpectedEventarcTrigger(actual, expected, cloudRunService);
    return Object.freeze({
      name: expected.name,
      document: expected.document,
      actual: actual ? Object.freeze({
        name: resourceId(actual),
        serviceAccount: actual.serviceAccount || null,
        destinationService: actual?.destination?.cloudRun?.service || null,
        destinationRegion: actual?.destination?.cloudRun?.region || null,
      }) : null,
      valid: validation.valid,
      reason: validation.reason,
    });
  });
  const missingTriggers = expectedTriggers.filter((item) => !item.actual).map((item) => item.name);
  const invalidTriggers = expectedTriggers.filter((item) => item.actual && !item.valid).map((item) => item.name);
  const eventarcReady = Boolean(cloudRunService)
    && missingTriggers.length === 0
    && invalidTriggers.length === 0;

  const deployedRules = deployedRulesContent(ruleset);
  const candidateRules = typeof candidateRulesContent === 'string'
    ? candidateRulesContent
    : readFileSync(join(repoRoot, 'firestore.rules'), 'utf8');
  const deployedRulesSha256 = sha256(deployedRules);
  const candidateRulesSha256 = sha256(candidateRules);
  const rulesMatch = deployedRulesSha256 === candidateRulesSha256;

  const backendReady = functionsReady && eventarcReady;
  const staged = backendReady && rulesMatch;

  return Object.freeze({
    project: DEV_STAGE_VERIFY_PROJECT,
    productionProject: DEV_STAGE_VERIFY_PRODUCTION_PROJECT,
    expectedFunctionNames: V4_BACKEND_FUNCTION_NAMES,
    expectedFunctionRegions: V4_BACKEND_FUNCTION_REGIONS,
    functionRegionsQueried: DEV_STAGE_VERIFY_REGIONS,
    functions: summarizedFunctions,
    invalidFunctions,
    functionsReady,
    eventarc: Object.freeze({
      region: V4_EVENTARC_REGION,
      destinationFunction: V4_EVENTARC_DESTINATION_FUNCTION,
      destinationService: cloudRunService || null,
      expectedEventType: DEV_STAGE_VERIFY_EVENT_TYPE,
      expectedDatabase: DEV_STAGE_VERIFY_DATABASE,
      expectedContentType: DEV_STAGE_VERIFY_EVENT_CONTENT_TYPE,
      expectedTriggerCount: V4_EVENTARC_TRIGGERS.length,
      foundTriggerCount: expectedTriggers.filter((item) => item.actual).length,
      expectedTriggers,
      missingTriggers,
      invalidTriggers,
      ready: eventarcReady,
    }),
    rules: Object.freeze({
      releaseName: ruleset?.release?.name || null,
      rulesetName: ruleset?.release?.rulesetName || null,
      deployedSha256: deployedRulesSha256,
      candidateSha256: candidateRulesSha256,
      matchesCandidate: rulesMatch,
    }),
    backendReady,
    staged,
    mutatesCloud: false,
    mutatesApplicationData: false,
    touchesProduction: false,
  });
}

export async function verifyV4DevStage({ token = accessTokenFromGcloud(), fetchFn = fetch } = {}) {
  const [functions, triggers, activeRules] = await Promise.all([
    listV4Functions({ token, fetchFn }),
    listV4EventarcTriggers({ token, fetchFn }),
    getActiveFirestoreRuleset({ token, fetchFn }),
  ]);
  return summarizeV4Stage({
    functions,
    triggers,
    ruleset: activeRules,
  });
}

async function main() {
  const result = await verifyV4DevStage();
  console.log(JSON.stringify(result, null, 2));
  if (!result.staged) {
    throw new Error('Atlas Storage v4 dev no está staged: Functions/Eventarc/Rules no coinciden con el contrato canónico.');
  }
}

const isMain = resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
