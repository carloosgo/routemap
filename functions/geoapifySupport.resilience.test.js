import test from 'node:test';
import assert from 'node:assert/strict';
import { limitedFetch } from './geoapifySupport.js';

function response({ status = 200, body = '{}' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body;
    },
  };
}

async function withFetch(fakeFetch, work) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    return await work();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function deterministicClock(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test('limitedFetch clasifica 429 como http-error y conserva status', async () => {
  const metrics = [];

  await withFetch(
    async () => response({ status: 429, body: '{"error":"quota"}' }),
    async () => {
      await assert.rejects(
        limitedFetch(
          'https://api.geoapify.com/v1/geocode/autocomplete?text=x',
          {},
          'Geoapify city autocomplete',
          {
            metricSink: (metric) => metrics.push(metric),
            now: deterministicClock(1000, 1125),
          }
        ),
        (error) => error?.code === 'http-429'
      );
    }
  );

  assert.equal(metrics.length, 1);
  assert.deepEqual(metrics[0], {
    provider: 'geoapify',
    operation: 'geocode-autocomplete',
    outcome: 'http-error',
    status: 429,
    durationMs: 125,
  });
});

test('limitedFetch clasifica 5xx como http-error', async () => {
  const metrics = [];

  await withFetch(
    async () => response({ status: 503, body: 'unavailable' }),
    async () => {
      await assert.rejects(
        limitedFetch(
          'https://api.geoapify.com/v1/routing',
          {},
          'Geoapify routing',
          {
            metricSink: (metric) => metrics.push(metric),
            now: deterministicClock(5000, 5090),
          }
        ),
        (error) => error?.code === 'http-503'
      );
    }
  );

  assert.equal(metrics[0].outcome, 'http-error');
  assert.equal(metrics[0].status, 503);
  assert.equal(metrics[0].operation, 'route');
});

test('limitedFetch clasifica rechazo de red y no registra URL ni payload', async () => {
  const metrics = [];
  const networkError = new Error('socket reset with sensitive-looking text');
  networkError.code = 'ECONNRESET';

  await withFetch(
    async () => { throw networkError; },
    async () => {
      await assert.rejects(
        limitedFetch(
          'https://api.geoapify.com/v1/geocode/search?text=secret-query&apiKey=secret-key',
          {},
          'Geoapify search',
          {
            metricSink: (metric) => metrics.push(metric),
            now: deterministicClock(2000, 2040),
          }
        ),
        networkError
      );
    }
  );

  assert.equal(metrics.length, 1);
  assert.deepEqual(metrics[0], {
    provider: 'geoapify',
    operation: 'geocode-search',
    outcome: 'network-error',
    status: 0,
    durationMs: 40,
    errorCode: 'ECONNRESET',
  });
  const serialized = JSON.stringify(metrics[0]);
  assert.equal(serialized.includes('secret-query'), false);
  assert.equal(serialized.includes('secret-key'), false);
  assert.equal(serialized.includes('socket reset'), false);
});

test('limitedFetch clasifica JSON invalido como parse-error', async () => {
  const metrics = [];

  await withFetch(
    async () => response({ status: 200, body: '<html>not json</html>' }),
    async () => {
      await assert.rejects(
        limitedFetch(
          'https://api.geoapify.com/v1/geocode/reverse',
          {},
          'Geoapify reverse',
          {
            metricSink: (metric) => metrics.push(metric),
            now: deterministicClock(3000, 3075),
          }
        ),
        (error) => error?.code === 'invalid-json'
      );
    }
  );

  assert.deepEqual(metrics[0], {
    provider: 'geoapify',
    operation: 'geocode-reverse',
    outcome: 'parse-error',
    status: 200,
    durationMs: 75,
    errorCode: 'invalid-json',
  });
});

test('limitedFetch mantiene respuesta valida aunque falle metricSink', async () => {
  const result = await withFetch(
    async () => response({ status: 200, body: '{"ok":true}' }),
    () => limitedFetch(
      'https://api.geoapify.com/v1/geocode/search',
      {},
      'Geoapify search',
      {
        metricSink: () => { throw new Error('logging unavailable'); },
        now: deterministicClock(4000, 4010),
      }
    )
  );

  assert.deepEqual(result, { ok: true });
});
