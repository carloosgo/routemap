import test from 'node:test';
import assert from 'node:assert/strict';

import { createSegment, normalizeTrip } from '../src/modules/trips/tripModel.js';
import { serializeTripForFirestore } from '../src/infrastructure/firebase/firestoreTripRepository.js';
import {
  createDirectSegmentRoute,
  hasReusableSegmentRoute,
  invalidateStaleSegmentRoute,
  normalizeSegmentRoute,
  routeGeometryForDisplay,
  routeModeForSegment,
  segmentRouteSignature,
} from '../src/modules/routes/routeModel.js';

function segment(overrides = {}) {
  return createSegment({
    id: 'segment-1',
    origin: { name: 'París', lat: 48.8566, lon: 2.3522 },
    destination: { name: 'Bruselas', lat: 50.8503, lon: 4.3517 },
    ...overrides,
  });
}

test('la firma depende exclusivamente de origen, destino y modo', () => {
  const base = segment();
  const signature = segmentRouteSignature(base);
  assert.equal(signature, '48.856600,2.352200|50.850300,4.351700|drive');
  assert.equal(segmentRouteSignature({ ...base, note: 'Otra nota' }), signature);
  assert.equal(segmentRouteSignature({ ...base, startDate: '2026-12-01' }), signature);
});

test('el modo solo cambia cuando cambia el transporte dominante', () => {
  const base = segment();
  assert.equal(routeModeForSegment(base), 'drive');
  assert.equal(routeModeForSegment({
    ...base,
    expenses: {
      ...base.expenses,
      lodging: 500,
      transport: { ...base.expenses.transport, train: 100 },
    },
  }), 'transit');
  assert.equal(routeModeForSegment({
    ...base,
    expenses: {
      ...base.expenses,
      transport: { ...base.expenses.transport, plane: 200 },
    },
  }), 'plane');
});

test('una ruta se reutiliza mientras su firma no cambie', () => {
  const base = segment();
  const route = {
    geometry: {
      type: 'LineString',
      coordinates: [[2.3522, 48.8566], [4.3517, 50.8503]],
    },
    distance: 300000,
    duration: 10800,
    mode: 'drive',
    signature: segmentRouteSignature(base, 'drive'),
    calculatedAt: '2026-08-05T00:00:00.000Z',
    source: 'geoapify',
  };
  const routed = { ...base, route };

  assert.equal(hasReusableSegmentRoute(routed), true);
  assert.equal(invalidateStaleSegmentRoute({ ...routed, note: 'No invalida' }).route, route);
  assert.equal(routeGeometryForDisplay(routed).coordinates.length, 2);
});

test('cambiar origen o modo invalida la ruta anterior', () => {
  const base = segment();
  const routed = { ...base, route: createDirectSegmentRoute({
    ...base,
    expenses: {
      ...base.expenses,
      transport: { ...base.expenses.transport, plane: 100 },
    },
  }) };

  assert.equal(invalidateStaleSegmentRoute({
    ...routed,
    destination: { ...routed.destination, lon: 5 },
  }).route, null);
  assert.equal(invalidateStaleSegmentRoute({
    ...routed,
    expenses: {
      ...routed.expenses,
      transport: { ...routed.expenses.transport, plane: 0, taxiUber: 100 },
    },
  }).route, null);
});

test('Firestore recibe GeoJSON serializado y normalizeTrip lo restaura completo', () => {
  const base = segment();
  const route = {
    geometry: {
      type: 'LineString',
      coordinates: [[2.3522, 48.8566], [3.1, 49.4], [4.3517, 50.8503]],
    },
    distance: 300000,
    duration: 10800,
    mode: 'drive',
    signature: segmentRouteSignature(base, 'drive'),
    calculatedAt: '2026-08-05T00:00:00.000Z',
    source: 'geoapify',
  };
  const trip = normalizeTrip({
    id: 'trip-1',
    name: 'Europa',
    currency: 'EUR',
    segments: [{ ...base, route }],
    places: [],
    notes: [],
    checklist: [],
  });
  const stored = serializeTripForFirestore(trip);

  assert.equal(typeof stored.segments[0].route.geometry, 'string');
  const restored = normalizeTrip(stored);
  assert.deepEqual(restored.segments[0].route.geometry, route.geometry);
  assert.equal(hasReusableSegmentRoute(restored.segments[0]), true);
});

test('se rechaza una geometría corrupta o fuera de rango', () => {
  assert.equal(normalizeSegmentRoute({
    geometry: '{mal json',
    mode: 'drive',
    signature: 'x',
  }), null);
  assert.equal(normalizeSegmentRoute({
    geometry: { type: 'LineString', coordinates: [[999, 0], [0, 0]] },
    mode: 'drive',
    signature: 'x',
  }), null);
});
