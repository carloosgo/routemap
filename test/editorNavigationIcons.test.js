import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('legacy header icon injection is no longer loaded', async () => {
  const html = await read('index.html');
  const main = await read('src/main.jsx');

  assert.doesNotMatch(html, /custom-header-icons\.css/);
  assert.match(main, /EditorNavigationIcons\.css/);
  assert.match(main, /ItineraryTimeline\.css/);
});

test('desktop editor navigation is a left rail with itinerary, routes, notes and currency', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const css = await read('src/app/ItineraryTimeline.css');

  assert.match(editor, /className="editor-rail"/);
  assert.equal((editor.match(/editor-rail__item editor-module__nav-tab/g) || []).length, 3);
  assert.match(editor, /editor-rail__icon--itinerary/);
  assert.match(editor, /data-tab-icon="places-map-pin"/);
  assert.match(editor, /editor-rail__icon--notes/);
  assert.match(editor, /<img src=\{lugaresIcon\} alt="" \/>/);
  assert.match(menu, /currencyCoinIcon/);
  assert.match(menu, /editor-rail__currency/);
  assert.match(menu, /setCurrency\(currency\)/);
  assert.match(menu, /<IconLanguage size=\{17\} aria-hidden="true" \/>/);
  assert.match(css, /width:\s*82px;/);
  assert.match(css, /background:\s*#fdfdfd;/);
  assert.match(css, /width:\s*48px;/);
  assert.match(css, /background:\s*#eceef1;/);
  assert.match(css, /url\('\/icons\/tramos\.svg'\)/);
  assert.match(css, /url\('\/icons\/notas\.svg'\)/);
});

test('itinerary timeline keeps fixed start node, connected flags and two-line city names', async () => {
  const pane = await read('src/app/AppEditorPane.jsx');
  const header = await read('src/modules/trips/SegmentHeader.jsx');
  const css = await read('src/app/ItineraryTimeline.css');

  assert.match(pane, /itinerary-start-flag\.svg/);
  assert.match(pane, /className="timeline-start-node"/);
  assert.match(pane, /segment=\{trip\.segments\[0\]\}/);
  assert.match(pane, /onUpdateDestination=\{\(city\) => updateSegmentDestination\(segment\.id, city\)\}/);
  assert.match(header, /timeline-marker__flag/);
  assert.match(header, /segment__timeline-dates/);
  assert.match(header, /segment__nights/);
  assert.match(header, /segment__pill--timeline/);
  assert.match(header, /segment__drag-handle--timeline/);
  assert.match(css, /border-left:\s*1px dashed #d3d7dd;/);
  assert.match(css, /-webkit-line-clamp:\s*2;/);
  assert.match(css, /background:\s*#eef5ff;/);
});

test('places uses a self-contained transparent signpost icon in the Atlas palette', async () => {
  const icon = await read('src/assets/lugares-storefront-v2.svg');

  assert.match(icon, /viewBox="0 0 40 40"/);
  assert.match(icon, /aria-label="Lugares"/);
  assert.match(icon, /#14394b/);
  assert.match(icon, /fill="#11c7dc"/);
  assert.equal((icon.match(/fill="#fff3d6"/g) || []).length, 3);
  assert.doesNotMatch(icon, />CAFE<\/text>/);
  assert.doesNotMatch(icon, /#b7c58a|#c79a6b/);
  assert.doesNotMatch(icon, /data:image\//);
  assert.doesNotMatch(icon, /<image\b/);
  assert.doesNotMatch(icon, /<metadata>/);
});
