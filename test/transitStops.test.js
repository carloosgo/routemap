import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureTransitStops,
  intermediateStops,
  locateOnLine,
  placesAsStopNodes,
  resetTransitStopsForTests,
  segmentStops,
  transitStopOffsets,
} from '../src/modules/routes/transitStops.js';
import { normalizeRouteSegments } from '../src/modules/routes/routeModel.js';
import { searchCircles, stationTypes } from '../functions/googleTransitStopsFunction.js';

// Línea recta este-oeste (≈ 2.2 km) con estaciones cada ~550 m.
const line = { type: 'LineString', coordinates: [[2.30, 48.87], [2.33, 48.87]] };
const segment = (extra = {}) => ({
  kind: 'transit',
  label: '1',
  vehicle: 'SUBWAY',
  color: '#ffcd00',
  geometry: { type: 'LineString', coordinates: line.coordinates.map((point) => [...point]) },
  stops: [{ name: 'Étoile', lat: 48.87, lng: 2.30 }, { name: 'Concorde', lat: 48.87, lng: 2.33 }],
  stopCount: 4,
  ...extra,
});
// Estaciones como las devuelve Google (centro de la estación, no el andén).
const places = [
  { name: 'Étoile', lat: 48.8702, lng: 2.3001 },
  { name: 'George V', lat: 48.8706, lng: 2.3075 },
  { name: 'George V', lat: 48.8701, lng: 2.3077 },
  { name: 'Franklin D. Roosevelt', lat: 48.8695, lng: 2.315 },
  { name: 'Champs-Élysées - Clemenceau', lat: 48.8703, lng: 2.3225 },
  { name: 'Lejos', lat: 48.875, lng: 2.315 },
  { name: 'Concorde', lat: 48.8699, lng: 2.3299 },
];

test('estaciones: solo las intermedias pegadas al trazo, en orden y sin repetir', () => {
  assert.deepEqual(intermediateStops(placesAsStopNodes(places), segment()).map((stop) => stop.name), [
    'George V', 'Franklin D. Roosevelt', 'Champs-Élysées - Clemenceau',
  ]);
  assert.ok(locateOnLine({ lat: 48.875, lng: 2.315 }, line.coordinates).distance > 500);
});

test('estaciones: no más de las que cuenta Google', () => {
  assert.equal(intermediateStops(placesAsStopNodes(places), segment({ stopCount: 2 })).length, 1);
});

test('estaciones: se buscan una vez y se suman a subida y bajada; si falla, solo los extremos', async () => {
  resetTransitStopsForTests();
  let calls = 0;
  const loadPlaces = async (requested) => {
    calls += 1;
    assert.equal(requested.vehicle, 'SUBWAY');
    return places;
  };
  assert.deepEqual(segmentStops(segment()).map((stop) => stop.name), ['Étoile', 'Concorde']);
  await ensureTransitStops(segment(), { loadPlaces });
  await ensureTransitStops(segment(), { loadPlaces });
  assert.equal(calls, 1);
  assert.deepEqual(segmentStops(segment()).map((stop) => stop.name), [
    'Étoile', 'George V', 'Franklin D. Roosevelt', 'Champs-Élysées - Clemenceau', 'Concorde',
  ]);
  // Sobre la propia línea: posición a lo largo del trazo (0–1), en orden.
  const offsets = transitStopOffsets(segment());
  assert.equal(offsets.length, 3);
  assert.ok(Math.abs(offsets[0] - 0.25) < 0.02 && Math.abs(offsets[1] - 0.5) < 0.02 && Math.abs(offsets[2] - 0.75) < 0.02);
  assert.deepEqual(transitStopOffsets(segment({ label: '9' })), []);

  const other = segment({ label: '2' });
  const failing = async () => { throw new Error('offline'); };
  assert.deepEqual(await ensureTransitStops(other, { loadPlaces: failing }), []);
  assert.deepEqual(segmentStops(other).map((stop) => stop.name), ['Étoile', 'Concorde']);
});

test('estaciones (función): círculos que cubren todo el tramo y tipos según el vehículo', () => {
  const circles = searchCircles(line.coordinates);
  assert.equal(circles.length, 3);
  assert.ok(circles.every((circle) => circle.radius >= 500 && Math.abs(circle.lat - 48.87) < 0.001));
  assert.ok(circles[0].lng < circles[1].lng && circles[1].lng < circles[2].lng);
  const long = searchCircles([[2.0, 48.8], [2.6, 48.8]]);
  assert.equal(long.length, 10, 'tramos largos: máximo 10 búsquedas');
  assert.deepEqual(searchCircles([[2.3, 48.87]]), []);
  assert.deepEqual(stationTypes('SUBWAY'), ['subway_station']);
  assert.deepEqual(stationTypes('TRAM'), ['light_rail_station', 'transit_station']);
  assert.ok(stationTypes('???').includes('train_station'));
});

test('estaciones: el modelo de ruta conserva paradas, número de paradas y vehículo', () => {
  const [normalized] = normalizeRouteSegments([{
    kind: 'transit',
    geometry: line,
    stopCount: 4,
    vehicle: 'SUBWAY',
    stops: [{ name: 'Étoile', lat: 48.87, lng: 2.3 }, { name: 'x', lat: 'nope', lng: 2 }],
  }]);
  assert.deepEqual(normalized.stops, [{ name: 'Étoile', lat: 48.87, lng: 2.3 }]);
  assert.equal(normalized.stopCount, 4);
  assert.equal(normalized.vehicle, 'SUBWAY');
});
