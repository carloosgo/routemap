// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary keeps the default vertical axis removed and only joins qualifying same-country runs', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::before,[\s\S]*\.itinerary-segment \+ \.itinerary-segment::before\s*\{[^}]*left:\s*53px;[^}]*right:\s*4px;[^}]*height:\s*1px;[^}]*background:\s*repeating-linear-gradient\([\s\S]*to right,[\s\S]*#c9ced7 0 3px,[\s\S]*transparent 3px 7px/s
  );
  assert.match(
    dividers,
    /\.itinerary-segment\.is-country-run-joined::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(
    dividers,
    /\.itinerary-stop__country-run-dot\s*\{[^}]*width:\s*6px;[^}]*height:\s*6px;[^}]*border-radius:\s*50%;[^}]*background:\s*#000000;/s
  );
  assert.match(
    dividers,
    /\.itinerary-segment\.is-country-run-joined::after\s*\{[^}]*background:\s*repeating-linear-gradient\([\s\S]*to bottom,[\s\S]*#6f7682 0 3px,[\s\S]*transparent 3px 7px/s
  );
  assert.match(
    dividers,
    /@media \(min-width:\s*721px\)[\s\S]*\.editor-module--itinerary \.itinerary-segment\.is-country-run-joined::after\s*\{[^}]*top:\s*-20px;[^}]*left:\s*68px;[^}]*height:\s*40px;/s
  );
  assert.doesNotMatch(dividers, /M0 0 L4 4|fill='%2319a5d0'|clip-path/);
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
  assert.match(form, /is-country-run-joined/);
  assert.match(form, /is-country-run-joined-from-origin/);
});
