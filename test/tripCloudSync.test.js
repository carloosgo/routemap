import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createTrip, createPlace } from '../src/modules/trips/tripModel.js';
import { createTripDraftStore, tripDraftScopeId } from '../src/modules/trips/tripDraftStore.js';
import {
  openTripPreferringCloud,
  tripCloudFingerprint,
  tripHasUnsyncedLocalChanges,
  tripsDifferInCloudData,
} from '../src/modules/trips/tripCloudSync.js';

function tripWithTwoPlaces() {
  const trip = { ...createTrip('Europa'), id: 'trip-1' };
  const a = createPlace({ id: 'p1', provider: 'geoapify', name: 'Louvre', lat: 48.86, lon: 2.33 });
  const b = createPlace({ id: 'p2', provider: 'geoapify', name: 'Orsay', lat: 48.86, lon: 2.32 });
  return { ...trip, places: [a, b] };
}

function repositoryWith({ state = SAVED_STATE, cloud = null, changes = 0 } = {}) {
  let opened = 0;
  return {
    get opened() { return opened; },
    getPersistenceState: async () => state,
    localChangeCount: async () => changes,
    get: async () => { opened += 1; return cloud; },
  };
}

const SAVED_STATE = { supported: true, autosync: true, state: 'saved', pending: 0 };

function memoryDrafts() {
  return createTripDraftStore({
    scopeId: tripDraftScopeId('carlos'),
    localPersistence: createMemoryV4LocalPersistence(),
  });
}

test('un borrador viejo ya sincronizado no tapa las rutas guardadas desde otro dispositivo', async () => {
  const draftStore = memoryDrafts();
  const stale = tripWithTwoPlaces();
  await draftStore.put(stale);
  const cloud = {
    ...stale,
    routeConnections: [{ id: 'r1', fromPlaceId: 'p1', toPlaceId: 'p2', mode: 'walk', visible: true }],
  };
  // El borrador es igual a la última nube conocida aquí: 0 cambios.
  const repository = repositoryWith({ cloud, changes: 0 });
  const opened = await openTripPreferringCloud({ repository, draftStore, tripId: stale.id });

  assert.equal(opened.routeConnections[0].mode, 'walk');
  assert.equal(await draftStore.get(stale.id), null, 'el borrador viejo se descarta');
  assert.equal(await draftStore.getActive(), null);
});

test('cambios de este dispositivo sin subir se conservan (en cola o hechos sin internet)', async () => {
  const draftStore = memoryDrafts();
  const local = { ...tripWithTwoPlaces(), name: 'Europa (editado sin conexión)' };
  await draftStore.put(local);

  for (const options of [
    { state: { supported: true, autosync: true, state: 'pending', pending: 2 } },
    { state: { supported: true, autosync: true, state: 'local', pending: 1 } },
    { state: { supported: true, autosync: true, state: 'conflict', pending: 1 } },
    { changes: 3 },
    { changes: null },
  ]) {
    const repository = repositoryWith({ ...options, cloud: tripWithTwoPlaces() });
    const opened = await openTripPreferringCloud({ repository, draftStore, tripId: local.id });
    assert.equal(opened.name, 'Europa (editado sin conexión)', JSON.stringify(options));
    assert.equal(repository.opened, 0, 'no se descarga la nube antes de decidir');
  }
});

test('sin sesión manda el borrador; sin borrador manda la nube', async () => {
  const draft = tripWithTwoPlaces();
  assert.equal(await tripHasUnsyncedLocalChanges({}, draft.id), true);
  assert.equal(await tripHasUnsyncedLocalChanges({ getPersistenceState: async () => { throw new Error('offline'); } }, draft.id), true);
  assert.equal(await tripHasUnsyncedLocalChanges(repositoryWith(), draft.id), false);
  const draftStore = memoryDrafts();
  const cloud = { ...draft, name: 'Nube' };
  assert.equal((await openTripPreferringCloud({ repository: repositoryWith({ cloud }), draftStore, tripId: draft.id })).name, 'Nube');
  await draftStore.put(draft);
  const noCloud = await openTripPreferringCloud({ repository: repositoryWith({ cloud: null }), draftStore, tripId: draft.id });
  assert.equal(noCloud.name, draft.name);
});

test('la huella ignora datos de sesión y detecta cambios guardables', () => {
  const base = tripWithTwoPlaces();
  const withRoute = {
    ...base,
    routeConnections: [{ id: 'r1', fromPlaceId: 'p1', toPlaceId: 'p2', mode: 'transit', visible: true }],
  };
  const withCalculatedRoute = {
    ...withRoute,
    updatedAt: '2030-01-01T00:00:00.000Z',
    routeConnections: [{ ...withRoute.routeConnections[0], duration: 600, distance: 900 }],
  };
  assert.equal(tripsDifferInCloudData(base, withRoute), true);
  assert.equal(tripsDifferInCloudData(withRoute, withCalculatedRoute), false);
  // La nota vacía automática tiene un id nuevo en cada carga: no es un cambio.
  assert.equal(tripCloudFingerprint({ ...base, notes: [] }), tripCloudFingerprint({ ...base, notes: [] }));
  const changedMode = { ...withRoute, routeConnections: [{ ...withRoute.routeConnections[0], mode: 'walk' }] };
  assert.equal(tripsDifferInCloudData(withRoute, changedMode), true);
});

test('ponerse al día solo adopta la nube como base si se va a mostrar', async () => {
  const { cloudTripUpdate } = await import('../src/modules/trips/tripCloudSync.js');
  let accepted = 0;
  let state = SAVED_STATE;
  const cloud = tripWithTwoPlaces();
  const repository = {
    getPersistenceState: async () => state,
    fetchRemote: async () => ({ trip: cloud, accept: async () => { accepted += 1; } }),
  };

  const update = await cloudTripUpdate(repository, cloud.id);
  assert.equal(update.trip, cloud);
  assert.equal(accepted, 0, 'leer no toca la base local');
  await update.accept();
  assert.equal(accepted, 1);

  state = { supported: true, autosync: true, state: 'pending', pending: 1 };
  assert.equal(await cloudTripUpdate(repository, cloud.id), null, 'con cambios pendientes no se trae nada');
  assert.equal(await cloudTripUpdate({}, cloud.id), null, 'sin nube no hay actualización');
});
