// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { tripTotalNights } from '../src/modules/trips/tripSummaryModel.js';
import { tripBoundaryDates } from '../src/modules/trips/tripDateRules.js';

test('cada fecha de noche cuenta una sola vez aunque varios tramos coincidan', () => {
  const segments = [
    { startDate: '2026-12-04', endDate: '2026-12-05' },
    { startDate: '2026-12-05' },
    { startDate: '2026-12-05', endDate: '2026-12-06' },
  ];

  assert.equal(tripTotalNights(segments), 2);
});

test('un tramo con sólo fecha de inicio cuenta una noche', () => {
  assert.equal(tripTotalNights([{ startDate: '2026-12-13' }]), 1);
});

test('el caso reportado termina en Madrid el 13 y cuenta cada noche sólo una vez', () => {
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
  assert.equal(tripTotalNights(segments), 11);
});

test('el último tramo con sólo inicio define el final del viaje', () => {
  const trip = {
    originDetails: { departureDate: '2026-11-30' },
    segments: [
      { startDate: '2026-12-10', endDate: '2026-12-11' },
      { startDate: '2026-12-13' },
    ],
  };

  assert.equal(tripBoundaryDates(trip).endDate, '2026-12-13');
});
