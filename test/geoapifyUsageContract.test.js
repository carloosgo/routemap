import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const read = (path) => readFile(path, 'utf8');

async function readFunctionModules() {
  const paths = [
    'functions/geoapifyCityFunctions.js',
    'functions/geoapifyPlaceFunctions.js',
    'functions/geoapifyRouteFunctions.js',
    'functions/geoapifyBatchFunctions.js',
    'functions/countryBoundaryFunction.js',
  ];
  return Promise.all(paths.map(read));
}

test('ciudades y búsqueda general conservan políticas independientes', () => {
  assert.equal(config.citySearchMinChars, 3);
  assert.equal(config.citySearchDebounceMs, 450);
  assert.equal(config.citySearchLimit, 5);
  assert.ok(config.citySearchCacheTtlMs >= 30 * DAY_MS);
  assert.ok(config.citySearchCacheTtlMs <= 90 * DAY_MS);

  assert.equal(config.geoapify.searchMinChars, 5);
  assert.equal(config.geoapify.searchDebounceMs, 450);
  assert.equal(config.geoapify.searchLimit, 5);
  assert.ok(config.geoapify.clientCacheTtlMs >= 30 * DAY_MS);
  assert.ok(config.geoapify.clientCacheTtlMs <= 90 * DAY_MS);
});

test('el backend de ciudades fuerza type city, mínimo tres y límite cinco', async () => {
  const cityFunctions = await read('functions/geoapifyCityFunctions.js');
  const runtime = await read('functions/geoapifyRuntime.js');

  assert.match(cityFunctions, /MIN_QUERY_CHARS = 3/);
  assert.match(cityFunctions, /MAX_RESULTS = 5/);
  assert.match(cityFunctions, /type: 'city'/);
  assert.match(cityFunctions, /'citySearchCache'/);
  assert.match(cityFunctions, /QUOTAS\.cityAutocomplete/);
  assert.match(runtime, /cityAutocomplete: \{ scope: 'geoapify-city-autocomplete'/);
  assert.doesNotMatch(cityFunctions, /geoapifyPlaceSearch|placeSearchCache/);
});

test('el backend general conserva mínimo de cinco y rate limiter oficial', async () => {
  const placeFunctions = await read('functions/geoapifyPlaceFunctions.js');
  const batchFunctions = await read('functions/geoapifyBatchFunctions.js');
  const support = await read('functions/geoapifySupport.js');

  assert.doesNotMatch(placeFunctions, /queryKey\.length < 3/);
  assert.match(placeFunctions, /queryKey\.length < 5/);
  assert.match(batchFunctions, /normalized\(query\)\.length < 5/);
  assert.match(placeFunctions, /Number\(request\.data\?\.limit\) \|\| 5/);
  assert.match(support, /RequestRateLimiter\.rateLimitedRequests/);
});

test('batch usa una solicitud oficial de hasta mil entradas y exige autenticación', async () => {
  const source = await read('functions/geoapifyBatchFunctions.js');

  assert.match(source, /rawQueries\.length > 1000/);
  assert.match(source, /requireAuthenticated\(request\)/);
  assert.match(source, /\/v1\/batch\/geocode\/search/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /body: JSON\.stringify\(queries\)/);
  assert.match(source, /export const geoapifyBatchGeocodeResult/);
  assert.doesNotMatch(source, /const tasks = queries\.map/);
});

test('App Check, cuotas compartidas y límites de instancias forman parte de todas las callable functions', async () => {
  const policy = await read('functions/callablePolicy.js');
  const sources = await readFunctionModules();
  const client = await read('src/infrastructure/firebase/firebaseClient.js');

  assert.match(policy, /defineBoolean\('ENFORCE_APP_CHECK'/);
  assert.match(policy, /enforceAppCheck: ENFORCE_APP_CHECK/);
  assert.match(policy, /maxInstances: 10/);
  assert.match(policy, /concurrency: 20/);
  assert.match(policy, /functionRateLimits/);

  for (const source of sources) {
    assert.match(source, /callableOptions\(/);
    assert.match(source, /enforceQuota\(db, request/);
  }

  assert.match(client, /ReCaptchaEnterpriseProvider/);
  assert.match(client, /isTokenAutoRefreshEnabled: true/);
});

test('la caché compartida oculta la consulta y conserva expiración administrable', async () => {
  const cache = await read('functions/sharedCache.js');
  const cityFunctions = await read('functions/geoapifyCityFunctions.js');
  const placeFunctions = await read('functions/geoapifyPlaceFunctions.js');
  const batchFunctions = await read('functions/geoapifyBatchFunctions.js');
  const sources = `${cityFunctions}\n${placeFunctions}\n${batchFunctions}`;

  assert.match(cache, /expiresAt: Timestamp\.fromMillis/);
  assert.match(cache, /inFlightLoads/);
  assert.doesNotMatch(cache, /queryKey:/);
  assert.doesNotMatch(sources, /queryKey: key/);
  assert.match(cityFunctions, /citySearchCache/);
  assert.match(placeFunctions, /placeDetailsCache/);
  assert.match(batchFunctions, /geoapifyBatchJobs/);
});

test('el endpoint de routing queda aislado hasta la futura fase de rutas de búsqueda general', async () => {
  const source = await read('functions/geoapifyRouteFunctions.js');
  const client = await read('src/modules/places/geoapifyClient.js');
  const tripModel = await read('src/modules/trips/tripModel.js');
  const tripEntities = await read('src/modules/trips/tripEntities.js');
  const map = await read('src/modules/map/RouteMap.jsx');
  const mapPane = await read('src/app/AppMapPane.jsx');

  assert.match(source, /export const geoapifyRoute/);
  assert.match(source, /geometry: feature\.geometry/);
  assert.match(source, /distance: Number\(feature\.properties\?\.distance\)/);
  assert.match(source, /duration: Number\(feature\.properties\?\.time\)/);
  assert.doesNotMatch(source, /elevation|route_details|traffic/);
  assert.doesNotMatch(client, /callable\('geoapifyRoute'\)/);
  assert.doesNotMatch(tripModel, /segmentRoute|routeGeometry|routeSignature/);
  assert.doesNotMatch(tripEntities, /\broute\s*:/);
  assert.doesNotMatch(map, /geoapifyRoute|requestGeoapifyRoute|PersistentSegmentRoutes/);
  assert.doesNotMatch(mapPane, /usePersistentSegmentRoutes|requestGeoapifyRoute/);
});

test('functions index conserva una fachada con los nueve endpoints públicos', async () => {
  const index = await read('functions/index.js');

  for (const endpoint of [
    'geoapifyCityAutocomplete',
    'geoapifyPlaceSearch',
    'geoapifyAutocomplete',
    'geoapifyPlaceDetails',
    'geoapifyRoute',
    'geoapifyReverse',
    'geoapifyBatchGeocode',
    'geoapifyBatchGeocodeResult',
    'geoapifyCountryBoundary',
  ]) {
    assert.match(index, new RegExp(`\\b${endpoint}\\b`));
  }

  assert.ok(index.split('\n').length <= 32);
  assert.doesNotMatch(index, /onCall|enforceQuota|limitedFetch|initializeApp/);
});
