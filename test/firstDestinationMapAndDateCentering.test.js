// test-contract: behavior
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('first destination transition pans the map without changing zoom', async () => {
  const map = await read('src/modules/map/GooglePlacesMap.jsx');
  const focusEffect = map.match(
    /useEffect\(\(\) => \{\s*const previousKey = firstDestinationKeyRef\.current;[\s\S]*?\}, \[firstDestination, firstDestinationKey, placesActive, ready\]\);/
  )?.[0] || '';

  assert.match(map, /const firstDestinationKeyRef = useRef\(firstDestinationKey\);/);
  assert.match(map, /const pendingFirstDestinationFocusRef = useRef\(null\);/);
  assert.match(focusEffect, /if \(!previousKey && firstDestinationKey && firstDestination\)/);
  assert.match(focusEffect, /map\.panTo\(\{ lat: pendingFocus\.lat, lng: pendingFocus\.lng \}\);/);
  assert.doesNotMatch(focusEffect, /setZoom|fitBounds/);
  assert.match(
    map,
    /firstItineraryProjection[\s\S]*routeCities\.length > 0[\s\S]*!pendingFirstDestinationFocusRef\.current/
  );
});

test('stacked dates center their visible text without moving the reserved layout tracks', async () => {
  const css = await read('src/modules/trips/ItineraryCompactTen.css');

  assert.match(css, /grid-template-columns:\s*minmax\(60px, 1fr\) 78px repeat\(3, 14px\);/);
  assert.match(
    css,
    /\.itinerary-stop__date-range\s*\{[^}]*justify-self:\s*center;[^}]*width:\s*60px;[^}]*min-width:\s*60px;[^}]*max-width:\s*60px;[^}]*width:\s*max-content;[^}]*min-width:\s*0;[^}]*max-width:\s*60px;[^}]*align-items:\s*flex-end;[^}]*text-align:\s*right;/s
  );
  assert.match(css, /\.itinerary-stop__amount\s*\{[^}]*width:\s*78px;[^}]*min-width:\s*78px;[^}]*max-width:\s*78px;/s);
});
