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

async function setup() {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity(entity());
  const sent = await store.putMutation(mutation());
  const lease = await store.tryAcquireSyncLease({
    contextId: 'tab-a',
    nowMs: 1000,
    ttlMs: 5000,
  });
  return { store, sent, lease };
}

test('fallo retryable incrementa intentos sin alterar payload ni revisión local', async () => {
  const { store, sent, lease } = await setup();
  const result = await store.recordSyncFailure({
    sentMutation: sent,
    contextId: 'tab-a',
    generation: lease.generation,
    nowMs: 2000,
    nextAttemptAt: 4000,
  });

  assert.equal(result.apply, true);
  const pending = await store.getMutation(key);
  assert.equal(pending.attempts, 1);
  assert.equal(pending.nextAttemptAt, 4000);
  assert.equal(pending.localRevision, 4);
  assert.deepEqual(pending.payload, { note: 'local' });
  assert.equal((await store.getEntity(key)).state, V4_LOCAL_STATES.DIRTY);
});

test('fallo de una petición vieja nunca pisa una edición posterior', async () => {
  const { store, sent, lease } = await setup();
  await store.putEntity(entity({
    localRevision: 5,
    payload: { note: 'más nueva' },
    lastModifiedLocal: 1500,
  }));
  await store.putMutation(mutation({
    localRevision: 5,
    payload: { note: 'más nueva' },
    updatedAtLocal: 1500,
  }));

  const result = await store.recordSyncFailure({
    sentMutation: sent,
    contextId: 'tab-a',
    generation: lease.generation,
    nowMs: 2000,
    nextAttemptAt: 4000,
  });

  assert.equal(result.apply, true);
  const pending = await store.getMutation(key);
  assert.equal(pending.localRevision, 5);
  assert.deepEqual(pending.payload, { note: 'más nueva' });
  assert.equal(pending.attempts, 1);
});

test('conflicto conserva la intención local y captura por separado la versión remota', async () => {
  const { store, sent, lease } = await setup();
  const result = await store.recordSyncConflict({
    sentMutation: sent,
    remoteEntity: {
      serverVersion: 5,
      serverStatus: 'active',
      payload: { note: 'remoto' },
    },
    contextId: 'tab-a',
    generation: lease.generation,
    nowMs: 2500,
  });

  assert.equal(result.apply, true);
  assert.equal(await store.getMutation(key), null);
  const saved = await store.getEntity(key);
  assert.equal(saved.state, V4_LOCAL_STATES.CONFLICT);
  assert.equal(saved.serverVersion, 5);
  assert.deepEqual(saved.payload, { note: 'local' });
  assert.deepEqual(saved.conflict, {
    serverVersion: 5,
    serverStatus: 'active',
    payload: { note: 'remoto' },
    detectedAtLocal: 2500,
  });
});

test('conflicto detectado por líder antiguo no altera estado tras takeover', async () => {
  const { store, sent, lease } = await setup();
  const nextLease = await store.tryAcquireSyncLease({
    contextId: 'tab-b',
    nowMs: 6000,
    ttlMs: 5000,
  });
  assert.equal(nextLease.generation, lease.generation + 1);

  const result = await store.recordSyncConflict({
    sentMutation: sent,
    remoteEntity: {
      serverVersion: 5,
      serverStatus: 'active',
      payload: { note: 'remoto' },
    },
    contextId: 'tab-a',
    generation: lease.generation,
    nowMs: 6001,
  });

  assert.equal(result.apply, false);
  assert.equal(result.reason, 'lease-lost');
  assert.equal((await store.getEntity(key)).state, V4_LOCAL_STATES.DIRTY);
  assert.ok(await store.getMutation(key));
});

test('conflicto exige evidencia de una versión remota realmente posterior', async () => {
  const { store, sent, lease } = await setup();
  await assert.rejects(
    store.recordSyncConflict({
      sentMutation: sent,
      remoteEntity: {
        serverVersion: 3,
        serverStatus: 'active',
        payload: { note: 'no avanzada' },
      },
      contextId: 'tab-a',
      generation: lease.generation,
      nowMs: 2000,
    }),
    /versión remota posterior/
  );
  assert.ok(await store.getMutation(key));
});
