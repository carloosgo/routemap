// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  groupPlacesByItineraryDay,
  itineraryAssignmentsByDay,
  itineraryCalendarDays,
  placeTripDayOffset,
  reorderItineraryDayContents,
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

test('tripDayOffset mueve la visita temporal sin cambiar la ciudad propietaria', () => {
  const itinerarySegments = segments();
  const moved = place('museum', 'de', 0, { tripDayOffset: 4 });

  assert.equal(placeTripDayOffset(moved, itinerarySegments), 4);
  assert.equal(moved.segmentId, 'de');
  assert.equal(moved.dayOffset, 0);
});

test('lugares heredados se proyectan a su fecha de Itinerario y no quedan Por organizar', () => {
  const itinerarySegments = segments();
  const places = [
    place('legacy-de', 'de', 1),
    place('legacy-fr', 'fr', 0),
    place('without-assignment', '', null),
  ];
  const grouped = groupPlacesByItineraryDay(places, itinerarySegments);

  assert.deepEqual(grouped.groups[1].places.map(({ id }) => id), ['legacy-de']);
  assert.deepEqual(grouped.groups[2].places.map(({ id }) => id), ['legacy-fr']);
  assert.deepEqual(grouped.groups[0].places.map(({ id }) => id), ['without-assignment']);
  assert.deepEqual(grouped.unassigned, []);
});

test('reordenar un día mueve contenido entre slots cronológicos conservando ciudad y día local', () => {
  const itinerarySegments = segments();
  const original = [
    place('day-1', 'de', 0),
    place('day-2', 'de', 1),
    place('day-4', 'fr', 1),
  ];
  const reordered = reorderItineraryDayContents(original, itinerarySegments, 0, 3, 'after');

  const first = reordered.find(({ id }) => id === 'day-1');
  const second = reordered.find(({ id }) => id === 'day-2');
  const fourth = reordered.find(({ id }) => id === 'day-4');
  assert.equal(first.tripDayOffset, 3);
  assert.equal(first.segmentId, 'de');
  assert.equal(first.dayOffset, 0);
  assert.equal(second.tripDayOffset, 0);
  assert.equal(fourth.tripDayOffset, 2);
});

test('las rutas usan día global resuelto y no exigen la misma ciudad', () => {
  const itinerarySegments = segments();
  const german = place('german', 'de', 0);
  const frenchOnDayOne = place('french', 'fr', 0, { tripDayOffset: 0 });
  const frenchOwnDay = place('french-own', 'fr', 0);

  assert.equal(sameItineraryDay(german, frenchOnDayOne, itinerarySegments), true);
  assert.equal(sameItineraryDay(german, frenchOwnDay, itinerarySegments), false);
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
