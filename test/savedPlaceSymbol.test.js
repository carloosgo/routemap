import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { colorForIndex } from '../src/config.js';
import { buildMapFeatureData, placeCountryKey } from '../src/modules/map/routeMapModel.js';

const root = new globalThis.URL('../', import.meta.url);
const read = (path) => readFile(new globalThis.URL(path, root), 'utf8');

test('saved places use one tintable MapLibre symbol with a country-colored fallback', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const symbol = await read('src/modules/map/savedPlaceSymbol.js');
  const setup = await read('src/modules/map/routeMapSetup.js');

  assert.match(routeMap, /installSavedPlaceSymbolLayer\(map\)/);
  assert.match(symbol, /atlas-saved-place-pin/);
  assert.match(symbol, /atlas-saved-places-symbol/);
  assert.match(symbol, /map\.addImage\(PLACE_ICON_ID, image, \{ pixelRatio: 2, sdf: true \}\)/);
  assert.match(symbol, /'icon-color': \['coalesce', \['get', 'color'\], '#19a5d0'\]/);
  assert.match(symbol, /image\.width = 52/);
  assert.match(symbol, /image\.height = 56/);
  assert.match(symbol, /type: 'symbol'/);
  assert.match(symbol, /'icon-anchor': 'bottom'/);
  assert.match(symbol, /'icon-allow-overlap': true/);
  assert.match(symbol, /'icon-ignore-placement': true/);
  assert.match(symbol, /circle-opacity', 0\.001/);
  assert.match(symbol, /circle fallback/);
  assert.match(setup, /'circle-color': \['coalesce', \['get', 'color'\], '#2563eb'\]/);
});

test('saved place pin is a transparent monochrome SVG suitable for SDF tinting', async () => {
  const icon = await read('src/assets/map/saved-place-pin.svg');

  assert.match(icon, /width="52" height="56" viewBox="0 0 52 56"/);
  assert.match(icon, /<mask id="saved-place-pin-mask">/);
  assert.match(icon, /<circle[^>]+cx="26"[^>]+cy="22\.5"[^>]+r="3\.25"[^>]+fill="#000000"/);
  assert.match(icon, /mask="url\(#saved-place-pin-mask\)"/);
  assert.equal((icon.match(/fill="#000000"/g) || []).length, 2);
  assert.doesNotMatch(icon, /#19a5d0|#009dcc|#ffeed1|#68807f|#4d4d4d|#dadada/);
  assert.doesNotMatch(icon, /<image\b|data:image\/|<metadata>/i);
});

test('all saved places in one country share a color and different countries use different colors', () => {
  const places = [
    { id: 'fr-1', name: 'Louvre', country: 'France', countryCode: 'FR', lat: 48.86, lon: 2.34 },
    { id: 'fr-2', name: 'Versailles', country: 'France', countryCode: 'fr', lat: 48.8, lon: 2.12 },
    { id: 'de-1', name: 'Brandenburg Gate', country: 'Germany', countryCode: 'DE', lat: 52.51, lon: 13.37 },
    { id: 'jp-1', name: 'Senso-ji', country: 'Japan', countryCode: 'JP', lat: 35.71, lon: 139.79 },
  ];

  const { placeFeatures } = buildMapFeatureData({
    segments: [],
    places,
    viewMode: 'places',
    colorForIndex,
  });
  const properties = Object.fromEntries(
    placeFeatures.map((feature) => [feature.properties.id, feature.properties])
  );

  assert.equal(placeCountryKey(places[0]), 'code:FR');
  assert.equal(placeCountryKey(places[1]), 'code:FR');
  assert.equal(properties['fr-1'].color, properties['fr-2'].color);
  assert.notEqual(properties['fr-1'].color, properties['de-1'].color);
  assert.notEqual(properties['fr-1'].color, properties['jp-1'].color);
  assert.notEqual(properties['de-1'].color, properties['jp-1'].color);
});

test('country names are normalized when a saved place has no ISO country code', () => {
  const places = [
    { id: 'mx-1', country: 'México', lat: 19.43, lon: -99.13 },
    { id: 'mx-2', country: ' mexico ', lat: 20.67, lon: -103.35 },
  ];
  const { placeFeatures } = buildMapFeatureData({
    segments: [],
    places,
    viewMode: 'places',
    colorForIndex,
  });

  assert.equal(placeCountryKey(places[0]), 'name:mexico');
  assert.equal(placeCountryKey(places[1]), 'name:mexico');
  assert.equal(placeFeatures[0].properties.color, placeFeatures[1].properties.color);
});

test('saved place popup adds a lazy country flag only for ISO2 codes', async () => {
  const dom = await read('src/modules/map/placeMapDom.js');
  const css = await read('src/modules/map/SavedPlaceSymbol.css');

  assert.match(dom, /function normalizedCountryCode/);
  assert.match(dom, /\/\^\[a-z\]\{2\}\$\//);
  assert.match(dom, /https:\/\/flagcdn\.com\/24x18\/\$\{code\}\.png/);
  assert.match(dom, /loading="lazy"/);
  assert.match(dom, /decoding="async"/);
  assert.match(dom, /flagImage\?\.addEventListener\('error'/);
  assert.match(css, /\.place-popup__flag/);
  assert.match(css, /width:24px/);
  assert.match(css, /height:18px/);
});
