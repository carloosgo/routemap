import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_PREPROD_PRODUCTION_PROJECT,
  DEV_PREPROD_PROJECT,
  assessDevPreprodStage,
  parseDevPreprodParityArgs,
  runStorageV4DevPreprodParity,
} from '../scripts/runStorageV4DevPreprodParity.mjs';

function baseStage(overrides = {}) {
  return {
    project: DEV_PREPROD_PROJECT,
    touchesProduction: false,
    mutatesCloud: false,
    mutatesApplicationData: false,
    backendReady: true,
    rules: { matchesCandidate: true },
    eventarc: { ready: true },
    readinessCandidates: {
      writeRulesReady: true,
      eventIngressReady: true,
      lifecycleReady: true,
      purgeReady: true,
    },
    staged: true,
    ...overrides,
  };
}

test('preprod parity is hard-bound to dev and strictly read-only', () => {
  assert.equal(DEV_PREPROD_PROJECT, 'atlasmap-dev');
  assert.equal(DEV_PREPROD_PRODUCTION_PROJECT, 'atlasmap-prod');
  assert.deepEqual(parseDevPreprodParityArgs([]), {});
  assert.throws(() => parseDevPreprodParityArgs(['--apply']), /read-only/);
  assert.throws(() => parseDevPreprodParityArgs(['--confirm=ANY']), /read-only/);
});

test('assessment requires canonical Functions, Eventarc, Rules and readiness without rollout state', () => {
  const assessment = assessDevPreprodStage(baseStage());
  assert.equal(assessment.pass, true);
  assert.equal(assessment.readinessReady, true);
  assert.equal(assessment.staged, true);

  assert.equal(assessDevPreprodStage(baseStage({ project: 'atlasmap-prod' })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ touchesProduction: true })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ backendReady: false })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ rules: { matchesCandidate: false } })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ eventarc: { ready: false } })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ readinessCandidates: { writeRulesReady: false } })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ staged: false })).pass, false);
});

test('runner continues through Phase K for production-like canonical dev stage without mutating production', async () => {
  let checkpointCalls = 0;
  const result = await runStorageV4DevPreprodParity({
    args: [],
    verifyStage: async () => baseStage(),
    runCloudCheckpoint: async () => {
      checkpointCalls += 1;
      return true;
    },
    log: () => {},
  });

  assert.equal(checkpointCalls, 1);
  assert.equal(result.pass, true);
  assert.equal(result.canonicalV4StageReady, true);
  assert.equal(result.phaseKOperationalCheckpointPass, true);
  assert.equal(result.productionMutated, false);
});

test('runner blocks before Phase K when dev has canonical v4 drift', async () => {
  let checkpointCalls = 0;
  await assert.rejects(
    runStorageV4DevPreprodParity({
      args: [],
      verifyStage: async () => baseStage({ rules: { matchesCandidate: false }, staged: false }),
      runCloudCheckpoint: async () => {
        checkpointCalls += 1;
      },
      log: () => {},
    }),
    /drift respecto al stage v4 canónico/
  );
  assert.equal(checkpointCalls, 0);
});
