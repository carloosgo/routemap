import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STORAGE_V4_VERSION,
  V4_ENTITY_STATUS,
  V4_MUTATION_OPERATIONS,
} from '../src/modules/storage-v4/storageV4Contract.js';
import {
  isStaleBaseVersion,
  isValidVersionAdvance,
  nextEntityVersion,
} from '../src/modules/storage-v4/entityVersionModel.js';
import { aggregateDeltaForEntityTransition } from '../src/modules/storage-v4/aggregateTransitionModel.js';
import { syncRetryDelayMs } from '../src/modules/storage-v4/syncRetryModel.js';
import {
  coalesceMutationQueue,
  mutationEntityKey,
} from '../src/modules/storage-v4/mutationQueueModel.js';

const root = new URL('../', import.meta.url);
const active = (value) => ({ status: V4_ENTITY_STATUS.ACTIVE, value });
const deleted = (value) => ({ status: V4_ENTITY_STATUS.DELETED, value });
const valueOf = (entity) => entity.value;

function mutation(overrides = {}) {
  return {
    mutationId: overrides.mutationId || 'mutation-1',
    userId: 'user-1',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
    operation: V4_MUTATION_OPERATIONS.UPDATE,
    baseVersion: 7,
    payload: { note: 'a' },
    createdAtLocal: 100,
    attempts: 3,
    nextAttemptAt: 999,
    ...overrides,
  };
}

test('v4 parte de un contrato versionado explícito', () => {
  assert.equal(STORAGE_V4_VERSION, 4);
  assert.equal(nextEntityVersion(0), 1);
  assert.equal(nextEntityVersion(17), 18);
  assert.equal(isValidVersionAdvance(17, 18), true);
  assert.equal(isValidVersionAdvance(17, 17), false);
  assert.equal(isValidVersionAdvance(17, 19), false);
  assert.equal(isStaleBaseVersion(17, 18), true);
  assert.equal(isStaleBaseVersion(18, 18), false);
  assert.throws(() => nextEntityVersion(-1), TypeError);
});

test('transiciones de agregados implementan soft delete sin doble descuento', () => {
  assert.deepEqual(
    aggregateDeltaForEntityTransition({ after: active(40), valueOf }),
    { countDelta: 1, valueDelta: 40 }
  );
  assert.deepEqual(
    aggregateDeltaForEntityTransition({ before: active(40), after: active(55), valueOf }),
    { countDelta: 0, valueDelta: 15 }
  );
  assert.deepEqual(
    aggregateDeltaForEntityTransition({ before: active(55), after: deleted(55), valueOf }),
    { countDelta: -1, valueDelta: -55 }
  );
  assert.deepEqual(
    aggregateDeltaForEntityTransition({ before: deleted(55), after: active(60), valueOf }),
    { countDelta: 1, valueDelta: 60 }
  );
  assert.deepEqual(
    aggregateDeltaForEntityTransition({ before: deleted(55), after: null, valueOf }),
    { countDelta: 0, valueDelta: 0 }
  );
});

test('una purga física de entidad activa viola el contrato v4', () => {
  assert.throws(
    () => aggregateDeltaForEntityTransition({ before: active(10), after: null, valueOf }),
    /no puede purgarse/
  );
});

test('backoff es exponencial, acotado y admite jitter determinista', () => {
  assert.equal(syncRetryDelayMs(0, { randomUnit: 0.5 }), 1000);
  assert.equal(syncRetryDelayMs(1, { randomUnit: 0.5 }), 2000);
  assert.equal(syncRetryDelayMs(10, { randomUnit: 0.5 }), 30000);
  assert.equal(syncRetryDelayMs(0, { randomUnit: 0 }), 800);
  assert.equal(syncRetryDelayMs(0, { randomUnit: 1 }), 1200);
});

test('la cola coalesce solo secuencias demostrablemente seguras', () => {
  const queue = coalesceMutationQueue([
    mutation({ mutationId: 'a1', payload: { note: 'uno' } }),
    mutation({
      mutationId: 'b1',
      entityId: 'segment-2',
      payload: { note: 'otro' },
    }),
    mutation({
      mutationId: 'a2',
      payload: { note: 'dos' },
      createdAtLocal: 200,
      attempts: 5,
    }),
  ]);

  assert.equal(queue.length, 2);
  assert.equal(queue[0].mutationId, 'a2');
  assert.equal(queue[0].baseVersion, 7);
  assert.equal(queue[0].createdAtLocal, 100);
  assert.equal(queue[0].attempts, 0);
  assert.equal(queue[0].nextAttemptAt, null);
  assert.deepEqual(queue[0].payload, { note: 'dos' });
});

test('crear seguido de update conserva create, pero delete/restore no se fusionan aún', () => {
  const createThenUpdate = coalesceMutationQueue([
    mutation({ operation: V4_MUTATION_OPERATIONS.CREATE, baseVersion: 0 }),
    mutation({ payload: { note: 'final' } }),
  ]);
  assert.equal(createThenUpdate.length, 1);
  assert.equal(createThenUpdate[0].operation, V4_MUTATION_OPERATIONS.CREATE);
  assert.equal(createThenUpdate[0].baseVersion, 0);

  const deleteThenRestore = coalesceMutationQueue([
    mutation({ operation: V4_MUTATION_OPERATIONS.DELETE }),
    mutation({ operation: V4_MUTATION_OPERATIONS.RESTORE }),
  ]);
  assert.equal(deleteThenRestore.length, 2);
});

test('mutaciones inválidas se rechazan antes de llegar al coordinador', () => {
  assert.equal(
    mutationEntityKey(mutation()),
    'user-1/trip-1/segment/segment-1'
  );
  assert.throws(
    () => mutationEntityKey(mutation({ entityType: 'unknown' })),
    /entityType/
  );
  assert.throws(
    () => mutationEntityKey(mutation({ operation: 'overwrite' })),
    /operation/
  );
});

test('Gate A no activa v4 accidentalmente en el selector productivo', async () => {
  const selector = await readFile(
    new URL('src/modules/trips/tripRepositorySelector.js', root),
    'utf8'
  );
  assert.match(selector, /createFirestoreTripRepository/);
  assert.doesNotMatch(selector, /storage-v4|StorageV4|createFirestoreV4/i);
});
