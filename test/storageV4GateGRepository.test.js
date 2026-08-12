import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGateGTripRepository } from '../src/infrastructure/firebase/createGateGTripRepository.js';

function factory(label, calls) {
  return (input) => {
    calls.push({ label, input });
    return { label };
  };
}

const read100 = {
  enabled: true,
  killSwitch: false,
  mode: 'read',
  cohortPercent: 100,
  salt: 'gate-g-repository-test',
  readRulesReady: true,
};

const pilot100 = {
  ...read100,
  mode: 'pilot',
  writeRulesReady: true,
  syncReady: true,
  aggregateReady: true,
  lifecycleReady: true,
  purgeReady: true,
};

test('READ cohort crea el repositorio híbrido candidato sin writer', () => {
  const calls = [];
  const result = createGateGTripRepository({
    db: { fake: true },
    uid: 'alice',
    rolloutConfig: read100,
    v3Factory: factory('v3', calls),
    hybridFactory: factory('hybrid', calls),
    pilotWriterFactory: factory('writer', calls),
  });

  assert.equal(result.repository.label, 'hybrid');
  assert.equal(result.rollout.repositoryMode, 'hybrid-read');
  assert.deepEqual(calls.map((item) => item.label), ['hybrid']);
  assert.equal(calls[0].input.uid, 'alice');
  assert.equal(calls[0].input.v4Writer, undefined);
});

test('PILOT listo construye writer y lo inyecta al híbrido', () => {
  const calls = [];
  const result = createGateGTripRepository({
    db: { fake: true },
    uid: 'alice',
    rolloutConfig: pilot100,
    v3Factory: factory('v3', calls),
    hybridFactory: factory('hybrid', calls),
    pilotWriterFactory: factory('writer', calls),
  });

  assert.equal(result.repository.label, 'hybrid');
  assert.equal(result.rollout.repositoryMode, 'v4-pilot');
  assert.deepEqual(calls.map((item) => item.label), ['writer', 'hybrid']);
  assert.equal(calls[1].input.v4Writer.label, 'writer');
  assert.equal(calls[0].input.lifecycleReady, true);
});

test('rules no listas, kill switch o PILOT incompleto crean v3 y no writer', () => {
  for (const rolloutConfig of [
    { ...read100, readRulesReady: false },
    { ...read100, killSwitch: true },
    { ...pilot100, aggregateReady: false },
  ]) {
    const calls = [];
    const result = createGateGTripRepository({
      db: { fake: true },
      uid: 'alice',
      rolloutConfig,
      v3Factory: factory('v3', calls),
      hybridFactory: factory('hybrid', calls),
      pilotWriterFactory: factory('writer', calls),
    });
    assert.equal(result.repository.label, 'v3');
    assert.deepEqual(calls.map((item) => item.label), ['v3']);
  }
});

test('selector usa la factory Gate G y no cablea composición v4 directamente', async () => {
  const selectorSource = await readFile(
    new URL('../src/modules/trips/tripRepositorySelector.js', import.meta.url),
    'utf8'
  );
  assert.match(selectorSource, /createGateGTripRepository/);
  assert.match(selectorSource, /config\.storageV4Rollout/);
  assert.doesNotMatch(selectorSource, /createV4WebSyncComposition/);
});
