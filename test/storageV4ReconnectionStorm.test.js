import test from 'node:test';
import assert from 'node:assert/strict';
import { syncRetryDelayMs } from '../src/modules/storage-v4/syncRetryModel.js';

function deterministicUnit(index) {
  const mixed = Math.imul(index + 1, 2654435761) >>> 0;
  return mixed / 0x100000000;
}

test('Gate G: 1000 clientes que fallan juntos se dispersan por jitter al reconectar', () => {
  const delays = Array.from({ length: 1000 }, (_, index) => syncRetryDelayMs(5, {
    randomUnit: deterministicUnit(index),
  }));
  const uniqueDelays = new Set(delays);
  const min = Math.min(...delays);
  const max = Math.max(...delays);

  // attempt 5 reaches the capped backoff band; ±20% jitter must spread the
  // population instead of scheduling one thundering-herd timestamp.
  assert.ok(min >= 24000);
  assert.ok(max <= 36000);
  assert.ok(max - min >= 10000);
  assert.ok(uniqueDelays.size >= 900);
});

test('Gate G: clientes conservan dispersión desde el primer retry', () => {
  const delays = Array.from({ length: 200 }, (_, index) => syncRetryDelayMs(0, {
    randomUnit: deterministicUnit(index),
  }));
  assert.ok(Math.min(...delays) >= 800);
  assert.ok(Math.max(...delays) <= 1200);
  assert.ok(new Set(delays).size >= 150);
});
