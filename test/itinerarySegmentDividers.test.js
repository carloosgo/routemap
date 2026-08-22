// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary removes the vertical dotted axis and keeps the dotted pattern across real ticket cuts', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin \+ \.itinerary-segment::after,[\s\S]*\.itinerary-segment \+ \.itinerary-segment::after\s*\{[^}]*height:\s*1px;[^}]*background:\s*repeating-linear-gradient\([\s\S]*to right,[\s\S]*#c9ced7 0 3px,[\s\S]*transparent 3px 7px/s
  );
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-segment::before\s*\{[^}]*background:\s*#ffffff;[^}]*clip-path:\s*polygon/s
  );
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-origin \+ \.itinerary-segment::after,[\s\S]*left:\s*-14px;[^}]*right:\s*-14px;/s
  );
  assert.doesNotMatch(dividers, /to bottom|data:image\/svg\+xml/);
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
});
