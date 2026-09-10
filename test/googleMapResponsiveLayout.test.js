// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('Google Maps fuerza renderizado vectorial para evitar teselas raster pixeladas', async () => {
  const map = await read('src/modules/map/GooglePlacesMap.jsx');

  assert.match(map, /\{ Map, RenderingType \}/);
  assert.match(map, /renderingType: RenderingType\.VECTOR/);
  assert.match(map, /tiltInteractionEnabled: false/);
  assert.match(map, /headingInteractionEnabled: false/);
  assert.match(map, /map\.getRenderingType\?\.\(\)/);
  assert.match(map, /vector rendering unavailable; browser fell back to raster/);
});
