import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { visitedCountries } from '../src/modules/map/countryColoring.js';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('el flujo activo de mapas usa Google y ya no monta MapLibre u Overture', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(routeMap, /<GooglePlacesMap/);
  assert.match(googleMap, /loadGoogleMaps\(\)/);
  assert.match(googleMap, /mapId: config\.googleMaps\.mapId/);
  assert.match(googleMap, /renderingType: RenderingType\.VECTOR/);
  assert.doesNotMatch(routeMap, /ItineraryRouteMap|maplibregl|pmtiles|Overture/);
  assert.doesNotMatch(googleMap, /maplibregl|pmtiles|Overture|createGeoapifyStyleUrl/);
});

test('el renderer legacy MapLibre/PMTiles fue retirado del árbol y de dependencias activas', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const packageLock = await read('package-lock.json');
  const configSource = await read('src/config.js');

  assert.equal(packageJson.dependencies?.['maplibre-gl'], undefined);
  assert.equal(packageJson.dependencies?.pmtiles, undefined);
  assert.doesNotMatch(packageLock, /maplibre-gl|pmtiles/i);
  assert.doesNotMatch(
    configSource,
    /VITE_GEOAPIFY_MAPS_API_KEY|VITE_GEOAPIFY_MAP_STYLE|VITE_COUNTRY_BOUNDARIES_PMTILES_URL/
  );

  await assert.rejects(
    read('src/modules/map/ItineraryRouteMap.jsx'),
    (error) => error?.code === 'ENOENT'
  );
  await assert.rejects(
    read('src/modules/map/routeMapSetup.js'),
    (error) => error?.code === 'ENOENT'
  );
  await assert.rejects(
    read('src/modules/map/overtureCountrySource.js'),
    (error) => error?.code === 'ENOENT'
  );
});

test('Itinerario pinta países visitados con COUNTRY y resuelve IDs mediante Places Text Search', async () => {
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const client = await read('src/modules/map/googleCountryBoundariesClient.js');
  const backend = await read('functions/googleCountryPlaceIdsFunction.js');
  const runtime = await read('functions/geoapifyRuntime.js');
  const functionsIndex = await read('functions/index.js');
  const config = await read('src/config.js');

  assert.match(googleMap, /visitedCountries\(segments, countryColorForIndex\)/);
  assert.match(googleMap, /map\.getFeatureLayer\?\.\('COUNTRY'\)/);
  assert.match(googleMap, /map\.getMapCapabilities\?\.\(\)/);
  assert.match(googleMap, /isDataDrivenStylingAvailable/);
  assert.match(googleMap, /map\.addListener\?\.\('mapcapabilities_changed', applyCountryStyle\)/);
  assert.match(googleMap, /countryLayer\.isAvailable/);
  assert.match(googleMap, /cachedGoogleCountryPlaceIds\(itineraryCountries\)/);
  assert.match(googleMap, /loadGoogleCountryPlaceIds\(itineraryCountries/);
  assert.match(googleMap, /fillColor: color/);
  assert.match(googleMap, /fillOpacity: 0\.16/);
  assert.match(googleMap, /strokeOpacity: 0/);
  assert.match(googleMap, /strokeWeight: 0/);
  assert.match(googleMap, /countryLayer\.style = null/);
  assert.doesNotMatch(
    googleMap,
    /capabilityListener\?\.remove\?\.\(\);\s*countryLayer\.style = null;/
  );

  assert.match(config, /countryColors:/);
  assert.match(config, /export function countryColorForIndex/);
  assert.match(client, /firebaseCallable\('googleCountryPlaceIds'\)/);
  assert.match(client, /MAX_COUNTRIES_PER_REQUEST = 10/);
  assert.match(client, /countryPlaceIdCacheKey/);
  assert.match(client, /countryPlaceIdCacheTtlMs/);
  assert.match(client, /export function cachedGoogleCountryPlaceIds/);
  assert.match(client, /language: config\.defaultLocale/);
  assert.match(client, /country: countryName/);
  assert.match(client, /\[Google Maps\] COUNTRY Place IDs:/);

  assert.match(runtime, /GOOGLE_PLACES_API_KEY/);
  assert.doesNotMatch(runtime, /GOOGLE_REGION_LOOKUP_API_KEY/);
  assert.match(backend, /places\.googleapis\.com\/v1/);
  assert.match(backend, /places:searchText/);
  assert.match(backend, /secrets: \[GOOGLE_PLACES_API_KEY\]/);
  assert.match(backend, /const COUNTRY_ID_FIELDS = 'places\.id'/);
  assert.doesNotMatch(backend, /includedType|strictTypeFiltering/);
  assert.match(backend, /pageSize: 1/);
  assert.match(backend, /googleCountryPlaceIdCacheV4/);
  assert.match(backend, /google-country-v4:/);
  assert.match(backend, /330 \* 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(backend, /regionlookup\.googleapis\.com|GOOGLE_REGION_LOOKUP_API_KEY/);

  assert.match(config, /atlas:google-country-place-ids:v4/);
  assert.match(functionsIndex, /googleCountryPlaceIds/);
});

test('la lógica de colores excluye origen y conserva orden entre varios países destino', () => {
  const segments = [
    {
      origin: { country: 'France', countryCode: 'FR', lat: 48.8566, lon: 2.3522 },
      destination: { country: 'Germany', countryCode: 'DE', lat: 52.52, lon: 13.405 },
    },
    {
      origin: { country: 'Germany', countryCode: 'DE', lat: 52.52, lon: 13.405 },
      destination: { country: 'Netherlands', countryCode: 'NL', lat: 52.3676, lon: 4.9041 },
    },
  ];
  const colors = ['#e23b3b', '#2563eb', '#7c3aed'];
  const countries = visitedCountries(segments, (index) => colors[index]);

  assert.deepEqual(countries.map((entry) => entry.countryCode), ['DE', 'NL']);
  assert.deepEqual(countries.map((entry) => entry.color), colors.slice(0, 2));
});
