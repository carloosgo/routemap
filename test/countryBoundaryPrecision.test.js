import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { countryFillStyleState } from '../src/modules/map/countryColoring.js';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('Itinerario MapLibre uses open Overture PMTiles country polygons without Mapbox', async () => {
  const itineraryMap = await read('src/modules/map/ItineraryRouteMap.jsx');
  const mapSetup = await read('src/modules/map/routeMapSetup.js');
  const countryColoring = await read('src/modules/map/countryColoring.js');
  const overtureSource = await read('src/modules/map/overtureCountrySource.js');
  const config = await read('src/config.js');
  const envExample = await read('.env.example');
  const indexHtml = await read('index.html');
  const packageJson = JSON.parse(await read('package.json'));
  const mapImplementation = `${itineraryMap}\n${mapSetup}`;

  assert.equal(packageJson.dependencies['maplibre-gl'], '^5.24.0');
  assert.equal(packageJson.dependencies.pmtiles, '^4.4.1');
  assert.equal(packageJson.dependencies.leaflet, undefined);
  assert.match(itineraryMap, /from 'maplibre-gl'/);
  assert.match(mapSetup, /from 'pmtiles'/);
  assert.match(itineraryMap, /resolveOvertureDivisionsPmtilesUrl/);
  assert.match(mapSetup, /COUNTRY_BOUNDARY_SOURCE_LAYER = 'division_area'/);
  assert.match(mapSetup, /'source-layer': COUNTRY_BOUNDARY_SOURCE_LAYER/);
  assert.match(mapSetup, /pmtiles:\/\//);
  assert.match(countryColoring, /\['get', 'subtype'\], 'country'/);
  assert.match(countryColoring, /\['get', 'class'\], 'land'/);
  assert.match(mapSetup, /type:\s*'fill'/);
  assert.match(mapSetup, /'fill-antialias': false/);
  assert.doesNotMatch(mapSetup, /fill-outline-color/);
  assert.doesNotMatch(mapImplementation, /api\.mapbox\.com|mapbox\.country-boundaries|VITE_MAPBOX_TOKEN/);
  assert.doesNotMatch(config, /VITE_MAPBOX_TOKEN|countryBoundariesToken/);
  assert.doesNotMatch(envExample, /VITE_MAPBOX_TOKEN/);
  assert.match(overtureSource, /stac\.overturemaps\.org\/catalog\.json/);
  assert.match(overtureSource, /link\?\.rel === 'pmtiles'/);
  assert.match(indexHtml, /https:\/\/stac\.overturemaps\.org/);
  assert.match(indexHtml, /overturemaps-extras-us-west-2/);
  assert.doesNotMatch(mapImplementation, /getStaticCountryBoundary|getCountryLandBoundary/);
  assert.doesNotMatch(mapImplementation, /from 'leaflet'/);
});

test('country colors are sequential, distinct and use a brighter fill', () => {
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
  const colors = ['#e23b3b', '#2563eb', '#7c3aed'];
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
    'FR', '#f84e4e',
    'DE', '#3a78ff',
    'NL', '#9151ff',
    'transparent',
  ]);
});

test('country coloring does not download or cache full country GeoJSON', async () => {
  const itineraryMap = await read('src/modules/map/ItineraryRouteMap.jsx');
  const mapSetup = await read('src/modules/map/routeMapSetup.js');
  const geoapifyClient = await read('src/modules/places/geoapifyClient.js');
  const packageJson = JSON.parse(await read('package.json'));
  const mapImplementation = `${itineraryMap}\n${mapSetup}`;

  assert.equal(packageJson.scripts['boundaries:build'], undefined);
  assert.doesNotMatch(mapImplementation, /country-boundaries\/v1|\.geojson/);
  assert.doesNotMatch(geoapifyClient, /country-land-boundary-cache/);
  assert.doesNotMatch(geoapifyClient, /getCountryLandBoundary/);
});
