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

test('READ cohort crea el repositorio híbrido candidato', () => {
  const calls = [];
  const result = createGateGTripRepository({
    db: { fake: true },
    uid: 'alice',
    rolloutConfig: read100,
    v3Factory: factory('v3', calls),
    hybridFactory: factory('hybrid', calls),
  });

  assert.equal(result.repository.label, 'hybrid');
  assert.equal(result.rollout.repositoryMode, 'hybrid-read');
  assert.deepEqual(calls.map((item) => item.label), ['hybrid']);
  assert.equal(calls[0].input.uid, 'alice');
});

test('rules no listas, kill switch y PILOT todavía crean v3', () => {
  for (const rolloutConfig of [
    { ...read100, readRulesReady: false },
    { ...read100, killSwitch: true },
    { ...read100, mode: 'pilot' },
  ]) {
    const calls = [];
    const result = createGateGTripRepository({
      db: { fake: true },
      uid: 'alice',
      rolloutConfig,
      v3Factory: factory('v3', calls),
      hybridFactory: factory('hybrid', calls),
    });
    assert.equal(result.repository.label, 'v3');
    assert.deepEqual(calls.map((item) => item.label), ['v3']);
  }
});

test('selector Gate G usa la factory candidata pero conserva write runtime v4 desconectado', async () => {
  const selectorSource = await readFile(
    new URL('../src/modules/trips/tripRepositorySelector.js', import.meta.url),
    'utf8'
  );
  assert.match(selectorSource, /createGateGTripRepository/);
  assert.match(selectorSource, /config\.storageV4Rollout/);
  assert.doesNotMatch(selectorSource, /createV4WebSyncComposition/);
});
