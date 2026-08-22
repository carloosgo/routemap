// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary removes the vertical dotted axis and restores the original subtle V separators', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::before,[\s\S]*\.itinerary-segment \+ \.itinerary-segment::before\s*\{[^}]*height:\s*1px;[^}]*background:\s*repeating-linear-gradient\([\s\S]*to right,[\s\S]*#c9ced7 0 3px,[\s\S]*transparent 3px 7px/s
  );
  assert.match(
    dividers,
    /M0 0 L4 4 L0 8 M500 0 L496 4 L500 8[\s\S]*fill='none'[\s\S]*stroke='%23c9ced7'/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::before,[\s\S]*left:\s*-4px;[^}]*right:\s*-4px;/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::after,[\s\S]*left:\s*-8px;[^}]*right:\s*-8px;/s
  );
  assert.doesNotMatch(dividers, /clip-path|--ticket-cut-depth|--ticket-cut-half-height|to bottom/);
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
});
