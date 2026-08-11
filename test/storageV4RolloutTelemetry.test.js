import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservedTripRepository } from '../src/modules/storage-v4/rolloutRepositoryTelemetry.js';

function repository(overrides = {}) {
  return {
    async list() {
      return [
        { id: 'legacy-secret-id', name: 'Private legacy', storageVersion: 3 },
        { id: 'v4-secret-id', name: 'Private v4', schemaVersion: 4 },
      ];
    },
    async get() {
      return { id: 'v4-secret-id', name: 'Private v4', schemaVersion: 4 };
    },
    async save(value) { return value; },
    async remove() {},
    ...overrides,
  };
}

test('telemetría Gate G compara schemas sin incluir identidad ni contenido del viaje', async () => {
  const events = [];
  let clock = 100;
  const observed = createObservedTripRepository({
    repository: repository(),
    repositoryMode: 'hybrid-read',
    emit: (event) => events.push(event),
    now: () => (clock += 5),
  });

  await observed.list();
  await observed.get('v4-secret-id');

  assert.deepEqual(events[0], {
    operation: 'list',
    repositoryMode: 'hybrid-read',
    outcome: 'success',
    durationMs: 5,
    resultCount: 2,
    v4Count: 1,
    legacyCount: 1,
  });
  assert.deepEqual(events[1], {
    operation: 'get',
    repositoryMode: 'hybrid-read',
    outcome: 'success',
    durationMs: 5,
    found: true,
    resultSchema: 'v4',
  });
  const serialized = JSON.stringify(events);
  assert.doesNotMatch(serialized, /secret-id|Private/);
});

test('telemetría Gate G conserva error code sin tragarse la excepción', async () => {
  const events = [];
  const failure = Object.assign(new Error('falló'), { code: 'permission-denied' });
  const observed = createObservedTripRepository({
    repository: repository({ async get() { throw failure; } }),
    repositoryMode: 'hybrid-read',
    emit: (event) => events.push(event),
    now: () => 500,
  });

  await assert.rejects(observed.get('private-id'), (error) => error === failure);
  assert.deepEqual(events, [{
    operation: 'get',
    repositoryMode: 'hybrid-read',
    outcome: 'error',
    durationMs: 0,
    errorCode: 'permission-denied',
  }]);
});
