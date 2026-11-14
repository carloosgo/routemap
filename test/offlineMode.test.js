// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createTrip, createPlace } from '../src/modules/trips/tripModel.js';
import { createOfflineTripStore } from '../src/modules/trips/offlineTripStore.js';
import { createOfflineTripRepository } from '../src/modules/trips/offlineTripRepository.js';
import { precacheList } from '../src/pwa/offlineServiceWorkerPlugin.js';

function sampleTrip(id = 'trip-1', name = 'Europa') {
  const trip = { ...createTrip(name), id };
  const a = createPlace({ id: `${id}-p1`, provider: 'geoapify', name: 'Louvre', lat: 48.86, lon: 2.33 });
  const b = createPlace({ id: `${id}-p2`, provider: 'geoapify', name: 'Orsay', lat: 48.86, lon: 2.32 });
  return {
    ...trip,
    places: [a, b],
    routeConnections: [{ id: `${id}-r1`, fromPlaceId: a.id, toPlaceId: b.id, mode: 'transit', visible: true }],
    notes: [{ id: 'n1', title: 'Hotel', text: 'Reserva 123' }],
  };
}

function fakeCloud(trips) {
  const byId = new Map(trips.map((trip) => [trip.id, trip]));
  const accepted = [];
  return {
    accepted,
    byId,
    async initialize() { return 0; },
    async list() { return [...byId.values()].map((trip) => ({ id: trip.id, name: trip.name })); },
    async fetchRemote(id) {
      const trip = byId.get(id);
      return trip ? { trip, accept: async () => { accepted.push(id); } } : null;
    },
    async get(id) { return byId.get(id) || null; },
    async getPersistenceState() { return { supported: true, autosync: true, state: 'saved', pending: 0 }; },
    async save(trip) { byId.set(trip.id, trip); return trip; },
    async remove(id) { byId.delete(id); },
  };
}

function setup(trips) {
  let online = true;
  const cloud = fakeCloud(trips);
  const store = createOfflineTripStore({ ownerId: 'carlos', localPersistence: createMemoryV4LocalPersistence() });
  const repository = createOfflineTripRepository({
    repository: cloud,
    store,
    isOnline: () => online,
    timeoutMs: 50,
  });
  return { cloud, store, repository, setOnline: (value) => { online = value; } };
}

test('con internet se bajan todos los viajes; sin internet se ven completos', async () => {
  const { repository, setOnline } = setup([sampleTrip('t1', 'Europa'), sampleTrip('t2', 'Japón')]);
  const list = await repository.list();
  assert.equal(list.length, 2);
  await repository.warmAll(list);

  setOnline(false);
  const offlineList = await repository.list();
  assert.deepEqual(offlineList.map((entry) => entry.name).sort(), ['Europa', 'Japón']);
  const trip = await repository.get('t2');
  assert.equal(trip.name, 'Japón');
  assert.equal(trip.places.length, 2);
  assert.equal(trip.routeConnections[0].mode, 'transit');
  assert.equal(trip.notes[0].text, 'Reserva 123');
});

test('sin internet se ve lo último editado en el teléfono', async () => {
  const { repository, setOnline } = setup([sampleTrip('t1')]);
  await repository.get('t1');
  const edited = { ...sampleTrip('t1'), name: 'Europa editado' };
  await repository.rememberTrip(edited);
  setOnline(false);
  assert.equal((await repository.get('t1')).name, 'Europa editado');
  assert.equal((await repository.list()).find((entry) => entry.id === 't1').name, 'Europa editado');
});

test('la nube lenta no bloquea y su respuesta tardía no se adopta como base', async () => {
  const { repository, cloud } = setup([sampleTrip('t1')]);
  await repository.get('t1');
  cloud.accepted.length = 0;
  const original = cloud.fetchRemote;
  cloud.fetchRemote = (id) => new Promise((resolve) => setTimeout(() => resolve(original(id)), 200));
  const trip = await repository.get('t1');
  assert.equal(trip.name, 'Europa', 'se muestra la copia del teléfono');
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.deepEqual(cloud.accepted, [], 'la respuesta tardía no se acepta');
});

