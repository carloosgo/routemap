import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildMapFeatureData } from '../src/modules/map/routeMapModel.js';
import { reorderSegments } from '../src/modules/trips/tripOperations.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const city = (id, name, lat, lon) => ({
  id,
  name,
  displayName: name,
  country: 'Test',
  countryCode: 'TS',
  lat,
  lon,
});

function itinerary() {
  const a = city('a', 'A', 0, 0);
  const b = city('b', 'B', 0.1, 0.1);
  const c = city('c', 'C', 0.2, 0.2);
  const d = city('d', 'D', 0.3, 0.3);
  return {
    trip: {
      segments: [
        { id: 's1', origin: a, destination: b, expenses: {} },
        { id: 's2', origin: b, destination: c, expenses: {} },
        { id: 's3', origin: c, destination: d, expenses: {} },
      ],
    },
    cities: { a, b, c, d },
  };
}

const colorForIndex = (index) => `color-${index}`;

test('reordenar un trayecto reencadena tambien geometria, paradas y numeros del mapa', () => {
  const { trip, cities } = itinerary();
  const reordered = reorderSegments(trip, 's3', 's1', 'before');

  assert.deepEqual(
    reordered.segments.map((segment) => segment.id),
    ['s3', 's1', 's2']
  );
  assert.deepEqual(
    reordered.segments.map((segment) => segment.origin.id),
    ['a', 'd', 'b']
  );
  assert.deepEqual(
    reordered.segments.map((segment) => segment.destination.id),
    ['d', 'b', 'c']
  );

  const data = buildMapFeatureData({
    segments: reordered.segments,
    places: [],
    routeConnections: [],
    viewMode: 'segments',
    colorForIndex,
  });

  assert.deepEqual(
    data.routeFeatures.map((feature) => feature.properties.segmentId),
    ['s3', 's1', 's2']
  );
  assert.deepEqual(
    data.routeFeatures.map((feature) => feature.properties.sequence),
    [1, 2, 3]
  );
  assert.deepEqual(
    data.routeFeatures.map((feature) => feature.geometry.coordinates),
    [
      [[cities.a.lon, cities.a.lat], [cities.d.lon, cities.d.lat]],
      [[cities.d.lon, cities.d.lat], [cities.b.lon, cities.b.lat]],
      [[cities.b.lon, cities.b.lat], [cities.c.lon, cities.c.lat]],
    ]
  );
  assert.deepEqual(
    data.cityFeatures.map((feature) => feature.properties.name),
    ['A', 'D', 'B', 'C']
  );
  assert.deepEqual(
    data.cityFeatures.map((feature) => feature.properties.sequence),
    [1, 2, 3, 4]
  );
});

test('una ciudad revisitada conserva su posicion consecutiva en vez de desaparecer', () => {
  const { cities } = itinerary();
  const segments = [
    { id: 's1', origin: cities.a, destination: cities.b, expenses: {} },
    { id: 's2', origin: cities.b, destination: cities.a, expenses: {} },
    { id: 's3', origin: cities.a, destination: cities.c, expenses: {} },
  ];

  const data = buildMapFeatureData({
    segments,
    places: [],
    routeConnections: [],
    viewMode: 'segments',
    colorForIndex,
  });

  assert.deepEqual(
    data.cityFeatures.map((feature) => feature.properties.name),
    ['A', 'B', 'A', 'C']
  );
  assert.deepEqual(
    data.cityFeatures.map((feature) => feature.properties.sequence),
    [1, 2, 3, 4]
  );
});

test('los numeros de marcadores pertenecen al dato y no al orden DOM de Google Maps', async () => {
  const [google, css] = await Promise.all([
    read('src/modules/map/GooglePlacesMap.jsx'),
    read('src/modules/map/GooglePlacesMap.css'),
  ]);

  assert.match(google, /dot\.textContent = String\(number\)/);
  assert.match(google, /feature\.properties\?\.sequence/);
  assert.match(google, /zIndex:\s*300 \+ markerNumber/);
  assert.doesNotMatch(css, /counter-reset:\s*itinerary-city/);
  assert.doesNotMatch(css, /counter-increment:\s*itinerary-city/);
  assert.doesNotMatch(css, /content:\s*counter\(itinerary-city\)/);
  assert.match(css, /\.google-itinerary-city-marker__dot\s*\{[\s\S]*display:grid;/);
});
