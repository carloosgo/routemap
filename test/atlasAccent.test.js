import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('the requested Atlas controls share the exact #19a5d0 accent token', async () => {
  const tokens = await read('src/index.css');
  const polish = await read('src/app/FloatingEditorPolish.css');

  assert.match(tokens, /--atlas-accent:\s*#19a5d0/);

  for (const selector of [
    '.topbar__brand-icon',
    '.topbar__save',
    '.trip-save-popover__submit',
    '.editor-module__settings .editor-module__more-button',
    '.geo-search__button',
    '.place-save-prompt button',
    '.toast',
    '.editor-module__tab',
    '.trip-place button:hover',
    '.place-result-marker:hover',
  ]) {
    assert.ok(polish.includes(selector), `Missing Atlas accent selector: ${selector}`);
  }

  assert.match(polish, /background:\s*var\(--atlas-accent\)/);
  assert.match(polish, /border-color:\s*var\(--atlas-accent\)/);
  assert.match(polish, /color:\s*var\(--atlas-accent\)/);
});
