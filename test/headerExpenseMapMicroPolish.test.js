// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('header keeps neutral total hover, unified icon color and divided selector rows', async () => {
  const [header, selector, polish, tokens] = await Promise.all([
    read('src/app/TripSummaryHeader.jsx'),
    read('src/app/SummarySelectorMetric.jsx'),
    read('src/app/TripSummaryHeaderMicroPolish.css'),
    read('src/app/headerVisualTokens.js'),
  ]);

  assert.match(tokens, /HEADER_ICON_COLOR\s*=\s*'#667085'/);
  assert.match(header, /Icon=\{IconCalendar\}[\s\S]{0,100}iconColor=\{HEADER_ICON_COLOR\}/);
  assert.match(header, /import '\.\/TripSummaryHeaderMicroPolish\.css';/);
  assert.match(selector, /trip-summary__selector-code[\s\S]{0,180}trip-summary__selector-separator[\s\S]{0,80}>\|</);
  assert.match(polish, /trip-summary__metric--total:hover[\s\S]{0,180}background:\s*transparent\s*!important;/);
  assert.match(polish, /grid-template-columns:\s*36px 8px minmax\(0, 1fr\) 18px;/);
  assert.match(polish, /border-bottom:\s*1px dashed #eef0f3;/);
});

test('destination number and 30px flag use independent tracks with the shared itinerary gap', async () => {
  const [header, css, compact] = await Promise.all([
    read('src/modules/trips/SegmentHeader.jsx'),
    read('src/modules/trips/ItinerarySequenceLeft.css'),
    read('src/modules/trips/ItineraryCompactTen.css'),
  ]);

  assert.match(header, /import '\.\/ItinerarySequenceLeft\.css';/);
  assert.match(css, /itinerary-stop__sequence\s*\{[\s\S]*width:\s*19px;[\s\S]*min-width:\s*19px;/s);
  assert.match(css, /itinerary-stop__sequence-badge[\s\S]*position:\s*static;[\s\S]*width:\s*19px;[\s\S]*height:\s*19px;[\s\S]*transform:\s*none;/s);
  assert.match(css, /itinerary-stop__marker\s*\{[\s\S]*width:\s*30px;[\s\S]*min-width:\s*30px;/s);
  assert.match(compact, /--itinerary-compact-gap:\s*10px;/);
  assert.match(compact, /grid-template-columns:[\s\S]*var\(--country-run-drag-w, 14px\)[\s\S]*var\(--country-run-sequence-w, 19px\)[\s\S]*var\(--country-run-track-w, 30px\)[\s\S]*126px[\s\S]*minmax\(0, 1fr\);[\s\S]*column-gap:\s*var\(--itinerary-compact-gap\);/s);
});

test('dynamic expense concepts reuse fixed expense columns and vertical rhythm', async () => {
  const [editor, alignment, money] = await Promise.all([
    read('src/modules/expenses/ExpenseEditor.jsx'),
    read('src/modules/expenses/ExpenseLineItemAlignment.css'),
    read('src/components/MoneyInput.jsx'),
  ]);

  assert.match(editor, /import '\.\/ExpenseLineItemAlignment\.css';/);
  assert.match(money, /gridTemplateColumns:\s*'18px minmax\(64px, 82px\) minmax\(60px, 70px\)'/);
  assert.match(alignment, /grid-template-columns:\s*18px minmax\(64px, 82px\) minmax\(60px, 70px\);/);
  assert.match(alignment, /width:\s*min\(178px, calc\(100% - 12px\)\);/);
  assert.match(alignment, /\.expenses--journey\s*\{[\s\S]*gap:\s*var\(--expense-row-gap\);/s);
  assert.match(alignment, /\.lineitems-section\s*\{[\s\S]*gap:\s*var\(--expense-row-gap\);[\s\S]*padding-top:\s*0;/s);
});

test('expense labels are singular in both languages', async () => {
  const [es, en] = await Promise.all([
    read('src/i18n/es.js'),
    read('src/i18n/en.js'),
  ]);

  assert.match(es, /flights:\s*'Vuelo'/);
  assert.match(es, /otherExpenses:\s*'Otro'/);
  assert.match(en, /flights:\s*'Flight'/);
  assert.match(en, /otherExpenses:\s*'Other'/);
});

test('map keeps old itinerary markers through the next animation frame during refresh', async () => {
  const map = await read('src/modules/map/GooglePlacesMap.jsx');
  const clearFn = map.match(/function clearAdvancedMarkers\(markersRef\) \{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(clearFn, /const markers = markersRef\.current;/);
  assert.match(clearFn, /markersRef\.current = \[\];/);
  assert.match(clearFn, /const detach = \(\) =>/);
  assert.match(clearFn, /requestAnimationFrame\(detach\)/);
});
