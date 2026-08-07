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

test('general Google search sends the literal query without itinerary context', async () => {
  const client = await read('src/modules/places/googlePlacesClient.js');
  const search = await read('src/modules/map/usePlaceSearch.js');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(client, /request\(\{ query: cleanQuery, language: config\.defaultLocale \}\)/);
  assert.doesNotMatch(client, /context:|contextualQuery|callableSearchContext|contextKey|segments|origin|destination/);
  assert.doesNotMatch(search, /searchContext|segments|origin|destination|useCitySearch|getGeocoder/);
  assert.doesNotMatch(googleMap, /placeSearchContext|searchContext|segment\.origin|segment\.destination/);
});

test('general search deduplicates only in-flight requests and does not persist Google result content', async () => {
  const client = await read('src/modules/places/googlePlacesClient.js');

  assert.match(client, /const pendingRequests = new Map\(\)/);
  assert.match(client, /cacheKey\('search-inflight', cleanQuery\)/);
  assert.match(client, /sharedRequest\(key/);
  assert.doesNotMatch(client, /setCached\(key, results\)|placeSearchCache|TEXT_SEARCH_CACHE/);
  assert.match(client, /const locationMemoryCache = new Map\(\)/);
  assert.match(client, /config\.googleMaps\.locationCacheKey/);
});

test('map search result markers do not load photos or category icons', async () => {
  const dom = await read('src/modules/map/placeMapDom.js');
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(dom, /button\.append\(copy\)/);
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
  assert.match(panel, /place\.name \|\| place\.userLabel/);
  assert.doesNotMatch(panel, /place\.category/);
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

test('CSP permits Geoapify for Itinerario and Google Maps hosts for Mis Rutas', async () => {
  const html = await read('index.html');
  const loader = await read('src/modules/map/googleMapsLoader.js');

  assert.match(html, /connect-src[^;]*https:\/\/\*\.geoapify\.com/);
  assert.match(html, /connect-src[^;]*https:\/\/maps\.googleapis\.com/);
  assert.match(html, /script-src[^;]*https:\/\/maps\.googleapis\.com/);
  assert.match(html, /script-src[^;]*https:\/\/maps\.gstatic\.com/);
  assert.match(html, /img-src[^;]*https:\/\/maps\.gstatic\.com/);
  assert.match(loader, /https:\/\/maps\.googleapis\.com\/maps\/api\/js/);
});
