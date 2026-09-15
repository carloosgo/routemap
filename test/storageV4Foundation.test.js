import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  acquireOrRenewLease,
  leaseStillOwned,
} from '../src/modules/storage-v4/crossContextLeaseModel.js';
import { aggregateDeltaForEntityTransition } from '../src/modules/storage-v4/aggregateTransitionModel.js';
import { syncRetryDelayMs } from '../src/modules/storage-v4/syncRetryModel.js';
import { v4EntityKey } from '../src/modules/storage-v4/entityKeyModel.js';
import {
  STORAGE_V4_VERSION,
  V4_ENTITY_STATUS,
} from '../src/modules/storage-v4/storageV4Contract.js';

const root = new URL('../', import.meta.url);
const valued = (status, value) => ({ status, value });
const valueOf = (entity) => entity.value;

test('v4 parte de un contrato versionado explícito', () => {
  assert.equal(STORAGE_V4_VERSION, 4);
});

test('la clave local de entidad es estable y no admite componentes ambiguos', () => {
  assert.equal(v4EntityKey({
    userId: 'alice',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
  }), 'alice/trip-1/segment/segment-1');
  assert.throws(() => v4EntityKey({
    userId: 'alice/other',
    tripId: 'trip-1',
    entityType: 'segment',
    entityId: 'segment-1',
  }));
});

test('transiciones de agregados implementan soft delete sin doble descuento', () => {
  assert.deepEqual(aggregateDeltaForEntityTransition({
    before: null,
    after: valued(V4_ENTITY_STATUS.ACTIVE, 25),
    valueOf,
  }), { countDelta: 1, valueDelta: 25 });
  assert.deepEqual(aggregateDeltaForEntityTransition({
    before: valued(V4_ENTITY_STATUS.ACTIVE, 25),
    after: valued(V4_ENTITY_STATUS.ACTIVE, 30),
    valueOf,
  }), { countDelta: 0, valueDelta: 5 });
  assert.deepEqual(aggregateDeltaForEntityTransition({
    before: valued(V4_ENTITY_STATUS.ACTIVE, 30),
    after: valued(V4_ENTITY_STATUS.DELETED, 30),
    valueOf,
  }), { countDelta: -1, valueDelta: -30 });
  assert.deepEqual(aggregateDeltaForEntityTransition({
    before: valued(V4_ENTITY_STATUS.DELETED, 30),
    after: valued(V4_ENTITY_STATUS.ACTIVE, 35),
    valueOf,
  }), { countDelta: 1, valueDelta: 35 });
  assert.deepEqual(aggregateDeltaForEntityTransition({
    before: valued(V4_ENTITY_STATUS.DELETED, 35),
    after: valued(V4_ENTITY_STATUS.DELETED, 35),
    valueOf,
  }), { countDelta: 0, valueDelta: 0 });
  assert.deepEqual(aggregateDeltaForEntityTransition({
    before: valued(V4_ENTITY_STATUS.DELETED, 35),
    after: null,
    valueOf,
  }), { countDelta: 0, valueDelta: 0 });
});

test('una purga física de entidad activa viola el contrato v4', () => {
  assert.throws(() => aggregateDeltaForEntityTransition({
    before: valued(V4_ENTITY_STATUS.ACTIVE, 20),
    after: null,
    valueOf,
  }));
});

test('backoff es exponencial, acotado y admite jitter determinista', () => {
  const noJitter = Array.from({ length: 7 }, (_, attempts) => syncRetryDelayMs(attempts, {
    randomUnit: 0.5,
  }));
  assert.deepEqual(noJitter, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  assert.equal(syncRetryDelayMs(0, { randomUnit: 0 }), 800);
  assert.equal(syncRetryDelayMs(0, { randomUnit: 1 }), 1200);
});

test('el lease multi-tab usa fencing generation y permite takeover solo al expirar', () => {
  const tabA = acquireOrRenewLease({
    currentLease: null,
    contextId: 'tab-a',
    nowMs: 1000,
    ttlMs: 8000,
  });
  assert.equal(tabA.generation, 1);
  assert.equal(acquireOrRenewLease({
    currentLease: tabA,
    contextId: 'tab-b',
    nowMs: 5000,
    ttlMs: 8000,
  }), null);
  const tabB = acquireOrRenewLease({
    currentLease: tabA,
    contextId: 'tab-b',
    nowMs: 10001,
    ttlMs: 8000,
  });
  assert.equal(tabB.generation, 2);
  assert.equal(leaseStillOwned(tabA, {
    contextId: 'tab-a',
    generation: 1,
    nowMs: 13001,
  }), false);
  assert.equal(leaseStillOwned(tabB, {
    contextId: 'tab-b',
    generation: 2,
    nowMs: 13001,
  }), true);
});

test('usuarios autenticados seleccionan directamente el repositorio v4 canónico', async () => {
  const selector = await readFile(
    new URL('src/modules/trips/tripRepositorySelector.js', root),
    'utf8'
  );

  assert.match(selector, /createFirestoreV4AppTripRepository/);
  assert.match(selector, /if \(!uid\) return localRepository/);
  assert.match(selector, /createFirestoreV4AppTripRepository\(\{ db, uid \}\)/);
  assert.doesNotMatch(selector, /createGateGTripRepository|storageV4Rollout|firestoreHybridTripRepository/);
});
