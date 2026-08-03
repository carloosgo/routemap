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

test('segments, places, notes and currency use the same real button structure and styles', async () => {
  const app = await read('src/App.jsx');
  const polish = await read('src/app/FloatingEditorPolish.css');

  assert.equal((app.match(/editor-module__nav-tab/g) || []).length, 4);
  assert.equal((app.match(/editor-module__tab-icon/g) || []).length, 4);
  assert.equal((app.match(/editor-module__tab-label/g) || []).length, 4);

  assert.match(polish, /\.editor-module__tabs \.editor-module__nav-tab,/);
  assert.match(polish, /height:\s*36px;/);
  assert.match(polish, /padding:\s*6px 10px;/);
  assert.match(polish, /background:\s*#ffffff;/);
  assert.match(polish, /font-family:\s*var\(--font-body\);/);
  assert.match(polish, /font-size:\s*14px;/);
  assert.match(polish, /font-weight:\s*500;/);
  assert.match(polish, /\.editor-module__tab-icon\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;/);
  assert.match(polish, /background:\s*#f4f5f7;/);
  assert.match(polish, /color:\s*#4b5563;/);
});

test('places renders a clean Atlas-colored storefront icon instead of a black raster', async () => {
  const app = await read('src/App.jsx');
  const polish = await read('src/app/FloatingEditorPolish.css');
  const icon = await read('src/assets/lugares-storefront-v2.svg');

  assert.match(app, /import lugaresIcon from '\.\/assets\/lugares-storefront-v2\.svg'/);
  assert.match(app, /<img src=\{lugaresIcon\} alt="" \/>/);
  assert.doesNotMatch(app, /IconMapPin/);
  assert.doesNotMatch(polish, /data-tab-icon='places-map-pin'\]::before/);
  assert.doesNotMatch(polish, /assets\/lugares\.svg/);
  assert.match(icon, /aria-label="Lugares"/);
  assert.match(icon, /fill="#fff3d6"/);
  assert.match(icon, /stroke="#14394b"/);
  assert.match(icon, /fill="#19bde6"/);
  assert.doesNotMatch(icon, /data:image\/png;base64/);
});

test('the desktop navigation remains ordered as segments, places, notes and currency', async () => {
  const app = await read('src/App.jsx');
  const start = app.indexOf('const editorModule');
  const end = app.indexOf('const mapPane');
  const tabs = app.slice(start, end);

  const segmentIndex = tabs.indexOf("setActiveTab('segments')");
  const placesIndex = tabs.indexOf("setActiveTab('places')");
  const notesIndex = tabs.indexOf("setActiveTab('notes')");
  const currencyIndex = tabs.indexOf("openMenu === 'currency'");

  assert.ok(segmentIndex >= 0);
  assert.ok(segmentIndex < placesIndex);
  assert.ok(placesIndex < notesIndex);
  assert.ok(notesIndex < currencyIndex);
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