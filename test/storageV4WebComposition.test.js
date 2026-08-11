import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createV4WebSyncComposition } from '../src/infrastructure/firebase/createV4WebSyncComposition.js';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';

function intent() {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    serverVersion: 0,
    serverStatus: 'missing',
    desiredStatus: 'active',
    payload: { id: 'segment-1', rank: '5000000000', note: 'local' },
  };
}

function inertNotifier() {
  return {
    publish() {},
    subscribe() { return () => {}; },
    close() {},
  };
}

test('composition root ensambla local queue -> coordinator -> gateway sin activar la app', async () => {
  const localPersistence = createMemoryV4LocalPersistence();
  const writes = [];
  const timers = new Map();
  let timerId = 0;
  const composition = createV4WebSyncComposition({
    uid: 'alice',
    contextId: 'tab-a',
    localPersistence,
    crossContextNotifier: inertNotifier(),
    remoteGateway: {
      async writeMutation(mutation) {
        writes.push(mutation);
        return { serverVersion: 1, serverStatus: 'active' };
      },
    },
    now: () => 1000,
    lifecycleOptions: {
      setTimer(callback) {
        timerId += 1;
        timers.set(timerId, callback);
        return timerId;
      },
      clearTimer(handle) {
        timers.delete(handle);
      },
    },
  });

  await composition.runtime.commitIntent(intent());
  assert.equal((await localPersistence.listMutations({ userId: 'alice' })).length, 1);

  const result = await composition.syncCoordinator.flush({ userId: 'alice' });
  assert.equal(result.synced, 1);
  assert.equal(writes.length, 1);
  assert.equal((await localPersistence.listMutations({ userId: 'alice' })).length, 0);
  assert.equal((await localPersistence.getEntity('alice/trip-1/segment/segment-1')).state, 'clean');

  await composition.stop();
});

test('composition root no se conecta al selector productivo antes de Gate G', async () => {
  const selectorSource = await readFile(
    new URL('../src/modules/trips/tripRepositorySelector.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(selectorSource, /createV4WebSyncComposition/);
  assert.doesNotMatch(selectorSource, /createFirestoreHybridTripRepository/);
  assert.match(selectorSource, /createFirestoreTripRepository/);
});
