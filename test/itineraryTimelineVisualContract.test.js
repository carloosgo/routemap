import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('requested redesign keeps left rail, connected timeline and map-edge shadow in scope', async () => {
  const timeline = await read('src/app/ItineraryTimeline.css');
  const mobile = await read('src/app/ItineraryTimelineMobile.css');
  const workspace = await read('src/app/DockedWorkspace.css');
  const preservation = await read('DESIGN_PRESERVATION.md');

  assert.match(preservation, /^Visual delta: requested$/m);
  assert.match(preservation, /^Requested visual scope:/m);
  assert.match(timeline, /background:\s*#fdfdfd/);
  assert.match(timeline, /border-left:\s*1px dashed #d3d7dd/);
  assert.match(timeline, /-webkit-line-clamp:\s*2/);
  assert.match(workspace, /box-shadow:\s*8px 0 18px rgba\(15, 23, 42, 0\.065\)/);
  assert.match(mobile, /editor-rail__overflow-anchor/);
  assert.doesNotMatch(mobile, /display:\s*none/);
});
