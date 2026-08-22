import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PILOT_RC_CONFIRMATIONS,
  buildPilotRemoteConfigPlan,
  parsePilotRemoteConfigArgs,
} from '../scripts/runStorageV4PilotRemoteConfigDev.mjs';

function summary({ readiness = false } = {}) {
  return {
    enabled: 'false',
    killSwitch: 'true',
    mode: 'off',
    cohortPercent: '0',
    readiness: {
      readRulesReady: readiness ? 'true' : 'false',
      writeRulesReady: readiness ? 'true' : 'false',
      syncReady: readiness ? 'true' : 'false',
      aggregateReady: readiness ? 'true' : 'false',
      touchReady: readiness ? 'true' : 'false',
      lifecycleReady: readiness ? 'true' : 'false',
      purgeReady: readiness ? 'true' : 'false',
    },
  };
}

test('Remote Config pilot controller es dry-run por defecto y exige acción explícita', () => {
  assert.deepEqual(parsePilotRemoteConfigArgs(['--action=readiness']), {
    action: 'readiness',
    apply: false,
    cohortPercent: null,
    confirmation: '',
  });
  assert.throws(() => parsePilotRemoteConfigArgs([]), /--action/);
  assert.throws(() => parsePilotRemoteConfigArgs(['--action=unknown']), /--action/);
});

test('activate exige cohorte explícita y confirmación distinta a readiness/kill', () => {
  assert.throws(
    () => parsePilotRemoteConfigArgs(['--action=activate']),
    /--cohort-percent/
  );
  const activation = parsePilotRemoteConfigArgs([
    '--action=activate',
    '--cohort-percent=1',
    '--apply',
    `--confirm=${PILOT_RC_CONFIRMATIONS.activate}`,
  ]);
  assert.equal(activation.cohortPercent, 1);
  assert.equal(activation.apply, true);

  assert.throws(
    () => parsePilotRemoteConfigArgs([
      '--action=activate',
      '--cohort-percent=1',
      '--apply',
      `--confirm=${PILOT_RC_CONFIRMATIONS.readiness}`,
    ]),
    /--confirm/
  );
});

test('readiness solo parte de OFF seguro y activation exige readiness completo', () => {
  const readinessPlan = buildPilotRemoteConfigPlan({
    action: 'readiness',
    currentSummary: summary(),
  });
  assert.equal(readinessPlan.canApplyFromConfigState, true);
  assert.equal(readinessPlan.requiresStageVerification, true);

  const blockedActivation = buildPilotRemoteConfigPlan({
    action: 'activate',
    cohortPercent: 1,
    currentSummary: summary(),
  });
  assert.equal(blockedActivation.canApplyFromConfigState, false);

  const activationPlan = buildPilotRemoteConfigPlan({
    action: 'activate',
    cohortPercent: 1,
    currentSummary: summary({ readiness: true }),
  });
  assert.equal(activationPlan.canApplyFromConfigState, true);
  assert.equal(activationPlan.requiresStageVerification, true);
});

test('kill switch puede solicitarse aun desde un rollout activo y no despliega backend', () => {
  const current = summary({ readiness: true });
  current.enabled = 'true';
  current.killSwitch = 'false';
  current.mode = 'pilot';
  current.cohortPercent = '1';
  const plan = buildPilotRemoteConfigPlan({ action: 'kill', currentSummary: current });
  assert.equal(plan.canApplyFromConfigState, true);
  assert.equal(plan.requiresStageVerification, false);
  assert.equal(plan.deploysFunctions, false);
  assert.equal(plan.deploysRules, false);
  assert.equal(plan.touchesProduction, false);
});

test('controller no activa nada sin --apply y aplica ETag + post-check al mutar', async () => {
  const source = await readFile(
    new URL('../scripts/runStorageV4PilotRemoteConfigDev.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /if \(!options\.apply\)/);
  assert.match(source, /validateRemoteConfigTemplate/);
  assert.match(source, /publishRemoteConfigTemplate/);
  assert.match(source, /etag: current\.etag/);
  assert.match(source, /Post-check de Remote Config/);
  assert.match(source, /buildPilotStageVerification/);
  assert.doesNotMatch(source, /firebase[^\n]*deploy/);
});
