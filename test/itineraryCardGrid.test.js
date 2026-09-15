// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('expanded itinerary presents destinations as a three-column card grid', async () => {
  const css = await read('src/modules/trips/ItinerarySegmentDividers.css');

  assert.match(
    css,
    /\.editor:not\(\.is-panel-collapsed\)[\s\S]*\.editor__body > \.segments:not\(\.segments--compact\)[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s
  );
  assert.match(
    css,
    /> \.itinerary-origin-section\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;/s
  );
  assert.match(
    css,
    /> \.itinerary-segment\.segment\s*\{[\s\S]*border-radius:\s*11px\s*!important;[\s\S]*background:\s*#ffffff\s*!important;/s
  );
});

test('card actions stay quiet until hover or keyboard focus on fine pointers', async () => {
  const css = await read('src/modules/trips/ItinerarySegmentDividers.css');

  assert.match(css, /@media \(min-width:\s*721px\) and \(hover:\s*hover\) and \(pointer:\s*fine\)/);
  assert.match(
    css,
    /\.itinerary-segment \.segment__note-btn,[\s\S]*\.itinerary-segment \.segment__details-btn,[\s\S]*\.itinerary-segment \.itinerary-stop__remove-btn\s*\{[\s\S]*opacity:\s*0;[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none;/s
  );
  assert.match(css, /\.itinerary-segment:hover \.segment__note-btn/);
  assert.match(css, /\.itinerary-segment:hover \.segment__details-btn/);
  assert.match(css, /\.itinerary-segment:hover \.itinerary-stop__remove-btn/);
  assert.match(css, /\.itinerary-segment:focus-within \.segment__note-btn/);
  assert.match(css, /\.itinerary-segment:focus-within \.segment__details-btn/);
  assert.match(css, /\.itinerary-segment:focus-within \.itinerary-stop__remove-btn/);
});

test('card view reuses the existing itinerary markup without adding a duplicate summary header', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');

  assert.doesNotMatch(pane, /itinerary-card-grid__header/);
  assert.doesNotMatch(pane, /itinerary-card-grid__summary/);
  assert.match(header, /segment__note-btn/);
  assert.match(header, /segment__details-btn/);
  assert.match(header, /itinerary-stop__remove-btn/);
});
