// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tripDateRange,
  tripDestinationCount,
  tripSummary,
  tripTotalDistanceKm,
  tripTotalNights,
} from '../../src/modules/trips/tripSummaryModel.js';

const paris = { id: 'paris', name: 'Paris', lat: 48.8566, lon: 2.3522 };
const brussels = { id: 'brussels', name: 'Brussels', lat: 50.8503, lon: 4.3517 };
const amsterdam = { id: 'amsterdam', name: 'Amsterdam', lat: 52.3676, lon: 4.9041 };

const segments = [
  {
    origin: paris,
    destination: brussels,
    startDate: '2026-08-20',
    endDate: '2026-08-23',
  },
  {
    origin: brussels,
    destination: amsterdam,
    startDate: '2026-08-23',
    endDate: '2026-08-27',
  },
];

test('resume rango global y suma noches sin depender del JSX', () => {
  assert.deepEqual(tripDateRange(segments), {
    startDate: '2026-08-20',
    endDate: '2026-08-27',
  });
  assert.equal(tripTotalNights(segments), 7);
});

test('cuenta ciudades únicas de la cadena como destinos del viaje', () => {
  assert.equal(tripDestinationCount(segments), 3);
  assert.equal(tripDestinationCount([...segments, { origin: amsterdam, destination: paris }]), 3);
  assert.equal(tripDestinationCount([{ origin: {}, destination: null }]), 0);
});

test('calcula distancia geodésica local sin datos de proveedor', () => {
  const distance = tripTotalDistanceKm(segments);
  assert.ok(distance > 400);
  assert.ok(distance < 500);
});

test('ignora fechas inválidas, tramos invertidos y coordenadas incompletas', () => {
  const invalid = [
    { startDate: 'bad', endDate: '2026-08-10', origin: { lat: null, lon: 0 }, destination: paris },
    { startDate: '2026-08-12', endDate: '2026-08-11', origin: paris, destination: null },
  ];
  assert.equal(tripTotalNights(invalid), 0);
  assert.equal(tripTotalDistanceKm(invalid), 0);
  assert.deepEqual(tripDateRange(invalid), {
    startDate: '2026-08-10',
    endDate: '2026-08-12',
  });
});

test('tripSummary compone las métricas en una sola pasada conceptual', () => {
  const summary = tripSummary({ segments });
  assert.equal(summary.destinations, 3);
  assert.equal(summary.nights, 7);
  assert.equal(summary.startDate, '2026-08-20');
  assert.equal(summary.endDate, '2026-08-27');
  assert.ok(summary.distanceKm > 400);
});
