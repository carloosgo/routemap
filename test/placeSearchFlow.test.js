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

test('generic one-word searches use route context but specific searches remain literal', async () => {
  const query = await read('src/modules/places/geoapifyQuery.js');
  assert.match(query, /export function contextualQuery/);
  assert.match(query, /knownLocations/);
  assert.match(query, /explicitlyNamesLocation/);
  assert.match(query, /isGenericSingleTerm/);
  assert.match(query, /\[base, city, country\]\.filter\(Boolean\)\.join\(', '\)/);
});

test('search cache is separated by query and route context', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  const cache = await read('src/modules/places/geoapifyClientCache.js');
  assert.match(client, /const cacheKey = `\$\{queryKey\}\|\$\{contextKey\(context\)\}`/);
  assert.match(cache, /PLACE_CACHE_KEY = 'atlas:geoapify-place-cache:v3'/);
});

test('place detail images are cached and fetched through the Firebase proxy', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  const cache = await read('src/modules/places/geoapifyClientCache.js');
  const functions = await read('functions/geoapifyPlaceFunctions.js');
  assert.match(client, /fetchGeoapifyPlaceImage/);
  assert.match(client, /callable\('geoapifyPlaceDetails'\)/);
  assert.doesNotMatch(client, /https:\/\/api\.geoapify\.com\/v2\/place-details/);
  assert.match(cache, /DETAIL_CACHE_KEY/);
  assert.match(functions, /export const geoapifyPlaceDetails/);
  assert.match(functions, /https:\/\/api\.geoapify\.com\/v2\/place-details/);
  assert.match(functions, /wiki_and_media\?\.image/);
});

test('image failure is non-blocking and leaves an icon fallback visible', async () => {
  const dom = await read('src/modules/map/placeMapDom.js');
  const markers = await read('src/modules/map/usePlaceResultMarkers.js');
  const css = await read('src/modules/map/RouteMap.css');
  assert.match(dom, /place-result-marker__fallback/);
  assert.match(dom, /representativePlaceIcon/);
  assert.match(markers, /if \(!url \|\| controller\.signal\.aborted\) return/);
  assert.match(dom, /addEventListener\('error'/);
  assert.match(css, /place-result-marker__fallback/);
  assert.match(css, /img\.is-loaded\{display:block\}/);
});

test('saved places include city, country, type and country flag', async () => {
  const entities = await read('src/modules/trips/tripEntities.js');
  const panel = await read('src/modules/places/TripPlacesPanel.jsx');
  assert.match(entities, /city:\s*sanitizeText/);
  assert.match(entities, /country:\s*sanitizeText/);
  assert.match(entities, /category:\s*sanitizeText/);
  assert.match(panel, /flagImageUrl/);
  assert.match(panel, /countryCode/);
});

test('places, notes and mobile route navigation use distinct icons', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const workspace = await read('src/app/AppWorkspace.jsx');
  const navigation = `${editor}\n${workspace}`;

  assert.match(editor, /import lugaresIcon from '\.\.\/assets\/lugares-storefront-v2\.svg'/);
  assert.match(editor, /data-tab-icon="places-map-pin"[\s\S]*<img src=\{lugaresIcon\} alt="" \/>/);
  assert.match(editor, /data-tab-icon="notes"[\s\S]*<IconNotes \/>/);
  assert.match(workspace, /<IconRoute size=\{16\} aria-hidden="true" \/> \{t\('segments'\)\}/);
  assert.doesNotMatch(navigation, /IconMapPin|IconNotebook/);
});

test('CSP permits Geoapify details and Wikimedia images only through explicit hosts', async () => {
  const html = await read('index.html');
  assert.match(html, /connect-src[^;]*https:\/\/\*\.geoapify\.com/);
  assert.match(html, /img-src[^;]*https:\/\/upload\.wikimedia\.org/);
  assert.match(html, /img-src[^;]*https:\/\/\*\.wikimedia\.org/);
});
