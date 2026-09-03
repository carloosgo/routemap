import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';
import { createFirestoreV4TripRepository } from '../src/infrastructure/firebase/firestoreV4TripRepository.js';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';

let testEnv;

before(async () => {
  const rules = await readFile('firestore.rules', 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-v4-repository-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv?.cleanup();
});

function trip() {
  return {
    id: 'trip-v4-repository',
    name: 'Europa',
    currency: 'EUR',
    origin: null,
    segments: [],
    places: [],
    routeConnections: [],
    notes: [],
    checklist: [],
  };
}

function segment(id = 'segment-1') {
  return {
    id,
    destination: null,
    startDate: '',
    endDate: '',
    expenses: createExpenses(),
    note: '',
  };
}

test('repositorio v4 crea root pequeño con timestamps y agregados iniciales', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const repository = createFirestoreV4TripRepository({ db, uid: 'alice' });
  const currentTrip = trip();

  const created = await repository.createTripRoot(currentTrip);
  assert.equal(created.id, currentTrip.id);
  assert.equal(created.version, 1);

  const root = await getDoc(doc(db, 'users', 'alice', 'trips', currentTrip.id));
  assert.equal(root.exists(), true);
  const data = root.data();
  assert.equal(data.schemaVersion, 4);
  assert.equal(data.status, 'active');
  assert.equal(data.version, 1);
  assert.equal(data.segmentCount, 0);
  assert.equal(data.placeCount, 0);
  assert.equal(data.total, 0);
  assert.ok(data.createdAt);
  assert.ok(data.updatedAt);
  assert.equal('segments' in data, false);
  assert.equal('places' in data, false);
});

test('repositorio v4 persiste entidad versionada, update, tombstone y restore', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const repository = createFirestoreV4TripRepository({ db, uid: 'alice' });
  const currentTrip = trip();
  await repository.createTripRoot(currentTrip);

  await repository.createEntity(
    currentTrip.id,
    'segment',
    segment(),
    initialRankForPosition(0)
  );
  let current = await repository.getEntity(currentTrip.id, 'segment', 'segment-1');
  assert.equal(current.version, 1);
  assert.equal(current.status, 'active');
  assert.equal('origin' in current, false);

  await repository.updateEntity(
    currentTrip.id,
    'segment',
    { ...segment(), note: 'actualizado' },
    initialRankForPosition(0),
    1
  );
  current = await repository.getEntity(currentTrip.id, 'segment', 'segment-1');
  assert.equal(current.note, 'actualizado');
  assert.equal(current.version, 2);

  await repository.softDeleteEntity(currentTrip.id, 'segment', 'segment-1', 2);
  const active = await repository.listEntities(currentTrip.id, 'segment');
  assert.equal(active.length, 0);
  const deleted = await repository.listEntities(
    currentTrip.id,
    'segment',
    { includeDeleted: true }
  );
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].status, 'deleted');
  assert.equal(deleted[0].version, 3);

  await repository.restoreEntity(currentTrip.id, 'segment', 'segment-1', 3);
  const restored = await repository.getEntity(currentTrip.id, 'segment', 'segment-1');
  assert.equal(restored.status, 'active');
  assert.equal(restored.version, 4);
});

test('selector autenticado entra directo al repositorio de aplicación v4', async () => {
  const selector = await readFile('src/modules/trips/tripRepositorySelector.js', 'utf8');
  const config = await readFile('src/config.js', 'utf8');
  assert.match(selector, /createFirestoreV4AppTripRepository/);
  assert.doesNotMatch(selector, /GateG|Hybrid|Rollout|storageV4Rollout/);
  assert.doesNotMatch(config, /storageV4Rollout|VITE_STORAGE_V4_ENABLED|VITE_STORAGE_V4_KILL_SWITCH/);
});
