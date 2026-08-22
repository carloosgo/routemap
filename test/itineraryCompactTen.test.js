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

test('ticket picos expose the map only inside the triangular cuts and keep the card closed below the list', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /\.editor-module--itinerary \.itinerary-origin-section::before/);
  assert.match(dividers, /\.editor-module--itinerary \.itinerary-segment::before/);
  assert.match(dividers, /inset:\s*0 -12px/);
  assert.match(dividers, /0 4px,[\s\S]*4px 0,[\s\S]*calc\(100% - 4px\) 0,[\s\S]*100% 4px/);
  assert.match(dividers, /center top \/ calc\(100% - 8px\) 1px no-repeat/);
  assert.match(dividers, /fill='none' stroke='%23c9ced7'/);
  assert.doesNotMatch(dividers, /fill='%23ffffff'/);

  assert.match(
    floating,
    /floating-editor:has\(\.editor-module--itinerary\)\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border-color:\s*transparent\s*!important;/s
  );
  assert.match(
    floating,
    /\.workspace-panel \.editor-module--itinerary,[\s\S]*\.workspace-panel \.editor-module--itinerary \.editor__body\s*\{[^}]*background:\s*transparent\s*!important;/s
  );
  assert.match(
    floating,
    /\.editor-module--itinerary \.btn--add::before\s*\{[^}]*bottom:\s*-100vh;[^}]*background:\s*#ffffff;/s
  );
});
