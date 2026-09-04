// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Google place search preserves the configured minimum and maximum limits', async () => {
  const client = await read('src/modules/places/googlePlacesClient.js');
  const functions = await read('functions/googleMapsFunctions.js');
  const config = await read('src/config.js');

  assert.match(config, /searchMinChars: 4/);
  assert.match(config, /searchLimit: 5/);
  assert.match(client, /cleanQuery\.length < config\.googleMaps\.searchMinChars/);
  assert.match(client, /\.slice\(0, config\.googleMaps\.searchLimit\)/);
  assert.match(functions, /query\.length < 4/);
  assert.match(functions, /maxResultCount: 5/);
  assert.match(functions, /\.slice\(0, 5\)/);
});

test('general Google search sends the literal query to the provider', async () => {
  const client = await read('src/modules/places/googlePlacesClient.js');

  assert.match(client, /request\(\{ query: cleanQuery, language: config\.defaultLocale \}\)/);
});

test('general search keeps only in-flight dedupe and never persists result content', async () => {
  const client = await read('src/modules/places/googlePlacesClient.js');

  assert.match(client, /cacheKey\('search-inflight', cleanQuery\)/);
  assert.doesNotMatch(client, /setCached\(key, results\)|placeSearchCache|TEXT_SEARCH_CACHE/);
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

test('legacy places keep country/city while Google persistence keeps only stable reference and user label', async () => {
  const entities = await read('src/modules/trips/tripEntities.js');
  const panel = await read('src/modules/places/TripPlacesPanel.jsx');
  const dom = await read('src/modules/map/placeMapDom.js');

  assert.match(entities, /city:\s*sanitizeText/);
  assert.match(entities, /country:\s*sanitizeText/);
  assert.match(entities, /export function placeForPersistence/);
  assert.match(entities, /if \(!isGooglePlaceReference\(place\)\) return place/);
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

test('CSP permite todos los hosts dinámicos requeridos por Google Maps JavaScript', async () => {
  const html = await read('index.html');
  const loader = await read('src/modules/map/googleMapsLoader.js');

  assert.match(html, /img-src[^;]*https:\/\/\*\.googleapis\.com/);
  assert.match(html, /img-src[^;]*https:\/\/\*\.gstatic\.com/);
  assert.match(html, /img-src[^;]*https:\/\/\*\.google\.com/);
  assert.match(html, /img-src[^;]*https:\/\/\*\.googleusercontent\.com/);
  assert.match(html, /connect-src[^;]*https:\/\/\*\.googleapis\.com/);
  assert.match(html, /connect-src[^;]*https:\/\/\*\.gstatic\.com/);
  assert.match(html, /connect-src[^;]*https:\/\/\*\.google\.com/);
  assert.match(html, /script-src[^;]*'unsafe-eval'/);
  assert.match(html, /script-src[^;]*https:\/\/\*\.googleapis\.com/);
  assert.match(html, /script-src[^;]*https:\/\/\*\.gstatic\.com/);
  assert.match(html, /script-src[^;]*https:\/\/\*\.ggpht\.com/);
  assert.match(loader, /https:\/\/maps\.googleapis\.com\/maps\/api\/js/);
});
