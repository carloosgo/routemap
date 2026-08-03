import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('country assets are generated per ISO code from high-detail OSM geometry', async () => {
  const builder = await read('scripts/build-country-boundaries.mjs');

  assert.match(builder, /osm-countries-0-0001\.geojson/);
  assert.match(builder, /public\/country-boundaries\/\$\{OUTPUT_VERSION\}/);
  assert.match(builder, /`\$\{code\}\.geojson`/);
  assert.match(builder, /source:\s*'OpenStreetMap'/);
});

test('static country client uses HTTP cache instead of localStorage', async () => {
  const client = await read('src/modules/map/countryBoundaryClient.js');

  assert.match(client, /country-boundaries\/\$\{BOUNDARY_VERSION\}/);
  assert.match(client, /cache:\s*'force-cache'/);
  assert.match(client, /boundaryCache = new Map\(\)/);
  assert.doesNotMatch(client, /localStorage/);
});

test('route map renders with MapLibre and borderless incremental country fills', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const packageJson = JSON.parse(await read('package.json'));

  assert.equal(packageJson.dependencies['maplibre-gl'], '^5.24.0');
  assert.equal(packageJson.dependencies.leaflet, undefined);
  assert.match(routeMap, /from 'maplibre-gl'/);
  assert.match(routeMap, /\/v1\/styles\/\$\{style\}\/style\.json/);
  assert.match(routeMap, /type:\s*'fill'/);
  assert.match(routeMap, /'fill-color':\s*country\.color/);
  assert.match(routeMap, /'fill-opacity':\s*0\.18/);
  assert.doesNotMatch(routeMap, /fill-outline-color/);
  assert.match(routeMap, /countryLayersRef\.current\.has/);
  assert.match(routeMap, /map\.setPaintProperty/);
  assert.match(routeMap, /map\.removeSource/);
  assert.doesNotMatch(routeMap, /from 'leaflet'/);
});

test('fallback boundary cache no longer serializes large geometry in localStorage', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');

  assert.doesNotMatch(client, /country-land-boundary-cache/);
  assert.match(client, /const boundaryCache = new Map\(\)/);
  assert.match(client, /getCountryLandBoundary/);
});
