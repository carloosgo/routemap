import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedCache } from '../functions/sharedCache.js';

function fakeDb({ get, set } = {}) {
  return {
    collection(collection) {
      return {
        doc(documentId) {
          return {
            async get() {
              if (get) return get({ collection, documentId });
              return { data: () => undefined };
            },
            async set(value) {
              if (set) return set({ collection, documentId, value });
              return undefined;
            },
          };
        },
      };
    },
  };
}

test('provider cache: un hit vigente evita consultar al proveedor y emite métrica agregada', async () => {
  let loaderCalls = 0;
  const metrics = [];
  const db = fakeDb({
    get: async () => ({
      data: () => ({
        result: { value: 42 },
        expiresAt: { toMillis: () => Date.now() + 60_000 },
      }),
    }),
  });
  const cached = createSharedCache(db, {
    ttlMs: 60_000,
    onCacheMetric: (metric) => metrics.push(metric),
  });

  const result = await cached('placeDetailsCache', 'opaque-key', async () => {
    loaderCalls += 1;
    return { value: 99 };
  });

  assert.deepEqual(result, { result: { value: 42 }, cacheHit: true });
  assert.equal(loaderCalls, 0);
  assert.deepEqual(metrics, [{ outcome: 'hit', collection: 'placeDetailsCache' }]);
  assert.doesNotMatch(JSON.stringify(metrics), /opaque-key|42|99/);
});

test('provider cache: un fallo de lectura cae al proveedor sin bloquear la operación', async () => {
  const events = [];
  const metrics = [];
  let writes = 0;
  const db = fakeDb({
    get: async () => {
      const error = new Error('cache unavailable');
      error.code = 'unavailable';
      throw error;
    },
    set: async () => {
      writes += 1;
    },
  });
  const cached = createSharedCache(db, {
    ttlMs: 60_000,
    onCacheError: (event) => events.push(event),
    onCacheMetric: (metric) => metrics.push(metric),
  });

  const result = await cached('geocodeCache', 'secret-query-not-reported', async () => ({ ok: true }));

  assert.deepEqual(result, { result: { ok: true }, cacheHit: false });
  assert.equal(writes, 1);
  assert.deepEqual(events, [{
    phase: 'read',
    collection: 'geocodeCache',
    errorName: 'Error',
    errorCode: 'unavailable',
  }]);
  assert.deepEqual(metrics, [
    {
      outcome: 'read-error',
      collection: 'geocodeCache',
      errorName: 'Error',
      errorCode: 'unavailable',
    },
    { outcome: 'miss', collection: 'geocodeCache' },
  ]);
  assert.doesNotMatch(JSON.stringify(events), /secret-query-not-reported/);
  assert.doesNotMatch(JSON.stringify(metrics), /secret-query-not-reported/);
});

test('provider cache: un fallo de escritura no descarta el resultado vivo', async () => {
  const events = [];
  const metrics = [];
  const db = fakeDb({
    get: async () => ({ data: () => undefined }),
    set: async () => {
      const error = new Error('write failed');
      error.code = 'resource-exhausted';
      throw error;
    },
  });
  const cached = createSharedCache(db, {
    ttlMs: 60_000,
    onCacheError: (event) => events.push(event),
    onCacheMetric: (metric) => metrics.push(metric),
  });

  const result = await cached('citySearchCache', 'opaque-key', async () => ['Madrid']);

  assert.deepEqual(result, { result: ['Madrid'], cacheHit: false });
  assert.deepEqual(events, [{
    phase: 'write',
    collection: 'citySearchCache',
    errorName: 'Error',
    errorCode: 'resource-exhausted',
  }]);
  assert.deepEqual(metrics, [
    { outcome: 'miss', collection: 'citySearchCache' },
    {
      outcome: 'write-error',
      collection: 'citySearchCache',
      errorName: 'Error',
      errorCode: 'resource-exhausted',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(metrics), /opaque-key|Madrid|write failed/);
});

test('provider cache: solicitudes concurrentes del mismo key comparten el load vivo', async () => {
  let loaderCalls = 0;
  let release;
  const loaderGate = new Promise((resolve) => {
    release = resolve;
  });
  const db = fakeDb({
    get: async () => ({ data: () => undefined }),
  });
  const cached = createSharedCache(db, { ttlMs: 60_000 });

  const loader = async () => {
    loaderCalls += 1;
    await loaderGate;
    return { ok: true };
  };

  const first = cached('placeSearchCache', 'same-key', loader);
  const second = cached('placeSearchCache', 'same-key', loader);
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();

  const [a, b] = await Promise.all([first, second]);
  assert.equal(loaderCalls, 1);
  assert.deepEqual(a, { result: { ok: true }, cacheHit: false });
  assert.deepEqual(b, a);
});

test('provider cache: un sink de métricas defectuoso nunca rompe hit ni miss', async () => {
  const onCacheMetric = () => {
    throw new Error('metrics sink unavailable');
  };
  const hitDb = fakeDb({
    get: async () => ({
      data: () => ({
        result: 'cached',
        expiresAt: { toMillis: () => Date.now() + 60_000 },
      }),
    }),
  });
  const hitCached = createSharedCache(hitDb, { ttlMs: 60_000, onCacheMetric });
  assert.deepEqual(
    await hitCached('placeDetailsCache', 'hit-key', async () => 'live'),
    { result: 'cached', cacheHit: true }
  );

  const missDb = fakeDb({
    get: async () => ({ data: () => undefined }),
  });
  const missCached = createSharedCache(missDb, { ttlMs: 60_000, onCacheMetric });
  assert.deepEqual(
    await missCached('placeDetailsCache', 'miss-key', async () => 'live'),
    { result: 'live', cacheHit: false }
  );
});
