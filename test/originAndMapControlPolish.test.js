// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin keeps an explicit trash clear control and the requested bold city / normal date typography', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const originSection = await read('src/modules/trips/SegmentOriginSection.jsx');
  const compactList = await read('src/modules/trips/ItineraryCompactList.css');

  assert.match(origin, /IconTrash/);
  assert.match(origin, /itinerary-stop__remove-btn itinerary-origin__clear/);
  assert.match(origin, /onClick=\{onClear\}/);
  assert.match(originSection, /onClear=\{\(\) => onUpdateOrigin\(null\)\}/);
  assert.match(originSection, /onSelect=\{onUpdateOrigin\}/);
  assert.match(
    compactList,
    /autocomplete--timeline-selected:not\(\.is-open\) \.autocomplete__selected-value\s*\{[\s\S]*font-weight:\s*700\s*!important;/s
  );
  assert.match(
    compactList,
    /\.itinerary-card__date\.itinerary-stop__date-range\s*\{[\s\S]*font-style:\s*normal\s*!important;[\s\S]*font-weight:\s*400\s*!important;/s
  );
  assert.match(
    compactList,
    /\.itinerary-card__actions\s*\{[\s\S]*opacity:\s*1\s*!important;[\s\S]*pointer-events:\s*auto\s*!important;/s
  );
});

test('native map zoom control keeps its compact geometry and sits slightly lower', async () => {
  const mapCss = await read('src/modules/map/GooglePlacesMap.css');

  assert.match(
    mapCss,
    /\.google-map \.gm-bundled-control\s*\{[^}]*width:\s*24px!important;[^}]*height:\s*49px!important;[^}]*transform:\s*translateY\(8px\)!important;/s
  );
});
