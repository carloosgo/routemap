import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createV4SyncRuntime } from '../src/modules/storage-v4/syncRuntime.js';

function intent(entityId) {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId,
    serverVersion: 0,
    serverStatus: 'missing',
    desiredStatus: 'active',
    payload: { id: entityId, note: 'private-content' },
  };
}

function runtime(store, metrics, nowMs = 5000) {
  return createV4SyncRuntime({
    userId: 'alice',
    localPersistence: store,
    syncCoordinator: {
      flush: async () => ({ leader: true, pending: 0, nextAttemptAt: null }),
    },
    now: () => nowMs,
    lifecycleOptions: {
      setTimer: () => 1,
      clearTimer: () => {},
      onMetric: (metric) => metrics.push(metric),
    },
  });
}

test('queue recovery reporta count y edad sin IDs ni payload', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.commitLocalIntent({ intent: intent('segment-secret-a'), nowMs: 1000 });
  await store.commitLocalIntent({ intent: intent('segment-secret-b'), nowMs: 3000 });
  const metrics = [];
  const sync = runtime(store, metrics, 5000);

  assert.equal(await sync.recoverPending(), 2);
  assert.deepEqual(metrics[0], {
    event: 'queue-recovery',
    pending: 2,
    oldestPendingAgeMs: 4000,
  });
  assert.doesNotMatch(
    JSON.stringify(metrics[0]),
    /alice|trip-1|segment-secret|private-content|userId|tripId|entityId|payload/i
  );
});

test('queue recovery vacía emite cero y no agenda datos ficticios', async () => {
  const store = createMemoryV4LocalPersistence();
  const metrics = [];
  const sync = runtime(store, metrics, 5000);

  assert.equal(await sync.recoverPending(), 0);
  assert.deepEqual(metrics, [{
    event: 'queue-recovery',
    pending: 0,
    oldestPendingAgeMs: 0,
  }]);
});

test('queue recovery no depende de que el sink de métricas funcione', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.commitLocalIntent({ intent: intent('segment-1'), nowMs: 1000 });
  const sync = createV4SyncRuntime({
    userId: 'alice',
    localPersistence: store,
    syncCoordinator: {
      flush: async () => ({ leader: true, pending: 0, nextAttemptAt: null }),
    },
    now: () => 5000,
    lifecycleOptions: {
      setTimer: () => 1,
      clearTimer: () => {},
      onMetric: () => { throw new Error('telemetry unavailable'); },
    },
  });

  assert.equal(await sync.recoverPending(), 1);
});
