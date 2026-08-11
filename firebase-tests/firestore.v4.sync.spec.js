import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';
import { createFirestoreV4TripRepository } from '../src/infrastructure/firebase/firestoreV4TripRepository.js';
import { createFirestoreV4SyncGateway } from '../src/infrastructure/firebase/firestoreV4SyncGateway.js';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createV4SyncCoordinator } from '../src/modules/storage-v4/syncCoordinator.js';
import {
  V4_LOCAL_STATES,
  V4_MUTATION_OPERATIONS,
} from '../src/modules/storage-v4/storageV4Contract.js';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';

let testEnv;

function trip(id) {
  return {
    id,
    name: 'Sync v4',
    currency: 'EUR',
    segments: [],
    places: [],
    routeConnections: [],
    notes: [],
    checklist: [],
  };
}

function segment(id, note = '') {
  return {
    id,
    origin: {
      id: '',
      name: 'Madrid',
      displayName: 'Madrid',
      country: 'España',
      countryCode: 'ES',
      lat: 40.4168,
      lon: -3.7038,
    },
    destination: {
      id: '',
      name: 'Barcelona',
      displayName: 'Barcelona',
      country: 'España',
      countryCode: 'ES',
      lat: 41.3874,
      lon: 2.1686,
    },
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    expenses: createExpenses(),
    note,
  };
}

async function seedLocalUpdate(store, tripId, rank, note) {
  const payload = { ...segment('segment-1', note), rank };
  await store.putEntity({
    userId: 'alice',
    tripId,
    entityType: 'segment',
    entityId: 'segment-1',
    payload,
    serverVersion: 1,
    serverStatus: 'active',
    desiredStatus: 'active',
    localRevision: 2,
    state: V4_LOCAL_STATES.DIRTY,
    lastModifiedLocal: 1000,
  });
  await store.putMutation({
    userId: 'alice',
    tripId,
    entityType: 'segment',
    entityId: 'segment-1',
    operation: V4_MUTATION_OPERATIONS.UPDATE,
    baseVersion: 1,
    baseStatus: 'active',
    desiredStatus: 'active',
    localRevision: 2,
    payload,
    createdAtLocal: 1000,
    updatedAtLocal: 1000,
    attempts: 0,
    nextAttemptAt: null,
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-v4-sync-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile('firestore-v4.rules', 'utf8'),
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test('coordinator + gateway + repository sincronizan una entidad real bajo rules v4', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const repository = createFirestoreV4TripRepository({ db, uid: 'alice' });
  const tripId = 'trip-sync-success';
  const rank = initialRankForPosition(0);
  await repository.createTripRoot(trip(tripId));
  await repository.createEntity(tripId, 'segment', segment('segment-1', 'v1'), rank);

  const local = createMemoryV4LocalPersistence();
  await seedLocalUpdate(local, tripId, rank, 'local v2');
  const coordinator = createV4SyncCoordinator({
    localPersistence: local,
    remoteGateway: createFirestoreV4SyncGateway({ repository }),
    contextId: 'tab-a',
    now: () => 2000,
  });

  const summary = await coordinator.flush({ userId: 'alice', tripId });
  assert.equal(summary.synced, 1);
  const remote = await repository.getEntity(tripId, 'segment', 'segment-1');
  assert.equal(remote.version, 2);
  assert.equal(remote.note, 'local v2');
  const localEntity = await local.getEntity(`alice/${tripId}/segment/segment-1`);
  assert.equal(localEntity.serverVersion, 2);
  assert.equal(localEntity.state, V4_LOCAL_STATES.CLEAN);
  assert.equal(await local.getMutation(`alice/${tripId}/segment/segment-1`), null);
});

test('versión stale real termina en conflict durable y preserva local + servidor', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const repository = createFirestoreV4TripRepository({ db, uid: 'alice' });
  const tripId = 'trip-sync-conflict';
  const rank = initialRankForPosition(0);
  await repository.createTripRoot(trip(tripId));
  await repository.createEntity(tripId, 'segment', segment('segment-1', 'v1'), rank);

  const local = createMemoryV4LocalPersistence();
  await seedLocalUpdate(local, tripId, rank, 'local pendiente');
  await repository.updateEntity(
    tripId,
    'segment',
    segment('segment-1', 'servidor v2'),
    rank,
    1
  );

  const coordinator = createV4SyncCoordinator({
    localPersistence: local,
    remoteGateway: createFirestoreV4SyncGateway({ repository }),
    contextId: 'tab-a',
    now: () => 2500,
  });

  const summary = await coordinator.flush({ userId: 'alice', tripId });
  assert.equal(summary.conflicts, 1);
  const localEntity = await local.getEntity(`alice/${tripId}/segment/segment-1`);
  assert.equal(localEntity.state, V4_LOCAL_STATES.CONFLICT);
  assert.equal(localEntity.serverVersion, 2);
  assert.equal(localEntity.payload.note, 'local pendiente');
  assert.equal(localEntity.conflict.serverVersion, 2);
  assert.equal(localEntity.conflict.payload.note, 'servidor v2');
  assert.equal(await local.getMutation(`alice/${tripId}/segment/segment-1`), null);

  const remote = await repository.getEntity(tripId, 'segment', 'segment-1');
  assert.equal(remote.version, 2);
  assert.equal(remote.note, 'servidor v2');
});
