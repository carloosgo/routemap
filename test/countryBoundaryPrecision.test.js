import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countryFillStyleState } from '../src/modules/map/countryColoring.js';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('MapLibre uses the same Mapbox Countries vector tileset and attributes as the old map', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const packageJson = JSON.parse(await read('package.json'));

  assert.equal(packageJson.dependencies['maplibre-gl'], '^5.24.0');
  assert.equal(packageJson.dependencies.leaflet, undefined);
  assert.match(routeMap, /from 'maplibre-gl'/);
  assert.match(routeMap, /mapbox\.country-boundaries-v1\.json/);
  assert.match(routeMap, /COUNTRY_BOUNDARY_SOURCE_LAYER = 'country_boundaries'/);
  assert.match(routeMap, /'source-layer': COUNTRY_BOUNDARY_SOURCE_LAYER/);
  assert.match(routeMap, /iso_3166_1_alpha_3/);
  assert.match(routeMap, /type:\s*'fill'/);
  assert.match(routeMap, /'fill-antialias': false/);
  assert.doesNotMatch(routeMap, /fill-outline-color/);
  assert.doesNotMatch(routeMap, /getStaticCountryBoundary|getCountryLandBoundary/);
  assert.doesNotMatch(routeMap, /from 'leaflet'/);
});

test('country colors keep the color of the first route segment that touches each country', () => {
  const segments = [
    {
      origin: { countryCode: 'FR', lat: 48.8566, lon: 2.3522 },
      destination: { countryCode: 'DE', lat: 52.52, lon: 13.405 },
    },
    {
      origin: { countryCode: 'DE', lat: 52.52, lon: 13.405 },
      destination: { countryCode: 'NL', lat: 52.3676, lon: 4.9041 },
    },
  ];
  const colors = ['#e23b3b', '#2563eb'];
  const state = countryFillStyleState(segments, (index) => colors[index]);

  assert.deepEqual(state.filter, [
    'in',
    ['get', 'iso_3166_1_alpha_3'],
    ['literal', ['FRA', 'DEU', 'NLD']],
  ]);
  assert.deepEqual(state.colorExpression, [
    'match',
    ['get', 'iso_3166_1_alpha_3'],
    'FRA', '#e23b3b',
    'DEU', '#e23b3b',
    'NLD', '#2563eb',
    'transparent',
  ]);
});

test('country coloring no longer downloads or caches full country GeoJSON', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const geoapifyClient = await read('src/modules/places/geoapifyClient.js');
  const packageJson = JSON.parse(await read('package.json'));

  assert.equal(packageJson.scripts['boundaries:build'], undefined);
  assert.doesNotMatch(routeMap, /country-boundaries\/v1|\.geojson/);
  assert.doesNotMatch(geoapifyClient, /country-land-boundary-cache/);
  assert.doesNotMatch(geoapifyClient, /getCountryLandBoundary/);
});
