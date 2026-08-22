import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGateGTripRepository } from '../src/infrastructure/firebase/createGateGTripRepository.js';

function fakeRepository() {
  return {
    async list() { return []; },
    async get() { return null; },
    async save(value) { return value; },
    async remove() {},
  };
}

const rolloutOff = {
  enabled: false,
  killSwitch: true,
  mode: 'off',
  cohortPercent: 0,
  salt: 'atlas-storage-v4',
  readRulesReady: false,
};

test('Gate G solo envuelve el repositorio con telemetría cuando se inyecta un emitter', async () => {
  const emitted = [];
  const base = fakeRepository();
  const { repository } = createGateGTripRepository({
    db: {},
    uid: 'alice',
    rolloutConfig: rolloutOff,
    emitTelemetry: (event) => emitted.push(event),
    now: (() => {
      let value = 100;
      return () => value += 5;
    })(),
    v3Factory: () => base,
    hybridFactory: () => fakeRepository(),
  });

  await repository.list();
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].operation, 'list');
  assert.equal(emitted[0].repositoryMode, 'v3');
  assert.equal(emitted[0].outcome, 'success');
});

test('functions/index exporta solo la callable observacional de Gate G READ', async () => {
  const indexSource = await readFile('functions/index.js', 'utf8');
  assert.match(
    indexSource,
    /export\s*\{\s*storageV4RolloutTelemetry\s*\}\s*from\s*['"]\.\/v4RolloutTelemetryFunction\.js['"]/,
  );

  for (const forbiddenModule of [
    'v4AggregateTriggers',
    'v4TripLifecycleFunction',
    'v4TripPurgeScheduler',
    'v4MigrationStore',
  ]) {
    assert.doesNotMatch(indexSource, new RegExp(forbiddenModule));
  }
});
