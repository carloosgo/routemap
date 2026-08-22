// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary removes the vertical dotted axis and keeps the dotted pattern across true triangular cuts', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::after,[\s\S]*\.itinerary-segment \+ \.itinerary-segment::after\s*\{[\s\S]*repeating-linear-gradient\([\s\S]*to right,[\s\S]*#c9ced7 0 3px,[\s\S]*transparent 3px 7px[\s\S]*center \/ 100% 1px no-repeat,[\s\S]*#ffffff;[\s\S]*clip-path:\s*polygon/s
  );
  assert.match(
    dividers,
    /clip-path:\s*polygon\([\s\S]*calc\(100% - var\(--ticket-cut-depth\)\) 50%,[\s\S]*var\(--ticket-cut-depth\) 50%/s
  );
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-origin-section\s*\{[^}]*margin-bottom:\s*0\s*!important;/s
  );
  assert.doesNotMatch(
    dividers,
    /\.itinerary-origin \+ \.itinerary-segment::after|to bottom|data:image\/svg\+xml|left:\s*-11px|right:\s*-11px/
  );
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
});
