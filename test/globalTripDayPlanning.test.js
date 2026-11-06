// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupPlacesByItineraryDay,
  itineraryAssignmentsByDay,
  itineraryCalendarDays,
  migrateLegacyTripDayOffset,
  placeTripDayOffset,
  planningTargetForTripDay,
  sameItineraryDay,
} from '../src/modules/trips/globalTripDayPlanning.js';
import { createPlace, createSegment } from '../src/modules/trips/tripModel.js';

function city(id, name, country, countryCode, lat, lon) {
  return { id, name, displayName: `${name}, ${country}`, country, countryCode, lat, lon };
}

const frankfurt = city('frankfurt', 'Frankfurt am Main', 'Germany', 'DE', 50.1109, 8.6821);
const paris = city('paris', 'Paris', 'France', 'FR', 48.8566, 2.3522);

function segments() {
  return [
    createSegment({
      id: 'de',
      destination: frankfurt,
      startDate: '2026-11-30',
      endDate: '2026-12-02',
    }),
    createSegment({
      id: 'fr',
      destination: paris,
      startDate: '2026-12-02',
      endDate: '2026-12-04',
    }),
  ];
}

function place(id, segmentId, dayOffset, extra = {}) {
  return createPlace({
    id,
    name: id,
    lat: 50,
    lon: 8,
    segmentId,
    dayOffset,
    ...extra,
  });
}

test('Mis Rutas deriva un único calendario global continuo de las fechas de Itinerario', () => {
  assert.deepEqual(
    itineraryCalendarDays(segments()),
    [
      { tripDayOffset: 0, globalDayNumber: 1, date: '2026-11-30' },
      { tripDayOffset: 1, globalDayNumber: 2, date: '2026-12-01' },
      { tripDayOffset: 2, globalDayNumber: 3, date: '2026-12-02' },
      { tripDayOffset: 3, globalDayNumber: 4, date: '2026-12-03' },
      { tripDayOffset: 4, globalDayNumber: 5, date: '2026-12-04' },
    ]
  );
});

test('dos ciudades pueden pertenecer al mismo día global sin crear otra sección por ciudad', () => {
  const assignments = itineraryAssignmentsByDay(segments()).get(2);
  assert.deepEqual(assignments.map(({ segmentId }) => segmentId), ['de', 'fr']);
});

test('el día del viaje se deriva solo de la estancia y su día local', () => {
  const itinerarySegments = segments();
  const legacy = place('museum', 'de', 0, { tripDayOffset: 4 });

  assert.equal(placeTripDayOffset(legacy, itinerarySegments), 0);
  assert.equal(placeTripDayOffset(place('paris-2', 'fr', 1), itinerarySegments), 3);
});

test('lugares sin estancia o fuera de su rango quedan Por organizar', () => {
  const itinerarySegments = segments();
  const places = [
    place('legacy-de', 'de', 1),
    place('legacy-fr', 'fr', 0),
    place('without-assignment', '', null),
    place('out-of-range', 'fr', 9),
  ];
  const grouped = groupPlacesByItineraryDay(places, itinerarySegments);

  assert.deepEqual(grouped.groups[1].places.map(({ id }) => id), ['legacy-de']);
  assert.deepEqual(grouped.groups[2].places.map(({ id }) => id), ['legacy-fr']);
  assert.deepEqual(grouped.groups[0].places, []);
  assert.deepEqual(grouped.unassigned.map(({ id }) => id), ['without-assignment', 'out-of-range']);
});

test('en un día de traslado se elige la ciudad del lugar y, si no coincide, la de llegada', () => {
  const itinerarySegments = segments();
  const parisian = place('louvre', 'de', 0, { city: 'Paris', countryCode: 'FR' });
  const generic = place('generic', 'de', 0);
  const unknown = place('unknown', '', null);

  assert.deepEqual(planningTargetForTripDay(parisian, itinerarySegments, 2), { segmentId: 'fr', dayOffset: 0 });
  assert.deepEqual(planningTargetForTripDay(generic, itinerarySegments, 2), { segmentId: 'de', dayOffset: 2 });
  assert.deepEqual(planningTargetForTripDay(unknown, itinerarySegments, 2), { segmentId: 'fr', dayOffset: 0 });
  assert.equal(planningTargetForTripDay(generic, itinerarySegments, 9), null);
});

test('la migración del antiguo tripDayOffset deja una sola referencia', () => {
  const migrated = migrateLegacyTripDayOffset(place('museum', 'de', 0, { tripDayOffset: 4 }), segments());

  assert.equal(migrated.segmentId, 'fr');
  assert.equal(migrated.dayOffset, 2);
  assert.equal(migrated.tripDayOffset, null);
});

test('las rutas usan el día resuelto y no exigen la misma ciudad', () => {
  const itinerarySegments = segments();
  const germanTransferDay = place('german', 'de', 2);
  const frenchArrival = place('french', 'fr', 0);
  const frenchNextDay = place('french-own', 'fr', 1);

  assert.equal(sameItineraryDay(germanTransferDay, frenchArrival, itinerarySegments), true);
  assert.equal(sameItineraryDay(germanTransferDay, frenchNextDay, itinerarySegments), false);
});

test('el calendario usa fechas civiles sin deriva de DST ni cambio de mes', () => {
  const calendar = itineraryCalendarDays([
    createSegment({
      id: 'dst',
      destination: frankfurt,
      startDate: '2026-10-24',
      endDate: '2026-11-02',
    }),
  ]);

  assert.equal(calendar.length, 10);
  assert.equal(calendar[0].date, '2026-10-24');
  assert.equal(calendar[8].date, '2026-11-01');
  assert.equal(calendar[9].date, '2026-11-02');
});
