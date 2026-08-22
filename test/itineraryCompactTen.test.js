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

test('segment dividers open real transparent ticket cuts and reach their vertices', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /\.itinerary-origin \+ \.itinerary-segment::after/);
  assert.match(dividers, /\.itinerary-segment \+ \.itinerary-segment::after/);
  assert.doesNotMatch(dividers, /data:image\/svg\+xml|fill='%23ffffff'|stroke='%23c9ced7'/);
  assert.match(dividers, /\.editor-module--itinerary \.segments:not\(\.segments--compact\)\s*\{[^}]*isolation:\s*isolate;/s);
  assert.match(dividers, /\.editor-module--itinerary \.itinerary-origin::before\s*\{[^}]*background:\s*#ffffff;[^}]*clip-path:\s*polygon/s);
  assert.match(dividers, /\.editor-module--itinerary \.itinerary-segment::before\s*\{[^}]*inset:\s*0 -18px;[^}]*background:\s*#ffffff;[^}]*clip-path:\s*polygon/s);
  assert.match(dividers, /0 4px,[\s\S]*4px 0,[\s\S]*calc\(100% - 4px\) 0,[\s\S]*100% 4px/);
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-origin \+ \.itinerary-segment::after,[\s\S]*\.editor-module--itinerary \.itinerary-segment \+ \.itinerary-segment::after\s*\{[^}]*left:\s*-14px;[^}]*right:\s*-14px;/s
  );

  assert.match(
    floating,
    /floating-editor:has\(\.editor-module--itinerary\)\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border-color:\s*transparent\s*!important;/s
  );
  assert.match(
    floating,
    /\.editor-module--itinerary \.editor__body\s*\{[^}]*transparent 0 4px,[^}]*#ffffff 4px calc\(100% - 4px\),[^}]*transparent calc\(100% - 4px\) 100%;/s
  );
});
