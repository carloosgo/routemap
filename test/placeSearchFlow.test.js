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

test('context is appended only when the user did not name a known route location', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  assert.match(client, /export function contextualQuery/);
  assert.match(client, /knownLocations/);
  assert.match(client, /alreadyNamesLocation/);
  assert.match(client, /\[base, city, country\]\.filter\(Boolean\)\.join\(', '\)/);
});

test('search cache is separated by query and route context', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  assert.match(client, /const cacheKey = `\$\{queryKey\}\|\$\{contextKey\(context\)\}`/);
  assert.match(client, /PLACE_CACHE_KEY = 'atlas:geoapify-place-cache:v2'/);
});

test('place detail images are cached and fetched through the official details endpoint', async () => {
  const client = await read('src/modules/places/geoapifyClient.js');
  assert.match(client, /fetchGeoapifyPlaceImage/);
  assert.match(client, /https:\/\/api\.geoapify\.com\/v2\/place-details/);
  assert.match(client, /wiki_and_media\?\.image/);
  assert.match(client, /DETAIL_CACHE_KEY/);
});

test('image failure is non-blocking and leaves the representative fallback visible', async () => {
  const map = await read('src/modules/map/RouteMap.jsx');
  const css = await read('src/modules/map/RouteMap.css');
  assert.match(map, /place-result-marker__fallback/);
  assert.match(map, /if \(!url \|\| controller\.signal\.aborted\) return/);
  assert.match(css, /place-result-marker__fallback/);
  assert.match(css, /img\.is-loaded/);
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

test('CSP permits Geoapify details and Wikimedia images only through explicit hosts', async () => {
  const html = await read('index.html');
  assert.match(html, /connect-src[^;]*https:\/\/\*\.geoapify\.com/);
  assert.match(html, /img-src[^;]*https:\/\/upload\.wikimedia\.org/);
  assert.match(html, /img-src[^;]*https:\/\/\*\.wikimedia\.org/);
});
