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

test('segment dividers use the original subtle V picos on a solid white card', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /\.itinerary-origin-section \+ \.itinerary-segment::before/);
  assert.match(dividers, /\.itinerary-segment \+ \.itinerary-segment::before/);
  assert.match(dividers, /M0 0 L4 4 L0 8 M500 0 L496 4 L500 8/);
  assert.match(dividers, /fill='none'/);
  assert.match(dividers, /stroke='%23c9ced7'/);
  assert.match(dividers, /stroke-width='0\.8'/);
  assert.match(dividers, /opacity='0\.58'/);
  assert.doesNotMatch(dividers, /clip-path|--ticket-cut-depth|--ticket-cut-half-height/);
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::before,[\s\S]*\.itinerary-segment \+ \.itinerary-segment::before\s*\{[^}]*left:\s*-4px;[^}]*right:\s*-4px;/s
  );
  assert.match(
    dividers,
    /\.itinerary-origin-section \+ \.itinerary-segment::after,[\s\S]*\.itinerary-segment \+ \.itinerary-segment::after\s*\{[^}]*left:\s*-8px;[^}]*right:\s*-8px;/s
  );

  assert.match(
    floating,
    /\.workspace-panel__content\.floating-editor\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*1px solid rgba\(226, 228, 233, 0\.94\)\s*!important;/s
  );
  assert.doesNotMatch(floating, /floating-editor:has\(\.editor-module--itinerary\)/);
  assert.doesNotMatch(floating, /\.editor-module--itinerary[\s\S]*background:\s*transparent\s*!important/);
});
