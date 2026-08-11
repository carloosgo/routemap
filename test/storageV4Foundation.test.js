import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STORAGE_V4_VERSION,
  V4_ENTITY_STATUS,
} from '../src/modules/storage-v4/storageV4Contract.js';
import { v4EntityKey } from '../src/modules/storage-v4/entityKeyModel.js';
import {
  isStaleBaseVersion,
  isValidVersionAdvance,
  nextEntityVersion,
} from '../src/modules/storage-v4/entityVersionModel.js';
import { aggregateDeltaForEntityTransition } from '../src/modules/storage-v4/aggregateTransitionModel.js';
import { syncRetryDelayMs } from '../src/modules/storage-v4/syncRetryModel.js';
import {
  acquireOrRenewLease,
  leaseIsExpired,
  leaseStillOwned,
} from '../src/modules/storage-v4/crossContextLeaseModel.js';

const root = new URL('../', import.meta.url);
const active = (value) => ({ status: V4_ENTITY_STATUS.ACTIVE, value });
const deleted = (value) => ({ status: V4_ENTITY_STATUS.DELETED, value });
const valueOf = (entity) => entity.value;

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

test('la clave local de entidad es estable y no admite componentes ambiguos', () => {
  assert.equal(
    v4EntityKey({
      userId: 'user-1',
      tripId: 'trip-1',
      entityType: 'segment',
      entityId: 'segment-1',
    }),
    'user-1/trip-1/segment/segment-1'
  );
  assert.throws(
    () => v4EntityKey({
      userId: 'user/escape',
      tripId: 'trip-1',
      entityType: 'segment',
      entityId: 'segment-1',
    }),
    /no puede contener/
  );
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

test('el lease multi-tab usa fencing generation y permite takeover solo al expirar', () => {
  const tabA = acquireOrRenewLease({ contextId: 'tab-a', nowMs: 1000, ttlMs: 8000 });
  assert.equal(tabA.generation, 1);
  assert.equal(leaseIsExpired(tabA, 8999), false);
  assert.equal(
    acquireOrRenewLease({ currentLease: tabA, contextId: 'tab-b', nowMs: 5000 }),
    null
  );

  const renewedA = acquireOrRenewLease({
    currentLease: tabA,
    contextId: 'tab-a',
    nowMs: 5000,
    ttlMs: 8000,
  });
  assert.equal(renewedA.generation, 1);
  assert.equal(renewedA.acquiredAt, 1000);
  assert.equal(leaseStillOwned(renewedA, {
    contextId: 'tab-a',
    generation: 1,
    nowMs: 6000,
  }), true);

  const tabB = acquireOrRenewLease({
    currentLease: renewedA,
    contextId: 'tab-b',
    nowMs: 13000,
    ttlMs: 8000,
  });
  assert.equal(tabB.generation, 2);
  assert.equal(leaseStillOwned(tabB, {
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

test('Gate A no activa v4 accidentalmente en el selector productivo', async () => {
  const selector = await readFile(
    new URL('src/modules/trips/tripRepositorySelector.js', root),
    'utf8'
  );
  assert.match(selector, /createFirestoreTripRepository/);
  assert.doesNotMatch(selector, /storage-v4|StorageV4|createFirestoreV4/i);
});
