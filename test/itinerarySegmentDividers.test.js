// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary removes the vertical axis and bounds dotted dividers from flag to close icon', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::before,[\s\S]*\.itinerary-segment \+ \.itinerary-segment::before\s*\{[^}]*left:\s*73px;[^}]*right:\s*4px;[^}]*height:\s*1px;[^}]*background:\s*repeating-linear-gradient\([\s\S]*to right,[\s\S]*#c9ced7 0 3px,[\s\S]*transparent 3px 7px/s
  );
  assert.doesNotMatch(dividers, /::after|M0 0 L4 4|fill='%2319a5d0'|clip-path|to bottom/);
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
});
