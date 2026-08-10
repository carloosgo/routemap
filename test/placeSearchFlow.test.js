import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Google place search preserves the configured minimum and maximum limits', async () => {
  const config = await read('src/config.js');
  const functions = await read('functions/googleMapsFunctions.js');

  assert.match(config, /googleMaps:[\s\S]*searchMinChars:\s*4/);
  assert.match(config, /googleMaps:[\s\S]*searchLimit:\s*5/);
  assert.match(functions, /const SEARCH_MIN_CHARS = 4/);
  assert.match(functions, /const SEARCH_LIMIT = 5/);
});

test('general Google search sends the literal query without itinerary context', async () => {
  const functions = await read('functions/googleMapsFunctions.js');
  const client = await read('src/modules/places/googlePlacesClient.js');

  assert.match(functions, /textQuery:\s*query/);
  assert.doesNotMatch(functions, /origin|destination|routeCities|itinerary/i);
  assert.match(client, /searchGooglePlaces\(query/);
  assert.doesNotMatch(client, /context|origin|destination|routeCities/);
});

test('general search deduplicates only in-flight requests and does not persist Google result content', async () => {
  const client = await read('src/modules/places/googlePlacesClient.js');

  assert.match(client, /pendingRequests = new Map/);
  assert.match(client, /sharedRequest/);
  assert.doesNotMatch(client, /placeCache|searchCache|sessionStorage/);
  assert.match(client, /rememberPlaceLocation/);
});

test('map search result markers use one card with inline save and no photos or category icons', async () => {
  const dom = await read('src/modules/map/placeMapDom.js');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(dom, /wrap\.append\(copy, action\)/);
  assert.match(dom, /place-result-marker__save/);
  assert.match(dom, /place-result-marker__saved/);
  assert.match(googleMap, /markerElement\(place, t, \{/);
  assert.doesNotMatch(dom, /representativePlaceIcon|place-result-marker__media|place-result-marker__fallback/);
  assert.doesNotMatch(googleMap, /fetchGooglePlacePhoto|photoUri|photos\[/);
  assert.doesNotMatch(googleMap, /representativePlaceIcon/);
});

test('place persistence keeps stable references and excludes provider enrichment', async () => {
  const entities = await read('src/modules/trips/tripEntities.js');
  const panel = await read('src/modules/places/TripPlacesPanel.jsx');
  const dom = await read('src/modules/map/placeMapDom.js');

  assert.match(entities, /city:\s*sanitizeText/);
  assert.match(entities, /country:\s*sanitizeText/);
  assert.match(entities, /export function placeForPersistence/);
  assert.match(entities, /withoutPlaceEnrichment\(place\)/);
  assert.match(entities, /delete persisted\.website/);
  assert.match(entities, /delete persisted\.openingHours/);
  assert.match(entities, /delete persisted\.geoapifyDetailsAt/);
  assert.match(entities, /name: ''/);
  assert.match(entities, /city: ''/);
  assert.match(entities, /country: ''/);
  assert.match(entities, /lat: null/);
  assert.match(entities, /lon: null/);
  assert.match(entities, /userLabel: sanitizeText/);
  assert.match(panel, /function placeLabel\(place, t\)/);
  assert.match(panel, /place\?\.name \|\| place\?\.userLabel \|\| t\('place'\)/);
  assert.match(panel, /const label = placeLabel\(place, t\)/);
  assert.doesNotMatch(panel, /place\.category/);
  assert.doesNotMatch(dom, /place\.category/);
});

test('places, notes and mobile itinerary navigation use distinct icons', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const workspace = await read('src/app/AppWorkspace.jsx');
  const navigation = `${editor}\n${workspace}`;

  assert.match(navigation, /lugares-storefront-v2\.svg/);
  assert.match(navigation, /IconNotes/);
  assert.match(navigation, /IconMap/);
});
