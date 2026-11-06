// test-contract: architecture
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('canonical header style layers replace the legacy icon injection', async () => {
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
    'la capa del header debe cargarse después de la geometría base del sidebar'
  );
});

test('primary navigation keeps distinct icons and explicit active-tab semantics', async () => {
  const navigation = await read('src/app/TripHeaderNavigation.jsx');

  assert.match(navigation, /IconListDetails/);
  assert.match(navigation, /IconRoute/);
  assert.match(navigation, /IconNotebook/);
  assert.match(navigation, /id: 'segments'/);
  assert.match(navigation, /id: 'places'/);
  assert.match(navigation, /id: 'notes'/);
  assert.match(navigation, /aria-selected=\{isActive\}/);
  assert.match(navigation, /trip-summary__primary-nav-item\$\{isActive \? ' is-active' : ''\}/);
  assert.match(navigation, /onClick=\{\(\) => setActiveTab\(id\)\}/);
  assert.doesNotMatch(navigation, /lugaresIcon|IconMap\b|IconNotes\b/);
});

test('routes omit their counter while notes keep checklist completion progress in the header', async () => {
  const app = await read('src/App.jsx');
  const navigation = await read('src/app/TripHeaderNavigation.jsx');
  const css = await read('src/app/TripHeaderNavigation.css');

  assert.match(app, /checklistProgress: editorState\.checklist\?\.length \? `\$\{editorState\.doneCount\}\/\$\{editorState\.checklist\.length\}` : ''/);
  assert.doesNotMatch(navigation, /id === 'places' \? routeCount|badge--places/);
  assert.match(navigation, /const badge = id === 'notes' \? checklistProgress : '';/);
  assert.match(navigation, /trip-summary__primary-nav-badge--notes/);
  assert.doesNotMatch(css, /\.trip-summary__primary-nav-badge--places/);
});

test('workspace controls keep their layering and saved-trip responsibilities', async () => {
  const workspaceCss = await read('src/app/DockedWorkspace.css');
  const sidebarCss = await read('src/app/ItinerarySidebar.css');
  const menu = await read('src/app/AppWorkspaceMenu.jsx');

  assert.match(workspaceCss, /\.workspace-panel\s*\{[\s\S]*z-index:\s*700;/);
  assert.match(workspaceCss, /\.workspace-panel__toggle\s*\{[\s\S]*z-index:\s*699;/);
  assert.match(sidebarCss, /\.editor-module__workspace-anchor\s*\{[\s\S]*position:\s*fixed\s*!important;[\s\S]*right:\s*14px\s*!important;[\s\S]*z-index:\s*950\s*!important;/);
  assert.match(sidebarCss, /\.editor-module__workspace-anchor \.editor-module__more-menu\s*\{[\s\S]*right:\s*calc\(100% \+ 10px\);[\s\S]*z-index:\s*1000;/);
  assert.match(menu, /editor-module__more-menu/);
  assert.match(menu, /savedTrips/);
  assert.match(menu, /resetTrip/);
});
