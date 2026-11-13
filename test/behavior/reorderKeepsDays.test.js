import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderSegments } from '../../src/modules/trips/tripModel.js';
import { groupPlacesByItineraryDay } from '../../src/modules/trips/globalTripDayPlanning.js';

const city = (name) => ({ name, countryCode: '', lat: 1, lon: 1 });

function sampleTrip() {
  return {
    origin: city('Ciudad de México'),
    segments: [
      { id: 'par', destination: city('París'), startDate: '2026-11-13', endDate: '2026-11-15' },
      { id: 'rom', destination: city('Roma'), startDate: '2026-11-15', endDate: '2026-11-16' },
      { id: 'ams', destination: city('Ámsterdam'), startDate: '2026-11-16', endDate: '2026-11-18' },
    ],
    places: [
      { id: 'nd', name: 'Notre Dame', segmentId: 'par', dayOffset: 0 },
      { id: 'ory', name: 'Orly', segmentId: 'par', dayOffset: 1 },
      { id: 'gdn', name: 'Gare du Nord', segmentId: 'par', dayOffset: 2 },
    ],
  };
}

test('mover una ciudad con lugares conserva sus noches, sus días y sus lugares', () => {
  const moved = reorderSegments(sampleTrip(), 'par', 'rom', 'after');
  assert.deepEqual(moved.segments.map((s) => s.id), ['rom', 'par', 'ams']);
  assert.deepEqual(moved.segments.map((s) => [s.startDate, s.endDate]), [
    ['2026-11-13', '2026-11-14'],
    ['2026-11-14', '2026-11-16'],
    ['2026-11-16', '2026-11-18'],
  ]);
  const { unassigned } = groupPlacesByItineraryDay(moved.places, moved.segments);
  assert.equal(unassigned.length, 0);
});

test('mover al final mantiene el primer día del viaje y las duraciones', () => {
  const moved = reorderSegments(sampleTrip(), 'par', 'ams', 'after');
  assert.deepEqual(moved.segments.map((s) => [s.id, s.startDate, s.endDate]), [
    ['rom', '2026-11-13', '2026-11-14'],
    ['ams', '2026-11-14', '2026-11-16'],
    ['par', '2026-11-16', '2026-11-18'],
  ]);
  assert.equal(groupPlacesByItineraryDay(moved.places, moved.segments).unassigned.length, 0);
});

test('respeta viajes que empiezan la siguiente ciudad al día siguiente', () => {
  const trip = sampleTrip();
  trip.segments = [
    { id: 'par', destination: city('París'), startDate: '2026-11-13', endDate: '2026-11-15' },
    { id: 'rom', destination: city('Roma'), startDate: '2026-11-16', endDate: '2026-11-17' },
  ];
  const moved = reorderSegments(trip, 'par', 'rom', 'after');
  assert.deepEqual(moved.segments.map((s) => [s.id, s.startDate, s.endDate]), [
    ['rom', '2026-11-13', '2026-11-14'],
    ['par', '2026-11-15', '2026-11-17'],
  ]);
});

test('una ciudad sin salida conserva la duración que le daba la siguiente ciudad', () => {
  const trip = sampleTrip();
  trip.segments[0] = { ...trip.segments[0], endDate: '' };
  const moved = reorderSegments(trip, 'par', 'ams', 'after');
  const paris = moved.segments.find((s) => s.id === 'par');
  assert.equal(paris.startDate, '2026-11-16');
  assert.equal(paris.endDate, '2026-11-18');
  assert.equal(groupPlacesByItineraryDay(moved.places, moved.segments).unassigned.length, 0);
});
