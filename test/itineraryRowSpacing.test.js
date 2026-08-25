// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary adds exactly one pixel between destination rows without changing row geometry', async () => {
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(form, /marginTop:\s*index > 0 \? '1px' : 0/);
  assert.match(compact, /min-height:\s*40px\s*!important;/);
  assert.match(compact, /height:\s*40px\s*!important;/);
});
