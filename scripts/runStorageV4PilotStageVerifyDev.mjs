/* global fetch, process, console, URLSearchParams */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V4_PILOT_BACKEND_FUNCTION_NAMES,
  V4_PILOT_BACKEND_FUNCTION_REGIONS,
  V4_PILOT_EVENTARC_DESTINATION_FUNCTION,
  V4_PILOT_EVENTARC_REGION,
  V4_PILOT_EVENTARC_TRIGGERS,
  V4_PILOT_SERVICE_REGION,
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
export const PILOT_VERIFY_EVENT_TYPE = 'google.cloud.firestore.document.v1.written';
export const PILOT_VERIFY_DATABASE = '(default)';
export const PILOT_VERIFY_EVENT_CONTENT_TYPE = 'application/protobuf';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);
const rulesEndpoint = 'https://firebaserules.googleapis.com/v1';

function functionsEndpoint(region) {
  return `https://cloudfunctions.googleapis.com/v2/projects/${PILOT_VERIFY_PROJECT}/locations/${region}/functions`;
}

function eventarcEndpoint() {
  return `https://eventarc.googleapis.com/v1/projects/${PILOT_VERIFY_PROJECT}/locations/${V4_PILOT_EVENTARC_REGION}/triggers`;
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

export async function listPilotEventarcTriggers({ token, fetchFn = fetch } = {}) {
  const triggers = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '100' });
    if (pageToken) query.set('pageToken', pageToken);
    const payload = await requestJson(`${eventarcEndpoint()}?${query}`, {
      token,
      fetchFn,
      label: `Eventarc list ${V4_PILOT_EVENTARC_REGION}`,
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

function remoteConfigIsSafelyOff(summary) {
  return summary.enabled === 'false'
    && summary.killSwitch === 'true'
    && summary.mode === 'off'
    && summary.cohortPercent === '0';
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
  const valid = typeFilter?.value === PILOT_VERIFY_EVENT_TYPE
    && databaseFilter?.value === PILOT_VERIFY_DATABASE
    && !databaseFilter?.operator
    && documentFilter?.value === expected.document
    && documentFilter?.operator === 'match-path-pattern'
    && trigger?.eventDataContentType === PILOT_VERIFY_EVENT_CONTENT_TYPE
    && destination?.service === cloudRunService
    && destination?.region === V4_PILOT_SERVICE_REGION
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

export function buildPilotStageVerification({
  candidateRules,
  cloudFunctions,
  eventarcTriggers = [],
  release,
  ruleset,
  remoteConfigSummary,
} = {}) {
  if (typeof candidateRules !== 'string' || !candidateRules.trim()) {
    throw new TypeError('candidateRules es obligatorio.');
  }
  if (!Array.isArray(cloudFunctions)) throw new TypeError('cloudFunctions debe ser un arreglo.');
  if (!Array.isArray(eventarcTriggers)) throw new TypeError('eventarcTriggers debe ser un arreglo.');
  if (!release || !ruleset) throw new TypeError('release y ruleset son obligatorios.');
  if (!remoteConfigSummary || typeof remoteConfigSummary !== 'object') {
    throw new TypeError('remoteConfigSummary es obligatorio.');
  }

  const expectedByName = new Map(V4_PILOT_BACKEND_FUNCTION_NAMES.map((name) => [
    name,
    V4_PILOT_BACKEND_FUNCTION_REGIONS[name],
  ]));
  const byLocationAndName = new Map(cloudFunctions.map((resource) => [
    `${functionRegion(resource)}:${resourceId(resource)}`,
    resource,
  ]));
  const expectedFunctions = V4_PILOT_BACKEND_FUNCTION_NAMES.map((name) => (
    byLocationAndName.get(`${expectedByName.get(name)}:${name}`) || null
  ));
  const missingFunctions = V4_PILOT_BACKEND_FUNCTION_NAMES.filter((name, index) => !expectedFunctions[index]);
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

  const ingressIndex = V4_PILOT_BACKEND_FUNCTION_NAMES.indexOf(V4_PILOT_EVENTARC_DESTINATION_FUNCTION);
  const ingressFunction = ingressIndex >= 0 ? expectedFunctions[ingressIndex] : null;
  const cloudRunService = expectedCloudRunService(ingressFunction);
  const triggersByName = new Map(eventarcTriggers.map((trigger) => [resourceId(trigger), trigger]));
  const eventarc = V4_PILOT_EVENTARC_TRIGGERS.map((expected) => (
    validateExpectedEventarcTrigger(triggersByName.get(expected.name), expected, cloudRunService)
  ));
  const missingEventarcTriggers = V4_PILOT_EVENTARC_TRIGGERS
    .filter((_, index) => eventarc[index].reason === 'missing')
    .map((trigger) => trigger.name);
  const invalidEventarcTriggers = V4_PILOT_EVENTARC_TRIGGERS
    .filter((_, index) => eventarc[index].reason === 'configuration-mismatch')
    .map((trigger) => trigger.name);
  const eventarcReady = Boolean(cloudRunService)
    && missingEventarcTriggers.length === 0
    && invalidEventarcTriggers.length === 0;

  const expectedRulesSha256 = sha256(candidateRules);
  const activeRulesSha256 = sha256(deployedRulesContent(ruleset));
  const rulesReleaseMatches = release.name === PILOT_VERIFY_RELEASE
    && release.rulesetName === ruleset.name
    && activeRulesSha256 === expectedRulesSha256;
  const remoteConfigSafe = remoteConfigIsSafelyOff(remoteConfigSummary);
  const backendReady = functionsReady && eventarcReady;
  const staged = backendReady && rulesReleaseMatches && remoteConfigSafe;

  return Object.freeze({
    project: PILOT_VERIFY_PROJECT,
    regions: Object.freeze({
      functions: { ...V4_PILOT_BACKEND_FUNCTION_REGIONS },
      eventarc: V4_PILOT_EVENTARC_REGION,
    }),
    mode: 'stage-verify',
    expectedFunctionCount: V4_PILOT_BACKEND_FUNCTION_NAMES.length,
    functions: Object.freeze(expectedFunctions.filter(Boolean).map(summarizeFunction)),
    missingFunctions: Object.freeze(missingFunctions),
    nonActiveFunctions: Object.freeze(nonActiveFunctions),
    wrongRuntimeFunctions: Object.freeze(wrongRuntimeFunctions),
    unexpectedRegionFunctions: Object.freeze(unexpectedRegionFunctions),
    functionsReady,
    eventarc: Object.freeze({
      destinationFunction: V4_PILOT_EVENTARC_DESTINATION_FUNCTION,
      destinationCloudRunService: cloudRunService || null,
      expectedTriggerCount: V4_PILOT_EVENTARC_TRIGGERS.length,
      triggers: Object.freeze(eventarc),
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
      aggregateReady: functionsReady && eventarcReady,
      touchReady: functionsReady && eventarcReady,
      lifecycleReady: functionsReady,
      purgeReady: functionsReady,
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
  const [cloudFunctions, eventarcTriggers, activeRules, remoteConfig] = await Promise.all([
    listPilotFunctions({ token: accessToken, fetchFn }),
    listPilotEventarcTriggers({ token: accessToken, fetchFn }),
    getActiveFirestoreRuleset({ token: accessToken, fetchFn }),
    getRemoteConfigTemplate({ token: accessToken, fetchFn }),
  ]);
  const remoteConfigSummary = summarizeStorageV4RemoteConfig(remoteConfig.template);
  const result = buildPilotStageVerification({
    candidateRules,
    cloudFunctions,
    eventarcTriggers,
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
