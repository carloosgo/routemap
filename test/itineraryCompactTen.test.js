// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('desktop itinerary is compact, scrollbar-free and does not auto-reveal expanded rows', async () => {
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');

  assert.match(compact, /@media \(min-width:\s*721px\)/);
  assert.match(compact, /\.editor-module--itinerary \.editor__body\s*\{[^}]*overflow-y:\s*hidden;[^}]*scrollbar-gutter:\s*auto;/s);
  assert.match(compact, /\.itinerary-segment\.segment\s*\{[^}]*padding-bottom:\s*2px\s*!important;/s);
  assert.match(compact, /segment__header\.itinerary-stop\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(form, /import '\.\/ItineraryCompactTen\.css';/);
  assert.doesNotMatch(form, /useExpandedSegmentReveal|scrollIntoView/);
  assert.doesNotMatch(correction, /scrollbar-gutter:\s*stable|scroll-margin-block/);
});

test('segment dividers reach real white ticket cuts without gray triangle fill', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /\.itinerary-segment \+ \.itinerary-segment::after/);
  assert.match(dividers, /M0 0 L4 4 L0 8 Z M500 0 L496 4 L500 8 Z/);
  assert.match(dividers, /fill='%23ffffff'/);
  assert.doesNotMatch(dividers, /stroke='%23c9ced7'|stroke-width='0\.8'|opacity='0\.58'/);
  assert.match(
    dividers,
    /@media \(min-width:\s*721px\)[\s\S]*\.itinerary-segment \+ \.itinerary-segment::before\s*\{[^}]*left:\s*-4px;[^}]*right:\s*-4px;/s
  );
  assert.match(
    dividers,
    /@media \(min-width:\s*721px\)[\s\S]*\.itinerary-segment \+ \.itinerary-segment::after\s*\{[^}]*left:\s*-8px;[^}]*right:\s*-8px;/s
  );
});
