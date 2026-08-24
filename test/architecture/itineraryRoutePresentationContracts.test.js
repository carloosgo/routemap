// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary route overlay renders only the dashed path without direction arrows', async () => {
  const routes = await read('src/modules/map/crispDashedRoutes.js');

  assert.match(routes, /stroke-dasharray/);
  assert.match(routes, /DEFAULT_DASH_PX/);
  assert.match(routes, /DEFAULT_GAP_PX/);
  assert.doesNotMatch(routes, /ARROW_FRACTIONS|createDirectionArrow|arrowPlacement|lastArrowTransforms/);
  assert.doesNotMatch(routes, /M -2\.2 -1\.65 L 0\.6 0 L -2\.2 1\.65/);
});
