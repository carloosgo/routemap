// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary removes the vertical dotted axis and uses the same pattern between legs', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-segment \+ \.itinerary-segment::before\s*\{[\s\S]*height:\s*1px;[\s\S]*to right,[\s\S]*#c9ced7 0 3px,[\s\S]*transparent 3px 7px/s
  );
  assert.doesNotMatch(dividers, /to bottom/);
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
});
