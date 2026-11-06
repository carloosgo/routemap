import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeCitySearchResults } from '../src/modules/geocoding/citySearchClient.js';
import { createPersistentCache } from '../src/modules/places/geoapifyClientCache.js';

function createMemoryStorage(initial = {}) {
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

function storedKeys(storage, key) {
  return Object.keys(JSON.parse(storage.getItem(key) || '{}'));
}

test('caché persistente conserva hits frescos y elimina físicamente los vencidos', () => {
  const storageKey = 'test:geoapify-cache:expiry';
  const previousStorage = globalThis.localStorage;
  const now = Date.now();
  const storage = createMemoryStorage({
    [storageKey]: JSON.stringify({
      fresh: { result: ['ok'], timestamp: now, expiresAt: now + 60_000 },
      expired: { result: ['old'], timestamp: now - 120_000, expiresAt: now - 1 },
    }),
  });
  globalThis.localStorage = storage;

  try {
    const cache = createPersistentCache(storageKey);
    assert.deepEqual(cache.getFresh('fresh', 60_000)?.result, ['ok']);
    assert.equal(cache.getFresh('expired', 60_000), null);
    assert.deepEqual(storedKeys(storage, storageKey), ['fresh']);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('caché persistente mantiene un límite y expulsa las entradas más antiguas', () => {
  const storageKey = 'test:geoapify-cache:limit';
  const previousStorage = globalThis.localStorage;
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;

  try {
    const cache = createPersistentCache(storageKey, { maxEntries: 2 });
    cache.set('a', { value: 1 }, 60_000);
    cache.set('b', { value: 2 }, 60_000);
    cache.set('c', { value: 3 }, 60_000);

    assert.deepEqual(storedKeys(storage, storageKey), ['b', 'c']);
    assert.equal(cache.getFresh('a', 60_000), null);
    assert.equal(cache.getFresh('b', 60_000)?.value, 2);
    assert.equal(cache.getFresh('c', 60_000)?.value, 3);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('inicialización poda expirados y aplica el límite en la misma pasada', () => {
  const storageKey = 'test:geoapify-cache:init-prune-limit';
  const previousStorage = globalThis.localStorage;
  const now = Date.now();
  const storage = createMemoryStorage({
    [storageKey]: JSON.stringify({
      expired: { value: 0, timestamp: now - 120_000, expiresAt: now - 1 },
      oldestFresh: { value: 1, timestamp: now - 3_000, expiresAt: now + 60_000 },
      middleFresh: { value: 2, timestamp: now - 2_000, expiresAt: now + 60_000 },
      newestFresh: { value: 3, timestamp: now - 1_000, expiresAt: now + 60_000 },
    }),
  });
  globalThis.localStorage = storage;

  try {
    const cache = createPersistentCache(storageKey, { maxEntries: 2 });
    assert.deepEqual(storedKeys(storage, storageKey), ['middleFresh', 'newestFresh']);
    assert.equal(cache.getFresh('expired', 60_000), null);
    assert.equal(cache.getFresh('oldestFresh', 60_000), null);
    assert.equal(cache.getFresh('middleFresh', 60_000)?.value, 2);
    assert.equal(cache.getFresh('newestFresh', 60_000)?.value, 3);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('instancias sobre la misma clave no se pisan entre sí', () => {
  const storageKey = 'test:geoapify-cache:shared';
  const previousStorage = globalThis.localStorage;
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;

  try {
    const first = createPersistentCache(storageKey);
    const second = createPersistentCache(storageKey);

    first.set('place:1', { image: 'one' }, 60_000);
    second.set('enrichment:1', { website: 'https://example.com' }, 60_000);

    assert.deepEqual(storedKeys(storage, storageKey), ['place:1', 'enrichment:1']);
    assert.equal(first.getFresh('enrichment:1', 60_000)?.website, 'https://example.com');
    assert.equal(second.getFresh('place:1', 60_000)?.image, 'one');
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('caché local corrupta falla en modo best-effort', () => {
  const storageKey = 'test:geoapify-cache:corrupt';
  const previousStorage = globalThis.localStorage;
  const storage = createMemoryStorage({ [storageKey]: '{invalid-json' });
  globalThis.localStorage = storage;

  try {
    const cache = createPersistentCache(storageKey);
    assert.equal(cache.getFresh('missing', 60_000), null);
    cache.set('valid', { value: true }, 60_000);
    assert.equal(cache.getFresh('valid', 60_000)?.value, true);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test('autocomplete en español descarta nombres crudos no latinos y conserva nombres localizados', () => {
  const results = sanitizeCitySearchResults([
    { name: 'Tokio', displayName: 'Tokio, Japón' },
    { name: '東京23区', displayName: '東京23区, Japón' },
    { name: '東洋町', displayName: '東洋町, Japón' },
    { name: 'Toki', displayName: 'Toki, Ucrania' },
    { name: 'München', displayName: 'München, Alemania' },
    { name: 'São Paulo', displayName: 'São Paulo, Brasil' },
    null,
    { displayName: 'Sin nombre' },
  ], { language: 'es' });

  assert.deepEqual(
    results.map((result) => result.name),
    ['Tokio', 'Toki', 'München', 'São Paulo']
  );
  assert.equal(results.some((result) => result.displayName === '東京23区, Japón'), false);
});
