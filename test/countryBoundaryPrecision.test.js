import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('country callable requests 1 km geometry and publishes its accuracy', async () => {
  const requestConfig = await read('functions/countryBoundaryRequest.js');
  const callable = await read('functions/index.js');

  assert.match(requestConfig, /COUNTRY_BOUNDARY_GEOMETRY = 'geometry_1000'/);
  assert.match(requestConfig, /COUNTRY_BOUNDARY_ACCURACY_METERS = 1000/);
  assert.match(callable, /countryBoundaryRequestParams\(/);
  assert.match(callable, /accuracyMeters: COUNTRY_BOUNDARY_ACCURACY_METERS/);
  assert.doesNotMatch(callable, /geometry:\s*'geometry_10000'/);
});

test('client rejects old coarse geometry and uses the v3 boundary cache', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');

  assert.match(client, /geoapify-country-boundary-cache:v3/);
  assert.match(client, /BOUNDARY_ACCURACY_METERS = 1000/);
  assert.match(client, /accuracyMeters !== BOUNDARY_ACCURACY_METERS/);
});

test('Leaflet renders the provider geometry without extra simplification or outline', async () => {
  const coloring = await read('src/modules/map/countryColoring.js');

  assert.match(coloring, /stroke:\s*false/);
  assert.match(coloring, /smoothFactor:\s*0/);
  assert.match(coloring, /fillRule:\s*'evenodd'/);
});
