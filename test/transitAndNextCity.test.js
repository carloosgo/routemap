// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';

import { routeSegments } from '../functions/googleOptimizedRouteFunction.js';
import { normalizeRouteSegments, createSavedPlaceRoute } from '../src/modules/routes/routeModel.js';
import { cityTransfers, transferDepartureTime } from '../src/modules/places/cityTransferModel.js';

// Polilínea codificada de ejemplo de la documentación de Google (2 puntos).
const LINE_A = '_p~iF~ps|U_ulLnnqC';

test('la ruta de transporte se divide en tramos con el color oficial de cada línea', () => {
  const segments = routeSegments({
    legs: [{
      steps: [
        { travelMode: 'WALK', polyline: { encodedPolyline: LINE_A } },
        { travelMode: 'WALK', polyline: { encodedPolyline: LINE_A } },
        {
          travelMode: 'TRANSIT',
          polyline: { encodedPolyline: LINE_A },
          transitDetails: { transitLine: { color: '#FFCE00', nameShort: 'M1' } },
        },
        {
          travelMode: 'TRANSIT',
          polyline: { encodedPolyline: LINE_A },
          transitDetails: { transitLine: { color: 'red', name: 'Bus 24' } },
        },
      ],
    }],
  });

  assert.deepEqual(segments.map(({ kind, color, label }) => [kind, color, label]), [
    ['walk', '', ''],
    ['transit', '#FFCE00', 'M1'],
    ['transit', '', 'Bus 24'],
  ]);
  assert.equal(segments[0].geometry.coordinates.length, 3);
});

test('una ruta sin transporte público no genera tramos', () => {
  assert.deepEqual(routeSegments({ legs: [{ steps: [{ travelMode: 'DRIVE', polyline: { encodedPolyline: LINE_A } }] }] }), []);
});

test('el modelo de rutas conserva tramos válidos y descarta los incompletos', () => {
  const segments = normalizeRouteSegments([
    { kind: 'transit', color: '#00a0e2', label: 'U2', geometry: { coordinates: [[13.4, 52.5], [13.41, 52.51]] } },
    { kind: 'hack', color: 'javascript:alert(1)', geometry: { coordinates: [[1, 1], [2, 2]] } },
    { kind: 'walk', geometry: { coordinates: [[1, 1]] } },
  ]);

  assert.equal(segments.length, 2);
  assert.equal(segments[1].kind, 'other');
  assert.equal(segments[1].color, '');
  assert.equal(createSavedPlaceRoute({ segments }).segments.length, 2);
});

test('el día de traslado genera una tarjeta por cada cambio de ciudad', () => {
  const paris = { id: 'paris', name: 'Paris', lat: 48.85, lon: 2.35 };
  const london = { id: 'london', name: 'London', lat: 51.5, lon: -0.12 };
  const transfers = cityTransfers([
    { segmentId: 'a', destination: paris },
    { segmentId: 'b', destination: london },
  ]);

  assert.deepEqual(transfers.map(({ key, from, to }) => [key, from.name, to.name]), [['a>b', 'Paris', 'London']]);
  assert.deepEqual(cityTransfers([{ segmentId: 'a', destination: paris }, { segmentId: 'b', destination: paris }]), []);
});

test('la salida de referencia es a las 9 de la mañana locales y solo en fechas futuras', () => {
  const now = Date.parse('2026-11-05T00:00:00Z');
  assert.equal(transferDepartureTime('2026-12-23', 2.35, now), '2026-12-23T09:00:00.000Z');
  assert.equal(transferDepartureTime('2026-12-23', -99.13, now), '2026-12-23T16:00:00.000Z');
  assert.equal(transferDepartureTime('2026-01-01', 0, now), '');
  assert.equal(transferDepartureTime('no-date', 0, now), '');
});
