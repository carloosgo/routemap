import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composePilotWriteRules } from '../scripts/firestorePilotWriteRules.mjs';
import {
  PILOT_VERIFY_RELEASE,
  buildPilotStageVerification,
} from '../scripts/runStorageV4PilotStageVerifyDev.mjs';

const functionNames = [
  'v4SegmentAggregate',
  'v4PlaceAggregate',
  'v4ConnectionTouch',
  'v4NoteTouch',
  'v4ChecklistTouch',
  'v4TripLifecycle',
  'v4TripPurge',
];

function functionInventory() {
  return functionNames.map((name) => ({
    name: `projects/atlasmap-dev/locations/us-central1/functions/${name}`,
    state: 'ACTIVE',
    buildConfig: { runtime: 'nodejs22' },
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

test('stage verify acepta solo backend activo + Rules exactas + Remote Config apagado', async () => {
  const rules = await candidateRules();
  const current = activeRules(rules);
  const result = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: functionInventory(),
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });

  assert.equal(result.staged, true);
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

test('stage verify falla cerrado si falta una Function o su runtime/estado no coincide', async () => {
  const rules = await candidateRules();
  const current = activeRules(rules);
  const missing = functionInventory().slice(1);
  const missingResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: missing,
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });
  assert.equal(missingResult.staged, false);
  assert.deepEqual(missingResult.missingFunctions, ['v4SegmentAggregate']);

  const wrong = functionInventory();
  wrong[0] = { ...wrong[0], state: 'FAILED' };
  wrong[1] = { ...wrong[1], buildConfig: { runtime: 'nodejs20' } };
  const wrongResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: wrong,
    release: current.release,
    ruleset: current.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });
  assert.equal(wrongResult.staged, false);
  assert.deepEqual(wrongResult.nonActiveFunctions, ['v4SegmentAggregate']);
  assert.deepEqual(wrongResult.wrongRuntimeFunctions, ['v4PlaceAggregate']);
});

test('stage verify detecta Rules distintas o tráfico pilot ya activado', async () => {
  const rules = await candidateRules();
  const changed = activeRules(`${rules}\n// drift`);
  const driftResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: functionInventory(),
    release: changed.release,
    ruleset: changed.ruleset,
    remoteConfigSummary: safeRemoteConfig(),
  });
  assert.equal(driftResult.rules.matchesCandidate, false);
  assert.equal(driftResult.staged, false);

  const current = activeRules(rules);
  const trafficResult = buildPilotStageVerification({
    candidateRules: rules,
    cloudFunctions: functionInventory(),
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

test('stage verifier es estrictamente read-only y usa APIs GET oficiales', async () => {
  const source = await readFile(
    new URL('../scripts/runStorageV4PilotStageVerifyDev.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /cloudfunctions\.googleapis\.com\/v2/);
  assert.match(source, /firebaserules\.googleapis\.com\/v1/);
  assert.match(source, /getRemoteConfigTemplate/);
  assert.match(source, /method: 'GET'/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.doesNotMatch(source, /firebase[^\n]*deploy/);
  assert.doesNotMatch(source, /publishRemoteConfigTemplate/);
});
