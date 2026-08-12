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
  writeRulesReady: false,
  syncReady: false,
  aggregateReady: false,
  lifecycleReady: false,
  purgeReady: false,
  remoteConfigEnabled: true,
};

const pilotRemote = {
  enabled: true,
  killSwitch: false,
  mode: 'pilot',
  cohortPercent: 5,
  readRulesReady: true,
  writeRulesReady: true,
  syncReady: true,
  aggregateReady: true,
  lifecycleReady: true,
  purgeReady: true,
};

test('runtime Gate G activa READ solo con todos los seguros de lectura abiertos', () => {
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

  assert.equal(result.enabled, true);
  assert.equal(result.killSwitch, false);
  assert.equal(result.mode, 'read');
  assert.equal(result.cohortPercent, 5);
  assert.equal(result.readRulesReady, true);
  assert.equal(result.writeRulesReady, false);
});

test('runtime Gate G acepta PILOT solo con readiness completo', () => {
  const result = normalizeRemoteRolloutConfig({ base, remote: pilotRemote });
  assert.equal(result.enabled, true);
  assert.equal(result.killSwitch, false);
  assert.equal(result.mode, 'pilot');
  for (const field of [
    'readRulesReady',
    'writeRulesReady',
    'syncReady',
    'aggregateReady',
    'lifecycleReady',
    'purgeReady',
  ]) {
    assert.equal(result[field], true, field);
  }
});

test('runtime Gate G falla cerrado ante parámetros incompletos', () => {
  const incompletePilot = { ...pilotRemote, aggregateReady: false };
  for (const remote of [
    {},
    { enabled: true, killSwitch: false, mode: 'read', cohortPercent: 5 },
    incompletePilot,
    { enabled: true, killSwitch: true, mode: 'read', cohortPercent: 5, readRulesReady: true },
    { enabled: true, killSwitch: false, mode: 'read', cohortPercent: 0, readRulesReady: true },
  ]) {
    const result = normalizeRemoteRolloutConfig({ base, remote });
    assert.equal(result.enabled, false);
    assert.equal(result.killSwitch, true);
    assert.equal(result.mode, 'off');
    assert.equal(result.cohortPercent, 0);
    assert.equal(result.readRulesReady, false);
    assert.equal(result.writeRulesReady, false);
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

test('failClosedRolloutConfig conserva metadata pero apaga todo readiness', () => {
  const result = failClosedRolloutConfig({ ...base, ...pilotRemote });
  assert.equal(result.enabled, false);
  assert.equal(result.killSwitch, true);
  assert.equal(result.mode, 'off');
  assert.equal(result.cohortPercent, 0);
  for (const field of [
    'readRulesReady',
    'writeRulesReady',
    'syncReady',
    'aggregateReady',
    'lifecycleReady',
    'purgeReady',
  ]) {
    assert.equal(result[field], false, field);
  }
});
