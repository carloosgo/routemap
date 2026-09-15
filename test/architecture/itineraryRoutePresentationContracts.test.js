// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary route renderer keeps thin native dashed polylines stable across camera changes', async () => {
  const routes = await read('src/modules/map/crispDashedRoutes.js');

  assert.match(routes, /new maps\.Polyline/);
  assert.match(routes, /const DEFAULT_STROKE_WEIGHT = 1;/);
  assert.match(routes, /function dashedIconSequence\(\)/);
  assert.match(routes, /icons:\s*dashedIconSequence\(\)/);
  assert.match(routes, /DEFAULT_DASH_PX/);
  assert.match(routes, /DEFAULT_GAP_PX/);
  assert.match(routes, /DEFAULT_REPEAT_PX/);
  assert.match(routes, /map\.addListener\?\.\('idle', refreshStyles\)/);
  assert.match(routes, /polyline\.setOptions\?\.\(dashedStyleOptions\(\)\)/);
  assert.doesNotMatch(routes, /OverlayView|requestAnimationFrame|stroke-dasharray/);
  assert.doesNotMatch(routes, /ARROW_FRACTIONS|createDirectionArrow|arrowPlacement|lastArrowTransforms|FORWARD_(?:CLOSED_)?ARROW|BACKWARD_(?:CLOSED_)?ARROW/);
  assert.doesNotMatch(routes, /M -2\.2 -1\.65 L 0\.6 0 L -2\.2 1\.65/);
});
