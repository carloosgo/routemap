import test from 'node:test';
import assert from 'node:assert/strict';
import {
  limitedFetch,
  providerRequestMetricDescriptor,
} from './geoapifySupport.js';

test('clasifica proveedor y operación sin devolver URL ni query', () => {
  assert.deepEqual(
    providerRequestMetricDescriptor(
      'https://api.geoapify.com/v1/geocode/search?text=SECRET&apiKey=SECRET',
      'Geoapify'
    ),
    { provider: 'geoapify', operation: 'geocode-search' }
  );
  assert.deepEqual(
    providerRequestMetricDescriptor(
      'https://places.googleapis.com/v1/places:autocomplete',
      'Google Places'
    ),
    { provider: 'google', operation: 'places-autocomplete' }
  );
});

test('limitedFetch emite success agregado sin filtrar URL ni payload', async () => {
  const originalFetch = globalThis.fetch;
  const metrics = [];
  let time = 1000;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true }),
  });

  try {
    const result = await limitedFetch(
      'https://api.geoapify.com/v1/geocode/search?text=secret-query&apiKey=secret-key',
      { method: 'POST', body: 'secret-body' },
      'Geoapify',
      {
        metricSink: (metric) => metrics.push(metric),
        now: () => {
          time += 25;
          return time;
        },
      }
    );

    assert.deepEqual(result, { ok: true });
    assert.equal(metrics.length, 1);
    assert.deepEqual(metrics[0], {
      provider: 'geoapify',
      operation: 'geocode-search',
      outcome: 'success',
      status: 200,
      durationMs: 25,
    });
    assert.doesNotMatch(JSON.stringify(metrics), /secret-query|secret-key|secret-body/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('limitedFetch registra HTTP error sin respuesta sensible', async () => {
  const originalFetch = globalThis.fetch;
  const metrics = [];
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    text: async () => 'provider details should not be logged',
  });

  try {
    await assert.rejects(
      limitedFetch(
        'https://places.googleapis.com/v1/places:searchText',
        {},
        'Google Places',
        { metricSink: (metric) => metrics.push(metric) }
      ),
      /429/
    );
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].provider, 'google');
    assert.equal(metrics[0].operation, 'places-search');
    assert.equal(metrics[0].outcome, 'http-error');
    assert.equal(metrics[0].status, 429);
    assert.doesNotMatch(JSON.stringify(metrics), /provider details/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fallo del sink de métricas no rompe una respuesta válida', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ value: 7 }),
  });

  try {
    const result = await limitedFetch(
      'https://api.geoapify.com/v1/geocode/reverse?lat=1&lon=2',
      {},
      'Geoapify',
      { metricSink: () => { throw new Error('metrics unavailable'); } }
    );
    assert.deepEqual(result, { value: 7 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
