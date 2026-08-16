import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { config } from '../src/config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const read = (path) => readFile(path, 'utf8');

async function readCallableModules() {
  const paths = [
    'functions/geoapifyCityFunctions.js',
    'functions/geoapifyPlaceFunctions.js',
    'functions/geoapifyRouteFunctions.js',
    'functions/geoapifyBatchFunctions.js',
    'functions/countryBoundaryFunction.js',
    'functions/googleMapsFunctions.js',
    'functions/googlePlaceDetailsEssentialsFunction.js',
    'functions/googlePlaceLocationFunction.js',
    'functions/googleOptimizedRouteFunction.js',
  ];
  return Promise.all(paths.map(read));
}

test('ciudades Geoapify y búsqueda Google conservan políticas independientes', () => {
  assert.equal(config.citySearchMinChars, 3);
  assert.equal(config.citySearchDebounceMs, 450);
  assert.equal(config.citySearchLimit, 5);
  assert.ok(config.citySearchCacheTtlMs >= 30 * DAY_MS);
  assert.ok(config.citySearchCacheTtlMs <= 90 * DAY_MS);

  assert.equal(config.googleMaps.searchMinChars, 4);
  assert.equal(config.googleMaps.searchDebounceMs, 450);
  assert.equal(config.googleMaps.searchLimit, 5);
  assert.ok(config.googleMaps.locationCacheTtlMs >= 28 * DAY_MS);
  assert.ok(config.googleMaps.locationCacheTtlMs < 30 * DAY_MS);
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
  assert.doesNotMatch(cityFunctions, /googlePlaceSearch|googlePlaceAutocomplete/);
});

test('el backend Geoapify legado conserva mínimo de cinco y rate limiter oficial', async () => {
  const placeFunctions = await read('functions/geoapifyPlaceFunctions.js');
  const batchFunctions = await read('functions/geoapifyBatchFunctions.js');
  const support = await read('functions/geoapifySupport.js');

  assert.doesNotMatch(placeFunctions, /queryKey\.length < 3/);
  assert.match(placeFunctions, /queryKey\.length < 5/);
  assert.match(batchFunctions, /normalized\(query\)\.length < 5/);
  assert.match(placeFunctions, /Number\(request\.data\?\.limit\) \|\| 5/);
  assert.match(support, /RequestRateLimiter\.rateLimitedRequests/);
});

test('batch Geoapify usa una solicitud oficial de hasta mil entradas y exige autenticación', async () => {
  const source = await read('functions/geoapifyBatchFunctions.js');

  assert.match(source, /rawQueries\.length > 1000/);
  assert.match(source, /requireAuthenticated\(request\)/);
  assert.match(source, /\/v1\/batch\/geocode\/search/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /body: JSON\.stringify\(queries\)/);
  assert.match(source, /export const geoapifyBatchGeocodeResult/);
  assert.doesNotMatch(source, /const tasks = queries\.map/);
});

