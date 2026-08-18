import test from 'node:test';
import assert from 'node:assert/strict';
import {
  removeSegmentFromTrip,
  reorderSegments,
  updateSegmentDestination,
} from '../src/modules/trips/tripOperations.js';
import { segmentNightCount } from '../src/modules/trips/segmentFormModel.js';

const city = (id, name) => ({
  id,
  name,
  displayName: name,
  country: `${name} Country`,
  countryCode: id.slice(0, 2).toUpperCase(),
  lat: id.charCodeAt(0),
  lon: id.charCodeAt(0) + 1,
});

const mx = city('mx', 'Ciudad de México');
const paris = city('fr', 'Paris');
const rothenburg = city('de', 'Rothenburg ob der Tauber');
const amsterdam = city('nl', 'Amsterdam');
const brussels = city('be', 'Brussels');

function segment(id, origin, destination, extra = {}) {
  return {
    id,
    origin,
    destination,
    startDate: '',
    endDate: '',
    expenses: {},
    note: '',
    ...extra,
  };
}

function trip() {
  return {
    id: 'trip-1',
    updatedAt: '2026-08-18T00:00:00.000Z',
    segments: [
      segment('s1', mx, paris, { note: 'Paris note' }),
      segment('s2', paris, rothenburg, { note: 'Rothenburg note' }),
      segment('s3', rothenburg, amsterdam, { note: 'Amsterdam note' }),
    ],
  };
}

test('night count is derived from dates and never inferred from incomplete ranges', () => {
  assert.equal(segmentNightCount({ startDate: '2026-08-14', endDate: '2026-08-17' }), 3);
  assert.equal(segmentNightCount({ startDate: '2026-08-14', endDate: '2026-08-14' }), 0);
  assert.equal(segmentNightCount({ startDate: '2026-08-17', endDate: '2026-08-14' }), null);
  assert.equal(segmentNightCount({ startDate: '2026-08-14', endDate: '' }), null);
});

test('changing a destination rechains only the following origin and preserves segment-owned data', () => {
  const original = trip();
  const next = updateSegmentDestination(original, 's2', brussels);

  assert.equal(next.segments[0], original.segments[0]);
  assert.equal(next.segments[1].destination.name, 'Brussels');
  assert.equal(next.segments[1].note, 'Rothenburg note');
  assert.equal(next.segments[2].origin.name, 'Brussels');
  assert.equal(next.segments[2].destination.name, 'Amsterdam');
  assert.equal(next.segments[2].note, 'Amsterdam note');
});

test('removing a destination keeps the original trip start and reconnects the remaining timeline', () => {
  const original = trip();
  const next = removeSegmentFromTrip(original, 's1');

  assert.deepEqual(next.segments.map((item) => item.id), ['s2', 's3']);
  assert.equal(next.segments[0].origin.name, 'Ciudad de México');
  assert.equal(next.segments[0].destination.name, 'Rothenburg ob der Tauber');
  assert.equal(next.segments[1].origin.name, 'Rothenburg ob der Tauber');
  assert.equal(next.segments[1].destination.name, 'Amsterdam');
});

test('drag reorder preserves fixed start and rechains every moved destination in visual order', () => {
  const original = trip();
  const next = reorderSegments(original, 's3', 's1', 'before');

  assert.deepEqual(next.segments.map((item) => item.id), ['s3', 's1', 's2']);
  assert.equal(next.segments[0].origin.name, 'Ciudad de México');
  assert.equal(next.segments[0].destination.name, 'Amsterdam');
  assert.equal(next.segments[0].note, 'Amsterdam note');
  assert.equal(next.segments[1].origin.name, 'Amsterdam');
  assert.equal(next.segments[1].destination.name, 'Paris');
  assert.equal(next.segments[1].note, 'Paris note');
  assert.equal(next.segments[2].origin.name, 'Paris');
  assert.equal(next.segments[2].destination.name, 'Rothenburg ob der Tauber');
});
