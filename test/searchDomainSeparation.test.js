import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('la búsqueda general compone ciudades Geoapify y lugares Google sin mezclar sus clientes', async () => {
  const search = await read('src/modules/map/usePlaceSearch.js');
  const cityClient = await read('src/modules/geocoding/citySearchClient.js');
  const placeClient = await read('src/modules/places/googlePlacesClient.js');

  assert.match(search, /createGeoapifyCityProvider/);
  assert.match(search, /autocompleteGooglePlaces/);
  assert.match(search, /searchGooglePlaces/);
  assert.match(search, /Promise\.allSettled\(\[[\s\S]*autocompleteGooglePlaces[\s\S]*cityProviderRef\.current\.search/);
  assert.match(search, /Promise\.allSettled\(\[[\s\S]*searchGooglePlaces[\s\S]*cityProviderRef\.current\.search/);
  assert.match(search, /setSuggestions\(\[\.\.\.citySuggestions, \.\.\.placeSuggestions\]\)/);
  assert.match(search, /setResults\(\[\.\.\.cities, \.\.\.places\]\)/);
  assert.match(search, /kind: 'city'/);
  assert.match(search, /kind: 'place'/);

  assert.match(cityClient, /firebaseCallable\('geoapifyCityAutocomplete'\)/);
  assert.doesNotMatch(cityClient, /googlePlaceSearch|googlePlaceAutocomplete|googlePlacesClient/);
  assert.doesNotMatch(placeClient, /geoapifyCityAutocomplete|citySearchClient|createGeoapifyCityProvider/);
});

test('el buscador unificado conserva políticas independientes por proveedor', async () => {
  const search = await read('src/modules/map/usePlaceSearch.js');
  const config = await read('src/config.js');

  assert.match(config, /citySearchMinChars:\s*3/);
  assert.match(config, /citySearchLimit:\s*5/);
  assert.match(config, /googleMaps:\s*\{[\s\S]*searchMinChars:\s*4/);
  assert.match(config, /googleMaps:\s*\{[\s\S]*searchDebounceMs:\s*1000/);
  assert.match(search, /limit: 3,[\s\S]*language: locale/);
  assert.match(search, /limit: config\.citySearchLimit,[\s\S]*language: locale/);
  assert.match(search, /text\.length < config\.googleMaps\.searchMinChars/);
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
