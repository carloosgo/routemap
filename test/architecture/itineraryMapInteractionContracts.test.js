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
  assert.match(google, /dot\.textContent = String\(number\)/);
  assert.match(google, /feature\.properties\?\.sequence/);
  assert.match(google, /zIndex:\s*300 \+ markerNumber/);
  assert.doesNotMatch(css, /counter-reset:\s*itinerary-city/);
  assert.doesNotMatch(css, /counter-increment:\s*itinerary-city/);
  assert.doesNotMatch(css, /content:\s*counter\(itinerary-city\)/);
  assert.match(css, /\.google-itinerary-city-marker__dot\s*\{[\s\S]*display:grid;/);
});

test('el drag confirma el reordenamiento fuera del updater de React y conserva un solo pointer activo', async () => {
  const editor = await read('src/app/AppEditorPane.jsx');
  assert.match(editor, /const dragStateRef = useRef\(null\)/);
  assert.match(editor, /const activeDragId = dragState\?\.segmentId \|\| null/);
  assert.match(editor, /current\.pointerId !== event\.pointerId/);
  assert.match(editor, /function clearActiveDrag\(\) \{\s*dragStateRef\.current = null;\s*setDragState\(null\);\s*\}/);
  assert.match(editor, /function handlePointerEnd\(event\) \{[\s\S]{0,350}clearActiveDrag\(\);[\s\S]{0,250}reorderSegment\(/);
  assert.match(editor, /\}, \[activeDragId, reorderSegment\]\);/);
  assert.match(editor, /setPointerCapture\?\.\(event\.pointerId\)/);
  assert.doesNotMatch(editor, /setDragState\(\(current\) => \{[\s\S]{0,500}reorderSegment\(/);
});

test('pointercancel cancela el drag y nunca confirma un reordenamiento', async () => {
  const editor = await read('src/app/AppEditorPane.jsx');
  const cancelHandler = editor.match(/function handlePointerCancel\(event\) \{([\s\S]*?)\n {4}\}/)?.[1] || '';
  assert.match(cancelHandler, /activeDragFor\(event\)/);
  assert.match(cancelHandler, /clearActiveDrag\(\)/);
  assert.doesNotMatch(cancelHandler, /reorderSegment\(/);
  assert.match(editor, /addEventListener\('pointercancel', handlePointerCancel\)/);
});
