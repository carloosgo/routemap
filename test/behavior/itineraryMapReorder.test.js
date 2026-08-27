// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapFeatureData } from '../../src/modules/map/routeMapModel.js';
import { reorderSegments } from '../../src/modules/trips/tripOperations.js';

const city = (id, name, lat, lon) => ({ id, name, displayName: name, country: 'Test', countryCode: 'TS', lat, lon });

function itinerary() {
  const a = city('a', 'A', 0, 0);
  const b = city('b', 'B', 0.1, 0.1);
  const c = city('c', 'C', 0.2, 0.2);
  const d = city('d', 'D', 0.3, 0.3);
  return {
    trip: { segments: [
      { id: 's1', origin: a, destination: b, expenses: {} },
      { id: 's2', origin: b, destination: c, expenses: {} },
      { id: 's3', origin: c, destination: d, expenses: {} },
    ] },
    cities: { a, b, c, d },
  };
}

const colorForIndex = (index) => `color-${index}`;
function mapDataFor(segments) {
  return buildMapFeatureData({ segments, places: [], routeConnections: [], viewMode: 'segments', colorForIndex });
}

function assertConsecutiveMapChain(reordered, expectedSegmentIds, expectedCityIds) {
  assert.deepEqual(reordered.segments.map((segment) => segment.id), expectedSegmentIds);
  const actualCityIds = [reordered.segments[0]?.origin?.id, ...reordered.segments.map((segment) => segment.destination?.id)];
  assert.deepEqual(actualCityIds, expectedCityIds);
  reordered.segments.forEach((segment, index) => {
    if (index === 0) return;
    assert.equal(segment.origin?.id, reordered.segments[index - 1]?.destination?.id, `segmento ${index + 1} debe iniciar donde termina el segmento ${index}`);
  });
  const data = mapDataFor(reordered.segments);
  assert.deepEqual(data.routeFeatures.map((feature) => feature.properties.segmentId), expectedSegmentIds);
  assert.deepEqual(data.routeFeatures.map((feature) => feature.properties.sequence), expectedSegmentIds.map((_, index) => index + 1));
  assert.deepEqual(
    data.cityFeatures.map((feature) => feature.properties.sequence),
    [null, ...expectedSegmentIds.map((_, index) => index + 1)]
  );
  assert.deepEqual(data.cityFeatures.map((feature) => feature.properties.name.toLowerCase()), expectedCityIds);
}

test('reordenar un trayecto reencadena tambien geometria, paradas y numeros del mapa', () => {
  const { trip, cities } = itinerary();
  const reordered = reorderSegments(trip, 's3', 's1', 'before');
  assertConsecutiveMapChain(reordered, ['s3', 's1', 's2'], ['a', 'd', 'b', 'c']);
  const data = mapDataFor(reordered.segments);
  assert.deepEqual(data.routeFeatures.map((feature) => feature.geometry.coordinates), [
    [[cities.a.lon, cities.a.lat], [cities.d.lon, cities.d.lat]],
    [[cities.d.lon, cities.d.lat], [cities.b.lon, cities.b.lat]],
    [[cities.b.lon, cities.b.lat], [cities.c.lon, cities.c.lat]],
  ]);
});

test('mover el primer trayecto al final mantiene una sola cadena consecutiva', () => {
  const { trip } = itinerary();
  assertConsecutiveMapChain(reorderSegments(trip, 's1', 's3', 'after'), ['s2', 's3', 's1'], ['a', 'c', 'd', 'b']);
});

test('mover el trayecto intermedio al final mantiene numeros y origenes consecutivos', () => {
  const { trip } = itinerary();
  assertConsecutiveMapChain(reorderSegments(trip, 's2', 's3', 'after'), ['s1', 's3', 's2'], ['a', 'b', 'd', 'c']);
});

test('mover un trayecto una sola posicion hacia arriba conserva la cadena', () => {
  const { trip } = itinerary();
  assertConsecutiveMapChain(reorderSegments(trip, 's3', 's2', 'before'), ['s1', 's3', 's2'], ['a', 'b', 'd', 'c']);
});

test('varios drags consecutivos no acumulan origenes ni trazos obsoletos', () => {
  const { trip } = itinerary();
  const firstMove = reorderSegments(trip, 's3', 's1', 'before');
  assertConsecutiveMapChain(firstMove, ['s3', 's1', 's2'], ['a', 'd', 'b', 'c']);
  const secondMove = reorderSegments(firstMove, 's2', 's3', 'before');
  assertConsecutiveMapChain(secondMove, ['s2', 's3', 's1'], ['a', 'c', 'd', 'b']);
  const thirdMove = reorderSegments(secondMove, 's1', 's2', 'before');
  assertConsecutiveMapChain(thirdMove, ['s1', 's2', 's3'], ['a', 'b', 'c', 'd']);
});

test('una ciudad revisitada conserva todas sus visitas agrupadas en un solo punto geografico', () => {
  const { cities } = itinerary();
  const data = mapDataFor([
    { id: 's1', origin: cities.a, destination: cities.b, expenses: {} },
    { id: 's2', origin: cities.b, destination: cities.a, expenses: {} },
    { id: 's3', origin: cities.a, destination: cities.c, expenses: {} },
  ]);
  assert.deepEqual(data.cityFeatures.map((feature) => feature.properties.name), ['A', 'B', 'C']);
  assert.deepEqual(
    data.cityFeatures.map((feature) => feature.properties.visits.map((visit) => visit.sequence)),
    [[2], [1], [3]],
  );
  assert.equal(data.cityFeatures.find((feature) => feature.properties.name === 'C')?.properties.isFinish, true);
});
