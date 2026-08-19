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

test('itinerary, routes and notes share the real tab button structure while currency stays in workspace', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const polish = await read('src/app/FloatingEditorPolish.css');

  assert.equal((editor.match(/role="tab"/g) || []).length, 3);
  assert.equal((editor.match(/editor-module__tab-icon/g) || []).length, 3);
  assert.equal((editor.match(/editor-module__tab-label/g) || []).length, 3);
  assert.match(editor, /t\('itinerary'\)/);
  assert.match(editor, /t\('myRoutes'\)/);
  assert.match(editor, /t\('notes'\)/);
  assert.match(menu, /openMenu === 'workspace'/);
  assert.match(menu, /<span>\{t\('currency'\)\}<\/span>/);
  assert.match(menu, /setCurrency\(currency\)/);
  assert.match(menu, /<span>\{t\('language'\)\}<\/span>/);
  assert.doesNotMatch(menu, /currencyCoinIcon|data-tab-icon="language-selector"/);

  assert.match(polish, /\.editor-module__tabs \.editor-module__nav-tab,/);
  assert.match(polish, /height:\s*36px;/);
  assert.match(polish, /padding:\s*6px 10px;/);
  assert.match(polish, /background:\s*#ffffff;/);
  assert.match(polish, /font-family:\s*var\(--font-body\);/);
  assert.match(polish, /font-size:\s*14px;/);
  assert.match(polish, /font-weight:\s*500(?:\s*!important)?;/);
  assert.match(polish, /\.editor-module__tab-icon\s*\{[\s\S]*width:\s*25px;[\s\S]*height:\s*25px;/);
  assert.match(polish, /background:\s*#f4f5f7;/);
  assert.match(polish, /color:\s*#4b5563;/);
});

test('places renders the transparent signpost icon through the existing tab asset', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const polish = await read('src/app/FloatingEditorPolish.css');
  const icon = await read('src/assets/lugares-storefront-v2.svg');

  assert.match(editor, /import lugaresIcon from '\.\.\/assets\/lugares-storefront-v2\.svg'/);
  assert.match(editor, /<img src=\{lugaresIcon\} alt="" \/>/);
  assert.doesNotMatch(editor, /IconMapPin/);
  assert.doesNotMatch(polish, /data-tab-icon='places-map-pin'\]::before/);
  assert.doesNotMatch(polish, /assets\/lugares\.svg/);
  assert.match(icon, /aria-label="Lugares"/);
  assert.match(icon, /viewBox="0 0 40 40"/);
  assert.match(icon, /#14394b/);
  assert.match(icon, /fill="#11c7dc"/);
  assert.equal((icon.match(/fill="#fff3d6"/g) || []).length, 3);
  assert.doesNotMatch(icon, />CAFE<\/text>/);
  assert.doesNotMatch(icon, /data:image\//);
  assert.doesNotMatch(icon, /<image\b/);
});

test('the desktop navigation remains ordered as itinerary, routes and notes with currency in workspace', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');

  const itineraryIndex = editor.indexOf("setActiveTab('segments')");
  const routesIndex = editor.indexOf("setActiveTab('places')");
  const notesIndex = editor.indexOf("setActiveTab('notes')");

  assert.ok(itineraryIndex >= 0);
  assert.ok(itineraryIndex < routesIndex);
  assert.ok(routesIndex < notesIndex);
  assert.match(menu, /openMenu === 'workspace'/);
  assert.match(menu, /<span>\{t\('currency'\)\}<\/span>/);
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
