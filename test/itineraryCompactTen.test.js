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

test('segment dividers expose only two triangular ticket cuts with no rectangular edge gaps', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /\.itinerary-origin-section \+ \.itinerary-segment::after/);
  assert.match(dividers, /\.itinerary-segment \+ \.itinerary-segment::after/);
  assert.doesNotMatch(dividers, /\.itinerary-origin \+ \.itinerary-segment::after/);
  assert.doesNotMatch(dividers, /data:image\/svg\+xml|fill='%23ffffff'|stroke='%23c9ced7'/);

  assert.match(
    dividers,
    /\.editor-module--itinerary \.segments:not\(\.segments--compact\)\s*\{[^}]*--ticket-cut-depth:\s*7px;[^}]*--ticket-cut-half-height:\s*5px;[^}]*isolation:\s*isolate;/s
  );
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-origin-section\s*\{[^}]*margin-bottom:\s*0\s*!important;/s
  );
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-segment::before\s*\{[^}]*top:\s*var\(--ticket-cut-half-height\);[^}]*bottom:\s*var\(--ticket-cut-half-height\);[^}]*left:\s*-18px;[^}]*right:\s*-18px;[^}]*background:\s*#ffffff;/s
  );
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-origin-section \+ \.itinerary-segment::after,[\s\S]*\.editor-module--itinerary \.itinerary-segment \+ \.itinerary-segment::after\s*\{[^}]*top:\s*calc\(-1 \* var\(--ticket-cut-half-height\)\);[^}]*left:\s*-18px;[^}]*right:\s*-18px;[^}]*height:\s*calc\(2 \* var\(--ticket-cut-half-height\)\);/s
  );
  assert.match(
    dividers,
    /clip-path:\s*polygon\([\s\S]*0 0,[\s\S]*100% 0,[\s\S]*calc\(100% - var\(--ticket-cut-depth\)\) 50%,[\s\S]*100% 100%,[\s\S]*0 100%,[\s\S]*var\(--ticket-cut-depth\) 50%/s
  );
  assert.match(dividers, /center \/ 100% 1px no-repeat,[\s\S]*#ffffff;/s);

  assert.match(
    floating,
    /floating-editor:has\(\.editor-module--itinerary\)\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border-color:\s*transparent\s*!important;/s
  );
  assert.match(
    floating,
    /\.workspace-panel \.editor-module--itinerary,[\s\S]*\.workspace-panel \.editor-module--itinerary \.editor,[\s\S]*\.workspace-panel \.editor-module--itinerary \.editor__body\s*\{[^}]*background:\s*transparent\s*!important;/s
  );
});
