import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('origin remains non-deletable in the itinerary UI and uses regular typography', async () => {
  const origin = await read('src/modules/trips/ItineraryOrigin.jsx');
  const originSection = await read('src/modules/trips/SegmentOriginSection.jsx');
  const compact = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.doesNotMatch(origin, /itinerary-origin__clear|IconX|onClear/);
  assert.doesNotMatch(originSection, /onClear|origin:\s*null/);
  assert.match(originSection, /onSelect=\{\(origin\) => onUpdate\(\{ origin \}\)\}/);
  assert.match(
    compact,
    /\.itinerary-origin__picker \.autocomplete__selected-value,[\s\S]*\.itinerary-origin__picker \.input\s*\{[^}]*font-weight:\s*400;/s
  );
});

test('native map zoom control keeps its compact geometry and sits slightly lower', async () => {
  const mapCss = await read('src/modules/map/GooglePlacesMap.css');

  assert.match(
    mapCss,
    /\.google-map \.gm-bundled-control\s*\{[^}]*width:\s*24px!important;[^}]*height:\s*49px!important;[^}]*transform:\s*translateY\(8px\)!important;/s
  );
});
