import test from 'node:test';
import assert from 'node:assert/strict';
import { addTransitStops, intermediateStops, locateOnLine, overpassQuery } from '../functions/transitStops.js';
import { normalizeRouteSegments } from '../src/modules/routes/routeModel.js';

// Línea recta este-oeste (≈ 2.2 km) con estaciones cada ~550 m.
const line = { type: 'LineString', coordinates: [[2.30, 48.87], [2.33, 48.87]] };
const segment = () => ({
  kind: 'transit',
  label: '1',
  vehicle: 'SUBWAY',
  color: '#ffcd00',
  geometry: { type: 'LineString', coordinates: line.coordinates.map((point) => [...point]) },
  departure: { name: 'Étoile', lat: 48.87, lng: 2.30 },
  arrival: { name: 'Concorde', lat: 48.87, lng: 2.33 },
  stopCount: 4,
});
const node = (id, name, lng, lat = 48.87, tags = { public_transport: 'stop_position' }) => ({
  type: 'node', id, lat, lon: lng, tags: { name, ...tags },
});
const elements = [
  node(1, 'Étoile', 2.3001),
  node(2, 'George V', 2.3075),
  node(3, 'George V', 2.3076, 48.8701, { railway: 'station' }),
  node(4, 'Franklin Roosevelt', 2.315),
  node(5, 'Champs-Élysées', 2.3225),
  node(6, 'Lejos', 2.315, 48.875),
  node(7, 'Concorde', 2.3299),
  node(8, '', 2.31),
];

test('estaciones: solo las intermedias pegadas al trazo, en orden y sin repetir', () => {
  assert.deepEqual(intermediateStops(elements, segment()).map((stop) => stop.name), [
    'George V', 'Franklin Roosevelt', 'Champs-Élysées',
  ]);
  assert.ok(locateOnLine({ lat: 48.875, lng: 2.315 }, line.coordinates).distance > 500);
});

test('estaciones: no más de las que cuenta Google', () => {
  const stops = intermediateStops(elements, { ...segment(), stopCount: 2 });
  assert.equal(stops.length, 1);
});

test('estaciones: consulta de Overpass por línea y tipo, o por estaciones si no hay línea', () => {
  const byLine = overpassQuery(segment());
  assert.match(byLine, /\["ref"="1"\]\["route"~"\^\(subway\|light_rail\)\$"\]/);
  assert.match(overpassQuery({ ...segment(), label: '' }), /public_transport/);
  assert.match(overpassQuery({ ...segment(), label: 'A"]' }), /\["ref"="A\]"\]/);
});

test('estaciones: completa subida, intermedias y bajada; si Overpass falla, solo los extremos', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ elements }) });
  const [withStops] = await addTransitStops([segment()], { fetchImpl: ok });
  assert.deepEqual(withStops.stops.map((stop) => stop.name), [
    'Étoile', 'George V', 'Franklin Roosevelt', 'Champs-Élysées', 'Concorde',
  ]);
  assert.equal('departure' in withStops || 'stopCount' in withStops || 'vehicle' in withStops, false);

  const failing = async () => { throw new Error('offline'); };
  const [ends] = await addTransitStops([segment(), { kind: 'walk', geometry: line }], { fetchImpl: failing });
  assert.deepEqual(ends.stops.map((stop) => stop.name), ['Étoile', 'Concorde']);
});

test('estaciones: el modelo de ruta conserva las paradas válidas del tramo', () => {
  const [normalized] = normalizeRouteSegments([{
    kind: 'transit',
    geometry: line,
    stops: [{ name: 'Étoile', lat: 48.87, lng: 2.3 }, { name: 'x', lat: 'nope', lng: 2 }],
  }]);
  assert.deepEqual(normalized.stops, [{ name: 'Étoile', lat: 48.87, lng: 2.3 }]);
});
