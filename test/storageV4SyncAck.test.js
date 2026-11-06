import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
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
    payload: { note: 'cuatro' },
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
    payload: { note: 'cuatro' },
    createdAtLocal: 500,
    updatedAtLocal: 1000,
    attempts: 0,
    nextAttemptAt: null,
    ...overrides,
  };
}

async function leader(store, contextId = 'tab-a', nowMs = 1000) {
  return store.tryAcquireSyncLease({ contextId, nowMs, ttlMs: 5000 });
}

test('ack exacto actualiza versión y limpia entidad y mutación en una sola operación', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity(entity());
  const sent = await store.putMutation(mutation());
  const lease = await leader(store);

  const result = await store.acknowledgeSyncedMutation({
    sentMutation: sent,
    serverVersion: 4,
    serverStatus: 'active',
    contextId: 'tab-a',
    generation: lease.generation,
    nowMs: 2000,
  });

  assert.equal(result.apply, true);
  assert.equal(result.kind, 'clean');
  assert.equal(await store.getMutation(key), null);
  const saved = await store.getEntity(key);
  assert.equal(saved.serverVersion, 4);
  assert.equal(saved.serverStatus, 'active');
  assert.equal(saved.state, V4_LOCAL_STATES.CLEAN);
  assert.equal(saved.localRevision, 4);
});

test('ack tardío rebasa una edición local más nueva sin perder payload ni edad de cola', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity(entity());
  const sent = await store.putMutation(mutation());
  const lease = await leader(store);

  await store.putEntity(entity({
    payload: { note: 'cinco' },
    localRevision: 5,
    lastModifiedLocal: 1500,
  }));
  await store.putMutation(mutation({
    localRevision: 5,
    payload: { note: 'cinco' },
    createdAtLocal: 500,
    updatedAtLocal: 1500,
  }));

  const result = await store.acknowledgeSyncedMutation({
    sentMutation: sent,
    serverVersion: 4,
    serverStatus: 'active',
    contextId: 'tab-a',
    generation: lease.generation,
    nowMs: 2000,
  });

  assert.equal(result.kind, 'rebased');
  const pending = await store.getMutation(key);
  assert.equal(pending.baseVersion, 4);
  assert.equal(pending.localRevision, 5);
  assert.equal(pending.createdAtLocal, 500);
  assert.deepEqual(pending.payload, { note: 'cinco' });
  const saved = await store.getEntity(key);
  assert.equal(saved.serverVersion, 4);
  assert.equal(saved.localRevision, 5);
  assert.deepEqual(saved.payload, { note: 'cinco' });
  assert.equal(saved.state, V4_LOCAL_STATES.DIRTY);
});

test('un contexto que perdió el lease no puede aplicar un ack antiguo', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity(entity());
  const sent = await store.putMutation(mutation());
  const firstLease = await leader(store);
  const secondLease = await leader(store, 'tab-b', 6000);
  assert.equal(secondLease.generation, firstLease.generation + 1);

  const result = await store.acknowledgeSyncedMutation({
    sentMutation: sent,
    serverVersion: 4,
    serverStatus: 'active',
    contextId: 'tab-a',
    generation: firstLease.generation,
    nowMs: 6001,
  });

  assert.equal(result.apply, false);
  assert.equal(result.reason, 'lease-lost');
  assert.equal((await store.getEntity(key)).serverVersion, 3);
  assert.equal((await store.getMutation(key)).localRevision, 4);
});

test('DELETE confirmado rebasa una restauración local posterior a RESTORE', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity(entity({
    desiredStatus: 'deleted',
    payload: null,
  }));
  const sent = await store.putMutation(mutation({
    operation: V4_MUTATION_OPERATIONS.DELETE,
    desiredStatus: 'deleted',
    payload: null,
  }));
  const lease = await leader(store);

  await store.putEntity(entity({
    desiredStatus: 'active',
    localRevision: 5,
    payload: { note: 'restaurado' },
    lastModifiedLocal: 1500,
  }));
  await store.putMutation(mutation({
    operation: V4_MUTATION_OPERATIONS.UPDATE,
    desiredStatus: 'active',
    localRevision: 5,
    payload: { note: 'restaurado' },
    updatedAtLocal: 1500,
  }));

  const result = await store.acknowledgeSyncedMutation({
    sentMutation: sent,
    serverVersion: 4,
    serverStatus: 'deleted',
    contextId: 'tab-a',
    generation: lease.generation,
    nowMs: 2000,
  });

  assert.equal(result.kind, 'rebased');
  const pending = await store.getMutation(key);
  assert.equal(pending.operation, V4_MUTATION_OPERATIONS.RESTORE);
  assert.equal(pending.baseVersion, 4);
  assert.equal(pending.baseStatus, 'deleted');
  assert.equal(pending.localRevision, 5);
  assert.deepEqual(pending.payload, { note: 'restaurado' });
});

test('ack con versión o estado remoto imposible falla sin alterar datos locales', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity(entity());
  const sent = await store.putMutation(mutation());
  const lease = await leader(store);

  await assert.rejects(
    store.acknowledgeSyncedMutation({
      sentMutation: sent,
      serverVersion: 9,
      serverStatus: 'active',
      contextId: 'tab-a',
      generation: lease.generation,
      nowMs: 2000,
    }),
    /versión confirmada/
  );
  assert.equal((await store.getEntity(key)).serverVersion, 3);
  assert.equal((await store.getMutation(key)).localRevision, 4);
});
