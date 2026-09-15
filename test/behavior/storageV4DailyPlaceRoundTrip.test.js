import test from 'node:test';
import assert from 'node:assert/strict';

import { createExpenses } from '../../src/modules/expenses/expenseModel.js';
import { planV4TripSave } from '../../src/infrastructure/firebase/v4TripSavePlan.js';
import { hydrateV4Trip } from '../../src/infrastructure/firebase/v4TripHydration.js';

function segment() {
  return {
    id: 'segment-reykjavik',
    destination: {
      id: 'reykjavik',
      name: 'Reykjavik',
      displayName: 'Reykjavik, Iceland',
      country: 'Iceland',
      countryCode: 'IS',
      lat: 64.1466,
      lon: -21.9426,
    },
    startDate: '2026-09-02',
    endDate: '2026-09-04',
    expenses: createExpenses(),
    note: '',
  };
}

function trip() {
  return {
    id: 'trip-1',
    name: 'Islandia',
    currency: 'EUR',
    origin: null,
    originDetails: {
      departureDate: '',
      expenses: createExpenses(),
      note: '',
    },
    segments: [segment()],
    places: [
      {
        id: 'geo-place',
        provider: 'geoapify',
        name: 'Hallgrímskirkja',
        address: 'Hallgrímstorg 1',
        city: 'Reykjavik',
        country: 'Iceland',
        countryCode: 'IS',
        category: 'tourism',
        lat: 64.1417,
        lon: -21.9266,
        segmentId: 'segment-reykjavik',
        dayOffset: 0,
        note: 'Primera visita del día',
      },
      {
        id: 'google-place',
        provider: 'google',
        googlePlaceId: 'ChIJ-example',
        name: 'Transient Google name',
        address: 'Transient Google address',
        city: 'Reykjavik',
        country: 'Iceland',
        countryCode: 'IS',
        category: 'restaurant',
        lat: 64.15,
        lon: -21.94,
        segmentId: 'segment-reykjavik',
        dayOffset: 2,
        note: 'Cena del último día',
      },
    ],
    routeConnections: [],
    placeOrderVersion: 1,
    notes: [],
    checklist: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

test('Storage v4 persiste y rehidrata la asignación ciudad+día y la nota de cada lugar', () => {
  const plan = planV4TripSave({ uid: 'alice', rawTrip: trip() });
  const placeIntents = plan.childIntents.filter(({ entityType }) => entityType === 'place');
  assert.equal(placeIntents.length, 2);

  const geo = placeIntents.find(({ entityId }) => entityId === 'geo-place').payload;
  assert.equal(geo.segmentId, 'segment-reykjavik');
  assert.equal(geo.dayOffset, 0);
  assert.equal(geo.note, 'Primera visita del día');

  const google = placeIntents.find(({ entityId }) => entityId === 'google-place').payload;
  assert.equal(google.segmentId, 'segment-reykjavik');
  assert.equal(google.dayOffset, 2);
  assert.equal(google.note, 'Cena del último día');
  assert.equal(google.name, '');
  assert.equal(google.address, '');
  assert.equal(google.lat, null);
  assert.equal(google.lon, null);

  const hydrated = hydrateV4Trip(
    {
      ...plan.rootIntent.payload,
      schemaVersion: 4,
      status: 'active',
      version: 1,
    },
    {
      segments: plan.childIntents
        .filter(({ entityType }) => entityType === 'segment')
        .map(({ payload }) => ({ ...payload, status: 'active' })),
      places: placeIntents.map(({ payload }) => ({ ...payload, status: 'active' })),
      connections: [],
      notes: [],
      checklist: [],
    }
  );

  const restoredGeo = hydrated.places.find(({ id }) => id === 'geo-place');
  const restoredGoogle = hydrated.places.find(({ id }) => id === 'google-place');
  assert.deepEqual(
    [restoredGeo.segmentId, restoredGeo.dayOffset, restoredGeo.note],
    ['segment-reykjavik', 0, 'Primera visita del día']
  );
  assert.deepEqual(
    [restoredGoogle.segmentId, restoredGoogle.dayOffset, restoredGoogle.note],
    ['segment-reykjavik', 2, 'Cena del último día']
  );
});
