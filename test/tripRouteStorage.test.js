import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTripRevisionPayload,
  hydrateVersionedTrip,
  isVersionedTripSummary,
} from '../src/infrastructure/firebase/tripStorageSchema.js';
import { createPlace, createTrip } from '../src/modules/trips/tripModel.js';

function tripWithRoute() {
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
    }],
  };
}

test('Firestore serializa la geometría para evitar arrays anidados', () => {
  const payload = createTripRevisionPayload(tripWithRoute(), 'revision-route-001');
  const stored = payload.collections.routeConnections[0];

  assert.equal(payload.summary.storageVersion, 3);
  assert.equal(payload.summary.routeConnectionCount, 1);
  assert.equal(payload.revision.routeConnectionCount, 1);
  assert.equal(typeof stored.geometryJson, 'string');
  assert.equal(Object.hasOwn(stored, 'geometry'), false);
  assert.deepEqual(JSON.parse(stored.geometryJson), tripWithRoute().routeConnections[0].geometry);
});

test('hidratar la revisión reconstruye el GeoJSON de la conexión', () => {
  const payload = createTripRevisionPayload(tripWithRoute(), 'revision-route-002');
  const hydrated = hydrateVersionedTrip(payload.summary, payload.collections);

  assert.equal(hydrated.routeConnections.length, 1);
  assert.equal(hydrated.routeConnections[0].mode, 'walk');
  assert.deepEqual(
    hydrated.routeConnections[0].geometry,
    tripWithRoute().routeConnections[0].geometry
  );
});

test('el lector mantiene compatibilidad con resúmenes versionados v2', () => {
  assert.equal(isVersionedTripSummary({
    storageVersion: 2,
    activeRevision: 'revision-v2-existing',
  }), true);
});
