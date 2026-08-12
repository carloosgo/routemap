import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildStorageV4PilotPlan } from '../scripts/runStorageV4PilotPlanDev.mjs';

async function repoInputs() {
  const [v3Rules, v4Rules, indexSource, pilotExportsSource] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../firestore-v4.rules', import.meta.url), 'utf8'),
    readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/v4PilotExports.js', import.meta.url), 'utf8'),
  ]);
  return { v3Rules, v4Rules, indexSource, pilotExportsSource };
}

test('pilot plan enumera las siete Functions preparadas sin activarlas en index', async () => {
  const plan = buildStorageV4PilotPlan(await repoInputs());

  assert.equal(plan.project, 'atlasmap-dev');
  assert.equal(plan.backend.region, 'us-central1');
  assert.equal(plan.backend.functionCount, 7);
  assert.deepEqual(plan.backend.functionNames, [
    'v4SegmentAggregate',
    'v4PlaceAggregate',
    'v4ConnectionTouch',
    'v4NoteTouch',
    'v4ChecklistTouch',
    'v4TripLifecycle',
    'v4TripPurge',
  ]);
  assert.equal(plan.backend.exportsPrepared, true);
  assert.equal(plan.backend.exportsActivatedInIndex, false);
  assert.equal(plan.codePrepared, true);
});

test('pilot plan conserva WRITE apagado y expone todos los readiness requeridos', async () => {
  const plan = buildStorageV4PilotPlan(await repoInputs());

  assert.equal(plan.mutatesCloud, false);
  assert.equal(plan.mutatesApplicationData, false);
  assert.equal(plan.enablesGlobalStorageV4Write, false);
  assert.equal(plan.touchesProduction, false);
  assert.equal(plan.rollout.cohortPercentChosen, false);
  assert.equal(plan.rollout.pilotTrafficActivated, false);
  assert.deepEqual(plan.rollout.requiredReadinessFields, [
    'readRulesReady',
    'writeRulesReady',
    'syncReady',
    'aggregateReady',
    'touchReady',
    'lifecycleReady',
    'purgeReady',
  ]);
  assert.deepEqual(plan.rollout.remoteKeys, {
    readRulesReady: 'storage_v4_read_rules_ready',
    writeRulesReady: 'storage_v4_write_rules_ready',
    syncReady: 'storage_v4_sync_ready',
    aggregateReady: 'storage_v4_aggregate_ready',
    touchReady: 'storage_v4_touch_ready',
    lifecycleReady: 'storage_v4_lifecycle_ready',
    purgeReady: 'storage_v4_purge_ready',
  });
});

test('pilot plan produce una Rules candidate identificable sin habilitar hard delete v4', async () => {
  const plan = buildStorageV4PilotPlan(await repoInputs());

  assert.match(plan.candidateRules.sha256, /^[a-f0-9]{64}$/);
  assert.ok(plan.candidateRules.bytes > 0);
  assert.deepEqual(plan.candidateRules.preservesLegacyStorageVersions, [2, 3]);
  assert.equal(plan.candidateRules.targetSchemaVersion, 4);
  assert.equal(plan.candidateRules.v4RootHardDeleteAllowed, false);
});
