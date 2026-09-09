// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  cityMatchesQuery,
  matchingCityResults,
  preferredSearchProvider,
} from '../src/modules/map/searchIntentRouter.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('la búsqueda general enruta ciudades Geoapify y lugares Google de forma secuencial sin fan-out', async () => {
  const search = await read('src/modules/map/usePlaceSearch.js');
  const cityClient = await read('src/modules/geocoding/citySearchClient.js');
  const placeClient = await read('src/modules/places/googlePlacesClient.js');

  assert.match(search, /createGeoapifyCityProvider/);
  assert.match(search, /autocompleteGooglePlaces/);
  assert.match(search, /searchGooglePlaces/);
  assert.match(search, /preferredSearchProvider\(text\)/);
  assert.match(search, /matchingCityResults\(cities, text\)/);
  assert.match(search, /cityProviderRef\.current\.search\(text,[\s\S]*limit: config\.citySearchLimit,[\s\S]*language: locale/);
  assert.match(search, /if \(matchingCities\.length\) \{[\s\S]*setSuggestions\(matchingCities\.map\(citySearchResult\)\)[\s\S]*return;/);
  assert.match(search, /if \(matchingCities\.length\) \{[\s\S]*setResults\(matchingCities\.map\(citySearchResult\)\)[\s\S]*return;/);
  assert.match(search, /kind: 'city'/);
  assert.match(search, /kind: 'place'/);
  assert.doesNotMatch(search, /Promise\.allSettled\(/);
  assert.doesNotMatch(search, /\[\.\.\.citySuggestions, \.\.\.placeSuggestions\]/);
  assert.doesNotMatch(search, /setResults\(\[\.\.\.cities, \.\.\.places\]\)/);

  assert.match(cityClient, /firebaseCallable\('geoapifyCityAutocomplete'\)/);
  assert.doesNotMatch(cityClient, /googlePlaceSearch|googlePlaceAutocomplete|googlePlacesClient/);
  assert.doesNotMatch(placeClient, /geoapifyCityAutocomplete|citySearchClient|createGeoapifyCityProvider/);
});

test('el router reconoce señales claras de lugar y deja las búsquedas de ciudad en Geoapify', () => {
  assert.equal(preferredSearchProvider('Madrid'), 'city');
  assert.equal(preferredSearchProvider('Rothenburg ob der Tauber'), 'city');
  assert.equal(preferredSearchProvider('Museo del Prado'), 'google');
  assert.equal(preferredSearchProvider('Hotel Adlon Berlin'), 'google');
  assert.equal(preferredSearchProvider('Alexanderplatz 3'), 'google');
  assert.equal(preferredSearchProvider(''), 'city');
});

test('el fallback de ciudad sólo acepta coincidencias que realmente corresponden a la consulta', () => {
  const results = [
    { name: 'Madrid', region: 'Comunidad de Madrid', country: 'España', countryCode: 'ES' },
    { name: 'Madera', region: 'California', country: 'Estados Unidos', countryCode: 'US' },
    { name: 'Berlin', region: 'Berlin', country: 'Deutschland', countryCode: 'DE' },
  ];

  assert.equal(cityMatchesQuery(results[0], 'Madrid'), true);
  assert.equal(cityMatchesQuery(results[0], 'Madrid España'), true);
  assert.equal(cityMatchesQuery(results[1], 'Madrid'), false);
  assert.equal(cityMatchesQuery(results[2], 'Madrid'), false);
  assert.deepEqual(matchingCityResults(results, 'Madrid').map((city) => city.name), ['Madrid']);
});

test('el buscador unificado conserva políticas independientes por proveedor', async () => {
  const search = await read('src/modules/map/usePlaceSearch.js');
  const config = await read('src/config.js');

  assert.match(config, /citySearchMinChars:\s*3/);
  assert.match(config, /citySearchDebounceMs:\s*450/);
  assert.match(config, /citySearchLimit:\s*5/);
  assert.match(config, /googleMaps:\s*\{[\s\S]*searchMinChars:\s*4/);
  assert.match(config, /googleMaps:\s*\{[\s\S]*searchDebounceMs:\s*1000/);
  assert.match(search, /config\.citySearchDebounceMs/);
  assert.match(search, /config\.googleMaps\.searchDebounceMs/);
  assert.match(search, /text\.length < config\.googleMaps\.searchMinChars/);
  assert.match(search, /minChars: UNIFIED_SEARCH_MIN_CHARS/);
});

test('el modelo v4 nunca guarda lugares ni routing dentro de un tramo', async () => {
  const entities = await read('src/modules/trips/tripEntities.js');
  const savePlan = await read('src/infrastructure/firebase/v4TripSavePlan.js');
  const rules = await read('firestore.rules');

  const createSegmentBlock = entities.slice(
    entities.indexOf('export function createSegment'),
    entities.indexOf('export function createNote')
  );

  assert.doesNotMatch(createSegmentBlock, /places\s*:|route\s*:/);
  assert.match(entities, /const legacyPlaces = rawSegments\.flatMap/);
  assert.match(savePlan, /tripField: 'segments', entityType: 'segment'/);
  assert.match(savePlan, /tripField: 'places', entityType: 'place'/);
  assert.match(savePlan, /tripField: 'routeConnections', entityType: 'connection'/);
  assert.doesNotMatch(rules, /'route'/);
});

test('el mapa unificado renderiza ciudades, lugares y rutas sin asumir el origen como pivote', async () => {
  const pane = await read('src/app/AppMapPane.jsx');
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const projection = await read('src/modules/map/itineraryMapProjection.js');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(pane, /origin=\{unifiedRoutesView \? null : trip\.origin\}/);
  assert.match(pane, /addPlace=\{requestPlaceSave\}/);
  assert.match(pane, /addCity=\{requestCityAdd\}/);
  assert.match(routeMap, /itineraryMapProjectionSignature\(origin, segments\)/);
  assert.match(routeMap, /segments=\{mapSegments\}/);
  assert.match(routeMap, /places=\{places\}/);
  assert.match(routeMap, /viewMode=\{viewMode\}/);
  assert.match(projection, /if \(isPlaced\(origin\)\)/);
  assert.match(projection, /origin: index === 0\s*\? null/);
  assert.match(googleMap, /buildMapFeatureData/);
  assert.match(googleMap, /const placesActive = viewMode === 'places'/);
  assert.doesNotMatch(googleMap, /updateSegment|removeSegment|CityAutocomplete/);
});
