import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PILOT_STAGE_CONFIRMATION,
  buildEphemeralPilotIndex,
  buildPilotStageDeployPlan,
  parsePilotStageArgs,
  runPilotStageDeployDev,
} from '../scripts/runStorageV4PilotStageDeployDev.mjs';

async function ruleSources() {
  const [v3Rules, v4Rules] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../firestore-v4.rules', import.meta.url), 'utf8'),
  ]);
  return { v3Rules, v4Rules };
}

const activatedIndex = `export {
  v4SegmentAggregate,
  v4PlaceAggregate,
  v4ConnectionTouch,
  v4NoteTouch,
  v4ChecklistTouch,
  v4TripLifecycle,
  v4TripPurge,
} from './v4PilotExports.js';`;
const stableIndex = 'export const stable = true;\n';

test('pilot stage es dry-run por defecto y apply exige hash + confirmación', () => {
  assert.deepEqual(parsePilotStageArgs([]), {
    apply: false,
    expectedRulesSha: '',
    confirmation: '',
  });
  assert.throws(() => parsePilotStageArgs(['--apply']), /expected-rules-sha/);
  const digest = 'a'.repeat(64);
  const parsed = parsePilotStageArgs([
    '--apply',
    `--expected-rules-sha=${digest}`,
    `--confirm=${PILOT_STAGE_CONFIRMATION}`,
  ]);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.expectedRulesSha, digest);
});

test('pilot stage conserva index commiteado fail-closed y usa exports efímeros', async () => {
  const { v3Rules, v4Rules } = await ruleSources();
  const plan = buildPilotStageDeployPlan({
    v3Rules,
    v4Rules,
    indexSource: stableIndex,
  });

  assert.match(plan.rulesSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.functionCount, 7);
  assert.equal(plan.pilotExportsActivatedInIndex, false);
  assert.equal(plan.usesEphemeralPilotExports, true);
  assert.equal(plan.committedIndexRemainsUnchanged, true);
  assert.equal(plan.functionFailurePolicyAcknowledged, true);
  assert.equal(plan.wouldDeployV4WriteRules, true);
  assert.equal(plan.requiresExplicitWriteAuthorization, true);
  assert.equal(plan.remoteConfigChanged, false);
  assert.equal(plan.clientPilotTrafficActivated, false);
  assert.equal(plan.touchesProduction, false);

  const ephemeral = buildEphemeralPilotIndex(stableIndex);
  assert.equal(ephemeral.changed, true);
  assert.match(ephemeral.source, /v4PilotExports\.js/);
  assert.equal(buildEphemeralPilotIndex(activatedIndex).changed, false);
});

test('pilot stage apply despliega solo siete Functions, restaura index y después Rules', async () => {
  const { v3Rules, v4Rules } = await ruleSources();
  const plan = buildPilotStageDeployPlan({ v3Rules, v4Rules, indexSource: stableIndex });
  const calls = [];
  const indexWrites = [];
  let generatedRules = '';
  let currentIndex = stableIndex;

  const result = runPilotStageDeployDev({
    args: [
      '--apply',
      `--expected-rules-sha=${plan.rulesSha256}`,
      `--confirm=${PILOT_STAGE_CONFIRMATION}`,
    ],
    v3Rules,
    v4Rules,
    indexSource: stableIndex,
    firebaseCliScript: '/fake/firebase.js',
    executeFirebase: (_cli, args) => {
      if (calls.length === 0) assert.match(currentIndex, /v4PilotExports\.js/);
      calls.push(args);
    },
    writeGeneratedRules: (content) => { generatedRules = content; },
    writeFunctionsIndex: (content) => {
      currentIndex = content;
      indexWrites.push(content);
    },
    readFunctionsIndex: () => currentIndex,
    log: () => {},
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'deploy');
  assert.match(calls[0][2], /^functions:v4SegmentAggregate,/);
  assert.match(calls[0][2], /functions:v4TripPurge$/);
  assert.ok(calls[0].includes('--force'));
  assert.equal(calls[1][0], 'deploy');
  assert.equal(calls[1][1], '--config');
  assert.ok(calls[1][2].replaceAll('\\', '/').endsWith('/firebase.pilot-write.json'));
  assert.deepEqual(calls[1].slice(3, 5), ['--only', 'firestore:rules']);
  assert.equal(calls[1].includes('--force'), false);
  assert.ok(generatedRules.includes('pilotValidClientTripUpdate'));
  assert.equal(indexWrites.length, 2);
  assert.match(indexWrites[0], /v4PilotExports\.js/);
  assert.equal(indexWrites[1], stableIndex);
  assert.equal(currentIndex, stableIndex);
  assert.equal(result.functionFailurePolicyAcknowledged, true);
  assert.equal(result.ephemeralPilotExportsUsed, true);
  assert.equal(result.functionsIndexRestored, true);
  assert.equal(result.v4WriteRulesDeployed, true);
  assert.equal(result.clientPilotTrafficActivated, false);
});

test('si deploy de Functions falla, index se restaura y Rules no se despliegan', async () => {
  const { v3Rules, v4Rules } = await ruleSources();
  const plan = buildPilotStageDeployPlan({ v3Rules, v4Rules, indexSource: stableIndex });
  let currentIndex = stableIndex;
  let deployCalls = 0;

  assert.throws(() => runPilotStageDeployDev({
    args: [
      '--apply',
      `--expected-rules-sha=${plan.rulesSha256}`,
      `--confirm=${PILOT_STAGE_CONFIRMATION}`,
    ],
    v3Rules,
    v4Rules,
    indexSource: stableIndex,
    firebaseCliScript: '/fake/firebase.js',
    executeFirebase: () => {
      deployCalls += 1;
      assert.match(currentIndex, /v4PilotExports\.js/);
      throw new Error('functions deploy failed');
    },
    writeGeneratedRules: () => {},
    writeFunctionsIndex: (content) => { currentIndex = content; },
    readFunctionsIndex: () => currentIndex,
    log: () => {},
  }), /functions deploy failed/);

  assert.equal(deployCalls, 1);
  assert.equal(currentIndex, stableIndex);
});
