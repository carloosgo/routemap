import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLocalPersistenceAdapter,
  normalizeDraftRecord,
} from '../src/modules/storage-v4/localPersistenceContract.js';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import {
  V4_LOCAL_STATES,
  V4_MUTATION_OPERATIONS,
} from '../src/modules/storage-v4/storageV4Contract.js';

function entity(overrides = {}) {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    payload: { note: 'Borrador' },
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
    payload: { note: 'Borrador' },
    createdAtLocal: 1000,
    updatedAtLocal: 1000,
    attempts: 0,
    nextAttemptAt: null,
    ...overrides,
  };
}

test('borradores no publicados tienen namespace propio y copia durable independiente', () => {
  const payload = { name: '', segments: [{ id: 'segment-1' }] };
  const draft = normalizeDraftRecord({
    scopeId: 'guest-installation-1',
    draftId: 'draft-1',
    payload,
    lastModifiedLocal: 100,
  });
  payload.segments[0].id = 'mutated-after-normalize';
  assert.equal(draft.key, 'guest-installation-1/draft-1');
  assert.equal(draft.payload.segments[0].id, 'segment-1');
});

test('adaptador local de referencia persiste draft, entidad y mutación sin compartir referencias', async () => {
  const store = assertLocalPersistenceAdapter(createMemoryV4LocalPersistence());
  const draft = await store.putDraft({
    scopeId: 'user:alice',
    draftId: 'draft-1',
    payload: { name: 'Europa' },
    lastModifiedLocal: 100,
  });
  draft.payload.name = 'Mutación externa';
  assert.equal((await store.getDraft('user:alice/draft-1')).payload.name, 'Europa');

  const savedEntity = await store.putEntity(entity());
  savedEntity.payload.note = 'Mutación externa';
  assert.equal(
    (await store.getEntity('alice/trip-1/segment/segment-1')).payload.note,
    'Borrador'
  );

  const savedMutation = await store.putMutation(mutation());
  savedMutation.payload.note = 'Mutación externa';
  assert.equal(
    (await store.getMutation('alice/trip-1/segment/segment-1')).payload.note,
    'Borrador'
  );
});

test('solo existe una intención durable por entidad y la lista se ordena por creación', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putMutation(mutation({
    entityId: 'segment-1',
    localRevision: 1,
    payload: { note: 'vieja' },
    createdAtLocal: 300,
    updatedAtLocal: 300,
  }));
  await store.putMutation(mutation({
    entityId: 'segment-2',
    localRevision: 1,
    createdAtLocal: 100,
    updatedAtLocal: 100,
  }));
  await store.putMutation(mutation({
    entityId: 'segment-1',
    localRevision: 2,
    payload: { note: 'nueva' },
    createdAtLocal: 300,
    updatedAtLocal: 400,
  }));

  const pending = await store.listMutations({ userId: 'alice', tripId: 'trip-1' });
  assert.equal(pending.length, 2);
  assert.deepEqual(pending.map((item) => item.entityId), ['segment-2', 'segment-1']);
  assert.equal(pending[1].payload.note, 'nueva');
  assert.equal(pending[1].localRevision, 2);
});

test('ack usa compare-and-delete por revisión para no borrar una edición más nueva', async () => {
  const store = createMemoryV4LocalPersistence();
  const key = 'alice/trip-1/segment/segment-1';
  await store.putMutation(mutation({ localRevision: 4 }));
  assert.equal(await store.deleteMutationIfRevision(key, 3), false);
  assert.ok(await store.getMutation(key));
  assert.equal(await store.deleteMutationIfRevision(key, 4), true);
  assert.equal(await store.getMutation(key), null);
});

test('lease local evita dos líderes simultáneos y usa fencing al tomar control', async () => {
  const store = createMemoryV4LocalPersistence();
  const a = await store.tryAcquireSyncLease({ contextId: 'tab-a', nowMs: 1000, ttlMs: 5000 });
  assert.equal(a.generation, 1);
  assert.equal(
    await store.tryAcquireSyncLease({ contextId: 'tab-b', nowMs: 2000, ttlMs: 5000 }),
    null
  );
  const b = await store.tryAcquireSyncLease({ contextId: 'tab-b', nowMs: 6000, ttlMs: 5000 });
  assert.equal(b.generation, 2);
  assert.equal(
    await store.releaseSyncLeaseIfOwned({ contextId: 'tab-a', generation: 1, nowMs: 6001 }),
    false
  );
  assert.equal(
    await store.releaseSyncLeaseIfOwned({ contextId: 'tab-b', generation: 2, nowMs: 6001 }),
    true
  );
});

test('clearUserData no borra datos locales pertenecientes a otro usuario', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity(entity());
  await store.putEntity(entity({ userId: 'bob', entityId: 'segment-bob' }));
  await store.putMutation(mutation());
  await store.putMutation(mutation({
    userId: 'bob',
    entityId: 'segment-bob',
  }));

  await store.clearUserData('alice');
  assert.equal((await store.listEntities({ userId: 'alice' })).length, 0);
  assert.equal((await store.listMutations({ userId: 'alice' })).length, 0);
  assert.equal((await store.listEntities({ userId: 'bob' })).length, 1);
  assert.equal((await store.listMutations({ userId: 'bob' })).length, 1);
});
