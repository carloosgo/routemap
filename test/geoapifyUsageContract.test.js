import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const read = (path) => readFile(path, 'utf8');

test('la búsqueda respeta debounce, longitud mínima, límite y TTL acordados', () => {
  assert.equal(config.citySearchMinChars, 5);
  assert.ok(config.citySearchDebounceMs >= 400 && config.citySearchDebounceMs <= 500);
  assert.equal(config.citySearchLimit, 5);
  assert.equal(config.geoapify.searchMinChars, 5);
  assert.ok(config.geoapify.searchDebounceMs >= 400 && config.geoapify.searchDebounceMs <= 500);
  assert.equal(config.geoapify.searchLimit, 5);
  assert.ok(config.geoapify.clientCacheTtlMs >= 30 * DAY_MS);
  assert.ok(config.geoapify.clientCacheTtlMs <= 90 * DAY_MS);
});

test('el backend conserva mínimo de cinco caracteres, límite cinco y rate limiter oficial', async () => {
  const source = await read('functions/index.js');
  assert.doesNotMatch(source, /queryKey\.length < 3/);
  assert.match(source, /queryKey\.length < 5/);
  assert.match(source, /normalized\(query\)\.length < 5/);
  assert.match(source, /Number\(request\.data\?\.limit\) \|\| 5/);
  assert.match(source, /RequestRateLimiter\.rateLimitedRequests/);
});

test('batch usa una solicitud oficial de hasta mil entradas y exige autenticación', async () => {
  const source = await read('functions/index.js');
  assert.match(source, /rawQueries\.length > 1000/);
  assert.match(source, /requireAuthenticated\(request\)/);
  assert.match(source, /\/v1\/batch\/geocode\/search/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /body: JSON\.stringify\(queries\)/);
  assert.match(source, /export const geoapifyBatchGeocodeResult/);
  assert.doesNotMatch(source, /const tasks = queries\.map/);
});

test('App Check, cuotas compartidas y límites de instancias forman parte de todas las callable functions', async () => {
  const policy = await read('functions/callablePolicy.js');
  const source = await read('functions/index.js');
  const client = await read('src/infrastructure/firebase/firebaseClient.js');

  assert.match(policy, /defineBoolean\('ENFORCE_APP_CHECK'/);
  assert.match(policy, /enforceAppCheck: ENFORCE_APP_CHECK/);
  assert.match(policy, /maxInstances: 10/);
  assert.match(policy, /concurrency: 20/);
  assert.match(policy, /functionRateLimits/);
  assert.match(source, /enforceQuota\(db, request/);
  assert.match(client, /ReCaptchaEnterpriseProvider/);
  assert.match(client, /isTokenAutoRefreshEnabled: true/);
});

test('la caché compartida oculta la consulta y conserva expiración administrable', async () => {
  const cache = await read('functions/sharedCache.js');
  const source = await read('functions/index.js');

  assert.match(cache, /expiresAt: Timestamp\.fromMillis/);
  assert.match(cache, /inFlightLoads/);
  assert.doesNotMatch(cache, /queryKey:/);
  assert.doesNotMatch(source, /queryKey: key/);
  assert.match(source, /placeDetailsCache/);
  assert.match(source, /geoapifyBatchJobs/);
});
