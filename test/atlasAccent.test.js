import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('the selected Atlas controls retain the exact #19a5d0 accent token', async () => {
  const tokens = await read('src/index.css');
  const polish = await read('src/app/FloatingEditorPolish.css');

  assert.match(tokens, /--atlas-accent:\s*#19a5d0/);

  for (const selector of [
    '.topbar__save',
    '.trip-save-popover__submit',
    '.editor-module__settings .editor-module__more-button',
    '.geo-search__button',
    '.place-save-prompt button',
    '.toast',
    '.trip-place button:hover',
    '.place-result-marker:hover',
    ".editor-module__tab[data-tab-icon='places-map-pin'] .tabbar__badge",
  ]) {
    assert.ok(polish.includes(selector), `Missing Atlas accent selector: ${selector}`);
  }

  assert.doesNotMatch(polish, /\.topbar__brand-icon/);
  assert.match(polish, /background:\s*var\(--atlas-accent\)/);
  assert.match(polish, /border-color:\s*var\(--atlas-accent\)/);
});

test('all four top options share the same typeface, size, weight and line height', async () => {
  const polish = await read('src/app/FloatingEditorPolish.css');

  assert.match(
    polish,
    /\.editor-module__tab,\s*\.editor-module__tab\.is-active\s*\{[\s\S]*color:\s*#111827;[\s\S]*font-family:\s*var\(--font-body\);[\s\S]*font-size:\s*12px;[\s\S]*font-weight:\s*500;[\s\S]*line-height:\s*1;/
  );
  assert.match(polish, /\.editor-module__tab:hover\s*\{\s*color:\s*#4b5563;/);
  assert.match(
    polish,
    /data-tab-icon='places-map-pin'[\s\S]*background:\s*var\(--atlas-accent\);[\s\S]*color:\s*#ffffff;/
  );
});

test('places uses the supplied optimized icon while keeping the tab order intact', async () => {
  const polish = await read('src/app/FloatingEditorPolish.css');
  const app = await read('src/App.jsx');
  const placesIcon = await read('src/assets/lugares.svg');

  assert.match(polish, /data-tab-icon='places-map-pin'[\s\S]*background:\s*url\('\.\.\/assets\/lugares\.svg'\)/);
  assert.match(polish, /data-tab-icon='places-map-pin'[^\{]*> svg:first-child\s*\{\s*display:\s*none;/);
  assert.match(placesIcon, /viewBox="0 0 64 64"/);
  assert.ok(placesIcon.length < 10000, 'The optimized places icon should stay lightweight');

  const editorTabs = app.slice(app.indexOf('const editorModule = ('), app.indexOf('const mapPane = ('));
  const segmentsIndex = editorTabs.indexOf("setActiveTab('segments')");
  const placesIndex = editorTabs.indexOf("setActiveTab('places')");
  const notesIndex = editorTabs.indexOf("setActiveTab('notes')");
  const currencyIndex = editorTabs.indexOf("openMenu === 'currency'");
  assert.ok(segmentsIndex < placesIndex && placesIndex < notesIndex && notesIndex < currencyIndex);
});

test('place save popup hides its close icon and dismisses through outside clicks', async () => {
  const polish = await read('src/app/FloatingEditorPolish.css');
  const dismiss = await read('src/modules/map/placeSavePopupDismiss.js');
  const main = await read('src/main.jsx');

  assert.match(
    polish,
    /\.place-save-popup \.maplibregl-popup-close-button\s*\{\s*display:\s*none;/
  );
  assert.match(dismiss, /document\.addEventListener\('pointerdown'/);
  assert.match(dismiss, /popup\.contains\(event\.target\)/);
  assert.match(dismiss, /maplibregl-popup-close-button/);
  assert.match(main, /placeSavePopupDismiss\.js/);
});
