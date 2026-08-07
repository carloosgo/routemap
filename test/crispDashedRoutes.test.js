import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pixelDashSegments } from '../src/modules/map/crispDashedRoutes.js';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('divide un trazo en guiones de 6px con espacios de 4px', () => {
  const segments = pixelDashSegments([
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ], 6, 4);

  assert.deepEqual(
    segments.map((segment) => [segment[0].x, segment.at(-1).x]),
    [[0, 6], [10, 16], [20, 26]]
  );
});

test('Itinerario usa segmentos Polyline nativos y no símbolos repetidos para el guionado', async () => {
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const renderer = await read('src/modules/map/crispDashedRoutes.js');

  assert.match(googleMap, /createCrispDashedRoutes\(/);
  assert.match(googleMap, /dashPx: 6/);
  assert.match(googleMap, /gapPx: 4/);
  assert.match(renderer, /new maps\.Polyline\(/);
  assert.match(renderer, /strokeOpacity: 1/);
  assert.doesNotMatch(renderer, /icons:|repeat:/);
});
