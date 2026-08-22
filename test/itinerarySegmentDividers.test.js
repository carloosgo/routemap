// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary removes the vertical dotted axis and exposes real transparent V cuts', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-segment::before\s*\{[^}]*background:[\s\S]*#c9ced7 0 3px,[\s\S]*transparent 3px 7px[\s\S]*#ffffff;[^}]*clip-path:\s*polygon/s
  );
  assert.match(
    dividers,
    /0 4px,[\s\S]*4px 0,[\s\S]*calc\(100% - 4px\) 0,[\s\S]*100% 4px/s
  );
  assert.match(
    dividers,
    /M0 0 L4 4 L0 8 M500 0 L496 4 L500 8[\s\S]*fill='none'[\s\S]*stroke='%23c9ced7'/s
  );
  assert.doesNotMatch(dividers, /fill='%23ffffff'/);
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
});
