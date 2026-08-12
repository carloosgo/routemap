import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PILOT_STAGE_CONFIRMATION,
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

test('pilot stage declara explícitamente que desplegaría Rules de WRITE pero no activa tráfico', async () => {
  const { v3Rules, v4Rules } = await ruleSources();
  const plan = buildPilotStageDeployPlan({
    v3Rules,
    v4Rules,
    indexSource: 'export const stable = true;',
  });

  assert.match(plan.rulesSha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.functionCount, 7);
  assert.equal(plan.pilotExportsActivatedInIndex, false);
  assert.equal(plan.applyBlockedUntilExportsActivated, true);
  assert.equal(plan.wouldDeployV4WriteRules, true);
  assert.equal(plan.requiresExplicitWriteAuthorization, true);
  assert.equal(plan.remoteConfigChanged, false);
  assert.equal(plan.clientPilotTrafficActivated, false);
  assert.equal(plan.touchesProduction, false);
});

test('pilot stage apply usa solo las siete Functions y después firestore:rules', async () => {
  const { v3Rules, v4Rules } = await ruleSources();
  const plan = buildPilotStageDeployPlan({ v3Rules, v4Rules, indexSource: activatedIndex });
  const calls = [];
  let generatedRules = '';

  const result = runPilotStageDeployDev({
    args: [
      '--apply',
      `--expected-rules-sha=${plan.rulesSha256}`,
      `--confirm=${PILOT_STAGE_CONFIRMATION}`,
    ],
    v3Rules,
    v4Rules,
    indexSource: activatedIndex,
    firebaseCliScript: '/fake/firebase.js',
    executeFirebase: (_cli, args) => calls.push(args),
    writeGeneratedRules: (content) => { generatedRules = content; },
    log: () => {},
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'deploy');
  assert.match(calls[0][2], /^functions:v4SegmentAggregate,/);
  assert.match(calls[0][2], /functions:v4TripPurge$/);
  assert.deepEqual(calls[1].slice(0, 5), [
    'deploy',
    '--config',
    new URL('../firebase.pilot-write.json', import.meta.url).pathname,
    '--only',
    'firestore:rules',
  ]);
  assert.ok(generatedRules.includes('pilotValidClientTripUpdate'));
  assert.equal(result.v4WriteRulesDeployed, true);
  assert.equal(result.clientPilotTrafficActivated, false);
});

test('pilot stage apply se niega mientras functions/index.js no active exports pilot', async () => {
  const { v3Rules, v4Rules } = await ruleSources();
  const plan = buildPilotStageDeployPlan({
    v3Rules,
    v4Rules,
    indexSource: 'export const stable = true;',
  });

  assert.throws(
    () => runPilotStageDeployDev({
      args: [
        '--apply',
        `--expected-rules-sha=${plan.rulesSha256}`,
        `--confirm=${PILOT_STAGE_CONFIRMATION}`,
      ],
      v3Rules,
      v4Rules,
      indexSource: 'export const stable = true;',
      firebaseCliScript: '/fake/firebase.js',
      executeFirebase: () => { throw new Error('no debe ejecutar'); },
      log: () => {},
    }),
    /index\.js todavía no activa/
  );
});
