import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_STEADY_STATE_PRODUCTION_PROJECT,
  DEV_STEADY_STATE_PROJECT,
  assessDevStage,
  parseDevSteadyStateArgs,
  runStorageV4DevSteadyState,
} from '../scripts/runStorageV4DevSteadyState.mjs';

function safeStage(overrides = {}) {
  return {
    project: DEV_STEADY_STATE_PROJECT,
    touchesProduction: false,
    mutatesCloud: false,
    mutatesApplicationData: false,
    changesRemoteConfig: false,
    activatesClientPilotTraffic: false,
    backendReady: true,
    rules: { matchesCandidate: true },
    eventarc: { ready: true },
    remoteConfig: { safeForStage: true, pilotTrafficActivated: false },
    staged: true,
    ...overrides,
  };
}

test('dev steady-state is hard-bound to atlasmap-dev and production remains out of scope', () => {
  assert.equal(DEV_STEADY_STATE_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_STEADY_STATE_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.deepEqual(parseDevSteadyStateArgs([]), {});
  assert.throws(() => parseDevSteadyStateArgs(['--apply']), /read-only/);
  assert.throws(() => parseDevSteadyStateArgs(['--confirm=ANYTHING']), /read-only/);
});

test('assessment passes only for a fully staged fail-closed dev baseline', () => {
  const assessment = assessDevStage(safeStage());
  assert.equal(assessment.pass, true);
  assert.equal(assessment.projectIsDev, true);
  assert.equal(assessment.productionUntouched, true);
  assert.equal(assessment.remoteConfigSafeOff, true);

  assert.equal(assessDevStage(safeStage({ project: 'atlasmap-prod' })).pass, false);
  assert.equal(assessDevStage(safeStage({ touchesProduction: true })).pass, false);
  assert.equal(assessDevStage(safeStage({ mutatesCloud: true })).pass, false);
  assert.equal(assessDevStage(safeStage({ backendReady: false })).pass, false);
  assert.equal(assessDevStage(safeStage({ rules: { matchesCandidate: false } })).pass, false);
  assert.equal(assessDevStage(safeStage({ eventarc: { ready: false } })).pass, false);
  assert.equal(assessDevStage(safeStage({ remoteConfig: { safeForStage: false, pilotTrafficActivated: true } })).pass, false);
  assert.equal(assessDevStage(safeStage({ staged: false })).pass, false);
});

test('runner checks real dev stage then Phase K checkpoint without production mutation', async () => {
  const logLines = [];
  let checkpointCalls = 0;

  const result = await runStorageV4DevSteadyState({
    args: [],
    verifyStage: async () => safeStage(),
    runCloudCheckpoint: async () => {
      checkpointCalls += 1;
      return true;
    },
    log: (value) => logLines.push(value),
  });

  assert.equal(checkpointCalls, 1);
  assert.equal(result.pass, true);
  assert.equal(result.project, 'atlasmap-dev');
  assert.equal(result.productionMutated, false);
  assert.equal(result.storageV4ProductionReadWriteChanged, false);
  assert.match(logLines[0], /productionRolloutFrozen/);
});

test('runner does not continue to Phase K when dev stage is unsafe', async () => {
  let checkpointCalls = 0;
  await assert.rejects(
    runStorageV4DevSteadyState({
      args: [],
      verifyStage: async () => safeStage({
        remoteConfig: { safeForStage: false, pilotTrafficActivated: true },
        staged: false,
      }),
      runCloudCheckpoint: async () => {
        checkpointCalls += 1;
      },
      log: () => {},
    }),
    /baseline seguro esperado/
  );
  assert.equal(checkpointCalls, 0);
});
