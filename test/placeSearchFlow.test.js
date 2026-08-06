import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('place search preserves the configured minimum and maximum limits', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  const functions = await read('functions/geoapifyPlaceFunctions.js');
  assert.match(client, /queryKey\.length < config\.geoapify\.searchMinChars/);
  assert.match(client, /limit: config\.geoapify\.searchLimit/);
  assert.match(functions, /Math\.min\(Math\.max\(Number\(request\.data\?\.limit\) \|\| 5, 1\), 5\)/);
});

test('general search sends the literal query without itinerary context', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  const search = await read('src/modules/map/usePlaceSearch.js');
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const query = await read('src/modules/places/geoapifyQuery.js');

  assert.match(client, /query: cleanQuery/);
  assert.doesNotMatch(client, /context:|contextualQuery|callableSearchContext|contextKey/);
  assert.doesNotMatch(search, /searchContext|segments|origin|destination/);
  assert.doesNotMatch(routeMap, /placeSearchContext|searchContext/);
  assert.match(query, /export function normalizeSearchKey/);
  assert.doesNotMatch(query, /contextualQuery|knownLocations|callableSearchContext/);
});

test('search cache is separated only by normalized general query', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  const cache = await read('src/modules/places/geoapifyClientCache.js');
  assert.match(client, /placeCache\.getFresh\(queryKey,/);
  assert.match(client, /placeCache\.set\(queryKey, \{ result \}\)/);
  assert.doesNotMatch(client, /contextKey|cacheKey = `\$\{queryKey\}/);
  assert.match(cache, /PLACE_CACHE_KEY = 'atlas:geoapify-place-cache:v3'/);
});

test('map search result markers do not load images or category icons', async () => {
  const dom = await read('src/modules/map/placeMapDom.js');
  const markers = await read('src/modules/map/usePlaceResultMarkers.js');
  const routeMap = await read('src/modules/map/RouteMap.jsx');

  assert.match(dom, /button\.append\(copy\)/);
  assert.doesNotMatch(dom, /representativePlaceIcon|place-result-marker__media|place-result-marker__fallback/);
  assert.doesNotMatch(dom, /document\.createElement\('img'\)/);
  assert.doesNotMatch(markers, /fetchGeoapifyPlaceImage|AbortController|image\.src/);
  assert.doesNotMatch(routeMap, /representativePlaceIcon/);
});

test('saved places keep location data but hide category labels from the map and panel', async () => {
  const entities = await read('src/modules/trips/tripEntities.js');
  const panel = await read('src/modules/places/TripPlacesPanel.jsx');
  const dom = await read('src/modules/map/placeMapDom.js');

  assert.match(entities, /city:\s*sanitizeText/);
  assert.match(entities, /country:\s*sanitizeText/);
  assert.match(panel, /flagImageUrl/);
  assert.match(panel, /countryCode/);
  assert.doesNotMatch(panel, /place\.category|<small>/);
  assert.doesNotMatch(dom, /place\.category/);
});

test('places, notes and mobile itinerary navigation use distinct icons', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const workspace = await read('src/app/AppWorkspace.jsx');
  const navigation = `${editor}\n${workspace}`;

  assert.match(editor, /import lugaresIcon from '\.\.\/assets\/lugares-storefront-v2\.svg'/);
  assert.match(editor, /data-tab-icon="places-map-pin"[\s\S]*<img src=\{lugaresIcon\} alt="" \/>/);
  assert.match(editor, /data-tab-icon="notes"[\s\S]*<IconNotes \/>/);
  assert.match(workspace, /<IconRoute size=\{16\} aria-hidden="true" \/> \{t\('itinerary'\)\}/);
  assert.doesNotMatch(navigation, /IconMapPin|IconNotebook/);
});

test('CSP permits Geoapify and explicit image hosts required by remaining map content', async () => {
  const html = await read('index.html');
  assert.match(html, /connect-src[^;]*https:\/\/\*\.geoapify\.com/);
  assert.match(html, /img-src[^;]*https:\/\/upload\.wikimedia\.org/);
  assert.match(html, /img-src[^;]*https:\/\/\*\.wikimedia\.org/);
});
