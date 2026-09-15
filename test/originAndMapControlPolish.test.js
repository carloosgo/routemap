// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin keeps an explicit clear control without losing its regular typography', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const originSection = await read('src/modules/trips/SegmentOriginSection.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(origin, /IconX/);
  assert.match(origin, /itinerary-stop__remove-btn itinerary-origin__clear/);
  assert.match(origin, /onClick=\{onClear\}/);
  assert.match(originSection, /onClear=\{\(\) => onUpdateOrigin\(null\)\}/);
  assert.match(originSection, /onSelect=\{onUpdateOrigin\}/);
  assert.match(
    compact,
    /\.itinerary-origin__picker \.autocomplete__selected-value,[\s\S]*\.itinerary-origin__picker \.input\s*\{[^}]*font-weight:\s*400;/s
  );
  assert.match(
    compact,
    /\.itinerary-origin:hover \.itinerary-origin__clear,[\s\S]*\.itinerary-stop__remove-btn:focus-visible\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s
  );
});

test('native map zoom control keeps its compact geometry and sits slightly lower', async () => {
  const mapCss = await read('src/modules/map/GooglePlacesMap.css');

  assert.match(
    mapCss,
    /\.google-map \.gm-bundled-control\s*\{[^}]*width:\s*24px!important;[^}]*height:\s*49px!important;[^}]*transform:\s*translateY\(8px\)!important;/s
  );
});
