import test from 'node:test';
import assert from 'node:assert/strict';
import {
  failClosedRolloutConfig,
  normalizeRemoteRolloutConfig,
} from '../src/modules/storage-v4/gateGRuntimeConfigModel.js';

const base = {
  enabled: false,
  killSwitch: true,
  mode: 'off',
  cohortPercent: 0,
  salt: 'atlas-storage-v4',
  readRulesReady: false,
  remoteConfigEnabled: true,
};

test('runtime Gate G activa READ solo con todos los seguros abiertos explícitamente', () => {
  const result = normalizeRemoteRolloutConfig({
    base,
    remote: {
      enabled: true,
      killSwitch: false,
      mode: 'read',
      cohortPercent: 5,
      readRulesReady: true,
    },
  });

  assert.deepEqual(result, {
    ...base,
    enabled: true,
    killSwitch: false,
    mode: 'read',
    cohortPercent: 5,
    readRulesReady: true,
  });
});

test('runtime Gate G falla cerrado ante parámetros incompletos o modo pilot', () => {
  for (const remote of [
    {},
    { enabled: true, killSwitch: false, mode: 'read', cohortPercent: 5 },
    { enabled: true, killSwitch: false, mode: 'pilot', cohortPercent: 5, readRulesReady: true },
    { enabled: true, killSwitch: true, mode: 'read', cohortPercent: 5, readRulesReady: true },
    { enabled: true, killSwitch: false, mode: 'read', cohortPercent: 0, readRulesReady: true },
  ]) {
    const result = normalizeRemoteRolloutConfig({ base, remote });
    assert.equal(result.enabled, false);
    assert.equal(result.killSwitch, true);
    assert.equal(result.mode, 'off');
    assert.equal(result.cohortPercent, 0);
    assert.equal(result.readRulesReady, false);
  }
});

test('runtime Gate G limita cohortes al rango 0..100', () => {
  const result = normalizeRemoteRolloutConfig({
    base,
    remote: {
      enabled: true,
      killSwitch: false,
      mode: 'read',
      cohortPercent: 150,
      readRulesReady: true,
    },
  });
  assert.equal(result.cohortPercent, 100);
});

test('failClosedRolloutConfig conserva metadata pero apaga rollout', () => {
  assert.deepEqual(failClosedRolloutConfig({ ...base, enabled: true, mode: 'read' }), {
    ...base,
    enabled: false,
    killSwitch: true,
    mode: 'off',
    cohortPercent: 0,
    readRulesReady: false,
  });
});
