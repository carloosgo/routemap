import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('el autocompletado de ciudades pertenece exclusivamente a Tramos', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const body = await read('src/modules/trips/SegmentBody.jsx');
  const cityAutocomplete = await read('src/components/CityAutocomplete.jsx');
  const citySearch = await read('src/modules/geocoding/useCitySearch.js');
  const provider = await read('src/modules/geocoding/geocodingProvider.js');
  const cityClient = await read('src/modules/geocoding/citySearchClient.js');

  assert.match(origin, /<CityAutocomplete[\s\S]*value=\{city\}[\s\S]*onSelect=\{onSelect\}/);
  assert.match(header, /<CityAutocomplete[\s\S]*value=\{destination\}[\s\S]*onSelect=\{onDestinationSelect\}/);
  assert.doesNotMatch(body, /CityAutocomplete/);
  assert.match(cityAutocomplete, /useCitySearch/);
  assert.match(citySearch, /getGeocoder\(\)\.search/);
  assert.match(provider, /createGeoapifyCityProvider/);
  assert.match(cityClient, /firebaseCallable\('geoapifyCityAutocomplete'\)/);

  const combined = `${origin}\n${header}\n${body}\n${cityAutocomplete}\n${citySearch}\n${provider}\n${cityClient}`;
  assert.doesNotMatch(combined, /usePlaceSearch|searchGooglePlaces|PlaceSearchForm|TripPlacesPanel|googlePlaceSearch/);
});

test('la búsqueda general Google no lee origen, destino ni módulos de ciudades', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const placeSearch = await read('src/modules/map/usePlaceSearch.js');
  const placeClient = await read('src/modules/places/googlePlacesClient.js');

  assert.match(routeMap, /<GooglePlacesMap/);
  assert.match(googleMap, /usePlaceSearch\(\{ viewMode \}\)/);
  assert.match(googleMap, /placesActive && mapConfigured/);
  assert.match(googleMap, /<PlaceSearchForm/);
  assert.doesNotMatch(routeMap, /placeSearchContext|searchContext|CityAutocomplete/);
  assert.doesNotMatch(placeSearch, /segments|origin|destination|useCitySearch|getGeocoder/);
  assert.doesNotMatch(placeClient, /contextualQuery|callableSearchContext|contextKey|searchContext|citySearchClient|geoapifyCityAutocomplete/);
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

test('Tramos y Mis Rutas comparten lienzo Google sin compartir lógica de dominio', async () => {
  const pane = await read('src/app/AppMapPane.jsx');
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const projection = await read('src/modules/map/itineraryMapProjection.js');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(pane, /<RouteMap[\s\S]*segments=\{trip\.segments\}[\s\S]*places=\{trip\.places \|\| \[\]\}/);
  assert.match(routeMap, /itineraryMapProjectionSignature\(segments\)/);
  assert.match(routeMap, /segments=\{mapSegments\}/);
  assert.match(routeMap, /places=\{places\}/);
  assert.match(routeMap, /viewMode=\{viewMode\}/);
  assert.match(projection, /export function itineraryMapProjection/);
  assert.match(googleMap, /buildMapFeatureData/);
  assert.match(googleMap, /const placesActive = viewMode === 'places'/);
  assert.doesNotMatch(googleMap, /updateSegment|addSegment|removeSegment|CityAutocomplete|geoapifyCityAutocomplete/);
});
