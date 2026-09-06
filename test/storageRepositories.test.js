import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalStorageRepository } from '../src/modules/storage/localStorageRepository.js';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
}

test('localStorage repository guarda y recupera un viaje', async () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();

  try {
    const repository = createLocalStorageRepository('test:trips');
    await repository.save({
      id: 'trip-1',
      name: 'Europa',
      currency: 'EUR',
      segments: [],
      notes: [],
      checklist: [],
    });

    const trips = await repository.list();
    assert.equal(trips.length, 1);
    assert.equal(trips[0].id, 'trip-1');
    assert.equal(trips[0].name, 'Europa');
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('localStorage repository elimina únicamente el viaje indicado', async () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = createMemoryStorage();

  try {
    const repository = createLocalStorageRepository('test:trips');
    await repository.save({ id: 'trip-1', name: 'Uno', segments: [] });
    await repository.save({ id: 'trip-2', name: 'Dos', segments: [] });
    await repository.remove('trip-1');

    const trips = await repository.list();
    assert.deepEqual(trips.map((trip) => trip.id), ['trip-2']);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
