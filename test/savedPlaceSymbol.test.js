import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new globalThis.URL('../', import.meta.url);
const read = (path) => readFile(new globalThis.URL(path, root), 'utf8');

test('saved places use one shared MapLibre symbol with a circle fallback', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const symbol = await read('src/modules/map/savedPlaceSymbol.js');

  assert.match(routeMap, /installSavedPlaceSymbolLayer\(map\)/);
  assert.match(symbol, /atlas-saved-place-pin/);
  assert.match(symbol, /atlas-saved-places-symbol/);
  assert.match(symbol, /map\.addImage\(PLACE_ICON_ID, image, \{ pixelRatio: 2 \}\)/);
  assert.match(symbol, /type: 'symbol'/);
  assert.match(symbol, /'icon-anchor': 'bottom'/);
  assert.match(symbol, /'icon-allow-overlap': true/);
  assert.match(symbol, /'icon-ignore-placement': true/);
  assert.match(symbol, /circle-opacity', 0\.001/);
  assert.match(symbol, /circle fallback/);
});

test('saved place pin is a transparent pure SVG matching the supplied design', async () => {
  const icon = await read('src/assets/map/saved-place-pin.svg');

  assert.match(icon, /viewBox="0 0 40 56"/);
  assert.match(icon, /#009dcc/);
  assert.match(icon, /#ffeed1/);
  assert.match(icon, /#68807f/);
  assert.match(icon, /#4d4d4d/);
  assert.doesNotMatch(icon, /<image\b|data:image\/|<metadata>|<rect[^>]+width="40"[^>]+height="56"/i);
});

test('saved place popup adds a lazy country flag only for ISO2 codes', async () => {
  const routeMap = await read('src/modules/map/RouteMap.jsx');
  const css = await read('src/modules/map/SavedPlaceSymbol.css');

  assert.match(routeMap, /function normalizedCountryCode/);
  assert.match(routeMap, /\/\^\[a-z\]\{2\}\$\//);
  assert.match(routeMap, /https:\/\/flagcdn\.com\/24x18\/\$\{code\}\.png/);
  assert.match(routeMap, /loading="lazy"/);
  assert.match(routeMap, /decoding="async"/);
  assert.match(routeMap, /flagImage\?\.addEventListener\('error'/);
  assert.match(css, /\.place-popup__flag/);
  assert.match(css, /width:24px/);
  assert.match(css, /height:18px/);
});
