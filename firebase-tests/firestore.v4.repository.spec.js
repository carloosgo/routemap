import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';
import { createFirestoreV4TripRepository } from '../src/infrastructure/firebase/firestoreV4TripRepository.js';
import { initialRankForPosition } from '../src/modules/storage-v4/rankModel.js';
import { createExpenses } from '../src/modules/expenses/expenseModel.js';

let testEnv;

function trip(id) {
  return {
    id,
    name: 'Repositorio v4',
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

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'atlasmap-v4-repository-test',
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

test('repositorio v4 persiste y lee entidades incrementalmente sin guardar el viaje completo', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const repository = createFirestoreV4TripRepository({ db, uid: 'alice' });
  const currentTrip = trip('trip-repository');

  assert.deepEqual(
    await repository.createTripRoot(currentTrip),
    { id: currentTrip.id, version: 1 }
  );

  const rank = initialRankForPosition(0);
  assert.deepEqual(
    await repository.createEntity(currentTrip.id, 'segment', segment('segment-1'), rank),
    { id: 'segment-1', version: 1 }
  );

  const entities = await repository.listEntities(currentTrip.id, 'segment');
  assert.equal(entities.length, 1);
  assert.equal(entities[0].id, 'segment-1');
  assert.equal(entities[0].version, 1);

  assert.deepEqual(
    await repository.updateEntity(
      currentTrip.id,
      'segment',
      segment('segment-1', 'Comprar billetes'),
      rank,
      1
    ),
    { id: 'segment-1', version: 2 }
  );

  const updated = await repository.getEntity(currentTrip.id, 'segment', 'segment-1');
  assert.equal(updated.note, 'Comprar billetes');
  assert.equal(updated.version, 2);
});

test('repositorio v4 detecta versión obsoleta mediante reglas y conserva el servidor', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const repository = createFirestoreV4TripRepository({ db, uid: 'alice' });
  const currentTrip = trip('trip-conflict');
  const rank = initialRankForPosition(0);

  await repository.createTripRoot(currentTrip);
  await repository.createEntity(currentTrip.id, 'segment', segment('segment-1'), rank);
  await repository.updateEntity(
    currentTrip.id,
    'segment',
    segment('segment-1', 'Servidor versión 2'),
    rank,
    1
  );

  await assert.rejects(() => repository.updateEntity(
    currentTrip.id,
    'segment',
    segment('segment-1', 'Cliente stale'),
    rank,
    1
  ));

  const server = await repository.getEntity(currentTrip.id, 'segment', 'segment-1');
  assert.equal(server.note, 'Servidor versión 2');
  assert.equal(server.version, 2);
});

test('tombstone se excluye de consultas activas y restore conserva la secuencia de versión', async () => {
  const db = testEnv.authenticatedContext('alice').firestore();
  const repository = createFirestoreV4TripRepository({ db, uid: 'alice' });
  const currentTrip = trip('trip-tombstone');
  const rank = initialRankForPosition(0);

  await repository.createTripRoot(currentTrip);
  await repository.createEntity(currentTrip.id, 'segment', segment('segment-1'), rank);
  await repository.softDeleteEntity(currentTrip.id, 'segment', 'segment-1', 1);

  assert.equal((await repository.listEntities(currentTrip.id, 'segment')).length, 0);
  const deleted = await repository.listEntities(
    currentTrip.id,
    'segment',
    { includeDeleted: true }
  );
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].status, 'deleted');
  assert.equal(deleted[0].version, 2);

  await repository.restoreEntity(currentTrip.id, 'segment', 'segment-1', 2);
  const restored = await repository.getEntity(currentTrip.id, 'segment', 'segment-1');
  assert.equal(restored.status, 'active');
  assert.equal(restored.version, 3);
});

test('selector productivo continúa apuntando a v3', async () => {
  const source = await readFile('src/modules/trips/tripRepositorySelector.js', 'utf8');
  assert.match(source, /createFirestoreTripRepository/);
  assert.doesNotMatch(source, /createFirestoreV4TripRepository/);
});
