// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { tripSummary, tripTotalNights } from '../src/modules/trips/tripSummaryModel.js';
import { tripBoundaryDates } from '../src/modules/trips/tripDateRules.js';

test('cada fecha de noche cuenta una sola vez aunque varios tramos coincidan', () => {
  const segments = [
    { startDate: '2026-12-04', endDate: '2026-12-05' },
    { startDate: '2026-12-05' },
    { startDate: '2026-12-05', endDate: '2026-12-06' },
  ];

  assert.equal(tripTotalNights(segments), 2);
});

test('un tramo con sólo fecha de inicio cuenta una noche en la utilidad por tramos', () => {
  assert.equal(tripTotalNights([{ startDate: '2026-12-13' }]), 1);
});

test('el header cuenta las noches globales entre origen y ciudad final', () => {
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

  // La utilidad por tramos conserva su contrato histórico: 11 noches explícitas.
  assert.equal(tripTotalNights(segments), 11);
  // El header usa los límites globales del viaje: excluye 30 nov y 13 dic.
  assert.equal(tripTotalNights(trip), 12);
  assert.equal(tripSummary(trip).nights, 12);
});

test('sin fecha de origen la primera fecha del itinerario sí cuenta como noche', () => {
  const trip = {
    originDetails: { departureDate: '' },
    segments: [
      { startDate: '2026-12-01' },
      { startDate: '2026-12-13' },
    ],
  };

  assert.equal(tripTotalNights(trip), 12);
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
