import test from 'node:test';
import assert from 'node:assert/strict';
import { syncRetryDelayMs } from '../src/modules/storage-v4/syncRetryModel.js';

function deterministicUnit(index) {
  const mixed = Math.imul(index + 1, 2654435761) >>> 0;
  return mixed / 0x100000000;
}

function summarizePopulation(size, attempt) {
  const buckets = new Map();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < size; index += 1) {
    const delay = syncRetryDelayMs(attempt, { randomUnit: deterministicUnit(index) });
    min = Math.min(min, delay);
    max = Math.max(max, delay);
    const second = Math.floor(delay / 1000);
    buckets.set(second, (buckets.get(second) || 0) + 1);
  }

  const peakPerSecond = Math.max(...buckets.values());
  return {
    size,
    attempt,
    min,
    max,
    occupiedSeconds: buckets.size,
    peakPerSecond,
    peakFraction: peakPerSecond / size,
  };
}

for (const size of [1_000, 10_000, 50_000, 100_000]) {
  test(`Phase K: reconnect capacity ${size.toLocaleString('en-US')} clientes mantiene dispersion en backoff capped`, () => {
    const result = summarizePopulation(size, 5);

    assert.ok(result.min >= 24_000);
    assert.ok(result.max <= 36_000);
    assert.ok(result.max - result.min >= 10_000);
    assert.ok(result.occupiedSeconds >= 12);

    // This is a deterministic model check, not an E2E capacity claim. The
    // guard ensures no one-second bucket receives an implausibly concentrated
    // share of the modeled reconnect population.
    assert.ok(result.peakFraction <= 0.10, JSON.stringify(result));
  });
}

test('Phase K: retry bands remain bounded across the complete 1/2/4/8/16/30s schedule', () => {
  const expected = [
    { attempt: 0, min: 800, max: 1200 },
    { attempt: 1, min: 1600, max: 2400 },
    { attempt: 2, min: 3200, max: 4800 },
    { attempt: 3, min: 6400, max: 9600 },
    { attempt: 4, min: 12_800, max: 19_200 },
    { attempt: 5, min: 24_000, max: 36_000 },
    { attempt: 8, min: 24_000, max: 36_000 },
  ];

  for (const band of expected) {
    const result = summarizePopulation(10_000, band.attempt);
    assert.ok(result.min >= band.min, JSON.stringify(result));
    assert.ok(result.max <= band.max, JSON.stringify(result));
  }
});
