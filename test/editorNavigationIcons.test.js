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

test('desktop navigation keeps canonical icons while currency remains icon-free', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const navigation = `${editor}\n${menu}`;
  const css = await read('src/app/EditorNavigationIcons.css');

  assert.equal((navigation.match(/editor-module__tab-icon/g) || []).length, 3);
  assert.match(editor, /<img src=\{lugaresIcon\} alt="" \/>/);
  assert.match(menu, /const CURRENCIES = \['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'\]/);
  assert.match(menu, /openMenu === 'currency'/);
  assert.match(menu, /setCurrency\(currency\)/);
  assert.match(menu, /<span className="editor-module__tab-label">\{trip\.currency\}<\/span>/);
  assert.match(menu, /<IconLanguage size=\{17\} aria-hidden="true" \/>/);
  assert.match(menu, /<span>\{t\('language'\)\}<\/span>/);
  assert.doesNotMatch(menu, /currencyCoinIcon|data-tab-icon="language-selector"/);
  assert.doesNotMatch(css, /icons\/moneda\.svg/);
  assert.match(css, /url\('\/icons\/tramos\.svg'\)/);
  assert.match(css, /url\('\/icons\/notas\.svg'\)/);
  assert.match(css, /\.editor-module__tab-icon > svg\s*\{\s*display:\s*none;/);
  assert.match(css, /\.editor-module__nav-tab::before,[\s\S]*content:\s*none !important;/);
});

test('all desktop navigation options share dimensions and keep hover, focus and selection free of gray backgrounds', async () => {
  const css = await read('src/app/EditorNavigationIcons.css');

  assert.match(css, /height:\s*36px;/);
  assert.match(css, /padding:\s*6px 10px;/);
  assert.match(css, /border-radius:\s*8px;/);
  assert.match(css, /background:\s*#ffffff;/);
  assert.match(css, /font-family:\s*var\(--font-body\);/);
  assert.match(css, /font-size:\s*14px;/);
  assert.match(css, /font-weight:\s*500(?:\s*!important)?;/);
  assert.match(css, /\.editor-module__tab-icon\s*\{[\s\S]*width:\s*25px;[\s\S]*height:\s*25px;[\s\S]*flex:\s*0 0 25px;/);
  assert.match(css, /\.editor-module__tab-icon > img\s*\{[\s\S]*width:\s*25px;[\s\S]*height:\s*25px;/);
  assert.match(css, /background:\s*#ffffff\s*!important;/);
  assert.match(css, /box-shadow:\s*none\s*!important;/);
  assert.doesNotMatch(css, /background:\s*#f4f5f7/);
  assert.match(css, /color:\s*#4b5563/);
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