test('App Check queda fail-open por default y parametrizable de forma compatible con Functions 6', async () => {
  const policy = await read('functions/callablePolicy.js');
  const sources = await readCallableModules();
  const client = await read('src/infrastructure/firebase/firebaseClient.js');

  assert.match(policy, /export function parseAppCheckEnforcementEnv\(value\)/);
  assert.match(policy, /toLowerCase\(\) === 'true'/);
  assert.match(policy, /process\.env\.ENFORCE_APP_CHECK/);
  assert.match(policy, /enforceAppCheck:\s*ENFORCE_APP_CHECK/);
  assert.doesNotMatch(policy, /defineBoolean\('ENFORCE_APP_CHECK'/);
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
  const googleLocations = await read('functions/googlePlaceLocationFunction.js');
  const sources = `${cityFunctions}\n${placeFunctions}\n${batchFunctions}`;

  assert.match(cache, /expiresAt: Timestamp\.fromMillis/);
  assert.match(cache, /inFlightLoads/);
  assert.doesNotMatch(cache, /queryKey:/);
  assert.doesNotMatch(sources, /queryKey: key/);
  assert.match(cityFunctions, /citySearchCache/);
  assert.match(placeFunctions, /placeDetailsCache/);
  assert.match(batchFunctions, /geoapifyBatchJobs/);
  assert.match(googleLocations, /googlePlaceLocationCache/);
  assert.match(googleLocations, /29 \* 24 \* 60 \* 60 \* 1000/);
});

test('los datos temporales de proveedor pasan por una frontera cacheDb única', async () => {
  const runtime = await read('functions/geoapifyRuntime.js');
  const placeFunctions = await read('functions/geoapifyPlaceFunctions.js');
  const batchFunctions = await read('functions/geoapifyBatchFunctions.js');
  const countryBoundary = await read('functions/countryBoundaryFunction.js');
  const googleLocations = await read('functions/googlePlaceLocationFunction.js');

  assert.match(runtime, /export const cacheDb = db/);
  assert.match(runtime, /createSharedCache\(cacheDb/);
  assert.match(placeFunctions, /createSharedCache\(cacheDb/);
  assert.match(batchFunctions, /cacheDb\.bulkWriter\(\)/);
  assert.match(batchFunctions, /cacheDb\.collection\('geocodeCache'\)/);
  assert.match(batchFunctions, /cacheDb\.collection\('geoapifyBatchJobs'\)/);
  assert.match(countryBoundary, /cacheDb\.collection\('countryBoundaryCache'\)/);
  assert.match(googleLocations, /createSharedCache\(cacheDb/);

  assert.doesNotMatch(batchFunctions, /db\.collection\('(geocodeCache|geoapifyBatchJobs)'\)/);
  assert.doesNotMatch(countryBoundary, /db\.collection\('countryBoundaryCache'\)/);
  assert.doesNotMatch(googleLocations, /createSharedCache\(db/);
});

test('routing de Mis Rutas usa Geoapify para estimar y Google al seleccionar un modo', async () => {
  const geoapifyRoute = await read('functions/geoapifyRouteFunctions.js');
  const googleRoute = await read('functions/googleOptimizedRouteFunction.js');
  const googleRouteClient = await read('src/modules/routes/googleRouteClient.js');
  const connections = await read('src/modules/places/TripRouteConnections.jsx');
  const itineraryMap = await read('src/modules/map/ItineraryRouteMap.jsx');
  const tripEntities = await read('src/modules/trips/tripEntities.js');

  assert.match(geoapifyRoute, /export const geoapifyRoute/);
  assert.match(googleRoute, /export const googleRouteOptimized/);
  assert.match(googleRouteClient, /firebaseCallable\('googleRouteOptimized'\)/);
  assert.match(googleRouteClient, /return \{ placeId: place\.googlePlaceId \}/);
  assert.match(connections, /requestSavedPlaceRoute\(origin, destination, mode\)/);
  assert.match(connections, /requestGooglePlaceRoute\(/);
  assert.match(connections, /departureTime: mode === 'transit'/);
  assert.doesNotMatch(itineraryMap, /googleRouteOptimized|requestGooglePlaceRoute|geoapifyRoute/);
  assert.doesNotMatch(tripEntities, /segmentRoute|routeGeometry|routeSignature/);
});

test('functions index conserva una fachada y expone los endpoints de ambos proveedores', async () => {
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
    'googlePlaceAutocomplete',
    'googlePlaceSearch',
    'googlePlaceDetailsEssentials',
    'googlePlaceLocations',
    'googleRouteOptimized',
  ]) {
    assert.match(index, new RegExp(`\\b${endpoint}\\b`));
  }

  assert.ok(index.split('\n').length <= 36);
  assert.doesNotMatch(index, /onCall|enforceQuota|limitedFetch|initializeApp/);
});
