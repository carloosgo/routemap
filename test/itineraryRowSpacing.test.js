// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary adds exactly one pixel between rows without changing row geometry', async () => {
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.doesNotMatch(form, /marginTop:\s*index > 0/);
  assert.match(compact, /\.editor-module--itinerary \.segments:not\(\.segments--compact\)\s*\{[\s\S]*gap:\s*1px;/s);
  assert.match(compact, /min-height:\s*40px;/);
  assert.match(compact, /height:\s*40px;/);
});
