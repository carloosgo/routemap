import test from 'node:test';
import assert from 'node:assert/strict';
import { tripTotalNights } from '../src/modules/trips/tripSummaryModel.js';
import { tripBoundaryDates } from '../src/modules/trips/tripDateRules.js';

test('cada fecha ocupada cuenta una sola noche aunque varios tramos coincidan', () => {
  const segments = [
    { startDate: '2026-12-04', endDate: '2026-12-05' },
    { startDate: '2026-12-05' },
    { startDate: '2026-12-05', endDate: '2026-12-06' },
  ];

  assert.equal(tripTotalNights(segments), 3);
});

test('un tramo con sólo fecha de inicio cuenta una noche', () => {
  assert.equal(tripTotalNights([{ startDate: '2026-12-13' }]), 1);
});

test('el resumen del caso del itinerario cubre 1-13 dic y termina en Madrid el 13', () => {
  const segments = [
    { startDate: '2026-12-01' },
    { startDate: '2026-12-02' },
    { startDate: '2026-12-03' },
    { startDate: '2026-12-04', endDate: '2026-12-05' },
    { startDate: '2026-12-06' },
    { startDate: '2026-12-06', endDate: '2026-12-07' },
    { startDate: '2026-12-08' },
    { startDate: '2026-12-09' },
    { startDate: '2026-12-09' },
    { startDate: '2026-12-09' },
    { startDate: '2026-12-10' },
    { startDate: '2026-12-10' },
    { startDate: '2026-12-10' },
    { startDate: '2026-12-11' },
    { startDate: '2026-12-12' },
    { startDate: '2026-12-13' },
  ];
  const trip = {
    originDetails: { departureDate: '2026-11-30' },
    segments,
  };

  assert.deepEqual(tripBoundaryDates(trip), {
    startDate: '2026-11-30',
    endDate: '2026-12-13',
  });
  assert.equal(tripTotalNights(segments), 13);
});

test('la última fecha se calcula por valor y no por posición del tramo', () => {
  const trip = {
    originDetails: { departureDate: '2026-11-30' },
    segments: [
      { startDate: '2026-12-13' },
      { startDate: '2026-12-10', endDate: '2026-12-11' },
    ],
  };

  assert.equal(tripBoundaryDates(trip).endDate, '2026-12-13');
});