test('sin internet ni copia, el error se propaga; la app recuerda el último viaje', async () => {
  const { repository, setOnline } = setup([sampleTrip('t1')]);
  setOnline(false);
  await assert.rejects(() => repository.get('t1'));
  await assert.rejects(() => repository.list());
  await repository.rememberLastTrip('t1');
  assert.equal(await repository.lastTripId(), 't1');
  assert.equal(await repository.initialize(), 0, 'sin red no intenta recuperar la cola');
});

test('borrar un viaje en la nube lo quita del teléfono', async () => {
  const { repository, setOnline } = setup([sampleTrip('t1'), sampleTrip('t2')]);
  await repository.warmAll(await repository.list());
  await repository.remove('t1');
  setOnline(false);
  assert.deepEqual((await repository.list()).map((entry) => entry.id), ['t2']);
  await assert.rejects(() => repository.get('t1'));
});

test('el service worker guarda la app completa salvo sw.js', () => {
  const list = precacheList(['index.html', 'assets/index-abc.js', 'sw.js', 'pwa/icon-192.png', 'robots.txt']);
  assert.deepEqual(list, ['/', '/assets/index-abc.js', '/index.html', '/pwa/icon-192.png']);
});

test('sin internet Mis rutas usa la última ruta calculada (duración y transbordos)', async () => {
  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  let online = true;
  Object.defineProperty(globalThis, 'navigator', { value: { get onLine() { return online; } }, configurable: true });
  try {
    const store = await import('../src/modules/routes/liveRouteStore.js');
    store.clearLiveRoutesForTests();
    const route = { geometry: [[2.33, 48.86], [2.32, 48.86]], duration: 900, distance: 1200, transitSteps: [{ line: 'M1' }] };
    await store.ensureLiveRoute('a', 'b', 'transit', async () => route);

    // Nueva sesión sin internet: la ruta sale del teléfono sin llamar a Google.
    store.clearLiveRoutesForTests({ keepSaved: true });
    online = false;
    let called = false;
    const offline = await store.ensureLiveRoute('a', 'b', 'transit', async () => { called = true; throw new Error('offline'); });
    assert.equal(called, false);
    assert.equal(offline.duration, 900);
    assert.equal(store.withLiveGeometry({ fromPlaceId: 'a', toPlaceId: 'b', mode: 'transit' }).transitSteps[0].line, 'M1');

    // Con internet pero con el cálculo caído, también se usa la copia.
    store.clearLiveRoutesForTests({ keepSaved: true });
    online = true;
    const fallback = await store.ensureLiveRoute('a', 'b', 'transit', async () => { throw new Error('down'); });
    assert.equal(fallback.distance, 1200);
    store.clearLiveRoutesForTests();
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
  }
});

test('las rutas "Elegir cómo llegar" se cargan al abrir un viaje desde la nube', async () => {
  const { createFirestoreV4AppTripRepository } = await import('../src/infrastructure/firebase/firestoreV4AppTripRepository.js');
  const trip = sampleTrip('t1');
  const withMeta = (item) => ({ ...item, status: 'active', version: 1, rank: '0000000001' });
  const byType = {
    segment: [],
    place: trip.places.map(withMeta),
    connection: trip.routeConnections.map(withMeta),
    note: trip.notes.map(withMeta),
    checklist: [],
  };
  const remote = {
    async getTripSummary() { return { id: 't1', name: 'Europa', currency: 'USD', schemaVersion: 4, status: 'active', version: 1 }; },
    async listEntities(_tripId, type) { return byType[type]; },
  };
  const writer = { save: async () => {}, remove: async () => {}, acceptRemoteState: async () => {} };
  const repository = createFirestoreV4AppTripRepository({ db: {}, uid: 'carlos', repository: remote, writer });
  const opened = await repository.get('t1');
  assert.equal(opened.routeConnections.length, 1);
  assert.equal(opened.routeConnections[0].mode, 'transit');
});
