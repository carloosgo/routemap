import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSegment,
  removeSegmentFromRoute,
  reorderSegments,
  updateSegmentDestination,
} from '../src/modules/trips/tripModel.js';
import { segmentNightCount } from '../src/modules/trips/segmentFormModel.js';

function city(id, name) {
  return {
    id,
    name,
    displayName: name,
    country: 'Testland',
    countryCode: 'MX',
    lat: 19,
    lon: -99,
  };
}

function tripWithRoute() {
  const a = city('a', 'A');
  const b = city('b', 'B');
  const c = city('c', 'C');
  const d = city('d', 'D');
  return {
    id: 'trip-1',
    name: 'Route',
    currency: 'USD',
    segments: [
      createSegment({ id: 's1', origin: a, destination: b }),
      createSegment({ id: 's2', origin: b, destination: c }),
      createSegment({ id: 's3', origin: c, destination: d }),
    ],
  };
}

test('editing one timeline destination updates only its following origin link', () => {
  const trip = tripWithRoute();
  const x = city('x', 'X');
  const updated = updateSegmentDestination(trip, 's1', x);

  assert.equal(updated.segments[0].destination.name, 'X');
  assert.equal(updated.segments[1].origin.name, 'X');
  assert.equal(updated.segments[1].destination.name, 'C');
  assert.equal(updated.segments[2].origin.name, 'C');
  assert.equal(updated.segments[2], trip.segments[2]);
});

test('removing a timeline row rechains the surviving route without changing destinations', () => {
  const trip = tripWithRoute();
  const updated = removeSegmentFromRoute(trip, 's2');

  assert.deepEqual(updated.segments.map((segment) => segment.id), ['s1', 's3']);
  assert.equal(updated.segments[0].origin.name, 'A');
  assert.equal(updated.segments[0].destination.name, 'B');
  assert.equal(updated.segments[1].origin.name, 'B');
  assert.equal(updated.segments[1].destination.name, 'D');
});

test('reordering timeline destinations preserves the fixed initial origin and continuous links', () => {
  const trip = tripWithRoute();
  const updated = reorderSegments(trip, 's3', 's2', 'before');

  assert.deepEqual(updated.segments.map((segment) => segment.id), ['s1', 's3', 's2']);
  assert.equal(updated.segments[0].origin.name, 'A');
  assert.equal(updated.segments[0].destination.name, 'B');
  assert.equal(updated.segments[1].origin.name, 'B');
  assert.equal(updated.segments[1].destination.name, 'D');
  assert.equal(updated.segments[2].origin.name, 'D');
  assert.equal(updated.segments[2].destination.name, 'C');
});

test('night count is derived from canonical segment dates', () => {
  assert.equal(segmentNightCount({
    startDate: '2026-08-14',
    endDate: '2026-08-17',
  }), 3);
  assert.equal(segmentNightCount({
    startDate: '2026-08-14',
    endDate: '2026-08-14',
  }), 0);
  assert.equal(segmentNightCount({ startDate: '2026-08-14', endDate: '' }), null);
});
