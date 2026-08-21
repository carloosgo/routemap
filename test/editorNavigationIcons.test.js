import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const currencySelectorContract = /<SummarySelectorMetric[\s\S]*?Icon=\{IconCurrencyDollar\}[\s\S]*?label=\{t\('currency'\)\}[\s\S]*?value=\{trip\.currency\}[\s\S]*?onChange=\{setCurrency\}[\s\S]*?menuClassName="trip-summary__selector-menu--currency"/;
const languageSelectorContract = /<SummarySelectorMetric[\s\S]*?Icon=\{IconLanguage\}[\s\S]*?label=\{t\('language'\)\}[\s\S]*?value=\{locale\}[\s\S]*?onChange=\{setLocale\}[\s\S]*?menuClassName="trip-summary__selector-menu--language"/;

test('legacy header icon injection is no longer loaded', async () => {
  const html = await read('index.html');
  const main = await read('src/main.jsx');

  assert.doesNotMatch(html, /custom-header-icons\.css/);
  assert.match(main, /EditorNavigationIcons\.css/);
  assert.match(main, /ItinerarySidebar\.css/);
  assert.match(main, /TripSummaryHeader\.css/);
  assert.match(main, /TripHeaderNavigation\.css/);
  assert.match(main, /TripWorkspaceHeaderLayout\.css/);
  assert.ok(
    main.indexOf('ItinerarySidebar.css') < main.indexOf('TripHeaderNavigation.css'),
    'la prueba del header debe sobreescribir la geometría legacy del sidebar después de cargarla'
  );
});

test('desktop primary navigation uses new header icons while currency and language stay in the integrated header', async () => {
  const editor = await read('src/app/AppEditorModule.jsx');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');
  const selector = await read('src/app/SummarySelectorMetric.jsx');
  const topbar = await read('src/app/AppTopbar.jsx');

  assert.match(navigation, /IconListDetails/);
  assert.match(navigation, /IconRoute/);
  assert.match(navigation, /IconNotebook/);
  assert.match(navigation, /role="tablist"/);
  assert.match(navigation, /role="tab"/);
  assert.match(navigation, /id: 'segments'/);
  assert.match(navigation, /id: 'places'/);
  assert.match(navigation, /id: 'notes'/);
  assert.doesNotMatch(navigation, /lugaresIcon|IconMap\b|IconNotes\b/);
  assert.doesNotMatch(editor, /editor-module__tabs|editor-module__tab-icon|lugaresIcon|IconNotes|IconMap\b/);

  assert.match(menu, /openMenu === 'workspace'/);
  assert.doesNotMatch(menu, /setCurrency|editor-module__currency-options/);
  assert.doesNotMatch(menu, /IconLanguage|t\('language'\)|setLocale/);
  assert.match(header, /const CURRENCIES = \['USD', 'EUR', 'MXN', 'GBP', 'JPY', 'CAD', 'BRL'\]/);
  assert.match(header, /<TripHeaderNavigation \{\.\.\.navigation\} t=\{t\} \/>/);
  assert.match(header, currencySelectorContract);
  assert.match(header, languageSelectorContract);
  assert.match(selector, /role="listbox"/);
  assert.match(selector, /aria-selected=\{active\}/);
  assert.doesNotMatch(selector, /<select\b|<option\b/);
  assert.doesNotMatch(topbar, /IconLanguage|t\('language'\)|setLocale\(availableLocale\)/);
  assert.match(topbar, /className="topbar__save"/);
});

test('header navigation keeps active state and removes the desktop sidebar column', async () => {
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const navigationCss = await read('src/app/TripHeaderNavigation.css');
  const editor = await read('src/app/AppEditorModule.jsx');
  const sidebarCss = await read('src/app/ItinerarySidebar.css');
  const polishCss = await read('src/app/FloatingEditorPolish.css');

  assert.match(navigation, /aria-selected=\{isActive\}/);
  assert.match(navigation, /trip-summary__primary-nav-item\$\{isActive \? ' is-active' : ''\}/);
  assert.match(navigation, /onClick=\{\(\) => setActiveTab\(id\)\}/);
  assert.doesNotMatch(editor, /editor-module__tabs|editor-module__nav-tab/);
  assert.match(navigationCss, /@media \(min-width: 721px\)[\s\S]*\.editor-module\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(navigationCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(sidebarCss, /grid-template-columns:\s*82px minmax\(0, 1fr\);/);
  assert.doesNotMatch(
    polishCss,
    /\.editor-module__tabs \.editor-module__nav-tab(?:\.is-active)?\s*\{/,
    'FloatingEditorPolish.css no debe volver a definir la geometría de navegación'
  );
});

test('routes keep their saved-place count and notes keep checklist completion progress in the header', async () => {
  const app = await read('src/App.jsx');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const css = await read('src/app/TripHeaderNavigation.css');

  assert.match(app, /routeCount: editorState\.places\?\.length \|\| 0/);
  assert.match(app, /checklistProgress: editorState\.checklist\?\.length \? `\$\{editorState\.doneCount\}\/\$\{editorState\.checklist\.length\}` : ''/);
  assert.match(navigation, /id === 'places' \? routeCount/);
  assert.match(navigation, /id === 'notes' \? checklistProgress/);
  assert.match(navigation, /trip-summary__primary-nav-badge/);
  assert.match(css, /\.trip-summary__primary-nav-badge\s*\{[\s\S]*background:\s*var\(--atlas-accent\);[\s\S]*color:\s*#ffffff;/);
});

test('workspace panel toggle stays below modal-bearing editor layer', async () => {
  const workspaceCss = await read('src/app/DockedWorkspace.css');

  assert.match(workspaceCss, /\.workspace-panel\s*\{[\s\S]*z-index:\s*700;/);
  assert.match(workspaceCss, /\.workspace-panel__toggle\s*\{[\s\S]*z-index:\s*699;/);
});

test('workspace menu exposes saved-trip actions without reclaiming trip currency or language', async () => {
  const sidebarCss = await read('src/app/ItinerarySidebar.css');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');
  const header = await read('src/app/TripSummaryHeader.jsx');

  assert.match(sidebarCss, /\.editor-module__workspace-anchor\s*\{[\s\S]*position:\s*fixed\s*!important;[\s\S]*right:\s*14px\s*!important;[\s\S]*z-index:\s*950\s*!important;/);
  assert.match(sidebarCss, /\.editor-module__workspace-anchor \.editor-module__more-menu\s*\{[\s\S]*right:\s*calc\(100% \+ 10px\);[\s\S]*z-index:\s*1000;/);
  assert.match(menu, /editor-module__more-menu/);
  assert.match(menu, /savedTrips/);
  assert.match(menu, /resetTrip/);
  assert.doesNotMatch(menu, /t\('language'\)|setLocale|editor-module__currency-options|setCurrency/);
  assert.match(header, languageSelectorContract);
  assert.match(header, currencySelectorContract);
});

test('legacy transparent signpost asset remains available but is no longer the primary routes navigation icon', async () => {
  const icon = await read('src/assets/lugares-storefront-v2.svg');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');

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
  assert.match(navigation, /IconRoute/);
  assert.doesNotMatch(navigation, /lugares-storefront-v2/);
});
