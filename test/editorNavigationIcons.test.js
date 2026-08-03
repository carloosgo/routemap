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
});

test('each desktop navigation option has one canonical icon source', async () => {
  const app = await read('src/App.jsx');
  const css = await read('src/app/EditorNavigationIcons.css');

  assert.equal((app.match(/editor-module__tab-icon/g) || []).length, 4);
  assert.match(app, /<img src=\{lugaresIcon\} alt="" \/>/);
  assert.match(css, /url\('\/icons\/tramos\.svg'\)/);
  assert.match(css, /url\('\/icons\/notas\.svg'\)/);
  assert.match(css, /url\('\/icons\/moneda\.svg'\)/);
  assert.match(css, /\.editor-module__tab-icon > svg\s*\{\s*display:\s*none;/);
  assert.match(css, /\.editor-module__nav-tab::before,[\s\S]*content:\s*none !important;/);
});

test('all desktop navigation options share Tramos dimensions, 14px text, 25px icons, background and hover', async () => {
  const css = await read('src/app/EditorNavigationIcons.css');

  assert.match(css, /height:\s*36px;/);
  assert.match(css, /padding:\s*6px 10px;/);
  assert.match(css, /border-radius:\s*8px;/);
  assert.match(css, /background:\s*#ffffff;/);
  assert.match(css, /font-family:\s*var\(--font-body\);/);
  assert.match(css, /font-size:\s*14px;/);
  assert.match(css, /font-weight:\s*500;/);
  assert.match(css, /\.editor-module__tab-icon\s*\{[\s\S]*width:\s*25px;[\s\S]*height:\s*25px;[\s\S]*flex:\s*0 0 25px;/);
  assert.match(css, /\.editor-module__tab-icon > img\s*\{[\s\S]*width:\s*25px;[\s\S]*height:\s*25px;/);
  assert.match(css, /\.editor-module__nav-tab\.is-active,[\s\S]*background:\s*#f4f5f7;/);
  assert.match(css, /color:\s*#4b5563;/);
});

test('places uses a self-contained pure vector cafe icon', async () => {
  const icon = await read('src/assets/lugares-storefront-v2.svg');

  assert.match(icon, /viewBox="0 0 40 40"/);
  assert.match(icon, /aria-label="Lugares"/);
  assert.match(icon, />CAFE<\/text>/);
  assert.match(icon, /#14394b/);
  assert.match(icon, /#19a5d0/);
  assert.match(icon, /#fff3d6/);
  assert.doesNotMatch(icon, /data:image\//);
  assert.doesNotMatch(icon, /<image\b/);
  assert.doesNotMatch(icon, /<metadata>/);
});