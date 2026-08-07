import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  countryFillStyleState,
  vividCountryColor,
  visitedCountries,
} from '../src/modules/map/countryColoring.js';

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
  assert.match(googleMap, /loadGoogleCountryPlaceIds\(itineraryCountries/);
  assert.match(googleMap, /fillColor: color/);
  assert.match(googleMap, /fillOpacity: 0\.20/);
  assert.match(googleMap, /strokeOpacity: 0/);
  assert.match(googleMap, /strokeWeight: 0/);
  assert.match(googleMap, /countryLayer\.style = null/);

  assert.match(config, /countryColors:/);
  assert.match(config, /export function countryColorForIndex/);
  assert.match(client, /firebaseCallable\('googleCountryPlaceIds'\)/);
  assert.match(client, /MAX_COUNTRIES_PER_REQUEST = 10/);
  assert.match(client, /countryPlaceIdCacheKey/);
  assert.match(client, /countryPlaceIdCacheTtlMs/);
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

test('la lógica de colores de país conserva orden, distinción y relleno vivo', () => {
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

  assert.deepEqual(countries.map((entry) => entry.countryCode), ['FR', 'DE', 'NL']);
  assert.deepEqual(countries.map((entry) => entry.color), colors);
  assert.equal(vividCountryColor(colors[0]), '#f84e4e');
  assert.equal(vividCountryColor(colors[1]), '#3a78ff');
  assert.equal(vividCountryColor(colors[2]), '#9151ff');
});

test('la fachada histórica de estilo MapLibre permanece determinista mientras no se usa en el render activo', () => {
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

  assert.deepEqual(state.colorExpression, [
    'match',
    ['get', 'country'],
    'FR', '#f84e4e',
    'DE', '#3a78ff',
    'NL', '#9151ff',
    'transparent',
  ]);
});