import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { colorForIndex } from '../src/config.js';
import { buildMapFeatureData, placeCountryKey } from '../src/modules/map/routeMapModel.js';
import {
  SAVED_PLACE_MARKER_COLORS,
  savedPlaceMarkerStyle,
} from '../src/modules/map/savedPlaceMarkerPalette.js';

const root = new globalThis.URL('../', import.meta.url);
const read = (path) => readFile(new globalThis.URL(path, root), 'utf8');

test('saved places keep the canonical colored SVG pin on Google Maps', async () => {
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const symbol = await read('src/modules/map/savedPlaceSymbol.js');
  const css = await read('src/modules/map/GooglePlacesMap.css');

  assert.match(symbol, /saved-place-pin\.svg\?raw/);
  assert.match(symbol, /export function savedPlacePinUrl/);
  assert.match(symbol, /savedPlacePinTemplate\.replace\('#19a5d0', color\)/);
  assert.match(googleMap, /savedPlaceMarkerStyle/);
  assert.match(googleMap, /savedPlacePinUrl/);
  assert.match(googleMap, /placeCountryKey/);
  assert.match(googleMap, /document\.createElement\('img'\)/);
  assert.match(googleMap, /image\.src = savedPlacePinUrl\(color\)/);
  assert.match(css, /\.google-saved-place-marker img/);
  assert.match(css, /width:26px/);
  assert.match(css, /height:28px/);
});

test('saved place pin remains the canonical transparent SVG with a white dot', async () => {
  const icon = await read('src/assets/map/saved-place-pin.svg');

  assert.match(icon, /width="52" height="56" viewBox="0 0 52 56"/);
  assert.match(icon, /fill="#19a5d0"/);
  assert.match(icon, /<circle[^>]+cx="26"[^>]+cy="22\.5"[^>]+r="3\.25"[^>]+fill="#ffffff"/);
  assert.equal((icon.match(/fill="#19a5d0"/g) || []).length, 1);
  assert.equal((icon.match(/fill="#ffffff"/g) || []).length, 1);
  assert.doesNotMatch(icon, /<image\b|data:image\/|<metadata>/i);
});

test('the saved place marker palette provides distinct reusable icon variants', () => {
  assert.ok(SAVED_PLACE_MARKER_COLORS.length >= 16);
  assert.equal(new Set(SAVED_PLACE_MARKER_COLORS).size, SAVED_PLACE_MARKER_COLORS.length);
  assert.equal(savedPlaceMarkerStyle(0).color, SAVED_PLACE_MARKER_COLORS[0]);
  assert.notEqual(savedPlaceMarkerStyle(0).iconId, savedPlaceMarkerStyle(1).iconId);
  assert.deepEqual(savedPlaceMarkerStyle(SAVED_PLACE_MARKER_COLORS.length), savedPlaceMarkerStyle(0));
});

test('all saved places in one country share a color and icon while different countries differ', () => {
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
  assert.equal(properties['fr-1'].iconId, properties['fr-2'].iconId);
  assert.notEqual(properties['fr-1'].color, properties['de-1'].color);
  assert.notEqual(properties['fr-1'].color, properties['jp-1'].color);
  assert.notEqual(properties['de-1'].color, properties['jp-1'].color);
  assert.notEqual(properties['de-1'].iconId, properties['jp-1'].iconId);
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
  assert.equal(placeFeatures[0].properties.iconId, placeFeatures[1].properties.iconId);
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
