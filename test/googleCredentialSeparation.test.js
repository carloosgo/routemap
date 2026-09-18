import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Places y Routes usan secretos backend independientes', async () => {
  const runtime = await read('functions/geoapifyRuntime.js');
  const places = await read('functions/googleMapsFunctions.js');
  const details = await read('functions/googlePlaceDetailsEssentialsFunction.js');
  const locations = await read('functions/googlePlaceLocationFunction.js');
  const routes = await read('functions/googleOptimizedRouteFunction.js');

  assert.match(runtime, /defineSecret\('GOOGLE_PLACES_API_KEY'\)/);
  assert.match(runtime, /defineSecret\('GOOGLE_ROUTES_API_KEY'\)/);
  assert.doesNotMatch(runtime, /defineSecret\('GOOGLE_MAPS_API_KEY'\)/);

  for (const source of [places, details, locations]) {
    assert.match(source, /GOOGLE_PLACES_API_KEY/);
    assert.doesNotMatch(source, /GOOGLE_ROUTES_API_KEY|GOOGLE_MAPS_API_KEY/);
  }

  assert.match(routes, /GOOGLE_ROUTES_API_KEY/);
  assert.doesNotMatch(routes, /GOOGLE_PLACES_API_KEY|GOOGLE_MAPS_API_KEY/);
});
