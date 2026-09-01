import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary dividers are semantic per segment and do not depend on adjacent DOM siblings', async () => {
  const css = await read('src/modules/trips/ItinerarySegmentDividers.css');

  assert.match(css, /\.itinerary-segment::before\s*\{[\s\S]*content:\s*'';[\s\S]*background:\s*repeating-linear-gradient\(/s);
  assert.match(css, /\.itinerary-segment\.is-country-run-joined::before\s*\{[^}]*content:\s*none;/s);
  assert.doesNotMatch(css, /\.itinerary-origin-section\s*\+\s*\.itinerary-segment::before/);
  assert.doesNotMatch(css, /\.itinerary-segment\s*\+\s*\.itinerary-segment::before/);
});
