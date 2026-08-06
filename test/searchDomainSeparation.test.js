import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el autocompletado de ciudades pertenece exclusivamente a Tramos', async () => {
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const cityAutocomplete = await read('src/components/CityAutocomplete.jsx');
  const citySearch = await read('src/modules/geocoding/useCitySearch.js');
  const provider = await read('src/modules/geocoding/geocodingProvider.js');
  const cityClient = await read('src/modules/geocoding/citySearchClient.js');

  assert.match(header, /<CityAutocomplete[\s\S]*segment\.origin/);
  assert.match(header, /<CityAutocomplete[\s\S]*segment\.destination/);
  assert.match(cityAutocomplete, /useCitySearch/);
  assert.match(citySearch, /getGeocoder\(\)\.search/);
  assert.match(provider, /createGeoapifyCityProvider/);
  assert.match(cityClient, /firebaseCallable\('geoapifyCityAutocomplete'\)/);

  const combined = `${cityAutocomplete}\n${citySearch}\n${provider}\n${cityClient}`;
  assert.doesNotMatch(combined, /usePlaceSearch|searchGeoapifyPlaces|PlaceSearchForm|TripPlacesPanel|geoapifyPlaceSearch/);
});

test('la búsqueda general no lee origen, destino ni módulos de ciudades', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const placeSearch = await read('src/modules/map/usePlaceSearch.js');
  const placeClient = await read('src/modules/places/geoapifyClient.js');
  const placeQuery = await read('src/modules/places/geoapifyQuery.js');

  assert.match(routeMap, /viewMode === 'places' && \([\s\S]*<PlaceSearchForm/);
  assert.match(routeMap, /usePlaceSearch\(\{ viewMode \}\)/);
  assert.doesNotMatch(routeMap, /placeSearchContext|searchContext/);
  assert.doesNotMatch(placeSearch, /segments|origin|destination|useCitySearch|getGeocoder/);
  assert.doesNotMatch(placeClient, /contextualQuery|callableSearchContext|contextKey|searchContext|citySearchClient|geoapifyCityAutocomplete/);
  assert.doesNotMatch(placeQuery, /knownLocations|city|country|lat|lon/);
});

test('el modelo actual nunca guarda lugares ni routing dentro de un tramo', async () => {
  const entities = await read('src/modules/trips/tripEntities.js');
  const storage = await read('src/infrastructure/firebase/tripStorageSchema.js');
  const rules = await read('firestore.rules');

  const createSegmentBlock = entities.slice(
    entities.indexOf('export function createSegment'),
    entities.indexOf('export function createNote')
  );

  assert.doesNotMatch(createSegmentBlock, /places\s*:|route\s*:/);
  assert.match(entities, /const legacyPlaces = rawSegments\.flatMap/);
  assert.match(storage, /delete stored\.places/);
  assert.doesNotMatch(rules, /'route'/);
});

test('Tramos y búsqueda general solo convergen en el render del mapa', async () => {
  const pane = await read('src/app/AppMapPane.jsx');
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const model = await read('src/modules/map/routeMapModel.js');

  assert.match(pane, /<RouteMap[\s\S]*segments=\{trip\.segments\}[\s\S]*places=\{trip\.places \|\| \[\]\}/);
  assert.match(model, /const showSegments = viewMode === 'segments'/);
  assert.match(model, /const showPlaces = viewMode === 'places'/);
  assert.doesNotMatch(model, /placeSearchContext|requestGeoapifyRoute/);
  assert.doesNotMatch(routeMap, /updateSegment|addSegment|removeSegment|CityAutocomplete/);
});
