import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  acquireOrRenewLease,
  leaseStillOwned,
} from '../src/modules/storage-v4/crossContextLeaseModel.js';
import {
  aggregateTransition,
  V4_ENTITY_STATUS,
} from '../src/modules/storage-v4/aggregateTransitionModel.js';
import { syncRetryDelayMs } from '../src/modules/storage-v4/syncRetryModel.js';
import { v4EntityKey } from '../src/modules/storage-v4/entityKeyModel.js';
import { STORAGE_V4_SCHEMA_VERSION } from '../src/modules/storage-v4/storageV4Contract.js';

const root = new URL('../', import.meta.url);

test('v4 parte de un contrato versionado explícito', () => {
  assert.equal(STORAGE_V4_SCHEMA_VERSION, 4);
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
  assert.deepEqual(aggregateTransition({
    beforeStatus: null,
    afterStatus: V4_ENTITY_STATUS.ACTIVE,
    beforeValue: 0,
    afterValue: 25,
  }), { countDelta: 1, valueDelta: 25 });
  assert.deepEqual(aggregateTransition({
    beforeStatus: V4_ENTITY_STATUS.ACTIVE,
    afterStatus: V4_ENTITY_STATUS.ACTIVE,
    beforeValue: 25,
    afterValue: 30,
  }), { countDelta: 0, valueDelta: 5 });
  assert.deepEqual(aggregateTransition({
    beforeStatus: V4_ENTITY_STATUS.ACTIVE,
    afterStatus: V4_ENTITY_STATUS.DELETED,
    beforeValue: 30,
    afterValue: 30,
  }), { countDelta: -1, valueDelta: -30 });
  assert.deepEqual(aggregateTransition({
    beforeStatus: V4_ENTITY_STATUS.DELETED,
    afterStatus: V4_ENTITY_STATUS.ACTIVE,
    beforeValue: 30,
    afterValue: 35,
  }), { countDelta: 1, valueDelta: 35 });
  assert.deepEqual(aggregateTransition({
    beforeStatus: V4_ENTITY_STATUS.DELETED,
    afterStatus: V4_ENTITY_STATUS.DELETED,
    beforeValue: 35,
    afterValue: 35,
  }), { countDelta: 0, valueDelta: 0 });
  assert.deepEqual(aggregateTransition({
    beforeStatus: V4_ENTITY_STATUS.DELETED,
    afterStatus: null,
    beforeValue: 35,
    afterValue: 0,
  }), { countDelta: 0, valueDelta: 0 });
});

test('una purga física de entidad activa viola el contrato v4', () => {
  assert.throws(() => aggregateTransition({
    beforeStatus: V4_ENTITY_STATUS.ACTIVE,
    afterStatus: null,
    beforeValue: 20,
    afterValue: 0,
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

test('Gate G conecta selección READ sin activar accidentalmente el runtime de escritura v4', async () => {
  const selector = await readFile(
    new URL('src/modules/trips/tripRepositorySelector.js', root),
    'utf8'
  );
  const config = await readFile(new URL('src/config.js', root), 'utf8');

  assert.match(selector, /createGateGTripRepository/);
  assert.match(selector, /config\.storageV4Rollout/);
  assert.doesNotMatch(selector, /createV4WebSyncComposition|createFirestoreV4SyncGateway|createFirestoreV4TripRepository/);
  assert.match(config, /VITE_STORAGE_V4_ENABLED, false/);
  assert.match(config, /VITE_STORAGE_V4_KILL_SWITCH, true/);
  assert.match(config, /VITE_STORAGE_V4_READ_RULES_READY, false/);
});
