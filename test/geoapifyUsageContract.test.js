import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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

test('el backend conserva mínimo de cinco caracteres y rate limiter oficial', async () => {
  const source = await readFile('functions/index.js', 'utf8');
  assert.doesNotMatch(source, /queryKey\.length < 3/);
  assert.doesNotMatch(source, /normalized\(text\)\.length < 3/);
  assert.match(source, /queryKey\.length < 5/);
  assert.match(source, /normalized\(text\)\.length < 5/);
  assert.match(source, /RequestRateLimiter\.rateLimitedRequests/);
  assert.match(source, /queries\.slice\(0, 1000\)/);
});
