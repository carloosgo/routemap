// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('saved-place rendering keeps one reusable pin pipeline and lazy ISO country flags', async () => {
  const [googleMap, symbol, dom] = await Promise.all([
    read('src/modules/map/GooglePlacesMap.jsx'),
    read('src/modules/map/savedPlaceSymbol.js'),
    read('src/modules/map/placeMapDom.js'),
  ]);

  assert.match(symbol, /saved-place-pin\.svg\?raw/);
  assert.match(symbol, /export function savedPlacePinUrl/);
  assert.match(symbol, /savedPlacePinTemplate\.replace\('#19a5d0', color\)/);
  assert.match(googleMap, /savedPlaceMarkerStyle/);
  assert.match(googleMap, /savedPlacePinUrl/);
  assert.match(googleMap, /placeCountryKey/);
  assert.match(googleMap, /image\.src = savedPlacePinUrl\(color\)/);

  assert.match(dom, /function normalizedCountryCode/);
  assert.match(dom, /\/\^\[a-z\]\{2\}\$\//);
  assert.match(dom, /https:\/\/flagcdn\.com\/24x18\/\$\{code\}\.png/);
  assert.match(dom, /loading="lazy"/);
  assert.match(dom, /decoding="async"/);
  assert.match(dom, /flagImage\?\.addEventListener\('error'/);
});
