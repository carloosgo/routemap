import test from 'node:test';
import assert from 'node:assert/strict';

import { createSegment } from '../src/modules/trips/tripModel.js';
import {
  isRoutableSegment,
  normalizeSegmentRoute,
  parseRouteGeometry,
  routeModeForSegment,
  routeSignatureForSegment,
  serializeRouteGeometry,
  withSegmentRoutePatch,
} from '../src/modules/trips/segmentRouteModel.js';

function routeSegment(expenses = { transport: { train: 120 } }) {
  return createSegment({
    id: 'segment-route',
    origin: { id: 'paris', name: 'París', lat: 48.8566, lon: 2.3522 },
    destination: { id: 'brussels', name: 'Bruselas', lat: 50.8503, lon: 4.3517 },
    expenses,
  });
}

function routeFor(segment) {
  return {
    signature: routeSignatureForSegment(segment),
    mode: routeModeForSegment(segment),
    geometry: {
      type: 'MultiLineString',
      coordinates: [
        [[2.3522, 48.8566], [3.2, 49.5]],
        [[3.2, 49.5], [4.3517, 50.8503]],
      ],
    },
    distance: 312000,
    duration: 6600,
    calculatedAt: '2026-08-05T00:00:00.000Z',
  };
}

test('la firma depende solo de coordenadas y modo de ruta', () => {
  const segment = routeSegment();

  assert.equal(routeModeForSegment(segment), 'transit');
  assert.equal(
    routeSignatureForSegment(segment),
    '48.856600,2.352200|50.850300,4.351700|transit'
  );
  assert.equal(
    routeSignatureForSegment({ ...segment, note: 'Reserva confirmada' }),
    routeSignatureForSegment(segment)
  );
});

test('normaliza únicamente geometría y métricas permitidas', () => {
  const segment = routeSegment();
  const route = normalizeSegmentRoute(
    { ...routeFor(segment), providerPayload: { instructions: ['secret'] } },
    segment
  );

  assert.deepEqual(Object.keys(route), [
    'signature',
    'mode',
    'geometry',
    'distance',
    'duration',
    'calculatedAt',
  ]);
  assert.equal(route.geometry.type, 'MultiLineString');
  assert.equal(route.distance, 312000);
  assert.equal(route.duration, 6600);
});

test('notas, fechas y montos del mismo modo conservan la ruta', () => {
  const base = routeSegment();
  const segment = { ...base, route: normalizeSegmentRoute(routeFor(base), base) };
  const withNote = withSegmentRoutePatch(segment, { note: 'Tren nocturno' });
  const withDate = withSegmentRoutePatch(withNote, { startDate: '2026-12-01' });
  const withSameMode = withSegmentRoutePatch(withDate, {
    expenses: { ...segment.expenses, transport: { ...segment.expenses.transport, train: 300 } },
  });

  assert.equal(withNote.route.signature, segment.route.signature);
  assert.equal(withDate.route.signature, segment.route.signature);
  assert.equal(withSameMode.route.signature, segment.route.signature);
});

test('cambiar origen, destino o modo invalida la ruta anterior', () => {
  const base = routeSegment();
  const segment = { ...base, route: normalizeSegmentRoute(routeFor(base), base) };
  const changedOrigin = withSegmentRoutePatch(segment, {
    origin: { ...segment.origin, lat: 48.9 },
  });
  const changedMode = withSegmentRoutePatch(segment, {
    expenses: {
      ...segment.expenses,
      transport: { plane: 0, train: 0, bus: 0, taxiUber: 80 },
    },
  });

  assert.equal(changedOrigin.route, null);
  assert.equal(changedMode.route, null);
});

test('serializa y restaura GeoJSON anidado sin entregarlo directamente a Firestore', () => {
  const geometry = routeFor(routeSegment()).geometry;
  const serialized = serializeRouteGeometry(geometry);

  assert.equal(typeof serialized, 'string');
  assert.deepEqual(parseRouteGeometry(serialized), geometry);
  assert.equal(parseRouteGeometry('{malformed'), null);
});

test('los vuelos conservan la curva visual y no llaman al routing terrestre', () => {
  const segment = routeSegment({
    transport: { plane: 500, train: 0, bus: 0, taxiUber: 0 },
  });

  assert.equal(routeModeForSegment(segment), 'plane');
  assert.equal(isRoutableSegment(segment), false);
});
