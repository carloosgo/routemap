import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Google Maps llena el workspace aunque cambie el viewport o el zoom del navegador', async () => {
  const css = await read('src/modules/map/GooglePlacesMap.css');
  const map = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(css, /\.google-map-wrap\{[\s\S]*position:absolute;[\s\S]*inset:0;/);
  assert.match(css, /\.google-map\{[\s\S]*position:absolute;[\s\S]*inset:0;/);
  assert.doesNotMatch(css, /\.google-map>div:first-child/);
  assert.match(css, /\.mappane>\.route-map-stack\{[\s\S]*position:absolute;[\s\S]*inset:0;/);
  assert.match(map, /function syncMapElementSize/);
  assert.match(map, /wrapper\.clientWidth/);
  assert.match(map, /wrapper\.clientHeight/);
  assert.match(map, /new ResizeObserver\(resizeHandler\)/);
  assert.match(map, /globalThis\.addEventListener\?\.\('resize', resizeHandler\)/);
  assert.match(map, /maps\.event\.trigger\(currentMap, 'resize'\)/);
  assert.match(map, /zoomControl: true/);
  assert.match(map, /<div className="geo-map google-map" ref=\{nodeRef\} \/>/);
});

test('Google Maps fuerza renderizado vectorial para evitar teselas raster pixeladas', async () => {
  const map = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(map, /\{ Map, RenderingType \}/);
  assert.match(map, /renderingType: RenderingType\.VECTOR/);
  assert.match(map, /tiltInteractionEnabled: false/);
  assert.match(map, /headingInteractionEnabled: false/);
  assert.match(map, /map\.getRenderingType\?\.\(\)/);
  assert.match(map, /vector rendering unavailable; browser fell back to raster/);
});
