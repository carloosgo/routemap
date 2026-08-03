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

test('tabs use black text, strong gray hover and only the places badge stays blue', async () => {
  const polish = await read('src/app/FloatingEditorPolish.css');

  assert.match(
    polish,
    /\.editor-module__tab,\s*\.editor-module__tab\.is-active\s*\{\s*color:\s*#111827;/
  );
  assert.match(polish, /\.editor-module__tab:hover\s*\{\s*color:\s*#4b5563;/);
  assert.match(
    polish,
    /data-tab-icon='places-map-pin'[\s\S]*background:\s*var\(--atlas-accent\);[\s\S]*color:\s*#ffffff;/
  );
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
