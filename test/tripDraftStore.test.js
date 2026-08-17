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

  assert.equal(await store.has(trip.id), true);
  await store.delete(trip.id);
  assert.equal(await store.get(trip.id), null);
});

test('trip draft store aísla drafts por scope de usuario', async () => {
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
  assert.equal(await bob.get(trip.id), null);
});
