import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import {
  V4_REMOTE_ERROR_KIND,
  V4RemoteSyncError,
  createV4SyncCoordinator,
} from '../src/modules/storage-v4/syncCoordinator.js';
import {
  V4_LOCAL_STATES,
  V4_MUTATION_OPERATIONS,
} from '../src/modules/storage-v4/storageV4Contract.js';

const key = 'alice/trip-1/segment/segment-1';

function entity(overrides = {}) {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    payload: { note: 'local' },
    serverVersion: 3,
    serverStatus: 'active',
    desiredStatus: 'active',
    localRevision: 4,
    state: V4_LOCAL_STATES.DIRTY,
    lastModifiedLocal: 1000,
    ...overrides,
  };
}

function mutation(overrides = {}) {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    operation: V4_MUTATION_OPERATIONS.UPDATE,
    baseVersion: 3,
    baseStatus: 'active',
    desiredStatus: 'active',
    localRevision: 4,
    payload: { note: 'local' },
    createdAtLocal: 500,
    updatedAtLocal: 1000,
    attempts: 0,
    nextAttemptAt: null,
    ...overrides,
  };
}

async function seed(store, entityOverrides = {}, mutationOverrides = {}) {
  await store.putEntity(entity(entityOverrides));
  await store.putMutation(mutation(mutationOverrides));
}

test('flush exitoso confirma una mutación y deja la entidad limpia', async () => {
  const store = createMemoryV4LocalPersistence();
  await seed(store);
  const coordinator = createV4SyncCoordinator({
    localPersistence: store,
    remoteGateway: {
      async writeMutation() {
        return { serverVersion: 4, serverStatus: 'active' };
      },
    },
    contextId: 'tab-a',
    now: () => 2000,
  });

  const summary = await coordinator.flush({ userId: 'alice', tripId: 'trip-1' });
  assert.deepEqual(summary, {
    leader: true,
    attempted: 1,
    synced: 1,
    retried: 0,
    conflicts: 0,
  });
  assert.equal(await store.getMutation(key), null);
  assert.equal((await store.getEntity(key)).state, V4_LOCAL_STATES.CLEAN);
});

test('error retryable aplica backoff determinista y no reintenta antes de tiempo', async () => {
  const store = createMemoryV4LocalPersistence();
  await seed(store);
  let writes = 0;
  let currentTime = 2000;
  const coordinator = createV4SyncCoordinator({
    localPersistence: store,
    remoteGateway: {
      async writeMutation() {
        writes += 1;
        throw new V4RemoteSyncError(
          V4_REMOTE_ERROR_KIND.RETRYABLE,
          'temporarily unavailable'
        );
      },
    },
    contextId: 'tab-a',
    now: () => currentTime,
    randomUnit: () => 0.5,
  });

  const first = await coordinator.flush({ userId: 'alice' });
  assert.equal(first.retried, 1);
  assert.equal((await store.getMutation(key)).nextAttemptAt, 3000);
  currentTime = 2500;
  const second = await coordinator.flush({ userId: 'alice' });
  assert.equal(second.attempted, 0);
  assert.equal(writes, 1);
});

test('conflicto remoto se conserva como conflicto durable sin merge automático', async () => {
  const store = createMemoryV4LocalPersistence();
  await seed(store);
  const coordinator = createV4SyncCoordinator({
    localPersistence: store,
    remoteGateway: {
      async writeMutation() {
        throw new V4RemoteSyncError(
          V4_REMOTE_ERROR_KIND.CONFLICT,
          'version conflict',
          {
            remoteEntity: {
              serverVersion: 5,
              serverStatus: 'active',
              payload: { note: 'remoto' },
            },
          }
        );
      },
    },
    contextId: 'tab-a',
    now: () => 2500,
  });

  const summary = await coordinator.flush({ userId: 'alice' });
  assert.equal(summary.conflicts, 1);
  assert.equal(await store.getMutation(key), null);
  const saved = await store.getEntity(key);
  assert.equal(saved.state, V4_LOCAL_STATES.CONFLICT);
  assert.deepEqual(saved.payload, { note: 'local' });
  assert.deepEqual(saved.conflict.payload, { note: 'remoto' });
});

test('si otra pestaña toma el lease durante la red el ack viejo no limpia la cola', async () => {
  const store = createMemoryV4LocalPersistence();
  await seed(store);
  let currentTime = 1000;
  const coordinator = createV4SyncCoordinator({
    localPersistence: store,
    remoteGateway: {
      async writeMutation() {
        currentTime = 9000;
        const takeover = await store.tryAcquireSyncLease({
          contextId: 'tab-b',
          nowMs: currentTime,
          ttlMs: 8000,
        });
        assert.ok(takeover);
        currentTime = 9001;
        return { serverVersion: 4, serverStatus: 'active' };
      },
    },
    contextId: 'tab-a',
    now: () => currentTime,
    leaseTtlMs: 8000,
  });

  const summary = await coordinator.flush({ userId: 'alice' });
  assert.equal(summary.attempted, 1);
  assert.equal(summary.synced, 0);
  assert.ok(await store.getMutation(key));
  assert.equal((await store.getEntity(key)).serverVersion, 3);
});

test('error remoto no tipado se propaga y conserva la mutación durable', async () => {
  const store = createMemoryV4LocalPersistence();
  await seed(store);
  const coordinator = createV4SyncCoordinator({
    localPersistence: store,
    remoteGateway: {
      async writeMutation() {
        throw new Error('programmer or security error');
      },
    },
    contextId: 'tab-a',
    now: () => 2000,
  });

  await assert.rejects(
    coordinator.flush({ userId: 'alice' }),
    /programmer or security error/
  );
  assert.ok(await store.getMutation(key));
  assert.equal((await store.getEntity(key)).state, V4_LOCAL_STATES.DIRTY);
});

test('flush respeta el límite de lote para evitar drains sin cota', async () => {
  const store = createMemoryV4LocalPersistence();
  for (let index = 1; index <= 3; index += 1) {
    await seed(
      store,
      { entityId: `segment-${index}`, localRevision: 1 },
      {
        entityId: `segment-${index}`,
        localRevision: 1,
        createdAtLocal: index,
        updatedAtLocal: index,
      }
    );
  }
  let writes = 0;
  const coordinator = createV4SyncCoordinator({
    localPersistence: store,
    remoteGateway: {
      async writeMutation() {
        writes += 1;
        return { serverVersion: 4, serverStatus: 'active' };
      },
    },
    contextId: 'tab-a',
    now: () => 2000,
    maxMutationsPerFlush: 2,
  });

  const summary = await coordinator.flush({ userId: 'alice' });
  assert.equal(summary.attempted, 2);
  assert.equal(writes, 2);
  assert.equal((await store.listMutations({ userId: 'alice' })).length, 1);
});
