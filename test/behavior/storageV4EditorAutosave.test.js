// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { isTripEditTransition } from '../../src/modules/trips/useTripAutoPersistence.js';

test('cambio real del trip dispara autosave aunque updatedAt sea idéntico', () => {
  const original = {
    id: 'trip-1',
    updatedAt: '2026-08-17T12:00:00.000Z',
    segments: [{ id: 'segment-1', note: '' }],
  };
  const edited = {
    ...original,
    updatedAt: original.updatedAt,
    segments: [{ id: 'segment-1', note: 'texto' }],
  };
  assert.equal(isTripEditTransition(null, original), false);
  assert.equal(isTripEditTransition({ id: original.id, trip: original }, original), false);
  assert.equal(isTripEditTransition({ id: original.id, trip: original }, edited), true);
  assert.equal(isTripEditTransition({ id: 'otro-trip', trip: original }, edited), false);
});
