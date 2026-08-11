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
    localRevision: 4,
    state: V4_LOCAL_STATES.DIRTY,
    lastModifiedLocal: 1000,
    ...overrides,
  };
}

function mutation(overrides = {}) {
  return {
    mutationId: 'mutation-1',
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    operation: V4_MUTATION_OPERATIONS.UPDATE,
    baseVersion: 3,
    payload: { note: 'Borrador' },
    createdAtLocal: 1000,
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
  assert.equal((await store.getMutation('mutation-1')).payload.note, 'Borrador');
});

test('la cola local se ordena por creación y se puede filtrar por viaje', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putMutation(mutation({ mutationId: 'later', createdAtLocal: 300 }));
  await store.putMutation(mutation({
    mutationId: 'other-trip',
    tripId: 'trip-2',
    entityId: 'segment-2',
    createdAtLocal: 50,
  }));
  await store.putMutation(mutation({ mutationId: 'earlier', createdAtLocal: 100 }));

  assert.deepEqual(
    (await store.listMutations({ userId: 'alice', tripId: 'trip-1' }))
      .map((item) => item.mutationId),
    ['earlier', 'later']
  );
});

test('ack de mutación usa compare-and-delete para no borrar trabajo reemplazado', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putMutation(mutation());
  assert.equal(
    await store.deleteMutationIfMatch(
      'mutation-1',
      'alice/trip-1/segment/segment-1',
      999
    ),
    false
  );
  assert.ok(await store.getMutation('mutation-1'));
  assert.equal(
    await store.deleteMutationIfMatch(
      'mutation-1',
      'alice/trip-1/segment/segment-1',
      1000
    ),
    true
  );
  assert.equal(await store.getMutation('mutation-1'), null);
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
    mutationId: 'mutation-bob',
    userId: 'bob',
    entityId: 'segment-bob',
  }));

  await store.clearUserData('alice');
  assert.equal((await store.listEntities({ userId: 'alice' })).length, 0);
  assert.equal((await store.listMutations({ userId: 'alice' })).length, 0);
  assert.equal((await store.listEntities({ userId: 'bob' })).length, 1);
  assert.equal((await store.listMutations({ userId: 'bob' })).length, 1);
});
