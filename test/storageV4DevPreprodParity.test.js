import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_PREPROD_PRODUCTION_PROJECT,
  DEV_PREPROD_PROJECT,
  assessDevPreprodStage,
  classifyDevRemoteConfig,
  parseDevPreprodParityArgs,
  runStorageV4DevPreprodParity,
} from '../scripts/runStorageV4DevPreprodParity.mjs';

function baseStage(overrides = {}) {
  return {
    project: DEV_PREPROD_PROJECT,
    touchesProduction: false,
    mutatesCloud: false,
    mutatesApplicationData: false,
    changesRemoteConfig: false,
    activatesClientPilotTraffic: false,
    backendReady: true,
    rules: { matchesCandidate: true },
    eventarc: { ready: true },
    remoteConfig: {
      enabled: 'true',
      killSwitch: 'false',
      mode: 'pilot',
      cohortPercent: '0.01',
      safeForStage: false,
      pilotTrafficActivated: true,
    },
    readinessCandidates: {
      writeRulesReady: true,
      aggregateReady: true,
      touchReady: true,
      lifecycleReady: true,
      purgeReady: true,
    },
    staged: false,
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

test('Remote Config accepts fail-closed or an explicit controlled pilot', () => {
  const pilot = classifyDevRemoteConfig(baseStage());
  assert.equal(pilot.mode, 'controlled-pilot');
  assert.equal(pilot.cohortPercent, 0.01);
  assert.equal(pilot.acceptableForPreprod, true);

  const off = classifyDevRemoteConfig(baseStage({
    remoteConfig: {
      enabled: 'false',
      killSwitch: 'true',
      mode: 'off',
      cohortPercent: '0',
      safeForStage: true,
      pilotTrafficActivated: false,
    },
  }));
  assert.equal(off.mode, 'fail-closed');
  assert.equal(off.acceptableForPreprod, true);

  const invalid = classifyDevRemoteConfig(baseStage({
    remoteConfig: {
      enabled: 'true',
      killSwitch: 'true',
      mode: 'pilot',
      cohortPercent: '10',
      safeForStage: false,
      pilotTrafficActivated: true,
    },
  }));
  assert.equal(invalid.mode, 'invalid');
  assert.equal(invalid.acceptableForPreprod, false);
});

test('assessment passes for the current controlled dev pilot but still rejects infrastructure drift', () => {
  assert.equal(assessDevPreprodStage(baseStage()).pass, true);
  assert.equal(assessDevPreprodStage(baseStage({ project: 'atlasmap-prod' })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ touchesProduction: true })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ backendReady: false })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ rules: { matchesCandidate: false } })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ eventarc: { ready: false } })).pass, false);
  assert.equal(assessDevPreprodStage(baseStage({ readinessCandidates: { writeRulesReady: false } })).pass, false);
});

test('runner continues through Phase K for production-like dev pilot without mutating production', async () => {
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
  assert.equal(result.remoteConfigMode, 'controlled-pilot');
  assert.equal(result.remoteConfigCohortPercent, 0.01);
  assert.equal(result.productionMutated, false);
});
