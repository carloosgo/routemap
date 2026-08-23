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

test('ticket picos are transparent cut-outs instead of Atlas-blue triangles', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /clip-path:\s*polygon\(/);
  assert.match(dividers, /\.editor-module--itinerary \.itinerary-origin-section::before/);
  assert.match(dividers, /\.editor-module--itinerary \.itinerary-segment::before/);
  assert.doesNotMatch(dividers, /#19a5d0|%2319a5d0|fill='%2319a5d0'/);
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
    /\.workspace-panel \.editor-module--itinerary \.btn--add::before\s*\{[^}]*bottom:\s*-100vh;[^}]*background:\s*#ffffff;/s
  );
});
