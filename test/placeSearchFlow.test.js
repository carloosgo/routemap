import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('place search preserves the configured minimum and maximum limits', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  const functions = await read('functions/index.js');
  assert.match(client, /queryKey\.length < config\.geoapify\.searchMinChars/);
  assert.match(client, /limit: config\.geoapify\.searchLimit/);
  assert.match(functions, /Math\.min\(Math\.max\(Number\(request\.data\?\.limit\) \|\| 5, 1\), 5\)/);
});

test('generic one-word searches use route context but specific searches remain literal', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  assert.match(client, /export function contextualQuery/);
  assert.match(client, /knownLocations/);
  assert.match(client, /explicitlyNamesLocation/);
  assert.match(client, /isGenericSingleTerm/);
  assert.match(client, /\[base, city, country\]\.filter\(Boolean\)\.join\(', '\)/);
});

test('search cache is separated by query and route context', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  assert.match(client, /const cacheKey = `\$\{queryKey\}\|\$\{contextKey\(context\)\}`/);
  assert.match(client, /PLACE_CACHE_KEY = 'atlas:geoapify-place-cache:v3'/);
});

test('place detail images are cached and fetched through the official details endpoint', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  assert.match(client, /fetchGeoapifyPlaceImage/);
  assert.match(client, /https:\/\/api\.geoapify\.com\/v2\/place-details/);
  assert.match(client, /wiki_and_media\?\.image/);
  assert.match(client, /DETAIL_CACHE_KEY/);
});

test('image failure is non-blocking and leaves an icon fallback visible', async () => {
  const map = await read('src/modules/map/RouteMap.jsx');
  const css = await read('src/modules/map/RouteMap.css');
  assert.match(map, /place-result-marker__fallback/);
  assert.match(map, /representativePlaceIcon/);
  assert.match(map, /if \(!url \|\| controller\.signal\.aborted\) return/);
  assert.match(map, /addEventListener\('error'/);
  assert.match(css, /place-result-marker__fallback/);
  assert.match(css, /img\.is-loaded\{display:block\}/);
});

test('saved places include city, country, type and country flag', async () => {
  const model = await read('src/modules/trips/tripModel.js');
  const panel = await read('src/modules/places/TripPlacesPanel.jsx');
  assert.match(model, /city:sanitizeText/);
  assert.match(model, /country:sanitizeText/);
  assert.match(model, /category:sanitizeText/);
  assert.match(panel, /flagImageUrl/);
  assert.match(panel, /countryCode/);
});

test('places, notes and mobile route navigation use distinct icons', async () => {
  const app = await read('src/App.jsx');
  assert.match(app, /import lugaresIcon from '\.\/assets\/lugares-storefront-v2\.svg'/);
  assert.match(app, /data-tab-icon="places-map-pin"[\s\S]*<img src=\{lugaresIcon\} alt="" \/>/);
  assert.match(app, /data-tab-icon="notes"[\s\S]*<IconNotes \/>/);
  assert.match(app, /<IconRoute size=\{16\} aria-hidden="true" \/> \{t\('segments'\)\}/);
  assert.doesNotMatch(app, /IconMapPin|IconNotebook/);
});

test('CSP permits Geoapify details and Wikimedia images only through explicit hosts', async () => {
  const html = await read('index.html');
  assert.match(html, /connect-src[^;]*https:\/\/\*\.geoapify\.com/);
  assert.match(html, /img-src[^;]*https:\/\/upload\.wikimedia\.org/);
  assert.match(html, /img-src[^;]*https:\/\/\*\.wikimedia\.org/);
});
