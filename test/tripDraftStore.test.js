import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryV4LocalPersistence } from '../src/modules/storage-v4/memoryLocalPersistence.js';
import { createTrip } from '../src/modules/trips/tripModel.js';
import {
  createTripDraftStore,
  tripDraftScopeId,
} from '../src/modules/trips/tripDraftStore.js';

test('trip draft store persiste, recupera y elimina el trabajo local sin Firestore', async () => {
  const localPersistence = createMemoryV4LocalPersistence();
  let clock = 100;
  const store = createTripDraftStore({
    scopeId: tripDraftScopeId('alice'),
    localPersistence,
    now: () => ++clock,
  });
  const trip = { ...createTrip(), name: 'Borrador Europa' };

  const saved = await store.put(trip);
  assert.equal(saved.durable, true);
  assert.equal(saved.record.lastModifiedLocal, 101);

  const recovered = await store.get(trip.id);
  assert.equal(recovered.id, trip.id);
  assert.equal(recovered.name, 'Borrador Europa');
  assert.equal((await store.getActive())?.id, trip.id);
  assert.equal((await store.getActive())?.name, 'Borrador Europa');

  assert.equal(await store.has(trip.id), true);
  await store.delete(trip.id);
  assert.equal(await store.get(trip.id), null);
  assert.equal(await store.getActive(), null);
});

test('trip draft store conserva drafts por viaje y el activo apunta al más reciente', async () => {
  const localPersistence = createMemoryV4LocalPersistence();
  const store = createTripDraftStore({
    scopeId: tripDraftScopeId('alice'),
    localPersistence,
  });
  const first = { ...createTrip(), name: 'Primero' };
  const second = { ...createTrip(), name: 'Segundo' };

  await store.put(first);
  await store.put(second);

  assert.equal((await store.get(first.id))?.name, 'Primero');
  assert.equal((await store.get(second.id))?.name, 'Segundo');
  assert.equal((await store.getActive())?.id, second.id);
  assert.equal((await store.getActive())?.name, 'Segundo');
});

test('trip draft store aísla drafts activos por scope de usuario', async () => {
  const localPersistence = createMemoryV4LocalPersistence();
  const alice = createTripDraftStore({
    scopeId: tripDraftScopeId('alice'),
    localPersistence,
  });
  const bob = createTripDraftStore({
    scopeId: tripDraftScopeId('bob'),
    localPersistence,
  });
  const trip = { ...createTrip(), name: 'Privado' };

  await alice.put(trip);
  assert.equal((await alice.get(trip.id))?.name, 'Privado');
  assert.equal((await alice.getActive())?.name, 'Privado');
  assert.equal(await bob.get(trip.id), null);
  assert.equal(await bob.getActive(), null);
});
