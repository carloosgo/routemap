import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiRepository } from '../src/modules/storage/apiRepository.js';
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

test('API repository normaliza la URL base y solicita credenciales de sesión', async () => {
  const previousFetch = globalThis.fetch;
  let receivedUrl;
  let receivedOptions;

  globalThis.fetch = async (url, options) => {
    receivedUrl = url;
    receivedOptions = options;
    return {
      ok: true,
      status: 200,
      async json() {
        return [];
      },
    };
  };

  try {
    const repository = createApiRepository('https://api.example.com/');
    await repository.list();

    assert.equal(receivedUrl, 'https://api.example.com/api/trips');
    assert.equal(receivedOptions.credentials, 'include');
    assert.equal(receivedOptions.headers['Content-Type'], 'application/json');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('API repository no expone el cuerpo interno de una respuesta fallida', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    async text() {
      return 'password=super-secret database trace';
    },
  });

  try {
    const repository = createApiRepository('https://api.example.com');
    await assert.rejects(
      repository.list(),
      (error) => {
        assert.match(error.message, /500/);
        assert.doesNotMatch(error.message, /super-secret|database trace/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
