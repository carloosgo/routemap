// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('los numeros de marcadores pertenecen al dato y no al orden DOM de Google Maps', async () => {
  const [google, css] = await Promise.all([
    read('src/modules/map/GooglePlacesMap.jsx'),
    read('src/modules/map/GooglePlacesMap.css'),
  ]);
  assert.match(google, /const normalizedVisits = visits/);
  assert.match(google, /dot\.textContent = String\(visit\.sequence\)/);
  assert.match(google, /Array\.isArray\(feature\.properties\?\.visits\)/);
  assert.match(google, /const maxMarkerNumber = markerNumbers\.length \? Math\.max\(\.\.\.markerNumbers\) : 0;/);
  assert.match(google, /const markerZIndex = isFinish\s*\? 380\s*:\s*isOrigin\s*\? 350\s*:\s*300 \+ maxMarkerNumber;/);
  assert.match(google, /zIndex:\s*markerZIndex/);
  assert.doesNotMatch(css, /counter-reset:\s*itinerary-city/);
  assert.doesNotMatch(css, /counter-increment:\s*itinerary-city/);
  assert.doesNotMatch(css, /content:\s*counter\(itinerary-city\)/);
  assert.match(css, /\.google-itinerary-city-marker__dot\s*\{[\s\S]*display:grid;/);
});

test('el drag confirma el reordenamiento fuera del updater de React y conserva un solo pointer activo', async () => {
  const list = await read('src/modules/trips/MobileCityList.jsx');
  assert.match(list, /const liftRef = useRef\(null\)/);
  assert.match(list, /gesture\.pointerId !== event\.pointerId/);
  assert.match(list, /const handleLiftEnd = \(commit\) => \{\s*const current = liftRef\.current;\s*updateLift\(null\);[\s\S]{0,400}onReorderSegment\(/);
  assert.match(list, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.doesNotMatch(list, /setLift\(\(current\) => \{[\s\S]{0,500}onReorderSegment\(/);
});

test('pointercancel cancela el drag y nunca confirma un reordenamiento', async () => {
  const list = await read('src/modules/trips/MobileCityList.jsx');
  const cancelHandler = list.match(/const handlePointerCancel = \(\) => \{([\s\S]*?)\n {2}\};/)?.[1] || '';
  assert.match(cancelHandler, /finishGesture\(\)/);
  assert.match(cancelHandler, /onLiftEnd\(false\)/);
  assert.doesNotMatch(cancelHandler, /onReorderSegment\(|onLiftEnd\(true\)/);
  assert.match(list, /onPointerCancel=\{handlePointerCancel\}/);
});
