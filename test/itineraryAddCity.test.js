// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSegment, createTrip } from '../src/modules/trips/tripModel.js';

const paris = {
  id: 'city-paris',
  name: 'Paris',
  country: 'France',
  countryCode: 'FR',
  lat: 48.8566,
  lon: 2.3522,
};

test('appendSegment can create the new card with the selected destination atomically', () => {
  const trip = createTrip();
  const next = appendSegment(trip, { destination: paris });

  assert.equal(next.segments.length, 1);
  assert.equal(next.segments[0].destination.name, 'Paris');
  assert.equal(next.segments[0].destination.countryCode, 'FR');
});
