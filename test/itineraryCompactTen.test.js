// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('desktop itinerary keeps seven natural rows aligned, centered and without a visible scrollbar', async () => {
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');
  const floatingEditor = await read('src/app/FloatingEditor.css');
  const form = await read('src/modules/trips/SegmentForm.jsx');
  const correction = await read('src/modules/trips/ItineraryCorrectionPolish.css');
  const timeline = await read('src/modules/trips/ItineraryTimeline.css');
  const origin = await read('src/modules/trips/OriginOptions.css');

  assert.match(compact, /@media \(min-width:\s*721px\)/);
  assert.match(
    compact,
    /\.workspace-panel:has\(\.editor-module--itinerary\)\s*\{[^}]*top:\s*calc\(50% \+ 31\.5px\);[^}]*bottom:\s*auto;[^}]*506px[\s\S]*transform:\s*translateY\(-50%\);/s
  );
  assert.match(
    compact,
    /\.editor-module--itinerary \.editor__body\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-width:\s*none;[^}]*padding-top:\s*0;[^}]*padding-bottom:\s*8px;/s
  );
  assert.match(compact, /\.editor-module--itinerary \.editor__body::-webkit-scrollbar\s*\{[^}]*display:\s*none;/s);

  /* Origen y destinos deben ocupar la misma banda vertical. */
  assert.match(compact, /\.itinerary-origin-section\s*\{[^}]*margin:\s*0;/s);
  assert.match(
    compact,
    /\.itinerary-origin,[\s\S]*segment__header\.itinerary-stop\s*\{[^}]*min-height:\s*62px;[^}]*height:\s*62px;[^}]*align-items:\s*center;/s
  );
  assert.match(compact, /\.itinerary-segment\.segment,[\s\S]*padding-bottom:\s*0\s*!important;/s);

  /* Noches y Costo mantienen la guía de métricas pero recuperan ancho natural. */
  assert.match(compact, /grid-template-columns:\s*42px max-content max-content;/);
  assert.match(
    compact,
    /\.itinerary-stop__nights\.segment__pill,[\s\S]*\.itinerary-stop__amount\.segment__pill\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*0;[^}]*max-width:\s*none;/s
  );

  /* La densidad artificial del 90% y la jerarquía especial del origen no vuelven. */
  assert.doesNotMatch(floatingEditor, /Densidad compacta nativa|reproduce la sensación del navegador al 90%/);
  assert.doesNotMatch(floatingEditor, /\.floating-editor \.segment__badge|\.floating-editor \.segment__header \.btn--icon svg|\.floating-editor \.segment__pill/);
  assert.doesNotMatch(correction, /itinerary-origin__picker \.autocomplete__selected-value|itinerary-origin__country/);
  assert.match(origin, /itinerary-origin__picker \.autocomplete__selected-value[\s\S]*font-size:\s*13px;[\s\S]*font-weight:\s*700;/);
  assert.match(timeline, /itinerary-origin__country,[\s\S]*itinerary-stop__country[\s\S]*font-size:\s*9\.5px;[\s\S]*font-weight:\s*500;/);

  assert.match(form, /import '\.\/ItineraryCompactTen\.css';/);
  assert.doesNotMatch(form, /useExpandedSegmentReveal|scrollIntoView/);
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
