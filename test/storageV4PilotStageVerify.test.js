import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composePilotWriteRules } from '../scripts/firestorePilotWriteRules.mjs';
import {
  PILOT_VERIFY_EVENT_TYPE,
  PILOT_VERIFY_RELEASE,
  buildPilotStageVerification,
} from '../scripts/runStorageV4PilotStageVerifyDev.mjs';
import { V4_PILOT_EVENTARC_TRIGGERS } from '../functions/v4PilotBackendManifest.js';

const functionNames = [
  'v4FirestoreEventIngress',
  'v4TripLifecycle',
  'v4TripPurge',
];
const ingressRunService = 'v4firestoreeventingress-abcd';

function functionInventory() {
  return functionNames.map((name) => ({
    name: `projects/atlasmap-dev/locations/us-central1/functions/${name}`,
    state: 'ACTIVE',
    buildConfig: { runtime: 'nodejs22' },
    serviceConfig: {
      service: `projects/atlasmap-dev/locations/us-central1/services/${
        name === 'v4FirestoreEventIngress' ? ingressRunService : name.toLowerCase()
      }`,
    },
  }));
}

function eventarcInventory() {
  return V4_PILOT_EVENTARC_TRIGGERS.map((expected) => ({
    name: `projects/atlasmap-dev/locations/northamerica-south1/triggers/${expected.name}`,
    eventFilters: [
      { attribute: 'type', value: PILOT_VERIFY_EVENT_TYPE },
      { attribute: 'document', value: expected.document, operator: 'match-path-pattern' },
    ],
    serviceAccount: '833327011450-compute@developer.gserviceaccount.com',
    destination: {
      cloudRun: {
        service: ingressRunService,
        region: 'us-central1',
      },
    },
    conditions: {
      transport: { code: 'CONDITION_SUCCEEDED' },
    },
  }));
}

async function candidateRules() {
  const [v3Rules, v4Rules] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../firestore-v4.rules', import.meta.url), 'utf8'),
  ]);
  return composePilotWriteRules(v3Rules, v4Rules);
}

function safeRemoteConfig() {
  return {
    enabled: 'false',
    killSwitch: 'true',
    mode: 'off',
    cohortPercent: '0',
    readiness: {},
  };
}

function activeRules(rules) {
  const rulesetName = 'projects/atlasmap-dev/rulesets/ruleset-123';
  return {
    release: { name: PILOT_VERIFY_RELEASE, rulesetName },
    ruleset: {
      name: rulesetName,
      source: { files: [{ name: 'firestore-pilot-write.rules', content: rules }] },
    },
  };
}

test('stage verify exige Functions + Eventarc + Rules exactas + Remote Config apagado', async () => {
  const rules = await candidateRules();
  const current = activeRules(rules);
  const result = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: functionInventory(),
    eventarcTriggers: eventarcInventory(),
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });

  assert.equal(result.staged, true);
  assert.equal(result.functionsReady, true);
  assert.equal(result.eventarc.ready, true);
  assert.equal(result.backendReady, true);
  assert.equal(result.rules.matchesCandidate, true);
  assert.equal(result.remoteConfig.safeForStage, true);
  assert.equal(result.remoteConfig.pilotTrafficActivated, false);
  assert.deepEqual(result.readinessCandidates, {
    writeRulesReady: true,
    aggregateReady: true,
    touchReady: true,
    lifecycleReady: true,
    purgeReady: true,
  });
  assert.equal(result.mutatesCloud, false);
  assert.equal(result.activatesClientPilotTraffic, false);
});

test('stage verify falla cerrado si falta Function, runtime o Eventarc', async () => {
  const rules = await candidateRules();
  const current = activeRules(rules);
  const missing = functionInventory().slice(1);
  const missingResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: missing,
    eventarcTriggers: eventarcInventory(),
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });
  assert.equal(missingResult.staged, false);
  assert.deepEqual(missingResult.missingFunctions, ['v4FirestoreEventIngress']);
  assert.equal(missingResult.eventarc.ready, false);

  const wrong = functionInventory();
  wrong[1] = { ...wrong[1], state: 'FAILED' };
  wrong[2] = { ...wrong[2], buildConfig: { runtime: 'nodejs20' } };
  const wrongResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: wrong,
    eventarcTriggers: eventarcInventory(),
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });
  assert.equal(wrongResult.staged, false);
  assert.deepEqual(wrongResult.nonActiveFunctions, ['v4TripLifecycle']);
  assert.deepEqual(wrongResult.wrongRuntimeFunctions, ['v4TripPurge']);

  const incompleteEventarc = eventarcInventory().slice(1);
  const eventarcResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: functionInventory(),
    eventarcTriggers: incompleteEventarc,
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });
  assert.equal(eventarcResult.staged, false);
  assert.equal(eventarcResult.functionsReady, true);
  assert.deepEqual(eventarcResult.eventarc.missingTriggers, ['atlas-v4-segment-written']);
  assert.equal(eventarcResult.readinessCandidates.aggregateReady, false);
  assert.equal(eventarcResult.readinessCandidates.lifecycleReady, true);
});

test('stage verify detecta Eventarc mal apuntado, Rules distintas o tráfico pilot', async () => {
  const rules = await candidateRules();
  const current = activeRules(rules);
  const invalidTriggers = eventarcInventory();
  invalidTriggers[0] = {
    ...invalidTriggers[0],
    destination: { cloudRun: { service: 'otro-servicio', region: 'us-central1' } },
  };
  const triggerResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: functionInventory(),
    eventarcTriggers: invalidTriggers,
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });
  assert.deepEqual(triggerResult.eventarc.invalidTriggers, ['atlas-v4-segment-written']);
  assert.equal(triggerResult.staged, false);

  const changed = activeRules(`${rules}\n// drift`);
  const driftResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: functionInventory(),
    eventarcTriggers: eventarcInventory(),
    release: changed.release,
    ruleset: changed.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });
  assert.equal(driftResult.rules.matchesCandidate, false);
  assert.equal(driftResult.staged, false);

  const trafficResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: functionInventory(),
    eventarcTriggers: eventarcInventory(),
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: {
      ...safeRemoteConfig(),
      enabled: 'true',
      killSwitch: 'false',
      mode: 'pilot',
      cohortPercent: '1',
    },
  });
  assert.equal(trafficResult.remoteConfig.safeForStage, false);
  assert.equal(trafficResult.remoteConfig.pilotTrafficActivated, true);
  assert.equal(trafficResult.staged, false);
});

test('stage verifier sigue estrictamente read-only y usa GET de Functions/Eventarc/Rules', async () => {
  const source = await readFile(
    new URL('../scripts/runStorageV4PilotStageVerifyDev.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /cloudfunctions\.googleapis\.com\/v2/);
  assert.match(source, /eventarc\.googleapis\.com\/v1/);
  assert.match(source, /firebaserules\.googleapis\.com\/v1/);
  assert.match(source, /getRemoteConfigTemplate/);
  assert.match(source, /method: 'GET'/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(source, /firebase[^\n]*deploy/);
  assert.doesNotMatch(source, /publishRemoteConfigTemplate/);
});
