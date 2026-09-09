import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpenses } from '../src/modules/expenses/expenseModel.js';
import { normalizeTrip } from '../src/modules/trips/tripModel.js';
import {
  groupPlacesByPlanningDay,
  tripCalendarDays,
  tripPlanningDays,
} from '../src/modules/trips/tripDayPlanning.js';
import { planTripDayRemoval } from '../src/modules/trips/tripDayRemoval.js';
import { planV4TripSave } from '../src/infrastructure/firebase/v4TripSavePlan.js';
import { v4TripMetadataPatch } from '../src/infrastructure/firebase/v4TripDocument.js';
import { upsertPendingMutation } from '../src/modules/storage-v4/pendingMutationModel.js';

function city(id, name, countryCode, lat, lon) {
  return {
    id,
    name,
    displayName: name,
    country: countryCode,
    countryCode,
    lat,
    lon,
  };
}

function segment(id, destination, startDate = '', endDate = '') {
  return {
    id,
    destination,
    startDate,
    endDate,
    expenses: createExpenses(),
    note: '',
  };
}

function rootTrip(overrides = {}) {
  return {
    id: 'trip-global-days',
    name: 'Europa',
    currency: 'EUR',
    startDate: '2026-09-09',
    endDate: '2026-09-12',
    origin: null,
    originDetails: {
      departureDate: '',
      expenses: createExpenses(),
      note: '',
    },
    segments: [],
    places: [],
    routeConnections: [],
    notes: [],
    checklist: [],
    placeOrderVersion: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

test('normalizeTrip conserva rango global explícito y deriva el rango para roots v4 anteriores', () => {
  const madrid = city('madrid', 'Madrid', 'ES', 40.4168, -3.7038);
  const paris = city('paris', 'París', 'FR', 48.8566, 2.3522);
  const segments = [
    segment('madrid-segment', madrid, '2026-09-10', '2026-09-11'),
    segment('paris-segment', paris, '2026-09-12', '2026-09-14'),
  ];

  const legacy = normalizeTrip(rootTrip({ startDate: undefined, endDate: undefined, segments }));
  assert.equal(legacy.startDate, '2026-09-10');
  assert.equal(legacy.endDate, '2026-09-14');

  const explicit = normalizeTrip(rootTrip({
    startDate: '2026-09-09',
    endDate: '2026-09-18',
    segments,
  }));
  assert.equal(explicit.startDate, '2026-09-09');
  assert.equal(explicit.endDate, '2026-09-18');
});

test('el calendario global conserva todos los días aunque alguno no tenga ciudad', () => {
  const trip = rootTrip({ startDate: '2026-09-09', endDate: '2026-09-12' });
  assert.deepEqual(tripCalendarDays(trip), [
    { date: '2026-09-09', globalDayNumber: 1, tripDayOffset: 0 },
    { date: '2026-09-10', globalDayNumber: 2, tripDayOffset: 1 },
    { date: '2026-09-11', globalDayNumber: 3, tripDayOffset: 2 },
    { date: '2026-09-12', globalDayNumber: 4, tripDayOffset: 3 },
  ]);
});

test('dos ciudades pueden compartir el mismo día global sin reiniciar la numeración', () => {
  const madrid = city('madrid', 'Madrid', 'ES', 40.4168, -3.7038);
  const paris = city('paris', 'París', 'FR', 48.8566, 2.3522);
  const trip = rootTrip({
    segments: [
      segment('madrid-segment', madrid, '2026-09-09', '2026-09-10'),
      segment('paris-segment', paris, '2026-09-10', '2026-09-11'),
    ],
  });

  const days = tripPlanningDays(trip);
  const september10 = days.filter(({ date }) => date === '2026-09-10');
  assert.equal(september10.length, 2);
  assert.deepEqual(
    september10.map(({ segmentId, globalDayNumber }) => [segmentId, globalDayNumber]),
    [['madrid-segment', 2], ['paris-segment', 2]]
  );
});

test('una ciudad sin fechas puede proyectarse sin mutar ni persistir fechas artificiales', () => {
  const rome = city('rome', 'Roma', 'IT', 41.9028, 12.4964);
  const undated = segment('rome-segment', rome);
  const trip = rootTrip({ segments: [undated] });

  const days = tripPlanningDays(trip);
  assert.equal(days.length, 1);
  assert.equal(days[0].segmentId, 'rome-segment');
  assert.equal(days[0].globalDayNumber, 1);
  assert.equal(days[0].provisional, true);
  assert.equal(undated.startDate, '');
  assert.equal(undated.endDate, '');
});

test('los lugares mantienen segmentId+dayOffset y se proyectan al día global correcto', () => {
  const paris = city('paris', 'París', 'FR', 48.8566, 2.3522);
  const trip = rootTrip({
    segments: [segment('paris-segment', paris, '2026-09-10', '2026-09-11')],
  });
  const places = [
    { id: 'louvre', segmentId: 'paris-segment', dayOffset: 0 },
    { id: 'orsay', segmentId: 'paris-segment', dayOffset: 1 },
  ];

  const planned = groupPlacesByPlanningDay(places, trip);
  assert.deepEqual(
    planned.groups.map(({ globalDayNumber, places: groupPlaces }) => [
      globalDayNumber,
      groupPlaces.map(({ id }) => id),
    ]),
    [[2, ['louvre']], [3, ['orsay']]]
  );
  assert.equal(planned.unassigned.length, 0);
});

test('eliminar un día intermedio colapsa el itinerario sin crear entidades día', () => {
  const paris = city('paris', 'París', 'FR', 48.8566, 2.3522);
  const rome = city('rome', 'Roma', 'IT', 41.9028, 12.4964);
  const trip = rootTrip({
    startDate: '2026-09-09',
    endDate: '2026-09-12',
    segments: [
      segment('paris-segment', paris, '2026-09-09', '2026-09-11'),
      segment('rome-segment', rome, '2026-09-12', '2026-09-12'),
    ],
    places: [
      { id: 'day-1', segmentId: 'paris-segment', dayOffset: 0 },
      { id: 'day-2', segmentId: 'paris-segment', dayOffset: 1 },
      { id: 'day-3', segmentId: 'paris-segment', dayOffset: 2 },
    ],
  });

  const plan = planTripDayRemoval(trip, '2026-09-10');
  assert.deepEqual(plan.removePlaceIds, ['day-2']);
  assert.deepEqual(plan.movePlaces, [
    { placeId: 'day-3', tripDayOffset: 1 },
  ]);
  assert.deepEqual(plan.segmentPatches, [
    { segmentId: 'paris-segment', patch: { tripDayOffsets: [0, 1] } },
    { segmentId: 'rome-segment', patch: { tripDayOffsets: [2] } },
  ]);
  assert.deepEqual(plan.tripDatePatch, { endDate: '2026-09-11' });
});

test('eliminar el único día limpia el rango y las fechas del segmento de ese día', () => {
  const tokyo = city('tokyo', 'Tokio', 'JP', 35.6762, 139.6503);
  const trip = rootTrip({
    startDate: '2026-09-09',
    endDate: '2026-09-09',
    segments: [segment('tokyo-segment', tokyo, '2026-09-09', '2026-09-09')],
    places: [{ id: 'sensoji', segmentId: 'tokyo-segment', dayOffset: 0 }],
  });

  const plan = planTripDayRemoval(trip, '2026-09-09');
  assert.deepEqual(plan.removePlaceIds, ['sensoji']);
  assert.deepEqual(plan.movePlaces, []);
  assert.deepEqual(plan.segmentPatches, [
    { segmentId: 'tokyo-segment', patch: { startDate: '', endDate: '', tripDayOffsets: [] } },
  ]);
  assert.deepEqual(plan.tripDatePatch, { startDate: '', endDate: '' });
});

test('cambiar sólo startDate genera un intent root granular sin tocar hijos ni otros metadatos', () => {
  const desired = rootTrip({ startDate: '2026-09-10' });
  const remoteRoot = {
    id: desired.id,
    name: desired.name,
    currency: desired.currency,
    startDate: '2026-09-09',
    endDate: desired.endDate,
    origin: desired.origin,
    originDetails: desired.originDetails,
    schemaVersion: 4,
    status: 'active',
    version: 7,
  };

  const plan = planV4TripSave({ uid: 'alice', rawTrip: desired, remoteRoot });
  assert.deepEqual(plan.rootIntent.fieldMask, ['startDate']);
  assert.equal(plan.childIntents.length, 0);

  const timestamp = Symbol('server-timestamp');
  const patch = v4TripMetadataPatch(desired, 7, timestamp, plan.rootIntent.fieldMask);
  assert.deepEqual(Object.keys(patch).sort(), ['startDate', 'updatedAt', 'version']);
  assert.equal(patch.startDate, '2026-09-10');
  assert.equal(patch.version, 8);
  assert.equal(patch.updatedAt, timestamp);
});

test('la cola durable fusiona máscaras de cambios rápidos sobre el mismo root', () => {
  const baseIntent = {
    userId: 'alice',
    tripId: 'trip-global-days',
    entityType: 'trip',
    entityId: 'trip-global-days',
    baseVersion: 4,
    baseStatus: 'active',
    desiredStatus: 'active',
    localRevision: 1,
    payload: { id: 'trip-global-days', startDate: '2026-09-10', endDate: '2026-09-12' },
    fieldMask: ['startDate'],
  };
  const first = upsertPendingMutation({ intent: baseIntent, nowMs: 100 });
  const second = upsertPendingMutation({
    previous: first,
    intent: {
      ...baseIntent,
      localRevision: 2,
      payload: { ...baseIntent.payload, endDate: '2026-09-13' },
      fieldMask: ['endDate'],
    },
    nowMs: 200,
  });

  assert.deepEqual(second.fieldMask, ['endDate', 'startDate']);
  assert.equal(second.baseVersion, 4);
  assert.equal(second.localRevision, 2);
  assert.equal(second.payload.endDate, '2026-09-13');
});
