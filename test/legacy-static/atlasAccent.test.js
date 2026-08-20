// test-contract: legacy-static
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('the selected Atlas controls retain the exact #19a5d0 accent token', async () => {
  const tokens = await read('src/index.css');
  const polish = await read('src/app/FloatingEditorPolish.css');
  const itinerary = await read('src/app/ItineraryTripHeader.css');
  const summary = await read('src/app/TripSummaryHeader.css');
  const accentStyles = `${polish}\n${itinerary}\n${summary}`;
  assert.match(tokens, /--atlas-accent:\s*#19a5d0/);
  for (const selector of [
    '.topbar__save',
    '.editor-module__settings .editor-module__more-button',
    '.geo-search__button',
    '.place-save-prompt button',
    '.toast',
    '.trip-place button:hover',
    '.place-result-marker:hover',
    ".editor-module__tab[data-tab-icon='places-map-pin'] .tabbar__badge",
  ]) {
    assert.ok(accentStyles.includes(selector), `Missing Atlas accent selector: ${selector}`);
  }
  assert.doesNotMatch(polish, /\.topbar__brand-icon/);
  assert.match(accentStyles, /background:\s*var\(--atlas-accent\)/);
  assert.match(accentStyles, /color:\s*#ffffff/);
});

test('itinerary, routes and notes keep the tab structure while trip currency and app language live in the global header', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const topbar = await read('src/app/AppTopbar.jsx');
  const sidebar = await read('src/app/ItinerarySidebar.css');
  assert.equal((editor.match(/role="tab"/g) || []).length, 3);
  assert.equal((editor.match(/editor-module__tab-icon/g) || []).length, 3);
  assert.equal((editor.match(/editor-module__tab-label/g) || []).length, 3);
  assert.match(editor, /t\('itinerary'\)/);
  assert.match(editor, /t\('myRoutes'\)/);
  assert.match(editor, /t\('notes'\)/);
  assert.match(menu, /openMenu === 'workspace'/);
  assert.doesNotMatch(menu, /setCurrency|t\('currency'\)|setLocale|t\('language'\)/);
  assert.match(header, /const CURRENCIES = \['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'\]/);
  assert.match(header, /setCurrency\(event\.target\.value\)/);
  assert.match(header, /t\('currency'\)/);
  assert.match(header, /setLocale\(event\.target\.value\)/);
  assert.match(header, /t\('language'\)/);
  assert.doesNotMatch(topbar, /t\('language'\)|setLocale\(availableLocale\)/);
  assert.match(topbar, /className="topbar__save"/);
  assert.match(sidebar, /\.editor-module__tabs > \.editor-module__nav-tab,/);
  assert.match(sidebar, /height:\s*76px;/);
  assert.match(sidebar, /padding:\s*3px 3px\s*!important;/);
  assert.match(sidebar, /background:\s*transparent\s*!important;/);
  assert.match(sidebar, /font-family:\s*var\(--font-body\);/);
  assert.match(sidebar, /font-size:\s*11px;/);
  assert.match(sidebar, /font-weight:\s*600;/);
  assert.match(sidebar, /\.editor-module__tabs \.editor-module__tab-icon\s*\{[\s\S]*width:\s*38px;[\s\S]*height:\s*38px;/);
  assert.match(sidebar, /color:\s*#68707d;/);
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

test('desktop navigation stays itinerary, routes and notes while the global header owns trip currency and app language', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const itineraryIndex = editor.indexOf("setActiveTab('segments')");
  const routesIndex = editor.indexOf("setActiveTab('places')");
  const notesIndex = editor.indexOf("setActiveTab('notes')");
  assert.ok(itineraryIndex >= 0);
  assert.ok(itineraryIndex < routesIndex);
  assert.ok(routesIndex < notesIndex);
  assert.match(menu, /openMenu === 'workspace'/);
  assert.doesNotMatch(menu, /t\('currency'\)|t\('language'\)|setCurrency|setLocale/);
  assert.match(header, /t\('currency'\)/);
  assert.match(header, /t\('language'\)/);
});

test('place save popup hides its close icon and dismisses through outside clicks', async () => {
  const polish = await read('src/app/FloatingEditorPolish.css');
  const dismiss = await read('src/modules/map/placeSavePopupDismiss.js');
  const main = await read('src/main.jsx');
  assert.match(polish, /\.place-save-popup \.maplibregl-popup-close-button\s*\{\s*display:\s*none;/);
  assert.match(dismiss, /document\.addEventListener\('pointerdown'/);
  assert.match(dismiss, /popup\.contains\(event\.target\)/);
  assert.match(dismiss, /maplibregl-popup-close-button/);
  assert.match(main, /placeSavePopupDismiss\.js/);
});
