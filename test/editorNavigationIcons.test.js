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
  assert.match(main, /ItinerarySidebar\.css/);
  assert.match(main, /TripSummaryHeader\.css/);
  assert.ok(
    main.indexOf('EditorNavigationIcons.css') < main.indexOf('ItinerarySidebar.css'),
    'ItinerarySidebar.css debe ser la autoridad final de geometría del sidebar'
  );
});

test('desktop navigation keeps canonical icons while trip currency and global language use their proper scopes', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const topbar = await read('src/app/AppTopbar.jsx');
  const navigation = `${editor}\n${menu}`;
  const iconCss = await read('src/app/EditorNavigationIcons.css');

  assert.equal((navigation.match(/editor-module__tab-icon/g) || []).length, 3);
  assert.match(editor, /<img src=\{lugaresIcon\} alt="" \/>/);
  assert.match(editor, /role="tablist"/);
  assert.equal((editor.match(/role="tab"/g) || []).length, 3);
  assert.match(menu, /openMenu === 'workspace'/);
  assert.doesNotMatch(menu, /setCurrency|editor-module__currency-options|t\('language'\)/);
  assert.match(header, /const CURRENCIES = \['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'\]/);
  assert.match(header, /setCurrency\(event\.target\.value\)/);
  assert.match(topbar, /<IconLanguage size=\{15\} aria-hidden="true" \/>/);
  assert.match(topbar, /t\('language'\)/);
  assert.match(topbar, /setLocale\(availableLocale\)/);
  assert.doesNotMatch(iconCss, /icons\/moneda\.svg/);
  assert.match(iconCss, /url\('\/icons\/tramos\.svg'\)/);
  assert.match(iconCss, /url\('\/icons\/notas\.svg'\)/);
  assert.match(iconCss, /\.editor-module__tabs \.editor-module__tab-icon > svg\s*\{\s*display:\s*none;/);
});

test('sidebar keeps active states stable and does not reserve a counter row for itinerary', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const iconCss = await read('src/app/EditorNavigationIcons.css');
  const sidebarCss = await read('src/app/ItinerarySidebar.css');
  const polishCss = await read('src/app/FloatingEditorPolish.css');

  assert.doesNotMatch(iconCss, /grid-template-columns|position:\s*fixed|separator|border-right/);
  assert.doesNotMatch(
    polishCss,
    /\.editor-module__tabs \.editor-module__nav-tab(?:\.is-active)?\s*\{/,
    'FloatingEditorPolish.css no debe volver a definir la geometría de navegación'
  );
  assert.match(editor, /editor-module__nav-tab--plain/);
  assert.equal((editor.match(/editor-module__tab-count/g) || []).length, 2);
  assert.match(sidebarCss, /grid-template-columns:\s*82px minmax\(0, 1fr\);/);
  assert.match(sidebarCss, /gap:\s*12px;/);
  assert.match(sidebarCss, /min-height:\s*76px;/);
  assert.match(sidebarCss, /height:\s*76px;/);
  assert.match(sidebarCss, /flex:\s*0 0 76px;/);
  assert.match(sidebarCss, /grid-template-rows:\s*38px 14px 14px;/);
  assert.match(sidebarCss, /\.editor-module__tabs > \.editor-module__nav-tab--plain,[\s\S]*min-height:\s*62px;[\s\S]*height:\s*62px;[\s\S]*flex:\s*0 0 62px;[\s\S]*grid-template-rows:\s*38px 14px;/);
  assert.match(sidebarCss, /\.editor-module__tabs > \.editor-module__nav-tab \+ \.editor-module__nav-tab\s*\{[\s\S]*margin-left:\s*0\s*!important;[\s\S]*margin-right:\s*0\s*!important;/);
  assert.match(sidebarCss, /transform:\s*none\s*!important;/);
  assert.match(sidebarCss, /width:\s*26px\s*!important;/);
  assert.match(sidebarCss, /top:\s*-6px\s*!important;/);
  assert.match(sidebarCss, /left:\s*50%\s*!important;/);
  assert.match(sidebarCss, /transform:\s*translateX\(-50%\)\s*!important;/);
  assert.match(sidebarCss, /background:\s*#fdfdfd\s*!important;/);
});

test('routes count saved places and notes expose checklist completion progress', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const sidebarCss = await read('src/app/ItinerarySidebar.css');

  assert.match(editor, /const routeCount = Array\.isArray\(places\) \? places\.length : 0;/);
  assert.match(editor, /const checklistCount = Array\.isArray\(checklist\) \? checklist\.length : 0;/);
  assert.match(editor, /const checklistProgress = checklistCount \? `\$\{doneCount\}\/\$\{checklistCount\}` : '';/);
  assert.equal((editor.match(/editor-module__tab-count/g) || []).length, 2);
  assert.equal((editor.match(/tabbar__badge/g) || []).length, 2);
  assert.match(editor, /\{routeCount\}/);
  assert.match(editor, /\{checklistProgress\}/);
  assert.match(sidebarCss, /\.editor-module__tabs \.editor-module__tab-count\s*\{[\s\S]*grid-row:\s*3;[\s\S]*height:\s*14px;[\s\S]*display:\s*flex;/);
  assert.match(sidebarCss, /\.editor-module__tabs \.editor-module__tab-count \.tabbar__badge\s*\{[\s\S]*position:\s*static\s*!important;[\s\S]*display:\s*inline-flex;/);
});

test('workspace panel toggle stays below modal-bearing editor layer', async () => {
  const workspaceCss = await read('src/app/DockedWorkspace.css');

  assert.match(workspaceCss, /\.workspace-panel\s*\{[\s\S]*z-index:\s*700;/);
  assert.match(workspaceCss, /\.workspace-panel__toggle\s*\{[\s\S]*z-index:\s*699;/);
});

test('workspace menu stays trip-scoped and exposes saved-trip actions without clipping', async () => {
  const sidebarCss = await read('src/app/ItinerarySidebar.css');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');

  assert.match(sidebarCss, /\.editor-module__workspace-anchor\s*\{[\s\S]*position:\s*fixed\s*!important;[\s\S]*right:\s*14px\s*!important;[\s\S]*z-index:\s*950\s*!important;/);
  assert.match(sidebarCss, /\.editor-module__workspace-anchor \.editor-module__more-menu\s*\{[\s\S]*right:\s*calc\(100% \+ 10px\);[\s\S]*z-index:\s*1000;/);
  assert.match(menu, /editor-module__more-menu/);
  assert.match(menu, /savedTrips/);
  assert.match(menu, /resetTrip/);
  assert.doesNotMatch(menu, /editor-module__currency-options|setCurrency|language|setLocale/);
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
