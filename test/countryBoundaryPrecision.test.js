import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countryFillStyleState } from '../src/modules/map/countryColoring.js';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('MapLibre uses open Overture PMTiles country polygons without Mapbox', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const countryColoring = await read('src/modules/map/countryColoring.js');
  const config = await read('src/config.js');
  const envExample = await read('.env.example');
  const packageJson = JSON.parse(await read('package.json'));

  assert.equal(packageJson.dependencies['maplibre-gl'], '^5.24.0');
  assert.equal(packageJson.dependencies.pmtiles, '^4.4.1');
  assert.equal(packageJson.dependencies.leaflet, undefined);
  assert.match(routeMap, /from 'maplibre-gl'/);
  assert.match(routeMap, /from 'pmtiles'/);
  assert.match(routeMap, /COUNTRY_BOUNDARY_SOURCE_LAYER = 'division_area'/);
  assert.match(routeMap, /'source-layer': COUNTRY_BOUNDARY_SOURCE_LAYER/);
  assert.match(routeMap, /pmtiles:\/\//);
  assert.match(countryColoring, /\['get', 'subtype'\], 'country'/);
  assert.match(countryColoring, /\['get', 'class'\], 'land'/);
  assert.match(routeMap, /type:\s*'fill'/);
  assert.match(routeMap, /'fill-antialias': false/);
  assert.doesNotMatch(routeMap, /fill-outline-color/);
  assert.doesNotMatch(routeMap, /api\.mapbox\.com|mapbox\.country-boundaries|VITE_MAPBOX_TOKEN/);
  assert.doesNotMatch(config, /VITE_MAPBOX_TOKEN|countryBoundariesToken/);
  assert.doesNotMatch(envExample, /VITE_MAPBOX_TOKEN/);
  assert.match(config, /overturemaps-extras-us-west-2/);
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
    'all',
    ['==', ['get', 'subtype'], 'country'],
    ['==', ['get', 'class'], 'land'],
    ['in', ['get', 'country'], ['literal', ['FR', 'DE', 'NL']]],
  ]);
  assert.deepEqual(state.colorExpression, [
    'match',
    ['get', 'country'],
    'FR', '#e23b3b',
    'DE', '#e23b3b',
    'NL', '#2563eb',
    'transparent',
  ]);
});

test('country coloring does not download or cache full country GeoJSON', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const geoapifyClient = await read('src/modules/places/geoapifyClient.js');
  const packageJson = JSON.parse(await read('package.json'));

  assert.equal(packageJson.scripts['boundaries:build'], undefined);
  assert.doesNotMatch(routeMap, /country-boundaries\/v1|\.geojson/);
  assert.doesNotMatch(geoapifyClient, /country-land-boundary-cache/);
  assert.doesNotMatch(geoapifyClient, /getCountryLandBoundary/);
});
