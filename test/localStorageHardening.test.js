import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStorageRepository } from '../src/modules/storage/localStorageRepository.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
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
  };
}

test('local storage repository exige una clave válida', () => {
  assert.throws(() => createLocalStorageRepository('  '), /clave de almacenamiento válida/);
});

test('local storage repository tolera JSON corrupto sin inventar datos', async () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage({ 'test:trips': '{invalid-json' });

  try {
    const repository = createLocalStorageRepository('test:trips');
    assert.deepEqual(await repository.list(), []);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('local storage repository normaliza antes de persistir', async () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();

  try {
    const repository = createLocalStorageRepository('test:trips');
    const saved = await repository.save({
      id: 'trip-1',
      name: 'Viaje\u0000 seguro',
      currency: 'EUR',
      segments: [
        {
          id: 'segment-1',
          origin: { name: 'México', countryCode: 'mx', lat: '19.43', lon: '-99.13' },
          destination: { name: 'Madrid', countryCode: 'es', lat: '40.41', lon: '-3.70' },
          expenses: { lodging: '-20' },
        },
      ],
    });

    assert.equal(saved.name, 'Viaje seguro');
    assert.equal(saved.segments[0].origin.countryCode, 'MX');
    assert.equal(saved.segments[0].origin.lat, 19.43);
    assert.equal(saved.segments[0].expenses.lodging, 0);

    const loaded = await repository.get('trip-1');
    assert.deepEqual(loaded, saved);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('local storage repository rechaza identificadores vacíos', async () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();

  try {
    const repository = createLocalStorageRepository('test:trips');
    await assert.rejects(repository.get(''), /identificador de viaje válido/);
    await assert.rejects(repository.remove(null), /identificador de viaje válido/);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
