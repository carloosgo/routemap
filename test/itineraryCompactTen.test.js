// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('desktop itinerary shows seven natural-scale entries without the old 90-percent density overrides', async () => {
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const floatingEditor = await read('src/app/FloatingEditor.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');

  assert.match(compact, /@media \(min-width:\s*721px\)/);
  assert.match(
    compact,
    /\.workspace-panel:has\(\.editor-module--itinerary\)\s*\{[^}]*bottom:\s*auto;[^}]*height:\s*min\([\s\S]*506px[\s\S]*\);/s
  );
  assert.match(
    compact,
    /\.editor-module--itinerary \.editor__body\s*\{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*scrollbar-gutter:\s*auto;/s
  );

  /* La prueba anterior aplanaba toda la interfaz para imitar zoom 90%. Esa
     densidad ya no puede volver: el sizing normal vive en los estilos base. */
  assert.doesNotMatch(compact, /min-height:\s*44px|height:\s*18px|height:\s*20px|padding-bottom:\s*2px\s*!important/);
  assert.doesNotMatch(floatingEditor, /Densidad compacta nativa|reproduce la sensación del navegador al 90%/);
  assert.doesNotMatch(floatingEditor, /\.floating-editor \.segment__badge|\.floating-editor \.segment__header \.btn--icon svg|\.floating-editor \.segment__pill/);

  assert.match(form, /import '\.\/ItineraryCompactTen\.css';/);
  assert.doesNotMatch(form, /useExpandedSegmentReveal|scrollIntoView/);
  assert.doesNotMatch(correction, /scrollbar-gutter:\s*stable|scroll-margin-block/);
});

test('ticket picos use solid Atlas-blue triangles on a continuous white card', async () => {
  const dividers = await read('src/modules/trips/ItinerarySegmentDividers.css');
  const floating = await read('src/app/FloatingItineraryPanel.css');

  assert.match(dividers, /#c9ced7 0 3px,[\s\S]*transparent 3px 7px/);
  assert.match(dividers, /\.itinerary-origin-section \+ \.itinerary-segment::before/);
  assert.match(dividers, /\.itinerary-segment \+ \.itinerary-segment::before/);
  assert.match(dividers, /M0 0 L4 4 L0 8 Z M500 0 L496 4 L500 8 Z/);
  assert.match(dividers, /fill='%2319a5d0'/);
  assert.doesNotMatch(dividers, /clip-path|fill='%23ffffff'|fill='none' stroke='%23c9ced7'/);
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
