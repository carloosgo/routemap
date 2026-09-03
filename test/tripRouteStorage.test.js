import test from 'node:test';
import assert from 'node:assert/strict';

import { v4EntityPayload } from '../src/infrastructure/firebase/v4EntityDocuments.js';
import { createPlace } from '../src/modules/trips/tripModel.js';

const RANK = '0000000001';

function route(overrides = {}) {
  return {
    id: 'route-storage-1',
    fromPlaceId: 'rome',
    toPlaceId: 'trevi',
    mode: 'walk',
    visible: true,
    distance: 1500,
    duration: 1200,
    geometry: {
      type: 'LineString',
      coordinates: [[12.4922, 41.8902], [12.4833, 41.9009]],
    },
    calculatedAt: '2026-08-06T20:00:00.000Z',
    ...overrides,
  };
}

test('Storage v4 persiste sólo el contrato durable de una conexión', () => {
  const stored = v4EntityPayload('connection', route(), RANK);

  assert.deepEqual(stored, {
    id: 'route-storage-1',
    rank: RANK,
    fromPlaceId: 'rome',
    toPlaceId: 'trevi',
    mode: 'walk',
    visible: true,
  });
  assert.equal(Object.hasOwn(stored, 'geometry'), false);
  assert.equal(Object.hasOwn(stored, 'distance'), false);
  assert.equal(Object.hasOwn(stored, 'duration'), false);
  assert.equal(Object.hasOwn(stored, 'calculatedAt'), false);
});

test('Storage v4 no persiste contenido dinámico devuelto por Google Routes', () => {
  const stored = v4EntityPayload('connection', route({
    provider: 'google',
    mode: 'train',
    transitSteps: [{
      lineShortName: 'ICE 1004',
      agencies: ['Deutsche Bahn'],
    }],
  }), RANK);

  assert.equal(stored.mode, 'train');
  assert.equal(Object.hasOwn(stored, 'geometry'), false);
  assert.equal(Object.hasOwn(stored, 'distance'), false);
  assert.equal(Object.hasOwn(stored, 'duration'), false);
  assert.equal(Object.hasOwn(stored, 'calculatedAt'), false);
  assert.equal(Object.hasOwn(stored, 'transitSteps'), false);
  assert.equal(Object.hasOwn(stored, 'provider'), false);
});

test('Storage v4 persiste sólo placeId y etiqueta del usuario para Google Places', () => {
  const place = createPlace({
    id: 'ChIJ-google-allianz',
    provider: 'google',
    googlePlaceId: 'ChIJ-google-allianz',
    userLabel: 'allianz arena munich',
    name: 'Allianz Arena',
    address: 'Werner-Heisenberg-Allee 25',
    city: 'München',
    country: 'Deutschland',
    countryCode: 'DE',
    category: 'stadium',
    lat: 48.2188,
    lon: 11.6247,
  });

  const stored = v4EntityPayload('place', place, RANK);
  assert.equal(stored.provider, 'google');
  assert.equal(stored.googlePlaceId, 'ChIJ-google-allianz');
  assert.equal(stored.userLabel, 'allianz arena munich');
  assert.equal(stored.name, '');
  assert.equal(stored.address, '');
  assert.equal(stored.city, '');
  assert.equal(stored.country, '');
  assert.equal(stored.countryCode, '');
  assert.equal(stored.category, '');
  assert.equal(stored.lat, null);
  assert.equal(stored.lon, null);
  assert.equal(stored.rank, RANK);
});
