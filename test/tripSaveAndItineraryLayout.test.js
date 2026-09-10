// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('explicit save keeps the existing naming popover and never falls back to browser confirm', async () => {
  const [saveFlow, app, topbar] = await Promise.all([
    read('src/app/useTripSaveFlow.js'),
    read('src/App.jsx'),
    read('src/app/AppTopbar.jsx'),
  ]);

  assert.doesNotMatch(saveFlow, /globalThis\.confirm/);
  assert.doesNotMatch(saveFlow, /renameTrip/);
  assert.ok(
    saveFlow.indexOf('if (!requestedName)') < saveFlow.indexOf('if (!hasSavableRoute(trip))'),
    'unnamed trips must open the naming UI before route validation'
  );
  assert.match(saveFlow, /const savedTrip = await saveTrip\(tripToSave\);/);
  assert.match(saveFlow, /persistence\.markSaved\(\{ adoptNextTrip: true \}\);/);
  assert.match(saveFlow, /loadTrip\(savedTrip\);/);
  assert.match(app, /useTripSaveFlow\(\{[\s\S]*?trip,[\s\S]*?loadTrip,[\s\S]*?stageTrip,[\s\S]*?saveTrip,/);
  assert.match(topbar, /trip-save-popover/);
  assert.match(topbar, /value=\{tripNameDraft\}/);
});

test('saved trip adoption is ignored once by autosave dirty tracking', async () => {
  const persistence = await read('src/modules/trips/useTripAutoPersistence.js');

  assert.match(persistence, /const adoptNextTripRef = useRef\(false\);/);
  assert.match(persistence, /if \(adoptNextTripRef\.current && editTransition\) \{[\s\S]*?adoptNextTripRef\.current = false;[\s\S]*?return undefined;/);
  assert.match(persistence, /const markSaved = useCallback\(\(\{ adoptNextTrip = false \} = \{\}\) => \{/);
});

test('itinerary date column is centered from the city boundary without shifting amount tracks', async () => {
  const css = await read('src/modules/trips/ItineraryCompactTen.css');
  const gridRule = css.match(/\.editor-module\.editor-module--itinerary \.itinerary-stop__after-place,[\s\S]*?column-gap: 8px;[\s\S]*?\}/)?.[0] || '';

  assert.match(gridRule, /padding-left:\s*0;/);
  assert.match(gridRule, /grid-template-columns:\s*minmax\(60px, 1fr\) 78px repeat\(3, 14px\);/);
  assert.match(gridRule, /column-gap:\s*8px;/);
  assert.match(css, /\.itinerary-stop__date-range\s*\{[\s\S]*?justify-self:\s*center;/);
});
