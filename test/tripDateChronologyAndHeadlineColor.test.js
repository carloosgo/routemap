// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { itineraryMapProjection } from '../src/modules/map/itineraryMapProjection.js';
import { tripDateRange, tripSummary } from '../src/modules/trips/tripSummaryModel.js';
import {
  TRIP_DATE_ERRORS,
  validateOriginDepartureDateChange,
  validateSegmentDatePatch,
} from '../src/modules/trips/tripDateRules.js';
import { TRIP_ACTIONS, tripReducer } from '../src/modules/trips/tripReducer.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function sampleTrip() {
  return {
    id: 'trip-1',
    name: 'Trip',
    currency: 'MXN',
    updatedAt: '2026-08-24T00:00:00.000Z',
    originDetails: { departureDate: '2026-09-05', expenses: {} },
    segments: [
      { id: 'a', startDate: '2026-09-10', endDate: '2026-09-12', destination: null, expenses: {} },
      { id: 'b', startDate: '2026-09-13', endDate: '2026-09-20', destination: null, expenses: {} },
    ],
    notes: [],
    checklist: [],
    places: [],
    routeConnections: [],
  };
}

test('header start date comes from the first dated city and ignores historical origin metadata', () => {
  const trip = sampleTrip();
  trip.segments[0].startDate = '';
  trip.segments[1].startDate = '2026-09-10';

  assert.equal(tripSummary(trip).startDate, '2026-09-10');

  trip.originDetails.departureDate = '2026-09-01';
  assert.equal(tripSummary(trip).startDate, '2026-09-10');

  trip.segments[0].startDate = '2026-09-07';
  assert.equal(tripSummary(trip).startDate, '2026-09-07');
});

test('header end date comes from the last itinerary leg that has an end date, not the global maximum', () => {
  const trip = sampleTrip();
  trip.segments[0].endDate = '2026-09-30';
  trip.segments[1].endDate = '2026-09-20';

  assert.deepEqual(tripDateRange(trip), {
    startDate: '2026-09-10',
    endDate: '2026-09-20',
  });

  trip.segments[1].endDate = '';
  assert.equal(tripDateRange(trip).endDate, '2026-09-30');
});

test('date rules enforce chronology between city legs without using historical origin as a lower bound', () => {
  const trip = sampleTrip();

  assert.deepEqual(
    validateSegmentDatePatch(trip, 'a', { startDate: '2026-09-04' }),
    { valid: true, errorKey: '' }
  );

  // Legacy origin editing remains guarded for existing v4 data, but it is no
  // longer part of the active city chronology.
  assert.deepEqual(
    validateOriginDepartureDateChange(trip, '2026-09-11'),
    { valid: false, errorKey: TRIP_DATE_ERRORS.originAfterItinerary }
  );

  assert.deepEqual(
    validateSegmentDatePatch(trip, 'a', { endDate: '2026-09-14' }),
    { valid: false, errorKey: TRIP_DATE_ERRORS.afterNext }
  );

  assert.deepEqual(
    validateSegmentDatePatch(trip, 'b', { endDate: '2026-09-25' }),
    { valid: true, errorKey: '' }
  );

  assert.deepEqual(
    validateSegmentDatePatch(trip, 'a', { startDate: '2026-09-13' }),
    { valid: false, errorKey: TRIP_DATE_ERRORS.startAfterEnd }
  );

  assert.deepEqual(
    validateSegmentDatePatch(trip, 'a', { startDate: '' }),
    { valid: true, errorKey: '' }
  );
});

test('reducer rejects invalid city chronology mutations so UI callers cannot bypass date rules', () => {
  const trip = sampleTrip();
  const invalid = tripReducer(trip, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'a',
    patch: { startDate: '2026-09-13' },
  });
  assert.equal(invalid, trip);

  const valid = tripReducer(trip, {
    type: TRIP_ACTIONS.updateSegment,
    segmentId: 'b',
    patch: { endDate: '2026-09-25' },
  });
  assert.notEqual(valid, trip);
  assert.equal(valid.segments[1].endDate, '2026-09-25');
});

test('adding the next destination starts one calendar day after the previous final date', () => {
  const trip = sampleTrip();
  trip.originDetails.departureDate = '2026-12-20';
  trip.segments = [
    {
      ...trip.segments[0],
      startDate: '2026-12-29',
      endDate: '2026-12-31',
      destination: {
        id: 'berlin',
        name: 'Berlin',
        countryCode: 'DE',
        lat: 52.52,
        lon: 13.405,
      },
    },
  ];

  const added = tripReducer(trip, { type: TRIP_ACTIONS.addSegment });
  const next = added.segments[1];

  assert.equal(next.startDate, '2027-01-01');
  assert.equal(Object.hasOwn(next, 'origin'), false);
  const projectedNext = itineraryMapProjection(added.origin, added.segments)[1];
  assert.equal(projectedNext.origin.id, trip.segments[0].destination.id);
  assert.equal(projectedNext.origin.name, trip.segments[0].destination.name);
  assert.equal(projectedNext.origin.countryCode, 'DE');
  assert.equal(projectedNext.origin.lat, 52.52);
  assert.equal(projectedNext.origin.lon, 13.405);
  assert.equal(next.endDate, '');

  const withoutPreviousEnd = {
    ...trip,
    segments: [{ ...trip.segments[0], startDate: '2026-12-29', endDate: '' }],
  };
  const fallback = tripReducer(withoutPreviousEnd, { type: TRIP_ACTIONS.addSegment });
  assert.equal(fallback.segments[1].startDate, '2026-12-29');
});

