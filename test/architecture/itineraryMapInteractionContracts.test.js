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

test('Mis Rutas reordena ciudades por el callback canónico y respeta los límites de la lista', async () => {
  const panel = await read('src/modules/places/TripPlacesPanel.jsx');

  assert.match(panel, /const segmentIndex = segments\.findIndex\(\(item\) => item\.id === segment\.id\);/);
  assert.match(
    panel,
    /const previous = segments\[segmentIndex - 1\];[\s\S]{0,120}if \(previous\) reorderSegment\?\.\(segment\.id, previous\.id, 'before'\);/
  );
  assert.match(
    panel,
    /const next = segments\[segmentIndex \+ 1\];[\s\S]{0,120}if \(next\) reorderSegment\?\.\(segment\.id, next\.id, 'after'\);/
  );
  assert.match(panel, /disabled=\{segmentIndex <= 0\}/);
  assert.match(panel, /disabled=\{segmentIndex >= segments\.length - 1\}/);
  assert.doesNotMatch(panel, /segments\.(?:splice|sort)\(/);
});

test('pointercancel del drag de lugares cancela sin confirmar un reordenamiento', async () => {
  const panel = await read('src/modules/places/TripPlacesPanel.jsx');

  assert.match(panel, /function finishDrag\(commit\) \{/);
  assert.match(panel, /if \(commit && current\?\.targetId && current\.placement\) \{\s*reorderPlace\?\.\(/);
  assert.match(panel, /const handlePointerCancel = \(\) => finishDrag\(false\);/);
  assert.match(panel, /addEventListener\('pointercancel', handlePointerCancel\)/);
  assert.match(panel, /removeEventListener\('pointercancel', handlePointerCancel\)/);
});
