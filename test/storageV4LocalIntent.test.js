import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import {
  V4_LOCAL_STATES,
  V4_MUTATION_OPERATIONS,
} from '../src/modules/storage-v4/storageV4Contract.js';

const key = 'alice/trip-1/segment/segment-1';

function intent(overrides = {}) {
  return {
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    serverVersion: 0,
    serverStatus: 'missing',
    desiredStatus: 'active',
    payload: { note: 'uno', rank: '0000001000' },
    ...overrides,
  };
}

test('crear entidad local escribe entidad y CREATE con la misma revisión', async () => {
  const store = createMemoryV4LocalPersistence();
  const result = await store.commitLocalIntent({
    intent: intent(),
    nowMs: 100,
  });

  assert.equal(result.discarded, false);
  assert.equal(result.entity.localRevision, 1);
  assert.equal(result.entity.state, V4_LOCAL_STATES.DIRTY);
  assert.equal(result.mutation.operation, V4_MUTATION_OPERATIONS.CREATE);
  assert.equal(result.mutation.localRevision, 1);
  assert.equal(result.mutation.baseVersion, 0);
  assert.equal((await store.getEntity(key)).localRevision, 1);
  assert.equal((await store.getMutation(key)).localRevision, 1);
});

test('ediciones consecutivas incrementan revisión y coalescen una sola intención durable', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.commitLocalIntent({ intent: intent(), nowMs: 100 });
  const second = await store.commitLocalIntent({
    intent: intent({ payload: { note: 'dos', rank: '0000001000' } }),
    nowMs: 200,
  });

  assert.equal(second.entity.localRevision, 2);
  assert.equal(second.mutation.localRevision, 2);
  assert.equal(second.mutation.operation, V4_MUTATION_OPERATIONS.CREATE);
  assert.equal(second.mutation.createdAtLocal, 100);
  assert.deepEqual(second.mutation.payload, { note: 'dos', rank: '0000001000' });
  assert.equal((await store.listMutations({ userId: 'alice' })).length, 1);
});

test('crear y borrar antes del primer sync descarta entidad y mutación juntas', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.commitLocalIntent({ intent: intent(), nowMs: 100 });
  const deleted = await store.commitLocalIntent({
    intent: intent({ desiredStatus: 'deleted', payload: null }),
    nowMs: 200,
  });

  assert.equal(deleted.discarded, true);
  assert.equal(await store.getEntity(key), null);
  assert.equal(await store.getMutation(key), null);
});

test('borrar entidad remota conserva payload local recuperable pero cola solo expresa DELETE', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity({
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    payload: { note: 'recuperable', rank: '0000001000' },
    serverVersion: 3,
    serverStatus: 'active',
    desiredStatus: 'active',
    localRevision: 0,
    state: V4_LOCAL_STATES.CLEAN,
    conflict: null,
    lastModifiedLocal: 50,
  });

  const result = await store.commitLocalIntent({
    intent: intent({
      serverVersion: 999,
      serverStatus: 'deleted',
      desiredStatus: 'deleted',
      payload: null,
    }),
    nowMs: 100,
  });

  assert.deepEqual(result.entity.payload, {
    note: 'recuperable',
    rank: '0000001000',
  });
  assert.equal(result.entity.serverVersion, 3);
  assert.equal(result.mutation.operation, V4_MUTATION_OPERATIONS.DELETE);
  assert.equal(result.mutation.baseVersion, 3);
  assert.equal(result.mutation.payload, null);
});

test('una entidad en conflicto no admite edición implícita ni altera estado durable', async () => {
  const store = createMemoryV4LocalPersistence();
  await store.putEntity({
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    payload: { note: 'local', rank: '0000001000' },
    serverVersion: 5,
    serverStatus: 'active',
    desiredStatus: 'active',
    localRevision: 4,
    state: V4_LOCAL_STATES.CONFLICT,
    conflict: {
      serverVersion: 5,
      serverStatus: 'active',
      payload: { note: 'remoto', rank: '0000001000' },
      detectedAtLocal: 90,
    },
    lastModifiedLocal: 80,
  });

  await assert.rejects(
    store.commitLocalIntent({
      intent: intent({
        serverVersion: 5,
        serverStatus: 'active',
        payload: { note: 'tercera versión', rank: '0000001000' },
      }),
      nowMs: 100,
    }),
    /resolución explícita/
  );
  const saved = await store.getEntity(key);
  assert.equal(saved.state, V4_LOCAL_STATES.CONFLICT);
  assert.deepEqual(saved.payload, { note: 'local', rank: '0000001000' });
  assert.equal(await store.getMutation(key), null);
});

test('dos commits concurrentes de la misma entidad reciben revisiones distintas y ordenadas', async () => {
  const store = createMemoryV4LocalPersistence();
  const [first, second] = await Promise.all([
    store.commitLocalIntent({
      intent: intent({ payload: { note: 'a', rank: '0000001000' } }),
      nowMs: 100,
    }),
    store.commitLocalIntent({
      intent: intent({ payload: { note: 'b', rank: '0000001000' } }),
      nowMs: 101,
    }),
  ]);

  assert.deepEqual(
    [first.entity.localRevision, second.entity.localRevision],
    [1, 2]
  );
  const saved = await store.getEntity(key);
  const pending = await store.getMutation(key);
  assert.equal(saved.localRevision, 2);
  assert.equal(pending.localRevision, 2);
  assert.deepEqual(saved.payload, { note: 'b', rank: '0000001000' });
});
