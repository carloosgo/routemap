import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTripRevisionPayload,
  hydrateVersionedTrip,
  isVersionedTripSummary,
} from '../src/infrastructure/firebase/tripStorageSchema.js';
import { createPlace, createTrip } from '../src/modules/trips/tripModel.js';

function tripWithRoute(overrides = {}) {
  const trip = createTrip('Roma');
  return {
    ...trip,
    id: 'trip-route-storage',
    places: [
      createPlace({ id: 'rome', name: 'Coliseo', lat: 41.8902, lon: 12.4922 }),
      createPlace({ id: 'trevi', name: 'Fontana di Trevi', lat: 41.9009, lon: 12.4833 }),
    ],
    routeConnections: [{
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
    }],
  };
}

test('Firestore serializa la geometría heredada para evitar arrays anidados', () => {
  const payload = createTripRevisionPayload(tripWithRoute(), 'revision-route-001');
  const stored = payload.collections.routeConnections[0];

  assert.equal(payload.summary.storageVersion, 3);
  assert.equal(payload.summary.routeConnectionCount, 1);
  assert.equal(payload.revision.routeConnectionCount, 1);
  assert.equal(typeof stored.geometryJson, 'string');
  assert.equal(Object.hasOwn(stored, 'geometry'), false);
  assert.deepEqual(JSON.parse(stored.geometryJson), tripWithRoute().routeConnections[0].geometry);
});

test('hidratar la revisión reconstruye el GeoJSON de una conexión heredada', () => {
  const payload = createTripRevisionPayload(tripWithRoute(), 'revision-route-002');
  const hydrated = hydrateVersionedTrip(payload.summary, payload.collections);

  assert.equal(hydrated.routeConnections.length, 1);
  assert.equal(hydrated.routeConnections[0].mode, 'walk');
  assert.deepEqual(
    hydrated.routeConnections[0].geometry,
    tripWithRoute().routeConnections[0].geometry
  );
});

test('Firestore no persiste contenido dinámico devuelto por Google Routes', () => {
  const trip = tripWithRoute({
    provider: 'google',
    mode: 'train',
    transitSteps: [{
      lineShortName: 'ICE 1004',
      agencies: ['Deutsche Bahn'],
    }],
  });
  const payload = createTripRevisionPayload(trip, 'revision-route-google-001');
  const stored = payload.collections.routeConnections[0];

  assert.equal(stored.mode, 'train');
  assert.equal(stored.geometryJson, 'null');
  assert.equal(stored.distance, 0);
  assert.equal(stored.duration, 0);
  assert.equal(stored.calculatedAt, '');
  assert.equal(Object.hasOwn(stored, 'transitSteps'), false);
  assert.equal(Object.hasOwn(stored, 'provider'), false);

  const hydrated = hydrateVersionedTrip(payload.summary, payload.collections);
  assert.equal(hydrated.routeConnections.length, 1);
  assert.equal(hydrated.routeConnections[0].mode, 'train');
  assert.equal(hydrated.routeConnections[0].geometry, null);
});

test('Firestore persiste solo placeId y etiqueta del usuario para Google Places', () => {
  const trip = createTrip('Múnich');
  trip.id = 'trip-google-place-storage';
  trip.places = [createPlace({
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
  })];

  const payload = createTripRevisionPayload(trip, 'revision-place-google-001');
  const stored = payload.collections.places[0];
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

  const hydrated = hydrateVersionedTrip(payload.summary, payload.collections);
  assert.equal(hydrated.places[0].googlePlaceId, 'ChIJ-google-allianz');
  assert.equal(hydrated.places[0].userLabel, 'allianz arena munich');
  assert.equal(hydrated.places[0].lat, null);
  assert.equal(hydrated.places[0].lon, null);
});

test('el lector mantiene compatibilidad con resúmenes versionados v2', () => {
  assert.equal(isVersionedTripSummary({
    storageVersion: 2,
    activeRevision: 'revision-v2-existing',
  }), true);
});
