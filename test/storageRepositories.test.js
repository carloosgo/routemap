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

test('API repository usa POST para un viaje nuevo aunque ya tenga ID local', async () => {
  const previousFetch = globalThis.fetch;
  let receivedUrl;
  let receivedMethod;

  globalThis.fetch = async (url, options) => {
    receivedUrl = url;
    receivedMethod = options.method;
    return {
      ok: true,
      status: 200,
      async json() {
        return { id: 'trip-new', name: 'Nuevo', segments: [] };
      },
    };
  };

  try {
    const repository = createApiRepository('https://api.example.com');
    await repository.save({ id: 'trip-new', name: 'Nuevo', segments: [] });

    assert.equal(receivedUrl, 'https://api.example.com/api/trips');
    assert.equal(receivedMethod, 'POST');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('API repository usa PUT para un viaje previamente cargado', async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method });
    return {
      ok: true,
      status: 200,
      async json() {
        if (!options.method) return [{ id: 'trip-1', name: 'Europa', segments: [] }];
        return { id: 'trip-1', name: 'Europa actualizada', segments: [] };
      },
    };
  };

  try {
    const repository = createApiRepository('https://api.example.com');
    await repository.list();
    await repository.save({ id: 'trip-1', name: 'Europa actualizada', segments: [] });

    assert.equal(requests[1].url, 'https://api.example.com/api/trips/trip-1');
    assert.equal(requests[1].method, 'PUT');
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
