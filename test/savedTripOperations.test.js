import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countLocalTrips,
  importLocalTripsIntoRepository,
  listSavedTrips,
  openSavedTrip,
  persistSavedTrip,
  removeSavedTrip,
  savedTripErrorMessage,
  savedTripErrorTranslationKey,
} from '../src/modules/trips/savedTripOperations.js';

function repositoryFixture() {
  const calls = [];
  return {
    calls,
    repository: {
      async list() {
        calls.push(['list']);
        return [{ id: 'trip-1' }];
      },
      async get(id) {
        calls.push(['get', id]);
        return { id };
      },
      async save(trip) {
        calls.push(['save', trip.id]);
        return trip;
      },
      async remove(id) {
        calls.push(['remove', id]);
      },
    },
  };
}

test('las operaciones delegan en el contrato del repositorio', async () => {
  const { repository, calls } = repositoryFixture();

  assert.deepEqual(await listSavedTrips(repository), [{ id: 'trip-1' }]);
  assert.deepEqual(await openSavedTrip(repository, 'trip-2'), { id: 'trip-2' });
  assert.deepEqual(await persistSavedTrip(repository, { id: 'trip-3' }), { id: 'trip-3' });
  await removeSavedTrip(repository, 'trip-4');

  assert.deepEqual(calls, [
    ['list'],
    ['get', 'trip-2'],
    ['save', 'trip-3'],
    ['remove', 'trip-4'],
  ]);
});

test('importar exige sesión antes de leer o escribir viajes', async () => {
  let read = false;
  let written = false;

  await assert.rejects(
    importLocalTripsIntoRepository({
      uid: '',
      localRepository: { async list() { read = true; return []; } },
      targetRepository: { async save() { written = true; } },
    }),
    /Inicia sesión antes de importar viajes/
  );

  assert.equal(read, false);
  assert.equal(written, false);
});

test('importar conserva los viajes locales y los guarda en su orden original', async () => {
  const localTrips = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const saved = [];
  let removed = false;

  const count = await importLocalTripsIntoRepository({
    uid: 'user-1',
    localRepository: {
      async list() { return localTrips; },
      async remove() { removed = true; },
    },
    targetRepository: {
      async save(trip) { saved.push(trip.id); },
    },
  });

  assert.equal(count, 3);
  assert.deepEqual(saved, ['a', 'b', 'c']);
  assert.equal(removed, false);
});

test('el conteo local y el mensaje de error conservan su contrato', async () => {
  assert.equal(await countLocalTrips({ async list() { return [{}, {}]; } }), 2);
  assert.equal(savedTripErrorMessage(new Error('fallo real'), 'alternativo'), 'fallo real');
  assert.equal(savedTripErrorMessage('fallo', 'alternativo'), 'alternativo');
});

test('Remote Config no resuelto se muestra como write no listo y no como error genérico', () => {
  assert.equal(
    savedTripErrorTranslationKey(
      { code: 'trip/v4-rollout-config-unavailable' },
      'savePersistenceError'
    ),
    'saveWriteNotReady'
  );
});