test('reordering a dated segment keeps the valid boundary and clears only the conflicting date', () => {
  const trip = sampleTrip();
  trip.originDetails.departureDate = '2026-09-01';
  trip.segments = [
    { ...trip.segments[0], id: 'a', startDate: '2026-09-02', endDate: '2026-09-05' },
    { ...trip.segments[0], id: 'moved', startDate: '2026-09-05', endDate: '2026-09-07' },
    { ...trip.segments[1], id: 'b', startDate: '2026-09-07', endDate: '2026-09-07' },
  ];

  const reordered = tripReducer(trip, {
    type: TRIP_ACTIONS.reorderSegment,
    sourceId: 'moved',
    targetId: 'b',
    placement: 'after',
  });

  assert.deepEqual(reordered.segments.map(({ id }) => id), ['a', 'b', 'moved']);
  assert.equal(reordered.segments[0].startDate, '2026-09-02');
  assert.equal(reordered.segments[0].endDate, '2026-09-05');
  assert.equal(reordered.segments[1].startDate, '2026-09-07');
  assert.equal(reordered.segments[1].endDate, '2026-09-07');
  assert.equal(reordered.segments[2].startDate, '');
  assert.equal(reordered.segments[2].endDate, '2026-09-07');
});

test('reordering cannot leave a stale date that deadlocks the moved segment calendar', () => {
  const trip = sampleTrip();
  trip.originDetails.departureDate = '2026-09-01';
  trip.segments = [
    { ...trip.segments[0], id: 'a', startDate: '2026-09-02', endDate: '2026-09-03' },
    { ...trip.segments[0], id: 'moved', startDate: '', endDate: '2026-09-04' },
    { ...trip.segments[1], id: 'b', startDate: '2026-09-05', endDate: '2026-09-06' },
  ];

  const reordered = tripReducer(trip, {
    type: TRIP_ACTIONS.reorderSegment,
    sourceId: 'moved',
    targetId: 'b',
    placement: 'after',
  });
  const moved = reordered.segments[2];

  assert.deepEqual(reordered.segments.map(({ id }) => id), ['a', 'b', 'moved']);
  assert.equal(moved.startDate, '');
  assert.equal(moved.endDate, '');
  assert.deepEqual(
    validateSegmentDatePatch(reordered, 'moved', {
      startDate: '2026-09-06',
      endDate: '2026-09-07',
    }),
    { valid: true, errorKey: '' }
  );
});

test('reordering across undated legs preserves dates that still fit the itinerary chronology', () => {
  const trip = sampleTrip();
  trip.originDetails.departureDate = '2026-09-01';
  trip.segments = [
    { ...trip.segments[0], id: 'a', startDate: '2026-09-02', endDate: '2026-09-03' },
    { ...trip.segments[0], id: 'moved', startDate: '2026-09-05', endDate: '2026-09-06' },
    { ...trip.segments[1], id: 'undated', startDate: '', endDate: '' },
  ];

  const reordered = tripReducer(trip, {
    type: TRIP_ACTIONS.reorderSegment,
    sourceId: 'moved',
    targetId: 'undated',
    placement: 'after',
  });
  const moved = reordered.segments[2];

  assert.deepEqual(reordered.segments.map(({ id }) => id), ['a', 'undated', 'moved']);
  assert.equal(moved.startDate, '2026-09-05');
  assert.equal(moved.endDate, '2026-09-06');
});

test('headline text and selected cities are true black without changing active option accents', async () => {
  const navigation = await read('src/app/TripHeaderNavigation.css');
  const typography = await read('src/app/TripSummaryHeaderTypography.css');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const header = await read('src/app/TripSummaryHeader.css');

  assert.match(navigation, /\.trip-summary__primary-nav-label\s*\{[^}]*color:\s*#000000;/s);
  assert.match(typography, /\.trip-summary__metric-value,[\s\S]*\.trip-summary__selector-trigger\s*\{[^}]*color:\s*#000000;/s);
  assert.match(compact, /autocomplete__selected-value,[\s\S]*autocomplete__selected-value\s*\{[^}]*color:\s*#000000;/s);
  assert.match(header, /\.trip-summary__selector-option\.is-active \.trip-summary__selector-code,[\s\S]*color:\s*#0e6f8c;/s);
});

test('la edición global de fechas impide rangos invertidos desde UI y reducer', async () => {
  const header = await read('src/app/TripSummaryHeader.jsx');
  const reducer = await read('src/modules/trips/tripReducer.js');
  const es = await read('src/i18n/es.js');
  const en = await read('src/i18n/en.js');

  assert.match(header, /value=\{trip\.startDate \|\| ''\}[\s\S]*max=\{trip\.endDate \|\| undefined\}/);
  assert.match(header, /value=\{trip\.endDate \|\| ''\}[\s\S]*min=\{trip\.startDate \|\| undefined\}/);
  assert.match(header, /updateTripDates\?\.\(\{ startDate \}\)/);
  assert.match(header, /updateTripDates\?\.\(\{ endDate \}\)/);
  assert.match(reducer, /case TRIP_ACTIONS\.updateTripDates:[\s\S]*startDate && endDate && startDate > endDate\) return state/);
  assert.match(es, /startDate:/);
  assert.match(es, /endDate:/);
  assert.match(en, /startDate:/);
  assert.match(en, /endDate:/);
});
