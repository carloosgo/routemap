// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('itinerary removes the vertical axis and uses true transparent ticket picos', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');

  assert.match(
    dividers,
    /\.segments:not\(\.segments--compact\)::before\s*\{[^}]*content:\s*none;/s
  );
  assert.match(dividers, /clip-path:\s*polygon\(/);
  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(
    dividers,
    /\.editor-module--itinerary \.itinerary-segment::before\s*\{[^}]*inset:\s*0 -12px;[\s\S]*calc\(100% - 8px\) 1px no-repeat,[\s\S]*#ffffff;/s
  );
  assert.match(
    dividers,
    /0 4px,[\s\S]*4px 0,[\s\S]*calc\(100% - 4px\) 0,[\s\S]*100% 4px/s
  );
  assert.doesNotMatch(dividers, /#19a5d0|%2319a5d0|fill='%2319a5d0'/);
  assert.match(
    floating,
    /floating-editor:has\(\.editor-module--itinerary\)\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border-color:\s*transparent\s*!important;/s
  );
  assert.match(
    floating,
    /\.workspace-panel \.editor-module--itinerary,[\s\S]*\.workspace-panel \.editor-module--itinerary \.editor__body\s*\{[^}]*background:\s*transparent\s*!important;/s
  );
  assert.match(form, /import '\.\/ItinerarySegmentDividers\.css';/);
});
