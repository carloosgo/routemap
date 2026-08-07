import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pixelDashSegments } from '../src/modules/map/crispDashedRoutes.js';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('divide un trazo en guiones de 4px con espacios de 6px', () => {
  const segments = pixelDashSegments([
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ], 4, 6);

  assert.deepEqual(
    segments.map((segment) => [segment[0].x, segment.at(-1).x]),
    [[0, 4], [10, 14], [20, 24]]
  );
});

test('Itinerario espera al mapa estable y reemplaza los guiones sin flashes', async () => {
  const googleMap = await read('src/modules/map/GooglePlacesMap.jsx');
  const renderer = await read('src/modules/map/crispDashedRoutes.js');

  assert.match(googleMap, /createCrispDashedRoutes\(/);
  assert.match(renderer, /DEFAULT_DASH_PX = 4/);
  assert.match(renderer, /DEFAULT_GAP_PX = 6/);
  assert.match(renderer, /DEFAULT_STROKE_WEIGHT = 2/);
  assert.match(renderer, /map\.addListener\?\.\('idle'/);
  assert.match(renderer, /map\.addListener\?\.\('tilesloaded'/);
  assert.match(renderer, /const previousPolylines = polylines/);
  assert.match(renderer, /polylines = nextPolylines/);
  assert.match(renderer, /clearLines\(previousPolylines\)/);
  assert.match(renderer, /new maps\.Polyline\(/);
  assert.match(renderer, /strokeOpacity: 1/);
  assert.doesNotMatch(renderer, /maps\.event\.trigger\(map, 'resize'\)/);
  assert.doesNotMatch(renderer, /icons:|repeat:/);
});
